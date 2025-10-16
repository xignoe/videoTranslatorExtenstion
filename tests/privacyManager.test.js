/**
 * Tests for PrivacyManager
 * Validates privacy protection, consent management, and secure data handling
 */

const PrivacyManager = require('../content/privacyManager.js');

// Mock Chrome APIs
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    },
    sync: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  runtime: {
    lastError: null
  }
};

describe('PrivacyManager', () => {
  let privacyManager;

  beforeEach(() => {
    privacyManager = new PrivacyManager();
    jest.clearAllMocks();
    
    // Mock successful storage operations
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({});
    });
    chrome.storage.local.set.mockImplementation((data, callback) => {
      callback();
    });
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback({});
    });
    chrome.storage.sync.set.mockImplementation((data, callback) => {
      callback();
    });
  });

  afterEach(() => {
    if (privacyManager) {
      privacyManager.performCompleteCleanup();
    }
  });

  describe('Initialization', () => {
    test('should initialize with default privacy settings', () => {
      expect(privacyManager.consentStatus).toBeDefined();
      expect(privacyManager.consentStatus.audioProcessing).toBe(false);
      expect(privacyManager.consentStatus.dataTransmission).toBe(false);
      expect(privacyManager.consentStatus.storageAccess).toBe(false);
    });

    test('should initialize data retention policies', () => {
      expect(privacyManager.dataRetentionPolicy).toBeDefined();
      expect(privacyManager.dataRetentionPolicy.audioData).toBe(0); // No retention
      expect(privacyManager.dataRetentionPolicy.transcriptionCache).toBeGreaterThan(0);
    });

    test('should initialize secure processing options', () => {
      expect(privacyManager.secureProcessingOptions).toBeDefined();
      expect(privacyManager.secureProcessingOptions.encryptTransmissions).toBe(true);
      expect(privacyManager.secureProcessingOptions.anonymizeRequests).toBe(true);
    });
  });

  describe('Consent Management', () => {
    test('should request consent for audio processing', async () => {
      // Mock user granting consent
      privacyManager.showConsentDialog = jest.fn().mockResolvedValue(true);

      const granted = await privacyManager.requestConsent('audioProcessing');
      
      expect(granted).toBe(true);
      expect(privacyManager.consentStatus.audioProcessing).toBe(true);
      expect(privacyManager.showConsentDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          activity: 'audioProcessing'
        })
      );
    });

    test('should deny consent when user refuses', async () => {
      privacyManager.showConsentDialog = jest.fn().mockResolvedValue(false);

      const granted = await privacyManager.requestConsent('audioProcessing');
      
      expect(granted).toBe(false);
      expect(privacyManager.consentStatus.audioProcessing).toBe(false);
    });

    test('should check valid consent', () => {
      privacyManager.consentStatus.audioProcessing = true;
      privacyManager.consentStatus.lastUpdated = Date.now();

      expect(privacyManager.hasValidConsent('audioProcessing')).toBe(true);
    });

    test('should reject expired consent', () => {
      privacyManager.consentStatus.audioProcessing = true;
      privacyManager.consentStatus.lastUpdated = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago

      expect(privacyManager.hasValidConsent('audioProcessing')).toBe(false);
    });

    test('should revoke consent', async () => {
      privacyManager.consentStatus.audioProcessing = true;
      privacyManager.cleanupActivityData = jest.fn().mockResolvedValue();

      await privacyManager.revokeConsent('audioProcessing');

      expect(privacyManager.consentStatus.audioProcessing).toBe(false);
      expect(privacyManager.cleanupActivityData).toHaveBeenCalledWith('audioProcessing');
    });
  });

  describe('Audio Stream Management', () => {
    beforeEach(() => {
      privacyManager.consentStatus.audioProcessing = true;
      privacyManager.consentStatus.lastUpdated = Date.now();
    });

    test('should register audio stream with consent', () => {
      const streamId = 'test-stream-1';
      const streamInfo = {
        videoElement: 'VIDEO',
        source: 'test-video.mp4',
        purpose: 'speech_recognition'
      };

      const registered = privacyManager.registerAudioStream(streamId, streamInfo);

      expect(registered).toBe(true);
      expect(privacyManager.activeDataStreams.has(streamId)).toBe(true);
    });

    test('should reject audio stream without consent', () => {
      privacyManager.consentStatus.audioProcessing = false;

      const streamId = 'test-stream-1';
      const streamInfo = { purpose: 'speech_recognition' };

      const registered = privacyManager.registerAudioStream(streamId, streamInfo);

      expect(registered).toBe(false);
      expect(privacyManager.activeDataStreams.has(streamId)).toBe(false);
    });

    test('should process audio data securely', () => {
      const streamId = 'test-stream-1';
      privacyManager.registerAudioStream(streamId, { type: 'audio' });

      const audioData = new Float32Array([0.1, 0.2, 0.3]);
      const result = privacyManager.processAudioDataSecurely(streamId, audioData);

      expect(result).toBeDefined();
      expect(result.streamId).toBe(streamId);
      expect(result.processed).toBe(true);
      expect(result.dataSize).toBe(audioData.length);
    });

    test('should reject processing for invalid stream', () => {
      const audioData = new Float32Array([0.1, 0.2, 0.3]);
      const result = privacyManager.processAudioDataSecurely('invalid-stream', audioData);

      expect(result).toBeNull();
    });

    test('should unregister audio stream', () => {
      const streamId = 'test-stream-1';
      privacyManager.registerAudioStream(streamId, { type: 'audio' });

      privacyManager.unregisterDataStream(streamId);

      expect(privacyManager.activeDataStreams.has(streamId)).toBe(false);
    });
  });

  describe('Translation Request Security', () => {
    beforeEach(() => {
      privacyManager.consentStatus.dataTransmission = true;
      privacyManager.consentStatus.lastUpdated = Date.now();
    });

    test('should create secure translation request', () => {
      const text = 'Hello world';
      const options = {
        sourceLanguage: 'en',
        targetLanguage: 'es'
      };

      const request = privacyManager.createSecureTranslationRequest(text, options);

      expect(request).toBeDefined();
      expect(request.text).toBe(text);
      expect(request.sourceLanguage).toBe('en');
      expect(request.targetLanguage).toBe('es');
      expect(request.requestId).toMatch(/^anon_/);
      expect(request.privacy).toBeDefined();
    });

    test('should reject translation request without consent', () => {
      privacyManager.consentStatus.dataTransmission = false;

      const request = privacyManager.createSecureTranslationRequest('Hello world');

      expect(request).toBeNull();
    });

    test('should sanitize text input', () => {
      const text = 'Contact me at john@example.com or call 555-123-4567';
      const sanitized = privacyManager.sanitizeText(text);

      expect(sanitized).toContain('[EMAIL]');
      expect(sanitized).toContain('[PHONE]');
      expect(sanitized).not.toContain('john@example.com');
      expect(sanitized).not.toContain('555-123-4567');
    });

    test('should anonymize text', () => {
      const text = 'John Smith lives at 123 Main Street';
      const anonymized = privacyManager.anonymizeText(text);

      expect(anonymized).toContain('[NAME]');
      expect(anonymized).toContain('[ADDRESS]');
      expect(anonymized).not.toContain('John Smith');
      expect(anonymized).not.toContain('123 Main Street');
    });

    test('should generate anonymous request ID', () => {
      const id1 = privacyManager.generateAnonymousId();
      const id2 = privacyManager.generateAnonymousId();

      expect(id1).toMatch(/^anon_/);
      expect(id2).toMatch(/^anon_/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('Data Cleanup', () => {
    test('should schedule data cleanup', (done) => {
      const dataId = 'test-data-1';
      const retentionTime = 100; // 100ms

      privacyManager.scheduleDataCleanup(dataId, retentionTime);
      privacyManager.activeDataStreams.set(dataId, { test: true });

      setTimeout(() => {
        expect(privacyManager.activeDataStreams.has(dataId)).toBe(false);
        done();
      }, 150);
    });

    test('should perform immediate cleanup for zero retention', () => {
      const dataId = 'test-data-1';
      privacyManager.activeDataStreams.set(dataId, { test: true });

      privacyManager.scheduleDataCleanup(dataId, 0);

      expect(privacyManager.activeDataStreams.has(dataId)).toBe(false);
    });

    test('should clean up activity data', async () => {
      const streamId1 = 'audio-stream-1';
      const streamId2 = 'translation-stream-1';
      
      privacyManager.activeDataStreams.set(streamId1, { type: 'audio' });
      privacyManager.activeDataStreams.set(streamId2, { type: 'translation' });

      await privacyManager.cleanupActivityData('audioProcessing');

      expect(privacyManager.activeDataStreams.has(streamId1)).toBe(false);
      expect(privacyManager.activeDataStreams.has(streamId2)).toBe(true);
    });

    test('should perform periodic cleanup', () => {
      const now = Date.now();
      const expiredStreamId = 'expired-stream';
      const activeStreamId = 'active-stream';

      // Add expired stream
      privacyManager.activeDataStreams.set(expiredStreamId, {
        startTime: now - 10000, // 10 seconds ago
        dataRetention: 5000 // 5 second retention
      });

      // Add active stream
      privacyManager.activeDataStreams.set(activeStreamId, {
        startTime: now - 1000, // 1 second ago
        dataRetention: 5000 // 5 second retention
      });

      privacyManager.performPeriodicCleanup();

      expect(privacyManager.activeDataStreams.has(expiredStreamId)).toBe(false);
      expect(privacyManager.activeDataStreams.has(activeStreamId)).toBe(true);
    });

    test('should perform complete cleanup', async () => {
      // Add some test data
      privacyManager.activeDataStreams.set('stream1', { test: true });
      privacyManager.activeDataStreams.set('stream2', { test: true });
      privacyManager.dataCleanupTimers.set('timer1', setTimeout(() => {}, 1000));

      // Mock chrome.storage.local.remove to resolve immediately
      chrome.storage.local.remove.mockImplementation((keys, callback) => {
        callback();
      });

      await privacyManager.performCompleteCleanup();

      expect(privacyManager.activeDataStreams.size).toBe(0);
      expect(privacyManager.dataCleanupTimers.size).toBe(0);
    });
  });

  describe('Privacy Status', () => {
    test('should return privacy status', () => {
      const status = privacyManager.getPrivacyStatus();

      expect(status).toBeDefined();
      expect(status.consentStatus).toBeDefined();
      expect(status.activeStreams).toBe(0);
      expect(status.secureProcessing).toBeDefined();
      expect(status.dataRetentionPolicy).toBeDefined();
    });
  });

  describe('Consent Listeners', () => {
    test('should add and notify consent listeners', () => {
      const listener = jest.fn();
      privacyManager.addConsentListener(listener);

      privacyManager.notifyConsentChange('audioProcessing', true);

      expect(listener).toHaveBeenCalledWith('audioProcessing', true);
    });

    test('should remove consent listeners', () => {
      const listener = jest.fn();
      privacyManager.addConsentListener(listener);
      privacyManager.removeConsentListener(listener);

      privacyManager.notifyConsentChange('audioProcessing', true);

      expect(listener).not.toHaveBeenCalled();
    });

    test('should handle listener errors gracefully', () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();

      privacyManager.addConsentListener(errorListener);
      privacyManager.addConsentListener(goodListener);

      // Should not throw
      expect(() => {
        privacyManager.notifyConsentChange('audioProcessing', true);
      }).not.toThrow();

      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('Storage Integration', () => {
    test('should save consent status to storage', async () => {
      privacyManager.consentStatus.audioProcessing = true;

      await privacyManager.saveConsentStatus();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        privacyConsent: privacyManager.consentStatus
      }, expect.any(Function));
    });

    test('should load consent status from storage', async () => {
      const savedConsent = {
        audioProcessing: true,
        dataTransmission: false,
        lastUpdated: Date.now()
      };

      chrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({ privacyConsent: savedConsent });
      });

      const loaded = await privacyManager.loadConsentStatus();

      expect(loaded).toEqual(savedConsent);
    });

    test('should handle storage errors gracefully', async () => {
      chrome.storage.local.set.mockImplementation((data, callback) => {
        chrome.runtime.lastError = { message: 'Storage error' };
        callback();
      });

      await expect(privacyManager.saveConsentStatus()).rejects.toThrow('Storage error');

      // Reset for other tests
      chrome.runtime.lastError = null;
    });
  });
});