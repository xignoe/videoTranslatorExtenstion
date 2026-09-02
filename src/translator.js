// Translation: Google "gtx" endpoint first, MyMemory as fallback, 8 s timeout, in-memory cache.

const GOOGLE_LANG = { zh: 'zh-CN', jw: 'jv', iw: 'he' };
export function toGoogleLang(code) { return GOOGLE_LANG[code] || code || 'auto'; }

export function googleUrl(text, from, to) {
  const sl = from && from !== 'auto' ? toGoogleLang(from) : 'auto';
  return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(toGoogleLang(to))}&dt=t&q=${encodeURIComponent(text)}`;
}

export function myMemoryUrl(text, from, to) {
  const sl = from && from !== 'auto' ? from : 'autodetect';
  return `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(sl)}|${encodeURIComponent(to)}`;
}

/** Parses the gtx JSON: [[["translated","source",...],...], null, "detectedLang", ...] */
export function parseGoogleResponse(json) {
  if (!Array.isArray(json) || !Array.isArray(json[0])) throw new Error('unexpected Google response');
  const text = json[0].map((seg) => (Array.isArray(seg) ? seg[0] : '')).filter(Boolean).join('');
  const detected = typeof json[2] === 'string' ? json[2] : null;
  if (!text) throw new Error('empty Google translation');
  return { text, detected };
}

export function parseMyMemoryResponse(json) {
  if (!json || typeof json !== 'object') throw new Error('unexpected MyMemory response');
  const status = Number(json.responseStatus);
  const text = json.responseData?.translatedText;
  if (status !== 200 || !text) throw new Error(`MyMemory error ${status}: ${json.responseDetails || text || ''}`.trim());
  if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE PAIR/i.test(text)) throw new Error(`MyMemory: ${text}`);
  return { text, detected: null };
}

export function createTranslator({ fetchImpl = globalThis.fetch, timeoutMs = 8000, cache = new Map(), maxCache = 500 } = {}) {
  async function fetchJson(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(timer); }
  }
  function remember(key, value) {
    if (cache.size >= maxCache) cache.delete(cache.keys().next().value);
    cache.set(key, value);
  }
  return {
    cache,
    async translate(text, from, to) {
      const t = String(text ?? '').trim();
      if (!t) return { text: '', provider: 'none' };
      if (from && from === to) return { text: t, provider: 'none' };
      const key = `${from || 'auto'}|${to}|${t}`;
      if (cache.has(key)) return cache.get(key);
      const errors = [];
      try {
        const r = parseGoogleResponse(await fetchJson(googleUrl(t, from, to)));
        const v = { text: r.text, provider: 'google', detected: r.detected };
        remember(key, v); return v;
      } catch (e) { errors.push(`google: ${e.message}`); }
      try {
        const r = parseMyMemoryResponse(await fetchJson(myMemoryUrl(t, from, to)));
        const v = { text: r.text, provider: 'mymemory' };
        remember(key, v); return v;
      } catch (e) { errors.push(`mymemory: ${e.message}`); }
      throw new Error(errors.join('; '));
    },
  };
}
