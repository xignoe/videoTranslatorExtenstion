/**
 * Security Isolation for Video Translator Extension
 * Implements content script isolation, input validation, and security measures
 * to prevent page interference and protect against vulnerabilities
 */

class SecurityIsolation {
  constructor() {
    this.isolationNamespace = `videoTranslator_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.secureEventHandlers = new Map();
    this.isolatedElements = new WeakSet();
    this.messageValidators = new Map();
    this.trustedOrigins = new Set([
      'chrome-extension://',
      'moz-extension://'
    ]);
    
    this.initializeSecurityMeasures();
  }

  /**
   * Initialize security measures and isolation
   */
  initializeSecurityMeasures() {
    try {
      // Set up content script isolation
      this.setupContentScriptIsolation();
      
      // Initialize secure messaging
      this.setupSecureMessaging();
      
      // Set up DOM isolation
      this.setupDOMIsolation();
      
      // Initialize input validation
      this.setupInputValidation();
      
      console.log('Security isolation initialized successfully');
    } catch (error) {
      console.error('Failed to initialize security isolation:', error);
    }
  }

  /**
   * Set up content script isolation to prevent page interference
   */
  setupContentScriptIsolation() {
    // Create isolated execution context
    this.isolatedContext = {
      // Store original functions to prevent tampering
      originalFetch: window.fetch.bind(window),
      originalAddEventListener: EventTarget.prototype.addEventListener.bind(EventTarget.prototype),
      originalRemoveEventListener: EventTarget.prototype.removeEventListener.bind(EventTarget.prototype),
      originalQuerySelector: Document.prototype.querySelector.bind(document),
      originalQuerySelectorAll: Document.prototype.querySelectorAll.bind(document),
      originalCreateElement: Document.prototype.createElement.bind(document),
      originalSetAttribute: Element.prototype.setAttribute.bind(Element.prototype),
      originalGetAttribute: Element.prototype.getAttribute.bind(Element.prototype)
    };

    // Prevent global namespace pollution
    this.createIsolatedNamespace();
    
    // Set up secure DOM access
    this.setupSecureDOMAccess();
  }

  /**
   * Create isolated namespace for extension components
   */
  createIsolatedNamespace() {
    // Create a unique namespace that won't conflict with page scripts
    if (!window[this.isolationNamespace]) {
      Object.defineProperty(window, this.isolationNamespace, {
        value: {},
        writable: false,
        enumerable: false,
        configurable: false
      });
    }

    // Store extension components in isolated namespace
    this.isolatedStorage = window[this.isolationNamespace];
  }

  /**
   * Set up secure DOM access methods
   */
  setupSecureDOMAccess() {
    const self = this;
    
    // Create secure DOM query methods
    this.secureDOM = {
      querySelector: function(selector) {
        try {
          // Validate selector to prevent injection
          if (!self.validateDOMSelector(selector)) {
            throw new Error('Invalid DOM selector');
          }
          return self.isolatedContext.originalQuerySelector(selector);
        } catch (error) {
          console.error('Secure querySelector failed:', error);
          return null;
        }
      },

      querySelectorAll: function(selector) {
        try {
          if (!self.validateDOMSelector(selector)) {
            throw new Error('Invalid DOM selector');
          }
          return self.isolatedContext.originalQuerySelectorAll(selector);
        } catch (error) {
          console.error('Secure querySelectorAll failed:', error);
          return [];
        }
      },

      createElement: function(tagName) {
        try {
          if (!self.validateElementTagName(tagName)) {
            throw new Error('Invalid element tag name');
          }
          const element = self.isolatedContext.originalCreateElement(tagName);
          self.isolatedElements.add(element);
          return element;
        } catch (error) {
          console.error('Secure createElement failed:', error);
          return null;
        }
      }
    };
  }

  /**
   * Set up secure messaging between extension components
   */
  setupSecureMessaging() {
    // Set up message validation
    this.messageValidators.set('translation_request', this.validateTranslationMessage.bind(this));
    this.messageValidators.set('audio_data', this.validateAudioMessage.bind(this));
    this.messageValidators.set('settings_update', this.validateSettingsMessage.bind(this));
    this.messageValidators.set('privacy_consent', this.validatePrivacyMessage.bind(this));

    // Set up secure message listener
    this.setupSecureMessageListener();
  }

  /**
   * Set up secure message listener with validation
   */
  setupSecureMessageListener() {
    const self = this;
    
    // Override chrome.runtime.onMessage to add security validation
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      const originalAddListener = chrome.runtime.onMessage.addListener.bind(chrome.runtime.onMessage);
      
      chrome.runtime.onMessage.addListener = function(listener) {
        const secureListener = function(message, sender, sendResponse) {
          try {
            // Validate message origin
            if (!self.validateMessageOrigin(sender)) {
              console.warn('Message from untrusted origin blocked:', sender);
              return false;
            }

            // Validate message content
            if (!self.validateMessage(message)) {
              console.warn('Invalid message blocked:', message);
              return false;
            }

            // Call original listener with validated message
            return listener(message, sender, sendResponse);
          } catch (error) {
            console.error('Secure message listener error:', error);
            return false;
          }
        };

        return originalAddListener(secureListener);
      };
    }
  }

  /**
   * Set up DOM isolation to prevent interference with page elements
   */
  setupDOMIsolation() {
    // Create isolated container for extension elements
    this.createIsolatedContainer();
    
    // Set up mutation observer to protect extension elements
    this.setupElementProtection();
  }

  /**
   * Create isolated container for extension UI elements
   */
  createIsolatedContainer() {
    try {
      // Create shadow DOM container for complete isolation
      const containerHost = this.secureDOM.createElement('div');
      if (!containerHost) {
        throw new Error('Failed to create container host');
      }

      containerHost.id = `${this.isolationNamespace}_container`;
      containerHost.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 0 !important;
        height: 0 !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        visibility: hidden !important;
      `;

      // Create shadow root for complete isolation
      if (containerHost.attachShadow) {
        this.shadowRoot = containerHost.attachShadow({ mode: 'closed' });
        
        // Add base styles to shadow root
        const styleSheet = this.secureDOM.createElement('style');
        if (styleSheet) {
          styleSheet.textContent = this.getIsolatedStyles();
          this.shadowRoot.appendChild(styleSheet);
        }
      } else {
        // Fallback for browsers without shadow DOM support
        this.shadowRoot = containerHost;
      }

      // Append to document body
      document.body.appendChild(containerHost);
      this.isolatedContainer = containerHost;

      console.log('Isolated container created successfully');
    } catch (error) {
      console.error('Failed to create isolated container:', error);
    }
  }

  /**
   * Get CSS styles for isolated elements
   */
  getIsolatedStyles() {
    return `
      /* Reset all styles to prevent page interference */
      * {
        all: initial !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      }
      
      /* Subtitle overlay styles */
      .video-translator-subtitle {
        position: absolute !important;
        background: rgba(0, 0, 0, 0.8) !important;
        color: white !important;
        padding: 4px 8px !important;
        border-radius: 4px !important;
        font-size: 16px !important;
        line-height: 1.4 !important;
        text-align: center !important;
        max-width: 80% !important;
        word-wrap: break-word !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
      }
      
      /* Status indicator styles */
      .video-translator-status {
        position: absolute !important;
        top: 10px !important;
        right: 10px !important;
        width: 12px !important;
        height: 12px !important;
        border-radius: 50% !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
      }
      
      .video-translator-status.active {
        background: #4CAF50 !important;
        box-shadow: 0 0 4px rgba(76, 175, 80, 0.5) !important;
      }
      
      .video-translator-status.error {
        background: #f44336 !important;
        box-shadow: 0 0 4px rgba(244, 67, 54, 0.5) !important;
      }
    `;
  }

  /**
   * Set up protection for extension elements
   */
  setupElementProtection() {
    try {
      // Create mutation observer to protect extension elements
      this.protectionObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          // Check for removed extension elements
          if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
            mutation.removedNodes.forEach((node) => {
              if (this.isolatedElements.has(node)) {
                console.warn('Extension element was removed by page script, restoring...');
                // Restore element if it was removed maliciously
                this.restoreRemovedElement(node, mutation.target);
              }
            });
          }
        });
      });

      // Start observing document changes
      this.protectionObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    } catch (error) {
      console.error('Failed to set up element protection:', error);
    }
  }

  /**
   * Set up input validation for all user inputs
   */
  setupInputValidation() {
    // Initialize data protection if available
    if (typeof DataProtection !== 'undefined') {
      this.dataProtection = new DataProtection();
    }

    // Set up validation rules
    this.validationRules = {
      maxStringLength: 10000,
      allowedMessageTypes: [
        'translation_request',
        'audio_data',
        'settings_update',
        'privacy_consent',
        'status_update'
      ],
      blockedPatterns: [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /data:text\/html/gi,
        /vbscript:/gi
      ]
    };
  }

  /**
   * Validate DOM selector to prevent injection attacks
   */
  validateDOMSelector(selector) {
    if (!selector || typeof selector !== 'string') {
      return false;
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /javascript:/gi,
      /<script/gi,
      /expression\s*\(/gi,
      /url\s*\(/gi,
      /import\s*\(/gi
    ];

    return !dangerousPatterns.some(pattern => pattern.test(selector));
  }

  /**
   * Validate element tag name
   */
  validateElementTagName(tagName) {
    if (!tagName || typeof tagName !== 'string') {
      return false;
    }

    // Allow only safe HTML elements
    const allowedTags = [
      'div', 'span', 'p', 'a', 'img', 'video', 'audio', 'canvas',
      'button', 'input', 'select', 'option', 'textarea', 'label',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
      'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
      'style', 'link', 'meta'
    ];

    return allowedTags.includes(tagName.toLowerCase());
  }

  /**
   * Validate message origin
   */
  validateMessageOrigin(sender) {
    if (!sender || !sender.origin) {
      return false;
    }

    // Check if origin is from extension
    return this.trustedOrigins.some(origin => sender.origin.startsWith(origin));
  }

  /**
   * Validate message content
   */
  validateMessage(message) {
    try {
      if (!message || typeof message !== 'object') {
        return false;
      }

      // Check message type
      if (!message.type || !this.validationRules.allowedMessageTypes.includes(message.type)) {
        return false;
      }

      // Use specific validator for message type
      const validator = this.messageValidators.get(message.type);
      if (validator) {
        return validator(message);
      }

      return true;
    } catch (error) {
      console.error('Message validation error:', error);
      return false;
    }
  }

  /**
   * Validate translation message
   */
  validateTranslationMessage(message) {
    if (!message.data || typeof message.data !== 'object') {
      return false;
    }

    const { text, sourceLanguage, targetLanguage } = message.data;

    // Validate text
    if (!this.validateTextInput(text)) {
      return false;
    }

    // Validate language codes
    if (!this.validateLanguageCode(sourceLanguage) || !this.validateLanguageCode(targetLanguage)) {
      return false;
    }

    return true;
  }

  /**
   * Validate audio message
   */
  validateAudioMessage(message) {
    if (!message.data || typeof message.data !== 'object') {
      return false;
    }

    const { audioLevel, timestamp } = message.data;

    // Validate audio level
    if (typeof audioLevel !== 'number' || audioLevel < 0 || audioLevel > 1) {
      return false;
    }

    // Validate timestamp
    if (typeof timestamp !== 'number' || timestamp <= 0) {
      return false;
    }

    return true;
  }

  /**
   * Validate settings message
   */
  validateSettingsMessage(message) {
    if (!message.data || typeof message.data !== 'object') {
      return false;
    }

    // Use DataProtection validation if available
    if (this.dataProtection) {
      const validation = this.dataProtection.validateSettings(message.data);
      return validation.isValid;
    }

    return true;
  }

  /**
   * Validate privacy message
   */
  validatePrivacyMessage(message) {
    if (!message.data || typeof message.data !== 'object') {
      return false;
    }

    const { consentType, granted } = message.data;

    // Validate consent type
    const validConsentTypes = ['audioProcessing', 'dataTransmission', 'storageAccess'];
    if (!validConsentTypes.includes(consentType)) {
      return false;
    }

    // Validate granted flag
    if (typeof granted !== 'boolean') {
      return false;
    }

    return true;
  }

  /**
   * Validate text input
   */
  validateTextInput(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }

    // Check length
    if (text.length > this.validationRules.maxStringLength) {
      return false;
    }

    // Check for blocked patterns
    return !this.validationRules.blockedPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Validate language code
   */
  validateLanguageCode(code) {
    if (!code || typeof code !== 'string') {
      return false;
    }

    // Basic language code validation (ISO 639-1 or 'auto')
    return /^(auto|[a-z]{2}(-[A-Z]{2})?)$/.test(code);
  }

  /**
   * Sanitize user input
   */
  sanitizeInput(input) {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      // Remove HTML tags
      .replace(/<[^>]*>/g, '')
      // Remove script content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Escape dangerous characters
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
   * Create secure event handler
   */
  createSecureEventHandler(element, eventType, handler) {
    if (!element || !eventType || typeof handler !== 'function') {
      throw new Error('Invalid parameters for secure event handler');
    }

    const secureHandler = (event) => {
      try {
        // Validate event
        if (!this.validateEvent(event)) {
          console.warn('Potentially malicious event blocked');
          return;
        }

        // Call original handler
        return handler(event);
      } catch (error) {
        console.error('Secure event handler error:', error);
      }
    };

    // Store handler reference for cleanup
    const handlerId = `${eventType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.secureEventHandlers.set(handlerId, {
      element,
      eventType,
      handler: secureHandler
    });

    // Add event listener using isolated context
    this.isolatedContext.originalAddEventListener.call(element, eventType, secureHandler);

    return handlerId;
  }

  /**
   * Remove secure event handler
   */
  removeSecureEventHandler(handlerId) {
    const handlerInfo = this.secureEventHandlers.get(handlerId);
    if (handlerInfo) {
      this.isolatedContext.originalRemoveEventListener.call(
        handlerInfo.element,
        handlerInfo.eventType,
        handlerInfo.handler
      );
      this.secureEventHandlers.delete(handlerId);
    }
  }

  /**
   * Validate event to prevent malicious events
   */
  validateEvent(event) {
    if (!event || typeof event !== 'object') {
      return false;
    }

    // Check if event is from trusted source
    if (event.isTrusted === false) {
      return false;
    }

    // Additional validation based on event type
    switch (event.type) {
      case 'click':
      case 'mousedown':
      case 'mouseup':
        return this.validateMouseEvent(event);
      case 'keydown':
      case 'keyup':
      case 'keypress':
        return this.validateKeyboardEvent(event);
      default:
        return true;
    }
  }

  /**
   * Validate mouse event
   */
  validateMouseEvent(event) {
    // Check for reasonable coordinates
    if (event.clientX < 0 || event.clientY < 0 ||
        event.clientX > window.innerWidth || event.clientY > window.innerHeight) {
      return false;
    }

    return true;
  }

  /**
   * Validate keyboard event
   */
  validateKeyboardEvent(event) {
    // Block potentially dangerous key combinations
    if (event.ctrlKey && event.altKey && event.shiftKey) {
      return false;
    }

    return true;
  }

  /**
   * Restore removed extension element
   */
  restoreRemovedElement(element, parent) {
    try {
      if (parent && parent.appendChild && this.isolatedElements.has(element)) {
        parent.appendChild(element);
        console.log('Extension element restored');
      }
    } catch (error) {
      console.error('Failed to restore removed element:', error);
    }
  }

  /**
   * Create secure fetch wrapper
   */
  createSecureFetch() {
    const self = this;
    
    return function secureFetch(url, options = {}) {
      try {
        // Validate URL
        if (!self.validateURL(url)) {
          throw new Error('Invalid or unsafe URL');
        }

        // Add security headers
        const secureOptions = {
          ...options,
          headers: {
            ...options.headers,
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block'
          }
        };

        // Use original fetch from isolated context
        return self.isolatedContext.originalFetch(url, secureOptions);
      } catch (error) {
        console.error('Secure fetch error:', error);
        throw error;
      }
    };
  }

  /**
   * Validate URL for security
   */
  validateURL(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    try {
      const urlObj = new URL(url);
      
      // Only allow HTTPS and extension URLs
      const allowedProtocols = ['https:', 'chrome-extension:', 'moz-extension:'];
      if (!allowedProtocols.includes(urlObj.protocol)) {
        return false;
      }

      // Block localhost and private IPs in production
      if (urlObj.hostname === 'localhost' || 
          urlObj.hostname.startsWith('127.') ||
          urlObj.hostname.startsWith('192.168.') ||
          urlObj.hostname.startsWith('10.') ||
          urlObj.hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
        console.warn('Blocked request to private/local address:', url);
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get security status
   */
  getSecurityStatus() {
    return {
      isolationNamespace: this.isolationNamespace,
      isolatedContainer: !!this.isolatedContainer,
      shadowRoot: !!this.shadowRoot,
      protectionObserver: !!this.protectionObserver,
      secureEventHandlers: this.secureEventHandlers.size,
      isolatedElements: this.isolatedElements ? 'active' : 'inactive'
    };
  }

  /**
   * Cleanup security isolation
   */
  cleanup() {
    try {
      // Remove all secure event handlers
      for (const handlerId of this.secureEventHandlers.keys()) {
        this.removeSecureEventHandler(handlerId);
      }

      // Disconnect protection observer
      if (this.protectionObserver) {
        this.protectionObserver.disconnect();
        this.protectionObserver = null;
      }

      // Remove isolated container
      if (this.isolatedContainer && this.isolatedContainer.parentNode) {
        this.isolatedContainer.parentNode.removeChild(this.isolatedContainer);
        this.isolatedContainer = null;
      }

      // Clear isolated elements
      this.isolatedElements = new WeakSet();

      console.log('Security isolation cleaned up');
    } catch (error) {
      console.error('Security isolation cleanup error:', error);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityIsolation;
} else if (typeof window !== 'undefined') {
  window.SecurityIsolation = SecurityIsolation;
}