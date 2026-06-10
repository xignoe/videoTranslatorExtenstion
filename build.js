/**
 * Build: bundle the offscreen pipeline (transformers.js is an npm dep)
 * and copy ONNX Runtime's wasm assets into vendor/ so nothing loads
 * from a CDN at runtime.
 *
 * After this runs, the repo root is loadable as an unpacked extension.
 */
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

await esbuild.build({
  entryPoints: ['offscreen/offscreen.js'],
  bundle: true,
  format: 'esm',
  outfile: 'offscreen/offscreen.bundle.js',
  target: ['chrome121'],
  minify: true,
  logLevel: 'info'
});

const dist = 'node_modules/@huggingface/transformers/dist';
mkdirSync('vendor', { recursive: true });
let copied = 0;
for (const file of readdirSync(dist)) {
  if (/^ort-.*\.(wasm|mjs)$/.test(file)) {
    copyFileSync(join(dist, file), join('vendor', file));
    copied++;
  }
}
console.log(`Copied ${copied} ONNX Runtime assets to vendor/`);
console.log('Build complete. Load this folder as an unpacked extension.');
