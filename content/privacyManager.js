/**
 * Privacy Manager for Video Translator Extension
 * Handles privacy protection, data handling, and user consent management
 * Ensures compliance with privacy requirements and secure audio processing
 */

class PrivacyManager {
  constructor() {
    this.consentStatus = {
      audioProcessing: false,
      dataTransmission: false,
      storageAccess: false,
      lastUpdated: null
    };
    
    this.dataRetentionPolicy = {
      audioData: 0, // No retention - process in real-time only
      transcriptionCache: 300000, // 5 minutes
      translationCache: 3600000, // 1 hour
      userPreferences: Infinity // Persistent until user removes
    };
    
    this.secureProcessingOptions = {
      localProcessingOnly: false,
      encryptTransmissions: true,
      anonymizeRequests: true,
      minimizeDataCollection: true
    };
    
    this.activeDataStreams = new Map();
    this.dataCleanupTimers = new Map();
    this.consentListeners = new Set();
    
    this.initializePrivacySettings();
  }

  /**
   * Initialize privacy settings and load user consent status
   */
  async initializePrivacySettings() {
    try {
      // Load existing consent status
      const savedConsent = await this.loadConsentStatus();
      if (savedConsent) {
        this.consentStatus = { ...this.consentStatus, ...savedConsent };
      }
      
      // Set up automatic data cleanup
      this.setupDataCleanup();
      
      // Initialize secure processing options
      await this.loadSecureProcessingOptions();
      
      console.log('Privacy Manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Privacy Manager:', error);
      // Use default privacy-first settings on error
      this.consentStatus = {
        audioProcessing: false,
        dataTransmission: false,
        storageAccess: false,
        lastUpdated: Date.now()
      };
    }
  }

  /**
   * Request user consent for specific data processing activities
   * @param {string} activity - Type of activity requiring consent
   * @param {Object} options - Additional options for consent request
   * @returns {Promise<boolean>} - Whether consent was granted
   */
  async requestConsent(activity, options = {}) {
    try {
      // Check if consent already exists and is still valid
      if (this.hasValidConsent(activity)) {
        return true;
      }

      // Prepare consent request details
      const consentDetails = this.getConsentDetails(activity, options);
      
      // Show consent dialog to user
      const granted = await this.showConsentDialog(consentDetails);
      
      if (granted) {
        // Update consent status
        this.consentStatus[activity] = true;
        this.consentStatus.lastUpdated = Date.now();
        
        // Save consent status
        await this.saveConsentStatus();
        
        // Notify listeners
        this.notifyConsentChange(activity, true);
        
        console.log(`User consent granted for: ${activity}`);
        return true;
      } else {
        console.log(`User consent denied for: ${activity}`);
        return false;
      }
    } catch (error) {
      console.error(`Failed to request consent for ${activity}:`, error);
      return false;
    }
  }

  /**
   * Check if user has valid consent for specific activity
   * @param {string} activity - Activity to check consent for
   * @returns {boolean} - Whether valid consent exists
   */
  hasValidConsent(activity) {
    const consent = this.consentStatus[activity];
    if (!consent) return false;
    
    // Check if consent has expired (optional - for time-limited consent)
    const consentAge = Date.now() - (this.consentStatus.lastUpdated || 0);
    const maxConsentAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    return consentAge < maxConsentAge;
  }

  /**
   * Revoke user consent for specific activity
   * @param {string} activity - Activity to revoke consent for
   */
  async revokeConsent(activity) {
    try {
      this.consentStatus[activity] = false;
      this.consentStatus.lastUpdated = Date.now();
      
      // Clean up any active data streams for this activity
      await this.cleanupActivityData(activity);
      
      // Save updated consent status
      await this.saveConsentStatus();
      
      // Notify listeners
      this.notifyConsentChange(activity, false);
      
      console.log(`User consent revoked for: ${activity}`);
    } catch (error) {
      console.error(`Failed to revoke consent for ${activity}:`, error);
    }
  }

  /**
   * Register audio data stream for privacy-compliant processing
   * @param {string} streamId - Unique identifier for the stream
   * @param {Object} streamInfo - Information about the stream
   * @returns {boolean} - Whether stream was registered successfully
   */
  registerAudioStream(streamId, streamInfo) {
    try {
      // Verify consent for audio processing
      if (!this.hasValidConsent('audioProcessing')) {
        throw new Error('No valid consent for audio processing');
      }

      // Register stream with privacy metadata
      this.activeDataStreams.set(streamId, {
        ...streamInfo,
        type: 'audio',
        startTime: Date.now(),
        dataRetention: this.dataRetentionPolicy.audioData,
        secureProcessing: true,
        localOnly: this.secureProcessingOptions.localProcessingOnly
      });

      // Set up automatic cleanup (audio data should not be retained)
      this.scheduleDataCleanup(streamId, this.dataRetentionPolicy.audioData);

      console.log(`Audio stream registered: ${streamId}`);
      return true;
    } catch (error) {
      console.error(`Failed to register audio stream ${streamId}:`, error);
      return false;
    }
  }

  /**
   * Process audio data with privacy protection
   * @param {string} streamId - Stream identifier
   * @param {ArrayBuffer|Float32Array} audioData - Audio data to process
   * @returns {Object|null} - Processed data or null if privacy violation
   */
  processAudioDataSecurely(streamId, audioData) {
    try {
      const stream = this.activeDataStreams.get(streamId);
      if (!stream || stream.type !== 'audio') {
        throw new Error('Invalid or unregistered audio stream');
      }

      // Verify consent is still valid
      if (!this.hasValidConsent('audioProcessing')) {
        this.unregisterDataStream(streamId);
        throw new Error('Audio processing consent no longer valid');
      }

      // Process audio data without storing it
      const processedData = {
        streamId,
        timestamp: Date.now(),
        dataSize: audioData.length || audioData.byteLength,
        processed: true,
        // Note: Actual audio data is not included in return value
        // to prevent accidental storage or transmission
      };

      // Log processing activity (without sensitive data)
      this.logDataProcessing('audio', streamId, processedData.dataSize);

      return processedData;
    } catch (error) {
      console.error(`Secure audio processing failed for ${streamId}:`, error);
      return null;
    }
  }

  /**
   * Create privacy-compliant translation request
   * @param {string} text - Text to translate
   * @param {Object} options - Translation options
   * @returns {Object} - Sanitized translation request
   */
  createSecureTranslationRequest(text, options = {}) {
    try {
      // Verify consent for data transmission
      if (!this.hasValidConsent('dataTransmission')) {
        throw new Error('No valid consent for data transmission');
      }

      // Sanitize and anonymize the request
      const sanitizedRequest = {
        text: this.sanitizeText(text),
        sourceLanguage: options.sourceLanguage || 'auto',
        targetLanguage: options.targetLanguage || 'en',
        requestId: this.generateAnonymousId(),
        timestamp: Date.now(),
        privacy: {
          anonymized: this.secureProcessingOptions.anonymizeRequests,
          encrypted: this.secureProcessingOptions.encryptTransmissions,
          minimized: this.secureProcessingOptions.minimizeDataCollection
        }
      };

      // Remove any potentially identifying information
      if (this.secureProcessingOptions.anonymizeRequests) {
        sanitizedRequest.text = this.anonymizeText(sanitizedRequest.text);
      }

      // Schedule cleanup of request data
      const requestId = sanitizedRequest.requestId;
      this.scheduleDataCleanup(requestId, this.dataRetentionPolicy.transcriptionCache);

      console.log(`Secure translation request created: ${requestId}`);
      return sanitizedRequest;
    } catch (error) {
      console.error('Failed to create secure translation request:', error);
      return null;
    }
  }

  /**
   * Sanitize text input to remove sensitive information
   * @param {string} text - Input text
   * @returns {string} - Sanitized text
   */
  sanitizeText(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // Remove potential PII patterns
    let sanitized = text
      // Remove email addresses
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      // Remove phone numbers (basic patterns)
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
      // Remove credit card numbers (basic pattern)
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD]')
      // Remove social security numbers (US format)
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');

    return sanitized.trim();
  }

  /**
   * Anonymize text by removing identifying information
   * @param {string} text - Input text
   * @returns {string} - Anonymized text
   */
  anonymizeText(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // Additional anonymization beyond sanitization
    let anonymized = text
      // Replace names with generic placeholders (basic approach)
      .replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, '[NAME]')
      // Replace addresses (basic pattern)
      .replace(/\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd)\b/gi, '[ADDRESS]')
      // Replace specific locations
      .replace(/\b(?:in|at|from|to)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g, (match) => {
        return match.replace(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g, '[LOCATION]');
      });

    return anonymized;
  }

  /**
   * Generate anonymous request ID
   * @returns {string} - Anonymous ID
   */
  generateAnonymousId() {
    // Generate random ID without using any user-identifying information
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `anon_${timestamp}_${random}`;
  }

  /**
   * Schedule automatic data cleanup
   * @param {string} dataId - Data identifier
   * @param {number} retentionTime - Time in milliseconds to retain data
   */
  scheduleDataCleanup(dataId, retentionTime) {
    // Clear existing timer if any
    if (this.dataCleanupTimers.has(dataId)) {
      clearTimeout(this.dataCleanupTimers.get(dataId));
    }

    // Schedule cleanup
    if (retentionTime > 0) {
      const timer = setTimeout(() => {
        this.cleanupData(dataId);
      }, retentionTime);
      
      this.dataCleanupTimers.set(dataId, timer);
    } else {
      // Immediate cleanup for zero retention
      this.cleanupData(dataId);
    }
  }

  /**
   * Clean up specific data
   * @param {string} dataId - Data identifier to clean up
   */
  cleanupData(dataId) {
    try {
      // Remove from active streams
      this.activeDataStreams.delete(dataId);
      
      // Clear cleanup timer
      if (this.dataCleanupTimers.has(dataId)) {
        clearTimeout(this.dataCleanupTimers.get(dataId));
        this.dataCleanupTimers.delete(dataId);
      }

      console.log(`Data cleaned up: ${dataId}`);
    } catch (error) {
      console.error(`Failed to cleanup data ${dataId}:`, error);
    }
  }

  /**
   * Clean up data for specific activity
   * @param {string} activity - Activity type
   */
  async cleanupActivityData(activity) {
    try {
      const streamsToCleanup = [];
      
      // Find all streams related to the activity
      for (const [streamId, streamInfo] of this.activeDataStreams) {
        if (this.isStreamRelatedToActivity(streamInfo, activity)) {
          streamsToCleanup.push(streamId);
        }
      }

      // Clean up identified streams
      for (const streamId of streamsToCleanup) {
        this.cleanupData(streamId);
      }

      console.log(`Cleaned up ${streamsToCleanup.length} streams for activity: ${activity}`);
    } catch (error) {
      console.error(`Failed to cleanup activity data for ${activity}:`, error);
    }
  }

  /**
   * Check if stream is related to specific activity
   * @param {Object} streamInfo - Stream information
   * @param {string} activity - Activity type
   * @returns {boolean} - Whether stream is related to activity
   */
  isStreamRelatedToActivity(streamInfo, activity) {
    switch (activity) {
      case 'audioProcessing':
        return streamInfo.type === 'audio';
      case 'dataTransmission':
        return streamInfo.type === 'translation' || streamInfo.type === 'transcription';
      case 'storageAccess':
        return streamInfo.persistent === true;
      default:
        return false;
    }
  }

  /**
   * Set up automatic data cleanup intervals
   */
  setupDataCleanup() {
    // Clean up expired data every minute
    setInterval(() => {
      this.performPeriodicCleanup();
    }, 60000);
  }

  /**
   * Perform periodic cleanup of expired data
   */
  performPeriodicCleanup() {
    try {
      const now = Date.now();
      const expiredStreams = [];

      // Check for expired streams
      for (const [streamId, streamInfo] of this.activeDataStreams) {
        const age = now - streamInfo.startTime;
        const maxAge = streamInfo.dataRetention || this.dataRetentionPolicy.audioData;
        
        if (maxAge > 0 && age > maxAge) {
          expiredStreams.push(streamId);
        }
      }

      // Clean up expired streams
      for (const streamId of expiredStreams) {
        this.cleanupData(streamId);
      }

      if (expiredStreams.length > 0) {
        console.log(`Periodic cleanup removed ${expiredStreams.length} expired data streams`);
      }
    } catch (error) {
      console.error('Periodic cleanup failed:', error);
    }
  }

  /**
   * Unregister data stream
   * @param {string} streamId - Stream identifier
   */
  unregisterDataStream(streamId) {
    this.cleanupData(streamId);
  }

  /**
   * Get consent details for specific activity
   * @param {string} activity - Activity type
   * @param {Object} options - Additional options
   * @returns {Object} - Consent details
   */
  getConsentDetails(activity, options) {
    const details = {
      activity,
      timestamp: Date.now(),
      ...options
    };

    switch (activity) {
      case 'audioProcessing':
        details.description = 'Process audio from videos for speech recognition';
        details.dataTypes = ['Audio streams', 'Speech patterns'];
        details.retention = 'Real-time processing only, no storage';
        details.purpose = 'Generate subtitles and translations';
        break;
      
      case 'dataTransmission':
        details.description = 'Send text to translation services';
        details.dataTypes = ['Transcribed text', 'Language preferences'];
        details.retention = 'Temporary caching for performance';
        details.purpose = 'Provide translation services';
        break;
      
      case 'storageAccess':
        details.description = 'Store user preferences and settings';
        details.dataTypes = ['Language settings', 'Subtitle preferences'];
        details.retention = 'Until extension is uninstalled';
        details.purpose = 'Remember user preferences';
        break;
    }

    return details;
  }

  /**
   * Show consent dialog to user
   * @param {Object} consentDetails - Details about consent request
   * @returns {Promise<boolean>} - Whether consent was granted
   */
  async showConsentDialog(consentDetails) {
    // This would typically show a UI dialog
    // For now, we'll use a simple confirm dialog
    // In a real implementation, this would be a proper modal
    
    const message = `
Video Translator Extension Privacy Consent

Activity: ${consentDetails.description}
Data Types: ${consentDetails.dataTypes.join(', ')}
Data Retention: ${consentDetails.retention}
Purpose: ${consentDetails.purpose}

Do you consent to this data processing?
    `.trim();

    return new Promise((resolve) => {
      // In a real extension, this would be handled by the popup or options page
      // For testing purposes, we'll assume consent is granted
      // This should be replaced with proper UI integration
      resolve(true);
    });
  }

  /**
   * Load consent status from storage
   * @returns {Promise<Object|null>} - Saved consent status
   */
  async loadConsentStatus() {
    try {
      return new Promise((resolve) => {
        chrome.storage.local.get(['privacyConsent'], (result) => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to load consent status:', chrome.runtime.lastError);
            resolve(null);
          } else {
            resolve(result.privacyConsent || null);
          }
        });
      });
    } catch (error) {
      console.error('Failed to load consent status:', error);
      return null;
    }
  }

  /**
   * Save consent status to storage
   * @returns {Promise<void>}
   */
  async saveConsentStatus() {
    try {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set({
          privacyConsent: this.consentStatus
        }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('Failed to save consent status:', error);
      throw error;
    }
  }

  /**
   * Load secure processing options
   * @returns {Promise<void>}
   */
  async loadSecureProcessingOptions() {
    try {
      return new Promise((resolve) => {
        chrome.storage.sync.get(['secureProcessingOptions'], (result) => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to load secure processing options:', chrome.runtime.lastError);
          } else if (result.secureProcessingOptions) {
            this.secureProcessingOptions = {
              ...this.secureProcessingOptions,
              ...result.secureProcessingOptions
            };
          }
          resolve();
        });
      });
    } catch (error) {
      console.error('Failed to load secure processing options:', error);
    }
  }

  /**
   * Update secure processing options
   * @param {Object} options - New options
   * @returns {Promise<void>}
   */
  async updateSecureProcessingOptions(options) {
    try {
      this.secureProcessingOptions = {
        ...this.secureProcessingOptions,
        ...options
      };

      return new Promise((resolve, reject) => {
        chrome.storage.sync.set({
          secureProcessingOptions: this.secureProcessingOptions
        }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('Failed to update secure processing options:', error);
      throw error;
    }
  }

  /**
   * Log data processing activity
   * @param {string} type - Type of data processing
   * @param {string} identifier - Data identifier
   * @param {number} dataSize - Size of processed data
   */
  logDataProcessing(type, identifier, dataSize) {
    // Log processing activity without sensitive data
    console.log(`Privacy-compliant ${type} processing: ${identifier} (${dataSize} bytes)`);
  }

  /**
   * Add consent change listener
   * @param {Function} listener - Listener function
   */
  addConsentListener(listener) {
    this.consentListeners.add(listener);
  }

  /**
   * Remove consent change listener
   * @param {Function} listener - Listener function
   */
  removeConsentListener(listener) {
    this.consentListeners.delete(listener);
  }

  /**
   * Notify consent change listeners
   * @param {string} activity - Activity that changed
   * @param {boolean} granted - Whether consent was granted
   */
  notifyConsentChange(activity, granted) {
    this.consentListeners.forEach(listener => {
      try {
        listener(activity, granted);
      } catch (error) {
        console.error('Error in consent change listener:', error);
      }
    });
  }

  /**
   * Get privacy status summary
   * @returns {Object} - Privacy status information
   */
  getPrivacyStatus() {
    return {
      consentStatus: { ...this.consentStatus },
      activeStreams: this.activeDataStreams.size,
      secureProcessing: { ...this.secureProcessingOptions },
      dataRetentionPolicy: { ...this.dataRetentionPolicy }
    };
  }

  /**
   * Perform complete privacy cleanup (e.g., on extension disable/uninstall)
   * @returns {Promise<void>}
   */
  async performCompleteCleanup() {
    try {
      // Clean up all active data streams
      const streamIds = Array.from(this.activeDataStreams.keys());
      for (const streamId of streamIds) {
        this.cleanupData(streamId);
      }

      // Clear all cleanup timers
      for (const timer of this.dataCleanupTimers.values()) {
        clearTimeout(timer);
      }
      this.dataCleanupTimers.clear();

      // Clear consent status
      await new Promise((resolve) => {
        chrome.storage.local.remove(['privacyConsent'], () => {
          resolve();
        });
      });

      console.log('Complete privacy cleanup performed');
    } catch (error) {
      console.error('Failed to perform complete privacy cleanup:', error);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PrivacyManager;
} else if (typeof window !== 'undefined') {
  window.PrivacyManager = PrivacyManager;
}