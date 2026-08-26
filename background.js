/**
 * Background service worker.
 *
 * Owns the single active captioning session and routes messages between
 * the popup, the offscreen document (audio capture + Whisper + translation),
 * and the content script (subtitle overlay).
 *
 * The session is mirrored to chrome.storage.session because MV3 suspends
 * this worker after ~30s of inactivity — an in-memory-only session would be
 * lost and every later SUBTITLE message silently dropped.
 *
 * Message protocol — every message has { target, type }:
 *   popup     -> background : START, STOP, GET_STATUS
 *   background-> offscreen  : OFFSCREEN_START, OFFSCREEN_STOP
 *   offscreen -> background : STATUS { status, detail }, SUBTITLE { tabId, text, original }
 *   background-> content    : SUBTITLE, CLEAR_SUBTITLES
 *   background-> popup      : STATUS_CHANGED { session }   (broadcast)
 */

const OFFSCREEN_URL = 'offscreen/offscreen.html';

// Active session or null. { tabId, targetLanguage, sourceLanguage, model, status, detail }
// status: starting | loading | listening | error
let session = null;
let sessionRestored = false;

async function getSession() {
  if (!sessionRestored) {
    const stored = await chrome.storage.session.get('session');
    // Only adopt the stored value if nothing newer happened in memory.
    if (!sessionRestored) session = stored.session ?? session;
    sessionRestored = true;
  }
  return session;
}

function setSession(next) {
  session = next;
  sessionRestored = true;
  chrome.storage.session.set({ session: next }).catch(() => {});
}

function broadcastStatus() {
  // Popup may be closed; that's fine.
  chrome.runtime
    .sendMessage({ target: 'popup', type: 'STATUS_CHANGED', session })
    .catch(() => {});
}

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification:
      'Captures tab audio and runs on-device speech recognition to generate live subtitles.'
  });
}

/** Send to the offscreen document, retrying briefly while it boots. */
async function sendToOffscreen(message) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await chrome.runtime.sendMessage({ target: 'offscreen', ...message });
    } catch (e) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error('Could not reach audio processor');
}

async function startSession({ targetLanguage, sourceLanguage, model }) {
  if (await getSession()) await stopSession();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab found.');
  if (!tab.url || /^(chrome|chrome-extension|edge|about|devtools):/.test(tab.url)) {
    throw new Error('This page cannot be captured. Open a normal web page with a video.');
  }

  // The offscreen document must exist BEFORE the stream ID is minted:
  // stream IDs expire within seconds if unconsumed, so the consumer has to
  // be ready to call getUserMedia the moment the ID arrives.
  await ensureOffscreenDocument();

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });

  setSession({ tabId: tab.id, targetLanguage, sourceLanguage, model, status: 'starting', detail: null });
  broadcastStatus();

  await sendToOffscreen({
    type: 'OFFSCREEN_START',
    streamId,
    tabId: tab.id,
    targetLanguage,
    sourceLanguage,
    model
  });

  chrome.action.setBadgeText({ text: 'CC' });
  chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });
}

async function stopSession() {
  const stopped = await getSession();
  setSession(null);
  chrome.action.setBadgeText({ text: '' });

  try {
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'OFFSCREEN_STOP' });
  } catch (e) {
    // No offscreen document — nothing to stop.
  }
  if (stopped) {
    chrome.tabs
      .sendMessage(stopped.tabId, { target: 'content', type: 'CLEAR_SUBTITLES' })
      .catch(() => {});
  }
  broadcastStatus();
}

async function handleMessage(message) {
  switch (message.type) {
    case 'START':
      try {
        await startSession(message);
        return { ok: true };
      } catch (error) {
        setSession(null);
        chrome.action.setBadgeText({ text: '' });
        broadcastStatus();
        return { ok: false, error: error.message };
      }

    case 'STOP':
      await stopSession();
      return { ok: true };

    case 'GET_STATUS':
      return { session: await getSession() };

    case 'STATUS': {
      const s = await getSession();
      if (s) {
        setSession({ ...s, status: message.status, detail: message.detail ?? null });
        broadcastStatus();
      }
      return undefined;
    }

    case 'SUBTITLE': {
      const s = await getSession();
      if (s && message.tabId === s.tabId) {
        chrome.tabs
          .sendMessage(s.tabId, {
            target: 'content',
            type: 'SUBTITLE',
            text: message.text,
            original: message.original
          })
          .catch(() => {});
      }
      return undefined;
    }
  }
  return undefined;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'background') return;
  handleMessage(message).then(sendResponse, (error) =>
    sendResponse({ ok: false, error: error?.message || String(error) })
  );
  return true; // keep the channel open for the async response
});

// Stop when the captured tab closes.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const s = await getSession();
  if (s && s.tabId === tabId) stopSession();
});
