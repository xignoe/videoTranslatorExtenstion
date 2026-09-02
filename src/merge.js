// Text merging for growing-window transcription. When a window is force-cut we keep
// 1 s of audio overlap, so the next window's text starts with words we already showed.

function isCjkNoSpace(t) {
  return /[぀-ヿ㐀-䶿一-鿿]/.test(t) && !/\s/.test(t.trim());
}

export function tokenize(text) {
  const t = String(text ?? '').trim();
  if (!t) return { units: [], join: ' ' };
  if (isCjkNoSpace(t)) return { units: Array.from(t), join: '' };
  return { units: t.split(/\s+/), join: ' ' };
}

const norm = (u) => u.toLowerCase().replace(/[\p{P}\p{S}]/gu, '');

/** Length of the longest suffix of `a` (in units) equal to a prefix of `b`. */
export function overlapLength(aUnits, bUnits, maxLen = 16) {
  const max = Math.min(aUnits.length, bUnits.length, maxLen);
  for (let k = max; k >= 1; k--) {
    let ok = true;
    for (let i = 0; i < k; i++) {
      if (norm(aUnits[aUnits.length - k + i]) !== norm(bUnits[i])) { ok = false; break; }
    }
    if (ok) {
      // A single-unit overlap only counts when the unit is long enough to be meaningful.
      if (k === 1 && norm(bUnits[0]).length < 3) continue;
      return k;
    }
  }
  return 0;
}

/** Returns `next` with the prefix that overlaps the end of `prev` removed. */
export function stripOverlap(prev, next) {
  const a = tokenize(prev), b = tokenize(next);
  if (!a.units.length || !b.units.length) return String(next ?? '').trim();
  const k = overlapLength(a.units, b.units);
  return b.units.slice(k).join(b.join);
}

/** Joins prev + next, de-duplicating the overlapping words. */
export function mergeText(prev, next) {
  const p = String(prev ?? '').trim(), n = String(next ?? '').trim();
  if (!p) return n;
  if (!n) return p;
  const rest = stripOverlap(p, n);
  if (!rest) return p;
  const join = tokenize(n).join === '' && tokenize(p).join === '' ? '' : ' ';
  return p + join + rest;
}
