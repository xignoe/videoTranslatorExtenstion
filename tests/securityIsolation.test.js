/**
 * Tests for SecurityIsolation
 * Validates content script isolation, input validation, and security measures
 */

const SecurityIsolation = require('../content/securityIsolation.js');

// Mock DOM APIs
global.document = {
  body: {
    appendChild: jest.fn()
  },
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(),
  createElement: jest.fn().mockImplementation((tagName) => ({
    tagName: tagName.toUpperCase(),
    id: '',
    style: { cssText: '' },
    textContent: '',
    appendChild: jest.fn(),
    attachShadow: jest.fn().mockReturnValue({
      appendChild: jest.fn()
    })
  }))
};

global.window = {
  fetch: jest.fn(),
  innerWidth: 1920,
  innerHeight: 1080
};

global.EventTarget = {
  prototype: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }
};

global.Document = {
  prototype: {
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(),
    createElement: jest.fn()
  }
};

global.Element = {
  prototype: {
    setAttribute: jest.fn(),
    getAttribute: jest.fn(),
    attachShadow: jest.fn()
  }
};

global.MutationObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn()
}));

global.URL = jest.fn().mockImplementation((url) => {
  const urlParts = url.split('://');
  const protocol = urlParts[0] + ':';
  const rest = urlParts[1] || '';
  const hostname = rest.split('/')[0] || '';
  
  return {
    protocol,
    hostname,
    href: url
  };
});

// Mock Chrome APIs
global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn()
    }
  }
};

describe('SecurityIsolation', () => {
  let securityIsolation;

  beforeEach(() => {
    securityIsolation = new SecurityIsolation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (securityIsolation) {
      securityIsolation.cleanup();
    }
  });

  describe('Initialization', () => {
    test('should initialize with unique isolation namespace', () => {
      expect(securityIsolation.isolationNamespace).toBeDefined();
      expect(securityIsolation.isolationNamespace).toMatch(/^videoTranslator_\d+_[a-z0-9]+$/);
    });

    test('should initialize security measures', () => {
      expect(securityIsolation.isolatedContext).toBeDefined();
      expect(securityIsolation.secureEventHandlers).toBeDefined();
      expect(securityIsolation.messageValidators).toBeDefined();
      expect(securityIsolation.trustedOrigins).toBeDefined();
    });

    test('should set up trusted origins', () => {
      expect(securityIsolation.trustedOrigins.has('chrome-extension://')).toBe(true);
      expect(securityIsolation.trustedOrigins.has('moz-extension://')).toBe(true);
    });
  });

  describe('Content Script Isolation', () => {
    test('should create isolated context with original functions', () => {
      expect(securityIsolation.isolatedContext.originalFetch).toBeDefined();
      expect(securityIsolation.isolatedContext.originalAddEventListener).toBeDefined();
      expect(securityIsolation.isolatedContext.originalQuerySelector).toBeDefined();
    });

    test('should create secure DOM access methods', () => {
      expect(securityIsolation.secureDOM).toBeDefined();
      expect(securityIsolation.secureDOM.querySelector).toBeDefined();
      expect(securityIsolation.secureDOM.querySelectorAll).toBeDefined();
      expect(securityIsolation.secureDOM.createElement).toBeDefined();
    });

    test('should validate DOM selectors', () => {
      expect(securityIsolation.validateDOMSelector('div.class')).toBe(true);
      expect(securityIsolation.validateDOMSelector('#id')).toBe(true);
      expect(securityIsolation.validateDOMSelector('javascript:alert(1)')).toBe(false);
      expect(securityIsolation.validateDOMSelector('<script>alert(1)</script>')).toBe(false);
    });

    test('should validate element tag names', () => {
      expect(securityIsolation.validateElementTagName('div')).toBe(true);
      expect(securityIsolation.validateElementTagName('span')).toBe(true);
      expect(securityIsolation.validateElementTagName('script')).toBe(false);
      expect(securityIsolation.validateElementTagName('object')).toBe(false);
    });
  });

  describe('DOM Isolation', () => {
    test('should create isolated container', () => {
      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(document.body.appendChild).toHaveBeenCalled();
    });

    test('should generate isolated styles', () => {
      const styles = securityIsolation.getIsolatedStyles();
      
      expect(styles).toContain('all: initial !important');
      expect(styles).toContain('video-translator-subtitle');
      expect(styles).toContain('video-translator-status');
    });

    test('should set up element protection', () => {
      expect(MutationObserver).toHaveBeenCalled();
      const observerInstance = MutationObserver.mock.instances[0];
      expect(observerInstance.observe).toHaveBeenCalledWith(document.body, {
        childList: true,
        subtree: true
      });
    });
  });

  describe('Message Validation', () => {
    test('should validate message origin', () => {
      const trustedSender = { origin: 'chrome-extension://abcdefg' };
      const untrustedSender = { origin: 'https://malicious-site.com' };

      expect(securityIsolation.validateMessageOrigin(trustedSender)).toBe(true);
      expect(securityIsolation.validateMessageOrigin(untrustedSender)).toBe(false);
    });

    test('should validate message structure', () => {
      const validMessage = { type: 'translation_request', data: {} };
      const invalidMessage = { type: 'invalid_type', data: {} };
      const malformedMessage = 'not an object';

      expect(securityIsolation.validateMessage(validMessage)).toBe(true);
      expect(securityIsolation.validateMessage(invalidMessage)).toBe(false);
      expect(securityIsolation.validateMessage(malformedMessage)).toBe(false);
    });

    test('should validate translation messages', () => {
      const validTranslationMessage = {
        type: 'translation_request',
        data: {
          text: 'Hello world',
          sourceLanguage: 'en',
          targetLanguage: 'es'
        }
      };

      const invalidTranslationMessage = {
        type: 'translation_request',
        data: {
          text: '<script>alert(1)</script>',
          sourceLanguage: 'invalid',
          targetLanguage: 'es'
        }
      };

      expect(securityIsolation.validateTranslationMessage(validTranslationMessage)).toBe(true);
      expect(securityIsolation.validateTranslationMessage(invalidTranslationMessage)).toBe(false);
    });

    test('should validate audio messages', () => {
      const validAudioMessage = {
        type: 'audio_data',
        data: {
          audioLevel: 0.5,
          timestamp: Date.now()
        }
      };

      const invalidAudioMessage = {
        type: 'audio_data',
        data: {
          audioLevel: 2.0, // Invalid: > 1
          timestamp: -1 // Invalid: negative
        }
      };

      expect(securityIsolation.validateAudioMessage(validAudioMessage)).toBe(true);
      expect(securityIsolation.validateAudioMessage(invalidAudioMessage)).toBe(false);
    });

    test('should validate settings messages', () => {
      const validSettingsMessage = {
        type: 'settings_update',
        data: {
          fontSize: 16,
          position: 'bottom'
        }
      };

      expect(securityIsolation.validateSettingsMessage(validSettingsMessage)).toBe(true);
    });

    test('should validate privacy messages', () => {
      const validPrivacyMessage = {
        type: 'privacy_consent',
        data: {
          consentType: 'audioProcessing',
          granted: true
        }
      };

      const invalidPrivacyMessage = {
        type: 'privacy_consent',
        data: {
          consentType: 'invalidType',
          granted: 'not a boolean'
        }
      };

      expect(securityIsolation.validatePrivacyMessage(validPrivacyMessage)).toBe(true);
      expect(securityIsolation.validatePrivacyMessage(invalidPrivacyMessage)).toBe(false);
    });
  });

  describe('Input Validation', () => {
    test('should validate text input', () => {
      expect(securityIsolation.validateTextInput('Hello world')).toBe(true);
      expect(securityIsolation.validateTextInput('')).toBe(false);
      expect(securityIsolation.validateTextInput(null)).toBe(false);
      expect(securityIsolation.validateTextInput('a'.repeat(20000))).toBe(false); // Too long
    });

    test('should block dangerous text patterns', () => {
      expect(securityIsolation.validateTextInput('<script>alert(1)</script>')).toBe(false);
      expect(securityIsolation.validateTextInput('javascript:alert(1)')).toBe(false);
      expect(securityIsolation.validateTextInput('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    test('should validate language codes', () => {
      expect(securityIsolation.validateLanguageCode('en')).toBe(true);
      expect(securityIsolation.validateLanguageCode('es')).toBe(true);
      expect(securityIsolation.validateLanguageCode('auto')).toBe(true);
      expect(securityIsolation.validateLanguageCode('en-US')).toBe(true);
      expect(securityIsolation.validateLanguageCode('invalid')).toBe(false);
      expect(securityIsolation.validateLanguageCode('')).toBe(false);
      expect(securityIsolation.validateLanguageCode(null)).toBe(false);
    });

    test('should sanitize user input', () => {
      const maliciousInput = '<script>alert("xss")</script>Hello <b>world</b>';
      const sanitized = securityIsolation.sanitizeInput(maliciousInput);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('<b>');
      expect(sanitized).toContain('&lt;');
      expect(sanitized).toContain('&gt;');
    });

    test('should handle empty or invalid input in sanitization', () => {
      expect(securityIsolation.sanitizeInput('')).toBe('');
      expect(securityIsolation.sanitizeInput(null)).toBe('');
      expect(securityIsolation.sanitizeInput(undefined)).toBe('');
    });
  });

  describe('Event Handling', () => {
    test('should create secure event handlers', () => {
      const mockElement = { addEventListener: jest.fn() };
      const mockHandler = jest.fn();

      const handlerId = securityIsolation.createSecureEventHandler(mockElement, 'click', mockHandler);

      expect(handlerId).toBeDefined();
      expect(securityIsolation.secureEventHandlers.has(handlerId)).toBe(true);
    });

    test('should remove secure event handlers', () => {
      const mockElement = { 
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      };
      const mockHandler = jest.fn();

      const handlerId = securityIsolation.createSecureEventHandler(mockElement, 'click', mockHandler);
      securityIsolation.removeSecureEventHandler(handlerId);

      expect(securityIsolation.secureEventHandlers.has(handlerId)).toBe(false);
    });

    test('should validate events', () => {
      const trustedEvent = { isTrusted: true, type: 'click', clientX: 100, clientY: 100 };
      const untrustedEvent = { isTrusted: false, type: 'click' };
      const invalidEvent = null;

      expect(securityIsolation.validateEvent(trustedEvent)).toBe(true);
      expect(securityIsolation.validateEvent(untrustedEvent)).toBe(false);
      expect(securityIsolation.validateEvent(invalidEvent)).toBe(false);
    });

    test('should validate mouse events', () => {
      const validMouseEvent = { clientX: 100, clientY: 100 };
      const invalidMouseEvent = { clientX: -100, clientY: -100 };

      expect(securityIsolation.validateMouseEvent(validMouseEvent)).toBe(true);
      expect(securityIsolation.validateMouseEvent(invalidMouseEvent)).toBe(false);
    });

    test('should validate keyboard events', () => {
      const normalKeyEvent = { ctrlKey: false, altKey: false, shiftKey: false };
      const dangerousKeyEvent = { ctrlKey: true, altKey: true, shiftKey: true };

      expect(securityIsolation.validateKeyboardEvent(normalKeyEvent)).toBe(true);
      expect(securityIsolation.validateKeyboardEvent(dangerousKeyEvent)).toBe(false);
    });
  });

  describe('Secure Fetch', () => {
    test('should create secure fetch wrapper', () => {
      const secureFetch = securityIsolation.createSecureFetch();

      expect(typeof secureFetch).toBe('function');
    });

    test('should validate URLs', () => {
      expect(securityIsolation.validateURL('https://api.example.com')).toBe(true);
      expect(securityIsolation.validateURL('chrome-extension://abcdefg/page.html')).toBe(true);
      expect(securityIsolation.validateURL('http://insecure.com')).toBe(false);
      expect(securityIsolation.validateURL('ftp://files.com')).toBe(false);
    });

    test('should block private/local addresses', () => {
      expect(securityIsolation.validateURL('https://localhost:3000')).toBe(false);
      expect(securityIsolation.validateURL('https://127.0.0.1')).toBe(false);
      expect(securityIsolation.validateURL('https://192.168.1.1')).toBe(false);
      expect(securityIsolation.validateURL('https://10.0.0.1')).toBe(false);
      expect(securityIsolation.validateURL('https://172.16.0.1')).toBe(false);
    });

    test('should handle invalid URLs', () => {
      expect(securityIsolation.validateURL('not-a-url')).toBe(false);
      expect(securityIsolation.validateURL('')).toBe(false);
      expect(securityIsolation.validateURL(null)).toBe(false);
    });
  });

  describe('Security Status', () => {
    test('should return security status', () => {
      const status = securityIsolation.getSecurityStatus();

      expect(status).toBeDefined();
      expect(status.isolationNamespace).toBeDefined();
      expect(status.secureEventHandlers).toBe(0);
      expect(status.isolatedElements).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    test('should cleanup all security resources', () => {
      // Add some test data
      const mockElement = { 
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      };
      securityIsolation.createSecureEventHandler(mockElement, 'click', jest.fn());

      // Mock container
      securityIsolation.isolatedContainer = {
        parentNode: {
          removeChild: jest.fn()
        }
      };

      // Mock observer
      securityIsolation.protectionObserver = {
        disconnect: jest.fn()
      };

      securityIsolation.cleanup();

      expect(securityIsolation.secureEventHandlers.size).toBe(0);
      expect(securityIsolation.protectionObserver).toBeNull();
      expect(securityIsolation.isolatedContainer).toBeNull();
    });

    test('should handle cleanup errors gracefully', () => {
      // Mock error in cleanup
      securityIsolation.isolatedContainer = {
        parentNode: {
          removeChild: jest.fn().mockImplementation(() => {
            throw new Error('Cleanup error');
          })
        }
      };

      // Should not throw
      expect(() => {
        securityIsolation.cleanup();
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle validation errors gracefully', () => {
      // Mock validation error
      const originalValidateTextInput = securityIsolation.validateTextInput;
      securityIsolation.validateTextInput = jest.fn().mockImplementation(() => {
        throw new Error('Validation error');
      });

      const message = {
        type: 'translation_request',
        data: { text: 'test', sourceLanguage: 'en', targetLanguage: 'es' }
      };

      // Should not throw and should return false
      expect(securityIsolation.validateMessage(message)).toBe(false);

      // Restore original method
      securityIsolation.validateTextInput = originalValidateTextInput;
    });

    test('should handle event handler errors gracefully', () => {
      const mockElement = { addEventListener: jest.fn() };
      const errorHandler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });

      const handlerId = securityIsolation.createSecureEventHandler(mockElement, 'click', errorHandler);
      const handlerInfo = securityIsolation.secureEventHandlers.get(handlerId);

      // Simulate event
      const mockEvent = { isTrusted: true, type: 'click', clientX: 100, clientY: 100 };

      // Should not throw
      expect(() => {
        handlerInfo.handler(mockEvent);
      }).not.toThrow();
    });
  });
});