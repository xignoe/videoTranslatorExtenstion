import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LanguageVoter } from '../src/langVote.js';

test('locks after two consecutive agreeing windows', () => {
  const v = new LanguageVoter();
  assert.equal(v.observe({ lang: 'en', conf: 0.9, ts: 0 }), null);
  assert.equal(v.forcedLanguage(), null);
  assert.equal(v.observe({ lang: 'en', conf: 0.8, ts: 2000 }), 'en');
  assert.equal(v.forcedLanguage(), 'en');
});

test('a single disagreeing window does not unlock while the locked language stays likely', () => {
  const v = new LanguageVoter();
  v.observe({ lang: 'en', conf: 0.9, ts: 0 }); v.observe({ lang: 'en', conf: 0.9, ts: 2000 });
  v.observe({ lang: 'es', conf: 0.45, lockedConf: 0.55, ts: 4000 });
  assert.equal(v.forcedLanguage(), 'en');
});

test('re-detects when the locked language confidence drops below 0.5 and switches after agreement', () => {
  const v = new LanguageVoter();
  v.observe({ lang: 'en', conf: 0.9, ts: 0 }); v.observe({ lang: 'en', conf: 0.9, ts: 2000 });
  v.observe({ lang: 'es', conf: 0.8, lockedConf: 0.1, ts: 4000 });
  assert.equal(v.forcedLanguage(), null, 'unforced while re-detecting');
  assert.equal(v.observe({ lang: 'es', conf: 0.85, lockedConf: 0.05, ts: 6000 }), 'es');
  assert.equal(v.forcedLanguage(), 'es');
});

test('re-detects after >= 3 s of silence', () => {
  const v = new LanguageVoter();
  v.observe({ lang: 'ja', conf: 0.9, ts: 0 }); v.observe({ lang: 'ja', conf: 0.9, ts: 2000 });
  // The free detection after the silence still says ja: stay locked.
  v.observe({ lang: 'ja', conf: 0.9, lockedConf: 0.9, ts: 8000, silenceMs: 3500 });
  assert.equal(v.forcedLanguage(), 'ja', 'agreement keeps the lock');
  // After another silence the free detection disagrees: the next window must run unforced.
  v.observe({ lang: 'ko', conf: 0.6, lockedConf: 0.7, ts: 14000, silenceMs: 4000 });
  assert.equal(v.forcedLanguage(), null);
  assert.equal(v.observe({ lang: 'ko', conf: 0.7, lockedConf: 0.2, ts: 16000 }), 'ko');
});

test('re-detects every ~30 s', () => {
  const v = new LanguageVoter();
  v.observe({ lang: 'en', conf: 0.9, ts: 0 }); v.observe({ lang: 'en', conf: 0.9, ts: 2000 });
  v.observe({ lang: 'en', conf: 0.9, lockedConf: 0.9, ts: 20000 });
  assert.equal(v.forcedLanguage(), 'en');
  v.observe({ lang: 'fr', conf: 0.6, lockedConf: 0.8, ts: 33000 });
  assert.equal(v.forcedLanguage(), null, 'periodic re-detection lets a disagreeing window unforce');
  v.observe({ lang: 'en', conf: 0.9, lockedConf: 0.9, ts: 35000 });
  v.observe({ lang: 'en', conf: 0.9, lockedConf: 0.9, ts: 37000 });
  assert.equal(v.forcedLanguage(), 'en');
});

test('mixed feed en > es > ja is followed in order', () => {
  const v = new LanguageVoter();
  const seq = [];
  const feed = [['en', 0.9], ['en', 0.9], ['en', 0.9], ['es', 0.9], ['es', 0.9], ['es', 0.9], ['ja', 0.95], ['ja', 0.95]];
  feed.forEach(([lang, conf], i) => {
    const locked = v.observe({ lang, conf, lockedConf: lang === v.locked ? conf : 1 - conf, ts: i * 2000 });
    if (locked && seq.at(-1) !== locked) seq.push(locked);
  });
  assert.deepEqual(seq, ['en', 'es', 'ja']);
});

test('reset keeps the last locked language as a prior for the first window only', () => {
  const v = new LanguageVoter();
  v.observe({ lang: 'en', conf: 0.9, ts: 0 }); v.observe({ lang: 'en', conf: 0.9, ts: 2000 });
  v.reset();
  assert.equal(v.locked, null);
  assert.equal(v.forcedLanguage(), 'en', 'prior applies before any observation');
  v.observe({ lang: 'es', conf: 0.7, lockedConf: 0.1, ts: 10000 });
  assert.equal(v.forcedLanguage(), null, 'after the first observation the vote is free again');
  assert.equal(v.observe({ lang: 'es', conf: 0.8, ts: 12000 }), 'es');
});
