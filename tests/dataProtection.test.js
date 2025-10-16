/**
 * Tests for DataProtection
 * Validates data validation, sanitization, encryption, and security utilities
 */

const DataProtection = require('../content/dataProtection.js');

// Mock Web Crypto API
global.crypto = {
  subtle: {
    generateKey: jest.fn(),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
    digest: jest.fn()
  },
  getRandomValues: jest.fn()
};

describe('DataProtection', () => {
  let dataProtection;

  beforeEach(() => {
    dataProtection = new DataProtection();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with validation rules', () => {
      expect(dataProtection.validationRules).toBeDefined();
      expect(dataProtection.validationRules.text).toBeDefined();
      expect(dataProtection.validationRules.language).toBeDefined();
      expect(dataProtection.validationRules.settings).toBeDefined();
    });

    test('should initialize encryption capabilities', async () => {
      const mockKey = { type: 'secret' };
      crypto.subtle.generateKey.mockResolvedValue(mockKey);

      await dataProtection.initializeEncryption();

      expect(crypto.subtle.generateKey).toHaveBeenCalledWith(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    });
  });

  describe('Text Validation', () => {
    test('should validate clean text input', () => {
      const text = 'Hello world, this is a test message.';
      const result = dataProtection.validateTextInput(text);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedText).toBe(text);
    });

    test('should reject empty or invalid text', () => {
      const result1 = dataProtection.validateTextInput('');
      const result2 = dataProtection.validateTextInput(null);
      const result3 = dataProtection.validateTextInput(123);

      expect(result1.isValid).toBe(false);
      expect(result2.isValid).toBe(false);
      expect(result3.isValid).toBe(false);
    });

    test('should reject text that is too long', () => {
      const longText = 'a'.repeat(6000); // Exceeds maxLength of 5000
      const result = dataProtection.validateTextInput(longText);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Text too long');
    });

    test('should detect sensitive patterns', () => {
      const sensitiveText = 'My password is: secret123';
      const result = dataProtection.validateTextInput(sensitiveText);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('sensitive information');
    });

    test('should detect privacy issues', () => {
      const privacyText = 'Contact me at john@example.com or call 555-123-4567';
      const result = dataProtection.validateTextInput(privacyText);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('email'))).toBe(true);
      expect(result.warnings.some(w => w.includes('phone'))).toBe(true);
    });

    test('should sanitize text with HTML', () => {
      const htmlText = '<script>alert("xss")</script>Hello <b>world</b>';
      const result = dataProtection.validateTextInput(htmlText);

      expect(result.sanitizedText).not.toContain('<script>');
      expect(result.sanitizedText).not.toContain('<b>');
    });
  });

  describe('Language Code Validation', () => {
    test('should validate correct language codes', () => {
      expect(dataProtection.validateLanguageCode('en')).toBe(true);
      expect(dataProtection.validateLanguageCode('es')).toBe(true);
      expect(dataProtection.validateLanguageCode('auto')).toBe(true);
    });

    test('should reject invalid language codes', () => {
      expect(dataProtection.validateLanguageCode('invalid')).toBe(false);
      expect(dataProtection.validateLanguageCode('')).toBe(false);
      expect(dataProtection.validateLanguageCode(null)).toBe(false);
      expect(dataProtection.validateLanguageCode(123)).toBe(false);
    });
  });

  describe('Settings Validation', () => {
    test('should validate correct settings', () => {
      const settings = {
        fontSize: 16,
        position: 'bottom',
        fontColor: '#ffffff',
        targetLanguage: 'en'
      };

      const result = dataProtection.validateSettings(settings);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedSettings).toEqual(settings);
    });

    test('should reject invalid font size', () => {
      const settings = { fontSize: 100 }; // Exceeds max of 72
      const result = dataProtection.validateSettings(settings);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Invalid font size');
    });

    test('should reject invalid position', () => {
      const settings = { position: 'invalid' };
      const result = dataProtection.validateSettings(settings);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Invalid position');
    });

    test('should reject invalid color format', () => {
      const settings = { fontColor: 'not-a-color' };
      const result = dataProtection.validateSettings(settings);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Invalid color format');
    });

    test('should validate color formats', () => {
      const validColors = ['#ffffff', '#fff', 'rgba(255,255,255,1)', 'rgb(255,255,255)'];
      
      validColors.forEach(color => {
        const settings = { fontColor: color };
        const result = dataProtection.validateSettings(settings);
        expect(result.isValid).toBe(true);
      });
    });

    test('should sanitize unknown string settings', () => {
      const settings = { unknownSetting: '<script>alert("xss")</script>' };
      const result = dataProtection.validateSettings(settings);

      expect(result.sanitizedSettings.unknownSetting).not.toContain('<script>');
    });
  });

  describe('Text Sanitization', () => {
    test('should remove HTML tags', () => {
      const htmlText = '<div>Hello <span>world</span></div>';
      const sanitized = dataProtection.sanitizeText(htmlText);

      expect(sanitized).toBe('Hello world');
    });

    test('should remove script content', () => {
      const scriptText = 'Hello <script>alert("xss")</script> world';
      const sanitized = dataProtection.sanitizeText(scriptText);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
    });

    test('should escape dangerous characters', () => {
      const dangerousText = 'Hello <world> & "quotes" \'apostrophes\'';
      const sanitized = dataProtection.sanitizeText(dangerousText);

      expect(sanitized).toContain('&lt;');
      expect(sanitized).toContain('&gt;');
      expect(sanitized).toContain('&amp;');
      expect(sanitized).toContain('&quot;');
      expect(sanitized).toContain('&#x27;');
    });

    test('should normalize whitespace', () => {
      const messyText = '  Hello    world  \n\n  test  ';
      const sanitized = dataProtection.sanitizeText(messyText);

      expect(sanitized).toBe('Hello world test');
    });
  });

  describe('Privacy Pattern Detection', () => {
    test('should detect email addresses', () => {
      const text = 'Contact john@example.com for more info';
      const issues = dataProtection.checkPrivacyPatterns(text);

      expect(issues.some(issue => issue.includes('email'))).toBe(true);
    });

    test('should detect phone numbers', () => {
      const text = 'Call me at 555-123-4567';
      const issues = dataProtection.checkPrivacyPatterns(text);

      expect(issues.some(issue => issue.includes('phone'))).toBe(true);
    });

    test('should detect credit card numbers', () => {
      const text = 'My card number is 1234 5678 9012 3456';
      const issues = dataProtection.checkPrivacyPatterns(text);

      expect(issues.some(issue => issue.includes('credit card'))).toBe(true);
    });

    test('should detect social security numbers', () => {
      const text = 'SSN: 123-45-6789';
      const issues = dataProtection.checkPrivacyPatterns(text);

      expect(issues.some(issue => issue.includes('social security'))).toBe(true);
    });

    test('should detect URLs with sensitive parameters', () => {
      const text = 'Visit https://example.com?token=secret123';
      const issues = dataProtection.checkPrivacyPatterns(text);

      expect(issues.some(issue => issue.includes('URLs with sensitive'))).toBe(true);
    });
  });

  describe('PII Removal', () => {
    test('should remove email addresses', () => {
      const text = 'Contact john@example.com for help';
      const cleaned = dataProtection.removePIIPatterns(text);

      expect(cleaned).toContain('[EMAIL_REMOVED]');
      expect(cleaned).not.toContain('john@example.com');
    });

    test('should remove phone numbers', () => {
      const text = 'Call 555-123-4567 or 555.987.6543';
      const cleaned = dataProtection.removePIIPatterns(text);

      expect(cleaned).toContain('[PHONE_REMOVED]');
      expect(cleaned).not.toContain('555-123-4567');
    });

    test('should remove credit card numbers', () => {
      const text = 'Card: 1234-5678-9012-3456';
      const cleaned = dataProtection.removePIIPatterns(text);

      expect(cleaned).toContain('[CARD_REMOVED]');
      expect(cleaned).not.toContain('1234-5678-9012-3456');
    });

    test('should clean URLs with sensitive parameters', () => {
      const text = 'https://example.com?token=secret&key=value';
      const cleaned = dataProtection.removePIIPatterns(text);

      expect(cleaned).toContain('[PARAM_REMOVED]');
      expect(cleaned).not.toContain('token=secret');
    });
  });

  describe('Encryption', () => {
    beforeEach(() => {
      // Mock successful encryption
      crypto.subtle.encrypt.mockResolvedValue(new ArrayBuffer(16));
      crypto.subtle.decrypt.mockResolvedValue(new ArrayBuffer(16));
      crypto.getRandomValues.mockImplementation((array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
        return array;
      });
      
      // Mock TextEncoder/TextDecoder
      global.TextEncoder = jest.fn().mockImplementation(() => ({
        encode: jest.fn().mockReturnValue(new Uint8Array([72, 101, 108, 108, 111]))
      }));
      global.TextDecoder = jest.fn().mockImplementation(() => ({
        decode: jest.fn().mockReturnValue('Hello')
      }));
    });

    test('should encrypt data successfully', async () => {
      dataProtection.encryptionKey = { type: 'secret' };
      
      const result = await dataProtection.encryptData('Hello world');

      expect(result).toBeDefined();
      expect(result.encryptedData).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.algorithm).toBe('AES-GCM');
    });

    test('should return null for encryption without key', async () => {
      dataProtection.encryptionKey = null;
      
      const result = await dataProtection.encryptData('Hello world');

      expect(result).toBeNull();
    });

    test('should decrypt data successfully', async () => {
      dataProtection.encryptionKey = { type: 'secret' };
      
      const encryptedObject = {
        encryptedData: [1, 2, 3, 4],
        iv: [5, 6, 7, 8]
      };

      const result = await dataProtection.decryptData(encryptedObject);

      expect(result).toBe('Hello');
    });

    test('should handle encryption errors gracefully', async () => {
      dataProtection.encryptionKey = { type: 'secret' };
      crypto.subtle.encrypt.mockRejectedValue(new Error('Encryption failed'));

      const result = await dataProtection.encryptData('Hello world');

      expect(result).toBeNull();
    });
  });

  describe('Hashing', () => {
    beforeEach(() => {
      crypto.subtle.digest.mockResolvedValue(new ArrayBuffer(32));
      global.TextEncoder = jest.fn().mockImplementation(() => ({
        encode: jest.fn().mockReturnValue(new Uint8Array([72, 101, 108, 108, 111]))
      }));
    });

    test('should create secure hash', async () => {
      const hash = await dataProtection.createSecureHash('Hello world');

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(crypto.subtle.digest).toHaveBeenCalledWith('SHA-256', expect.any(Uint8Array));
    });

    test('should verify data integrity', async () => {
      const originalData = 'Hello world';
      const hash = await dataProtection.createSecureHash(originalData);
      
      const isValid = await dataProtection.verifyDataIntegrity(originalData, hash);

      expect(isValid).toBe(true);
    });

    test('should detect data tampering', async () => {
      const originalData = 'Hello world';
      const hash = await dataProtection.createSecureHash(originalData);
      const tamperedData = 'Hello world!';
      
      const isValid = await dataProtection.verifyDataIntegrity(tamperedData, hash);

      expect(isValid).toBe(false);
    });
  });

  describe('Token Generation', () => {
    beforeEach(() => {
      crypto.getRandomValues.mockImplementation((array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = i % 256;
        }
        return array;
      });
    });

    test('should generate secure token', () => {
      const token = dataProtection.generateSecureToken(16);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(32); // 16 bytes = 32 hex chars
    });

    test('should generate different tokens', () => {
      const token1 = dataProtection.generateSecureToken();
      const token2 = dataProtection.generateSecureToken();

      expect(token1).not.toBe(token2);
    });

    test('should fallback on crypto error', () => {
      crypto.getRandomValues.mockImplementation(() => {
        throw new Error('Crypto not available');
      });

      const token = dataProtection.generateSecureToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('Request Origin Validation', () => {
    test('should validate chrome extension origins', () => {
      const chromeOrigin = 'chrome-extension://abcdefghijklmnop';
      const isValid = dataProtection.validateRequestOrigin(chromeOrigin);

      expect(isValid).toBe(true);
    });

    test('should validate firefox extension origins', () => {
      const firefoxOrigin = 'moz-extension://abcdefgh-1234-5678-9012-abcdefghijkl';
      const isValid = dataProtection.validateRequestOrigin(firefoxOrigin);

      expect(isValid).toBe(true);
    });

    test('should reject invalid origins', () => {
      const invalidOrigin = 'https://malicious-site.com';
      const isValid = dataProtection.validateRequestOrigin(invalidOrigin);

      expect(isValid).toBe(false);
    });

    test('should validate custom allowed origins', () => {
      const customOrigin = 'https://trusted-site.com';
      const allowedOrigins = ['https://trusted-site.com'];
      const isValid = dataProtection.validateRequestOrigin(customOrigin, allowedOrigins);

      expect(isValid).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    test('should allow requests within rate limit', () => {
      const identifier = 'test-user';
      
      for (let i = 0; i < 5; i++) {
        const allowed = dataProtection.checkRateLimit(identifier, 10, 60000);
        expect(allowed).toBe(true);
      }
    });

    test('should block requests exceeding rate limit', () => {
      const identifier = 'test-user';
      const maxRequests = 3;
      
      // Make requests up to the limit
      for (let i = 0; i < maxRequests; i++) {
        const allowed = dataProtection.checkRateLimit(identifier, maxRequests, 60000);
        expect(allowed).toBe(true);
      }
      
      // Next request should be blocked
      const blocked = dataProtection.checkRateLimit(identifier, maxRequests, 60000);
      expect(blocked).toBe(false);
    });

    test('should reset rate limit after time window', () => {
      const identifier = 'test-user';
      const maxRequests = 2;
      const timeWindow = 100; // 100ms
      
      // Fill up the rate limit
      for (let i = 0; i < maxRequests; i++) {
        dataProtection.checkRateLimit(identifier, maxRequests, timeWindow);
      }
      
      // Should be blocked
      expect(dataProtection.checkRateLimit(identifier, maxRequests, timeWindow)).toBe(false);
      
      // Wait for time window to pass and test again
      return new Promise((resolve) => {
        setTimeout(() => {
          const allowed = dataProtection.checkRateLimit(identifier, maxRequests, timeWindow);
          expect(allowed).toBe(true);
          resolve();
        }, timeWindow + 10);
      });
    });

    test('should handle rate limit errors gracefully', () => {
      // Mock error in rate limit check
      const originalGetRateLimitData = dataProtection.getRateLimitData;
      dataProtection.getRateLimitData = jest.fn().mockImplementation(() => {
        throw new Error('Storage error');
      });

      const allowed = dataProtection.checkRateLimit('test-user');

      expect(allowed).toBe(true); // Should allow on error
      
      // Restore original method
      dataProtection.getRateLimitData = originalGetRateLimitData;
    });
  });

  describe('Status Reporting', () => {
    test('should return data protection status', () => {
      const status = dataProtection.getStatus();

      expect(status).toBeDefined();
      expect(status.encryptionAvailable).toBeDefined();
      expect(status.validationRules).toBeDefined();
      expect(status.rateLimitEntries).toBeDefined();
    });
  });
});