import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeText, stripOverlap, overlapLength, tokenize } from '../src/merge.js';

test('mergeText removes suffix/prefix word overlap', () => {
  assert.equal(
    mergeText('the weather service has issued a severe warning', 'a severe warning for the whole region'),
    'the weather service has issued a severe warning for the whole region');
});

test('mergeText is case and punctuation insensitive on the overlap', () => {
  assert.equal(mergeText('Heavy rain and strong wind.', 'strong wind until tomorrow morning.'),
    'Heavy rain and strong wind. until tomorrow morning.');
});

test('mergeText with no overlap simply concatenates', () => {
  assert.equal(mergeText('Good evening.', 'A storm is coming.'), 'Good evening. A storm is coming.');
  assert.equal(mergeText('', 'A storm'), 'A storm');
  assert.equal(mergeText('A storm', ''), 'A storm');
});

test('mergeText ignores a trivial one-letter overlap', () => {
  assert.equal(mergeText('I saw a', 'a big storm'), 'I saw a a big storm');
  assert.equal(mergeText('across the coast', 'coast tonight'), 'across the coast tonight');
});

test('next fully contained in prev yields prev', () => {
  assert.equal(mergeText('the city council approved a new budget', 'a new budget'), 'the city council approved a new budget');
});

test('stripOverlap returns the new remainder only', () => {
  assert.equal(stripOverlap('funding for every public school', 'every public school in the district'), 'in the district');
  assert.equal(stripOverlap('', 'hello there'), 'hello there');
});

test('CJK text without spaces merges by characters', () => {
  assert.equal(mergeText('今夜、強い嵐が北の海岸を', '北の海岸を通過しており'), '今夜、強い嵐が北の海岸を通過しており');
  assert.deepEqual(tokenize('嵐が').units, ['嵐', 'が']);
});

test('overlapLength caps at maxLen', () => {
  const a = 'a b c d e f'.split(' '), b = 'c d e f g'.split(' ');
  assert.equal(overlapLength(a, b), 4);
  assert.equal(overlapLength(a, b, 2), 0);
});
