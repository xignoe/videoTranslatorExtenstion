/**
 * Integration tests for the main VideoTranslator content script
 * Tests component orchestration and complete workflow
 */

// Mock all component classes before importing
global.VideoDetector = jest.fn(() => ({
  initialize: jest.fn(),
  destroy: jest.fn(),
  getDetectedVideos: jest.fn(() => [])
}));

global.AudioProcessor = jest.fn(() => ({
  captureAudioFromVideo: jest.fn(() => Promise.resolve(true)),
  stopProcessing: jest.fn(),
  getStatus: jest.fn(() => ({ isProcessing: false }))
}));

global.SpeechRecognizer = jest.fn(() => ({
  initialize: jest.fn(),
  startListening: jest.fn(),
  stopListening: jest.fn(),
  changeLanguage: jest.fn(),
  isListening: false
}));

global.TranslationService = jest.fn(() => ({
  translateText: jest.fn(() => Promise.resolve({ translatedText: 'Translated text' }))
}));

global.SubtitleRenderer = jest.fn(() => ({
  initializeForVideo: jest.fn(),
  displaySubtitle: jest.fn(),
  clearSubtitle: jest.fn(),
  cleanup: jest.fn()
}));

global.SubtitleStyleManager = jest.fn(() => ({
  initialize: jest.fn(() => Promise.resolve()),
  updateStyles: jest.fn()
}));

global.ErrorHandler = jest.fn(() => ({
  setErrorCallback: jest.fn(),
  setStatusCallback: jest.fn(),
  handleError: jest.fn()
}));

global.StatusIndicator = jest.fn(() => ({
  updateSettings: jest.fn(),
  createIndicator: jest.fn(),
  updateIndicatorStatus: jest.fn(),
  removeIndicator: jest.fn(),
  showGlobalStatus: jest.fn(),
  showError: jest.fn()
}));

// Mock chrome runtime
global.chrome = {
  ...global.chrome,
  runtime: {
    ...global.chrome.runtime,
    sendMessage: jest.fn(() => Promise.resolve())
  }
};

// Import the content script after mocking
const fs = require('fs');
const path = require('path');
const contentScript = fs.readFileSync(path.join(__dirname, '../content/content.js'), 'utf8');

// Execute the content script in our test environment
eval(contentScript);

describe('VideoTranslator Integration', () => {
  let videoTranslator;
  let mockVideoDetector;
  let mockAudioProcessor;
  let mockSpeechRecognizer;
  let mockTranslationService;
  let mockSubtitleRenderer;
  let mockStatusIndicator;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create fresh instances
    videoTranslator = new VideoTranslator();
    
    // Get mock instances that will be created
    mockVideoDetector = new VideoDetector();
    mockAudioProcessor = new AudioProcessor();
    mockSpeechRecognizer = new SpeechRecognizer();
    mockTranslationService = new TranslationService();
    mockSubtitleRenderer = new SubtitleRenderer();
    mockStatusIndicator = new StatusIndicator();
  });

  describe('Initialization', () => {
    test('should initialize all components successfully', async () => {
      const settings = {
        extensionEnabled: true,
        sourceLanguage: 'en-US',
        targetLanguage: 'es-ES'
      };

      const result = await videoTranslator.initialize(settings);

      expect(result).toBe(true);
      expect(videoTranslator.isInitialized).toBe(true);
      expect(videoTranslator.settings).toEqual(expect.objectContaining(settings));
      
      // Verify components were initialized
      expect(VideoDetector).toHaveBeenCalled();
      expect(AudioProcessor).toHaveBeenCalled();
      expect(SpeechRecognizer).toHaveBeenCalled();
      expect(TranslationService).toHaveBeenCalled();
      expect(SubtitleRenderer).toHaveBeenCalled();
    });

    test('should not reinitialize if already initialized', async () => {
      await videoTranslator.initialize();
      const result = await videoTranslator.initialize();

      expect(result).toBe(true);
      expect(VideoDetector).toHaveBeenCalledTimes(1);
    });

    test('should handle initialization failure gracefully', async () => {
      // Mock component initialization failure
      global.VideoDetector = jest.fn(() => {
        throw new Error('Component initialization failed');
      });

      const result = await videoTranslator.initialize();

      expect(result).toBe(false);
      expect(videoTranslator.isInitialized).toBe(false);
    });
  });

  describe('Video Detection and Processing', () => {
    beforeEach(async () => {
      await videoTranslator.initialize({
        extensionEnabled: true,
        sourceLanguage: 'en-US',
        targetLanguage: 'es-ES'
      });
    });

    test('should handle video added event', async () => {
      const mockVideoElement = document.createElement('video');
      mockVideoElement.src = 'test.mp4';
      
      const videoInfo = {
        id: 'video-1',
        element: mockVideoElement,
        platform: 'youtube',
        src: 'test.mp4'
      };

      await videoTranslator.handleVideoAdded(videoInfo);

      expect(videoTranslator.videoInstances.has('video-1')).toBe(true);
      expect(mockSubtitleRenderer.initializeForVideo).toHaveBeenCalledWith(
        mockVideoElement,
        'video-1',
        expect.any(Object)
      );
      expect(mockStatusIndicator.createIndicator).toHaveBeenCalledWith('video-1', mockVideoElement);
    });

    test('should start audio processing for new video', async () => {
      const mockVideoElement = document.createElement('video');
      const videoInfo = {
        id: 'video-1',
        element: mockVideoElement,
        platform: 'youtube'
      };

      await videoTranslator.handleVideoAdded(videoInfo);

      const videoInstance = videoTranslator.videoInstances.get('video-1');
      expect(videoInstance.isProcessing).toBe(true);
      expect(AudioProcessor).toHaveBeenCalled();
    });

    test('should handle video removed event', () => {
      const mockVideoElement = document.createElement('video');
      const videoInfo = {
        id: 'video-1',
        element: mockVideoElement
      };

      // First add the video
      videoTranslator.videoInstances.set('video-1', {
        id: 'video-1',
        element: mockVideoElement,
        eventListeners: new Map()
      });

      videoTranslator.handleVideoRemoved(videoInfo);

      expect(videoTranslator.videoInstances.has('video-1')).toBe(false);
      expect(mockSubtitleRenderer.cleanup).toHaveBeenCalledWith('video-1');
      expect(mockStatusIndicator.removeIndicator).toHaveBeenCalledWith('video-1');
    });
  });

  describe('Video Event Handling', () => {
    let mockVideoElement;
    let videoInstance;

    beforeEach(async () => {
      await videoTranslator.initialize({ extensionEnabled: true });
      
      mockVideoElement = document.createElement('video');
      videoInstance = {
        id: 'video-1',
        element: mockVideoElement,
        isPlaying: false,
        isPaused: true,
        isProcessing: false,
        hasAudio: false,
        eventListeners: new Map()
      };
      
      videoTranslator.videoInstances.set('video-1', videoInstance);
    });

    test('should handle video play event', () => {
      videoTranslator.handleVideoPlay('video-1');

      expect(videoInstance.isPlaying).toBe(true);
      expect(videoInstance.isPaused).toBe(false);
    });

    test('should handle video pause event', () => {
      videoInstance.isPlaying = true;
      videoInstance.isPaused = false;

      videoTranslator.handleVideoPause('video-1');

      expect(videoInstance.isPlaying).toBe(false);
      expect(videoInstance.isPaused).toBe(true);
    });

    test('should handle video ended event', () => {
      videoInstance.isPlaying = true;
      videoInstance.isProcessing = true;

      videoTranslator.handleVideoEnded('video-1');

      expect(videoInstance.isPlaying).toBe(false);
      expect(mockSubtitleRenderer.clearSubtitle).toHaveBeenCalledWith('video-1');
    });

    test('should handle video seek event', () => {
      mockVideoElement.currentTime = 30;
      videoInstance.currentTranscript = 'Previous transcript';

      videoTranslator.handleVideoSeeked('video-1');

      expect(videoInstance.currentTime).toBe(30);
      expect(videoInstance.currentTranscript).toBe('');
      expect(mockSubtitleRenderer.clearSubtitle).toHaveBeenCalledWith('video-1');
    });
  });

  describe('Speech Recognition and Translation', () => {
    beforeEach(async () => {
      await videoTranslator.initialize({
        extensionEnabled: true,
        sourceLanguage: 'en-US',
        targetLanguage: 'es-ES'
      });

      // Add a mock video instance
      videoTranslator.videoInstances.set('video-1', {
        id: 'video-1',
        element: document.createElement('video'),
        isProcessing: true,
        hasAudio: true,
        lastAudioTime: Date.now(),
        currentTranscript: ''
      });
    });

    test('should handle speech recognition result', async () => {
      const speechResult = {
        type: 'final',
        transcript: 'Hello world',
        confidence: 0.9
      };

      await videoTranslator.handleSpeechResult(speechResult);

      const videoInstance = videoTranslator.videoInstances.get('video-1');
      expect(videoInstance.currentTranscript).toBe('Hello world');
      expect(mockTranslationService.translateText).toHaveBeenCalledWith(
        'Hello world',
        'en-US',
        'es-ES'
      );
    });

    test('should handle translation result', () => {
      const translationResult = {
        originalText: 'Hello world',
        translatedText: 'Hola mundo',
        sourceLanguage: 'en',
        targetLanguage: 'es'
      };

      videoTranslator.handleTranslationResult('video-1', translationResult);

      const videoInstance = videoTranslator.videoInstances.get('video-1');
      expect(videoInstance.lastTranslation).toEqual(translationResult);
      expect(mockSubtitleRenderer.displaySubtitle).toHaveBeenCalledWith(
        'video-1',
        'Hola mundo',
        { duration: 5000 }
      );
    });

    test('should handle translation failure gracefully', async () => {
      mockTranslationService.translateText.mockRejectedValue(new Error('Translation failed'));

      const speechResult = {
        type: 'final',
        transcript: 'Hello world'
      };

      await videoTranslator.handleSpeechResult(speechResult);

      // Should display original transcript when translation fails
      expect(mockSubtitleRenderer.displaySubtitle).toHaveBeenCalledWith(
        'video-1',
        'Hello world',
        { duration: 5000 }
      );
    });

    test('should ignore interim speech results', async () => {
      const speechResult = {
        type: 'interim',
        transcript: 'Hello...'
      };

      await videoTranslator.handleSpeechResult(speechResult);

      expect(mockTranslationService.translateText).not.toHaveBeenCalled();
    });
  });

  describe('Settings Management', () => {
    beforeEach(async () => {
      await videoTranslator.initialize({ extensionEnabled: true });
    });

    test('should update extension settings', () => {
      const newSettings = {
        targetLanguage: 'fr-FR',
        subtitleStyle: { fontSize: 18 }
      };

      videoTranslator.updateSettings(newSettings);

      expect(videoTranslator.settings).toEqual(expect.objectContaining(newSettings));
    });

    test('should handle extension enable/disable', () => {
      videoTranslator.updateSettings({ extensionEnabled: false });
      expect(videoTranslator.settings.extensionEnabled).toBe(false);

      videoTranslator.updateSettings({ extensionEnabled: true });
      expect(videoTranslator.settings.extensionEnabled).toBe(true);
    });

    test('should update speech recognizer language', () => {
      videoTranslator.updateSettings({ sourceLanguage: 'fr-FR' });
      expect(mockSpeechRecognizer.changeLanguage).toHaveBeenCalledWith('fr-FR');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await videoTranslator.initialize();
    });

    test('should handle errors through error handler', () => {
      const testError = new Error('Test error');
      
      videoTranslator.handleError('Test context', testError);

      expect(videoTranslator.errorHandler.handleError).toHaveBeenCalledWith(
        'Test context',
        testError,
        {}
      );
    });

    test('should handle audio processing errors', () => {
      const errorInfo = {
        type: 'audio_capture_error',
        message: 'Audio capture failed'
      };

      videoTranslator.handleAudioError('video-1', errorInfo);

      const videoInstance = videoTranslator.videoInstances.get('video-1');
      if (videoInstance) {
        expect(videoInstance.hasAudio).toBe(false);
        expect(videoInstance.isProcessing).toBe(false);
      }
    });

    test('should show error messages in subtitles', () => {
      const errorInfo = {
        message: 'Audio capture failed'
      };

      videoTranslator.handleAudioError('video-1', errorInfo);

      expect(mockSubtitleRenderer.displaySubtitle).toHaveBeenCalledWith(
        'video-1',
        'Audio Error: Audio capture failed',
        { duration: 3000 }
      );
    });
  });

  describe('Status Management', () => {
    beforeEach(async () => {
      await videoTranslator.initialize();
    });

    test('should update status and notify background', () => {
      const statusUpdate = {
        state: 'processing',
        message: 'Processing video'
      };

      videoTranslator.updateStatus(statusUpdate);

      expect(videoTranslator.currentStatus).toEqual(expect.objectContaining(statusUpdate));
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'statusUpdate',
        status: expect.objectContaining(statusUpdate)
      });
    });

    test('should handle status update failures gracefully', () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Background not available'));

      expect(() => {
        videoTranslator.updateStatus({ state: 'test' });
      }).not.toThrow();
    });
  });

  describe('Resource Management', () => {
    beforeEach(async () => {
      await videoTranslator.initialize({ extensionEnabled: true });
    });

    test('should start processing for all videos', async () => {
      // Add multiple video instances
      videoTranslator.videoInstances.set('video-1', {
        id: 'video-1',
        element: document.createElement('video'),
        isProcessing: false
      });
      videoTranslator.videoInstances.set('video-2', {
        id: 'video-2',
        element: document.createElement('video'),
        isProcessing: false
      });

      await videoTranslator.startAllVideoProcessing();

      // Should attempt to start processing for all videos
      expect(AudioProcessor).toHaveBeenCalledTimes(2);
    });

    test('should stop processing for all videos', () => {
      const mockAudioProcessor1 = { stopProcessing: jest.fn() };
      const mockAudioProcessor2 = { stopProcessing: jest.fn() };

      videoTranslator.videoInstances.set('video-1', {
        id: 'video-1',
        isProcessing: true,
        audioProcessor: mockAudioProcessor1
      });
      videoTranslator.videoInstances.set('video-2', {
        id: 'video-2',
        isProcessing: true,
        audioProcessor: mockAudioProcessor2
      });

      videoTranslator.stopAllVideoProcessing();

      expect(mockAudioProcessor1.stopProcessing).toHaveBeenCalled();
      expect(mockAudioProcessor2.stopProcessing).toHaveBeenCalled();
    });

    test('should find most recent active video', () => {
      const now = Date.now();
      
      videoTranslator.videoInstances.set('video-1', {
        isProcessing: true,
        hasAudio: true,
        lastAudioTime: now - 1000
      });
      videoTranslator.videoInstances.set('video-2', {
        isProcessing: true,
        hasAudio: true,
        lastAudioTime: now
      });

      const activeVideoId = videoTranslator.getMostRecentActiveVideo();
      expect(activeVideoId).toBe('video-2');
    });
  });

  describe('Memory Management', () => {
    beforeEach(async () => {
      await videoTranslator.initialize();
    });

    test('should clean up video event listeners', () => {
      const mockVideoElement = document.createElement('video');
      const mockHandler = jest.fn();
      
      // Mock addEventListener and removeEventListener
      mockVideoElement.addEventListener = jest.fn();
      mockVideoElement.removeEventListener = jest.fn();

      const videoInstance = {
        eventListeners: new Map([['play', mockHandler]])
      };
      videoTranslator.videoInstances.set('video-1', videoInstance);

      videoTranslator.cleanupVideoEventListeners(mockVideoElement, 'video-1');

      expect(mockVideoElement.removeEventListener).toHaveBeenCalledWith('play', mockHandler);
      expect(videoInstance.eventListeners.size).toBe(0);
    });

    test('should handle cleanup for non-existent video', () => {
      const mockVideoElement = document.createElement('video');
      
      expect(() => {
        videoTranslator.cleanupVideoEventListeners(mockVideoElement, 'non-existent');
      }).not.toThrow();
    });
  });
});