// Builds the two bundles (offscreen document + inference Worker) and copies the ORT wasm files.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: on Windows the latter yields "/C:/..." with %20 for spaces.
const root = path.dirname(fileURLToPath(import.meta.url));
const vendorSrc = path.join(root, 'node_modules/onnxruntime-web/dist');
const vendorDst = path.join(root, 'extension/vendor');

await esbuild.build({
  entryPoints: {
    'offscreen.bundle': path.join(root, 'src/offscreen.js'),
    'worker.bundle': path.join(root, 'src/worker.js'),
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome128',
  outdir: path.join(root, 'extension/offscreen'),
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
});

fs.mkdirSync(vendorDst, { recursive: true });
for (const f of [
  'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm',
]) {
  fs.copyFileSync(path.join(vendorSrc, f), path.join(vendorDst, f));
}
console.log('vendor files copied:', fs.readdirSync(vendorDst).join(', '));
