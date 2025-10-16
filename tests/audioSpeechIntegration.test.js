/**
 * Unit tests for AudioSpeechIntegration class
 * Tests the integration between AudioProcessor and SpeechRecognizer
 */

const AudioSpeechIntegration = require('../content/audioSpeechIntegration.js');

describe('AudioSpeechIntegration', () => {
  let integration;
  let mockVideoElement;
  let mockAudioProcessor;
  let mockSpeechRecognizer;
  let mockOnTranscript;
  let mockOnError;

  beforeEach(() => {
    // Mock AudioProcessor
    mockAudioProcessor = {
      captureAudioFromVideo: jest.fn(() => Promise.resolve(true)),
      stopProcessing: jest.fn(),
      getStatus: jest.fn(() => ({ isProcessing: true }))
    };

    // Mock SpeechRecognizer
    mockSpeechRecognizer = {
      initialize: jest.fn(() => true),
      startListening: jest.fn(() => true),
      stopListening: jest.fn(),
      changeLanguage: jest.fn(() => true),
      destroy: jest.fn(),
      getStatus: jest.fn(() => ({ isListening: true }))
    };

    // Mock global constructors
    global.AudioProcessor = jest.fn(() => mockAudioProcessor);
    global.SpeechRecognizer = jest.fn(() => mockSpeechRecognizer);

    // Mock video element
    mockVideoElement = document.createElement('video');
    mockVideoElement.src = 'test.mp4';

    // Mock callbacks
    mockOnTranscript = jest.fn();
    mockOnError = jest.fn();

    integration = new AudioSpeechIntegration();
  });

  afterEach(() => {
    if (integration.isActive) {
      integration.destroy();
    }
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize successfully with valid parameters', async () => {
      const result = await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      expect(result).toBe(true);
      expect(integration.isActive).toBe(true);
      expect(integration.currentVideoElement).toBe(mockVideoElement);
      expect(global.AudioProcessor).toHaveBeenCalled();
      expect(global.SpeechRecognizer).toHaveBeenCalled();
    });

    test('should initialize audio processor correctly', async () => {
      await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      expect(mockAudioProcessor.captureAudioFromVideo).toHaveBeenCalledWith(
        mockVideoElement,
        expect.any(Function),
        expect.any(Function)
      );
    });

    test('should initialize speech recognizer correctly', async () => {
      await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      expect(mockSpeechRecognizer.initialize).toHaveBeenCalledWith(
        'en-US',
        expect.any(Function),
        expect.any(Function),
        expect.any(Function)
      );
      expect(mockSpeechRecognizer.startListening).toHaveBeenCalled();
    });

    test('should handle speech recognizer initialization failure', async () => {
      mockSpeechRecognizer.initialize.mockReturnValue(false);

      const result = await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      expect(result).toBe(false);
      expect(integration.isActive).toBe(false);
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'initialization_error',
          message: 'Failed to initialize speech recognition'
        })
      );
    });

    test('should handle audio processor initialization failure', async () => {
      mockAudioProcessor.captureAudioFromVideo.mockResolvedValue(false);

      const result = await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      expect(result).toBe(false);
      expect(integration.isActive).toBe(false);
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'initialization_error',
          message: 'Failed to initialize audio capture'
        })
      );
    });

    test('should handle speech recognition start failure', async () => {
      mockSpeechRecognizer.startListening.mockReturnValue(false);

      const result = await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      expect(result).toBe(false);
      expect(integration.isActive).toBe(false);
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'initialization_error',
          message: 'Failed to start speech recognition'
        })
      );
    });

    test('should use default language when not specified', async () => {
      await integration.initialize(
        mockVideoElement,
        undefined,
        mockOnTranscript,
        mockOnError
      );

      expect(mockSpeechRecognizer.initialize).toHaveBeenCalledWith(
        'en-US',
        expect.any(Function),
        expect.any(Function),
        expect.any(Function)
      );
    });
  });

  describe('Audio Data Handling', () => {
    beforeEach(async () => {
      await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );
    });

    test('should handle audio data correctly', () => {
      const audioData = {
        frequencyData: new Uint8Array([100, 150, 200]),
        timeDomainData: new Float32Array([0.1, 0.2, 0.3]),
        audioLevel: 0.5,
        timestamp: Date.now()
      };

      // Should not throw error
      expect(() => {
        integration.handleAudioData(audioData);
      }).not.toThrow();
    });

    test('should handle audio errors', () => {
      const audioError = {
        type: 'audio_capture_error',
        message: 'Audio capture failed',
        originalError: 'CORS blocked',
        timestamp: Date.now()
      };

      integration.handleAudioError(audioError);

      expect(mockOnError).toHaveBeenCalledWith({
        type: 'audio_error',
        message: 'Audio capture failed',
        originalError: 'CORS blocked',
        timestamp: audioError.timestamp
      });
    });
  });

  describe('Speech Recognition Handling', () => {
    beforeEach(async () => {
      await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );
    });

    test('should handle speech recognition results', () => {
      const speechResult = {
        type: 'final',
        transcript: 'Hello world',
        confidence: 0.9,
        language: 'en-US',
        timestamp: Date.now(),
        context: 'video'
      };

      integration.handleSpeechResult(speechResult);

      expect(mockOnTranscript).toHaveBeenCalledWith({
        type: 'final',
        text: 'Hello world',
        confidence: 0.9,
        language: 'en-US',
        timestamp: speechResult.timestamp,
        context: 'video'
      });
    });

    test('should handle interim speech results', () => {
      const speechResult = {
        type: 'interim',
        transcript: 'Hello...',
        confidence: 0.7,
        language: 'en-US',
        timestamp: Date.now()
      };

      integration.handleSpeechResult(speechResult);

      expect(mockOnTranscript).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'interim',
          text: 'Hello...'
        })
      );
    });

    test('should handle speech recognition errors', () => {
      const speechError = {
        type: 'speech_recognition_error',
        message: 'Network error',
        error: 'network',
        shouldRestart: true,
        timestamp: Date.now()
      };

      integration.handleSpeechError(speechError);

      expect(mockOnError).toHaveBeenCalledWith({
        type: 'speech_error',
        message: 'Network error',
        error: 'network',
        shouldRestart: true,
        timestamp: speechError.timestamp
      });
    });

    test('should attempt restart for recoverable errors', (done) => {
      const speechError = {
        message: 'Temporary error',
        shouldRestart: true,
        timestamp: Date.now()
      };

      // Mock setTimeout to execute immediately
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback) => {
        callback();
        return 1;
      });

      integration.handleSpeechError(speechError);

      // Verify restart was attempted
      setTimeout(() => {
        expect(mockSpeechRecognizer.startListening).toHaveBeenCalledTimes(2); // Once during init, once during restart
        global.setTimeout = originalSetTimeout;
        done();
      }, 0);
    });

    test('should not restart when integration is inactive', () => {
      integration.isActive = false;
      
      const speechError = {
        message: 'Error',
        shouldRestart: true,
        timestamp: Date.now()
      };

      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback) => callback());

      integration.handleSpeechError(speechError);

      expect(mockSpeechRecognizer.startListening).toHaveBeenCalledTimes(1); // Only during init
      global.setTimeout = originalSetTimeout;
    });

    test('should handle speech status updates', () => {
      const status = {
        state: 'listening',
        message: 'Listening for speech'
      };

      // Should not throw error
      expect(() => {
        integration.handleSpeechStatus(status);
      }).not.toThrow();
    });
  });

  describe('Language Management', () => {
    beforeEach(async () => {
      await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );
    });

    test('should change language successfully', () => {
      const result = integration.changeLanguage('es-ES');

      expect(result).toBe(true);
      expect(mockSpeechRecognizer.changeLanguage).toHaveBeenCalledWith('es-ES');
    });

    test('should handle language change when speech recognizer not available', () => {
      integration.speechRecognizer = null;

      const result = integration.changeLanguage('es-ES');

      expect(result).toBe(false);
    });

    test('should handle language change failure', () => {
      mockSpeechRecognizer.changeLanguage.mockReturnValue(false);

      const result = integration.changeLanguage('invalid-lang');

      expect(result).toBe(false);
    });
  });

  describe('Status and Control', () => {
    test('should return correct initial status', () => {
      const status = integration.getStatus();

      expect(status).toEqual({
        isActive: false,
        hasVideoElement: false,
        audioStatus: null,
        speechStatus: null
      });
    });

    test('should return correct status after initialization', async () => {
      await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      const status = integration.getStatus();

      expect(status).toEqual({
        isActive: true,
        hasVideoElement: true,
        audioStatus: { isProcessing: true },
        speechStatus: { isListening: true }
      });
    });

    test('should stop integration correctly', async () => {
      await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      integration.stop();

      expect(integration.isActive).toBe(false);
      expect(mockSpeechRecognizer.stopListening).toHaveBeenCalled();
      expect(mockAudioProcessor.stopProcessing).toHaveBeenCalled();
    });

    test('should handle stop when components are not initialized', () => {
      integration.speechRecognizer = null;
      integration.audioProcessor = null;

      expect(() => {
        integration.stop();
      }).not.toThrow();
    });
  });

  describe('Resource Cleanup', () => {
    test('should destroy integration and cleanup resources', async () => {
      await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      integration.destroy();

      expect(integration.isActive).toBe(false);
      expect(integration.speechRecognizer).toBeNull();
      expect(integration.audioProcessor).toBeNull();
      expect(integration.currentVideoElement).toBeNull();
      expect(integration.onTranscriptCallback).toBeNull();
      expect(integration.onErrorCallback).toBeNull();
      expect(mockSpeechRecognizer.destroy).toHaveBeenCalled();
    });

    test('should handle destroy when not initialized', () => {
      expect(() => {
        integration.destroy();
      }).not.toThrow();
    });

    test('should handle destroy with partial initialization', () => {
      integration.speechRecognizer = mockSpeechRecognizer;
      integration.audioProcessor = null;

      expect(() => {
        integration.destroy();
      }).not.toThrow();

      expect(mockSpeechRecognizer.destroy).toHaveBeenCalled();
    });
  });

  describe('Error Scenarios', () => {
    test('should handle initialization with null video element', async () => {
      const result = await integration.initialize(
        null,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      expect(result).toBe(true); // Should still initialize
      expect(integration.currentVideoElement).toBeNull();
    });

    test('should handle initialization without callbacks', async () => {
      const result = await integration.initialize(
        mockVideoElement,
        'en-US',
        null,
        null
      );

      expect(result).toBe(true);
      expect(integration.onTranscriptCallback).toBeNull();
      expect(integration.onErrorCallback).toBeNull();
    });

    test('should handle audio processor creation failure', async () => {
      global.AudioProcessor = jest.fn(() => {
        throw new Error('AudioProcessor creation failed');
      });

      const result = await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      expect(result).toBe(false);
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'initialization_error'
        })
      );
    });

    test('should handle speech recognizer creation failure', async () => {
      global.SpeechRecognizer = jest.fn(() => {
        throw new Error('SpeechRecognizer creation failed');
      });

      const result = await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      expect(result).toBe(false);
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'initialization_error'
        })
      );
    });
  });

  describe('Integration Workflow', () => {
    test('should handle complete workflow from initialization to transcript', async () => {
      // Initialize
      const result = await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      expect(result).toBe(true);

      // Simulate audio data
      const audioData = {
        audioLevel: 0.5,
        timestamp: Date.now()
      };
      integration.handleAudioData(audioData);

      // Simulate speech result
      const speechResult = {
        type: 'final',
        transcript: 'Test transcript',
        confidence: 0.9,
        language: 'en-US',
        timestamp: Date.now()
      };
      integration.handleSpeechResult(speechResult);

      // Verify workflow
      expect(mockOnTranscript).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Test transcript',
          type: 'final'
        })
      );
    });

    test('should handle error recovery workflow', async () => {
      await integration.initialize(
        mockVideoElement,
        'en-US',
        mockOnTranscript,
        mockOnError
      );

      // Simulate recoverable error
      const error = {
        message: 'Temporary network error',
        shouldRestart: true,
        timestamp: Date.now()
      };

      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback) => callback());

      integration.handleSpeechError(error);

      // Verify error was reported and restart attempted
      expect(mockOnError).toHaveBeenCalled();
      expect(mockSpeechRecognizer.startListening).toHaveBeenCalledTimes(2);

      global.setTimeout = originalSetTimeout;
    });
  });
});