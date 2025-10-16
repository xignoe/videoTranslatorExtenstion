/**
 * AudioProcessor - Handles audio capture and processing from video elements
 * Uses Web Audio API to capture audio streams and prepare them for speech recognition
 * Includes privacy protection and secure audio processing
 */
class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.mediaStreamSource = null;
    this.analyser = null;
    this.isProcessing = false;
    this.videoElement = null;
    this.onAudioDataCallback = null;
    this.onErrorCallback = null;
    this.privacyManager = null;
    this.currentStreamId = null;
    this.initializePrivacyProtection();
  }

  /**
   * Initialize privacy protection for audio processing
   */
  async initializePrivacyProtection() {
    try {
      if (typeof PrivacyManager !== 'undefined') {
        this.privacyManager = new PrivacyManager();
        await this.privacyManager.initializePrivacySettings();
      } else {
        console.warn('PrivacyManager not available, audio processing will continue without privacy protection');
      }
    } catch (error) {
      console.error('Failed to initialize privacy protection:', error);
    }
  }

  /**
   * Initialize audio context and capture audio from video element
   * @param {HTMLVideoElement} videoElement - The video element to capture audio from
   * @param {Function} onAudioData - Callback for processed audio data
   * @param {Function} onError - Callback for error handling
   * @returns {Promise<boolean>} - Success status
   */
  async captureAudioFromVideo(videoElement, onAudioData, onError) {
    try {
      // Request privacy consent for audio processing
      if (this.privacyManager) {
        const consentGranted = await this.privacyManager.requestConsent('audioProcessing', {
          videoSource: videoElement.src || videoElement.currentSrc || 'unknown',
          purpose: 'Real-time speech recognition for subtitle generation'
        });

        if (!consentGranted) {
          throw new Error('User consent required for audio processing');
        }
      }

      this.videoElement = videoElement;
      this.onAudioDataCallback = onAudioData;
      this.onErrorCallback = onError;

      // Check if video has audio
      if (!this.hasAudioTrack(videoElement)) {
        throw new Error('Video element has no audio track');
      }

      // Register audio stream with privacy manager
      if (this.privacyManager) {
        this.currentStreamId = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const registered = this.privacyManager.registerAudioStream(this.currentStreamId, {
          videoElement: videoElement.tagName,
          source: videoElement.src || videoElement.currentSrc || 'unknown',
          purpose: 'speech_recognition'
        });

        if (!registered) {
          throw new Error('Failed to register audio stream for privacy compliance');
        }
      }

      // Create audio context
      await this.createAudioContext();

      // Attempt to capture audio using different methods
      const success = await this.attemptAudioCapture();

      if (success) {
        this.isProcessing = true;
        this.startAudioAnalysis();
        return true;
      }

      return false;
    } catch (error) {
      this.handleError('Audio capture failed', error);
      return false;
    }
  }

  /**
   * Create and initialize Web Audio API context
   * @returns {Promise<void>}
   */
  async createAudioContext() {
    try {
      // Create audio context with appropriate sample rate
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass({
        sampleRate: 16000, // Optimal for speech recognition
        latencyHint: 'interactive'
      });

      // Resume context if suspended (required by Chrome's autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      console.log('AudioContext created successfully');
    } catch (error) {
      throw new Error(`Failed to create AudioContext: ${error.message}`);
    }
  }

  /**
   * Attempt to capture audio using different methods
   * @returns {Promise<boolean>} - Success status
   */
  async attemptAudioCapture() {
    // Method 1: Try to capture from video element directly
    try {
      return await this.captureFromVideoElement();
    } catch (error) {
      console.warn('Direct video capture failed:', error.message);
    }

    // Method 2: Try to capture from media stream if available
    try {
      return await this.captureFromMediaStream();
    } catch (error) {
      console.warn('Media stream capture failed:', error.message);
    }

    // Method 3: Try to capture using cross-origin workaround
    try {
      return await this.captureWithCORSWorkaround();
    } catch (error) {
      console.warn('CORS workaround failed:', error.message);
    }

    return false;
  }

  /**
   * Capture audio directly from video element
   * @returns {Promise<boolean>}
   */
  async captureFromVideoElement() {
    try {
      // Create media element source
      this.mediaStreamSource = this.audioContext.createMediaElementSource(this.videoElement);

      // Create analyser for audio processing
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      // Connect audio nodes
      this.mediaStreamSource.connect(this.analyser);

      // Note: We don't connect to destination to avoid audio feedback
      // this.analyser.connect(this.audioContext.destination);

      return true;
    } catch (error) {
      if (error.name === 'InvalidStateError') {
        throw new Error('Video element already connected to another audio context');
      } else if (error.name === 'NotSupportedError') {
        throw new Error('Cross-origin audio access blocked by CORS policy');
      }
      throw error;
    }
  }

  /**
   * Capture audio from media stream (for getUserMedia scenarios)
   * @returns {Promise<boolean>}
   */
  async captureFromMediaStream() {
    // This method would be used if the video has an associated MediaStream
    // Currently not implemented as it requires additional video stream detection
    throw new Error('Media stream capture not yet implemented');
  }

  /**
   * Attempt CORS workaround for cross-origin videos
   * @returns {Promise<boolean>}
   */
  async captureWithCORSWorkaround() {
    // For cross-origin videos, we might need alternative approaches
    // This could involve proxy servers or different capture methods
    throw new Error('CORS workaround not yet implemented');
  }

  /**
   * Start analyzing audio data for speech recognition
   */
  startAudioAnalysis() {
    if (!this.analyser || !this.isProcessing) {
      return;
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const floatArray = new Float32Array(bufferLength);
    
    // Performance optimizations
    let frameCount = 0;
    let lastProcessTime = 0;
    const PROCESSING_INTERVAL = 100; // Process every 100ms instead of every frame
    const BATCH_SIZE = 5; // Process in batches to reduce overhead
    
    // Reuse objects to reduce garbage collection
    const reusableAudioData = {
      frequencyData: dataArray,
      timeDomainData: floatArray,
      audioLevel: 0,
      timestamp: 0
    };

    const analyze = (currentTime) => {
      if (!this.isProcessing) {
        return;
      }

      frameCount++;
      
      // Throttle processing to reduce CPU usage
      if (currentTime - lastProcessTime < PROCESSING_INTERVAL) {
        requestAnimationFrame(analyze);
        return;
      }
      
      lastProcessTime = currentTime;

      // Get frequency and time domain data
      this.analyser.getByteFrequencyData(dataArray);
      this.analyser.getFloatTimeDomainData(floatArray);

      // Calculate audio level for voice activity detection
      const audioLevel = this.calculateAudioLevel(dataArray);
      const hasVoiceActivity = this.detectVoiceActivity(floatArray, audioLevel);

      // Send audio data to callback if voice activity detected
      if (hasVoiceActivity && this.onAudioDataCallback) {
        // Update reusable object instead of creating new one
        reusableAudioData.audioLevel = audioLevel;
        reusableAudioData.timestamp = Date.now();

        // Process audio data through privacy manager if available
        if (this.privacyManager && this.currentStreamId) {
          const privacyResult = this.privacyManager.processAudioDataSecurely(
            this.currentStreamId, 
            floatArray
          );
          
          if (privacyResult) {
            // Add privacy metadata to audio data
            reusableAudioData.privacy = {
              streamId: privacyResult.streamId,
              processed: privacyResult.processed,
              timestamp: privacyResult.timestamp
            };
          } else {
            // Privacy processing failed, don't send audio data
            console.warn('Audio data blocked by privacy protection');
            requestAnimationFrame(analyze);
            return;
          }
        }

        this.onAudioDataCallback(reusableAudioData);
      }

      // Continue analysis
      requestAnimationFrame(analyze);
    };

    requestAnimationFrame(analyze);
  }

  /**
   * Calculate overall audio level (optimized)
   * @param {Uint8Array} frequencyData - Frequency domain data
   * @returns {number} - Audio level (0-1)
   */
  calculateAudioLevel(frequencyData) {
    // Optimized calculation using only relevant frequency range for speech (300-3400 Hz)
    const sampleRate = this.audioContext.sampleRate;
    const nyquist = sampleRate / 2;
    const binSize = nyquist / frequencyData.length;
    
    const startBin = Math.floor(300 / binSize);
    const endBin = Math.min(Math.floor(3400 / binSize), frequencyData.length);
    
    let sum = 0;
    const relevantBins = endBin - startBin;
    
    for (let i = startBin; i < endBin; i++) {
      sum += frequencyData[i];
    }
    
    return relevantBins > 0 ? sum / (relevantBins * 255) : 0;
  }

  /**
   * Detect voice activity in audio signal
   * @param {Float32Array} timeDomainData - Time domain audio data
   * @param {number} audioLevel - Overall audio level
   * @returns {boolean} - Whether voice activity is detected
   */
  detectVoiceActivity(timeDomainData, audioLevel) {
    // Simple voice activity detection based on audio level and signal characteristics
    const VOICE_THRESHOLD = 0.01; // Minimum audio level for voice
    const SILENCE_THRESHOLD = 0.005; // Maximum level considered silence

    if (audioLevel < SILENCE_THRESHOLD) {
      return false;
    }

    if (audioLevel > VOICE_THRESHOLD) {
      // Additional check for voice-like characteristics
      return this.hasVoiceCharacteristics(timeDomainData);
    }

    return false;
  }

  /**
   * Check if audio signal has voice-like characteristics (optimized)
   * @param {Float32Array} timeDomainData - Time domain audio data
   * @returns {boolean} - Whether signal appears to be voice
   */
  hasVoiceCharacteristics(timeDomainData) {
    // Optimized heuristic: sample every 4th point to reduce computation
    const sampleStep = 4;
    let variations = 0;
    let sampledPoints = 0;
    
    for (let i = sampleStep; i < timeDomainData.length; i += sampleStep) {
      if (Math.abs(timeDomainData[i] - timeDomainData[i - sampleStep]) > 0.01) {
        variations++;
      }
      sampledPoints++;
    }

    const variationRatio = sampledPoints > 0 ? variations / sampledPoints : 0;
    return variationRatio > 0.1; // Voice should have at least 10% variation
  }

  /**
   * Check if video element has audio track
   * @param {HTMLVideoElement} videoElement - Video element to check
   * @returns {boolean} - Whether video has audio
   */
  hasAudioTrack(videoElement) {
    // Check if video element has audio tracks
    if (videoElement.audioTracks && videoElement.audioTracks.length > 0) {
      return true;
    }

    // Fallback: check if video is muted or has volume
    if (videoElement.muted || videoElement.volume === 0) {
      return false; // Assume no audio if muted
    }

    // Default assumption: video has audio unless proven otherwise
    return true;
  }

  /**
   * Stop audio processing and cleanup resources
   */
  stopProcessing() {
    this.isProcessing = false;

    // Clean up privacy-related resources first
    if (this.privacyManager && this.currentStreamId) {
      this.privacyManager.unregisterDataStream(this.currentStreamId);
      this.currentStreamId = null;
    }

    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    console.log('Audio processing stopped and resources cleaned up');
  }

  /**
   * Handle errors with appropriate user feedback
   * @param {string} message - Error message
   * @param {Error} error - Original error object
   */
  handleError(message, error) {
    console.error(`AudioProcessor Error: ${message}`, error);

    if (this.onErrorCallback) {
      // Create structured error object for the callback
      const errorInfo = {
        type: 'audio_capture_error',
        message: error instanceof Error ? error.message : String(error),
        originalError: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        context: message
      };

      this.onErrorCallback(errorInfo);
    }
  }

  /**
   * Get current audio processing status
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      hasAudioContext: !!this.audioContext,
      hasMediaSource: !!this.mediaStreamSource,
      hasAnalyser: !!this.analyser,
      audioContextState: this.audioContext ? this.audioContext.state : null
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioProcessor;
}