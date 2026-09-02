// Whisper hallucination / junk filtering. Pure functions, unit-tested with node --test.

const HALLUCINATION_PATTERNS = [
  /^(thank you|thanks|thank you very much|thanks for watching|thank you for watching|thanks for listening|thank you for listening)[\s.!]*$/i,
  /^(please )?(like,? )?(and )?subscribe[\s.!]*$/i,
  /^(bye|goodbye|see you( next time)?|you|the end|so|um+|hmm+|oh)[\s.!]*$/i,
  /ご視聴ありがとうございました/, /ご覧いただきありがとうございます/, /チャンネル登録/,
  /^字幕/, /字幕.*(提供|制作|by)/i, /subtitles? (by|provided|created)/i, /amara\.org/i,
  /^\[[^\]]*\]$/, /^\([^)]*\)$/, /^\*[^*]*\*$/, /^♪+.*♪+$/, /^music$/i,
  /^(sub|caption)s? by /i, /www\.|https?:\/\//i,
];

export function normalizeText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function isCjk(text) {
  return /[぀-ヿ㐀-䶿一-鿿가-힯]/.test(text);
}

const normUnit = (u) => u.toLowerCase().replace(/[\p{P}\p{S}]/gu, '');

/**
 * Collapse runs where the same unit sequence repeats 3+ times consecutively
 * ("the the the the" / "so so so so" / "ありがとうありがとうありがとう").
 * Units are words for spaced text and characters for CJK text without spaces.
 * Returns the collapsed text and whether anything was collapsed.
 */
export function collapseRepeats(text) {
  const t = normalizeText(text);
  const useChars = isCjk(t) && !/\s/.test(t);
  const units = useChars ? Array.from(t) : t.split(' ');
  const join = useChars ? '' : ' ';
  let out = units.slice();
  let collapsed = false;
  for (let n = 1; n <= 8; n++) {
    let i = 0;
    const res = [];
    while (i < out.length) {
      if (i + n <= out.length) {
        const gram = out.slice(i, i + n).map(normUnit).join('');
        if (gram.replace(//g, '').length > 0) {
          let reps = 1;
          while (i + (reps + 1) * n <= out.length &&
            out.slice(i + reps * n, i + (reps + 1) * n).map(normUnit).join('') === gram) reps++;
          if (reps >= 3) { res.push(...out.slice(i, i + n)); i += reps * n; collapsed = true; continue; }
        }
      }
      res.push(out[i]); i++;
    }
    out = res;
  }
  return { text: out.join(join), collapsed };
}

export function isHallucination(text) {
  const t = normalizeText(text);
  if (!t) return true;
  if (!/[\p{L}\p{N}]/u.test(t)) return true; // punctuation only
  for (const re of HALLUCINATION_PATTERNS) if (re.test(t)) return true;
  const { text: c, collapsed } = collapseRepeats(t);
  if (collapsed && c.length < t.length * 0.4) return true; // mostly a repetition loop
  return false;
}

/** Returns cleaned text, or '' when the text should be dropped entirely. */
export function filterText(text) {
  const t = normalizeText(text);
  if (isHallucination(t)) return '';
  let { text: c } = collapseRepeats(t);
  // Strip a hallucinated sign-off glued onto real speech.
  c = c.replace(/\s*(ご視聴ありがとうございました|thanks for watching[.!]?|thank you for watching[.!]?)\s*$/i, '').trim();
  return c;
}
