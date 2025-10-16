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

// Set up global mocks before importing
Object.defineProperty(global, 'window', {
  value: {
    SpeechRecognition: MockSpeechRecognition,
    webkitSpeechRecognition: MockSpeechRecognition
  },
  writable: true
});

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
    if (speechRecognizer) {
      speechRecognizer.destroy();
    }
    jest.clearAllMocks();
  });

  describe('Browser Support Detection', () => {
    test('should detect browser support correctly', () => {
      expect(speechRecognizer.checkBrowserSupport()).toBe(true);
    });

    test('should handle missing Web Speech API', () => {
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
  });

  describe('Initialization', () => {
    test('should initialize successfully with valid parameters', () => {
      const result = speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
      expect(result).toBe(true);
      expect(speechRecognizer.currentLanguage).toBe('en-US');
    });

    test('should handle initialization without browser support', () => {
      speechRecognizer.isSupported = false;
      const result = speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
      expect(result).toBe(false);
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('not supported')
        })
      );
    });

    test('should use default language when none provided', () => {
      speechRecognizer.initialize(null, mockOnResult, mockOnError, mockOnStatus);
      expect(speechRecognizer.currentLanguage).toBe('en-US');
    });
  });

  describe('Speech Recognition Control', () => {
    beforeEach(() => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    });

    test('should start listening successfully', async () => {
      const result = speechRecognizer.startListening();
      expect(result).toBe(true);
      
      // Wait for async start event
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(speechRecognizer.isListening).toBe(true);
      expect(mockOnStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'listening' })
      );
    });

    test('should stop listening successfully', async () => {
      speechRecognizer.startListening();
      await new Promise(resolve => setTimeout(resolve, 20));
      
      speechRecognizer.stopListening();
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(speechRecognizer.isListening).toBe(false);
      expect(mockOnStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'stopped' })
      );
    });

    test('should handle starting when already listening', () => {
      speechRecognizer.isListening = true;
      const result = speechRecognizer.startListening();
      expect(result).toBe(true);
    });
  });

  describe('Speech Result Processing', () => {
    beforeEach(() => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
      speechRecognizer.startListening();
    });

    test('should process final results with high confidence', async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerResult('Hello world', 0.9, true);
      
      expect(mockOnResult).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'final',
          transcript: 'hello world',
          confidence: 0.9,
          language: 'en-US'
        })
      );
    });

    test('should process interim results', async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerResult('Hello', 0, false);
      
      expect(mockOnResult).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'interim',
          transcript: 'Hello',
          confidence: 0
        })
      );
    });

    test('should filter out low confidence results', async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerResult('unclear speech', 0.3, true);
      
      // Should not call onResult for low confidence
      expect(mockOnResult).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'final' })
      );
    });

    test('should clean transcript text properly', () => {
      const cleanText = speechRecognizer.cleanTranscript('  Hello,   World!  ');
      expect(cleanText).toBe('hello, world!');
    });

    test('should maintain result buffer for context', async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerResult('First sentence', 0.9, true);
      mockRecognition._triggerResult('Second sentence', 0.9, true);
      
      expect(speechRecognizer.resultBuffer).toHaveLength(2);
      expect(speechRecognizer.getRecentContext()).toContain('first sentence');
      expect(speechRecognizer.getRecentContext()).toContain('second sentence');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    });

    test('should handle no-speech error', async () => {
      speechRecognizer.startListening();
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerError('no-speech');
      
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'speech_recognition_error',
          error: 'no-speech',
          shouldRestart: true
        })
      );
    });

    test('should handle audio-capture error', async () => {
      speechRecognizer.startListening();
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerError('audio-capture');
      
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'audio-capture',
          shouldRestart: false
        })
      );
    });

    test('should handle not-allowed error', async () => {
      speechRecognizer.startListening();
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerError('not-allowed');
      
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'not-allowed',
          message: 'Microphone access denied',
          shouldRestart: false
        })
      );
    });
  });

  describe('Language Management', () => {
    beforeEach(() => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    });

    test('should change language successfully', () => {
      const result = speechRecognizer.changeLanguage('es-ES');
      expect(result).toBe(true);
      expect(speechRecognizer.currentLanguage).toBe('es-ES');
    });

    test('should handle same language change', () => {
      const result = speechRecognizer.changeLanguage('en-US');
      expect(result).toBe(true);
    });

    test('should restart recognition when changing language while listening', async () => {
      speechRecognizer.startListening();
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const wasListening = speechRecognizer.isListening;
      speechRecognizer.changeLanguage('fr-FR');
      
      expect(wasListening).toBe(true);
      expect(speechRecognizer.currentLanguage).toBe('fr-FR');
    });
  });

  describe('Configuration Management', () => {
    beforeEach(() => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    });

    test('should update configuration correctly', () => {
      const newConfig = {
        continuous: false,
        confidenceThreshold: 0.8,
        silenceTimeout: 5000
      };
      
      speechRecognizer.updateConfig(newConfig);
      
      expect(speechRecognizer.config.continuous).toBe(false);
      expect(speechRecognizer.config.confidenceThreshold).toBe(0.8);
      expect(speechRecognizer.config.silenceTimeout).toBe(5000);
    });

    test('should apply configuration to active recognition', () => {
      speechRecognizer.updateConfig({ continuous: false });
      expect(speechRecognizer.recognition.continuous).toBe(false);
    });
  });

  describe('Status and Statistics', () => {
    beforeEach(() => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    });

    test('should provide accurate status information', () => {
      const status = speechRecognizer.getStatus();
      
      expect(status).toEqual(
        expect.objectContaining({
          isSupported: true,
          isListening: false,
          currentLanguage: 'en-US',
          resultBufferSize: 0
        })
      );
    });

    test('should track timing information', async () => {
      speechRecognizer.startListening();
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerResult('test', 0.9, true);
      
      const status = speechRecognizer.getStatus();
      expect(status.lastResultTime).toBeGreaterThan(0);
      expect(status.timeSinceLastResult).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Automatic Restart Logic', () => {
    beforeEach(() => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
    });

    test('should determine restart necessity correctly', async () => {
      speechRecognizer.startListening();
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Recent result should allow restart
      speechRecognizer.lastResultTime = Date.now() - 1000;
      expect(speechRecognizer.shouldRestart()).toBe(true);
      
      // Old result should prevent restart
      speechRecognizer.lastResultTime = Date.now() - 35000;
      expect(speechRecognizer.shouldRestart()).toBe(false);
    });

    test('should schedule restart after recoverable error', async () => {
      jest.useFakeTimers();
      
      speechRecognizer.startListening();
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const mockRecognition = speechRecognizer.recognition;
      mockRecognition._triggerError('network');
      
      // Fast-forward time to trigger restart
      jest.advanceTimersByTime(1100);
      
      expect(speechRecognizer.restartTimer).not.toBeNull();
      
      jest.useRealTimers();
    });
  });

  describe('Resource Cleanup', () => {
    test('should cleanup resources on destroy', () => {
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
      speechRecognizer.startListening();
      
      speechRecognizer.destroy();
      
      expect(speechRecognizer.recognition).toBeNull();
      expect(speechRecognizer.resultBuffer).toEqual([]);
      expect(speechRecognizer.onResultCallback).toBeNull();
      expect(speechRecognizer.onErrorCallback).toBeNull();
      expect(speechRecognizer.onStatusCallback).toBeNull();
    });

    test('should clear all timers on cleanup', () => {
      jest.useFakeTimers();
      
      speechRecognizer.initialize('en-US', mockOnResult, mockOnError, mockOnStatus);
      speechRecognizer.scheduleRestart();
      speechRecognizer.startSilenceTimer();
      
      speechRecognizer.clearTimers();
      
      expect(speechRecognizer.restartTimer).toBeNull();
      expect(speechRecognizer.silenceTimer).toBeNull();
      
      jest.useRealTimers();
    });
  });
});

// Performance and timing tests
describe('SpeechRecognizer Performance', () => {
  let speechRecognizer;
  let mockOnResult;

  beforeEach(() => {
    speechRecognizer = new SpeechRecognizer();
    mockOnResult = jest.fn();
    speechRecognizer.initialize('en-US', mockOnResult, jest.fn(), jest.fn());
  });

  afterEach(() => {
    speechRecognizer.destroy();
  });

  test('should process results within acceptable time limits', async () => {
    speechRecognizer.startListening();
    await new Promise(resolve => setTimeout(resolve, 20));
    
    const startTime = Date.now();
    const mockRecognition = speechRecognizer.recognition;
    mockRecognition._triggerResult('Performance test', 0.9, true);
    
    const processingTime = Date.now() - startTime;
    expect(processingTime).toBeLessThan(100); // Should process within 100ms
  });

  test('should handle rapid successive results', async () => {
    speechRecognizer.startListening();
    await new Promise(resolve => setTimeout(resolve, 20));
    
    const mockRecognition = speechRecognizer.recognition;
    
    // Trigger multiple rapid results
    for (let i = 0; i < 10; i++) {
      mockRecognition._triggerResult(`Result ${i}`, 0.9, true);
    }
    
    expect(mockOnResult).toHaveBeenCalledTimes(10);
    expect(speechRecognizer.resultBuffer.length).toBeLessThanOrEqual(10);
  });

  test('should maintain buffer size limits', async () => {
    speechRecognizer.startListening();
    await new Promise(resolve => setTimeout(resolve, 20));
    
    const mockRecognition = speechRecognizer.recognition;
    
    // Add more results than buffer limit
    for (let i = 0; i < 15; i++) {
      mockRecognition._triggerResult(`Buffer test ${i}`, 0.9, true);
    }
    
    expect(speechRecognizer.resultBuffer.length).toBeLessThanOrEqual(10);
  });
});