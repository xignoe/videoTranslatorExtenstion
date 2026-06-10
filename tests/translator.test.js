import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGoogleTranslateResponse } from '../offscreen/translator.js';

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
