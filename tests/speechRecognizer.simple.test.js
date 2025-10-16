/**
 * Simplified unit tests for SpeechRecognizer class
 * Focus on core functionality and error handling
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
  }

  start() {
    if (this._isStarted) {
      throw new Error('Recognition already started');
    }
    this._isStarted = true;
    // Simulate async start
    process.nextTick(() => {
      if (this.onstart) this.onstart();
    });
  }

  stop() {
    this._isStarted = false;
    process.nextTick(() => {
      if (this.onend) this.onend();
    });
  }

  abort() {
    this._isStarted = false;
    process.nextTick(() => {
      if (this.onend) this.onend();
    });
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
}

// Set up global mocks
global.window = {
  SpeechRecognition: MockSpeechRecognition,
  webkitSpeechRecognition: MockSpeechRecognition
};

// Import the class to test
const SpeechRecognizer = require('../content/speechRecognizer.js');

describe('SpeechRecognizer Core Functionality', () => {
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
    if (speechRecognizer) {
      speechRecognizer.destroy();
    }
    jest.clearAllMocks();
  });

  test('should detect browser support correctly', () => {
    expect(speechRecognizer.checkBrowserSupport()).toBe(true);
  });

  test('should initialize successfully with valid parameters', () => {
    const result = speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    expect(result).toBe(true);
    expect(speechRecognizer.currentLanguage).toBe('en-US');
    expect(speechRecognizer.recognition).toBeDefined();
  });

  test('should handle initialization without browser support', () => {
    speechRecognizer.isSupported = false;
    const result = speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    expect(result).toBe(false);
    expect(mockOnError).toHaveBeenCalled();
  });

  test('should start listening when properly initialized', () => {
    speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    const result = speechRecognizer.startListening();
    expect(result).toBe(true);
  });

  test('should handle starting without initialization', () => {
    const result = speechRecognizer.startListening();
    expect(result).toBe(false);
  });

  test('should process final results with high confidence', (done) => {
    speechRecognizer.initialize('en-US', (result) => {
      expect(result.type).toBe('final');
      expect(result.transcript).toBe('hello world');
      expect(result.confidence).toBe(0.9);
      done();
    }, mockOnError, mockOnStatus);

    speechRecognizer.startListening();
    
    // Trigger a result after a short delay
    setTimeout(() => {
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerResult('Hello world', 0.9, true);
    }, 10);
  });

  test('should filter out low confidence results', (done) => {
    let resultCalled = false;
    
    speechRecognizer.initialize('en-US', () => {
      resultCalled = true;
    }, mockOnError, mockOnStatus);

    speechRecognizer.startListening();
    
    setTimeout(() => {
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerResult('unclear speech', 0.3, true);
      
      // Wait a bit to ensure callback isn't called
      setTimeout(() => {
        expect(resultCalled).toBe(false);
        done();
      }, 50);
    }, 10);
  });

  test('should clean transcript text properly', () => {
    const cleanText = speechRecognizer.cleanTranscript('  Hello,   World!  ');
    expect(cleanText).toBe('hello, world!');
  });

  test('should handle speech recognition errors', (done) => {
    speechRecognizer.initialize('en-US', mockOnResult, (error) => {
      expect(error.type).toBe('speech_recognition_error');
      expect(error.error).toBe('no-speech');
      done();
    }, mockOnStatus);

    speechRecognizer.startListening();
    
    setTimeout(() => {
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerError('no-speech');
    }, 10);
  });

  test('should change language successfully', () => {
    speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    const result = speechRecognizer.changeLanguage('es-ES');
    expect(result).toBe(true);
    expect(speechRecognizer.currentLanguage).toBe('es-ES');
  });

  test('should update configuration correctly', () => {
    speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    
    const newConfig = {
      continuous: false,
      confidenceThreshold: 0.8
    };
    
    speechRecognizer.updateConfig(newConfig);
    
    expect(speechRecognizer.config.continuous).toBe(false);
    expect(speechRecognizer.config.confidenceThreshold).toBe(0.8);
  });

  test('should provide accurate status information', () => {
    speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    
    const status = speechRecognizer.getStatus();
    
    expect(status.isSupported).toBe(true);
    expect(status.isListening).toBe(false);
    expect(status.currentLanguage).toBe('en-US');
    expect(status.resultBufferSize).toBe(0);
  });

  test('should cleanup resources on destroy', () => {
    speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    speechRecognizer.startListening();
    
    speechRecognizer.destroy();
    
    expect(speechRecognizer.recognition).toBeNull();
    expect(speechRecognizer.resultBuffer).toEqual([]);
    expect(speechRecognizer.onResultCallback).toBeNull();
  });

  test('should maintain result buffer with size limits', (done) => {
    let resultCount = 0;
    
    speechRecognizer.initialize('en-US', () => {
      resultCount++;
      if (resultCount === 12) {
        // Buffer should be limited to 10 items
        expect(speechRecognizer.resultBuffer.length).toBeLessThanOrEqual(10);
        done();
      }
    }, mockOnError, mockOnStatus);

    speechRecognizer.startListening();
    
    // Add more results than buffer limit
    setTimeout(() => {
      const mockRecognition = speechRecognizer.recognition;
      for (let i = 0; i < 12; i++) {
        setTimeout(() => {
          mockRecognition._triggerResult(`Result ${i}`, 0.9, true);
        }, i * 5);
      }
    }, 10);
  });
});

describe('SpeechRecognizer Error Scenarios', () => {
  let speechRecognizer;

  beforeEach(() => {
    speechRecognizer = new SpeechRecognizer();
  });

  afterEach(() => {
    if (speechRecognizer) {
      speechRecognizer.destroy();
    }
  });

  test('should handle missing Web Speech API', () => {
    // Temporarily remove the API
    const originalSpeechRecognition = global.window.SpeechRecognition;
    const originalWebkitSpeechRecognition = global.window.webkitSpeechRecognition;
    
    delete global.window.SpeechRecognition;
    delete global.window.webkitSpeechRecognition;
    
    const recognizer = new SpeechRecognizer();
    expect(recognizer.checkBrowserSupport()).toBe(false);
    
    // Restore
    global.window.SpeechRecognition = originalSpeechRecognition;
    global.window.webkitSpeechRecognition = originalWebkitSpeechRecognition;
  });

  test('should handle different error types appropriately', (done) => {
    const errorTypes = ['no-speech', 'audio-capture', 'not-allowed', 'network'];
    let errorCount = 0;
    
    speechRecognizer.initialize('en-US', jest.fn(), (error) => {
      expect(errorTypes).toContain(error.error);
      errorCount++;
      
      if (errorCount === errorTypes.length) {
        done();
      }
    }, jest.fn());

    speechRecognizer.startListening();
    
    // Trigger different error types
    setTimeout(() => {
      const mockRecognition = speechRecognizer.recognition;
      errorTypes.forEach((errorType, index) => {
        setTimeout(() => {
          mockRecognition._triggerError(errorType);
        }, index * 10);
      });
    }, 10);
  });
});