// Dedicated Worker: Whisper inference (WebGPU with WASM fallback), language detection,
// growing-window streaming, hallucination filtering and translation.
import { env, WhisperForConditionalGeneration, AutoProcessor, AutoTokenizer, LogitsProcessor, LogitsProcessorList } from '@huggingface/transformers';
import { filterText } from './textFilters.js';
import { stripOverlap } from './merge.js';
import { LanguageVoter } from './langVote.js';
import { createTranslator } from './translator.js';

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

// ---- console / error forwarding to the offscreen document ----
const fmt = (a) => (a instanceof Error ? (a.stack || a.message) : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })());
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => { orig(...args); try { post({ type: 'LOG', level, text: args.map(fmt).join(' ') }); } catch {} };
}
self.addEventListener('error', (e) => post({ type: 'LOG', level: 'error', text: `worker error: ${e.message} @${e.filename}:${e.lineno}` }));
self.addEventListener('unhandledrejection', (e) => post({ type: 'LOG', level: 'error', text: `worker unhandled rejection: ${fmt(e.reason)}` }));

// ---- transformers.js environment ----
const VENDOR = new URL('../vendor/', self.location.href).href;
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
// Extension CSP forbids import() of blob: URLs, so ORT must import the vendored .mjs directly.
env.useWasmCache = false;
const ASYNCIFY = { mjs: VENDOR + 'ort-wasm-simd-threaded.asyncify.mjs', wasm: VENDOR + 'ort-wasm-simd-threaded.asyncify.wasm' };
const THREADED = { mjs: VENDOR + 'ort-wasm-simd-threaded.mjs', wasm: VENDOR + 'ort-wasm-simd-threaded.wasm' };
env.backends.onnx.wasm.wasmPaths = ASYNCIFY;

const SR = 16000;
const S = (sec) => Math.round(sec * SR);
const MIN_FIRST_WINDOW = S(1.2);   // first inference of an utterance
const MAX_WINDOW = S(10);          // force-cut beyond this
const OVERLAP = S(1.0);            // audio kept when force-cutting
const PAUSE_FINAL = S(0.5);        // pause that finalises an utterance
const PRE_ROLL = S(0.3);
const SPEECH_RMS = 0.01, SPEECH_RMS_HOLD = 0.005;

// ---- model state ----
let model = null, processor = null, tokenizer = null, backend = null, modelId = null, loading = null;
let targetLang = 'en', userSource = null;
const voter = new LanguageVoter();
const translator = createTranslator({ timeoutMs: 8000 });

// ---- audio state ----
let chunks = [];            // {start, end, pcm, endTs, rms}
let total = 0;              // samples received
let committed = 0;          // everything before this is done
let utteranceStart = null;  // sample index where the current utterance window begins
let lastSpeechEnd = -1;     // last sample index with speech
let lastFinalEnd = 0;       // speech end already finalised
let prevUtteranceEnd = 0;
let lastInferEnd = 0, lastInferMs = 0, busy = false;
let seq = 0, utteranceId = 0, latestInterimSeq = 0;
let lastFinalText = '', overlapPending = false, lastInterim = null, silenceBeforeUtteranceMs = 0;
let epoch = 0; // bumped by RESET so an inference in flight cannot write stale offsets back

function resetAudio() {
  epoch++;
  chunks = []; total = 0; committed = 0; utteranceStart = null; lastSpeechEnd = -1; lastFinalEnd = 0; prevUtteranceEnd = 0;
  lastInferEnd = 0; busy = false; lastFinalText = ''; overlapPending = false; lastInterim = null; silenceBeforeUtteranceMs = 0;
  voter.reset();
}

class LangDetectProcessor extends LogitsProcessor {
  /**
   * @param genCfg model.generation_config (lang_to_id, task_to_id, no_timestamps_token_id)
   * @param forced language code to prefer (locked by the voter or chosen by the user), or null
   * @param hard when true always force `forced`; when false only if it is still plausible (p >= 0.2)
   */
  constructor(genCfg, forced, hard) {
    super();
    this.langs = Object.entries(genCfg.lang_to_id).map(([tok, id]) => [tok.slice(2, -2), id]);
    this.langToId = Object.fromEntries(this.langs);
    this.transcribeId = genCfg.task_to_id.transcribe;
    this.noTsId = genCfg.no_timestamps_token_id;
    this.forced = forced && this.langToId[forced] != null ? forced : null;
    this.hard = hard;
    this.result = null;
  }
  _call(input_ids, logits) {
    const step = input_ids[0].length;
    const data = logits.data;
    if (step === 1) {
      let maxV = -Infinity, maxLang = null;
      const vals = new Float64Array(this.langs.length);
      this.langs.forEach(([lang, id], i) => { vals[i] = data[id]; if (vals[i] > maxV) { maxV = vals[i]; maxLang = lang; } });
      let sum = 0;
      const probs = {};
      this.langs.forEach(([lang], i) => { const e = Math.exp(vals[i] - maxV); probs[lang] = e; sum += e; });
      for (const k in probs) probs[k] /= sum;
      let chosen = maxLang;
      if (this.forced && (this.hard || (probs[this.forced] ?? 0) >= 0.2)) chosen = this.forced;
      this.result = { lang: chosen, detected: maxLang, conf: probs[maxLang], chosenConf: probs[chosen], lockedConf: this.forced ? probs[this.forced] ?? 0 : null };
      data.fill(-Infinity); data[this.langToId[chosen]] = 0;
    } else if (step === 2) {
      data.fill(-Infinity); data[this.transcribeId] = 0;
    } else if (step === 3) {
      data.fill(-Infinity); data[this.noTsId] = 0;
    }
    return logits;
  }
}

// ---- model loading with aggregated progress ----
async function load(size) {
  const id = `onnx-community/whisper-${size}`;
  if (model && modelId === id) { post({ type: 'READY', backend, model: id }); return; }
  if (loading) return loading;
  loading = (async () => {
    modelId = id; model = null;
    const files = new Map();
    let lastReport = 0;
    const report = (force) => {
      let loaded = 0, totalB = 0;
      for (const [l, t] of files.values()) { if (t > 0) { loaded += Math.min(l, t); totalB += t; } }
      const now = performance.now();
      if (!force && now - lastReport < 100) return;
      lastReport = now;
      post({ type: 'PROGRESS', loaded, total: totalB, percent: totalB ? Math.round((loaded / totalB) * 100) : 0, files: files.size });
    };
    const progress_callback = (p) => {
      if (!p.file) return;
      if (p.status === 'progress') files.set(p.file, [p.loaded, p.total]);
      else if (p.status === 'done') { const f = files.get(p.file); if (f) files.set(p.file, [f[1], f[1]]); }
      report(p.status === 'done');
    };
    let gpu = false;
    try { gpu = !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch { gpu = false; }
    console.log(`[worker] crossOriginIsolated=${self.crossOriginIsolated} hardwareConcurrency=${navigator.hardwareConcurrency} webgpu=${gpu}`);
    // WASM: q8 first; the q8 decoder of some onnx-community exports fails session creation in
    // ORT 1.26 (MatMulNBits "Missing required scale"), so fall back to the fp32/q4 pair used on WebGPU.
    // ORT's extended-level MatMulNBits fusion rejects these QDQ decoders on the CPU EP, so the
    // WASM attempts lower the graph optimisation level before switching to a heavier dtype.
    // The asyncify build (needed for WebGPU) is single-threaded by design; on the CPU path use the
    // plain threaded build when SharedArrayBuffer exists (extension contexts get it without COI).
    const threads = typeof SharedArrayBuffer !== 'undefined' ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
    const wasmAttempts = [
      ['wasm', 'q8', { graphOptimizationLevel: 'basic' }, THREADED, threads],
      ['wasm', 'q8', { graphOptimizationLevel: 'basic' }, ASYNCIFY, 1],
      ['wasm', 'q8', { graphOptimizationLevel: 'disabled' }, ASYNCIFY, 1],
      ['wasm', 'uint8', {}, ASYNCIFY, 1],
      ['wasm', 'fp32', {}, ASYNCIFY, 1],
    ];
    const attempts = gpu
      ? [['webgpu', { encoder_model: 'fp32', decoder_model_merged: 'q4' }, {}, ASYNCIFY, 1], ...wasmAttempts]
      : wasmAttempts;
    let lastErr = null;
    for (const [device, dtype, session_options, paths, numThreads] of attempts) {
      try {
        env.backends.onnx.wasm.wasmPaths = paths;
        env.backends.onnx.wasm.numThreads = numThreads;
        const t0 = performance.now();
        const m = await WhisperForConditionalGeneration.from_pretrained(id, { device, dtype, session_options, progress_callback });
        processor ??= await AutoProcessor.from_pretrained(id, { progress_callback });
        tokenizer ??= await AutoTokenizer.from_pretrained(id, { progress_callback });
        if (processor && processor.feature_extractor?.config?.feature_size !== model?.config?.num_mel_bins) {
          processor = await AutoProcessor.from_pretrained(id, { progress_callback });
          tokenizer = await AutoTokenizer.from_pretrained(id, { progress_callback });
        }
        model = m;
        // Warm-up (compiles WebGPU shaders / initialises WASM) and verifies the backend actually runs.
        await transcribe(new Float32Array(SR), null, false);
        backend = device;
        console.log(`[worker] model ${id} ready on ${device} dtype=${JSON.stringify(dtype)} opts=${JSON.stringify(session_options)} threads=${numThreads} build=${paths === THREADED ? 'threaded' : 'asyncify'} in ${Math.round(performance.now() - t0)} ms`);
        report(true);
        post({ type: 'READY', backend, model: id });
        return;
      } catch (e) {
        lastErr = e;
        console.warn(`[worker] backend ${device} dtype ${JSON.stringify(dtype)} failed: ${fmt(e)}`);
        model = null;
      }
    }
    post({ type: 'ERROR', message: `Model failed to load: ${lastErr?.message || lastErr}` });
    modelId = null;
  })().finally(() => { loading = null; });
  return loading;
}

async function transcribe(samples, forced, hard) {
  const feats = await processor(samples);
  const lp = new LangDetectProcessor(model.generation_config, forced, hard);
  const list = new LogitsProcessorList();
  list.push(lp);
  const out = await model.generate({
    inputs: feats.input_features,
    decoder_input_ids: [model.generation_config.decoder_start_token_id],
    logits_processor: list,
    max_new_tokens: 128,
  });
  const text = tokenizer.batch_decode(out, { skip_special_tokens: true })[0] || '';
  return { text, ...(lp.result || { lang: forced || 'en', detected: null, conf: 0, chosenConf: 0, lockedConf: null }) };
}

// ---- streaming ----
function onAudio({ pcm, endTs, rms }) {
  if (!model) return;
  const start = total, end = total + pcm.length;
  chunks.push({ start, end, pcm, endTs, rms });
  total = end;
  const recentlySpeaking = lastSpeechEnd > 0 && end - lastSpeechEnd <= S(0.3);
  const speaking = rms > SPEECH_RMS || (recentlySpeaking && rms > SPEECH_RMS_HOLD);
  if (speaking) {
    if (utteranceStart === null) {
      utteranceStart = Math.max(committed, start - PRE_ROLL);
      silenceBeforeUtteranceMs = ((utteranceStart - prevUtteranceEnd) / SR) * 1000;
      utteranceId++;
    }
    lastSpeechEnd = end;
  }
  // Drop audio nobody will ever look at again.
  const keepFrom = Math.min(committed, utteranceStart ?? committed) - S(2);
  while (chunks.length && chunks[0].end < keepFrom) chunks.shift();
  void maybeInfer();
}

function extract(from, to) {
  const out = new Float32Array(Math.max(0, to - from));
  for (const c of chunks) {
    if (c.end <= from || c.start >= to) continue;
    const a = Math.max(from, c.start), b = Math.min(to, c.end);
    out.set(c.pcm.subarray(a - c.start, b - c.start), a - from);
  }
  return out;
}

function captureTsAt(sample) {
  for (const c of chunks) if (c.end >= sample) return c.endTs - ((c.end - sample) / SR) * 1000;
  return chunks.length ? chunks[chunks.length - 1].endTs : Date.now();
}

function intervalSamples() {
  if (lastInferEnd <= (utteranceStart ?? 0)) return 0; // first inference of this utterance
  return S(Math.max(2, (1.2 * lastInferMs) / 1000));
}

async function maybeInfer() {
  if (busy || !model || utteranceStart === null) return;
  const now = total;
  if (lastSpeechEnd <= utteranceStart) return;
  const sinceSpeech = now - lastSpeechEnd;
  const winLen = now - utteranceStart;
  let mode = null, end = now;
  if (sinceSpeech >= PAUSE_FINAL && lastSpeechEnd > lastFinalEnd) { mode = 'final'; end = Math.min(now, lastSpeechEnd + S(0.3)); }
  else if (winLen >= MAX_WINDOW) mode = 'cut';
  else if (sinceSpeech < PAUSE_FINAL && winLen >= MIN_FIRST_WINDOW && now - lastInferEnd >= intervalSamples()) mode = 'interim';
  if (!mode) return;

  busy = true;
  const myEpoch = epoch;
  try {
    const windowEndTs = captureTsAt(end);
    let text, lang, r = null;
    if (mode === 'final' && lastInterim && lastInterim.end >= lastSpeechEnd && lastInterim.start === utteranceStart) {
      // The latest interim already covers all the speech: finalise it without another inference.
      text = lastInterim.text; lang = lastInterim.lang;
    } else {
      const t0 = performance.now();
      const forced = userSource || voter.forcedLanguage();
      r = await transcribe(extract(utteranceStart, end), forced, !!userSource);
      if (myEpoch !== epoch) return; // session was reset while we were busy
      lastInferMs = performance.now() - t0;
      lastInferEnd = end;
      if (r.detected) {
        voter.observe({ lang: r.detected, conf: r.conf, lockedConf: r.lockedConf, ts: Date.now(), silenceMs: silenceBeforeUtteranceMs });
        silenceBeforeUtteranceMs = 0;
      }
      lang = r.lang;
      post({ type: 'LANG', utteranceId, lang, conf: r.chosenConf, detected: r.detected, detectedConf: r.conf, locked: voter.locked, inferMs: Math.round(lastInferMs), windowSec: +((end - utteranceStart) / SR).toFixed(1), mode });
      text = filterText(r.text);
      if (overlapPending && text) text = stripOverlap(lastFinalText, text);
      if (mode !== 'final') lastInterim = { start: utteranceStart, end, text, lang };
    }

    if (mode === 'interim') {
      if (text) emit('interim', text, lang, windowEndTs);
    } else {
      if (text) { emit('final', text, lang, windowEndTs); lastFinalText = text; }
      else if (lastInterim?.text) post({ type: 'CLEAR', utteranceId });
      lastInterim = null;
      if (mode === 'final') {
        committed = end; prevUtteranceEnd = lastSpeechEnd; lastFinalEnd = lastSpeechEnd; utteranceStart = null; overlapPending = false;
      } else {
        committed = now - OVERLAP; utteranceStart = committed; overlapPending = !!text; utteranceId++;
        lastInferEnd = utteranceStart; // next inference of the new window runs as soon as it is long enough
      }
    }
  } catch (e) {
    console.error('[worker] inference failed', e);
    post({ type: 'ERROR', message: `Inference failed: ${e.message || e}` });
  } finally {
    if (myEpoch === epoch) busy = false;
  }
  // More audio may have arrived meanwhile.
  if (myEpoch === epoch && utteranceStart !== null) setTimeout(() => void maybeInfer(), 0);
}

function emit(kind, text, lang, windowEndTs) {
  const mySeq = ++seq;
  if (kind === 'interim') latestInterimSeq = mySeq;
  const base = { type: 'CAPTION', seq: mySeq, utteranceId, kind, text, lang, targetLang, translated: null };
  post({ ...base, latencyMs: Math.round(Date.now() - windowEndTs) });
  if (lang === targetLang) {
    post({ ...base, translated: text, provider: 'none', latencyMs: Math.round(Date.now() - windowEndTs) });
    return;
  }
  translator.translate(text, lang, targetLang).then((res) => {
    if (kind === 'interim' && mySeq !== latestInterimSeq) return; // stale
    post({ ...base, translated: res.text, provider: res.provider, latencyMs: Math.round(Date.now() - windowEndTs) });
  }).catch((e) => { console.warn(`[worker] translation failed: ${e.message}`); post({ type: 'TRANSLATE_FAILED', message: e.message }); });
}

self.onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case 'LOAD': void load(m.model || 'base'); break;
    case 'CONFIG':
      targetLang = m.targetLang || 'en';
      userSource = m.sourceLang && m.sourceLang !== 'auto' ? m.sourceLang : null;
      break;
    case 'AUDIO': onAudio(m); break;
    case 'RESET': resetAudio(); break;
    case 'PING': post({ type: 'PONG' }); break;
  }
};
post({ type: 'WORKER_READY' });
