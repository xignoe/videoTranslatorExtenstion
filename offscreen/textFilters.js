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
  'subtitles by the amaraorg community',
  'subtitles by the amara org community',
  'www youtube com'
]);

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

/** True if the text is a known Whisper artifact rather than real speech. */
export function isHallucination(text) {
  const normalized = (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length < 2) return true;
  if (HALLUCINATIONS.has(normalized)) return true;

  // The same word repeated over and over ("you you you you") is an artifact.
  const words = normalized.split(' ');
  if (words.length >= 4 && new Set(words).size === 1) return true;

  return false;
}
