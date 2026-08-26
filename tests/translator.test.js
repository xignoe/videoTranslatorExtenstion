import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGoogleTranslateResponse, parseMyMemoryResponse } from '../offscreen/translator.js';

test('joins all translated segments, not just the first', () => {
  const response = [
    [
      ['Hello, how are you? ', 'Hola, ¿cómo estás? ', null, null],
      ['I am fine.', 'Estoy bien.', null, null]
    ],
    null,
    'es'
  ];
  assert.equal(parseGoogleTranslateResponse(response), 'Hello, how are you? I am fine.');
});

test('throws on unexpected response shapes', () => {
  assert.throws(() => parseGoogleTranslateResponse(null));
  assert.throws(() => parseGoogleTranslateResponse({}));
  assert.throws(() => parseGoogleTranslateResponse(['nope']));
});

test('parses a MyMemory response', () => {
  const response = {
    responseStatus: 200,
    responseData: { translatedText: 'hello world ', match: 0.99 }
  };
  assert.equal(parseMyMemoryResponse(response), 'hello world');
});

test('rejects MyMemory errors and quota warnings', () => {
  assert.throws(() => parseMyMemoryResponse(null));
  assert.throws(() => parseMyMemoryResponse({ responseStatus: 403, responseDetails: 'nope' }));
  assert.throws(() =>
    parseMyMemoryResponse({
      responseStatus: 200,
      responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS' }
    })
  );
});
