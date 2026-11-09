// End-to-end harness: real Chrome for Testing, real popup, real tab capture, real model.
// Usage: node e2e/run.mjs [--only=plain-en,feed] [--soak=600] [--skip-wasm] [--model=tiny]
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { serve } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT_DIR = fs.realpathSync(path.join(ROOT, 'extension'));
const OUT = path.join(ROOT, 'e2e', '.out');
const A = 'http://127.0.0.1:4801', B = 'http://localhost:4802';
const EXPECT_WORDS = ['storm', 'weather', 'budget', 'school', 'forecast'];

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const ONLY = args.only ? String(args.only).split(',') : null;
const SOAK = args.soak ? Number(args.soak) : 0;
const MODEL = args.model || 'base';
const SKIP_WASM = !!args['skip-wasm'];

// ---------- extension id: a-p encoding of sha256(realpath)[0:32] ----------
function extensionId(dir) {
  const hex = crypto.createHash('sha256').update(dir, 'utf8').digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}
const EXT_ID = extensionId(EXT_DIR);

// ---------- logging ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const logLines = [];
const streams = {};
function log(kind, text) {
  const line = `${new Date().toISOString().slice(11, 23)} [${kind}] ${text}`;
  logLines.push(line);
  if (logLines.length > 5000) logLines.shift();
  (streams[kind] ??= fs.createWriteStream(path.join(OUT, `${kind}.log`), { flags: 'a' })).write(line + '\n');
  if (kind === 'test') console.log(line);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- browser ----------
let browser = null, sw = null, swTarget = null, page = null, run = 0;
const attachedOffscreen = new Set();

// NOTE: the offscreen URL shows up twice: the document (Puppeteer type "background_page") and its
// AudioWorklet global scope (type "other"). Attaching a debugger to the worklet target pauses it forever.
const isOffscreenDoc = (t) => t.url().includes('offscreen/offscreen.html') && t.type() !== 'other';
async function attachOffscreen(target) {
  if (attachedOffscreen.has(target)) return;
  attachedOffscreen.add(target);
  try {
    const s = await target.createCDPSession();
    await s.send('Runtime.enable');
    s.on('Runtime.consoleAPICalled', (e) => log('offscreen', `${e.type}: ${e.args.map((a) => a.value ?? a.description ?? '').join(' ')}`));
    s.on('Runtime.exceptionThrown', (e) => log('offscreen', `EXCEPTION: ${e.exceptionDetails.exception?.description || e.exceptionDetails.text}`));
    log('test', `attached to offscreen document console (${target.url()})`);
  } catch (e) { log('test', `could not attach to offscreen target: ${e.message}`); }
}

function attachPage(p, kind) {
  p.on('console', (m) => log(kind, `${m.type()}: ${m.text()}`));
  p.on('pageerror', (e) => log(kind, `PAGEERROR: ${e.message}`));
}

async function launch({ wasm = false } = {}) {
  run++;
  const profile = path.join(ROOT, 'e2e', `.profile-${run}`);
  fs.rmSync(profile, { recursive: true, force: true });
  const chromeArgs = [
    `--allowlisted-extension-id=${EXT_ID}`,
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,900', '--no-first-run', '--no-default-browser-check',
  ];
  // Chrome 152: --disable-blink-features=WebGPU alone no longer removes the adapter (navigator.gpu
  // still returns one in pages and workers); disabling the WebGPU service is what makes
  // requestAdapter() return null and forces the WASM path.
  if (wasm) chromeArgs.push('--disable-blink-features=WebGPU', '--disable-features=WebGPUService');
  browser = await puppeteer.launch({ headless: false, enableExtensions: true, userDataDir: profile, args: chromeArgs, defaultViewport: null, protocolTimeout: 240000 });
  browser.on('targetcreated', (t) => { if (isOffscreenDoc(t)) attachOffscreen(t); });
  log('test', `launched Chrome ${await browser.version()} (wasm=${wasm}) profile=${path.basename(profile)}`);

  // The fixture tab is open BEFORE the extension is installed.
  page = (await browser.pages())[0] || (await browser.newPage());
  attachPage(page, 'page');
  for (let i = 0; ; i++) {
    try { await page.goto(`${A}/plain.html?clip=en`); break; }
    catch (e) { if (i >= 5) throw e; log('test', `initial goto retry: ${e.message}`); await sleep(500); }
  }
  await waitForMediaPlaying(page.mainFrame());

  const id = await browser.installExtension(EXT_DIR);
  if (id !== EXT_ID) throw new Error(`extension id mismatch: computed ${EXT_ID}, Chrome assigned ${id}`);
  log('test', `extension installed with id ${id} (matches sha256-derived id)`);
  await attachSw(await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith(`chrome-extension://${EXT_ID}`), { timeout: 20000 }));
  browser.on('disconnected', () => log('test', 'BROWSER DISCONNECTED (crash or closed)'));
  browser.on('targetdestroyed', (t) => { if (t.type() === 'page' || t.type() === 'service_worker') log('test', `target destroyed: ${t.type()} ${t.url()}`); });
  for (const t of browser.targets()) if (isOffscreenDoc(t)) attachOffscreen(t);
}

async function closeBrowser() {
  if (!browser) return;
  try { await browser.close(); } catch {}
  browser = null; sw = null; page = null;
}

// ---------- in-page helpers ----------
const FIND_MEDIA = `(() => { const out = []; const walk = (root) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') out.push(el); if (el.shadowRoot) walk(el.shadowRoot); } }; walk(document); return out; })`;

/** Media element present and loaded (it may have ended while the model downloaded). */
async function waitForMedia(frame, timeout = 15000) {
  await frame.waitForFunction(`(() => { const m = ${FIND_MEDIA}()[0]; return !!m && m.readyState >= 1; })()`, { timeout, polling: 100 });
}

async function waitForMediaPlaying(frame, timeout = 15000) {
  await frame.waitForFunction(`(() => { const m = ${FIND_MEDIA}().find((x) => !x.paused); return !!m && m.currentTime > 0.3; })()`, { timeout, polling: 100 });
}

/** Restarts the first unmuted media element and returns the wall-clock speech onset (+100 ms). */
async function lastUtteranceId() { const l = [...(await captionLog()), ...(await langLog())]; return l.length ? Math.max(...l.map((c) => c.utteranceId || 0)) : 0; }

/** First caption of a NEW utterance after `sinceT` (ignores late translations of earlier utterances). */
async function waitForNewUtterance(sinceT, prevUtt, timeout = 15000) {
  return waitForCaption(sinceT, timeout, (c) => (c.utteranceId || 0) > prevUtt && c.translated != null);
}

async function restartMedia(frame) {
  // Pause long enough for the current utterance to finalise (>= 0.5 s pause) so the first caption
  // after the restart is really the first caption of the new speech.
  await frame.evaluate(`(() => { const m = ${FIND_MEDIA}().find((x) => !x.muted) || ${FIND_MEDIA}()[0]; m.pause(); m.currentTime = 0; })()`);
  await sleep(1500);
  const t0 = Date.now();
  await frame.evaluate(`(async () => { const m = ${FIND_MEDIA}().find((x) => !x.muted) || ${FIND_MEDIA}()[0]; m.currentTime = 0; await m.play(); })()`);
  return t0 + 100;
}

const PROBE = `(() => {
  const host = document.querySelector('vt-caption');
  const videos = ${FIND_MEDIA}().filter((v) => v.tagName === 'VIDEO').map((v) => { const r = v.getBoundingClientRect(); return { id: v.id, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, paused: v.paused, muted: v.muted, currentTime: v.currentTime }; });
  const base = { vw: innerWidth, vh: innerHeight, fullscreen: !!document.fullscreenElement, pip: !!document.pictureInPictureElement, videos };
  if (!host) return { ...base, exists: false };
  const box = host.shadowRoot && host.shadowRoot.querySelector('.box');
  const hs = getComputedStyle(host), bs = box ? getComputedStyle(box) : null;
  const r = host.getBoundingClientRect();
  return { ...base, exists: true, text: box ? box.textContent : '', dataset: { ...host.dataset },
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
    visibility: hs.visibility, display: hs.display, opacity: parseFloat(hs.opacity) * (bs ? parseFloat(bs.opacity) : 1),
    fontSize: bs ? parseFloat(bs.fontSize) : 0, popoverOpen: host.matches(':popover-open') };
})()`;

const probe = (frame) => frame.evaluate(PROBE);
const isVisible = (s) => s && s.exists && s.visibility === 'visible' && s.display !== 'none' && !!s.text;

async function sampleOverlay(frame, ms, every = 500, until = null) {
  const samples = [];
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { samples.push(await probe(frame)); } catch (e) { samples.push({ exists: false, error: e.message }); }
    if (until && until(samples)) break;
    await sleep(every);
  }
  return samples;
}

// ---------- extension helpers ----------
async function attachSw(target) {
  swTarget = target;
  sw = await target.worker();
  sw.on('console', (m) => log('sw', `${m.type()}: ${m.text()}`));
  try {
    const s = await target.createCDPSession();
    await s.send('Runtime.enable');
    s.on('Runtime.exceptionThrown', (e) => log('sw', `EXCEPTION: ${e.exceptionDetails.exception?.description || e.exceptionDetails.text}`));
  } catch (e) { log('test', `sw exception hook failed: ${e.message}`); }
}

/** MV3 service workers are terminated after ~30 s idle; wake it and re-attach when that happened. */
async function ensureSw() {
  const alive = browser.targets().find((t) => t.type() === 'service_worker' && t.url().startsWith(`chrome-extension://${EXT_ID}`));
  if (alive && alive === swTarget) return sw;
  if (!alive) {
    log('test', 'service worker is gone (idle termination); waking it through popup.html in a tab');
    const p = await browser.newPage();
    await p.goto(`chrome-extension://${EXT_ID}/popup/popup.html`).catch(() => {});
    const t = await browser.waitForTarget((x) => x.type() === 'service_worker' && x.url().startsWith(`chrome-extension://${EXT_ID}`), { timeout: 15000 });
    await p.close().catch(() => {});
    await attachSw(t);
  } else {
    await attachSw(alive);
  }
  await page.bringToFront().catch(() => {});
  return sw;
}
const swEval = async (fn) => (await ensureSw()).evaluate(fn);
const badgeText = () => swEval(() => chrome.action.getBadgeText({ tabId: globalThis.__vt.session.tabId }));
const swStatus = () => swEval(() => globalThis.__vt.status());
const captionLog = () => swEval(() => globalThis.__vt.log());
const langLog = () => swEval(() => globalThis.__vt.langLog());

async function waitForCaption(sinceT, timeout = 15000, pred = () => true) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const l = await captionLog();
    const hit = l.find((c) => c.t >= sinceT && pred(c));
    if (hit) return hit;
    await sleep(150);
  }
  return null;
}

async function openPopup() {
  let t = browser.targets().find((x) => x.url().includes('popup/popup.html'));
  for (let attempt = 0; !t && attempt < 5; attempt++) {
    try {
      await swEval(async () => {
        const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
        const w = wins.find((x) => x.focused) || wins[0];
        await chrome.windows.update(w.id, { focused: true, drawAttention: true });
        await new Promise((r) => setTimeout(r, 250));
        await chrome.action.openPopup({ windowId: w.id });
      });
    } catch (e) { log('test', `openPopup() attempt ${attempt + 1}: ${e.message}`); }
    try { t = await browser.waitForTarget((x) => x.url().includes('popup/popup.html'), { timeout: 4000 }); } catch {}
  }
  if (!t) throw new Error('popup did not open after 5 attempts');
  let p = null;
  try { p = await t.page(); } catch {}
  if (!p) p = await t.asPage();
  if (!p.__attached) { p.__attached = true; attachPage(p, 'popup'); }
  await p.waitForSelector('#toggle', { timeout: 5000 });
  return p;
}

async function popupStatus(p) {
  return p.evaluate(() => ({ cls: document.getElementById('status').className, text: document.getElementById('statusText').textContent }));
}

/** Clicks Start in the real popup and waits for running/error. The popup may close when capture
 *  starts (Chrome re-layouts the toolbar); we reopen it and keep reading its status. */
const ACTIVE = ['starting', 'loading', 'running'];
async function startViaPopup({ model = MODEL, target = 'en', source = 'auto', timeout = 180000 } = {}) {
  let p = await openPopup();
  const before = await popupStatus(p);
  if (ACTIVE.includes(before.cls)) { log('test', `a session is already ${before.cls}; stopping it first`); await stopViaPopup(); p = await openPopup(); }
  else if (before.cls === 'error') { await swEval(() => globalThis.__vt.stop()); await sleep(600); }
  await p.select('#model', model);
  await p.select('#target', target);
  await p.select('#source', source);
  await p.click('#toggle');
  const end = Date.now() + timeout;
  let last = { cls: 'starting', text: '' };
  while (Date.now() < end) {
    try {
      if (p.isClosed()) p = await openPopup();
      last = await popupStatus(p);
      if (['running', 'error'].includes(last.cls)) break;
    } catch (e) {
      log('test', `popup read failed (${e.message.split('\n')[0]}); reopening`);
      await sleep(300);
      try { p = await openPopup(); } catch {}
    }
    await sleep(250);
  }
  log('test', `popup after Start: [${last.cls}] ${last.text}`);
  return { ...last, popup: p };
}

async function stopViaPopup() {
  let p = await openPopup();
  const { cls } = await popupStatus(p);
  if (cls === 'idle') return;
  if (cls === 'error') { await swEval(() => globalThis.__vt.stop()); log('test', 'popup was in error state; cleared'); return; }
  await p.click('#toggle');
  const end = Date.now() + 15000;
  let last = { cls, text: '' };
  while (Date.now() < end) {
    try { if (p.isClosed()) p = await openPopup(); last = await popupStatus(p); if (['idle', 'error'].includes(last.cls)) break; }
    catch { await sleep(300); try { p = await openPopup(); } catch {} }
    await sleep(250);
  }
  log('test', `popup after Stop: [${last.cls}] ${last.text}`);
}

async function gotoFixture(url) {
  await page.bringToFront();
  await page.goto(url, { waitUntil: 'load' });
  // The playing media may live in a child frame (iframe fixture).
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    for (const f of page.frames()) {
      const ok = await f.evaluate(`(() => { const m = ${FIND_MEDIA}().find((x) => !x.paused); return !!m && m.currentTime > 0.3; })()`).catch(() => false);
      if (ok) return;
    }
    await sleep(200);
  }
  throw new Error(`no playing media found in any frame of ${url}`);
}

// ---------- assertions ----------
class Check {
  constructor() { this.failures = []; this.notes = []; }
  ok(cond, msg) { if (!cond) this.failures.push(msg); return !!cond; }
  note(msg) { this.notes.push(msg); log('test', `  note: ${msg}`); }
}

function median(arr) { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); }
function latencyOf(log) {
  return {
    interim: median(log.filter((c) => c.kind === 'interim' && c.translated == null).map((c) => c.latencyMs)),
    final: median(log.filter((c) => c.kind === 'final' && c.translated == null).map((c) => c.latencyMs)),
    translated: median(log.filter((c) => c.translated != null).map((c) => c.latencyMs)),
  };
}
function maxGap(log, from, to) {
  const ts = log.filter((c) => c.translated != null).map((c) => c.t).filter((t) => t >= from && t <= to).sort((a, b) => a - b);
  let prev = from, gap = 0;
  for (const t of ts) { gap = Math.max(gap, t - prev); prev = t; }
  return { gap: Math.max(gap, to - prev), n: ts.length };
}
function wordsFound(log) {
  const text = log.map((c) => c.translated ?? '').join(' ').toLowerCase();
  return EXPECT_WORDS.filter((w) => text.includes(w));
}
function anchoredTo(s, v, tol = 2) {
  const cx = (s.rect.left + s.rect.right) / 2;
  return cx > v.left && cx < v.right && s.rect.bottom <= v.bottom + tol && s.rect.bottom > v.top && s.rect.top >= v.top - tol;
}
function checkOverlayStyle(c, samples, label) {
  const vis = samples.filter(isVisible);
  c.ok(vis.length >= 3, `${label}: overlay visible in ${vis.length} samples (need >= 3)`);
  for (const s of vis) {
    if (!c.ok(s.fontSize >= 12, `${label}: font-size ${s.fontSize}px < 12px`)) break;
    if (!c.ok(s.opacity > 0.9, `${label}: opacity ${s.opacity} <= 0.9`)) break;
    if (!c.ok(s.popoverOpen, `${label}: host is not an open popover (top layer)`)) break;
  }
  return vis;
}

// ---------- tests ----------
const results = [];
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

async function basicSession(c, url, { clip, expectLang, sampleMs = 22000, frameSel = null }) {
  await gotoFixture(url);
  const st = await startViaPopup();
  if (!c.ok(st.cls === 'running', `session did not reach running: [${st.cls}] ${st.text}`)) return null;
  const status = await swStatus();
  c.note(`backend=${status.backend}`);
  const badge = await badgeText();
  c.ok(badge === 'ON', `toolbar badge is "${badge}" while captioning, expected "ON"`);
  const frame = frameSel ? page.frames().find(frameSel) : page.mainFrame();
  await waitForMedia(frame);
  const prevUtt = await lastUtteranceId();
  const onset = await restartMedia(frame);
  const first = await waitForNewUtterance(onset, prevUtt, 15000);
  const firstMs = first ? first.t - onset : null;
  c.ok(first && firstMs <= 3000, `first caption ${firstMs ?? 'never'} ms after speech onset (limit 3000)`);
  const samples = await sampleOverlay(frame, sampleMs);
  const log = (await captionLog()).filter((x) => x.t >= onset);
  const { gap, n } = maxGap(log, onset + 3000, onset + Math.min(sampleMs, 25000));
  c.ok(gap <= 6000, `caption gap ${gap} ms > 6000 (${n} captions)`);
  const words = wordsFound(log);
  const needWords = sampleMs >= 15000 ? 2 : 1;
  c.ok(words.length >= needWords, `translated text contains ${words.length} expected words (${words.join(',') || 'none'}); need >= ${needWords}`);
  const langs = (await langLog()).filter((x) => x.t >= onset).map((x) => x.lang);
  const top = [...new Set(langs)].sort((a, b) => langs.filter((x) => x === b).length - langs.filter((x) => x === a).length)[0];
  if (expectLang) c.ok(top === expectLang, `detected language ${top} (windows: ${langs.join(',')}), expected ${expectLang}`);
  const st2 = await swStatus();
  c.note(`firstCaption=${firstMs}ms captions=${log.length} langs=${langs.join(',')} words=${words.join(',')} batches=${st2.batches} sinceSoundMs=${st2.sinceSoundMs} mediaPlaying=${st2.mediaPlaying} noAudio=${st2.noAudio} lastError=${st2.lastError}`);
  return { firstMs, samples, log, frame, status };
}

test('plain-en', async (c, r) => {
  const res = await basicSession(c, `${A}/plain.html?clip=en`, { expectLang: 'en' });
  if (!res) return;
  r.firstCaptionMs = res.firstMs;
  const vis = checkOverlayStyle(c, res.samples, 'hostile css');
  for (const s of vis) if (!c.ok(anchoredTo(s, s.videos[0]), `overlay not anchored to the video: overlay=${JSON.stringify(s.rect)} video=${JSON.stringify(s.videos[0])}`)) break;

  // Fullscreen on the <video> itself.
  await page.bringToFront();
  await page.click('#fs');
  await sleep(700);
  await restartMedia(page.mainFrame());
  const fsSamples = await sampleOverlay(page.mainFrame(), 7000);
  c.ok(fsSamples.some((s) => s.fullscreen), 'page entered fullscreen');
  const fsVis = fsSamples.filter((s) => s.fullscreen && isVisible(s));
  c.ok(fsVis.length >= 2, `captions visible during fullscreen (${fsVis.length} samples)`);
  for (const s of fsVis) if (!c.ok(s.popoverOpen && s.rect.bottom <= s.vh + 2 && s.rect.top >= 0, `fullscreen overlay off-screen: ${JSON.stringify(s.rect)} vh=${s.vh}`)) break;
  await page.evaluate(() => document.exitFullscreen().catch(() => {}));
  await sleep(500);

  // Picture-in-picture: native PiP window cannot be drawn into; the in-page bar must remain.
  await page.click('#pip');
  await sleep(700);
  const pipSamples = await sampleOverlay(page.mainFrame(), 5000);
  c.ok(pipSamples.some((s) => s.pip), 'page entered picture-in-picture');
  c.ok(pipSamples.some((s) => s.pip && isVisible(s)), 'in-page caption still rendered while in PiP');
  await page.evaluate(() => document.exitPictureInPicture().catch(() => {}));
});

test('plain-es', async (c, r) => {
  const res = await basicSession(c, `${A}/plain.html?clip=es`, { expectLang: 'es' });
  if (res) r.firstCaptionMs = res.firstMs;
});

test('plain-ja', async (c, r) => {
  const res = await basicSession(c, `${A}/plain.html?clip=ja`, { expectLang: 'ja' });
  if (res) r.firstCaptionMs = res.firstMs;
});

test('mixed-language', async (c, r) => {
  await gotoFixture(`${A}/plain.html?clip=mixed`);
  const st = await startViaPopup();
  if (!c.ok(st.cls === 'running', `session did not reach running: ${st.text}`)) return;
  const prevUtt = await lastUtteranceId();
  const onset = await restartMedia(page.mainFrame());
  const first = await waitForNewUtterance(onset, prevUtt, 15000);
  r.firstCaptionMs = first ? first.t - onset : null;
  // en (27.7 s) > es (36 s) > ja: wait until ja has been detected or 100 s elapsed.
  const deadline = Date.now() + 100000;
  let seq = [];
  while (Date.now() < deadline) {
    const langs = (await langLog()).filter((x) => x.t >= onset).map((x) => x.lang);
    seq = langs.filter((l, i) => i === 0 || langs[i - 1] !== l);
    if (seq.includes('ja') && seq.indexOf('ja') > seq.indexOf('es') && langs.filter((x) => x === 'ja').length >= 2) break;
    await sleep(1000);
  }
  const order = ['en', 'es', 'ja'];
  let pos = 0;
  for (const l of seq) if (l === order[pos]) pos++;
  c.ok(pos === 3, `expected en > es > ja in order, got ${seq.join(' > ')}`);
  c.note(`language sequence: ${seq.join(' > ')}`);
});

test('shadow-dom', async (c, r) => {
  const res = await basicSession(c, `${A}/shadow.html?clip=en`, { expectLang: 'en' });
  if (!res) return;
  r.firstCaptionMs = res.firstMs;
  const vis = checkOverlayStyle(c, res.samples, 'shadow');
  for (const s of vis) if (!c.ok(anchoredTo(s, s.videos[0]), `overlay not anchored to the shadow-root video: ${JSON.stringify(s.rect)} vs ${JSON.stringify(s.videos[0])}`)) break;
});

test('cross-origin-iframe', async (c, r) => {
  const res = await basicSession(c, `${A}/iframe.html?clip=en`, { expectLang: 'en', frameSel: (f) => f.url().startsWith(B) });
  if (!res) return;
  r.firstCaptionMs = res.firstMs;
  const vis = checkOverlayStyle(c, res.samples, 'iframe');
  for (const s of vis) if (!c.ok(anchoredTo(s, s.videos[0]), `overlay inside the child frame not anchored to its video: ${JSON.stringify(s.rect)} vs ${JSON.stringify(s.videos[0])}`)) break;
  const top = await probe(page.mainFrame());
  c.ok(!isVisible(top), `top frame must not show a caption (got "${top.text}")`);
});

test('audio-only', async (c, r) => {
  const res = await basicSession(c, `${A}/audio.html?clip=en`, { expectLang: 'en' });
  if (!res) return;
  r.firstCaptionMs = res.firstMs;
  const vis = checkOverlayStyle(c, res.samples, 'audio');
  for (const s of vis) {
    if (!c.ok(s.dataset.fallback === '1', 'caption should use the fallback bottom bar')) break;
    if (!c.ok(Math.abs(s.rect.bottom - s.vh) <= 2 && s.rect.width >= s.vw - 2, `bottom bar geometry wrong: ${JSON.stringify(s.rect)} vw=${s.vw} vh=${s.vh}`)) break;
  }
});

test('feed-three-videos', async (c, r) => {
  const res = await basicSession(c, `${A}/feed.html?clip=en`, { expectLang: 'en' });
  if (!res) return;
  r.firstCaptionMs = res.firstMs;
  const vis = checkOverlayStyle(c, res.samples, 'feed');
  for (const s of vis) {
    const v2 = s.videos.find((v) => v.id === 'v2');
    if (!c.ok(v2 && anchoredTo(s, v2), `overlay not anchored to the unmuted middle video: ${JSON.stringify(s.rect)} vs ${JSON.stringify(v2)}`)) break;
  }
});

test('spa-and-navigation', async (c, r) => {
  const res = await basicSession(c, `${A}/spa.html?clip=en&clip2=es`, { expectLang: 'en', sampleMs: 8000 });
  if (!res) return;
  r.firstCaptionMs = res.firstMs;
  // pushState swap of the whole player.
  const tSwap = Date.now();
  await page.evaluate(() => window.gotoStage(2));
  await waitForMediaPlaying(page.mainFrame());
  const swapSamples = await sampleOverlay(page.mainFrame(), 15000, 500, (ss) => { const s = ss.at(-1); return isVisible(s) && s.videos.find((v) => v.id === 'v2') && anchoredTo(s, s.videos.find((v) => v.id === 'v2')); });
  const okSwap = swapSamples.some((s) => isVisible(s) && s.videos.find((v) => v.id === 'v2') && anchoredTo(s, s.videos.find((v) => v.id === 'v2')));
  c.ok(okSwap, 'captions did not re-anchor to the pushState-swapped player within 15 s');
  c.ok((await captionLog()).some((x) => x.t > tSwap), 'no captions after the pushState swap');
  // Full navigation of the captured tab.
  const tNav = Date.now();
  await page.goto(`${A}/plain.html?clip=es`, { waitUntil: 'load' });
  await waitForMediaPlaying(page.mainFrame());
  const after = await waitForCaption(tNav + 500, 20000);
  c.ok(!!after, 'no caption within 20 s after a full page navigation');
  const navSamples = await sampleOverlay(page.mainFrame(), 6000);
  const vis = checkOverlayStyle(c, navSamples, 'after navigation');
  for (const s of vis) if (!c.ok(anchoredTo(s, s.videos[0]), 'overlay not anchored after navigation')) break;
  c.ok((await swStatus()).status === 'running', 'session should still be running after navigation (no restart)');
  const badge = await badgeText();
  c.ok(badge === 'ON', `toolbar badge is "${badge}" after navigation, expected "ON"`);
});

test('chrome-url-error', async (c) => {
  const p2 = await browser.newPage();
  attachPage(p2, 'page');
  await p2.goto('chrome://version');
  await p2.bringToFront();
  const popup = await openPopup();
  await popup.click('#toggle');
  await popup.waitForFunction(() => ['error', 'running'].includes(document.getElementById('status').className), { timeout: 20000, polling: 200 });
  const text = await popup.$eval('#statusText', (el) => el.textContent);
  c.ok(/chrome:\/\//.test(text), `expected a specific chrome:// error, got: ${text}`);
  c.note(`popup said: ${text}`);
  // The error must survive the popup's periodic refresh.
  await sleep(1500);
  const cls = await popup.$eval('#status', (el) => el.className);
  c.ok(cls === 'error', `error was overwritten by refreshStatus (status class now "${cls}")`);
  await p2.close();
  await page.bringToFront();
});

test('stop-cleans-up', async (c) => {
  await gotoFixture(`${A}/iframe.html?clip=en`);
  const st = await startViaPopup();
  if (!c.ok(st.cls === 'running', `session did not reach running: ${st.text}`)) return;
  const child = page.frames().find((f) => f.url().startsWith(B));
  await waitForCaption(Date.now(), 15000);
  await sleep(1500);
  await swEval(() => { globalThis.__vtLastTab = globalThis.__vt.session.tabId; });
  await stopViaPopup();
  const badge = await swEval(() => chrome.action.getBadgeText({ tabId: globalThis.__vtLastTab }));
  c.ok(badge === '', `toolbar badge is "${badge}" after Stop, expected none`);
  await sleep(500);
  for (const f of [page.mainFrame(), child]) {
    const has = await f.evaluate(() => !!document.querySelector('vt-caption'));
    c.ok(!has, `overlay still present in frame ${f.url()} after Stop`);
  }
  const captured = await swEval(() => chrome.tabCapture.getCapturedTabs());
  c.ok(!captured.some((t) => t.status === 'active'), `tabCapture still active: ${JSON.stringify(captured)}`);
  c.note(`getCapturedTabs: ${JSON.stringify(captured)}`);
});

test('wasm-backend', async (c, r) => {
  await closeBrowser();
  await launch({ wasm: true });
  await gotoFixture(`${A}/plain.html?clip=en`);
  const st = await startViaPopup();
  if (!c.ok(st.cls === 'running', `session did not reach running: ${st.text}`)) return;
  const status = await swStatus();
  c.ok(status.backend === 'wasm', `backend should be wasm, got ${status.backend}`);
  c.ok(/CPU/.test(st.text), `popup should mention CPU, got: ${st.text}`);
  const prevUtt = await lastUtteranceId();
  const onset = await restartMedia(page.mainFrame());
  const first = await waitForNewUtterance(onset, prevUtt, 20000);
  r.firstCaptionMs = first ? first.t - onset : null;
  c.ok(!!first, 'no caption on the WASM path');
  const samples = await sampleOverlay(page.mainFrame(), 20000);
  const log = (await captionLog()).filter((x) => x.t >= onset);
  const words = wordsFound(log);
  c.ok(words.length >= 1, `WASM path translated text contains ${words.length} expected words`);
  checkOverlayStyle(c, samples, 'wasm');
  c.note(`firstCaption=${r.firstCaptionMs}ms captions=${log.length} words=${words.join(',')} inferMs=${(await langLog()).slice(-5).map((x) => x.inferMs).join('/')}`);
}, { wasm: true });

if (SOAK > 0) test('soak', async (c) => {
  await gotoFixture(`${A}/plain.html?clip=mixed`);
  await page.evaluate(() => { const v = document.querySelector('video'); v.loop = true; });
  const st = await startViaPopup();
  if (!c.ok(st.cls === 'running', `session did not reach running: ${st.text}`)) return;
  const t0 = Date.now();
  await sleep(SOAK * 1000);
  const log = (await captionLog()).filter((x) => x.t >= t0);
  const { gap, n } = maxGap(log, t0 + 5000, Date.now());
  c.ok(gap <= 10000, `soak: caption gap ${gap} ms > 10000 (${n} captions in ${SOAK} s)`);
  c.ok((await swStatus()).status === 'running', 'session died during soak');
  c.note(`soak captions=${n} maxGap=${gap}ms`);
});

// ---------- runner ----------
function dumpLogs() {
  console.log('---- last 120 log lines ----');
  for (const l of logLines.slice(-120)) console.log(l);
  console.log('---- (full logs in e2e/.out/) ----');
}

async function main() {
  const servers = [await serve(4801, '127.0.0.1'), await serve(4802, 'localhost')];
  log('test', `fixtures on ${A} and ${B}; extension id ${EXT_ID}`);
  let failed = 0;
  try {
    await launch({ wasm: false });
    for (const t of tests) {
      if (ONLY && !ONLY.includes(t.name)) continue;
      if (t.name === 'wasm-backend' && SKIP_WASM) continue;
      const c = new Check();
      const r = { name: t.name, pass: false, firstCaptionMs: null, latency: {}, notes: [] };
      const t0 = Date.now();
      log('test', `=== ${t.name} ===`);
      try {
        await t.fn(c, r);
      } catch (e) {
        c.failures.push(`exception: ${e.stack || e.message}`);
      }
      try {
        const l = await captionLog();
        r.latency = latencyOf(l);
        r.backend = (await swStatus()).backend;
      } catch {}
      try { await stopViaPopup(); } catch (e) { log('test', `stop after test failed: ${e.message}`); }
      r.pass = c.failures.length === 0;
      r.notes = c.notes; r.failures = c.failures; r.ms = Date.now() - t0;
      results.push(r);
      if (!r.pass) { failed++; log('test', `FAIL ${t.name}:\n  - ${c.failures.join('\n  - ')}`); dumpLogs(); }
      else log('test', `PASS ${t.name} (${Math.round(r.ms / 1000)} s)`);
    }
  } catch (e) {
    console.error('harness error:', e);
    failed++;
    dumpLogs();
  } finally {
    await closeBrowser();
    for (const s of servers) s.close();
  }
  // Summary
  const rows = results.map((r) => ({ test: r.name, pass: r.pass ? 'PASS' : 'FAIL', backend: r.backend || '', firstCaptionMs: r.firstCaptionMs ?? '', interimMs: r.latency.interim ?? '', finalMs: r.latency.final ?? '', translatedMs: r.latency.translated ?? '', seconds: Math.round(r.ms / 1000) }));
  console.log('\nSummary (latency = median of latencyMs in caption messages: now - capture time of the window\'s last sample)');
  console.table(rows);
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(results, null, 2));
  for (const s of Object.values(streams)) s.end();
  process.exit(failed ? 1 : 0);
}

main();
