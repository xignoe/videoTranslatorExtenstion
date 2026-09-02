import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGoogleResponse, parseMyMemoryResponse, googleUrl, myMemoryUrl, createTranslator } from '../src/translator.js';

test('parses the Google gtx response shape', () => {
  const json = [[['A strong storm ', 'Una fuerte tormenta ', null, null, 3], ['is coming.', 'se acerca.', null, null, 3]], null, 'es'];
  assert.deepEqual(parseGoogleResponse(json), { text: 'A strong storm is coming.', detected: 'es' });
  assert.throws(() => parseGoogleResponse({ error: 1 }));
  assert.throws(() => parseGoogleResponse([[]]));
});

test('parses MyMemory responses and rejects its warning strings', () => {
  assert.deepEqual(parseMyMemoryResponse({ responseStatus: 200, responseData: { translatedText: 'Good evening.' } }), { text: 'Good evening.', detected: null });
  assert.throws(() => parseMyMemoryResponse({ responseStatus: 403, responseDetails: 'quota' }));
  assert.throws(() => parseMyMemoryResponse({ responseStatus: 200, responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS' } }));
});

test('builds URLs with mapped language codes', () => {
  const u = new URL(googleUrl('hola', 'es', 'zh'));
  assert.equal(u.searchParams.get('sl'), 'es');
  assert.equal(u.searchParams.get('tl'), 'zh-CN');
  assert.equal(u.searchParams.get('q'), 'hola');
  assert.equal(new URL(googleUrl('x', 'auto', 'en')).searchParams.get('sl'), 'auto');
  assert.equal(new URL(myMemoryUrl('x', 'ja', 'en')).searchParams.get('langpair'), 'ja|en');
});

function fakeFetch(handler) {
  return async (url, opts) => {
    const r = await handler(String(url), opts);
    if (r instanceof Error) throw r;
    return { ok: r.status ? r.status === 200 : true, status: r.status || 200, json: async () => r.json };
  };
}

test('falls back to MyMemory when Google fails, and caches', async () => {
  let calls = [];
  const tr = createTranslator({ fetchImpl: fakeFetch(async (url) => {
    calls.push(url);
    if (url.includes('googleapis')) return { status: 429, json: null };
    return { json: { responseStatus: 200, responseData: { translatedText: 'Good evening.' } } };
  }) });
  const r1 = await tr.translate('Buenas noches.', 'es', 'en');
  assert.deepEqual(r1, { text: 'Good evening.', provider: 'mymemory' });
  const r2 = await tr.translate('Buenas noches.', 'es', 'en');
  assert.equal(r2.text, 'Good evening.');
  assert.equal(calls.length, 2, 'second call served from cache');
});

test('same source and target language skips the network', async () => {
  const tr = createTranslator({ fetchImpl: fakeFetch(async () => { throw new Error('should not fetch'); }) });
  assert.deepEqual(await tr.translate('Hello', 'en', 'en'), { text: 'Hello', provider: 'none' });
});

test('times out slow providers', async () => {
  const tr = createTranslator({ timeoutMs: 20, fetchImpl: (url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  }) });
  await assert.rejects(() => tr.translate('Hola', 'es', 'en'), /google: aborted; mymemory: aborted/);
});
