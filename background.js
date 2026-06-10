/**
 * Background service worker.
 *
 * Owns the single active captioning session and routes messages between
 * the popup, the offscreen document (audio capture + Whisper + translation),
 * and the content script (subtitle overlay).
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
  if (session) await stopSession();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab found.');
  if (!tab.url || /^(chrome|chrome-extension|edge|about|devtools):/.test(tab.url)) {
    throw new Error('This page cannot be captured. Open a normal web page with a video.');
  }

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });

  session = { tabId: tab.id, targetLanguage, sourceLanguage, model, status: 'starting', detail: null };
  broadcastStatus();

  await ensureOffscreenDocument();
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
  const stopped = session;
  session = null;
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'background') return;

  switch (message.type) {
    case 'START':
      startSession(message)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          session = null;
          chrome.action.setBadgeText({ text: '' });
          broadcastStatus();
          sendResponse({ ok: false, error: error.message });
        });
      return true; // keep the channel open for the async response

    case 'STOP':
      stopSession().then(() => sendResponse({ ok: true }));
      return true;

    case 'GET_STATUS':
      sendResponse({ session });
      return false;

    case 'STATUS':
      if (session) {
        session.status = message.status;
        session.detail = message.detail ?? null;
        broadcastStatus();
      }
      return false;

    case 'SUBTITLE':
      if (session && message.tabId === session.tabId) {
        chrome.tabs
          .sendMessage(session.tabId, {
            target: 'content',
            type: 'SUBTITLE',
            text: message.text,
            original: message.original
          })
          .catch(() => {});
      }
      return false;
  }
});

// Stop when the captured tab closes.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (session && session.tabId === tabId) stopSession();
});
