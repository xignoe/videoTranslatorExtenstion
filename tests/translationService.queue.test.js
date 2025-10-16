/**
 * Unit tests for TranslationService Queue and Retry Logic
 */

// Mock fetch for testing
global.fetch = jest.fn();

const TranslationService = require('../content/translationService.js');

describe('TranslationService Queue and Retry Logic', () => {
  let translationService;

  beforeEach(() => {
    translationService = new TranslationService();
    fetch.mockClear();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    translationService.stopQueueProcessor();
    translationService.cancelAllRequests();
  });

  describe('Queue Management', () => {
    test('should add requests to queue', async () => {
      const promise = translationService.queueTranslationRequest('Hello', 'en', 'es');
      
      expect(translationService.requestQueue.length).toBe(1);
      expect(translationService.requestQueue[0].text).toBe('Hello');
      
      // Mock successful response to resolve the promise
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [[["Hola", "Hello", null, null, 10]]]
      });
      
      // Manually trigger queue processing
      jest.advanceTimersByTime(200);
      await promise;
    });

    test('should prioritize requests by priority', async () => {
      const lowPriority = translationService.queueTranslationRequest('Low', 'en', 'es', { priority: 1 });
      const highPriority = translationService.queueTranslationRequest('High', 'en', 'es', { priority: 5 });
      const mediumPriority = translationService.queueTranslationRequest('Medium', 'en', 'es', { priority: 3 });
      
      expect(translationService.requestQueue[0].text).toBe('High');
      expect(translationService.requestQueue[1].text).toBe('Medium');
      expect(translationService.requestQueue[2].text).toBe('Low');
      
      // Clean up
      translationService.cancelAllRequests();
    });

    test('should process queue in order', async () => {
      const results = [];
      
      // Mock successful responses
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [[["Uno", "One", null, null, 10]]]
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [[["Dos", "Two", null, null, 10]]]
        });

      const promise1 = translationService.queueTranslationRequest('One', 'en', 'es');
      const promise2 = translationService.queueTranslationRequest('Two', 'en', 'es');
      
      promise1.then(result => results.push({ order: 1, text: result.translatedText }));
      promise2.then(result => results.push({ order: 2, text: result.translatedText }));
      
      // Allow queue processing
      jest.advanceTimersByTime(1000);
      await Promise.all([promise1, promise2]);
      
      expect(results[0].order).toBe(1);
      expect(results[0].text).toBe('Uno');
      expect(results[1].order).toBe(2);
      expect(results[1].text).toBe('Dos');
    });

    test('should cancel all requests', () => {
      translationService.queueTranslationRequest('Test1', 'en', 'es');
      translationService.queueTranslationRequest('Test2', 'en', 'es');
      
      expect(translationService.requestQueue.length).toBe(2);
      
      translationService.cancelAllRequests();
      
      expect(translationService.requestQueue.length).toBe(0);
    });

    test('should cancel specific request', () => {
      const request1 = translationService.queueTranslationRequest('Test1', 'en', 'es');
      const request2 = translationService.queueTranslationRequest('Test2', 'en', 'es');
      
      expect(translationService.requestQueue.length).toBe(2);
      
      const requestId = translationService.requestQueue[0].id;
      const cancelled = translationService.cancelRequest(requestId);
      
      expect(cancelled).toBe(true);
      expect(translationService.requestQueue.length).toBe(1);
      expect(translationService.requestQueue[0].text).toBe('Test2');
    });
  });

  describe('Retry Logic', () => {
    test('should calculate exponential backoff delay', () => {
      const delay1 = translationService.calculateRetryDelay(1);
      const delay2 = translationService.calculateRetryDelay(2);
      const delay3 = translationService.calculateRetryDelay(3);
      
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThan(1200); // With jitter
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThan(2400);
      expect(delay3).toBeGreaterThanOrEqual(4000);
      expect(delay3).toBeLessThan(4800);
    });

    test('should respect maximum retry delay', () => {
      const delay = translationService.calculateRetryDelay(10); // Very high attempt
      expect(delay).toBeLessThanOrEqual(translationService.maxRetryDelay);
    });

    test('should identify retryable errors', () => {
      expect(translationService.shouldRetry(new Error('Rate limit exceeded'))).toBe(true);
      expect(translationService.shouldRetry(new Error('Network timeout'))).toBe(true);
      expect(translationService.shouldRetry(new Error('HTTP 429 error'))).toBe(true);
      expect(translationService.shouldRetry(new Error('HTTP 500 error'))).toBe(true);
      expect(translationService.shouldRetry(new Error('Invalid API key'))).toBe(false);
      expect(translationService.shouldRetry(new Error('Malformed request'))).toBe(false);
    });

    test('should retry failed requests', async () => {
      let callCount = 0;
      
      fetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 429
          });
        } else {
          return Promise.resolve({
            ok: true,
            json: async () => [[["Hola", "Hello", null, null, 10]]]
          });
        }
      });

      const promise = translationService.queueTranslationRequest('Hello', 'en', 'es');
      
      // Allow time for initial request and retry
      jest.advanceTimersByTime(5000);
      const result = await promise;
      
      expect(callCount).toBe(2);
      expect(result.translatedText).toBe('Hola');
    });

    test('should fail after max retries', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 429
      });

      const promise = translationService.queueTranslationRequest('Hello', 'en', 'es', { maxRetries: 2 });
      
      // Allow time for retries
      jest.advanceTimersByTime(10000);
      
      await expect(promise).rejects.toThrow(/Translation failed after 2 attempts/);
    });

    test('should not retry non-retryable errors', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 401 // Unauthorized - not retryable
      });

      const promise = translationService.queueTranslationRequest('Hello', 'en', 'es');
      
      // Allow some time for processing
      jest.advanceTimersByTime(1000);
      
      await expect(promise).rejects.toThrow(/Translation failed after 1 attempts/);
    });
  });

  describe('Queue Statistics', () => {
    test('should provide queue statistics', () => {
      translationService.queueTranslationRequest('Test1', 'en', 'es');
      translationService.queueTranslationRequest('Test2', 'en', 'es');
      
      const stats = translationService.getQueueStats();
      
      expect(stats.queueLength).toBe(2);
      expect(stats.isProcessing).toBeDefined();
      expect(stats.oldestRequest).toBeGreaterThan(0);
      expect(stats.averageWaitTime).toBeGreaterThan(0);
    });

    test('should calculate average wait time', () => {
      translationService.queueTranslationRequest('Test1', 'en', 'es');
      translationService.queueTranslationRequest('Test2', 'en', 'es');
      translationService.queueTranslationRequest('Test3', 'en', 'es');
      
      const waitTime = translationService.calculateAverageWaitTime();
      
      expect(waitTime).toBe(3 * translationService.rateLimitDelay);
    });
  });

  describe('Request Expiration', () => {
    test('should expire old requests', async () => {
      // Create a request with old timestamp
      const promise = translationService.queueTranslationRequest('Hello', 'en', 'es');
      
      // Manually set old timestamp
      translationService.requestQueue[0].timestamp = Date.now() - 400000; // 6+ minutes ago
      
      jest.runAllTimers();
      
      await expect(promise).rejects.toThrow('Translation request expired');
    });
  });

  describe('Integration with Main Translation Method', () => {
    test('should use queue by default', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [[["Hola", "Hello", null, null, 10]]]
      });

      const promise = translationService.translateText('Hello', 'en', 'es');
      
      expect(translationService.requestQueue.length).toBe(1);
      
      jest.advanceTimersByTime(200);
      const result = await promise;
      
      expect(result.translatedText).toBe('Hola');
      expect(result.queueTime).toBeDefined();
    });

    test('should support direct translation when queue disabled', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [[["Hola", "Hello", null, null, 10]]]
      });

      const result = await translationService.translateText('Hello', 'en', 'es', { useQueue: false });
      
      expect(translationService.requestQueue.length).toBe(0);
      expect(result.translatedText).toBe('Hola');
      expect(result.queueTime).toBeUndefined();
    });

    test('should return cached results from queue', async () => {
      // Cache a translation
      translationService.cacheTranslation('Hello', 'en', 'es', 'Hola');
      
      const promise = translationService.translateText('Hello', 'en', 'es');
      
      jest.advanceTimersByTime(200);
      const result = await promise;
      
      expect(result.translation).toBe('Hola');
      expect(result.cached).toBe(true);
      expect(result.queueTime).toBeDefined();
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});