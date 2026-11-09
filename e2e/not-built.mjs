// Loads a copy of extension/ without the generated files (what "Code > Download ZIP" gives you)
// and checks that the popup explains the problem instead of failing with a timeout on Start.
// Usage: node e2e/not-built.mjs
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-not-built-'));
const ext = path.join(tmp, 'extension');
fs.cpSync(path.join(ROOT, 'extension'), ext, {
  recursive: true,
  filter: (src) => !src.endsWith('.bundle.js') && path.basename(src) !== 'vendor',
});

const failures = [];
const ok = (cond, message) => { if (!cond) failures.push(message); };

const browser = await puppeteer.launch({ headless: true, enableExtensions: true, userDataDir: path.join(tmp, 'profile'), args: ['--no-first-run'] });
try {
  const id = await browser.installExtension(ext);
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${id}/popup/popup.html`);
  await page.waitForFunction(() => !document.getElementById('setup').hidden, { timeout: 10000 }).catch(() => {});
  const ui = await page.evaluate(() => ({
    setupShown: !document.getElementById('setup').hidden,
    setupText: document.getElementById('setup').textContent,
    startDisabled: document.getElementById('toggle').disabled,
    statusClass: document.getElementById('status').className,
  }));
  ok(ui.setupShown, 'the "not built yet" note is not shown');
  ok(/npm run build/.test(ui.setupText) && /Releases page/.test(ui.setupText), `the note does not say how to fix it: ${ui.setupText}`);
  ok(ui.startDisabled, 'Start is still enabled');
  ok(ui.statusClass === 'error', `status class is "${ui.statusClass}", expected "error"`);

  // A START that reaches the background anyway must fail with the same explanation.
  const res = await page.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.runtime.sendMessage({ type: 'START', tabId: tab.id, model: 'base', targetLang: 'en', sourceLang: 'auto' });
  });
  ok(res && res.ok === false && /not built/i.test(res.error || ''), `START answered ${JSON.stringify(res)}`);
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) { console.error(`FAIL not-built:\n  - ${failures.join('\n  - ')}`); process.exit(1); }
console.log('PASS not-built');
