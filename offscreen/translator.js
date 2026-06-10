/**
 * Text translation with two free providers:
 *  - Google Translate's public gtx endpoint (primary, no API key)
 *  - LibreTranslate (fallback)
 *
 * Runs in the offscreen document (an extension page), where host_permissions
 * in the manifest let fetch() bypass CORS for these endpoints.
 */

const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const LIBRE_ENDPOINT = 'https://libretranslate.de/translate';
const CACHE_LIMIT = 500;

const cache = new Map();

/**
 * The gtx response is [[ [segment, original, ...], [segment, ...], ... ], ...].
 * Join every segment — taking only the first drops most of long texts.
 */
export function parseGoogleTranslateResponse(data) {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Unexpected Google Translate response shape');
  }
  return data[0]
    .filter(Array.isArray)
    .map((segment) => segment[0])
    .filter((s) => typeof s === 'string')
    .join('')
    .trim();
}

async function translateWithGoogle(text, sourceLanguage, targetLanguage) {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: sourceLanguage,
    tl: targetLanguage,
    dt: 't',
    q: text
  });
  const response = await fetch(`${GOOGLE_ENDPOINT}?${params}`);
  if (!response.ok) throw new Error(`Google Translate HTTP ${response.status}`);
  return parseGoogleTranslateResponse(await response.json());
}

async function translateWithLibre(text, sourceLanguage, targetLanguage) {
  const response = await fetch(LIBRE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source: sourceLanguage,
      // LibreTranslate uses plain codes (zh, not zh-CN)
      target: targetLanguage.split('-')[0],
      format: 'text'
    })
  });
  if (!response.ok) throw new Error(`LibreTranslate HTTP ${response.status}`);
  const data = await response.json();
  if (!data || typeof data.translatedText !== 'string') {
    throw new Error('Unexpected LibreTranslate response');
  }
  return data.translatedText.trim();
}

export async function translate(text, targetLanguage, sourceLanguage = 'auto') {
  if (!text || !targetLanguage || sourceLanguage === targetLanguage) return text;

  const key = `${sourceLanguage}:${targetLanguage}:${text}`;
  if (cache.has(key)) return cache.get(key);

  let translated;
  try {
    translated = await translateWithGoogle(text, sourceLanguage, targetLanguage);
  } catch (primaryError) {
    translated = await translateWithLibre(text, sourceLanguage, targetLanguage);
  }
  if (!translated) return text;

  cache.set(key, translated);
  if (cache.size > CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
  return translated;
}
