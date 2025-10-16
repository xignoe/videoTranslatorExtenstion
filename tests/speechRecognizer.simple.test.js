/**
 * Simple unit tests for SpeechRecognizer class
 * Focused on core functionality and basic error handling
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
}

// Set up global mocks
global.SpeechRecognition = MockSpeechRecognition;
global.webkitSpeechRecognition = MockSpeechRecognition;

// Import the class to test
const SpeechRecognizer = require('../content/speechRecognizer.js');

describe('SpeechRecognizer Core Functionality', () => {
  let speechRecognizer;
  let mockOnResult;
  let mockOnError;

  beforeEach(() => {
    speechRecognizer = new SpeechRecognizer();
    mockOnResult = jest.fn();
    mockOnError = jest.fn();
  });

  afterEach(() => {
    if (speechRecognizer.isListening) {
      speechRecognizer.stop();
    }
  });

  test('should initialize correctly', () => {
    speechRecognizer.initialize('en-US', mockOnResult, mockOnError);
    
    expect(speechRecognizer.language).toBe('en-US');
    expect(speechRecognizer.recognition).toBeTruthy();
    expect(speechRecognizer.isListening).toBe(false);
  });

  test('should start and stop recognition', () => {
    speechRecognizer.initialize('en-US', mockOnResult, mockOnError);
    
    speechRecognizer.start();
    expect(speechRecognizer.isListening).toBe(true);
    
    speechRecognizer.stop();
    expect(speechRecognizer.isListening).toBe(false);
  });

  test('should process final results with high confidence', (done) => {
    speechRecognizer.initialize('en-US', (result) => {
      expect(result.type).toBe('final');
      expect(result.transcript).toBe('hello world');
      expect(result.confidence).toBe(0.9);
      done();
    }, mockOnError);

    speechRecognizer.start();
    setTimeout(() => {
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerResult('hello world', 0.9, true);
    }, 10);
  });

  test('should filter out low confidence results', (done) => {
    let resultCalled = false;
    
    speechRecognizer.initialize('en-US', () => {
      resultCalled = true;
    }, mockOnError);

    speechRecognizer.start();
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

  test('should handle speech recognition errors', (done) => {
    speechRecognizer.initialize('en-US', mockOnResult, (error) => {
      expect(error.type).toBe('speech_recognition_error');
      expect(error.error).toBe('no-speech');
      done();
    });

    speechRecognizer.start();
    setTimeout(() => {
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerError('no-speech');
    }, 10);
  });

  test('should normalize transcript text', (done) => {
    speechRecognizer.initialize('en-US', (result) => {
      expect(result.transcript).toBe('hello world');
      done();
    }, mockOnError);

    speechRecognizer.start();
    setTimeout(() => {
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerResult('  HELLO WORLD  ', 0.9, true);
    }, 10);
  });

  test('should maintain result buffer with size limits', (done) => {
    let resultCount = 0;
    
    speechRecognizer.initialize('en-US', () => {
      resultCount++;
      
      if (resultCount === 12) {
        const buffer = speechRecognizer.getResultBuffer();
        expect(buffer.length).toBeLessThanOrEqual(10);
        done();
      }
    }, mockOnError);

    speechRecognizer.start();
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
  let mockOnResult;
  let mockOnError;

  beforeEach(() => {
    speechRecognizer = new SpeechRecognizer();
    mockOnResult = jest.fn();
    mockOnError = jest.fn();
  });

  afterEach(() => {
    if (speechRecognizer.isListening) {
      speechRecognizer.stop();
    }
  });

  test('should handle different error types appropriately', (done) => {
    const errorTypes = ['no-speech', 'audio-capture', 'not-allowed', 'network'];
    let errorCount = 0;
    
    speechRecognizer.initialize('en-US', mockOnResult, (error) => {
      expect(error.type).toBe('speech_recognition_error');
      expect(errorTypes).toContain(error.error);
      errorCount++;
      
      if (errorCount === errorTypes.length) {
        done();
      }
    });

    speechRecognizer.start();
    setTimeout(() => {
      const mockRecognition = speechRecognizer.recognition;
      errorTypes.forEach((errorType, index) => {
        setTimeout(() => {
          mockRecognition._triggerError(errorType);
        }, index * 10);
      });
    }, 10);
  });

  test('should handle missing SpeechRecognition API', () => {
    const originalSpeechRecognition = global.SpeechRecognition;
    const originalWebkitSpeechRecognition = global.webkitSpeechRecognition;
    
    delete global.SpeechRecognition;
    delete global.webkitSpeechRecognition;

    speechRecognizer.initialize('en-US', mockOnResult, mockOnError);

    expect(mockOnError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'speech_recognition_error',
        error: 'not-supported'
      })
    );

    // Restore
    global.SpeechRecognition = originalSpeechRecognition;
    global.webkitSpeechRecognition = originalWebkitSpeechRecognition;
  });
});