/**
 * Translation Service for Video Translator Extension
 * Handles translation API requests with multiple provider support,
 * error management, rate limiting, and caching
 */

class TranslationService {
  constructor() {
    this.cache = new Map();
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.rateLimitDelay = 100; // Base delay in ms
    this.maxRetries = 3;
    this.retryDelayBase = 1000; // Base retry delay in ms
    this.maxRetryDelay = 30000; // Maximum retry delay in ms
    this.providers = {
      google: {
        name: 'Google Translate',
        endpoint: 'https://translate.googleapis.com/translate_a/single',
        rateLimit: 100, // requests per minute
        lastRequest: 0,
        requestCount: 0
      },
      libre: {
        name: 'LibreTranslate',
        endpoint: 'https://libretranslate.de/translate',
        rateLimit: 60,
        lastRequest: 0,
        requestCount: 0
      }
    };
    this.currentProvider = 'google';
    this.resetRateLimitCounters();
    this.startQueueProcessor();
  }

  /**
   * Reset rate limit counters every minute
   */
  resetRateLimitCounters() {
    setInterval(() => {
      Object.keys(this.providers).forEach(provider => {
        this.providers[provider].requestCount = 0;
      });
    }, 60000);
  }

  /**
   * Generate cache key for translation request
   */
  getCacheKey(text, sourceLanguage, targetLanguage) {
    return `${sourceLanguage}-${targetLanguage}-${text.toLowerCase().trim()}`;
  }

  /**
   * Check if translation is cached
   */
  getCachedTranslation(text, sourceLanguage, targetLanguage) {
    const key = this.getCacheKey(text, sourceLanguage, targetLanguage);
    return this.cache.get(key);
  }

  /**
   * Cache translation result
   */
  cacheTranslation(text, sourceLanguage, targetLanguage, translation) {
    const key = this.getCacheKey(text, sourceLanguage, targetLanguage);
    this.cache.set(key, {
      translation,
      timestamp: Date.now(),
      confidence: 1.0
    });

    // Limit cache size to prevent memory issues
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Check if provider is rate limited
   */
  isRateLimited(provider) {
    const providerConfig = this.providers[provider];
    if (!providerConfig) return true;

    const now = Date.now();
    const timeSinceLastRequest = now - providerConfig.lastRequest;
    
    // Reset counter if more than a minute has passed
    if (timeSinceLastRequest > 60000) {
      providerConfig.requestCount = 0;
    }

    return providerConfig.requestCount >= providerConfig.rateLimit;
  }

  /**
   * Get next available provider
   */
  getAvailableProvider() {
    for (const [name, config] of Object.entries(this.providers)) {
      if (!this.isRateLimited(name)) {
        return name;
      }
    }
    return null; // All providers are rate limited
  }

  /**
   * Translate text using Google Translate API
   */
  async translateWithGoogle(text, sourceLanguage, targetLanguage) {
    const provider = this.providers.google;
    
    if (this.isRateLimited('google')) {
      throw new Error('Google Translate rate limit exceeded');
    }

    const params = new URLSearchParams({
      client: 'gtx',
      sl: sourceLanguage,
      tl: targetLanguage,
      dt: 't',
      q: text
    });

    const response = await fetch(`${provider.endpoint}?${params}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VideoTranslator/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`Google Translate API error: ${response.status}`);
    }

    provider.lastRequest = Date.now();
    provider.requestCount++;

    const data = await response.json();
    
    if (!data || !data[0] || !data[0][0]) {
      throw new Error('Invalid response from Google Translate');
    }

    return {
      translatedText: data[0][0][0],
      confidence: data[0][0][2] || 0.8,
      provider: 'google'
    };
  }

  /**
   * Translate text using LibreTranslate API
   */
  async translateWithLibre(text, sourceLanguage, targetLanguage) {
    const provider = this.providers.libre;
    
    if (this.isRateLimited('libre')) {
      throw new Error('LibreTranslate rate limit exceeded');
    }

    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: text,
        source: sourceLanguage,
        target: targetLanguage,
        format: 'text'
      })
    });

    if (!response.ok) {
      throw new Error(`LibreTranslate API error: ${response.status}`);
    }

    provider.lastRequest = Date.now();
    provider.requestCount++;

    const data = await response.json();
    
    if (!data || !data.translatedText) {
      throw new Error('Invalid response from LibreTranslate');
    }

    return {
      translatedText: data.translatedText,
      confidence: 0.8, // LibreTranslate doesn't provide confidence scores
      provider: 'libre'
    };
  }

  /**
   * Main translation method with provider fallback
   */
  async translateText(text, sourceLanguage = 'auto', targetLanguage = 'en', options = {}) {
    // Input validation
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Invalid text input for translation');
    }

    if (!targetLanguage || targetLanguage === sourceLanguage) {
      return {
        translatedText: text,
        confidence: 1.0,
        provider: 'none',
        cached: false
      };
    }

    // Use queue system for better reliability and rate limiting
    if (options.useQueue !== false) {
      return this.queueTranslationRequest(text, sourceLanguage, targetLanguage, options);
    }

    // Direct translation (legacy mode)
    return this.translateDirectly(text, sourceLanguage, targetLanguage);
  }

  /**
   * Direct translation without queue (for backwards compatibility)
   */
  async translateDirectly(text, sourceLanguage, targetLanguage) {
    // Check cache first
    const cached = this.getCachedTranslation(text, sourceLanguage, targetLanguage);
    if (cached) {
      return {
        ...cached,
        cached: true
      };
    }

    // Check if all providers are rate limited
    const availableProvider = this.getAvailableProvider();
    if (!availableProvider) {
      throw new Error('All translation providers are rate limited. Please try again later.');
    }

    let result;
    try {
      switch (availableProvider) {
        case 'google':
          result = await this.translateWithGoogle(text, sourceLanguage, targetLanguage);
          break;
        case 'libre':
          result = await this.translateWithLibre(text, sourceLanguage, targetLanguage);
          break;
        default:
          throw new Error(`Unknown provider: ${availableProvider}`);
      }

      // Cache successful translation
      this.cacheTranslation(text, sourceLanguage, targetLanguage, result.translatedText);
      
      return {
        ...result,
        cached: false
      };

    } catch (error) {
      // Try fallback provider if available
      const fallbackProvider = Object.keys(this.providers).find(
        p => p !== availableProvider && !this.isRateLimited(p)
      );

      if (fallbackProvider) {
        try {
          switch (fallbackProvider) {
            case 'google':
              result = await this.translateWithGoogle(text, sourceLanguage, targetLanguage);
              break;
            case 'libre':
              result = await this.translateWithLibre(text, sourceLanguage, targetLanguage);
              break;
          }

          this.cacheTranslation(text, sourceLanguage, targetLanguage, result.translatedText);
          return {
            ...result,
            cached: false
          };
        } catch (fallbackError) {
          throw new Error(`Translation failed with both providers: ${error.message}, ${fallbackError.message}`);
        }
      }

      throw error;
    }
  }

  /**
   * Get translation service status
   */
  getStatus() {
    return {
      currentProvider: this.currentProvider,
      cacheSize: this.cache.size,
      queueLength: this.requestQueue.length,
      providers: Object.keys(this.providers).map(name => ({
        name,
        displayName: this.providers[name].name,
        rateLimited: this.isRateLimited(name),
        requestCount: this.providers[name].requestCount,
        rateLimit: this.providers[name].rateLimit
      }))
    };
  }

  /**
   * Clear translation cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Set preferred provider
   */
  setProvider(providerName) {
    if (this.providers[providerName]) {
      this.currentProvider = providerName;
    } else {
      throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  calculateRetryDelay(attempt) {
    const delay = this.retryDelayBase * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
    return Math.min(delay + jitter, this.maxRetryDelay);
  }

  /**
   * Add translation request to queue
   */
  queueTranslationRequest(text, sourceLanguage, targetLanguage, options = {}) {
    return new Promise((resolve, reject) => {
      const request = {
        id: Date.now() + Math.random(),
        text,
        sourceLanguage,
        targetLanguage,
        attempts: 0,
        maxRetries: options.maxRetries || this.maxRetries,
        priority: options.priority || 0,
        timestamp: Date.now(),
        resolve,
        reject,
        lastError: null
      };

      // Insert request in queue based on priority (higher priority first)
      const insertIndex = this.requestQueue.findIndex(req => req.priority < request.priority);
      if (insertIndex === -1) {
        this.requestQueue.push(request);
      } else {
        this.requestQueue.splice(insertIndex, 0, request);
      }

      // Start processing if not already running (will be handled by interval)
      // Removed immediate processing to allow better control in tests
    });
  }

  /**
   * Start the queue processor
   */
  startQueueProcessor() {
    // Process queue every 100ms
    this.queueInterval = setInterval(() => {
      if (!this.isProcessingQueue && this.requestQueue.length > 0) {
        this.processQueue();
      }
    }, 100);
  }

  /**
   * Stop the queue processor
   */
  stopQueueProcessor() {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }
  }

  /**
   * Process translation request queue
   */
  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue[0];
      
      try {
        // Check if request has expired (older than 5 minutes)
        if (Date.now() - request.timestamp > 300000) {
          this.requestQueue.shift();
          request.reject(new Error('Translation request expired'));
          continue;
        }

        // Try to process the request
        const result = await this.processTranslationRequest(request);
        
        // Success - remove from queue and resolve
        this.requestQueue.shift();
        request.resolve(result);

      } catch (error) {
        request.attempts++;
        request.lastError = error;

        // Check if we should retry
        if (request.attempts < request.maxRetries && this.shouldRetry(error)) {
          // Calculate retry delay
          const retryDelay = this.calculateRetryDelay(request.attempts);
          
          // Move request to back of queue with delay
          this.requestQueue.shift();
          setTimeout(() => {
            // Re-add to queue if it hasn't been cancelled
            if (request.resolve && request.reject) {
              const insertIndex = this.requestQueue.findIndex(req => req.priority < request.priority);
              if (insertIndex === -1) {
                this.requestQueue.push(request);
              } else {
                this.requestQueue.splice(insertIndex, 0, request);
              }
            }
          }, retryDelay);

        } else {
          // Max retries reached or non-retryable error
          this.requestQueue.shift();
          request.reject(new Error(`Translation failed after ${request.attempts} attempts: ${request.lastError?.message || 'Unknown error'}`));
        }
      }

      // Add small delay between requests to respect rate limits
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
    }

    this.isProcessingQueue = false;
  }

  /**
   * Process individual translation request
   */
  async processTranslationRequest(request) {
    const { text, sourceLanguage, targetLanguage } = request;

    // Check cache first
    const cached = this.getCachedTranslation(text, sourceLanguage, targetLanguage);
    if (cached) {
      return {
        ...cached,
        cached: true,
        queueTime: Date.now() - request.timestamp
      };
    }

    // Get available provider
    const availableProvider = this.getAvailableProvider();
    if (!availableProvider) {
      throw new Error('All translation providers are rate limited');
    }

    let result;
    switch (availableProvider) {
      case 'google':
        result = await this.translateWithGoogle(text, sourceLanguage, targetLanguage);
        break;
      case 'libre':
        result = await this.translateWithLibre(text, sourceLanguage, targetLanguage);
        break;
      default:
        throw new Error(`Unknown provider: ${availableProvider}`);
    }

    // Cache successful translation
    this.cacheTranslation(text, sourceLanguage, targetLanguage, result.translatedText);
    
    return {
      ...result,
      cached: false,
      queueTime: Date.now() - request.timestamp
    };
  }

  /**
   * Determine if error is retryable
   */
  shouldRetry(error) {
    const retryableErrors = [
      'rate limit',
      'timeout',
      'network',
      'temporary',
      '429', // Too Many Requests
      '500', // Internal Server Error
      '502', // Bad Gateway
      '503', // Service Unavailable
      '504'  // Gateway Timeout
    ];

    const errorMessage = error.message.toLowerCase();
    return retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError)
    );
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests() {
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request && request.reject && typeof request.reject === 'function') {
        try {
          request.reject(new Error('Translation request cancelled'));
        } catch (error) {
          // Ignore errors from already resolved/rejected promises
        }
      }
    }
  }

  /**
   * Cancel specific request by ID
   */
  cancelRequest(requestId) {
    const index = this.requestQueue.findIndex(req => req.id === requestId);
    if (index !== -1) {
      const request = this.requestQueue.splice(index, 1)[0];
      if (request && request.reject && typeof request.reject === 'function') {
        try {
          request.reject(new Error('Translation request cancelled'));
        } catch (error) {
          // Ignore errors from already resolved/rejected promises
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return {
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessingQueue,
      oldestRequest: this.requestQueue.length > 0 ? 
        Date.now() - this.requestQueue[0].timestamp : 0,
      averageWaitTime: this.calculateAverageWaitTime()
    };
  }

  /**
   * Calculate average wait time for completed requests
   */
  calculateAverageWaitTime() {
    // This would be implemented with historical data tracking
    // For now, return estimated wait time based on queue length
    return this.requestQueue.length * this.rateLimitDelay;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TranslationService;
} else if (typeof window !== 'undefined') {
  window.TranslationService = TranslationService;
}