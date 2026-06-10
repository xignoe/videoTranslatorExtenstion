import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTranscript, isHallucination, hasRepetitionLoop } from '../offscreen/textFilters.js';

test('hasRepetitionLoop catches repeated-phrase decoder loops', () => {
  assert.equal(hasRepetitionLoop('buy now buy now buy now buy now buy now'), true);
  assert.equal(hasRepetitionLoop('そうです そうです そうです そうです'), true);
  assert.equal(hasRepetitionLoop('はいはいはいはいはいはいはい'), true);
  assert.equal(isHallucination('buy now buy now buy now buy now buy now'), true);
});

test('hasRepetitionLoop passes normal speech with natural repeats', () => {
  assert.equal(hasRepetitionLoop('The weather is nice today, really nice weather.'), false);
  assert.equal(hasRepetitionLoop('今日は東京の天気についてお話しします'), false);
  assert.equal(hasRepetitionLoop('No, no, I really mean it — listen to the whole story first.'), false);
});

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

test('isHallucination catches non-English Whisper artifacts', () => {
  assert.equal(isHallucination('ご視聴ありがとうございました'), true);
  assert.equal(isHallucination('ご視聴いただきありがとうございました!'), true);
  assert.equal(isHallucination('チャンネル登録よろしくお願いします!'), true);
  assert.equal(isHallucination('시청해 주셔서 감사합니다'), true);
  assert.equal(isHallucination('谢谢观看'), true);
  assert.equal(isHallucination('Subtítulos realizados por la comunidad de Amara.org'), true);
});

test('isHallucination passes real speech', () => {
  assert.equal(isHallucination('The weather today is sunny with a chance of rain.'), false);
  assert.equal(isHallucination('Hola, ¿cómo estás?'), false);
  assert.equal(isHallucination('Thank you for joining us today to talk about the economy.'), false);
  assert.equal(isHallucination('今日は東京の天気についてお話しします'), false);
  assert.equal(isHallucination('午後から雨が降るそうなので、傘を忘れないでください'), false);
});
