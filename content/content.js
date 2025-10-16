// Content script for Video Translator extension
// This file coordinates all translation components

/**
 * VideoTranslator - Main coordinator class for the extension
 * Orchestrates video detection, audio processing, speech recognition, translation, and subtitle rendering
 */
class VideoTranslator {
  constructor() {
    this.isInitialized = false;
    this.currentStatus = { state: 'inactive' };
    this.settings = {};
    this.videoInstances = new Map();
    
    // Component instances
    this.videoDetector = null;
    this.audioProcessor = null;
    this.speechRecognizer = null;
    this.translationService = null;
    this.subtitleRenderer = null;
    this.subtitleStyleManager = null;
    this.errorHandler = null;
    this.statusIndicator = null;
    this.securityIsolation = null;
    this.privacyManager = null;
    
    // Performance and resource management
    this.performanceMonitor = null;
    this.resourceManager = null;
    
    // Bind methods to preserve context
    this.handleVideoAdded = this.handleVideoAdded.bind(this);
    this.handleVideoRemoved = this.handleVideoRemoved.bind(this);
    this.handleSpeechResult = this.handleSpeechResult.bind(this);
    this.handleTranslationResult = this.handleTranslationResult.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  /**
   * Initialize the VideoTranslator with all components
   * @param {Object} settings - Extension settings
   * @returns {Promise<boolean>} Success status
   */
  async initialize(settings = {}) {
    if (this.isInitialized) {
      console.log('VideoTranslator already initialized');
      return true;
    }

    try {
      this.settings = { ...this.settings, ...settings };
      this.updateStatus({ state: 'initializing', message: 'Loading components...' });

      // Initialize components in order
      await this.initializeComponents();
      
      // Set up video detection
      this.setupVideoDetection();
      
      // Start memory management
      this.startMemoryManagement();
      
      this.isInitialized = true;
      this.updateStatus({ 
        state: 'ready', 
        message: 'Extension ready',
        videoCount: this.videoInstances.size
      });
      
      console.log('VideoTranslator initialized successfully');
      return true;
      
    } catch (error) {
      this.handleError('Failed to initialize VideoTranslator', error);
      return false;
    }
  }

  /**
   * Initialize all component instances
   */
  async initializeComponents() {
    // Initialize performance monitoring and resource management first
    if (typeof PerformanceMonitor !== 'undefined') {
      this.performanceMonitor = new PerformanceMonitor();
      this.performanceMonitor.startMonitoring();
      console.log('Performance monitoring initialized');
    }

    if (typeof ResourceManager !== 'undefined') {
      this.resourceManager = new ResourceManager();
      console.log('Resource manager initialized');
    }

    // Initialize security isolation first for protection
    if (typeof SecurityIsolation !== 'undefined') {
      this.securityIsolation = new SecurityIsolation();
      console.log('Security isolation initialized');
    }

    // Initialize privacy manager
    if (typeof PrivacyManager !== 'undefined') {
      this.privacyManager = new PrivacyManager();
      await this.privacyManager.initializePrivacySettings();
      console.log('Privacy manager initialized');
    }

    // Initialize error handler first
    if (typeof ErrorHandler !== 'undefined') {
      this.errorHandler = new ErrorHandler();
      this.errorHandler.setErrorCallback((errorInfo) => {
        this.handleErrorInfo(errorInfo);
      });
      this.errorHandler.setStatusCallback((status) => {
        this.updateStatus(status);
      });
    }

    // Initialize status indicator
    if (typeof StatusIndicator !== 'undefined') {
      this.statusIndicator = new StatusIndicator();
      this.statusIndicator.updateSettings({
        showIndicators: this.settings.showStatusIndicators !== false,
        indicatorPosition: this.settings.indicatorPosition || 'top-right',
        indicatorSize: this.settings.indicatorSize || 'small',
        showTooltips: this.settings.showTooltips !== false,
        accessibilityMode: this.settings.accessibilityMode || false
      });
    }

    // Initialize subtitle style manager first (needed by renderer)
    if (typeof SubtitleStyleManager !== 'undefined') {
      this.subtitleStyleManager = new SubtitleStyleManager();
      await this.subtitleStyleManager.initialize();
    }

    // Initialize subtitle renderer
    if (typeof SubtitleRenderer !== 'undefined') {
      this.subtitleRenderer = new SubtitleRenderer(this.subtitleStyleManager);
    }

    // Initialize video detector
    if (typeof VideoDetector !== 'undefined') {
      this.videoDetector = new VideoDetector();
    }

    // Initialize audio processor
    if (typeof AudioProcessor !== 'undefined') {
      this.audioProcessor = new AudioProcessor();
    }

    // Initialize speech recognizer
    if (typeof SpeechRecognizer !== 'undefined') {
      this.speechRecognizer = new SpeechRecognizer();
      const sourceLanguage = this.settings.sourceLanguage || 'en-US';
      this.speechRecognizer.initialize(
        sourceLanguage,
        this.handleSpeechResult,
        this.createErrorHandler('Speech Recognition'),
        (status) => this.updateSpeechStatus(status)
      );
    }

    // Initialize translation service
    if (typeof TranslationService !== 'undefined') {
      this.translationService = new TranslationService();
    }

    console.log('All components initialized');
  }

  /**
   * Set up video detection with callbacks
   */
  setupVideoDetection() {
    if (!this.videoDetector) {
      console.warn('VideoDetector not available');
      return;
    }

    this.videoDetector.initialize({
      onVideoAdded: this.handleVideoAdded,
      onVideoRemoved: this.handleVideoRemoved
    });
  }

  /**
   * Handle new video detected
   * @param {Object} videoInfo - Video information from detector
   */
  async handleVideoAdded(videoInfo) {
    console.log('New video detected:', videoInfo.id);
    
    try {
      // Create video instance data
      const videoInstance = {
        id: videoInfo.id,
        element: videoInfo.element,
        platform: videoInfo.platform,
        isProcessing: false,
        hasAudio: false,
        currentTranscript: '',
        lastTranslation: null,
        audioProcessor: null,
        createdAt: Date.now(),
        // Video state tracking
        isPlaying: false,
        isPaused: true,
        currentTime: 0,
        duration: 0,
        volume: 1,
        // Event listeners cleanup
        eventListeners: new Map()
      };

      this.videoInstances.set(videoInfo.id, videoInstance);

      // Create status indicator for this video
      if (this.statusIndicator) {
        this.statusIndicator.createIndicator(videoInfo.id, videoInfo.element);
        this.statusIndicator.updateIndicatorStatus(videoInfo.id, 'detecting', {
          message: 'Video detected',
          ariaLabel: `Video detected: ${videoInfo.platform || 'unknown'}`
        });
      }

      // Set up video event listeners for lifecycle management
      this.setupVideoEventListeners(videoInfo.element, videoInfo.id);

      // Initialize subtitle rendering for this video
      if (this.subtitleRenderer) {
        this.subtitleRenderer.initializeForVideo(
          videoInfo.element, 
          videoInfo.id, 
          this.settings.subtitleStyle || {}
        );
      }

      // Start audio processing if extension is enabled
      if (this.settings.extensionEnabled) {
        await this.startVideoProcessing(videoInfo.id);
      } else {
        // Update indicator to show inactive state
        if (this.statusIndicator) {
          this.statusIndicator.updateIndicatorStatus(videoInfo.id, 'inactive', {
            message: 'Extension disabled',
            ariaLabel: 'Video translator is disabled'
          });
        }
      }

      this.updateStatus({ 
        state: 'video-detected',
        message: `Video detected: ${videoInfo.platform || 'unknown'}`,
        videoCount: this.videoInstances.size
      });

      // Show global status
      if (this.statusIndicator) {
        this.statusIndicator.showGlobalStatus('detecting', {
          message: `Video detected: ${videoInfo.platform || 'unknown'}`,
          videoCount: this.videoInstances.size,
          duration: 2000
        });
      }

    } catch (error) {
      this.handleError(`Failed to process new video ${videoInfo.id}`, error, {
        metadata: { videoId: videoInfo.id }
      });
    }
  }

  /**
   * Set up video event listeners for lifecycle management
   * @param {HTMLVideoElement} videoElement - Video element
   * @param {string} videoId - Video identifier
   */
  setupVideoEventListeners(videoElement, videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) {
      return;
    }

    // Define event handlers
    const eventHandlers = {
      play: () => this.handleVideoPlay(videoId),
      pause: () => this.handleVideoPause(videoId),
      ended: () => this.handleVideoEnded(videoId),
      seeked: () => this.handleVideoSeeked(videoId),
      timeupdate: () => this.handleVideoTimeUpdate(videoId),
      volumechange: () => this.handleVideoVolumeChange(videoId),
      loadstart: () => this.handleVideoLoadStart(videoId),
      loadedmetadata: () => this.handleVideoLoadedMetadata(videoId),
      canplay: () => this.handleVideoCanPlay(videoId),
      error: (event) => this.handleVideoError(videoId, event)
    };

    // Add event listeners and store references for cleanup
    Object.entries(eventHandlers).forEach(([eventType, handler]) => {
      videoElement.addEventListener(eventType, handler);
      videoInstance.eventListeners.set(eventType, handler);
    });

    console.log(`Video event listeners set up for: ${videoId}`);
  }

  /**
   * Handle video play event
   * @param {string} videoId - Video identifier
   */
  handleVideoPlay(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) return;

    videoInstance.isPlaying = true;
    videoInstance.isPaused = false;
    this.updateVideoActivity(videoId);
    
    console.log(`Video playing: ${videoId}`);

    // Resume audio processing if extension is enabled
    if (this.settings.extensionEnabled && !videoInstance.isProcessing) {
      this.startVideoProcessing(videoId);
    }

    // Resume speech recognition if needed
    if (this.speechRecognizer && !this.speechRecognizer.isListening) {
      const hasActiveVideos = Array.from(this.videoInstances.values())
        .some(instance => instance.isPlaying && instance.hasAudio);
      
      if (hasActiveVideos) {
        this.speechRecognizer.startListening();
      }
    }
  }

  /**
   * Handle video pause event
   * @param {string} videoId - Video identifier
   */
  handleVideoPause(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) return;

    videoInstance.isPlaying = false;
    videoInstance.isPaused = true;
    this.updateVideoActivity(videoId);
    
    console.log(`Video paused: ${videoId}`);

    // Check if we should pause speech recognition
    const hasPlayingVideos = Array.from(this.videoInstances.values())
      .some(instance => instance.isPlaying && instance.hasAudio);
    
    if (!hasPlayingVideos && this.speechRecognizer && this.speechRecognizer.isListening) {
      this.speechRecognizer.stopListening();
    }
  }

  /**
   * Handle video ended event
   * @param {string} videoId - Video identifier
   */
  handleVideoEnded(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) return;

    videoInstance.isPlaying = false;
    videoInstance.isPaused = true;
    
    console.log(`Video ended: ${videoId}`);

    // Stop processing for this video
    this.stopVideoProcessing(videoId);

    // Clear any active subtitles
    if (this.subtitleRenderer) {
      this.subtitleRenderer.clearSubtitle(videoId);
    }
  }

  /**
   * Handle video seek event
   * @param {string} videoId - Video identifier
   */
  handleVideoSeeked(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) return;

    videoInstance.currentTime = videoInstance.element.currentTime;
    this.updateVideoActivity(videoId);
    
    console.log(`Video seeked: ${videoId} to ${videoInstance.currentTime}s`);

    // Clear current subtitles when seeking
    if (this.subtitleRenderer) {
      this.subtitleRenderer.clearSubtitle(videoId);
    }

    // Reset transcript context
    videoInstance.currentTranscript = '';
  }

  /**
   * Handle video time update event
   * @param {string} videoId - Video identifier
   */
  handleVideoTimeUpdate(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) return;

    videoInstance.currentTime = videoInstance.element.currentTime;
    
    // Throttle time updates to avoid excessive processing
    const now = Date.now();
    if (!videoInstance.lastTimeUpdate || now - videoInstance.lastTimeUpdate > 1000) {
      videoInstance.lastTimeUpdate = now;
      
      // Update status periodically
      this.updateStatus({
        state: 'playing',
        currentTime: videoInstance.currentTime,
        duration: videoInstance.duration
      });
    }
  }

  /**
   * Handle video volume change event
   * @param {string} videoId - Video identifier
   */
  handleVideoVolumeChange(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) return;

    const element = videoInstance.element;
    videoInstance.volume = element.volume;
    const wasMuted = videoInstance.isMuted;
    videoInstance.isMuted = element.muted;
    
    console.log(`Video volume changed: ${videoId} - volume: ${videoInstance.volume}, muted: ${videoInstance.isMuted}`);

    // Handle mute/unmute for audio processing
    if (videoInstance.isMuted && !wasMuted) {
      // Video was muted, pause processing
      this.stopVideoProcessing(videoId);
    } else if (!videoInstance.isMuted && wasMuted && videoInstance.isPlaying) {
      // Video was unmuted and is playing, resume processing
      if (this.settings.extensionEnabled) {
        this.startVideoProcessing(videoId);
      }
    }
  }

  /**
   * Handle video load start event
   * @param {string} videoId - Video identifier
   */
  handleVideoLoadStart(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) return;

    console.log(`Video load started: ${videoId}`);
    
    // Reset video state
    videoInstance.isPlaying = false;
    videoInstance.isPaused = true;
    videoInstance.currentTime = 0;
    videoInstance.duration = 0;
    videoInstance.currentTranscript = '';
    videoInstance.lastTranslation = null;
  }

  /**
   * Handle video loaded metadata event
   * @param {string} videoId - Video identifier
   */
  handleVideoLoadedMetadata(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) return;

    const element = videoInstance.element;
    videoInstance.duration = element.duration || 0;
    videoInstance.volume = element.volume;
    videoInstance.isMuted = element.muted;
    
    console.log(`Video metadata loaded: ${videoId} - duration: ${videoInstance.duration}s`);
  }

  /**
   * Handle video can play event
   * @param {string} videoId - Video identifier
   */
  handleVideoCanPlay(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) return;

    console.log(`Video can play: ${videoId}`);
    
    // Video is ready, start processing if enabled and playing
    if (this.settings.extensionEnabled && videoInstance.element && !videoInstance.element.paused) {
      this.startVideoProcessing(videoId);
    }
  }

  /**
   * Handle video error event
   * @param {string} videoId - Video identifier
   * @param {Event} event - Error event
   */
  handleVideoError(videoId, event) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) return;

    const error = videoInstance.element.error;
    const errorMessage = error ? `Video error (${error.code}): ${error.message}` : 'Unknown video error';
    
    console.error(`Video error for ${videoId}:`, errorMessage);
    
    // Stop processing for this video
    this.stopVideoProcessing(videoId);
    
    // Show error message
    if (this.subtitleRenderer) {
      this.subtitleRenderer.displaySubtitle(videoId, `Video Error: ${errorMessage}`, {
        duration: 5000
      });
    }
  }

  /**
   * Handle video removed
   * @param {Object} videoInfo - Video information from detector
   */
  handleVideoRemoved(videoInfo) {
    console.log('Video removed:', videoInfo.id);
    
    const videoInstance = this.videoInstances.get(videoInfo.id);
    if (videoInstance) {
      // Clean up video event listeners
      this.cleanupVideoEventListeners(videoInfo.element, videoInfo.id);
      
      // Stop processing for this video
      this.stopVideoProcessing(videoInfo.id);
      
      // Clean up subtitle rendering
      if (this.subtitleRenderer) {
        this.subtitleRenderer.cleanup(videoInfo.id);
      }

      // Remove status indicator
      if (this.statusIndicator) {
        this.statusIndicator.removeIndicator(videoInfo.id);
      }
      
      // Remove from instances
      this.videoInstances.delete(videoInfo.id);
    }

    this.updateStatus({ 
      state: 'video-removed',
      message: 'Video removed',
      videoCount: this.videoInstances.size
    });
  }

  /**
   * Clean up video event listeners
   * @param {HTMLVideoElement} videoElement - Video element
   * @param {string} videoId - Video identifier
   */
  cleanupVideoEventListeners(videoElement, videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance || !videoInstance.eventListeners) {
      return;
    }

    // Remove all event listeners
    videoInstance.eventListeners.forEach((handler, eventType) => {
      videoElement.removeEventListener(eventType, handler);
    });

    // Clear the listeners map
    videoInstance.eventListeners.clear();
    
    console.log(`Video event listeners cleaned up for: ${videoId}`);
  }

  /**
   * Start audio processing for a specific video
   * @param {string} videoId - Video identifier
   */
  async startVideoProcessing(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance || videoInstance.isProcessing) {
      return;
    }

    try {
      videoInstance.isProcessing = true;
      
      // Update status indicator
      if (this.statusIndicator) {
        this.statusIndicator.updateIndicatorStatus(videoId, 'initializing', {
          message: 'Starting audio capture...',
          ariaLabel: 'Starting audio capture for video'
        });
      }
      
      // Create dedicated audio processor for this video
      if (this.audioProcessor && typeof AudioProcessor !== 'undefined') {
        const audioProcessor = new AudioProcessor();
        videoInstance.audioProcessor = audioProcessor;

        // Start audio capture
        const success = await audioProcessor.captureAudioFromVideo(
          videoInstance.element,
          (audioData) => this.handleAudioData(videoId, audioData),
          (error) => this.handleAudioError(videoId, error)
        );

        if (success) {
          videoInstance.hasAudio = true;
          
          // Update status indicator
          if (this.statusIndicator) {
            this.statusIndicator.updateIndicatorStatus(videoId, 'listening', {
              message: 'Listening for speech...',
              ariaLabel: 'Listening for speech in video'
            });
          }
          
          // Start speech recognition if available
          if (this.speechRecognizer && !this.speechRecognizer.isListening) {
            this.speechRecognizer.startListening();
          }
          
          console.log(`Audio processing started for video: ${videoId}`);
        } else {
          videoInstance.hasAudio = false;
          
          // Update status indicator
          if (this.statusIndicator) {
            this.statusIndicator.updateIndicatorStatus(videoId, 'no-audio', {
              message: 'No audio detected',
              ariaLabel: 'No audio detected in video'
            });
          }
          
          console.log(`No audio available for video: ${videoId}`);
        }
      }

    } catch (error) {
      videoInstance.isProcessing = false;
      this.handleError(`Failed to start processing for video ${videoId}`, error, {
        metadata: { videoId }
      });
    }
  }

  /**
   * Stop audio processing for a specific video
   * @param {string} videoId - Video identifier
   */
  stopVideoProcessing(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) {
      return;
    }

    videoInstance.isProcessing = false;

    // Stop audio processor for this video
    if (videoInstance.audioProcessor) {
      videoInstance.audioProcessor.stopProcessing();
      videoInstance.audioProcessor = null;
    }

    // Stop speech recognition if no other videos are processing
    const hasActiveVideos = Array.from(this.videoInstances.values())
      .some(instance => instance.isProcessing && instance.hasAudio);
    
    if (!hasActiveVideos && this.speechRecognizer) {
      this.speechRecognizer.stopListening();
    }

    console.log(`Processing stopped for video: ${videoId}`);
  }

  /**
   * Handle audio data from video
   * @param {string} videoId - Video identifier
   * @param {Object} audioData - Audio data from processor
   */
  handleAudioData(videoId, audioData) {
    // Audio data is processed by speech recognizer automatically
    // This method can be used for additional audio analysis if needed
    const videoInstance = this.videoInstances.get(videoId);
    if (videoInstance) {
      videoInstance.lastAudioLevel = audioData.audioLevel;
      videoInstance.lastAudioTime = audioData.timestamp;
      this.updateVideoActivity(videoId);
    }
  }

  /**
   * Handle audio processing errors
   * @param {string} videoId - Video identifier
   * @param {Object} error - Error information
   */
  handleAudioError(videoId, error) {
    console.warn(`Audio error for video ${videoId}:`, error);
    
    const videoInstance = this.videoInstances.get(videoId);
    if (videoInstance) {
      videoInstance.hasAudio = false;
      videoInstance.isProcessing = false;
    }

    // Handle error through error handler
    this.handleError(`Audio processing failed for video ${videoId}`, error, {
      metadata: { videoId, errorType: 'audio_capture' }
    });

    // Show user-friendly error message in subtitle
    if (this.subtitleRenderer) {
      const userMessage = error.message || 'Audio capture failed';
      this.subtitleRenderer.displaySubtitle(videoId, `Audio Error: ${userMessage}`, {
        duration: 3000
      });
    }
  }

  /**
   * Handle speech recognition results
   * @param {Object} result - Speech recognition result
   */
  async handleSpeechResult(result) {
    if (result.type !== 'final' || !result.transcript) {
      return;
    }

    console.log('Speech recognized:', result.transcript);

    // Find the most recently active video to associate with this transcript
    const activeVideoId = this.getMostRecentActiveVideo();
    if (!activeVideoId) {
      return;
    }

    const videoInstance = this.videoInstances.get(activeVideoId);
    if (!videoInstance) {
      return;
    }

    videoInstance.currentTranscript = result.transcript;

    // Update status indicator
    if (this.statusIndicator) {
      this.statusIndicator.updateIndicatorStatus(activeVideoId, 'processing', {
        message: 'Speech recognized',
        ariaLabel: 'Speech recognized, processing translation'
      });
    }

    // Translate the transcript
    if (this.translationService && this.settings.targetLanguage) {
      try {
        // Mark translation start for performance monitoring
        if (this.performanceMonitor) {
          this.performanceMonitor.markStart('translation');
        }

        // Update status to show translation in progress
        if (this.statusIndicator) {
          this.statusIndicator.updateIndicatorStatus(activeVideoId, 'translating', {
            message: 'Translating...',
            ariaLabel: 'Translating speech to target language'
          });
        }

        const translationStartTime = performance.now();
        const translationResult = await this.translationService.translateText(
          result.transcript,
          this.settings.sourceLanguage || 'auto',
          this.settings.targetLanguage
        );
        const translationEndTime = performance.now();

        // Record translation performance
        if (this.performanceMonitor) {
          this.performanceMonitor.recordTranslationLatency(translationStartTime, translationEndTime);
          this.performanceMonitor.markEnd('translation');
        }

        this.handleTranslationResult(activeVideoId, translationResult);

      } catch (error) {
        this.handleError('Translation failed', error, {
          metadata: { videoId: activeVideoId, transcript: result.transcript }
        });
        
        // Show original transcript if translation fails
        if (this.subtitleRenderer) {
          this.subtitleRenderer.displaySubtitle(activeVideoId, result.transcript, {
            duration: 5000
          });
        }

        // Update status indicator back to listening
        if (this.statusIndicator) {
          this.statusIndicator.updateIndicatorStatus(activeVideoId, 'listening', {
            message: 'Translation failed - showing original',
            ariaLabel: 'Translation failed, showing original text'
          });
        }
      }
    } else {
      // Show original transcript if no translation needed
      if (this.subtitleRenderer) {
        this.subtitleRenderer.displaySubtitle(activeVideoId, result.transcript, {
          duration: 5000
        });
      }

      // Update status indicator
      if (this.statusIndicator) {
        this.statusIndicator.updateIndicatorStatus(activeVideoId, 'displaying', {
          message: 'Displaying subtitles',
          ariaLabel: 'Displaying subtitles',
          duration: 5000
        });
      }
    }
  }

  /**
   * Handle translation results
   * @param {string} videoId - Video identifier
   * @param {Object} translationResult - Translation result
   */
  handleTranslationResult(videoId, translationResult) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) {
      return;
    }

    videoInstance.lastTranslation = translationResult;

    // Display translated subtitle with performance monitoring
    if (this.subtitleRenderer && translationResult.translatedText) {
      // Mark subtitle rendering start for performance monitoring
      if (this.performanceMonitor) {
        this.performanceMonitor.markStart('subtitle');
      }

      const subtitleStartTime = performance.now();
      this.subtitleRenderer.displaySubtitle(videoId, translationResult.translatedText, {
        duration: 5000
      });
      const subtitleEndTime = performance.now();

      // Record subtitle rendering performance
      if (this.performanceMonitor) {
        this.performanceMonitor.recordSubtitleRendering(subtitleStartTime, subtitleEndTime);
        this.performanceMonitor.markEnd('subtitle');
      }
    }

    // Update status indicator
    if (this.statusIndicator) {
      this.statusIndicator.updateIndicatorStatus(videoId, 'displaying', {
        message: 'Displaying translation',
        ariaLabel: 'Displaying translated subtitles',
        duration: 5000
      });
    }

    console.log('Translation displayed:', translationResult.translatedText);
  }

  /**
   * Get the most recently active video ID
   * @returns {string|null} Video ID or null
   */
  getMostRecentActiveVideo() {
    let mostRecentVideo = null;
    let mostRecentTime = 0;

    this.videoInstances.forEach((instance, videoId) => {
      if (instance.isProcessing && instance.hasAudio && instance.lastAudioTime > mostRecentTime) {
        mostRecentTime = instance.lastAudioTime;
        mostRecentVideo = videoId;
      }
    });

    return mostRecentVideo;
  }

  /**
   * Update extension settings
   * @param {Object} newSettings - New settings
   */
  updateSettings(newSettings) {
    const oldSettings = this.settings;
    this.settings = { ...this.settings, ...newSettings };

    // Handle extension enable/disable
    if (newSettings.extensionEnabled !== undefined) {
      if (newSettings.extensionEnabled && !oldSettings.extensionEnabled) {
        this.startAllVideoProcessing();
      } else if (!newSettings.extensionEnabled && oldSettings.extensionEnabled) {
        this.stopAllVideoProcessing();
      }
    }

    // Handle language changes
    if (newSettings.sourceLanguage && this.speechRecognizer) {
      this.speechRecognizer.changeLanguage(newSettings.sourceLanguage);
    }

    // Handle subtitle style changes
    if (newSettings.subtitleStyle && this.subtitleStyleManager) {
      this.subtitleStyleManager.updateStyles(newSettings.subtitleStyle);
    }

    console.log('Settings updated:', newSettings);
  }

  /**
   * Start processing for all detected videos
   */
  async startAllVideoProcessing() {
    const promises = Array.from(this.videoInstances.keys()).map(videoId => 
      this.startVideoProcessing(videoId)
    );
    await Promise.all(promises);
  }

  /**
   * Stop processing for all videos
   */
  stopAllVideoProcessing() {
    this.videoInstances.forEach((instance, videoId) => {
      this.stopVideoProcessing(videoId);
    });
  }

  /**
   * Update status and notify background script
   * @param {Object} newStatus - Status update
   */
  updateStatus(newStatus) {
    this.currentStatus = {
      ...this.currentStatus,
      ...newStatus,
      timestamp: Date.now()
    };
    
    // Notify background script
    chrome.runtime.sendMessage({
      action: 'statusUpdate',
      status: this.currentStatus
    }).catch((error) => {
      console.warn('Failed to send status update:', error);
    });
  }

  /**
   * Handle errors with appropriate user feedback
   * @param {string} message - Error message
   * @param {Error} error - Error object
   * @param {Object} options - Additional options
   */
  handleError(message, error = null, options = {}) {
    if (this.errorHandler) {
      return this.errorHandler.handleError(message, error, options);
    } else {
      // Fallback error handling
      console.error('VideoTranslator Error:', message, error);
      
      chrome.runtime.sendMessage({
        action: 'reportError',
        error: {
          message: error ? error.message : message,
          context: message,
          timestamp: Date.now(),
          url: window.location.href
        }
      }).catch(() => {
        // Background script may not be available
      });
      
      this.updateStatus({ 
        state: 'error', 
        error: error ? error.message : message,
        context: message
      });
    }
  }

  /**
   * Handle processed error information
   * @param {Object} errorInfo - Processed error from ErrorHandler
   */
  handleErrorInfo(errorInfo) {
    // Show error in status indicator
    if (this.statusIndicator) {
      this.statusIndicator.showError(errorInfo);
    }

    // Update video-specific indicators if applicable
    if (errorInfo.metadata && errorInfo.metadata.videoId) {
      const videoId = errorInfo.metadata.videoId;
      if (this.statusIndicator) {
        this.statusIndicator.updateIndicatorStatus(videoId, 'error', {
          message: 'Error',
          tooltip: errorInfo.userMessage,
          ariaLabel: `Error: ${errorInfo.userMessage}`
        });
      }
    }
  }

  /**
   * Create error handler for specific component
   * @param {string} componentName - Name of the component
   * @returns {Function} Error handler function
   */
  createErrorHandler(componentName) {
    if (this.errorHandler) {
      return this.errorHandler.createComponentHandler(componentName);
    } else {
      return (message, error, options = {}) => {
        this.handleError(`${componentName}: ${message}`, error, options);
      };
    }
  }

  /**
   * Update speech recognition status
   * @param {Object} status - Speech recognition status
   */
  updateSpeechStatus(status) {
    this.updateStatus({ speechStatus: status });
    
    // Update status indicators based on speech status
    if (this.statusIndicator) {
      let indicatorStatus = 'listening';
      let message = 'Listening for speech...';
      
      if (status.isListening) {
        if (status.hasAudio) {
          indicatorStatus = 'processing';
          message = 'Processing audio...';
        } else {
          indicatorStatus = 'no-audio';
          message = 'No audio detected';
        }
      } else {
        indicatorStatus = 'paused';
        message = 'Speech recognition paused';
      }

      // Update all video indicators
      this.videoInstances.forEach((instance, videoId) => {
        if (instance.isProcessing) {
          this.statusIndicator.updateIndicatorStatus(videoId, indicatorStatus, {
            message,
            ariaLabel: message
          });
        }
      });
    }
  }

  /**
   * Get current extension state
   * @returns {Object} Current state information
   */
  getState() {
    return {
      isInitialized: this.isInitialized,
      status: this.currentStatus,
      settings: this.settings,
      videoCount: this.videoInstances.size,
      videos: Array.from(this.videoInstances.values()).map(instance => ({
        id: instance.id,
        platform: instance.platform,
        isProcessing: instance.isProcessing,
        hasAudio: instance.hasAudio,
        currentTranscript: instance.currentTranscript
      }))
    };
  }

  /**
   * Perform memory management and cleanup of inactive videos
   */
  performMemoryManagement() {
    const now = Date.now();
    const INACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    const MAX_VIDEO_INSTANCES = 10; // Maximum number of video instances to keep
    
    // Find inactive videos
    const inactiveVideos = [];
    this.videoInstances.forEach((instance, videoId) => {
      const timeSinceLastActivity = now - (instance.lastActivityTime || instance.createdAt);
      
      // Consider video inactive if it hasn't been active recently and isn't currently playing
      if (timeSinceLastActivity > INACTIVE_THRESHOLD && !instance.isPlaying) {
        inactiveVideos.push({ videoId, timeSinceLastActivity });
      }
    });

    // Sort by inactivity time (most inactive first)
    inactiveVideos.sort((a, b) => b.timeSinceLastActivity - a.timeSinceLastActivity);

    // Clean up inactive videos if we have too many instances
    if (this.videoInstances.size > MAX_VIDEO_INSTANCES) {
      const videosToCleanup = inactiveVideos.slice(0, this.videoInstances.size - MAX_VIDEO_INSTANCES);
      
      videosToCleanup.forEach(({ videoId }) => {
        console.log(`Cleaning up inactive video: ${videoId}`);
        this.cleanupVideoInstance(videoId);
      });
    }

    // Also clean up videos that are no longer in the DOM
    this.cleanupRemovedVideos();
  }

  /**
   * Clean up videos that are no longer in the DOM
   */
  cleanupRemovedVideos() {
    const videosToRemove = [];
    
    this.videoInstances.forEach((instance, videoId) => {
      if (!document.contains(instance.element)) {
        videosToRemove.push(videoId);
      }
    });

    videosToRemove.forEach(videoId => {
      console.log(`Cleaning up removed video: ${videoId}`);
      this.cleanupVideoInstance(videoId);
    });
  }

  /**
   * Clean up a specific video instance
   * @param {string} videoId - Video identifier
   */
  cleanupVideoInstance(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (!videoInstance) {
      return;
    }

    // Clean up video event listeners
    this.cleanupVideoEventListeners(videoInstance.element, videoId);
    
    // Stop processing for this video
    this.stopVideoProcessing(videoId);
    
    // Clean up subtitle rendering
    if (this.subtitleRenderer) {
      this.subtitleRenderer.cleanup(videoId);
    }
    
    // Remove from instances
    this.videoInstances.delete(videoId);
    
    console.log(`Video instance cleaned up: ${videoId}`);
  }

  /**
   * Start memory management interval
   */
  startMemoryManagement() {
    // Run memory management every 2 minutes
    this.memoryManagementInterval = setInterval(() => {
      this.performMemoryManagement();
    }, 2 * 60 * 1000);
  }

  /**
   * Stop memory management interval
   */
  stopMemoryManagement() {
    if (this.memoryManagementInterval) {
      clearInterval(this.memoryManagementInterval);
      this.memoryManagementInterval = null;
    }
  }

  /**
   * Update last activity time for a video
   * @param {string} videoId - Video identifier
   */
  updateVideoActivity(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    if (videoInstance) {
      videoInstance.lastActivityTime = Date.now();
    }
  }

  /**
   * Clean up all resources
   */
  cleanup() {
    console.log('Cleaning up VideoTranslator...');
    
    // Stop performance monitoring and resource management
    if (this.performanceMonitor) {
      this.performanceMonitor.stopMonitoring();
    }
    
    if (this.resourceManager) {
      this.resourceManager.cleanupAll();
    }
    
    // Stop memory management
    this.stopMemoryManagement();
    
    // Clean up all video instances
    const videoIds = Array.from(this.videoInstances.keys());
    videoIds.forEach(videoId => this.cleanupVideoInstance(videoId));
    
    // Clean up components
    if (this.videoDetector) {
      this.videoDetector.destroy();
    }
    
    if (this.speechRecognizer) {
      this.speechRecognizer.destroy();
    }
    
    if (this.translationService) {
      this.translationService.cancelAllRequests();
      this.translationService.stopQueueProcessor();
    }
    
    if (this.subtitleRenderer) {
      this.subtitleRenderer.cleanupAll();
    }

    if (this.statusIndicator) {
      this.statusIndicator.cleanup();
    }

    if (this.errorHandler) {
      this.errorHandler.clearErrorLog();
    }
    
    // Clear instances
    this.videoInstances.clear();
    this.isInitialized = false;
    
    this.updateStatus({ state: 'cleaned-up' });
  }
}

// Global instance
let videoTranslator = null;

// Content script state (for backwards compatibility)
const contentState = {
  get isInitialized() { return videoTranslator ? videoTranslator.isInitialized : false; },
  get currentStatus() { return videoTranslator ? videoTranslator.currentStatus : { state: 'inactive' }; },
  get settings() { return videoTranslator ? videoTranslator.settings : {}; },
  get videoInstances() { return videoTranslator ? videoTranslator.videoInstances : new Map(); }
};

// Main content script entry point
(function() {
  'use strict';
  
  console.log('Video Translator content script loaded');
  
  // Initialize the extension
  initializeExtension();
  
  // Set up message listeners
  setupMessageListeners();
  
  // Set up settings change listeners
  setupSettingsListeners();
  
  // Set up navigation listeners
  setupNavigationListeners();
})();

// Initialize extension functionality
async function initializeExtension() {
  // Get current settings
  chrome.runtime.sendMessage({
    action: 'getSettings'
  }, async (response) => {
    if (response && response.settings) {
      if (response.settings.extensionEnabled) {
        await startExtension(response.settings);
      } else {
        console.log('Video Translator is disabled');
        updateStatus({ state: 'disabled' });
      }
    }
  });
}

// Start extension functionality
async function startExtension(settings = {}) {
  if (videoTranslator && videoTranslator.isInitialized) {
    return;
  }
  
  console.log('Video Translator starting...');
  
  // Create VideoTranslator instance
  videoTranslator = new VideoTranslator();
  
  // Initialize with settings
  const success = await videoTranslator.initialize(settings);
  
  if (!success) {
    console.error('Failed to start Video Translator');
    updateStatus({ state: 'error', message: 'Failed to initialize' });
  }
}

// Stop extension functionality
function stopExtension() {
  if (!videoTranslator || !videoTranslator.isInitialized) {
    return;
  }
  
  console.log('Video Translator stopping...');
  
  // Clean up VideoTranslator
  videoTranslator.cleanup();
  videoTranslator = null;
  
  // Update status
  updateStatus({ state: 'disabled' });
}

// Update status and notify background script
function updateStatus(newStatus) {
  if (videoTranslator) {
    videoTranslator.updateStatus(newStatus);
  } else {
    // Fallback for when VideoTranslator is not initialized
    chrome.runtime.sendMessage({
      action: 'statusUpdate',
      status: {
        ...newStatus,
        timestamp: Date.now()
      }
    }).catch((error) => {
      console.warn('Failed to send status update:', error);
    });
  }
}

// Report errors to background script
function reportError(error, context = '') {
  if (videoTranslator) {
    videoTranslator.handleError(context, error);
  } else {
    // Fallback for when VideoTranslator is not initialized
    console.error('Content script error:', error, context);
    
    chrome.runtime.sendMessage({
      action: 'reportError',
      error: {
        message: error.message || error,
        context: context,
        timestamp: Date.now(),
        url: window.location.href
      }
    }).catch(() => {
      // Background script may not be available
    });
  }
}

// Set up message listeners for background script communication
function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'getStatus':
        const status = videoTranslator ? videoTranslator.currentStatus : { state: 'inactive' };
        sendResponse({ status });
        break;
        
      case 'settingsChanged':
        handleSettingsChanged(request.settings);
        sendResponse({ success: true });
        break;
        
      case 'toggleTranslation':
        handleToggleTranslation();
        sendResponse({ success: true });
        break;
        
      case 'getVideoInfo':
        const state = videoTranslator ? videoTranslator.getState() : { videoCount: 0, videos: [] };
        sendResponse({ 
          videoCount: state.videoCount,
          videos: state.videos
        });
        break;
        
      default:
        console.warn('Unknown message action:', request.action);
        sendResponse({ error: 'Unknown action' });
    }
    
    return false;
  });
}

// Handle settings changes from background script
async function handleSettingsChanged(newSettings) {
  const oldSettings = videoTranslator ? videoTranslator.settings : {};
  
  // Handle extension enable/disable
  if (newSettings.extensionEnabled !== undefined) {
    if (newSettings.extensionEnabled && !oldSettings.extensionEnabled) {
      await startExtension(newSettings);
    } else if (!newSettings.extensionEnabled && oldSettings.extensionEnabled) {
      stopExtension();
    }
  }
  
  // Handle other setting changes if VideoTranslator is initialized
  if (videoTranslator && videoTranslator.isInitialized) {
    videoTranslator.updateSettings(newSettings);
    updateStatus({ 
      state: 'settings-updated',
      message: 'Settings applied'
    });
  }
}

// Handle toggle translation command
function handleToggleTranslation() {
  const newState = !contentState.settings.extensionEnabled;
  
  chrome.runtime.sendMessage({
    action: 'updateSettings',
    settings: { extensionEnabled: newState }
  }, (response) => {
    if (response && response.success) {
      console.log('Translation toggled:', newState ? 'enabled' : 'disabled');
    }
  });
}

// Set up listeners for settings changes from storage
function setupSettingsListeners() {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
      const changedSettings = {};
      let hasChanges = false;
      
      for (const [key, { newValue }] of Object.entries(changes)) {
        changedSettings[key] = newValue;
        hasChanges = true;
      }
      
      if (hasChanges) {
        handleSettingsChanged(changedSettings);
      }
    }
  });
}

// Set up page navigation listeners for cleanup
function setupNavigationListeners() {
  // Clean up when page is about to unload
  window.addEventListener('beforeunload', () => {
    if (videoTranslator) {
      videoTranslator.cleanup();
    }
  });
  
  // Handle page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (videoTranslator) {
      if (document.hidden) {
        // Page is hidden, pause processing
        videoTranslator.stopAllVideoProcessing();
      } else {
        // Page is visible, resume processing if enabled
        if (videoTranslator.settings.extensionEnabled) {
          videoTranslator.startAllVideoProcessing();
        }
      }
    }
  });
}

// Utility function to get current extension state
function getExtensionState() {
  if (videoTranslator) {
    return videoTranslator.getState();
  }
  
  return {
    isInitialized: false,
    status: { state: 'inactive' },
    settings: {},
    videoCount: 0,
    videos: []
  };
}

// Export for testing (if in test environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VideoTranslator,
    getExtensionState,
    updateStatus,
    reportError,
    handleSettingsChanged,
    getVideoTranslator: () => videoTranslator
  };
}