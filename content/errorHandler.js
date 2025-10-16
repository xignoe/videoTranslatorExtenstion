/**
 * ErrorHandler - Centralized error handling and user feedback system
 * Provides comprehensive error management, logging, and user-friendly messaging
 */
class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 100;
    this.errorCounts = new Map();
    this.suppressedErrors = new Set();
    this.onErrorCallback = null;
    this.onStatusCallback = null;
    
    // Error categories for better handling
    this.errorCategories = {
      AUDIO_CAPTURE: 'audio_capture',
      SPEECH_RECOGNITION: 'speech_recognition',
      TRANSLATION: 'translation',
      SUBTITLE_RENDERING: 'subtitle_rendering',
      VIDEO_DETECTION: 'video_detection',
      NETWORK: 'network',
      PERMISSION: 'permission',
      INITIALIZATION: 'initialization',
      UNKNOWN: 'unknown'
    };

    // User-friendly error messages
    this.userMessages = {
      [this.errorCategories.AUDIO_CAPTURE]: {
        'CORS': 'Cannot access audio due to website restrictions. Try refreshing the page.',
        'InvalidStateError': 'Audio is already being used by another application.',
        'NotSupportedError': 'Audio capture is not supported for this video.',
        'no audio track': 'This video does not contain audio.',
        'default': 'Unable to capture audio from this video.'
      },
      [this.errorCategories.SPEECH_RECOGNITION]: {
        'not-allowed': 'Microphone permission denied. Please allow microphone access.',
        'network': 'Speech recognition service is unavailable. Check your internet connection.',
        'no-speech': 'No speech detected in the audio.',
        'aborted': 'Speech recognition was interrupted.',
        'default': 'Speech recognition failed. Please try again.'
      },
      [this.errorCategories.TRANSLATION]: {
        'rate limit': 'Translation service is temporarily unavailable due to high usage.',
        'network': 'Translation failed due to network issues. Please check your connection.',
        'invalid language': 'Selected language is not supported.',
        'default': 'Translation service is currently unavailable.'
      },
      [this.errorCategories.SUBTITLE_RENDERING]: {
        'positioning': 'Unable to position subtitles correctly.',
        'styling': 'Subtitle styling could not be applied.',
        'default': 'Subtitle display error occurred.'
      },
      [this.errorCategories.VIDEO_DETECTION]: {
        'no videos': 'No videos found on this page.',
        'access denied': 'Cannot access video content due to security restrictions.',
        'default': 'Video detection failed.'
      },
      [this.errorCategories.NETWORK]: {
        'offline': 'You appear to be offline. Please check your internet connection.',
        'timeout': 'Request timed out. Please try again.',
        'default': 'Network error occurred.'
      },
      [this.errorCategories.PERMISSION]: {
        'microphone': 'Microphone access is required for speech recognition.',
        'storage': 'Unable to save settings due to storage restrictions.',
        'default': 'Permission denied.'
      },
      [this.errorCategories.INITIALIZATION]: {
        'component': 'Failed to initialize extension components.',
        'settings': 'Unable to load extension settings.',
        'default': 'Extension initialization failed.'
      }
    };

    // Recovery suggestions
    this.recoverySuggestions = {
      [this.errorCategories.AUDIO_CAPTURE]: [
        'Refresh the page and try again',
        'Check if the video has audio',
        'Try a different video or website',
        'Disable other audio applications'
      ],
      [this.errorCategories.SPEECH_RECOGNITION]: [
        'Allow microphone permissions in browser settings',
        'Check your internet connection',
        'Try speaking more clearly',
        'Refresh the page and try again'
      ],
      [this.errorCategories.TRANSLATION]: [
        'Wait a moment and try again',
        'Check your internet connection',
        'Try a different target language',
        'Refresh the page'
      ],
      [this.errorCategories.SUBTITLE_RENDERING]: [
        'Refresh the page',
        'Try adjusting subtitle settings',
        'Check if video is still playing'
      ],
      [this.errorCategories.VIDEO_DETECTION]: [
        'Refresh the page',
        'Try a different video website',
        'Check if videos are playing'
      ],
      [this.errorCategories.NETWORK]: [
        'Check your internet connection',
        'Try again in a few moments',
        'Refresh the page'
      ],
      [this.errorCategories.PERMISSION]: [
        'Check browser permission settings',
        'Allow required permissions',
        'Refresh the page'
      ],
      [this.errorCategories.INITIALIZATION]: [
        'Refresh the page',
        'Restart your browser',
        'Check if extension is enabled'
      ]
    };
  }

  /**
   * Set callback for error notifications
   * @param {Function} callback - Function to call when errors occur
   */
  setErrorCallback(callback) {
    this.onErrorCallback = callback;
  }

  /**
   * Set callback for status updates
   * @param {Function} callback - Function to call for status updates
   */
  setStatusCallback(callback) {
    this.onStatusCallback = callback;
  }

  /**
   * Handle error with comprehensive processing
   * @param {string} context - Context where error occurred
   * @param {Error|string} error - Error object or message
   * @param {Object} options - Additional options
   */
  handleError(context, error, options = {}) {
    const errorInfo = this.processError(context, error, options);
    
    // Log error
    this.logError(errorInfo);
    
    // Check if error should be suppressed
    if (this.shouldSuppressError(errorInfo)) {
      return errorInfo;
    }

    // Notify callbacks
    if (this.onErrorCallback) {
      this.onErrorCallback(errorInfo);
    }

    // Update status
    if (this.onStatusCallback) {
      this.onStatusCallback({
        state: 'error',
        error: errorInfo.userMessage,
        category: errorInfo.category,
        canRecover: errorInfo.canRecover
      });
    }

    // Send to background script for logging
    this.reportToBackground(errorInfo);

    return errorInfo;
  }

  /**
   * Process error into structured format
   * @param {string} context - Context where error occurred
   * @param {Error|string} error - Error object or message
   * @param {Object} options - Additional options
   * @returns {Object} Processed error information
   */
  processError(context, error, options = {}) {
    const timestamp = Date.now();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : null;
    
    // Categorize error
    const category = this.categorizeError(context, errorMessage);
    
    // Generate user-friendly message
    const userMessage = this.generateUserMessage(category, errorMessage);
    
    // Get recovery suggestions
    const suggestions = this.getRecoverySuggestions(category);
    
    // Determine if error is recoverable
    const canRecover = this.isRecoverable(category, errorMessage);
    
    // Generate unique error ID
    const errorId = this.generateErrorId(context, errorMessage, timestamp);

    return {
      id: errorId,
      timestamp,
      context,
      category,
      originalMessage: errorMessage,
      userMessage,
      suggestions,
      canRecover,
      stack: errorStack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      severity: options.severity || this.getSeverity(category),
      metadata: options.metadata || {}
    };
  }

  /**
   * Categorize error based on context and message
   * @param {string} context - Error context
   * @param {string} message - Error message
   * @returns {string} Error category
   */
  categorizeError(context, message) {
    const lowerMessage = message.toLowerCase();
    const lowerContext = context.toLowerCase();

    // Check context first
    if (lowerContext.includes('audio')) {
      return this.errorCategories.AUDIO_CAPTURE;
    }
    if (lowerContext.includes('speech') || lowerContext.includes('recognition')) {
      return this.errorCategories.SPEECH_RECOGNITION;
    }
    if (lowerContext.includes('translation')) {
      return this.errorCategories.TRANSLATION;
    }
    if (lowerContext.includes('subtitle') || lowerContext.includes('render')) {
      return this.errorCategories.SUBTITLE_RENDERING;
    }
    if (lowerContext.includes('video') || lowerContext.includes('detect')) {
      return this.errorCategories.VIDEO_DETECTION;
    }
    if (lowerContext.includes('init')) {
      return this.errorCategories.INITIALIZATION;
    }

    // Check message content
    if (lowerMessage.includes('cors') || lowerMessage.includes('cross-origin')) {
      return this.errorCategories.AUDIO_CAPTURE;
    }
    if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('timeout')) {
      return this.errorCategories.NETWORK;
    }
    if (lowerMessage.includes('permission') || lowerMessage.includes('not-allowed')) {
      return this.errorCategories.PERMISSION;
    }
    if (lowerMessage.includes('rate limit') || lowerMessage.includes('quota')) {
      return this.errorCategories.TRANSLATION;
    }

    return this.errorCategories.UNKNOWN;
  }

  /**
   * Generate user-friendly error message
   * @param {string} category - Error category
   * @param {string} originalMessage - Original error message
   * @returns {string} User-friendly message
   */
  generateUserMessage(category, originalMessage) {
    const categoryMessages = this.userMessages[category];
    if (!categoryMessages) {
      return 'An unexpected error occurred. Please try again.';
    }

    const lowerMessage = originalMessage.toLowerCase();
    
    // Find specific message match
    for (const [key, message] of Object.entries(categoryMessages)) {
      if (key !== 'default' && lowerMessage.includes(key.toLowerCase())) {
        return message;
      }
    }

    return categoryMessages.default || 'An error occurred. Please try again.';
  }

  /**
   * Get recovery suggestions for error category
   * @param {string} category - Error category
   * @returns {Array<string>} Recovery suggestions
   */
  getRecoverySuggestions(category) {
    return this.recoverySuggestions[category] || ['Refresh the page and try again'];
  }

  /**
   * Determine if error is recoverable
   * @param {string} category - Error category
   * @param {string} message - Error message
   * @returns {boolean} Whether error is recoverable
   */
  isRecoverable(category, message) {
    const lowerMessage = message.toLowerCase();
    
    // Non-recoverable errors
    const nonRecoverable = [
      'not supported',
      'invalid state',
      'security error',
      'permission denied permanently'
    ];

    if (nonRecoverable.some(pattern => lowerMessage.includes(pattern))) {
      return false;
    }

    // Most errors are recoverable with user action
    return true;
  }

  /**
   * Get error severity level
   * @param {string} category - Error category
   * @returns {string} Severity level
   */
  getSeverity(category) {
    const highSeverity = [
      this.errorCategories.INITIALIZATION,
      this.errorCategories.PERMISSION
    ];

    const mediumSeverity = [
      this.errorCategories.AUDIO_CAPTURE,
      this.errorCategories.SPEECH_RECOGNITION,
      this.errorCategories.TRANSLATION
    ];

    if (highSeverity.includes(category)) {
      return 'high';
    }
    if (mediumSeverity.includes(category)) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Generate unique error ID
   * @param {string} context - Error context
   * @param {string} message - Error message
   * @param {number} timestamp - Timestamp
   * @returns {string} Unique error ID
   */
  generateErrorId(context, message, timestamp) {
    const hash = this.simpleHash(context + message);
    return `err_${hash}_${timestamp}`;
  }

  /**
   * Simple hash function for error IDs
   * @param {string} str - String to hash
   * @returns {string} Hash value
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Log error to internal log
   * @param {Object} errorInfo - Processed error information
   */
  logError(errorInfo) {
    // Add to error log
    this.errorLog.unshift(errorInfo);
    
    // Maintain log size
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(0, this.maxLogSize);
    }

    // Update error counts
    const key = `${errorInfo.category}:${errorInfo.context}`;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);

    // Console logging for development
    console.error(`[VideoTranslator] ${errorInfo.context}:`, {
      category: errorInfo.category,
      message: errorInfo.originalMessage,
      userMessage: errorInfo.userMessage,
      suggestions: errorInfo.suggestions,
      canRecover: errorInfo.canRecover
    });
  }

  /**
   * Check if error should be suppressed
   * @param {Object} errorInfo - Error information
   * @returns {boolean} Whether to suppress error
   */
  shouldSuppressError(errorInfo) {
    const suppressKey = `${errorInfo.category}:${errorInfo.originalMessage}`;
    
    // Check if error is in suppressed list
    if (this.suppressedErrors.has(suppressKey)) {
      return true;
    }

    // Suppress repeated errors (more than 5 times in 5 minutes)
    const recentErrors = this.errorLog.filter(err => 
      err.category === errorInfo.category &&
      err.originalMessage === errorInfo.originalMessage &&
      Date.now() - err.timestamp < 300000 // 5 minutes
    );

    if (recentErrors.length > 5) {
      this.suppressedErrors.add(suppressKey);
      // Auto-remove from suppressed list after 10 minutes
      setTimeout(() => {
        this.suppressedErrors.delete(suppressKey);
      }, 600000);
      return true;
    }

    return false;
  }

  /**
   * Report error to background script
   * @param {Object} errorInfo - Error information
   */
  reportToBackground(errorInfo) {
    try {
      chrome.runtime.sendMessage({
        action: 'reportError',
        error: {
          id: errorInfo.id,
          timestamp: errorInfo.timestamp,
          context: errorInfo.context,
          category: errorInfo.category,
          message: errorInfo.originalMessage,
          userMessage: errorInfo.userMessage,
          severity: errorInfo.severity,
          url: errorInfo.url,
          canRecover: errorInfo.canRecover
        }
      }).catch(() => {
        // Background script may not be available, ignore
      });
    } catch (error) {
      // Ignore messaging errors
    }
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    const now = Date.now();
    const last24Hours = this.errorLog.filter(err => now - err.timestamp < 86400000);
    const lastHour = this.errorLog.filter(err => now - err.timestamp < 3600000);

    const categoryCounts = {};
    last24Hours.forEach(err => {
      categoryCounts[err.category] = (categoryCounts[err.category] || 0) + 1;
    });

    return {
      totalErrors: this.errorLog.length,
      last24Hours: last24Hours.length,
      lastHour: lastHour.length,
      categoryCounts,
      suppressedCount: this.suppressedErrors.size,
      mostCommonCategory: Object.keys(categoryCounts).reduce((a, b) => 
        categoryCounts[a] > categoryCounts[b] ? a : b, 'none')
    };
  }

  /**
   * Get recent errors
   * @param {number} limit - Maximum number of errors to return
   * @returns {Array} Recent errors
   */
  getRecentErrors(limit = 10) {
    return this.errorLog.slice(0, limit);
  }

  /**
   * Clear error log
   */
  clearErrorLog() {
    this.errorLog = [];
    this.errorCounts.clear();
    this.suppressedErrors.clear();
  }

  /**
   * Suppress specific error type
   * @param {string} category - Error category
   * @param {string} message - Error message pattern
   */
  suppressError(category, message) {
    const suppressKey = `${category}:${message}`;
    this.suppressedErrors.add(suppressKey);
  }

  /**
   * Unsuppress specific error type
   * @param {string} category - Error category
   * @param {string} message - Error message pattern
   */
  unsuppressError(category, message) {
    const suppressKey = `${category}:${message}`;
    this.suppressedErrors.delete(suppressKey);
  }

  /**
   * Create error handler for specific component
   * @param {string} componentName - Name of the component
   * @returns {Function} Error handler function
   */
  createComponentHandler(componentName) {
    return (message, error, options = {}) => {
      return this.handleError(`${componentName}: ${message}`, error, options);
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ErrorHandler;
} else if (typeof window !== 'undefined') {
  window.ErrorHandler = ErrorHandler;
}