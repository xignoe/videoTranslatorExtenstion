import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTranscript, isHallucination } from '../offscreen/textFilters.js';

test('cleanTranscript strips sound-effect tags', () => {
  assert.equal(cleanTranscript(' [Music]  Hello there  (laughs) '), 'Hello there');
  assert.equal(cleanTranscript('♪ la la la ♪ welcome back'), 'welcome back');
});

test('cleanTranscript handles empty input', () => {
  assert.equal(cleanTranscript(''), '');
  assert.equal(cleanTranscript(undefined), '');
  assert.equal(cleanTranscript('[Music]'), '');
});

test('isHallucination catches common Whisper artifacts', () => {
  assert.equal(isHallucination('Thank you.'), true);
  assert.equal(isHallucination('Thanks for watching!'), true);
  assert.equal(isHallucination('you'), true);
  assert.equal(isHallucination('you you you you you'), true);
  assert.equal(isHallucination(''), true);
});

test('isHallucination passes real speech', () => {
  assert.equal(isHallucination('The weather today is sunny with a chance of rain.'), false);
  assert.equal(isHallucination('Hola, ¿cómo estás?'), false);
  assert.equal(isHallucination('Thank you for joining us today to talk about the economy.'), false);
});
