/** Popup: settings + start/stop + live status. */

const targetLanguageEl = document.getElementById('targetLanguage');
const sourceLanguageEl = document.getElementById('sourceLanguage');
const modelEl = document.getElementById('model');
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('statusText');
const progressBarEl = document.getElementById('progressBar');
const progressFillEl = document.getElementById('progressFill');
const toggleEl = document.getElementById('toggle');

let session = null;

function describe(session) {
  switch (session?.status) {
    case 'starting':
      return 'Starting…';
    case 'loading': {
      const pct = session.detail?.progress;
      return pct ? `Downloading model… ${pct}%` : 'Loading model…';
    }
    case 'listening': {
      const code = session.detail?.detectedLanguage;
      const cpu = session.detail?.backend === 'wasm' ? ' · CPU mode' : '';
      if (code) {
        let name = `"${code}"`;
        try {
          name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
        } catch (e) {
          // keep the raw code
        }
        return `Live — ${name} detected${cpu}`;
      }
      return `Live — captions on${cpu}`;
    }
    case 'error':
      return session.detail || 'Something went wrong';
    default:
      return 'Ready';
  }
}

function render() {
  const status = session?.status || 'idle';
  statusEl.className = `status ${status}`;
  statusTextEl.textContent = describe(session);

  const loading = status === 'loading' && session?.detail?.progress;
  progressBarEl.style.display = loading ? 'block' : 'none';
  if (loading) progressFillEl.style.width = `${session.detail.progress}%`;

  const active = session && status !== 'error';
  toggleEl.textContent = active ? 'Stop captions' : 'Start captions on this tab';
  toggleEl.classList.toggle('active', Boolean(active));
}

async function refreshStatus() {
  const response = await chrome.runtime.sendMessage({ target: 'background', type: 'GET_STATUS' });
  session = response?.session || null;
  render();
}

toggleEl.addEventListener('click', async () => {
  toggleEl.disabled = true;
  try {
    if (session && session.status !== 'error') {
      await chrome.runtime.sendMessage({ target: 'background', type: 'STOP' });
      session = null;
    } else {
      const settings = {
        targetLanguage: targetLanguageEl.value,
        sourceLanguage: sourceLanguageEl.value,
        model: modelEl.value
      };
      chrome.storage.sync.set(settings);
      const response = await chrome.runtime.sendMessage({
        target: 'background',
        type: 'START',
        ...settings
      });
      if (!response?.ok) {
        session = { status: 'error', detail: response?.error || 'Failed to start' };
      }
    }
  } finally {
    toggleEl.disabled = false;
    await refreshStatus().catch(() => render());
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target === 'popup' && message.type === 'STATUS_CHANGED') {
    session = message.session;
    render();
  }
});

(async function init() {
  const saved = await chrome.storage.sync.get({
    targetLanguage: 'en',
    sourceLanguage: 'auto',
    model: 'base'
  });
  targetLanguageEl.value = saved.targetLanguage;
  sourceLanguageEl.value = saved.sourceLanguage;
  modelEl.value = saved.model;
  await refreshStatus();
})();
