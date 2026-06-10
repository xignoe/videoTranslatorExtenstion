/**
 * Cleanup and filtering for Whisper transcripts.
 *
 * Whisper reliably hallucinates short filler phrases on silence or music
 * ("Thank you.", "Thanks for watching!", "you", subtitle credits, etc.).
 * These never belong in live captions, so they are dropped.
 */

const HALLUCINATIONS = new Set([
  'you',
  'bye',
  'bye bye',
  'the end',
  'thank you',
  'thank you very much',
  'thanks for watching',
  'thank you for watching',
  'thank you so much for watching',
  'please subscribe',
  'like and subscribe',
  'www youtube com',
  // Japanese
  'ご視聴ありがとうございました',
  'ご視聴ありがとうございます',
  'チャンネル登録お願いします',
  'チャンネル登録よろしくお願いします',
  'おやすみなさい',
  'おしまい',
  // Korean / Chinese / Spanish / French / German / Portuguese / Russian
  '구독과 좋아요 부탁드립니다',
  '谢谢观看',
  '感谢观看',
  '謝謝觀看',
  '请订阅',
  'gracias por ver',
  'gracias por ver el video',
  'hasta la próxima',
  'merci davoir regardé',
  'merci davoir regardé cette vidéo',
  'vielen dank fürs zuschauen',
  'bis zum nächsten mal',
  'obrigado por assistir',
  'спасибо за просмотр'
]);

// Substring matches for artifacts with many phrasing variants.
const HALLUCINATION_PATTERNS = [
  'ご視聴', // "thanks for watching" variants — Whisper's most common Japanese artifact
  'チャンネル登録', // "subscribe to the channel"
  '시청해 주셔서', // "thanks for watching" (Korean)
  '시청해주셔서',
  'amaraorg', // "Subtitles by the Amara.org community" in any language
  'opensubtitles'
];

/** Strip sound-effect tags and normalize whitespace. */
export function cleanTranscript(text) {
  return (text || '')
    .replace(/\[[^\]]*\]/g, ' ') // [Music], [Applause]
    .replace(/\([^)]*\)/g, ' ') // (laughs)
    .replace(/♪[^♪]*♪/g, ' ')
    .replace(/[♪♫]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True if the text is mostly one short phrase repeated back-to-back —
 * a Whisper decoder loop ("buy now buy now buy now…"). Character-based,
 * so it works for languages without spaces (Japanese, Chinese).
 */
export function hasRepetitionLoop(text) {
  const t = (text || '').trim();
  if (t.length < 12) return false;
  const match = t.match(/(.{2,40}?)\1{2,}/su);
  return Boolean(match) && match[0].length >= t.length * 0.5;
}

/** True if the text is a known Whisper artifact rather than real speech. */
export function isHallucination(text) {
  if (hasRepetitionLoop(text)) return true;
  const normalized = (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length < 2) return true;
  if (HALLUCINATIONS.has(normalized)) return true;
  if (HALLUCINATION_PATTERNS.some((p) => normalized.includes(p))) return true;

  // The same word repeated over and over ("you you you you") is an artifact.
  const words = normalized.split(' ');
  if (words.length >= 4 && new Set(words).size === 1) return true;

  return false;
}
