/**
 * Tests for ErrorHandler class
 */

const ErrorHandler = require('../content/errorHandler.js');

describe('ErrorHandler', () => {
  let errorHandler;
  let mockErrorCallback;
  let mockStatusCallback;

  beforeEach(() => {
    errorHandler = new ErrorHandler();
    mockErrorCallback = jest.fn();
    mockStatusCallback = jest.fn();
    
    errorHandler.setErrorCallback(mockErrorCallback);
    errorHandler.setStatusCallback(mockStatusCallback);

    // Mock chrome.runtime.sendMessage
    global.chrome = {
      runtime: {
        sendMessage: jest.fn().mockResolvedValue({})
      }
    };

    // Mock window and navigator
    global.window = {
      location: { href: 'https://example.com' }
    };
    global.navigator = {
      userAgent: 'Test Browser'
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Error Processing', () => {
    test('should process basic error correctly', () => {
      const error = new Error('Test error message');
      const result = errorHandler.handleError('Test context', error);

      expect(result).toMatchObject({
        context: 'Test context',
        originalMessage: 'Test error message',
        category: 'unknown',
        canRecover: true,
        severity: 'low'
      });
    });

    test('should categorize audio errors correctly', () => {
      const error = new Error('CORS policy blocked');
      const result = errorHandler.handleError('Audio capture failed', error);

      expect(result.category).toBe('audio_capture');
      expect(result.userMessage).toContain('website restrictions');
    });

    test('should categorize speech recognition errors correctly', () => {
      const error = new Error('not-allowed permission denied');
      const result = errorHandler.handleError('Speech recognition failed', error);

      expect(result.category).toBe('speech_recognition');
      expect(result.userMessage).toContain('permission denied');
    });

    test('should categorize translation errors correctly', () => {
      const error = new Error('rate limit exceeded');
      const result = errorHandler.handleError('Translation request failed', error);

      expect(result.category).toBe('translation');
      expect(result.userMessage).toContain('temporarily unavailable');
    });

    test('should categorize network errors correctly', () => {
      const error = new Error('network timeout occurred');
      const result = errorHandler.handleError('API request failed', error);

      expect(result.category).toBe('network');
      expect(result.userMessage).toBe('Request timed out. Please try again.');
    });
  });

  describe('User-Friendly Messages', () => {
    test('should generate appropriate message for CORS errors', () => {
      const error = new Error('CORS policy blocked');
      const result = errorHandler.handleError('Audio capture', error);

      expect(result.userMessage).toBe('Cannot access audio due to website restrictions. Try refreshing the page.');
    });

    test('should generate appropriate message for permission errors', () => {
      const error = new Error('not-allowed');
      const result = errorHandler.handleError('Speech recognition', error);

      expect(result.userMessage).toBe('Microphone permission denied. Please allow microphone access.');
    });

    test('should provide fallback message for unknown errors', () => {
      const error = new Error('Unknown weird error');
      const result = errorHandler.handleError('Unknown context', error);

      expect(result.userMessage).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('Recovery Suggestions', () => {
    test('should provide audio capture recovery suggestions', () => {
      const error = new Error('Audio capture failed');
      const result = errorHandler.handleError('Audio processing', error);

      expect(result.suggestions).toContain('Refresh the page and try again');
      expect(result.suggestions).toContain('Check if the video has audio');
    });

    test('should provide speech recognition recovery suggestions', () => {
      const error = new Error('Speech recognition failed');
      const result = errorHandler.handleError('Speech processing', error);

      expect(result.suggestions).toContain('Allow microphone permissions in browser settings');
      expect(result.suggestions).toContain('Check your internet connection');
    });

    test('should provide translation recovery suggestions', () => {
      const error = new Error('Translation failed');
      const result = errorHandler.handleError('Translation service', error);

      expect(result.suggestions).toContain('Wait a moment and try again');
      expect(result.suggestions).toContain('Check your internet connection');
    });
  });

  describe('Error Suppression', () => {
    test('should suppress repeated errors', () => {
      const error = new Error('Repeated error');
      const context = 'Test context';

      // Generate multiple identical errors (need more than 5 to trigger suppression)
      for (let i = 0; i < 8; i++) {
        errorHandler.handleError(context, error);
      }
      
      // Check that callbacks were called for first 6 errors, then suppressed
      expect(mockErrorCallback).toHaveBeenCalledTimes(6); // Only first 6 calls
    });

    test('should not suppress different errors', () => {
      errorHandler.handleError('Context 1', new Error('Error 1'));
      errorHandler.handleError('Context 2', new Error('Error 2'));

      expect(mockErrorCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Logging', () => {
    test('should log errors to internal log', () => {
      const error = new Error('Test error');
      errorHandler.handleError('Test context', error);

      const recentErrors = errorHandler.getRecentErrors(1);
      expect(recentErrors).toHaveLength(1);
      expect(recentErrors[0].originalMessage).toBe('Test error');
    });

    test('should maintain log size limit', () => {
      // Generate more errors than the log limit
      for (let i = 0; i < 150; i++) {
        errorHandler.handleError('Test context', new Error(`Error ${i}`));
      }

      const recentErrors = errorHandler.getRecentErrors(200);
      expect(recentErrors.length).toBeLessThanOrEqual(100); // maxLogSize
    });

    test('should provide error statistics', () => {
      errorHandler.handleError('Audio context', new Error('Audio error'));
      errorHandler.handleError('Translation context', new Error('Translation error'));
      errorHandler.handleError('Audio context', new Error('Another audio error'));

      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(3);
      expect(stats.categoryCounts.audio_capture).toBe(2);
      expect(stats.categoryCounts.translation).toBe(1);
    });
  });

  describe('Component Error Handlers', () => {
    test('should create component-specific error handler', () => {
      const componentHandler = errorHandler.createComponentHandler('TestComponent');
      
      componentHandler('Test message', new Error('Test error'));

      expect(mockErrorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'TestComponent: Test message',
          originalMessage: 'Test error'
        })
      );
    });
  });

  describe('Error Severity', () => {
    test('should assign high severity to initialization errors', () => {
      const error = new Error('Initialization failed');
      const result = errorHandler.handleError('Extension initialization', error);

      expect(result.severity).toBe('high');
    });

    test('should assign medium severity to audio capture errors', () => {
      const error = new Error('Audio capture failed');
      const result = errorHandler.handleError('Audio processing', error);

      expect(result.severity).toBe('medium');
    });

    test('should assign low severity to unknown errors', () => {
      const error = new Error('Unknown error');
      const result = errorHandler.handleError('Unknown context', error);

      expect(result.severity).toBe('low');
    });
  });

  describe('Callback Integration', () => {
    test('should call error callback with processed error info', () => {
      const error = new Error('Test error');
      errorHandler.handleError('Test context', error);

      expect(mockErrorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'Test context',
          originalMessage: 'Test error',
          userMessage: expect.any(String),
          suggestions: expect.any(Array),
          canRecover: expect.any(Boolean)
        })
      );
    });

    test('should call status callback with error state', () => {
      const error = new Error('Test error');
      errorHandler.handleError('Test context', error);

      expect(mockStatusCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'error',
          error: expect.any(String),
          category: expect.any(String),
          canRecover: expect.any(Boolean)
        })
      );
    });
  });

  describe('Background Script Integration', () => {
    test('should report errors to background script', () => {
      const error = new Error('Test error');
      errorHandler.handleError('Test context', error);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'reportError',
          error: expect.objectContaining({
            message: 'Test error',
            context: 'Test context',
            category: expect.any(String),
            severity: expect.any(String)
          })
        })
      );
    });

    test('should handle background script communication errors gracefully', () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Communication failed'));
      
      const error = new Error('Test error');
      
      // Should not throw
      expect(() => {
        errorHandler.handleError('Test context', error);
      }).not.toThrow();
    });
  });

  describe('Error ID Generation', () => {
    test('should generate unique error IDs', () => {
      const error1 = errorHandler.handleError('Context 1', new Error('Error 1'));
      const error2 = errorHandler.handleError('Context 2', new Error('Error 2'));

      expect(error1.id).not.toBe(error2.id);
      expect(error1.id).toMatch(/^err_/);
      expect(error2.id).toMatch(/^err_/);
    });

    test('should generate consistent IDs for similar errors', () => {
      const error1 = errorHandler.handleError('Same context', new Error('Same error'));
      
      // Clear log to reset timestamp
      errorHandler.clearErrorLog();
      
      const error2 = errorHandler.handleError('Same context', new Error('Same error'));

      // IDs should be different due to timestamp, but have same hash component
      expect(error1.id.split('_')[1]).toBe(error2.id.split('_')[1]);
    });
  });
});