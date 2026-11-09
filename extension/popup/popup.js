// Popup: settings, Start/Stop, status. Every failure shows a specific message and a failed
// START is never overwritten by the periodic status refresh.
const LANGS = [
  ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'],
  ['ru', 'Russian'], ['uk', 'Ukrainian'], ['pl', 'Polish'], ['tr', 'Turkish'], ['ar', 'Arabic'], ['hi', 'Hindi'], ['zh', 'Chinese'],
  ['ja', 'Japanese'], ['ko', 'Korean'], ['vi', 'Vietnamese'], ['th', 'Thai'], ['id', 'Indonesian'], ['sv', 'Swedish'], ['da', 'Danish'],
  ['no', 'Norwegian'], ['fi', 'Finnish'], ['el', 'Greek'], ['he', 'Hebrew'], ['cs', 'Czech'], ['hu', 'Hungarian'], ['ro', 'Romanian'], ['tl', 'Tagalog'],
];
// Browser UI codes that differ from the codes above.
const UI_LANG_ALIASES = { nb: 'no', nn: 'no', iw: 'he', fil: 'tl', in: 'id' };
const ACTIVE = ['starting', 'loading', 'running'];
const $ = (id) => document.getElementById(id);
const els = { model: $('model'), source: $('source'), target: $('target'), toggle: $('toggle'), status: $('status'), statusText: $('statusText'), backend: $('backend'), lang: $('lang'), progress: $('progress'), latency: $('latency'), last: $('last'), warning: $('warning'), hint: $('hint'), setup: $('setup') };

for (const [code, name] of LANGS) {
  els.source.add(new Option(name, code));
  els.target.add(new Option(name, code));
}
els.target.value = browserLanguage();

let tabId = null;
let stickyError = null; // set when START fails; only cleared by the next click
let pollTimer = null;
let busy = false;

const send = (msg) => chrome.runtime.sendMessage(msg);

function langName(code) { return (LANGS.find(([c]) => c === code) || [code, code])[1]; }

/** The browser's own language when captions can be shown in it, otherwise English. */
function browserLanguage() {
  let ui = 'en';
  try { ui = (chrome.i18n.getUILanguage() || 'en').toLowerCase().split(/[-_]/)[0]; } catch {}
  ui = UI_LANG_ALIASES[ui] || ui;
  return LANGS.some(([c]) => c === ui) ? ui : 'en';
}

function render(s) {
  if (!s) return;
  const active = ACTIVE.includes(s.status);
  const here = active && s.tabId === tabId;
  let hint = '';
  if (s.needsBuild) {
    setStatus('error', 'Not ready to run yet. See the note above.');
  } else if (s.status === 'error') {
    setStatus('error', s.error);
  } else if (stickyError) {
    setStatus('error', stickyError);
  } else if (active && !here) {
    setStatus('running', 'Captioning another tab.');
  } else if (s.status === 'starting') {
    setStatus('starting', 'Starting…');
  } else if (s.status === 'loading') {
    setStatus('loading', `Getting the speech model ready… ${s.progress != null ? s.progress + '%' : ''}`);
    const mb = s.progressTotal ? ` (about ${Math.max(1, Math.round(s.progressTotal / 1e6))} MB)` : '';
    hint = `The speech model downloads once${mb} and is saved for next time.`;
  } else if (s.status === 'running') {
    const mode = s.backend === 'wasm' ? ' in CPU mode (slower)' : '';
    const what = s.lang ? `${langName(s.lang)} → ${langName(s.targetLang)}` : 'waiting for speech';
    setStatus('running', `Captioning${mode} · ${what}`);
  } else {
    setStatus('idle', 'Ready. Play something with speech, then press Start captions.');
  }
  els.setup.hidden = !s.needsBuild;
  els.hint.textContent = hint;
  els.hint.hidden = !hint;
  els.toggle.textContent = here ? 'Stop captions' : active ? 'Caption this tab instead' : 'Start captions';
  els.toggle.classList.toggle('stop', here);
  els.toggle.disabled = busy || !!s.needsBuild;
  els.backend.textContent = s.backend === 'webgpu' ? 'GPU (WebGPU)' : s.backend === 'wasm' ? 'CPU (WASM)' : '–';
  els.lang.textContent = s.lang ? `${langName(s.lang)}${s.langConf != null ? ` (${Math.round(s.langConf * 100)}%)` : ''}` : '–';
  els.progress.textContent = s.progress != null ? (s.progress >= 100 ? 'Ready' : `${s.progress}%`) : '–';
  const l = s.latency || {};
  els.latency.textContent = l.translatedMedianMs != null ? `about ${(l.translatedMedianMs / 1000).toFixed(1)} s` : '–';
  els.latency.title = l.interimMedianMs != null || l.finalMedianMs != null ? `recognition: interim ${l.interimMedianMs ?? '–'} ms · final ${l.finalMedianMs ?? '–'} ms` : '';
  els.last.textContent = s.lastCaption ? (s.lastCaption.translated ?? s.lastCaption.text) : '–';
  els.last.title = s.lastCaption ? s.lastCaption.text : '';
  const warnings = [];
  if (s.noAudio) warnings.push('No sound is reaching the translator. Check that the tab is not muted. Protected streams such as Netflix cannot be captioned.');
  if (s.lastError) warnings.push(s.lastError);
  els.warning.textContent = warnings.join(' ');
  els.warning.hidden = warnings.length === 0;
  for (const el of [els.model, els.source, els.target]) el.disabled = here;
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
    setStatus('error', `Cannot reach the extension (${e.message}). Reload it from the extensions page.`);
  }
}

async function onToggle() {
  if (busy) return;
  busy = true;
  els.toggle.disabled = true;
  try {
    const s = await send({ type: 'STATUS' });
    const active = ACTIVE.includes(s.status) && s.tabId === tabId;
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
    setStatus('starting', 'Starting…');
    const r = await send({ type: 'START', tabId, ...settings });
    if (!r?.ok) {
      stickyError = r?.error || 'Start failed without a message';
      setStatus('error', stickyError);
      return;
    }
  } catch (e) {
    stickyError = `${e.message}`;
    setStatus('error', stickyError);
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
    setStatus('error', `Cannot read the active tab (${e.message})`);
  }
  els.toggle.addEventListener('click', onToggle);
  await refreshStatus();
  pollTimer = setInterval(refreshStatus, 500);
}

init();
