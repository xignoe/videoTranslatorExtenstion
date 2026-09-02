import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterText, isHallucination, collapseRepeats, normalizeText } from '../src/textFilters.js';

test('normalizeText collapses whitespace', () => {
  assert.equal(normalizeText('  a \n b\t c '), 'a b c');
});

test('known Whisper hallucinations are dropped', () => {
  for (const t of ['Thank you.', 'Thanks for watching!', 'ご視聴ありがとうございました', '[Music]', '(applause)', 'Subtitles by the Amara.org community', '', '...', 'you']) {
    assert.equal(isHallucination(t), true, `should drop: ${t}`);
    assert.equal(filterText(t), '', `filterText should empty: ${t}`);
  }
});

test('real speech passes through', () => {
  const t = 'A powerful storm is moving across the northern coast tonight.';
  assert.equal(isHallucination(t), false);
  assert.equal(filterText(t), t);
  assert.equal(filterText('Una fuerte tormenta avanza esta noche.'), 'Una fuerte tormenta avanza esta noche.');
  assert.equal(filterText('今夜、強い嵐が北の海岸を通過しています。'), '今夜、強い嵐が北の海岸を通過しています。');
});

test('repetition loops are collapsed', () => {
  assert.deepEqual(collapseRepeats('the the the the storm'), { text: 'the storm', collapsed: true });
  assert.equal(collapseRepeats('I said I said I said I said hello').text, 'I said hello');
  assert.equal(collapseRepeats('ありがとうありがとうありがとうありがとう').text, 'ありがとう');
  assert.equal(collapseRepeats('one two one two').collapsed, false, 'two repeats are fine');
});

test('a window that is only a repetition loop is a hallucination', () => {
  assert.equal(isHallucination('so so so so so so so so so so'), true);
  assert.equal(filterText('The forecast calls for rain. rain. rain. rain. rain. rain.'), 'The forecast calls for rain.');
});

test('trailing sign-off is stripped from real speech', () => {
  assert.equal(filterText('The council approved the budget. Thanks for watching.'), 'The council approved the budget.');
});
