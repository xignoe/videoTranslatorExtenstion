/**
 * AudioProcessor - Handles audio capture and processing from video elements
 * Uses Web Audio API to capture audio streams and prepare them for speech recognition
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
      this.videoElement = videoElement;
      this.onAudioDataCallback = onAudioData;
      this.onErrorCallback = onError;

      // Check if video has audio
      if (!this.hasAudioTrack(videoElement)) {
        throw new Error('Video element has no audio track');
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
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
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

    const analyze = () => {
      if (!this.isProcessing) {
        return;
      }

      // Get frequency and time domain data
      this.analyser.getByteFrequencyData(dataArray);
      this.analyser.getFloatTimeDomainData(floatArray);

      // Calculate audio level for voice activity detection
      const audioLevel = this.calculateAudioLevel(dataArray);
      const hasVoiceActivity = this.detectVoiceActivity(floatArray, audioLevel);

      // Send audio data to callback if voice activity detected
      if (hasVoiceActivity && this.onAudioDataCallback) {
        this.onAudioDataCallback({
          frequencyData: dataArray,
          timeDomainData: floatArray,
          audioLevel: audioLevel,
          timestamp: Date.now()
        });
      }

      // Continue analysis
      requestAnimationFrame(analyze);
    };

    analyze();
  }

  /**
   * Calculate overall audio level
   * @param {Uint8Array} frequencyData - Frequency domain data
   * @returns {number} - Audio level (0-1)
   */
  calculateAudioLevel(frequencyData) {
    let sum = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      sum += frequencyData[i];
    }
    return sum / (frequencyData.length * 255);
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
   * Check if audio signal has voice-like characteristics
   * @param {Float32Array} timeDomainData - Time domain audio data
   * @returns {boolean} - Whether signal appears to be voice
   */
  hasVoiceCharacteristics(timeDomainData) {
    // Simple heuristic: voice typically has more variation than pure tones
    let variations = 0;
    for (let i = 1; i < timeDomainData.length; i++) {
      if (Math.abs(timeDomainData[i] - timeDomainData[i - 1]) > 0.01) {
        variations++;
      }
    }
    
    const variationRatio = variations / timeDomainData.length;
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
      let userMessage = message;
      
      // Provide user-friendly error messages
      if (error.message.includes('CORS')) {
        userMessage = 'Cannot access audio due to cross-origin restrictions';
      } else if (error.message.includes('InvalidStateError')) {
        userMessage = 'Audio is already being processed by another application';
      } else if (error.message.includes('NotSupportedError')) {
        userMessage = 'Audio capture not supported for this video';
      } else if (error.message.includes('no audio track')) {
        userMessage = 'This video does not contain audio';
      }
      
      this.onErrorCallback({
        type: 'audio_capture_error',
        message: userMessage,
        originalError: error.message,
        timestamp: Date.now()
      });
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