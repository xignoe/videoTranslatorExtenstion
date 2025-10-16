/**
 * AudioSpeechIntegration - Demonstrates how AudioProcessor and SpeechRecognizer work together
 * This module shows the integration between audio capture and speech recognition
 */

// Import the required modules (in a real extension, these would be loaded via script tags)
// const AudioProcessor = require('./audioProcessor.js');
// const SpeechRecognizer = require('./speechRecognizer.js');

class AudioSpeechIntegration {
  constructor() {
    this.audioProcessor = null;
    this.speechRecognizer = null;
    this.isActive = false;
    this.currentVideoElement = null;
    this.onTranscriptCallback = null;
    this.onErrorCallback = null;
  }

  /**
   * Initialize the audio processing and speech recognition system
   * @param {HTMLVideoElement} videoElement - Video element to process
   * @param {string} language - Language for speech recognition
   * @param {Function} onTranscript - Callback for transcript results
   * @param {Function} onError - Callback for errors
   * @returns {Promise<boolean>} - Success status
   */
  async initialize(videoElement, language = 'en-US', onTranscript, onError) {
    try {
      this.currentVideoElement = videoElement;
      this.onTranscriptCallback = onTranscript;
      this.onErrorCallback = onError;

      // Initialize audio processor
      this.audioProcessor = new AudioProcessor();
      
      // Initialize speech recognizer
      this.speechRecognizer = new SpeechRecognizer();
      
      // Set up speech recognition
      const speechInitialized = this.speechRecognizer.initialize(
        language,
        this.handleSpeechResult.bind(this),
        this.handleSpeechError.bind(this),
        this.handleSpeechStatus.bind(this)
      );

      if (!speechInitialized) {
        throw new Error('Failed to initialize speech recognition');
      }

      // Set up audio capture
      const audioInitialized = await this.audioProcessor.captureAudioFromVideo(
        videoElement,
        this.handleAudioData.bind(this),
        this.handleAudioError.bind(this)
      );

      if (!audioInitialized) {
        throw new Error('Failed to initialize audio capture');
      }

      // Start speech recognition
      const speechStarted = this.speechRecognizer.startListening();
      if (!speechStarted) {
        throw new Error('Failed to start speech recognition');
      }

      this.isActive = true;
      console.log('Audio-Speech integration initialized successfully');
      return true;

    } catch (error) {
      console.error('Failed to initialize audio-speech integration:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback({
          type: 'initialization_error',
          message: error.message,
          timestamp: Date.now()
        });
      }
      return false;
    }
  }

  /**
   * Handle audio data from the audio processor
   * @param {Object} audioData - Audio data from processor
   */
  handleAudioData(audioData) {
    // Audio data is being processed by the speech recognizer automatically
    // This callback can be used for additional audio analysis if needed
    console.log('Audio data received:', {
      audioLevel: audioData.audioLevel,
      timestamp: audioData.timestamp
    });

    // Optional: Could implement additional audio processing here
    // such as noise reduction, volume normalization, etc.
  }

  /**
   * Handle speech recognition results
   * @param {Object} result - Speech recognition result
   */
  handleSpeechResult(result) {
    console.log('Speech result:', result);

    // Forward the transcript to the callback
    if (this.onTranscriptCallback) {
      this.onTranscriptCallback({
        type: result.type, // 'interim' or 'final'
        text: result.transcript,
        confidence: result.confidence,
        language: result.language,
        timestamp: result.timestamp,
        context: result.context
      });
    }
  }

  /**
   * Handle audio processing errors
   * @param {Object} error - Audio error
   */
  handleAudioError(error) {
    console.error('Audio processing error:', error);
    
    if (this.onErrorCallback) {
      this.onErrorCallback({
        type: 'audio_error',
        message: error.message,
        originalError: error.originalError,
        timestamp: error.timestamp
      });
    }
  }

  /**
   * Handle speech recognition errors
   * @param {Object} error - Speech recognition error
   */
  handleSpeechError(error) {
    console.error('Speech recognition error:', error);
    
    if (this.onErrorCallback) {
      this.onErrorCallback({
        type: 'speech_error',
        message: error.message,
        error: error.error,
        shouldRestart: error.shouldRestart,
        timestamp: error.timestamp
      });
    }

    // Handle automatic restart for recoverable errors
    if (error.shouldRestart && this.isActive) {
      console.log('Attempting to restart speech recognition...');
      setTimeout(() => {
        if (this.speechRecognizer && this.isActive) {
          this.speechRecognizer.startListening();
        }
      }, 2000); // Wait 2 seconds before restart
    }
  }

  /**
   * Handle speech recognition status updates
   * @param {Object} status - Status update
   */
  handleSpeechStatus(status) {
    console.log('Speech status:', status);
    
    // Could emit status updates to UI components here
    // For example, showing "listening", "processing", etc.
  }

  /**
   * Change the language for speech recognition
   * @param {string} language - New language code
   * @returns {boolean} - Success status
   */
  changeLanguage(language) {
    if (!this.speechRecognizer) {
      return false;
    }

    return this.speechRecognizer.changeLanguage(language);
  }

  /**
   * Stop audio processing and speech recognition
   */
  stop() {
    this.isActive = false;

    if (this.speechRecognizer) {
      this.speechRecognizer.stopListening();
    }

    if (this.audioProcessor) {
      this.audioProcessor.stopProcessing();
    }

    console.log('Audio-Speech integration stopped');
  }

  /**
   * Get current status of the integration
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      isActive: this.isActive,
      hasVideoElement: !!this.currentVideoElement,
      audioStatus: this.audioProcessor ? this.audioProcessor.getStatus() : null,
      speechStatus: this.speechRecognizer ? this.speechRecognizer.getStatus() : null
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stop();

    if (this.speechRecognizer) {
      this.speechRecognizer.destroy();
      this.speechRecognizer = null;
    }

    if (this.audioProcessor) {
      this.audioProcessor = null;
    }

    this.currentVideoElement = null;
    this.onTranscriptCallback = null;
    this.onErrorCallback = null;
  }
}

// Example usage:
/*
const integration = new AudioSpeechIntegration();

// Find a video element
const videoElement = document.querySelector('video');

if (videoElement) {
  integration.initialize(
    videoElement,
    'en-US',
    (transcript) => {
      console.log('Transcript:', transcript.text);
      // Display subtitles here
    },
    (error) => {
      console.error('Integration error:', error);
      // Handle errors here
    }
  );
}
*/

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioSpeechIntegration;
}