/**
 * SpeechRecognizer - Handles real-time speech recognition using Web Speech API
 * Integrates with AudioProcessor to convert audio streams to text
 */
class SpeechRecognizer {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isSupported = this.checkBrowserSupport();
    this.currentLanguage = 'en-US';
    this.onResultCallback = null;
    this.onErrorCallback = null;
    this.onStatusCallback = null;
    
    // Configuration options
    this.config = {
      continuous: true,
      interimResults: true,
      maxAlternatives: 1,
      confidenceThreshold: 0.7,
      silenceTimeout: 3000, // ms
      restartDelay: 1000 // ms
    };

    // State management
    this.lastResultTime = 0;
    this.restartTimer = null;
    this.silenceTimer = null;
    this.resultBuffer = [];
  }

  /**
   * Check if Web Speech API is supported in current browser
   * @returns {boolean} - Whether speech recognition is supported
   */
  checkBrowserSupport() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    return !!SpeechRecognition;
  }

  /**
   * Initialize speech recognition with specified language
   * @param {string} language - Language code (e.g., 'en-US', 'es-ES')
   * @param {Function} onResult - Callback for recognition results
   * @param {Function} onError - Callback for errors
   * @param {Function} onStatus - Callback for status updates
   * @returns {boolean} - Success status
   */
  initialize(language, onResult, onError, onStatus) {
    if (!this.isSupported) {
      const error = new Error('Speech recognition not supported in this browser');
      if (onError) onError(error);
      return false;
    }

    try {
      this.currentLanguage = language || 'en-US';
      this.onResultCallback = onResult;
      this.onErrorCallback = onError;
      this.onStatusCallback = onStatus;

      this.setupSpeechRecognition();
      return true;
    } catch (error) {
      console.error('Failed to initialize speech recognition:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
      return false;
    }
  }

  /**
   * Set up Web Speech API recognition instance
   */
  setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    // Configure recognition settings
    this.recognition.continuous = this.config.continuous;
    this.recognition.interimResults = this.config.interimResults;
    this.recognition.maxAlternatives = this.config.maxAlternatives;
    this.recognition.lang = this.currentLanguage;

    // Set up event handlers
    this.recognition.onstart = () => {
      this.isListening = true;
      this.updateStatus('listening');
      console.log('Speech recognition started');
    };

    this.recognition.onresult = (event) => {
      this.handleSpeechResult(event);
    };

    this.recognition.onerror = (event) => {
      this.handleSpeechError(event);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.updateStatus('stopped');
      console.log('Speech recognition ended');
      
      // Auto-restart if we were supposed to be listening
      if (this.shouldRestart()) {
        this.scheduleRestart();
      }
    };

    this.recognition.onnomatch = () => {
      console.log('No speech match found');
      this.updateStatus('no_match');
    };

    this.recognition.onspeechstart = () => {
      this.updateStatus('speech_detected');
      this.clearSilenceTimer();
    };

    this.recognition.onspeechend = () => {
      this.updateStatus('speech_ended');
      this.startSilenceTimer();
    };
  }

  /**
   * Start continuous speech recognition
   * @returns {boolean} - Success status
   */
  startListening() {
    if (!this.isSupported || !this.recognition) {
      this.handleError('Speech recognition not initialized');
      return false;
    }

    if (this.isListening) {
      console.log('Speech recognition already active');
      return true;
    }

    try {
      this.recognition.start();
      this.lastResultTime = Date.now();
      return true;
    } catch (error) {
      this.handleError('Failed to start speech recognition', error);
      return false;
    }
  }

  /**
   * Stop speech recognition
   */
  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
    
    this.clearTimers();
    this.isListening = false;
    this.updateStatus('stopped');
  }

  /**
   * Handle speech recognition results
   * @param {SpeechRecognitionEvent} event - Recognition event
   */
  handleSpeechResult(event) {
    this.lastResultTime = Date.now();
    
    let interimTranscript = '';
    let finalTranscript = '';
    let maxConfidence = 0;

    // Process all results
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence || 0;

      if (result.isFinal) {
        finalTranscript += transcript;
        maxConfidence = Math.max(maxConfidence, confidence);
      } else {
        interimTranscript += transcript;
      }
    }

    // Process final results
    if (finalTranscript) {
      this.processFinalResult(finalTranscript, maxConfidence);
    }

    // Process interim results
    if (interimTranscript && this.onResultCallback) {
      this.onResultCallback({
        type: 'interim',
        transcript: interimTranscript,
        confidence: 0, // Interim results don't have confidence scores
        timestamp: Date.now(),
        language: this.currentLanguage
      });
    }
  }

  /**
   * Process final speech recognition result
   * @param {string} transcript - Final transcript text
   * @param {number} confidence - Confidence score
   */
  processFinalResult(transcript, confidence) {
    // Filter out low-confidence results
    if (confidence < this.config.confidenceThreshold) {
      console.log(`Low confidence result ignored: ${transcript} (${confidence})`);
      return;
    }

    // Clean up transcript
    const cleanTranscript = this.cleanTranscript(transcript);
    
    if (cleanTranscript.length === 0) {
      return;
    }

    // Add to result buffer for context
    this.resultBuffer.push({
      transcript: cleanTranscript,
      confidence: confidence,
      timestamp: Date.now()
    });

    // Keep buffer size manageable
    if (this.resultBuffer.length > 10) {
      this.resultBuffer.shift();
    }

    // Send result to callback
    if (this.onResultCallback) {
      this.onResultCallback({
        type: 'final',
        transcript: cleanTranscript,
        confidence: confidence,
        timestamp: Date.now(),
        language: this.currentLanguage,
        context: this.getRecentContext()
      });
    }
  }

  /**
   * Clean and normalize transcript text
   * @param {string} transcript - Raw transcript
   * @returns {string} - Cleaned transcript
   */
  cleanTranscript(transcript) {
    return transcript
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s.,!?-]/g, '') // Remove special characters
      .toLowerCase();
  }

  /**
   * Get recent context from result buffer
   * @returns {string} - Recent transcript context
   */
  getRecentContext() {
    const recentResults = this.resultBuffer.slice(-3); // Last 3 results
    return recentResults.map(r => r.transcript).join(' ');
  }

  /**
   * Handle speech recognition errors
   * @param {SpeechRecognitionErrorEvent} event - Error event
   */
  handleSpeechError(event) {
    console.error('Speech recognition error:', event.error, event.message);
    
    let userMessage = 'Speech recognition error occurred';
    let shouldRestart = true;

    switch (event.error) {
      case 'no-speech':
        userMessage = 'No speech detected';
        shouldRestart = true;
        break;
      case 'audio-capture':
        userMessage = 'Audio capture failed';
        shouldRestart = false;
        break;
      case 'not-allowed':
        userMessage = 'Microphone access denied';
        shouldRestart = false;
        break;
      case 'network':
        userMessage = 'Network error during speech recognition';
        shouldRestart = true;
        break;
      case 'service-not-allowed':
        userMessage = 'Speech recognition service not allowed';
        shouldRestart = false;
        break;
      case 'bad-grammar':
        userMessage = 'Grammar error in speech recognition';
        shouldRestart = true;
        break;
      case 'language-not-supported':
        userMessage = `Language ${this.currentLanguage} not supported`;
        shouldRestart = false;
        break;
    }

    this.updateStatus('error', userMessage);

    if (this.onErrorCallback) {
      this.onErrorCallback({
        type: 'speech_recognition_error',
        error: event.error,
        message: userMessage,
        shouldRestart: shouldRestart,
        timestamp: Date.now()
      });
    }

    // Auto-restart for recoverable errors
    if (shouldRestart && this.shouldRestart()) {
      this.scheduleRestart();
    }
  }

  /**
   * Determine if recognition should restart automatically
   * @returns {boolean} - Whether to restart
   */
  shouldRestart() {
    // Don't restart if manually stopped or if there have been too many recent errors
    const now = Date.now();
    const timeSinceLastResult = now - this.lastResultTime;
    
    // Restart if we haven't had results for a while but should be listening
    return timeSinceLastResult < 30000; // 30 seconds
  }

  /**
   * Schedule automatic restart of speech recognition
   */
  scheduleRestart() {
    this.clearTimers();
    
    this.restartTimer = setTimeout(() => {
      if (!this.isListening) {
        console.log('Restarting speech recognition...');
        this.startListening();
      }
    }, this.config.restartDelay);
  }

  /**
   * Start silence detection timer
   */
  startSilenceTimer() {
    this.clearSilenceTimer();
    
    this.silenceTimer = setTimeout(() => {
      this.updateStatus('silence_detected');
    }, this.config.silenceTimeout);
  }

  /**
   * Clear silence detection timer
   */
  clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Clear all timers
   */
  clearTimers() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.clearSilenceTimer();
  }

  /**
   * Update recognition status
   * @param {string} status - Status type
   * @param {string} message - Optional status message
   */
  updateStatus(status, message = '') {
    if (this.onStatusCallback) {
      this.onStatusCallback({
        status: status,
        message: message,
        isListening: this.isListening,
        language: this.currentLanguage,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle general errors
   * @param {string} message - Error message
   * @param {Error} error - Optional error object
   */
  handleError(message, error = null) {
    console.error('SpeechRecognizer Error:', message, error);
    
    if (this.onErrorCallback) {
      this.onErrorCallback({
        type: 'general_error',
        message: message,
        originalError: error ? error.message : null,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Change recognition language
   * @param {string} language - New language code
   * @returns {boolean} - Success status
   */
  changeLanguage(language) {
    if (!language || language === this.currentLanguage) {
      return true;
    }

    const wasListening = this.isListening;
    
    if (wasListening) {
      this.stopListening();
    }

    this.currentLanguage = language;
    
    if (this.recognition) {
      this.recognition.lang = language;
    }

    if (wasListening) {
      return this.startListening();
    }

    return true;
  }

  /**
   * Get current recognition status and statistics
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      isSupported: this.isSupported,
      isListening: this.isListening,
      currentLanguage: this.currentLanguage,
      resultBufferSize: this.resultBuffer.length,
      lastResultTime: this.lastResultTime,
      timeSinceLastResult: Date.now() - this.lastResultTime,
      config: { ...this.config }
    };
  }

  /**
   * Update configuration options
   * @param {Object} newConfig - Configuration updates
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Apply changes to active recognition if needed
    if (this.recognition) {
      if (newConfig.continuous !== undefined) {
        this.recognition.continuous = newConfig.continuous;
      }
      if (newConfig.interimResults !== undefined) {
        this.recognition.interimResults = newConfig.interimResults;
      }
      if (newConfig.maxAlternatives !== undefined) {
        this.recognition.maxAlternatives = newConfig.maxAlternatives;
      }
    }
  }

  /**
   * Cleanup resources and stop recognition
   */
  destroy() {
    this.stopListening();
    this.clearTimers();
    
    if (this.recognition) {
      this.recognition = null;
    }
    
    this.resultBuffer = [];
    this.onResultCallback = null;
    this.onErrorCallback = null;
    this.onStatusCallback = null;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpeechRecognizer;
}