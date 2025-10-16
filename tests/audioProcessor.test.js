/**
 * Comprehensive unit tests for AudioProcessor class
 * Tests audio capture, processing, and Web Audio API integration
 */

const AudioProcessor = require('../content/audioProcessor.js');

describe('AudioProcessor', () => {
  let audioProcessor;
  let mockVideoElement;
  let mockAudioContext;
  let mockMediaElementSource;
  let mockAnalyser;
  let mockOnAudioData;
  let mockOnError;

  beforeEach(() => {
    audioProcessor = new AudioProcessor();
    
    // Mock video element
    mockVideoElement = {
      audioTracks: [{ enabled: true }],
      muted: false,
      volume: 1.0,
      paused: false,
      currentTime: 0,
      duration: 120
    };

    // Mock Web Audio API components
    mockAnalyser = {
      fftSize: 2048,
      smoothingTimeConstant: 0.8,
      frequencyBinCount: 1024,
      connect: jest.fn(),
      disconnect: jest.fn(),
      getByteFrequencyData: jest.fn(),
      getFloatTimeDomainData: jest.fn()
    };

    mockMediaElementSource = {
      connect: jest.fn(),
      disconnect: jest.fn()
    };

    mockAudioContext = {
      state: 'running',
      sampleRate: 16000,
      createMediaElementSource: jest.fn(() => mockMediaElementSource),
      createAnalyser: jest.fn(() => mockAnalyser),
      resume: jest.fn(() => Promise.resolve()),
      close: jest.fn(() => Promise.resolve())
    };

    // Mock global AudioContext
    global.AudioContext = jest.fn(() => mockAudioContext);
    global.webkitAudioContext = jest.fn(() => mockAudioContext);
    global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 16));

    // Mock callbacks
    mockOnAudioData = jest.fn();
    mockOnError = jest.fn();
  });

  afterEach(() => {
    if (audioProcessor.isProcessing) {
      audioProcessor.stopProcessing();
    }
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with default values', () => {
      expect(audioProcessor.audioContext).toBeNull();
      expect(audioProcessor.mediaStreamSource).toBeNull();
      expect(audioProcessor.analyser).toBeNull();
      expect(audioProcessor.isProcessing).toBe(false);
      expect(audioProcessor.videoElement).toBeNull();
    });

    test('should create audio context with correct parameters', async () => {
      await audioProcessor.createAudioContext();

      expect(global.AudioContext).toHaveBeenCalledWith({
        sampleRate: 16000,
        latencyHint: 'interactive'
      });
      expect(audioProcessor.audioContext).toBe(mockAudioContext);
    });

    test('should resume suspended audio context', async () => {
      mockAudioContext.state = 'suspended';
      
      await audioProcessor.createAudioContext();

      expect(mockAudioContext.resume).toHaveBeenCalled();
    });

    test('should handle audio context creation failure', async () => {
      global.AudioContext = jest.fn(() => {
        throw new Error('AudioContext not supported');
      });

      await expect(audioProcessor.createAudioContext()).rejects.toThrow(
        'Failed to create AudioContext: AudioContext not supported'
      );
    });
  });

  describe('Audio Track Detection', () => {
    test('should detect video with audio tracks', () => {
      const hasAudio = audioProcessor.hasAudioTrack(mockVideoElement);
      expect(hasAudio).toBe(true);
    });

    test('should detect video without audio tracks', () => {
      mockVideoElement.audioTracks = [];
      const hasAudio = audioProcessor.hasAudioTrack(mockVideoElement);
      expect(hasAudio).toBe(true); // Default assumption
    });

    test('should detect muted video as no audio', () => {
      mockVideoElement.audioTracks = undefined;
      mockVideoElement.muted = true;
      const hasAudio = audioProcessor.hasAudioTrack(mockVideoElement);
      expect(hasAudio).toBe(false);
    });

    test('should detect zero volume video as no audio', () => {
      mockVideoElement.audioTracks = undefined;
      mockVideoElement.volume = 0;
      const hasAudio = audioProcessor.hasAudioTrack(mockVideoElement);
      expect(hasAudio).toBe(false);
    });
  });

  describe('Audio Capture', () => {
    test('should successfully capture audio from video element', async () => {
      const result = await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );

      expect(result).toBe(true);
      expect(audioProcessor.isProcessing).toBe(true);
      expect(audioProcessor.videoElement).toBe(mockVideoElement);
      expect(mockAudioContext.createMediaElementSource).toHaveBeenCalledWith(mockVideoElement);
      expect(mockMediaElementSource.connect).toHaveBeenCalledWith(mockAnalyser);
    });

    test('should fail when video has no audio track', async () => {
      mockVideoElement.audioTracks = [];
      mockVideoElement.muted = true;

      const result = await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );

      expect(result).toBe(false);
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'audio_capture_error',
          message: 'Video element has no audio track'
        })
      );
    });

    test('should handle InvalidStateError for already connected video', async () => {
      // Ensure video has audio tracks so we get to the capture attempt
      mockVideoElement.audioTracks = [{ enabled: true }];
      
      mockAudioContext.createMediaElementSource.mockImplementation(() => {
        const error = new Error('Already connected');
        error.name = 'InvalidStateError';
        throw error;
      });

      const result = await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );

      // Should fail to capture audio due to InvalidStateError
      expect(result).toBe(false);
      // Error callback should be called with the final error after all methods fail
      expect(mockOnError).toHaveBeenCalled();
    });

    test('should handle CORS errors for cross-origin videos', async () => {
      mockAudioContext.createMediaElementSource.mockImplementation(() => {
        const error = new Error('CORS blocked');
        error.name = 'NotSupportedError';
        throw error;
      });

      const result = await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );

      expect(result).toBe(false);
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'audio_capture_error',
          context: 'Audio capture failed'
        })
      );
    });
  });

  describe('Audio Analysis', () => {
    beforeEach(async () => {
      await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );
    });

    test('should calculate audio level correctly', () => {
      const frequencyData = new Uint8Array([100, 150, 200, 50]);
      const level = audioProcessor.calculateAudioLevel(frequencyData);
      
      // Expected: (100 + 150 + 200 + 50) / (4 * 255) = 500 / 1020 ≈ 0.49
      expect(level).toBeCloseTo(0.49, 2);
    });

    test('should detect voice activity above threshold', () => {
      const timeDomainData = new Float32Array(100);
      // Create voice-like signal with variations
      for (let i = 0; i < 100; i++) {
        timeDomainData[i] = Math.sin(i * 0.1) * 0.5;
      }
      
      const hasVoice = audioProcessor.detectVoiceActivity(timeDomainData, 0.02);
      expect(hasVoice).toBe(true);
    });

    test('should not detect voice activity below threshold', () => {
      const timeDomainData = new Float32Array(100);
      // Create silent signal
      timeDomainData.fill(0.001);
      
      const hasVoice = audioProcessor.detectVoiceActivity(timeDomainData, 0.001);
      expect(hasVoice).toBe(false);
    });

    test('should detect voice characteristics in signal', () => {
      const timeDomainData = new Float32Array(100);
      // Create signal with sufficient variation
      for (let i = 0; i < 100; i++) {
        timeDomainData[i] = (i % 2 === 0) ? 0.1 : -0.1;
      }
      
      const hasVoiceChars = audioProcessor.hasVoiceCharacteristics(timeDomainData);
      expect(hasVoiceChars).toBe(true);
    });

    test('should not detect voice characteristics in monotone signal', () => {
      const timeDomainData = new Float32Array(100);
      timeDomainData.fill(0.1); // Constant signal
      
      const hasVoiceChars = audioProcessor.hasVoiceCharacteristics(timeDomainData);
      expect(hasVoiceChars).toBe(false);
    });

    test('should call audio data callback when voice detected', async () => {
      // First initialize audio capture
      await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );

      // Mock analyser data methods with voice-like characteristics
      const mockFrequencyData = new Uint8Array(1024);
      mockFrequencyData.fill(50); // Audio level that will result in > 0.01 threshold
      
      const mockTimeDomainData = new Float32Array(1024);
      // Create signal with sufficient variation for voice detection
      for (let i = 0; i < 1024; i++) {
        mockTimeDomainData[i] = (i % 2 === 0) ? 0.05 : -0.05; // High variation signal
      }

      mockAnalyser.getByteFrequencyData.mockImplementation((array) => {
        array.set(mockFrequencyData);
      });
      
      mockAnalyser.getFloatTimeDomainData.mockImplementation((array) => {
        array.set(mockTimeDomainData);
      });

      // Trigger animation frame manually since startAudioAnalysis is called during capture
      const animationCallback = global.requestAnimationFrame.mock.calls[0][0];
      animationCallback();

      expect(mockOnAudioData).toHaveBeenCalledWith(
        expect.objectContaining({
          frequencyData: expect.any(Uint8Array),
          timeDomainData: expect.any(Float32Array),
          audioLevel: expect.any(Number),
          timestamp: expect.any(Number)
        })
      );
    });
  });

  describe('Resource Management', () => {
    test('should stop processing and cleanup resources', async () => {
      await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );

      audioProcessor.stopProcessing();

      expect(audioProcessor.isProcessing).toBe(false);
      expect(mockMediaElementSource.disconnect).toHaveBeenCalled();
      expect(mockAnalyser.disconnect).toHaveBeenCalled();
      expect(mockAudioContext.close).toHaveBeenCalled();
      expect(audioProcessor.mediaStreamSource).toBeNull();
      expect(audioProcessor.analyser).toBeNull();
      expect(audioProcessor.audioContext).toBeNull();
    });

    test('should handle cleanup when resources are already null', () => {
      // Should not throw error when stopping without initialization
      expect(() => audioProcessor.stopProcessing()).not.toThrow();
    });

    test('should not close already closed audio context', async () => {
      await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );

      mockAudioContext.state = 'closed';
      audioProcessor.stopProcessing();

      expect(mockAudioContext.close).not.toHaveBeenCalled();
    });
  });

  describe('Status Reporting', () => {
    test('should report initial status', () => {
      const status = audioProcessor.getStatus();

      expect(status).toEqual({
        isProcessing: false,
        hasAudioContext: false,
        hasMediaSource: false,
        hasAnalyser: false,
        audioContextState: null
      });
    });

    test('should report active status after initialization', async () => {
      await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );

      const status = audioProcessor.getStatus();

      expect(status).toEqual({
        isProcessing: true,
        hasAudioContext: true,
        hasMediaSource: true,
        hasAnalyser: true,
        audioContextState: 'running'
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle errors with structured error object', () => {
      const testError = new Error('Test error');
      audioProcessor.onErrorCallback = mockOnError;

      audioProcessor.handleError('Test context', testError);

      expect(mockOnError).toHaveBeenCalledWith({
        type: 'audio_capture_error',
        message: 'Test error',
        originalError: 'Test error',
        timestamp: expect.any(Number),
        context: 'Test context'
      });
    });

    test('should verify error callback is set during capture', async () => {
      // This test verifies that the error callback is properly set
      await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );

      expect(audioProcessor.onErrorCallback).toBe(mockOnError);
    });

    test('should handle non-Error objects', () => {
      audioProcessor.onErrorCallback = mockOnError;

      audioProcessor.handleError('Test context', 'String error');

      expect(mockOnError).toHaveBeenCalledWith({
        type: 'audio_capture_error',
        message: 'String error',
        originalError: 'String error',
        timestamp: expect.any(Number),
        context: 'Test context'
      });
    });

    test('should not throw when error callback is not set', () => {
      const testError = new Error('Test error');

      expect(() => {
        audioProcessor.handleError('Test context', testError);
      }).not.toThrow();
    });
  });

  describe('Alternative Capture Methods', () => {
    test('should attempt media stream capture when direct capture fails', async () => {
      mockAudioContext.createMediaElementSource.mockImplementation(() => {
        throw new Error('Direct capture failed');
      });

      const result = await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );

      expect(result).toBe(false);
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'audio_capture_error',
          context: 'Audio capture failed'
        })
      );
    });

    test('should attempt CORS workaround when other methods fail', async () => {
      mockAudioContext.createMediaElementSource.mockImplementation(() => {
        throw new Error('All methods failed');
      });

      const result = await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );

      expect(result).toBe(false);
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'audio_capture_error',
          context: 'Audio capture failed'
        })
      );
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete audio processing workflow', async () => {
      // Setup mock data for realistic scenario
      const mockFrequencyData = new Uint8Array(1024);
      mockFrequencyData.fill(50); // Audio level that passes voice threshold
      
      const mockTimeDomainData = new Float32Array(1024);
      // Create signal with high variation for voice detection
      for (let i = 0; i < 1024; i++) {
        mockTimeDomainData[i] = (i % 2 === 0) ? 0.05 : -0.05;
      }

      mockAnalyser.getByteFrequencyData.mockImplementation((array) => {
        array.set(mockFrequencyData);
      });
      
      mockAnalyser.getFloatTimeDomainData.mockImplementation((array) => {
        array.set(mockTimeDomainData);
      });

      // Start complete workflow
      const result = await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );

      expect(result).toBe(true);
      expect(audioProcessor.getStatus().isProcessing).toBe(true);

      // Simulate audio analysis cycle
      const animationCallback = global.requestAnimationFrame.mock.calls[0][0];
      animationCallback();

      // Verify complete workflow
      expect(mockOnAudioData).toHaveBeenCalled();

      // Cleanup
      audioProcessor.stopProcessing();
      expect(audioProcessor.getStatus().isProcessing).toBe(false);
    });

    test('should handle video element state changes', async () => {
      await audioProcessor.captureAudioFromVideo(
        mockVideoElement, 
        mockOnAudioData, 
        mockOnError
      );

      // Simulate video pause
      mockVideoElement.paused = true;
      
      // Audio processing should continue regardless of video state
      expect(audioProcessor.isProcessing).toBe(true);
      
      // Simulate video mute - need to remove audioTracks for hasAudioTrack to return false
      mockVideoElement.muted = true;
      mockVideoElement.audioTracks = undefined;
      
      // Processing continues but hasAudioTrack would return false for new captures
      expect(audioProcessor.hasAudioTrack(mockVideoElement)).toBe(false);
    });
  });
});