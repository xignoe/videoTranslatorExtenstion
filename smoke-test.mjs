// Temporary smoke test (not part of the extension): verifies in Node the
// exact transformers.js calls used in offscreen/offscreen.js — model load,
// language detection, transcription — plus the live translation endpoint.
import { pipeline, Tensor } from '@huggingface/transformers';
import { translate } from './offscreen/translator.js';
import { cleanTranscript, isHallucination } from './offscreen/textFilters.js';

console.log('--- 1. Live translation (Google gtx endpoint) ---');
const translated = await translate(
  'Hola, ¿cómo estás? Espero que tengas un buen día. Este es un video sobre las noticias de hoy.',
  'en'
);
console.log('Translated:', JSON.stringify(translated));
if (!/how are you/i.test(translated)) throw new Error('Translation looks wrong');

console.log('--- 2. Whisper pipeline (same options as the extension WASM path) ---');
const asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', {
  dtype: 'q8'
});

const resp = await fetch(
  'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav'
);
const wav = Buffer.from(await resp.arrayBuffer());

// Minimal 16-bit PCM WAV parse (the extension itself decodes via Web Audio)
const channels = wav.readUInt16LE(22);
const sampleRate = wav.readUInt32LE(24);
const dataIndex = wav.indexOf(Buffer.from('data'), 36) + 8;
const pcm = new Int16Array(wav.buffer, wav.byteOffset + dataIndex, (wav.length - dataIndex) / 2);

// Downmix to mono, then linear-resample to 16kHz
const mono = new Float32Array(Math.floor(pcm.length / channels));
for (let i = 0; i < mono.length; i++) {
  let sum = 0;
  for (let c = 0; c < channels; c++) sum += pcm[i * channels + c];
  mono[i] = sum / channels / 32768;
}
const ratio = sampleRate / 16000;
const audio = new Float32Array(Math.floor(mono.length / ratio));
for (let i = 0; i < audio.length; i++) {
  const pos = i * ratio;
  const j = Math.floor(pos);
  const frac = pos - j;
  audio[i] = mono[j] * (1 - frac) + (mono[j + 1] ?? mono[j]) * frac;
}
console.log(`WAV: ${channels}ch ${sampleRate} Hz -> mono 16000 Hz, ${(audio.length / 16000).toFixed(1)}s`);

console.log('--- 3. Language detection (same code as detectLanguage()) ---');
const { model, processor } = asr;
const langToId = model.generation_config?.lang_to_id;
const startToken = model.generation_config?.decoder_start_token_id;
if (!langToId || startToken == null) throw new Error('lang_to_id/start token missing');
const inputs = await processor(audio);
const decoder_input_ids = new Tensor('int64', new BigInt64Array([BigInt(startToken)]), [1, 1]);
const { logits } = await model({ ...inputs, decoder_input_ids });
let bestToken = null;
let bestScore = -Infinity;
for (const [token, id] of Object.entries(langToId)) {
  const score = logits.data[id];
  if (score > bestScore) {
    bestScore = score;
    bestToken = token;
  }
}
const detected = bestToken.replace(/[<|>]/g, '');
console.log('Detected language:', detected);
if (detected !== 'en') throw new Error(`Expected 'en', got '${detected}'`);

console.log('--- 4. Transcription with detected language ---');
const output = await asr(audio, { task: 'transcribe', language: detected });
console.log('Transcript:', JSON.stringify(output.text));
const text = cleanTranscript(output.text);
if (!text || isHallucination(text)) throw new Error('Transcript empty or filtered');
if (!/ask not what your country/i.test(text)) throw new Error('Transcript looks wrong');

console.log('--- 5. End-to-end: transcript -> translated subtitle ---');
const subtitle = await translate(text, 'es');
console.log('Subtitle (es):', JSON.stringify(subtitle));

console.log('\nSMOKE TEST PASSED');
