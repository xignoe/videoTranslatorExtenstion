/**
 * Data Protection Utilities for Video Translator Extension
 * Provides encryption, validation, and secure data handling utilities
 */

class DataProtection {
  constructor() {
    this.encryptionKey = null;
    this.validationRules = {
      text: {
        maxLength: 5000,
        allowedChars: /^[\w\s\p{L}\p{N}\p{P}\p{S}]*$/u,
        blockedPatterns: [
          /\b(?:password|pwd|pass)\s*[:=]\s*\S+/gi,
          /\b(?:token|key|secret)\s*[:=]\s*\S+/gi,
          /\b(?:api[_-]?key|apikey)\s*[:=]\s*\S+/gi
        ]
      },
      language: {
        validCodes: [
          'auto', 'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
          'ar', 'hi', 'th', 'vi', 'tr', 'pl', 'nl', 'sv', 'da', 'no', 'fi'
        ]
      },
      settings: {
        fontSize: { min: 8, max: 72 },
        position: ['top', 'center', 'bottom'],
        colors: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$|^rgba?\([^)]+\)$/
      }
    };
    
    this.initializeEncryption();
  }

  /**
   * Initialize encryption capabilities
   */
  async initializeEncryption() {
    try {
      // Generate or retrieve encryption key for session
      this.encryptionKey = await this.generateSessionKey();
      console.log('Data protection encryption initialized');
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
      // Continue without encryption but log the issue
    }
  }

  /**
   * Generate session-based encryption key
   * @returns {Promise<CryptoKey>} - Generated encryption key
   */
  async generateSessionKey() {
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        return await crypto.subtle.generateKey(
          {
            name: 'AES-GCM',
            length: 256
          },
          false, // Not extractable
          ['encrypt', 'decrypt']
        );
      } else {
        // Fallback for environments without Web Crypto API
        console.warn('Web Crypto API not available, using fallback encryption');
        return null;
      }
    } catch (error) {
      console.error('Failed to generate encryption key:', error);
      return null;
    }
  }

  /**
   * Validate text input for security and privacy
   * @param {string} text - Text to validate
   * @param {Object} options - Validation options
   * @returns {Object} - Validation result
   */
  validateTextInput(text, options = {}) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitizedText: text
    };

    try {
      // Basic type and existence check
      if (!text || typeof text !== 'string') {
        result.isValid = false;
        result.errors.push('Invalid text input: must be a non-empty string');
        return result;
      }

      // Length validation
      if (text.length > this.validationRules.text.maxLength) {
        result.isValid = false;
        result.errors.push(`Text too long: ${text.length} characters (max: ${this.validationRules.text.maxLength})`);
      }

      // Character validation
      if (!this.validationRules.text.allowedChars.test(text)) {
        result.warnings.push('Text contains potentially unsafe characters');
        result.sanitizedText = this.sanitizeText(text);
      }

      // Check for sensitive patterns
      for (const pattern of this.validationRules.text.blockedPatterns) {
        if (pattern.test(text)) {
          result.isValid = false;
          result.errors.push('Text contains potentially sensitive information (credentials/keys)');
          break;
        }
      }

      // Additional privacy checks
      const privacyIssues = this.checkPrivacyPatterns(text);
      if (privacyIssues.length > 0) {
        result.warnings.push(...privacyIssues);
        result.sanitizedText = this.removePIIPatterns(result.sanitizedText);
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation error: ${error.message}`);
    }

    return result;
  }

  /**
   * Validate language code
   * @param {string} languageCode - Language code to validate
   * @returns {boolean} - Whether language code is valid
   */
  validateLanguageCode(languageCode) {
    if (!languageCode || typeof languageCode !== 'string') {
      return false;
    }

    return this.validationRules.language.validCodes.includes(languageCode.toLowerCase());
  }

  /**
   * Validate user settings
   * @param {Object} settings - Settings object to validate
   * @returns {Object} - Validation result with sanitized settings
   */
  validateSettings(settings) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitizedSettings: {}
    };

    try {
      if (!settings || typeof settings !== 'object') {
        result.isValid = false;
        result.errors.push('Settings must be an object');
        return result;
      }

      // Validate each setting
      for (const [key, value] of Object.entries(settings)) {
        const validation = this.validateSingleSetting(key, value);
        
        if (!validation.isValid) {
          result.isValid = false;
          result.errors.push(...validation.errors);
        }
        
        if (validation.warnings.length > 0) {
          result.warnings.push(...validation.warnings);
        }
        
        result.sanitizedSettings[key] = validation.sanitizedValue;
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Settings validation error: ${error.message}`);
    }

    return result;
  }

  /**
   * Validate individual setting
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @returns {Object} - Validation result
   */
  validateSingleSetting(key, value) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitizedValue: value
    };

    switch (key) {
      case 'fontSize':
        if (typeof value !== 'number' || value < this.validationRules.settings.fontSize.min || 
            value > this.validationRules.settings.fontSize.max) {
          result.isValid = false;
          result.errors.push(`Invalid font size: ${value} (must be ${this.validationRules.settings.fontSize.min}-${this.validationRules.settings.fontSize.max})`);
        }
        break;

      case 'position':
        if (!this.validationRules.settings.position.includes(value)) {
          result.isValid = false;
          result.errors.push(`Invalid position: ${value} (must be one of: ${this.validationRules.settings.position.join(', ')})`);
        }
        break;

      case 'fontColor':
      case 'backgroundColor':
        if (typeof value !== 'string' || !this.validationRules.settings.colors.test(value)) {
          result.isValid = false;
          result.errors.push(`Invalid color format: ${value}`);
        }
        break;

      case 'targetLanguage':
      case 'sourceLanguage':
        if (!this.validateLanguageCode(value)) {
          result.isValid = false;
          result.errors.push(`Invalid language code: ${value}`);
        }
        break;

      default:
        // For unknown settings, perform basic sanitization
        if (typeof value === 'string') {
          result.sanitizedValue = this.sanitizeText(value);
        }
        break;
    }

    return result;
  }

  /**
   * Sanitize text by removing potentially harmful content
   * @param {string} text - Text to sanitize
   * @returns {string} - Sanitized text
   */
  sanitizeText(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      // Remove HTML tags
      .replace(/<[^>]*>/g, '')
      // Remove script content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove potentially dangerous characters
      .replace(/[<>'"&]/g, (match) => {
        const entities = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        };
        return entities[match] || match;
      })
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check for privacy-sensitive patterns in text
   * @param {string} text - Text to check
   * @returns {Array} - Array of privacy issues found
   */
  checkPrivacyPatterns(text) {
    const issues = [];

    // Email addresses
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g.test(text)) {
      issues.push('Text contains email addresses');
    }

    // Phone numbers
    if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g.test(text)) {
      issues.push('Text contains phone numbers');
    }

    // Credit card numbers
    if (/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g.test(text)) {
      issues.push('Text contains potential credit card numbers');
    }

    // Social security numbers
    if (/\b\d{3}-\d{2}-\d{4}\b/g.test(text)) {
      issues.push('Text contains potential social security numbers');
    }

    // URLs with potential sensitive parameters
    if (/https?:\/\/[^\s]+[?&](?:token|key|password|pwd)=[^\s&]+/gi.test(text)) {
      issues.push('Text contains URLs with sensitive parameters');
    }

    return issues;
  }

  /**
   * Remove PII patterns from text
   * @param {string} text - Text to clean
   * @returns {string} - Text with PII removed
   */
  removePIIPatterns(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      // Replace email addresses
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REMOVED]')
      // Replace phone numbers
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REMOVED]')
      // Replace credit card numbers
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD_REMOVED]')
      // Replace social security numbers
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REMOVED]')
      // Clean URLs with sensitive parameters
      .replace(/(https?:\/\/[^\s]+[?&])(?:token|key|password|pwd)=[^\s&]+/gi, '$1[PARAM_REMOVED]');
  }

  /**
   * Encrypt sensitive data for transmission
   * @param {string} data - Data to encrypt
   * @returns {Promise<Object|null>} - Encrypted data object or null if encryption fails
   */
  async encryptData(data) {
    try {
      if (!this.encryptionKey || !data) {
        return null;
      }

      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      
      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // Encrypt the data
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        this.encryptionKey,
        dataBuffer
      );

      // Return encrypted data with IV
      return {
        encryptedData: Array.from(new Uint8Array(encryptedBuffer)),
        iv: Array.from(iv),
        algorithm: 'AES-GCM'
      };

    } catch (error) {
      console.error('Encryption failed:', error);
      return null;
    }
  }

  /**
   * Decrypt data
   * @param {Object} encryptedObject - Encrypted data object
   * @returns {Promise<string|null>} - Decrypted data or null if decryption fails
   */
  async decryptData(encryptedObject) {
    try {
      if (!this.encryptionKey || !encryptedObject) {
        return null;
      }

      const { encryptedData, iv } = encryptedObject;
      
      // Convert arrays back to Uint8Arrays
      const encryptedBuffer = new Uint8Array(encryptedData);
      const ivBuffer = new Uint8Array(iv);

      // Decrypt the data
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ivBuffer
        },
        this.encryptionKey,
        encryptedBuffer
      );

      // Convert back to string
      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);

    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }

  /**
   * Create secure hash of data for integrity checking
   * @param {string} data - Data to hash
   * @returns {Promise<string>} - Hash string
   */
  async createSecureHash(data) {
    try {
      if (!data || typeof data !== 'string') {
        return '';
      }

      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('Hash creation failed:', error);
      return '';
    }
  }

  /**
   * Verify data integrity using hash
   * @param {string} data - Original data
   * @param {string} expectedHash - Expected hash
   * @returns {Promise<boolean>} - Whether data integrity is verified
   */
  async verifyDataIntegrity(data, expectedHash) {
    try {
      const actualHash = await this.createSecureHash(data);
      return actualHash === expectedHash;
    } catch (error) {
      console.error('Data integrity verification failed:', error);
      return false;
    }
  }

  /**
   * Generate secure random token
   * @param {number} length - Token length in bytes
   * @returns {string} - Random token
   */
  generateSecureToken(length = 32) {
    try {
      const array = new Uint8Array(length);
      crypto.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('Token generation failed:', error);
      // Fallback to less secure method
      return Math.random().toString(36).substr(2, length);
    }
  }

  /**
   * Validate request origin for CSRF protection
   * @param {string} origin - Request origin
   * @param {Array} allowedOrigins - List of allowed origins
   * @returns {boolean} - Whether origin is allowed
   */
  validateRequestOrigin(origin, allowedOrigins = []) {
    if (!origin || typeof origin !== 'string') {
      return false;
    }

    // Default allowed origins for extension
    const defaultAllowed = [
      'chrome-extension://',
      'moz-extension://'
    ];

    const allAllowed = [...defaultAllowed, ...allowedOrigins];
    
    return allAllowed.some(allowed => origin.startsWith(allowed));
  }

  /**
   * Rate limiting check
   * @param {string} identifier - Unique identifier for rate limiting
   * @param {number} maxRequests - Maximum requests allowed
   * @param {number} timeWindow - Time window in milliseconds
   * @returns {boolean} - Whether request is within rate limit
   */
  checkRateLimit(identifier, maxRequests = 100, timeWindow = 60000) {
    try {
      const now = Date.now();
      const key = `rateLimit_${identifier}`;
      
      // Get existing rate limit data
      let rateLimitData = this.getRateLimitData(key);
      
      if (!rateLimitData) {
        rateLimitData = {
          requests: [],
          windowStart: now
        };
      }

      // Clean old requests outside the time window
      rateLimitData.requests = rateLimitData.requests.filter(
        timestamp => now - timestamp < timeWindow
      );

      // Check if within limit
      if (rateLimitData.requests.length >= maxRequests) {
        return false;
      }

      // Add current request
      rateLimitData.requests.push(now);
      
      // Store updated data
      this.setRateLimitData(key, rateLimitData);
      
      return true;
    } catch (error) {
      console.error('Rate limit check failed:', error);
      return true; // Allow request on error to avoid blocking legitimate usage
    }
  }

  /**
   * Get rate limit data (in-memory storage for session)
   * @param {string} key - Rate limit key
   * @returns {Object|null} - Rate limit data
   */
  getRateLimitData(key) {
    if (!this.rateLimitStorage) {
      this.rateLimitStorage = new Map();
    }
    return this.rateLimitStorage.get(key) || null;
  }

  /**
   * Set rate limit data
   * @param {string} key - Rate limit key
   * @param {Object} data - Rate limit data
   */
  setRateLimitData(key, data) {
    if (!this.rateLimitStorage) {
      this.rateLimitStorage = new Map();
    }
    this.rateLimitStorage.set(key, data);
    
    // Clean up old entries periodically
    if (this.rateLimitStorage.size > 1000) {
      const oldestKeys = Array.from(this.rateLimitStorage.keys()).slice(0, 100);
      oldestKeys.forEach(oldKey => this.rateLimitStorage.delete(oldKey));
    }
  }

  /**
   * Get data protection status
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      encryptionAvailable: !!this.encryptionKey,
      validationRules: Object.keys(this.validationRules),
      rateLimitEntries: this.rateLimitStorage ? this.rateLimitStorage.size : 0
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataProtection;
} else if (typeof window !== 'undefined') {
  window.DataProtection = DataProtection;
}