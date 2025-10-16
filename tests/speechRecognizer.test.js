/**
 * Unit tests for SpeechRecognizer class
 * Tests speech recognition accuracy, timing, and error handling
 */

// Mock Web Speech API
class MockSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.maxAlternatives = 1;
    this.lang = 'en-US';
    
    this.onstart = null;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    this.onnomatch = null;
    this.onspeechstart = null;
    this.onspeechend = null;
    
    this._isStarted = false;
    this._mockResults = [];
    this._mockErrors = [];
  }

  start() {
    if (this._isStarted) {
      throw new Error('Recognition already started');
    }
    this._isStarted = true;
    setTimeout(() => {
      if (this.onstart) this.onstart();
    }, 10);
  }

  stop() {
    this._isStarted = false;
    setTimeout(() => {
      if (this.onend) this.onend();
    }, 10);
  }

  abort() {
    this._isStarted = false;
    setTimeout(() => {
      if (this.onend) this.onend();
    }, 10);
  }

  // Test helper methods
  _triggerResult(transcript, confidence = 0.9, isFinal = true) {
    if (this.onresult) {
      const mockEvent = {
        resultIndex: 0,
        results: [{
          0: { transcript, confidence },
          isFinal,
          length: 1
        }],
        length: 1
      };
      this.onresult(mockEvent);
    }
  }

  _triggerError(error, message = '') {
    if (this.onerror) {
      this.onerror({ error, message });
    }
  }

  _triggerSpeechStart() {
    if (this.onspeechstart) this.onspeechstart();
  }

  _triggerSpeechEnd() {
    if (this.onspeechend) this.onspeechend();
  }
}

// Set up global mocks
global.SpeechRecognition = MockSpeechRecognition;
global.webkitSpeechRecognition = MockSpeechRecognition;

// Import the class to test
const SpeechRecognizer = require('../content/speechRecognizer.js');

describe('SpeechRecognizer', () => {
  let speechRecognizer;
  let mockOnResult;
  let mockOnError;
  let mockOnStatus;

  beforeEach(() => {
    speechRecognizer = new SpeechRecognizer();
    mockOnResult = jest.fn();
    mockOnError = jest.fn();
    mockOnStatus = jest.fn();
  });

  afterEach(() => {
    if (speechRecognizer.isListening) {
      speechRecognizer.stop();
    }
  });

  describe('Initialization', () => {
    test('should initialize with default settings', () => {
      expect(speechRecognizer.isListening).toBe(false);
      expect(speechRecognizer.currentLanguage).toBe('en-US');
      expect(speechRecognizer.recognition).toBeNull();
      expect(speechRecognizer.isSupported).toBe(true);
    });

    test('should initialize speech recognition with correct settings', () => {
      const result = speechRecognizer.initialize('es-ES', mockOnResult, mockOnError, mockOnStatus);

      expect(result).toBe(true);
      expect(speechRecognizer.currentLanguage).toBe('es-ES');
      expect(speechRecognizer.recognition).toBeTruthy();
      expect(speechRecognizer.recognition.continuous).toBe(true);
      expect(speechRecognizer.recognition.interimResults).toBe(true);
      expect(speechRecognizer.recognition.lang).toBe('es-ES');
    });

    test('should handle missing SpeechRecognition API', () => {
      const originalSpeechRecognition = global.SpeechRecognition;
      const originalWebkitSpeechRecognition = global.webkitSpeechRecognition;
      
      delete global.SpeechRecognition;
      delete global.webkitSpeechRecognition;

      // Create new instance to test unsupported browser
      const unsupportedRecognizer = new SpeechRecognizer();
      const result = unsupportedRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);

      expect(result).toBe(false);
      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error));

      // Restore
      global.SpeechRecognition = originalSpeechRecognition;
      global.webkitSpeechRecognition = originalWebkitSpeechRecognition;
    });
  });

  describe('Speech Recognition Control', () => {
    beforeEach(() => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    });

    test('should start speech recognition', () => {
      const result = speechRecognizer.startListening();

      expect(result).toBe(true);
      // isListening will be set to true in the onstart callback
      setTimeout(() => {
        expect(speechRecognizer.isListening).toBe(true);
      }, 20);
    });

    test('should stop speech recognition', () => {
      speechRecognizer.startListening();
      speechRecognizer.stopListening();

      // isListening will be set to false in the onend callback
      setTimeout(() => {
        expect(speechRecognizer.isListening).toBe(false);
      }, 20);
    });

    test('should not start if already listening', () => {
      speechRecognizer.startListening();
      // Manually set isListening to simulate already running
      speechRecognizer.isListening = true;
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const result = speechRecognizer.startListening();

      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('Speech recognition already active');
      consoleSpy.mockRestore();
    });

    test('should handle start errors gracefully', () => {
      // Mock recognition to throw error on start
      speechRecognizer.recognition.start = jest.fn(() => {
        throw new Error('Start failed');
      });

      const result = speechRecognizer.startListening();

      expect(result).toBe(false);
    });
  });

  describe('Result Processing', () => {
    beforeEach(() => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
      speechRecognizer.startListening();
    });

    test('should process final results with high confidence', (done) => {
      mockOnResult.mockImplementation((result) => {
        expect(result.transcript).toBe('hello world');
        expect(result.confidence).toBe(0.9);
        expect(result.isFinal).toBe(true);
        expect(result.timestamp).toBeDefined();
        done();
      });

      setTimeout(() => {
        speechRecognizer.recognition._triggerResult('hello world', 0.9, true);
      }, 10);
    });

    test('should process interim results', (done) => {
      mockOnResult.mockImplementation((result) => {
        expect(result.transcript).toBe('hello');
        expect(result.confidence).toBe(0.7);
        expect(result.isFinal).toBe(false);
        done();
      });

      setTimeout(() => {
        speechRecognizer.recognition._triggerResult('hello', 0.7, false);
      }, 10);
    });

    test('should filter out low confidence results', (done) => {
      let resultCalled = false;
      
      mockOnResult.mockImplementation(() => {
        resultCalled = true;
      });

      setTimeout(() => {
        speechRecognizer.recognition._triggerResult('unclear speech', 0.3, true);
        
        // Wait a bit to ensure callback isn't called
        setTimeout(() => {
          expect(resultCalled).toBe(false);
          done();
        }, 50);
      }, 10);
    });

    test('should normalize transcript text', (done) => {
      mockOnResult.mockImplementation((result) => {
        expect(result.transcript).toBe('hello world');
        done();
      });

      setTimeout(() => {
        speechRecognizer.recognition._triggerResult('  HELLO WORLD  ', 0.9, true);
      }, 10);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    });

    test('should handle speech recognition errors', (done) => {
      mockOnError.mockImplementation((error) => {
        expect(error.type).toBe('speech_recognition_error');
        expect(error.error).toBe('no-speech');
        expect(error.timestamp).toBeDefined();
        done();
      });

      speechRecognizer.start();
      setTimeout(() => {
        speechRecognizer.recognition._triggerError('no-speech');
      }, 10);
    });

    test('should handle different error types appropriately', (done) => {
      const errorTypes = ['no-speech', 'audio-capture', 'not-allowed', 'network'];
      let errorCount = 0;
      
      mockOnError.mockImplementation((error) => {
        expect(error.type).toBe('speech_recognition_error');
        expect(errorTypes).toContain(error.error);
        errorCount++;
        
        if (errorCount === errorTypes.length) {
          done();
        }
      });

      speechRecognizer.start();
      setTimeout(() => {
        errorTypes.forEach((errorType, index) => {
          setTimeout(() => {
            speechRecognizer.recognition._triggerError(errorType);
          }, index * 10);
        });
      }, 10);
    });

    test('should restart after recoverable errors', (done) => {
      let restartCount = 0;
      
      mockOnStatus.mockImplementation((status) => {
        if (status.status === 'listening') {
          restartCount++;
          if (restartCount === 2) {
            // Second start means it restarted after error
            done();
          }
        }
      });

      speechRecognizer.start();
      setTimeout(() => {
        speechRecognizer.recognition._triggerError('no-speech');
      }, 10);
    });
  });

  describe('Result Buffer Management', () => {
    beforeEach(() => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
      speechRecognizer.start();
    });

    test('should maintain result buffer with size limits', (done) => {
      let resultCount = 0;
      
      mockOnResult.mockImplementation(() => {
        resultCount++;
        
        if (resultCount === 12) {
          const buffer = speechRecognizer.getResultBuffer();
          expect(buffer.length).toBeLessThanOrEqual(10); // Max buffer size
          done();
        }
      });

      setTimeout(() => {
        for (let i = 0; i < 12; i++) {
          setTimeout(() => {
            speechRecognizer.recognition._triggerResult(`Result ${i}`, 0.9, true);
          }, i * 5);
        }
      }, 10);
    });

    test('should provide result statistics', () => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
      
      const stats = speechRecognizer.getStatistics();
      expect(stats).toEqual({
        totalResults: 0,
        averageConfidence: 0,
        errorCount: 0,
        sessionDuration: 0,
        isListening: false
      });
    });
  });

  describe('Language Support', () => {
    test('should support language changes', () => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
      
      speechRecognizer.setLanguage('fr-FR');
      
      expect(speechRecognizer.language).toBe('fr-FR');
      expect(speechRecognizer.recognition.lang).toBe('fr-FR');
    });

    test('should validate language codes', () => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      speechRecognizer.setLanguage('invalid-lang');
      
      expect(consoleSpy).toHaveBeenCalledWith('Invalid language code: invalid-lang');
      expect(speechRecognizer.language).toBe('en-US'); // Should remain unchanged
      
      consoleSpy.mockRestore();
    });
  });

  describe('Cleanup', () => {
    test('should cleanup resources on destroy', () => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
      speechRecognizer.start();
      
      speechRecognizer.destroy();
      
      expect(speechRecognizer.isListening).toBe(false);
      expect(speechRecognizer.recognition).toBeNull();
    });

    test('should handle cleanup when not initialized', () => {
      expect(() => speechRecognizer.destroy()).not.toThrow();
    });
  });
});