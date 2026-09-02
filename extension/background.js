// Service worker: session state, capture bootstrap, caption routing to the winning frame.

const OFFSCREEN_URL = 'offscreen/offscreen.html';
const FRAME_STALE_MS = 4000;
const NO_AUDIO_MS = 10000;
const LOG_LIMIT = 1500;

const idleSession = () => ({
  status: 'idle', // idle | starting | loading | running | error
  error: null, tabId: null, model: null, targetLang: null, sourceLang: null,
  backend: null, lang: null, langConf: null, progress: null, modelReady: false,
  frames: new Map(), winnerFrameId: null, winnerFallback: null,
  captureStartTs: 0, lastSoundTs: 0, lastLevelTs: 0, batches: 0,
  captionLog: [], langLog: [], lastCaption: null, lastError: null, startedAt: 0,
});
let session = idleSession();
// Exposed for the e2e harness (read through the service worker target).
globalThis.__vt = { get session() { return session; }, status: () => publicStatus(), log: () => session.captionLog, langLog: () => session.langLog, stop: () => stopSession() };

const isRestrictedUrl = (url) => !url || /^(chrome|chrome-extension|chrome-untrusted|devtools|edge|about|view-source|file):/i.test(url) || /^https:\/\/chrome(webstore)?\.google\.com\/webstore/i.test(url) || /^https:\/\/chromewebstore\.google\.com/i.test(url);

function publicStatus() {
  const now = Date.now();
  const s = session;
  const mediaPlaying = [...s.frames.values()].some((f) => now - f.ts < FRAME_STALE_MS && f.mediaPlayingUnmuted);
  const sinceSound = now - Math.max(s.lastSoundTs, s.captureStartTs);
  const noAudio = s.status === 'running' && s.captureStartTs > 0 && sinceSound > NO_AUDIO_MS && mediaPlaying;
  return {
    status: s.status, error: s.error, lastError: s.lastError, tabId: s.tabId, model: s.model, targetLang: s.targetLang, sourceLang: s.sourceLang,
    backend: s.backend, lang: s.lang, langConf: s.langConf, progress: s.progress, noAudio, batches: s.batches, lastSoundTs: s.lastSoundTs, sinceSoundMs: sinceSound, mediaPlaying,
    winnerFrameId: s.winnerFrameId, winnerFallback: s.winnerFallback, frames: [...s.frames.entries()].map(([id, f]) => ({ frameId: id, ...f })),
    lastCaption: s.lastCaption, captions: s.captionLog.length, latency: latencyStats(), startedAt: s.startedAt,
  };
}

function median(arr) { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); }
function latencyStats() {
  const interim = session.captionLog.filter((c) => c.kind === 'interim' && c.translated == null).map((c) => c.latencyMs);
  const final = session.captionLog.filter((c) => c.kind === 'final' && c.translated == null).map((c) => c.latencyMs);
  const translated = session.captionLog.filter((c) => c.translated != null).map((c) => c.latencyMs);
  return { interimMedianMs: median(interim), finalMedianMs: median(final), translatedMedianMs: median(translated) };
}

function setError(message) {
  session.status = 'error';
  session.error = message;
  console.error('[bg] error:', message);
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length === 0) {
    try {
      await chrome.offscreen.createDocument({ url: OFFSCREEN_URL, reasons: ['USER_MEDIA'], justification: 'Capture tab audio and run on-device speech recognition for live captions' });
    } catch (e) {
      if (!/single offscreen|already exists/i.test(String(e.message))) throw new Error(`Could not create offscreen document: ${e.message}`);
    }
  }
  for (let i = 0; i < 50; i++) {
    try {
      const r = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'PING' });
      if (r?.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Offscreen document did not respond');
}

async function injectContent(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content/content.js'] });
  } catch (e) {
    console.warn('[bg] content injection warning:', e.message);
    return e.message;
  }
  return null;
}

async function broadcastSessionState(tabId, captured) {
  try { await chrome.tabs.sendMessage(tabId, { type: 'SESSION_STATE', captured, targetLang: session.targetLang }); } catch {}
}

async function startSession({ tabId, model, targetLang, sourceLang }) {
  if (session.status !== 'idle' && session.status !== 'error') {
    if (session.tabId === tabId) return { ok: true, status: session.status };
    await stopSession();
  }
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch (e) { return fail(`Tab ${tabId} not found: ${e.message}`); }
  const url = tab.url || tab.pendingUrl || '';
  if (isRestrictedUrl(url)) {
    const scheme = url ? url.split('/')[0] + '//' : 'chrome:// (or another restricted)';
    return fail(`Chrome does not allow capturing ${scheme} pages. Open a normal web page (http/https) and try again.`);
  }
  session = idleSession();
  Object.assign(session, { status: 'starting', tabId, model, targetLang, sourceLang, startedAt: Date.now() });

  const t0 = Date.now();
  const step = (name) => console.log(`[bg] start: ${name} (+${Date.now() - t0} ms)`);
  const injectWarning = await injectContent(tabId);
  step('content injected');
  try {
    await ensureOffscreen();
  } catch (e) { return fail(e.message); }
  step('offscreen ready');

  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch (e) {
    return fail(`tabCapture.getMediaStreamId failed: ${e.message}. Click the extension icon on the tab you want to caption and press Start.`);
  }
  step('stream id minted');
  let res;
  try {
    res = await Promise.race([
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'OFFSCREEN_START', streamId, model, targetLang, sourceLang }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('offscreen did not answer OFFSCREEN_START within 15 s')), 15000)),
    ]);
  } catch (e) { return fail(`Offscreen document unreachable: ${e.message}`); }
  step(`offscreen answered ${JSON.stringify(res)}`);
  if (!res?.ok) return fail(res?.error || 'Offscreen start failed without a message');

  if (session.status !== 'starting' || session.tabId !== tabId) return { ok: false, error: session.error || 'Session was stopped during start' };
  session.status = session.modelReady ? 'running' : 'loading';
  session.captureStartTs = Date.now();
  session.progress = session.modelReady ? 100 : (session.progress ?? 0);
  if (injectWarning) session.lastError = `Overlay injection warning: ${injectWarning}`;
  await broadcastSessionState(tabId, true);
  return { ok: true, status: session.status };

  function fail(message) { setError(message); return { ok: false, error: message }; }
}

async function stopSession() {
  const tabId = session.tabId;
  const wasActive = session.status !== 'idle';
  try { await chrome.runtime.sendMessage({ target: 'offscreen', type: 'OFFSCREEN_STOP' }); } catch {}
  if (tabId != null && wasActive) await broadcastSessionState(tabId, false);
  session = idleSession();
  return { ok: true };
}

function pickWinner() {
  const now = Date.now();
  let best = null, bestScore = 0;
  for (const [frameId, f] of session.frames) {
    if (now - f.ts > FRAME_STALE_MS) continue;
    if (f.score > bestScore) { bestScore = f.score; best = frameId; }
  }
  return best;
}

async function routeCaption(msg) {
  const s = session;
  if (s.status !== 'running' && s.status !== 'loading') return;
  const tabId = s.tabId;
  const winner = pickWinner();
  const frameId = winner ?? 0;
  const fallback = winner == null;
  if (s.winnerFrameId != null && s.winnerFrameId !== frameId) {
    chrome.tabs.sendMessage(tabId, { type: 'CLEAR' }, { frameId: s.winnerFrameId }).catch(() => {});
  }
  s.winnerFrameId = frameId; s.winnerFallback = fallback;
  const out = { ...msg, fallback, targetLang: s.targetLang };
  if (msg.type === 'CAPTION') {
    s.captionLog.push({ t: Date.now(), seq: msg.seq, utteranceId: msg.utteranceId, kind: msg.kind, text: msg.text, translated: msg.translated, lang: msg.lang, latencyMs: msg.latencyMs, provider: msg.provider || null, frameId, fallback });
    if (s.captionLog.length > LOG_LIMIT) s.captionLog.splice(0, s.captionLog.length - LOG_LIMIT);
    // The overlay only ever shows the translated result: untranslated interim text is logged
    // (for latency measurement) but never sent to the tab.
    if (msg.translated == null) return;
    s.lastCaption = { seq: msg.seq, kind: msg.kind, text: msg.text, translated: msg.translated, lang: msg.lang, latencyMs: msg.latencyMs, t: Date.now() };
  }
  try {
    await chrome.tabs.sendMessage(tabId, out, { frameId });
    if (s.lastError && s.lastError.startsWith('Caption delivery failed')) s.lastError = null;
  } catch (e) {
    s.lastError = `Caption delivery failed to frame ${frameId}: ${e.message}`;
    console.warn('[bg]', s.lastError);
    if (frameId !== 0) {
      s.frames.delete(frameId);
      try { await chrome.tabs.sendMessage(tabId, { ...out, fallback: true }, { frameId: 0 }); s.winnerFrameId = 0; s.winnerFallback = true; } catch {}
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return;
  const fromTab = sender.tab?.id;
  switch (msg.type) {
    // ---- popup ----
    case 'START': startSession(msg).then(sendResponse, (e) => { setError(`Start failed: ${e.message}`); sendResponse({ ok: false, error: session.error }); }); return true;
    case 'STOP': stopSession().then(sendResponse); return true;
    case 'STATUS': sendResponse(publicStatus()); return;
    case 'CLEAR_ERROR': if (session.status === 'error') session = idleSession(); sendResponse({ ok: true }); return;
    case 'PRELOAD': ensureOffscreen().then(() => chrome.runtime.sendMessage({ target: 'offscreen', type: 'PRELOAD', model: msg.model })).then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: e.message })); return true;

    // ---- content scripts ----
    case 'CONTENT_HELLO': {
      const captured = fromTab != null && fromTab === session.tabId && ['starting', 'loading', 'running'].includes(session.status);
      sendResponse({ captured, targetLang: session.targetLang });
      return;
    }
    case 'FRAME_HEARTBEAT': {
      if (fromTab != null && fromTab === session.tabId) {
        session.frames.set(sender.frameId ?? 0, { score: msg.score || 0, hasVideo: !!msg.hasVideo, mediaPlayingUnmuted: !!msg.mediaPlayingUnmuted, videoCount: msg.videoCount || 0, url: sender.url, ts: Date.now() });
      }
      sendResponse({ ok: true });
      return;
    }

    // ---- offscreen / worker ----
    case 'PROGRESS': session.progress = msg.percent; sendResponse({ ok: true }); return;
    case 'MODEL_READY':
      session.backend = msg.backend; session.modelReady = true;
      if (session.status === 'loading') { session.status = 'running'; session.progress = 100; session.captureStartTs = Date.now(); }
      sendResponse({ ok: true }); return;
    case 'OFFSCREEN_ERROR': setError(msg.message); sendResponse({ ok: true }); return;
    case 'TRANSLATE_FAILED': session.lastError = `Translation failed: ${msg.message}`; sendResponse({ ok: true }); return;
    case 'CAPTURE_ENDED': if (session.status === 'running' || session.status === 'loading') setError('Tab capture ended (the tab was closed, muted by Chrome, or capture was revoked)'); sendResponse({ ok: true }); return;
    case 'AUDIO_LEVEL': session.lastSoundTs = Math.max(session.lastSoundTs, msg.lastSoundTs || 0); session.lastLevelTs = Date.now(); session.batches = msg.batches; sendResponse({ ok: true }); return;
    case 'LANG':
      session.lang = msg.lang; session.langConf = msg.conf;
      session.langLog.push({ t: Date.now(), utteranceId: msg.utteranceId, lang: msg.lang, conf: msg.conf, detected: msg.detected, detectedConf: msg.detectedConf, locked: msg.locked, inferMs: msg.inferMs, windowSec: msg.windowSec, mode: msg.mode });
      if (session.langLog.length > LOG_LIMIT) session.langLog.splice(0, session.langLog.length - LOG_LIMIT);
      sendResponse({ ok: true }); return;
    case 'CAPTION': case 'CLEAR': routeCaption(msg).finally(() => sendResponse({ ok: true })); return true;
    case 'KEEPALIVE': sendResponse({ ok: true }); return;
    case 'OFFSCREEN_LOG': (console[msg.level] || console.log)(`[offscreen] ${msg.text}`); sendResponse({ ok: true }); return;
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (tabId !== session.tabId || info.status !== 'complete') return;
  if (!['starting', 'loading', 'running'].includes(session.status)) return;
  session.frames.clear();
  await injectContent(tabId);
  await broadcastSessionState(tabId, true);
});

chrome.tabs.onRemoved.addListener((tabId) => { if (tabId === session.tabId) stopSession(); });

chrome.runtime.onInstalled.addListener(() => console.log('[bg] installed'));
