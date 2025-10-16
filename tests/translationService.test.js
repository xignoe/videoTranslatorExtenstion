/**
 * Unit tests for TranslationService
 */

// Mock fetch for testing
global.fetch = jest.fn();

const TranslationService = require('../content/translationService.js');

describe('TranslationService', () => {
  let translationService;

  beforeEach(() => {
    translationService = new TranslationService();
    fetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with default configuration', () => {
      expect(translationService.cache).toBeInstanceOf(Map);
      expect(translationService.requestQueue).toEqual([]);
      expect(translationService.currentProvider).toBe('google');
      expect(translationService.providers).toHaveProperty('google');
      expect(translationService.providers).toHaveProperty('libre');
    });

    test('should have correct provider configurations', () => {
      expect(translationService.providers.google.rateLimit).toBe(100);
      expect(translationService.providers.libre.rateLimit).toBe(60);
    });
  });

  describe('Cache Management', () => {
    test('should generate consistent cache keys', () => {
      const key1 = translationService.getCacheKey('Hello', 'en', 'es');
      const key2 = translationService.getCacheKey('hello', 'en', 'es');
      const key3 = translationService.getCacheKey(' Hello ', 'en', 'es');
      
      expect(key1).toBe(key2);
      expect(key1).toBe(key3);
    });

    test('should cache and retrieve translations', () => {
      const text = 'Hello';
      const translation = 'Hola';
      
      translationService.cacheTranslation(text, 'en', 'es', translation);
      const cached = translationService.getCachedTranslation(text, 'en', 'es');
      
      expect(cached.translation).toBe(translation);
      expect(cached.confidence).toBe(1.0);
      expect(cached.timestamp).toBeDefined();
    });

    test('should limit cache size', () => {
      // Fill cache beyond limit
      for (let i = 0; i < 1001; i++) {
        translationService.cacheTranslation(`text${i}`, 'en', 'es', `translation${i}`);
      }
      
      expect(translationService.cache.size).toBe(1000);
    });

    test('should clear cache', () => {
      translationService.cacheTranslation('test', 'en', 'es', 'prueba');
      expect(translationService.cache.size).toBe(1);
      
      translationService.clearCache();
      expect(translationService.cache.size).toBe(0);
    });
  });

  describe('Rate Limiting', () => {
    test('should detect rate limiting', () => {
      const provider = translationService.providers.google;
      provider.requestCount = provider.rateLimit;
      provider.lastRequest = Date.now(); // Set recent request time
      
      expect(translationService.isRateLimited('google')).toBe(true);
    });

    test('should reset rate limit after time passes', () => {
      const provider = translationService.providers.google;
      provider.requestCount = provider.rateLimit;
      provider.lastRequest = Date.now() - 61000; // More than a minute ago
      
      expect(translationService.isRateLimited('google')).toBe(false);
    });

    test('should find available provider', () => {
      // Rate limit google
      translationService.providers.google.requestCount = translationService.providers.google.rateLimit;
      translationService.providers.google.lastRequest = Date.now();
      
      const available = translationService.getAvailableProvider();
      expect(available).toBe('libre');
    });

    test('should return null when all providers are rate limited', () => {
      // Rate limit all providers
      Object.keys(translationService.providers).forEach(provider => {
        translationService.providers[provider].requestCount = translationService.providers[provider].rateLimit;
        translationService.providers[provider].lastRequest = Date.now();
      });
      
      const available = translationService.getAvailableProvider();
      expect(available).toBeNull();
    });
  });

  describe('Google Translate Integration', () => {
    test('should translate text successfully', async () => {
      const mockResponse = [
        [["Hola", "Hello", null, null, 10]]
      ];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await translationService.translateWithGoogle('Hello', 'en', 'es');
      
      expect(result.translatedText).toBe('Hola');
      expect(result.provider).toBe('google');
      expect(result.confidence).toBeDefined();
    });

    test('should handle API errors', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 429
      });

      await expect(translationService.translateWithGoogle('Hello', 'en', 'es'))
        .rejects.toThrow('Google Translate API error: 429');
    });

    test('should handle invalid responses', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => null
      });

      await expect(translationService.translateWithGoogle('Hello', 'en', 'es'))
        .rejects.toThrow('Invalid response from Google Translate');
    });

    test('should respect rate limits', async () => {
      translationService.providers.google.requestCount = translationService.providers.google.rateLimit;
      translationService.providers.google.lastRequest = Date.now();

      await expect(translationService.translateWithGoogle('Hello', 'en', 'es'))
        .rejects.toThrow('Google Translate rate limit exceeded');
    });
  });

  describe('LibreTranslate Integration', () => {
    test('should translate text successfully', async () => {
      const mockResponse = {
        translatedText: 'Hola'
      };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await translationService.translateWithLibre('Hello', 'en', 'es');
      
      expect(result.translatedText).toBe('Hola');
      expect(result.provider).toBe('libre');
      expect(result.confidence).toBe(0.8);
    });

    test('should handle API errors', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      await expect(translationService.translateWithLibre('Hello', 'en', 'es'))
        .rejects.toThrow('LibreTranslate API error: 500');
    });

    test('should handle invalid responses', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      await expect(translationService.translateWithLibre('Hello', 'en', 'es'))
        .rejects.toThrow('Invalid response from LibreTranslate');
    });
  });

  describe('Main Translation Method', () => {
    test('should validate input', async () => {
      await expect(translationService.translateText(''))
        .rejects.toThrow('Invalid text input for translation');
      
      await expect(translationService.translateText(null))
        .rejects.toThrow('Invalid text input for translation');
    });

    test('should return original text for same language', async () => {
      const result = await translationService.translateText('Hello', 'en', 'en');
      
      expect(result.translatedText).toBe('Hello');
      expect(result.confidence).toBe(1.0);
      expect(result.provider).toBe('none');
    });

    test('should return cached translation', async () => {
      translationService.cacheTranslation('Hello', 'en', 'es', 'Hola');
      
      const result = await translationService.translateText('Hello', 'en', 'es', { useQueue: false });
      
      expect(result.translation).toBe('Hola');
      expect(result.cached).toBe(true);
    });

    test('should translate with available provider', async () => {
      const mockResponse = [
        [["Hola", "Hello", null, null, 10]]
      ];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await translationService.translateText('Hello', 'en', 'es', { useQueue: false });
      
      expect(result.translatedText).toBe('Hola');
      expect(result.cached).toBe(false);
    });

    test('should fallback to alternative provider on error', async () => {
      // First call fails (Google)
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });
      
      // Second call succeeds (LibreTranslate)
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ translatedText: 'Hola' })
      });

      const result = await translationService.translateText('Hello', 'en', 'es', { useQueue: false });
      
      expect(result.translatedText).toBe('Hola');
      expect(result.provider).toBe('libre');
    });

    test('should handle all providers rate limited', async () => {
      // Rate limit all providers
      Object.keys(translationService.providers).forEach(provider => {
        translationService.providers[provider].requestCount = translationService.providers[provider].rateLimit;
        translationService.providers[provider].lastRequest = Date.now();
      });

      await expect(translationService.translateText('Hello', 'en', 'es', { useQueue: false }))
        .rejects.toThrow('All translation providers are rate limited');
    });
  });

  describe('Service Management', () => {
    test('should get service status', () => {
      const status = translationService.getStatus();
      
      expect(status.currentProvider).toBe('google');
      expect(status.cacheSize).toBe(0);
      expect(status.queueLength).toBe(0);
      expect(status.providers).toHaveLength(2);
    });

    test('should set provider', () => {
      translationService.setProvider('libre');
      expect(translationService.currentProvider).toBe('libre');
    });

    test('should reject invalid provider', () => {
      expect(() => translationService.setProvider('invalid'))
        .toThrow('Unknown provider: invalid');
    });
  });
});