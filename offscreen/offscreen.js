/**
 * Offscreen document: the audio → subtitle pipeline.
 *
 *   tab MediaStream ─▶ AudioContext (also routed back to speakers)
 *        └▶ AudioWorklet (mono batches) ─▶ rolling buffer
 *             every ~5s: resample to 16kHz ─▶ Whisper (on-device)
 *             ─▶ clean/filter ─▶ translate ─▶ SUBTITLE message
 *
 * Whisper runs via transformers.js: WebGPU when available, WASM otherwise.
 * Model weights download once from the Hugging Face Hub and are cached
 * by the browser, so later sessions start fast and work offline.
 */
import { pipeline, env, Tensor } from '@huggingface/transformers';
import { cleanTranscript, isHallucination } from './textFilters.js';
import { translate } from './translator.js';

// Serve ONNX Runtime's wasm files from the extension instead of a CDN.
env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('vendor/');

const MODELS = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small'
};

const WHISPER_SAMPLE_RATE = 16000;
const MIN_CHUNK_SECONDS = 3; // shortest chunk worth transcribing
const MAX_CHUNK_SECONDS = 8; // force a cut during continuous speech
const BUFFER_CAP_SECONDS = 28; // Whisper's window is 30s; never exceed it
const SILENCE_RMS = 0.0015; // skip chunks quieter than this
const PAUSE_WINDOW_S = 0.35; // a quiet tail this long marks a pause

let transcriber = null;
let loadedModelKey = null;
let backend = null; // 'webgpu' | 'wasm'
let session = null; // active capture session, or null

function send(message) {
  chrome.runtime.sendMessage({ target: 'background', ...message }).catch(() => {});
}

function reportStatus(status, detail = null) {
  send({ type: 'STATUS', status, detail });
}

async function loadModel(modelKey) {
  const key = MODELS[modelKey] ? modelKey : 'base';
  if (transcriber && loadedModelKey === key) return;

  if (transcriber) {
    try {
      await transcriber.dispose?.();
    } catch (e) {
      // Old model will be garbage collected.
    }
    transcriber = null;
    loadedModelKey = null;
  }

  const progress_callback = (p) => {
    if (p.status === 'progress' && p.file && p.file.endsWith('.onnx')) {
      reportStatus('loading', { file: p.file, progress: Math.round(p.progress || 0) });
    }
  };

  reportStatus('loading', { file: 'model', progress: 0 });
  try {
    transcriber = await pipeline('automatic-speech-recognition', MODELS[key], {
      device: 'webgpu',
      dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      progress_callback
    });
    backend = 'webgpu';
  } catch (webgpuError) {
    console.warn('WebGPU unavailable, falling back to WASM:', webgpuError);
    if (!crossOriginIsolated) env.backends.onnx.wasm.numThreads = 1;
    transcriber = await pipeline('automatic-speech-recognition', MODELS[key], {
      device: 'wasm',
      dtype: 'q8',
      progress_callback
    });
    backend = 'wasm';
  }
  loadedModelKey = key;
}

async function start(message) {
  await stop();

  await loadModel(message.model);

  const media = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: message.streamId
      }
    },
    video: false
  });

  const ctx = new AudioContext();
  await ctx.resume();

  const source = ctx.createMediaStreamSource(media);
  // Capturing mutes the tab for the user — route the audio back out.
  source.connect(ctx.destination);

  await ctx.audioWorklet.addModule(chrome.runtime.getURL('offscreen/recorder-worklet.js'));
  const recorder = new AudioWorkletNode(ctx, 'recorder-processor', {
    channelCount: 1,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers'
  });
  source.connect(recorder);

  const sourceLanguage = message.sourceLanguage || 'auto';
  session = {
    tabId: message.tabId,
    targetLanguage: message.targetLanguage || 'en',
    language: sourceLanguage === 'auto' ? null : sourceLanguage,
    // Auto-detection keeps voting on every chunk until two consecutive
    // chunks agree; a manual choice is locked from the start.
    langLocked: sourceLanguage !== 'auto',
    langVotes: [],
    media,
    ctx,
    buffer: [],
    buffered: 0,
    transcribing: false,
    lastText: ''
  };

  recorder.port.onmessage = (event) => onAudio(event.data);
  reportStatus('listening', { backend });
}

async function stop() {
  if (!session) return;
  const s = session;
  session = null;
  s.media.getTracks().forEach((track) => track.stop());
  await s.ctx.close().catch(() => {});
}

function onAudio(samples) {
  if (!session) return;
  session.buffer.push(samples);
  session.buffered += samples.length;

  // If transcription can't keep up, drop the oldest audio.
  const cap = BUFFER_CAP_SECONDS * session.ctx.sampleRate;
  while (session.buffered > cap && session.buffer.length > 1) {
    session.buffered -= session.buffer.shift().length;
  }
  maybeTranscribe();
}

/**
 * True when the most recent PAUSE_WINDOW_S of audio is quiet — a natural
 * pause. Cutting chunks there instead of mid-word noticeably improves
 * Whisper's accuracy.
 */
function tailIsQuiet(s) {
  const needed = Math.round(PAUSE_WINDOW_S * s.ctx.sampleRate);
  let collected = 0;
  let sum = 0;
  for (let i = s.buffer.length - 1; i >= 0 && collected < needed; i--) {
    const piece = s.buffer[i];
    const take = Math.min(piece.length, needed - collected);
    for (let j = piece.length - take; j < piece.length; j++) sum += piece[j] * piece[j];
    collected += take;
  }
  return collected > 0 && Math.sqrt(sum / collected) < SILENCE_RMS * 1.5;
}

async function maybeTranscribe() {
  const s = session;
  if (!s || s.transcribing) return;
  if (s.buffered < MIN_CHUNK_SECONDS * s.ctx.sampleRate) return;
  // Prefer cutting at a pause; force a cut if speech runs long.
  if (s.buffered < MAX_CHUNK_SECONDS * s.ctx.sampleRate && !tailIsQuiet(s)) return;

  s.transcribing = true;
  const samples = new Float32Array(s.buffered);
  let offset = 0;
  for (const piece of s.buffer) {
    samples.set(piece, offset);
    offset += piece.length;
  }
  s.buffer = [];
  s.buffered = 0;

  try {
    await processChunk(s, samples);
  } catch (error) {
    console.error('Transcription failed:', error);
    if (session === s) reportStatus('error', error.message);
  } finally {
    if (session === s) {
      s.transcribing = false;
      maybeTranscribe();
    }
  }
}

async function processChunk(s, samples) {
  const audio = await resample(samples, s.ctx.sampleRate, WHISPER_SAMPLE_RATE);
  if (rms(audio) < SILENCE_RMS) return;

  // transformers.js does not auto-detect language (omitting it forces
  // English), so detect it ourselves. A single early detection is easily
  // fooled by intro music, so keep voting on each audible chunk until two
  // consecutive chunks agree.
  if (!s.langLocked) {
    try {
      const detected = await detectLanguage(audio);
      s.langVotes.push(detected);
      const n = s.langVotes.length;
      if (n >= 2 && s.langVotes[n - 1] === s.langVotes[n - 2]) {
        s.langLocked = true;
      }
      s.language = detected;
      reportStatus('listening', { detectedLanguage: s.language, backend });
    } catch (error) {
      console.warn('Language detection failed, assuming English:', error);
      s.language = s.language || 'en';
      s.langLocked = true;
    }
  }

  const output = await transcriber(audio, {
    task: 'transcribe',
    language: s.language,
    // Suppress decoder repetition loops ("buy now buy now buy now…")
    repetition_penalty: 1.3,
    no_repeat_ngram_size: 3
  });
  const text = cleanTranscript(output?.text);
  if (!text || isHallucination(text)) return;
  // Whisper often re-emits the tail of the previous chunk; drop repeats.
  if (text === s.lastText || s.lastText.endsWith(text)) return;
  s.lastText = text;

  let translated = text;
  try {
    // Telling the translator the source language (instead of auto) avoids
    // misdetection on short fragments, and skips the network round-trip
    // entirely when source and target match.
    translated = await translate(text, s.targetLanguage, s.language || 'auto');
  } catch (error) {
    console.warn('Translation failed, showing original text:', error);
  }

  if (session !== s) return; // stopped while we were working
  send({ type: 'SUBTITLE', tabId: s.tabId, text: translated, original: text });
}

/**
 * Whisper language detection: run one decoder step from
 * <|startoftranscript|> and argmax the logits over the language tokens
 * (generation_config.lang_to_id). Mirrors openai/whisper detect_language.
 */
async function detectLanguage(audio) {
  const { model, processor } = transcriber;
  const langToId = model.generation_config?.lang_to_id;
  const startToken = model.generation_config?.decoder_start_token_id;
  if (!langToId || startToken == null) {
    throw new Error('Model has no language map (English-only model?)');
  }

  const inputs = await processor(audio);
  const decoder_input_ids = new Tensor('int64', new BigInt64Array([BigInt(startToken)]), [1, 1]);
  const { logits } = await model({ ...inputs, decoder_input_ids });

  let bestToken = null;
  let bestScore = -Infinity;
  for (const [token, id] of Object.entries(langToId)) {
    const score = logits.data[id];
    if (score > bestScore) {
      bestScore = score;
      bestToken = token;
    }
  }
  return bestToken.replace(/[<|>]/g, ''); // "<|fr|>" -> "fr"
}

async function resample(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const length = Math.ceil((samples.length * toRate) / fromRate);
  const offline = new OfflineAudioContext(1, length, toRate);
  const buffer = offline.createBuffer(1, samples.length, fromRate);
  buffer.copyToChannel(samples, 0);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'offscreen') return;

  if (message.type === 'OFFSCREEN_START') {
    sendResponse({ ok: true }); // ack immediately; progress flows via STATUS
    start(message).catch((error) => {
      console.error('Failed to start capture:', error);
      reportStatus('error', error.message);
    });
    return false;
  }

  if (message.type === 'OFFSCREEN_STOP') {
    stop().then(() => sendResponse({ ok: true }));
    return true;
  }
});
