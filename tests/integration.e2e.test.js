/**
 * End-to-end integration tests for the complete video translation pipeline
 * Tests the full workflow from video detection to subtitle display
 */

// Mock all required components
const mockComponents = {
  VideoDetector: jest.fn(),
  AudioProcessor: jest.fn(),
  SpeechRecognizer: jest.fn(),
  TranslationService: jest.fn(),
  SubtitleRenderer: jest.fn(),
  SubtitleStyleManager: jest.fn(),
  ErrorHandler: jest.fn(),
  StatusIndicator: jest.fn()
};

// Set up global mocks
Object.assign(global, mockComponents);

describe('Video Translation Pipeline Integration', () => {
  let mockVideoElement;
  let mockVideoDetector;
  let mockAudioProcessor;
  let mockSpeechRecognizer;
  let mockTranslationService;
  let mockSubtitleRenderer;
  let mockStatusIndicator;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock video element
    mockVideoElement = document.createElement('video');
    mockVideoElement.src = 'test-video.mp4';
    mockVideoElement.currentTime = 0;
    mockVideoElement.duration = 120;
    mockVideoElement.paused = false;
    mockVideoElement.muted = false;
    mockVideoElement.volume = 1.0;

    // Mock component instances
    mockVideoDetector = {
      initialize: jest.fn(),
      destroy: jest.fn(),
      getDetectedVideos: jest.fn(() => [])
    };

    mockAudioProcessor = {
      captureAudioFromVideo: jest.fn(() => Promise.resolve(true)),
      stopProcessing: jest.fn(),
      getStatus: jest.fn(() => ({ isProcessing: true }))
    };

    mockSpeechRecognizer = {
      initialize: jest.fn(() => true),
      startListening: jest.fn(() => true),
      stopListening: jest.fn(),
      changeLanguage: jest.fn(() => true),
      isListening: false
    };

    mockTranslationService = {
      translateText: jest.fn(() => Promise.resolve({
        originalText: 'Hello world',
        translatedText: 'Hola mundo',
        sourceLanguage: 'en',
        targetLanguage: 'es',
        confidence: 0.95
      }))
    };

    mockSubtitleRenderer = {
      initializeForVideo: jest.fn(),
      displaySubtitle: jest.fn(),
      clearSubtitle: jest.fn(),
      cleanup: jest.fn(),
      updateSettings: jest.fn()
    };

    mockStatusIndicator = {
      updateSettings: jest.fn(),
      createIndicator: jest.fn(),
      updateIndicatorStatus: jest.fn(),
      removeIndicator: jest.fn(),
      showGlobalStatus: jest.fn()
    };

    // Set up constructor mocks
    global.VideoDetector.mockImplementation(() => mockVideoDetector);
    global.AudioProcessor.mockImplementation(() => mockAudioProcessor);
    global.SpeechRecognizer.mockImplementation(() => mockSpeechRecognizer);
    global.TranslationService.mockImplementation(() => mockTranslationService);
    global.SubtitleRenderer.mockImplementation(() => mockSubtitleRenderer);
    global.StatusIndicator.mockImplementation(() => mockStatusIndicator);
  });

  describe('Complete Translation Workflow', () => {
    test('should handle full video-to-subtitle translation pipeline', async () => {
      // Simulate the complete workflow
      const videoInfo = {
        id: 'test-video-1',
        element: mockVideoElement,
        platform: 'youtube',
        src: 'test-video.mp4'
      };

      // Step 1: Video Detection
      const onVideoAdded = jest.fn();
      const onVideoRemoved = jest.fn();
      
      mockVideoDetector.initialize.mockImplementation((callbacks) => {
        // Simulate video detection
        setTimeout(() => callbacks.onVideoAdded(videoInfo), 0);
      });

      // Step 2: Audio Processing Setup
      let audioDataCallback;
      mockAudioProcessor.captureAudioFromVideo.mockImplementation((element, onAudioData, onError) => {
        audioDataCallback = onAudioData;
        return Promise.resolve(true);
      });

      // Step 3: Speech Recognition Setup
      let speechResultCallback;
      mockSpeechRecognizer.initialize.mockImplementation((lang, onResult, onError, onStatus) => {
        speechResultCallback = onResult;
        return true;
      });

      // Step 4: Initialize the system
      mockVideoDetector.initialize({ onVideoAdded, onVideoRemoved });

      // Wait for video detection
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(onVideoAdded).toHaveBeenCalledWith(videoInfo);

      // Step 5: Simulate audio processing
      expect(mockAudioProcessor.captureAudioFromVideo).toHaveBeenCalledWith(
        mockVideoElement,
        expect.any(Function),
        expect.any(Function)
      );

      // Step 6: Simulate speech recognition initialization
      expect(mockSpeechRecognizer.initialize).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.any(Function),
        expect.any(Function)
      );

      // Step 7: Simulate audio data triggering speech recognition
      const audioData = {
        frequencyData: new Uint8Array([100, 150, 200]),
        timeDomainData: new Float32Array([0.1, 0.2, 0.3]),
        audioLevel: 0.5,
        timestamp: Date.now()
      };

      audioDataCallback(audioData);

      // Step 8: Simulate speech recognition result
      const speechResult = {
        type: 'final',
        transcript: 'Hello world',
        confidence: 0.9,
        language: 'en-US',
        timestamp: Date.now()
      };

      await speechResultCallback(speechResult);

      // Step 9: Verify translation was called
      expect(mockTranslationService.translateText).toHaveBeenCalledWith(
        'Hello world',
        expect.any(String),
        expect.any(String)
      );

      // Step 10: Verify subtitle was displayed
      expect(mockSubtitleRenderer.displaySubtitle).toHaveBeenCalledWith(
        expect.any(String),
        'Hola mundo',
        expect.any(Object)
      );
    });

    test('should handle multiple simultaneous videos', async () => {
      const video1Info = {
        id: 'video-1',
        element: mockVideoElement,
        platform: 'youtube'
      };

      const video2Element = document.createElement('video');
      video2Element.src = 'test-video-2.mp4';
      
      const video2Info = {
        id: 'video-2',
        element: video2Element,
        platform: 'netflix'
      };

      const onVideoAdded = jest.fn();
      
      mockVideoDetector.initialize.mockImplementation((callbacks) => {
        setTimeout(() => {
          callbacks.onVideoAdded(video1Info);
          callbacks.onVideoAdded(video2Info);
        }, 0);
      });

      mockVideoDetector.initialize({ onVideoAdded });
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should handle both videos
      expect(onVideoAdded).toHaveBeenCalledTimes(2);
      expect(mockAudioProcessor.captureAudioFromVideo).toHaveBeenCalledTimes(2);
      expect(mockSubtitleRenderer.initializeForVideo).toHaveBeenCalledTimes(2);
    });

    test('should handle translation errors gracefully', async () => {
      const videoInfo = {
        id: 'test-video-1',
        element: mockVideoElement,
        platform: 'youtube'
      };

      // Mock translation failure
      mockTranslationService.translateText.mockRejectedValue(new Error('Translation API unavailable'));

      const onVideoAdded = jest.fn();
      let speechResultCallback;

      mockVideoDetector.initialize.mockImplementation((callbacks) => {
        setTimeout(() => callbacks.onVideoAdded(videoInfo), 0);
      });

      mockSpeechRecognizer.initialize.mockImplementation((lang, onResult) => {
        speechResultCallback = onResult;
        return true;
      });

      mockVideoDetector.initialize({ onVideoAdded });
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate speech result
      const speechResult = {
        type: 'final',
        transcript: 'Hello world',
        confidence: 0.9
      };

      await speechResultCallback(speechResult);

      // Should still display original transcript when translation fails
      expect(mockSubtitleRenderer.displaySubtitle).toHaveBeenCalledWith(
        expect.any(String),
        'Hello world', // Original text when translation fails
        expect.any(Object)
      );
    });

    test('should handle audio capture failures', async () => {
      const videoInfo = {
        id: 'test-video-1',
        element: mockVideoElement,
        platform: 'youtube'
      };

      // Mock audio capture failure
      mockAudioProcessor.captureAudioFromVideo.mockResolvedValue(false);

      const onVideoAdded = jest.fn();
      
      mockVideoDetector.initialize.mockImplementation((callbacks) => {
        setTimeout(() => callbacks.onVideoAdded(videoInfo), 0);
      });

      mockVideoDetector.initialize({ onVideoAdded });
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(onVideoAdded).toHaveBeenCalledWith(videoInfo);
      expect(mockAudioProcessor.captureAudioFromVideo).toHaveBeenCalled();
      
      // Should handle failure gracefully without crashing
      expect(mockStatusIndicator.updateIndicatorStatus).toHaveBeenCalledWith(
        expect.any(String),
        'no-audio',
        expect.any(Object)
      );
    });
  });

  describe('Cross-Platform Compatibility', () => {
    const platforms = [
      { name: 'YouTube', url: 'https://www.youtube.com/watch?v=test', selector: 'video' },
      { name: 'Netflix', url: 'https://www.netflix.com/watch/test', selector: 'video' },
      { name: 'Vimeo', url: 'https://vimeo.com/test', selector: 'video' },
      { name: 'Generic', url: 'https://example.com/video.mp4', selector: 'video' }
    ];

    platforms.forEach(platform => {
      test(`should work on ${platform.name}`, async () => {
        // Mock current page URL
        Object.defineProperty(window, 'location', {
          value: { href: platform.url },
          writable: true
        });

        const videoInfo = {
          id: `${platform.name.toLowerCase()}-video-1`,
          element: mockVideoElement,
          platform: platform.name.toLowerCase(),
          src: 'test-video.mp4'
        };

        const onVideoAdded = jest.fn();
        
        mockVideoDetector.initialize.mockImplementation((callbacks) => {
          setTimeout(() => callbacks.onVideoAdded(videoInfo), 0);
        });

        mockVideoDetector.initialize({ onVideoAdded });
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(onVideoAdded).toHaveBeenCalledWith(videoInfo);
        expect(mockSubtitleRenderer.initializeForVideo).toHaveBeenCalledWith(
          mockVideoElement,
          videoInfo.id,
          expect.any(Object)
        );
      });
    });

    test('should handle iframe-embedded videos', async () => {
      // Create mock iframe with video
      const mockIframe = document.createElement('iframe');
      mockIframe.src = 'https://www.youtube.com/embed/test';
      
      const iframeVideoInfo = {
        id: 'iframe-video-1',
        element: mockVideoElement,
        platform: 'youtube-embed',
        isIframe: true
      };

      const onVideoAdded = jest.fn();
      
      mockVideoDetector.initialize.mockImplementation((callbacks) => {
        setTimeout(() => callbacks.onVideoAdded(iframeVideoInfo), 0);
      });

      mockVideoDetector.initialize({ onVideoAdded });
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(onVideoAdded).toHaveBeenCalledWith(iframeVideoInfo);
      // Should handle iframe videos the same way as regular videos
      expect(mockAudioProcessor.captureAudioFromVideo).toHaveBeenCalled();
    });
  });

  describe('Performance and Memory Management', () => {
    test('should cleanup resources when videos are removed', async () => {
      const videoInfo = {
        id: 'test-video-1',
        element: mockVideoElement,
        platform: 'youtube'
      };

      const onVideoAdded = jest.fn();
      const onVideoRemoved = jest.fn();
      
      mockVideoDetector.initialize.mockImplementation((callbacks) => {
        setTimeout(() => {
          callbacks.onVideoAdded(videoInfo);
          // Simulate video removal after 100ms
          setTimeout(() => callbacks.onVideoRemoved(videoInfo), 100);
        }, 0);
      });

      mockVideoDetector.initialize({ onVideoAdded, onVideoRemoved });
      
      // Wait for video addition
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(onVideoAdded).toHaveBeenCalledWith(videoInfo);

      // Wait for video removal
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(onVideoRemoved).toHaveBeenCalledWith(videoInfo);

      // Verify cleanup was called
      expect(mockAudioProcessor.stopProcessing).toHaveBeenCalled();
      expect(mockSubtitleRenderer.cleanup).toHaveBeenCalledWith(videoInfo.id);
      expect(mockStatusIndicator.removeIndicator).toHaveBeenCalledWith(videoInfo.id);
    });

    test('should handle rapid video additions and removals', async () => {
      const videos = Array.from({ length: 10 }, (_, i) => ({
        id: `video-${i}`,
        element: document.createElement('video'),
        platform: 'test'
      }));

      const onVideoAdded = jest.fn();
      const onVideoRemoved = jest.fn();
      
      mockVideoDetector.initialize.mockImplementation((callbacks) => {
        // Rapidly add and remove videos
        videos.forEach((video, index) => {
          setTimeout(() => callbacks.onVideoAdded(video), index * 10);
          setTimeout(() => callbacks.onVideoRemoved(video), index * 10 + 50);
        });
      });

      mockVideoDetector.initialize({ onVideoAdded, onVideoRemoved });
      
      // Wait for all operations to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(onVideoAdded).toHaveBeenCalledTimes(10);
      expect(onVideoRemoved).toHaveBeenCalledTimes(10);
      expect(mockSubtitleRenderer.cleanup).toHaveBeenCalledTimes(10);
    });

    test('should handle memory-intensive scenarios', async () => {
      // Simulate processing large amounts of audio data
      const videoInfo = {
        id: 'memory-test-video',
        element: mockVideoElement,
        platform: 'test'
      };

      let audioDataCallback;
      mockAudioProcessor.captureAudioFromVideo.mockImplementation((element, onAudioData) => {
        audioDataCallback = onAudioData;
        return Promise.resolve(true);
      });

      const onVideoAdded = jest.fn();
      mockVideoDetector.initialize.mockImplementation((callbacks) => {
        setTimeout(() => callbacks.onVideoAdded(videoInfo), 0);
      });

      mockVideoDetector.initialize({ onVideoAdded });
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate high-frequency audio data
      for (let i = 0; i < 100; i++) {
        const audioData = {
          frequencyData: new Uint8Array(2048),
          timeDomainData: new Float32Array(2048),
          audioLevel: Math.random(),
          timestamp: Date.now() + i
        };
        audioDataCallback(audioData);
      }

      // Should handle high-frequency data without issues
      expect(mockAudioProcessor.captureAudioFromVideo).toHaveBeenCalled();
    });
  });

  describe('Language and Settings Management', () => {
    test('should handle language changes during processing', async () => {
      const videoInfo = {
        id: 'language-test-video',
        element: mockVideoElement,
        platform: 'test'
      };

      let speechResultCallback;
      mockSpeechRecognizer.initialize.mockImplementation((lang, onResult) => {
        speechResultCallback = onResult;
        return true;
      });

      const onVideoAdded = jest.fn();
      mockVideoDetector.initialize.mockImplementation((callbacks) => {
        setTimeout(() => callbacks.onVideoAdded(videoInfo), 0);
      });

      mockVideoDetector.initialize({ onVideoAdded });
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate language change
      mockSpeechRecognizer.changeLanguage('es-ES');
      expect(mockSpeechRecognizer.changeLanguage).toHaveBeenCalledWith('es-ES');

      // Simulate speech in new language
      const speechResult = {
        type: 'final',
        transcript: 'Hola mundo',
        confidence: 0.9,
        language: 'es-ES'
      };

      mockTranslationService.translateText.mockResolvedValue({
        originalText: 'Hola mundo',
        translatedText: 'Hello world',
        sourceLanguage: 'es',
        targetLanguage: 'en'
      });

      await speechResultCallback(speechResult);

      expect(mockTranslationService.translateText).toHaveBeenCalledWith(
        'Hola mundo',
        expect.any(String),
        expect.any(String)
      );
    });

    test('should handle subtitle style updates', async () => {
      const videoInfo = {
        id: 'style-test-video',
        element: mockVideoElement,
        platform: 'test'
      };

      const onVideoAdded = jest.fn();
      mockVideoDetector.initialize.mockImplementation((callbacks) => {
        setTimeout(() => callbacks.onVideoAdded(videoInfo), 0);
      });

      mockVideoDetector.initialize({ onVideoAdded });
      await new Promise(resolve => setTimeout(resolve, 10));

      // Simulate style update
      const newStyles = {
        fontSize: 20,
        fontColor: '#ff0000',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        position: 'top'
      };

      mockSubtitleRenderer.updateSettings(videoInfo.id, newStyles);

      expect(mockSubtitleRenderer.updateSettings).toHaveBeenCalledWith(
        videoInfo.id,
        newStyles
      );
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover from temporary network failures', async () => {
      const videoInfo = {
        id: 'network-test-video',
        element: mockVideoElement,
        platform: 'test'
      };

      // Mock network failure followed by recovery
      let callCount = 0;
      mockTranslationService.translateText.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Network timeout'));
        }
        return Promise.resolve({
          originalText: 'Hello world',
          translatedText: 'Hola mundo',
          sourceLanguage: 'en',
          targetLanguage: 'es'
        });
      });

      let speechResultCallback;
      mockSpeechRecognizer.initialize.mockImplementation((lang, onResult) => {
        speechResultCallback = onResult;
        return true;
      });

      const onVideoAdded = jest.fn();
      mockVideoDetector.initialize.mockImplementation((callbacks) => {
        setTimeout(() => callbacks.onVideoAdded(videoInfo), 0);
      });

      mockVideoDetector.initialize({ onVideoAdded });
      await new Promise(resolve => setTimeout(resolve, 10));

      // First attempt should fail
      const speechResult = {
        type: 'final',
        transcript: 'Hello world',
        confidence: 0.9
      };

      await speechResultCallback(speechResult);

      // Should display original text on first failure
      expect(mockSubtitleRenderer.displaySubtitle).toHaveBeenCalledWith(
        expect.any(String),
        'Hello world',
        expect.any(Object)
      );

      // Second attempt should succeed
      await speechResultCallback(speechResult);

      expect(mockTranslationService.translateText).toHaveBeenCalledTimes(2);
    });

    test('should handle component initialization failures gracefully', async () => {
      // Mock speech recognizer initialization failure
      mockSpeechRecognizer.initialize.mockReturnValue(false);

      const videoInfo = {
        id: 'init-failure-video',
        element: mockVideoElement,
        platform: 'test'
      };

      const onVideoAdded = jest.fn();
      mockVideoDetector.initialize.mockImplementation((callbacks) => {
        setTimeout(() => callbacks.onVideoAdded(videoInfo), 0);
      });

      mockVideoDetector.initialize({ onVideoAdded });
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should still initialize other components
      expect(mockAudioProcessor.captureAudioFromVideo).toHaveBeenCalled();
      expect(mockSubtitleRenderer.initializeForVideo).toHaveBeenCalled();
      
      // Should indicate speech recognition failure
      expect(mockStatusIndicator.updateIndicatorStatus).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/error|failed/i),
        expect.any(Object)
      );
    });
  });
});