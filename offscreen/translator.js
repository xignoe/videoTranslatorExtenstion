/**
 * Text translation with two free providers:
 *  - Google Translate's public gtx endpoint (primary, no API key)
 *  - MyMemory (fallback, no API key)
 *
 * Runs in the offscreen document (an extension page), where host_permissions
 * in the manifest let fetch() bypass CORS for these endpoints.
 */

const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get';
const MYMEMORY_MAX_CHARS = 500; // hard per-request limit of the API
const FETCH_TIMEOUT_MS = 8000; // a stuck request must not stall live captions
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

export function parseMyMemoryResponse(data) {
  const text = data?.responseData?.translatedText;
  if (data?.responseStatus !== 200 || typeof text !== 'string') {
    throw new Error(
      `MyMemory error: ${data?.responseDetails || data?.responseStatus || 'bad response'}`
    );
  }
  // Quota exhaustion comes back as a 200 with a warning string in the text.
  if (/^MYMEMORY WARNING/i.test(text)) throw new Error('MyMemory quota exhausted');
  return text.trim();
}

async function translateWithGoogle(text, sourceLanguage, targetLanguage) {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: sourceLanguage,
    tl: targetLanguage,
    dt: 't',
    q: text
  });
  const response = await fetch(`${GOOGLE_ENDPOINT}?${params}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Google Translate HTTP ${response.status}`);
  // A block/captcha page comes back as HTML with a 200 status.
  const body = await response.text();
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    throw new Error('Google Translate returned a non-JSON (block) page');
  }
  return parseGoogleTranslateResponse(data);
}

async function translateWithMyMemory(text, sourceLanguage, targetLanguage) {
  const params = new URLSearchParams({
    q: text.slice(0, MYMEMORY_MAX_CHARS),
    // MyMemory wants a concrete pair; "Autodetect" is its auto keyword.
    langpair: `${sourceLanguage === 'auto' ? 'Autodetect' : sourceLanguage}|${targetLanguage}`
  });
  const response = await fetch(`${MYMEMORY_ENDPOINT}?${params}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`MyMemory HTTP ${response.status}`);
  return parseMyMemoryResponse(await response.json());
}

export async function translate(text, targetLanguage, sourceLanguage = 'auto') {
  if (!text || !targetLanguage) return text;
  if (sourceLanguage === targetLanguage) return text;
  // Same base language ("pt" vs "pt-BR") needs no translation — except
  // Chinese, where zh -> zh-TW still converts the script.
  const [sourceBase] = sourceLanguage.split('-');
  const [targetBase] = targetLanguage.split('-');
  if (sourceBase === targetBase && targetBase !== 'zh') return text;

  const key = `${sourceLanguage}:${targetLanguage}:${text}`;
  if (cache.has(key)) return cache.get(key);

  let translated;
  try {
    translated = await translateWithGoogle(text, sourceLanguage, targetLanguage);
  } catch (primaryError) {
    translated = await translateWithMyMemory(text, sourceLanguage, targetLanguage);
  }
  if (!translated) return text;

  cache.set(key, translated);
  if (cache.size > CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
  return translated;
}
