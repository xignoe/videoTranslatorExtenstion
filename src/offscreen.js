// Offscreen document: consumes the tabCapture stream, keeps the user hearing the tab,
// delivers 16 kHz mono batches from an AudioWorklet to the inference Worker,
// and relays Worker messages to the service worker.

const bg = (msg) => chrome.runtime.sendMessage({ target: 'background', ...msg }).catch(() => {});

let worker = null;
let stream = null, ctxOut = null, ctx16 = null, workletNode = null;
let lastSoundTs = 0, lastLevelReport = 0, batches = 0;
let currentModel = null;

// Mirror this document's console into the service worker log (chrome://inspect is easy to miss).
for (const level of ['log', 'info', 'warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => { orig(...args); try { chrome.runtime.sendMessage({ target: 'background', type: 'OFFSCREEN_LOG', level, text: args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ') }).catch(() => {}); } catch {} };
}
addEventListener('error', (e) => console.error(`uncaught: ${e.message} @${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => console.error(`unhandled rejection: ${e.reason?.message || e.reason}`));
console.log(`[offscreen] crossOriginIsolated=${self.crossOriginIsolated} SharedArrayBuffer=${typeof SharedArrayBuffer !== 'undefined'}`);

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(chrome.runtime.getURL('offscreen/worker.bundle.js'), { type: 'module', name: 'vt-inference' });
  worker.onmessage = (e) => {
    const m = e.data;
    switch (m.type) {
      case 'LOG': {
        const fn = console[m.level] || console.log;
        fn(`[worker:${m.level}] ${m.text}`);
        break;
      }
      case 'WORKER_READY': console.log('[offscreen] worker started'); break;
      case 'PROGRESS': bg({ type: 'PROGRESS', percent: m.percent, loaded: m.loaded, total: m.total, files: m.files }); break;
      case 'READY': bg({ type: 'MODEL_READY', backend: m.backend, model: m.model }); break;
      case 'ERROR': console.error('[offscreen] worker error:', m.message); bg({ type: 'OFFSCREEN_ERROR', message: m.message }); break;
      case 'CAPTION': bg(m); break;
      case 'CLEAR': bg(m); break;
      case 'LANG': bg(m); break;
      case 'TRANSLATE_FAILED': bg(m); break;
    }
  };
  worker.onerror = (e) => { console.error('[offscreen] worker crashed:', e.message); bg({ type: 'OFFSCREEN_ERROR', message: `Inference worker crashed: ${e.message}` }); };
  return worker;
}

let workletReady = null;
async function ensureAudio() {
  if (!ctxOut) ctxOut = new AudioContext();
  if (!ctx16) {
    ctx16 = new AudioContext({ sampleRate: 16000 });
    const url = chrome.runtime.getURL('offscreen/pcm-worklet.js');
    workletReady = ctx16.audioWorklet.addModule(url).catch(async (e) => {
      console.warn('[offscreen] worklet addModule failed, retrying:', e.message);
      await new Promise((r) => setTimeout(r, 200));
      await ctx16.audioWorklet.addModule(url);
    });
  }
  await workletReady;
  await Promise.all([ctxOut.resume().catch(() => {}), ctx16.resume().catch(() => {})]);
}

let srcOut = null, src16 = null, mute = null;

async function start({ streamId, model, targetLang, sourceLang }) {
  const t0 = performance.now();
  await stopCapture();
  const w = ensureWorker();
  w.postMessage({ type: 'CONFIG', targetLang, sourceLang });
  w.postMessage({ type: 'RESET' });
  currentModel = model;
  w.postMessage({ type: 'LOAD', model });

  // The stream id expires within seconds: consume it right away.
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false,
    });
  } catch (e) {
    return { ok: false, error: `Tab audio capture failed: ${e.name}: ${e.message}` };
  }
  const track = stream.getAudioTracks()[0];
  if (!track) return { ok: false, error: 'Tab audio capture returned no audio track' };
  track.onended = () => { console.warn('[offscreen] capture track ended'); bg({ type: 'CAPTURE_ENDED' }); };

  try {
    await ensureAudio();
  } catch (e) {
    return { ok: false, error: `AudioWorklet failed to load: ${e.name}: ${e.message}` };
  }
  // 1) Passthrough at native rate so the user still hears the tab.
  srcOut = ctxOut.createMediaStreamSource(stream);
  srcOut.connect(ctxOut.destination);

  // 2) 16 kHz context + AudioWorklet producing mono Float32 batches (resampled off the main thread).
  src16 = ctx16.createMediaStreamSource(stream);
  workletNode = new AudioWorkletNode(ctx16, 'pcm-batcher', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  mute = ctx16.createGain(); mute.gain.value = 0;
  src16.connect(workletNode).connect(mute).connect(ctx16.destination);
  workletNode.port.onmessage = (e) => {
    const { pcm, endTs, rms } = e.data;
    batches++;
    if (rms > 0.003) lastSoundTs = endTs;
    if (endTs - lastLevelReport >= 1000) {
      lastLevelReport = endTs;
      bg({ type: 'AUDIO_LEVEL', rms, lastSoundTs, batches, sampleRate: ctx16.sampleRate });
    }
    w.postMessage({ type: 'AUDIO', pcm, endTs, rms }, [pcm.buffer]);
  };
  console.log(`[offscreen] capture started in ${Math.round(performance.now() - t0)} ms; out=${ctxOut.sampleRate} Hz, worklet=${ctx16.sampleRate} Hz, states=${ctxOut.state}/${ctx16.state}`);
  return { ok: true, sampleRate: ctxOut.sampleRate };
}

async function stopCapture() {
  if (workletNode) { try { workletNode.port.onmessage = null; workletNode.disconnect(); } catch {} workletNode = null; }
  for (const n of [srcOut, src16, mute]) { try { n?.disconnect(); } catch {} }
  srcOut = src16 = mute = null;
  if (stream) { for (const t of stream.getTracks()) { t.onended = null; t.stop(); } stream = null; }
  lastSoundTs = 0; batches = 0;
}

async function stop() {
  await stopCapture();
  worker?.postMessage({ type: 'RESET' });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  switch (msg.type) {
    case 'PING': sendResponse({ ok: true, capturing: !!stream }); return;
    case 'OFFSCREEN_START': start(msg).then(sendResponse, (e) => sendResponse({ ok: false, error: `Offscreen start failed: ${e.message || e}` })); return true;
    case 'OFFSCREEN_STOP': stop().then(sendResponse); return true;
    case 'PRELOAD': ensureWorker().postMessage({ type: 'LOAD', model: msg.model }); sendResponse({ ok: true }); return;
  }
});

setInterval(() => { if (stream) bg({ type: 'KEEPALIVE' }); }, 20000);
ensureAudio().then(() => console.log('[offscreen] audio contexts ready'), (e) => console.error('[offscreen] audio init failed', e));
