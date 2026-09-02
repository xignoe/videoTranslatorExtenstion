// Popup: settings, Start/Stop, status. Every failure shows a specific message and a failed
// START is never overwritten by the periodic status refresh.
const LANGS = [
  ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'],
  ['ru', 'Russian'], ['uk', 'Ukrainian'], ['pl', 'Polish'], ['tr', 'Turkish'], ['ar', 'Arabic'], ['hi', 'Hindi'], ['zh', 'Chinese'],
  ['ja', 'Japanese'], ['ko', 'Korean'], ['vi', 'Vietnamese'], ['th', 'Thai'], ['id', 'Indonesian'], ['sv', 'Swedish'], ['da', 'Danish'],
  ['no', 'Norwegian'], ['fi', 'Finnish'], ['el', 'Greek'], ['he', 'Hebrew'], ['cs', 'Czech'], ['hu', 'Hungarian'], ['ro', 'Romanian'], ['tl', 'Tagalog'],
];
const $ = (id) => document.getElementById(id);
const els = { model: $('model'), source: $('source'), target: $('target'), toggle: $('toggle'), status: $('status'), statusText: $('statusText'), backend: $('backend'), lang: $('lang'), progress: $('progress'), latency: $('latency'), last: $('last'), warning: $('warning') };

for (const [code, name] of LANGS) {
  els.source.add(new Option(name, code));
  els.target.add(new Option(name, code));
}
els.target.value = 'en';

let tabId = null;
let stickyError = null; // set when START fails; only cleared by the next click
let pollTimer = null;
let busy = false;

const send = (msg) => chrome.runtime.sendMessage(msg);

function langName(code) { return (LANGS.find(([c]) => c === code) || [code, code])[1]; }

function render(s) {
  if (!s) return;
  const active = ['starting', 'loading', 'running'].includes(s.status);
  if (s.status === 'error') {
    setStatus('error', `Error: ${s.error}`);
  } else if (stickyError) {
    setStatus('error', `Error: ${stickyError}`);
  } else if (s.status === 'starting') {
    setStatus('starting', 'Starting capture…');
  } else if (s.status === 'loading') {
    setStatus('loading', `Loading model… ${s.progress != null ? s.progress + '%' : ''}`);
  } else if (s.status === 'running') {
    const backend = s.backend === 'webgpu' ? 'WebGPU' : s.backend === 'wasm' ? 'CPU (WASM)' : '…';
    const lang = s.lang ? `${langName(s.lang)} → ${langName(s.targetLang)}` : `listening… → ${langName(s.targetLang)}`;
    setStatus('running', `Captioning (${backend}) · ${lang}`);
  } else {
    setStatus('idle', 'Ready');
  }
  els.toggle.textContent = active ? 'Stop' : 'Start';
  els.toggle.classList.toggle('stop', active);
  els.toggle.disabled = busy;
  els.backend.textContent = s.backend === 'webgpu' ? 'WebGPU' : s.backend === 'wasm' ? 'CPU (WASM)' : '–';
  els.lang.textContent = s.lang ? `${langName(s.lang)}${s.langConf != null ? ` (${Math.round(s.langConf * 100)}%)` : ''}` : '–';
  els.progress.textContent = s.progress != null ? `${s.progress}%` : '–';
  const l = s.latency || {};
  els.latency.textContent = l.interimMedianMs != null || l.finalMedianMs != null ? `interim ${l.interimMedianMs ?? '–'} ms · final ${l.finalMedianMs ?? '–'} ms` : '–';
  els.last.textContent = s.lastCaption ? (s.lastCaption.translated ?? s.lastCaption.text) : '–';
  els.last.title = s.lastCaption ? s.lastCaption.text : '';
  const warnings = [];
  if (s.noAudio) warnings.push('No audio reaches the capture; DRM streams such as Netflix may block it.');
  if (s.lastError) warnings.push(s.lastError);
  els.warning.textContent = warnings.join(' ');
  els.warning.hidden = warnings.length === 0;
  for (const el of [els.model, els.source, els.target]) el.disabled = active;
}

function setStatus(cls, text) {
  els.status.className = cls;
  els.statusText.textContent = text;
}

async function refreshStatus() {
  try {
    const s = await send({ type: 'STATUS' });
    render(s);
  } catch (e) {
    setStatus('error', `Error: cannot reach the extension background (${e.message}). Reload the extension.`);
  }
}

async function onToggle() {
  if (busy) return;
  busy = true;
  els.toggle.disabled = true;
  try {
    const s = await send({ type: 'STATUS' });
    const active = ['starting', 'loading', 'running'].includes(s.status) && s.tabId === tabId;
    if (active) {
      await send({ type: 'STOP' });
      stickyError = null;
      await refreshStatus();
      return;
    }
    stickyError = null;
    if (s.status === 'error') await send({ type: 'CLEAR_ERROR' });
    if (tabId == null) { stickyError = 'No active tab found. Open the page you want to caption and try again.'; return; }
    const settings = { model: els.model.value, targetLang: els.target.value, sourceLang: els.source.value };
    chrome.storage.local.set({ settings }).catch(() => {});
    setStatus('starting', 'Starting capture…');
    const r = await send({ type: 'START', tabId, ...settings });
    if (!r?.ok) {
      stickyError = r?.error || 'Start failed without a message';
      setStatus('error', `Error: ${stickyError}`);
      return;
    }
  } catch (e) {
    stickyError = `${e.message}`;
    setStatus('error', `Error: ${stickyError}`);
  } finally {
    busy = false;
    els.toggle.disabled = false;
    // Re-render from the background but never let a failed START turn into "Ready".
    await refreshStatus();
  }
}

async function init() {
  try {
    const { settings } = await chrome.storage.local.get('settings');
    if (settings) {
      if (settings.model) els.model.value = settings.model;
      if (settings.sourceLang) els.source.value = settings.sourceLang;
      if (settings.targetLang) els.target.value = settings.targetLang;
    }
  } catch {}
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id ?? null;
  } catch (e) {
    setStatus('error', `Error: cannot read the active tab (${e.message})`);
  }
  els.toggle.addEventListener('click', onToggle);
  await refreshStatus();
  pollTimer = setInterval(refreshStatus, 500);
}

init();
