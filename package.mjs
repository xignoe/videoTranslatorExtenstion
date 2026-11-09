// Packs the built extension/ folder into dist/video-translator-v<version>.zip with manifest.json
// at the zip root, so the extracted folder can be picked directly in "Load unpacked".
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const ext = path.join(root, 'extension');
const { version } = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));

const required = [
  'offscreen/offscreen.bundle.js', 'offscreen/worker.bundle.js',
  'vendor/ort-wasm-simd-threaded.asyncify.mjs', 'vendor/ort-wasm-simd-threaded.asyncify.wasm',
  'vendor/ort-wasm-simd-threaded.mjs', 'vendor/ort-wasm-simd-threaded.wasm',
];
const missing = required.filter((f) => !fs.existsSync(path.join(ext, f)));
if (missing.length) {
  console.error(`Not built yet (missing ${missing.join(', ')}). Run "npm run build" first.`);
  process.exit(1);
}

const dist = path.join(root, 'dist');
const zip = path.join(dist, `video-translator-v${version}.zip`);
fs.mkdirSync(dist, { recursive: true });
fs.rmSync(zip, { force: true });
if (process.platform === 'win32') {
  // bsdtar ships with Windows 10+ and writes zip when the name ends in .zip.
  execFileSync('tar', ['-a', '-c', '-f', zip, '-C', ext, '.'], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-r', '-q', '-X', zip, '.', '-x', '.DS_Store', '-x', '*/.DS_Store'], { cwd: ext, stdio: 'inherit' });
}
console.log(`${path.relative(root, zip)} (${(fs.statSync(zip).size / 1e6).toFixed(1)} MB)`);
