// Tests for SettingsManager class

// Mock Chrome APIs
global.chrome = {
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn(),
      getBytesInUse: jest.fn(),
      QUOTA_BYTES: 102400 // 100KB
    }
  },
  runtime: {
    lastError: null
  }
};

// Mock console methods
global.console = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const SettingsManager = require('../background/settingsManager.js');

describe('SettingsManager', () => {
  let settingsManager;

  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
    settingsManager = new SettingsManager();
    
    // Default mock implementations
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback({});
    });
    chrome.storage.sync.set.mockImplementation((settings, callback) => {
      callback();
    });
    chrome.storage.sync.clear.mockImplementation((callback) => {
      callback();
    });
    chrome.storage.sync.getBytesInUse.mockImplementation((keys, callback) => {
      callback(1024);
    });
  });

  test('should initialize with default settings', () => {
    expect(settingsManager.defaultSettings).toBeDefined();
    expect(settingsManager.defaultSettings.extensionEnabled).toBe(true);
    expect(settingsManager.defaultSettings.targetLanguage).toBe('en');
    expect(settingsManager.defaultSettings.subtitleStyle).toBeDefined();
  });

  test('should initialize settings with defaults', async () => {
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback({ extensionEnabled: false }); // Partial existing settings
    });

    const result = await settingsManager.initializeSettings();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({
        extensionEnabled: false, // Existing value preserved
        targetLanguage: 'en', // Default value added
        subtitleStyle: expect.any(Object)
      }),
      expect.any(Function)
    );
    expect(result).toBeDefined();
  });

  test('should get all settings', async () => {
    const mockSettings = { extensionEnabled: true, targetLanguage: 'es' };
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback(mockSettings);
    });

    const result = await settingsManager.getAllSettings();

    expect(chrome.storage.sync.get).toHaveBeenCalledWith(null, expect.any(Function));
    expect(result).toEqual(mockSettings);
  });

  test('should get specific settings by keys', async () => {
    const mockSettings = { extensionEnabled: true };
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback(mockSettings);
    });

    const result = await settingsManager.getSettings(['extensionEnabled']);

    expect(chrome.storage.sync.get).toHaveBeenCalledWith(['extensionEnabled'], expect.any(Function));
    expect(result).toEqual(mockSettings);
  });

  test('should get single setting with fallback to default', async () => {
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback({}); // Empty result
    });

    const result = await settingsManager.getSetting('targetLanguage');

    expect(result).toBe('en'); // Default value
  });

  test('should save settings and update cache', async () => {
    const newSettings = { targetLanguage: 'fr' };

    await settingsManager.saveSettings(newSettings);

    expect(chrome.storage.sync.set).toHaveBeenCalledWith(newSettings, expect.any(Function));
    expect(settingsManager.settingsCache.get('targetLanguage')).toBe('fr');
  });

  test('should update settings by merging with existing', async () => {
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback({ extensionEnabled: true, targetLanguage: 'en' });
    });

    const result = await settingsManager.updateSettings({ targetLanguage: 'es' });

    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({
        extensionEnabled: true, // Preserved
        targetLanguage: 'es' // Updated
      }),
      expect.any(Function)
    );
  });

  test('should reset settings to defaults', async () => {
    await settingsManager.resetSettings();

    expect(chrome.storage.sync.clear).toHaveBeenCalled();
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      settingsManager.defaultSettings,
      expect.any(Function)
    );
  });

  test('should export settings as JSON', async () => {
    const mockSettings = { extensionEnabled: true, targetLanguage: 'en' };
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback(mockSettings);
    });

    const result = await settingsManager.exportSettings();

    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.settings).toEqual(mockSettings);
    expect(parsed.version).toBeDefined();
    expect(parsed.timestamp).toBeDefined();
  });

  test('should import settings from JSON', async () => {
    const importData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      settings: { extensionEnabled: false, targetLanguage: 'fr' }
    };

    const result = await settingsManager.importSettings(JSON.stringify(importData));

    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({
        extensionEnabled: false,
        targetLanguage: 'fr'
      }),
      expect.any(Function)
    );
  });

  test('should validate settings against schema', () => {
    const invalidSettings = {
      extensionEnabled: 'not-a-boolean', // Wrong type
      targetLanguage: 'es', // Valid
      unknownSetting: 'value' // Unknown setting
    };

    const result = settingsManager.validateSettings(invalidSettings);

    expect(result.extensionEnabled).toBe(true); // Default value used
    expect(result.targetLanguage).toBe('es'); // Valid value preserved
    expect(result.unknownSetting).toBeUndefined(); // Unknown setting removed
  });

  test('should handle change listeners', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();

    settingsManager.addChangeListener(listener1);
    settingsManager.addChangeListener(listener2);

    settingsManager.notifySettingsChanged({ targetLanguage: 'es' });

    expect(listener1).toHaveBeenCalledWith({ targetLanguage: 'es' });
    expect(listener2).toHaveBeenCalledWith({ targetLanguage: 'es' });

    settingsManager.removeChangeListener(listener1);
    settingsManager.notifySettingsChanged({ extensionEnabled: false });

    expect(listener1).toHaveBeenCalledTimes(1); // Not called again
    expect(listener2).toHaveBeenCalledTimes(2); // Called again
  });

  test('should get storage info', async () => {
    chrome.storage.sync.getBytesInUse.mockImplementation((keys, callback) => {
      callback(5120); // 5KB
    });

    const result = await settingsManager.getStorageInfo();

    expect(result.bytesInUse).toBe(5120);
    expect(result.maxBytes).toBe(102400);
    expect(result.percentageUsed).toBe(5);
  });

  test('should migrate settings from older versions', async () => {
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback({ extensionEnabled: true }); // Missing new settings
    });

    const result = await settingsManager.migrateSettings('0.9.0');

    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({
        extensionEnabled: true, // Preserved
        subtitleStyle: expect.any(Object), // Added
        autoDetectLanguage: true // Added
      }),
      expect.any(Function)
    );
  });

  test('should compare version strings correctly', () => {
    expect(settingsManager.compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(settingsManager.compareVersions('1.0.1', '1.0.0')).toBe(1);
    expect(settingsManager.compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(settingsManager.compareVersions('2.0.0', '1.9.9')).toBe(1);
  });

  test('should handle Chrome storage errors', async () => {
    chrome.runtime.lastError = { message: 'Storage quota exceeded' };
    chrome.storage.sync.set.mockImplementation((settings, callback) => {
      callback();
    });

    await expect(settingsManager.saveSettings({ test: 'value' }))
      .rejects.toThrow('Storage quota exceeded');
  });

  test('should get cached settings synchronously', () => {
    settingsManager.settingsCache.set('targetLanguage', 'fr');

    const result = settingsManager.getCachedSetting('targetLanguage');
    expect(result).toBe('fr');

    const defaultResult = settingsManager.getCachedSetting('unknownSetting');
    expect(defaultResult).toBeUndefined();
  });

  test('should provide convenience methods', async () => {
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      if (keys.includes('extensionEnabled')) {
        callback({ extensionEnabled: true });
      } else if (keys.includes('subtitleStyle')) {
        callback({ subtitleStyle: { fontSize: 18 } });
      } else {
        callback({
          targetLanguage: 'es',
          sourceLanguage: 'auto',
          autoDetectLanguage: false
        });
      }
    });

    const isEnabled = await settingsManager.isExtensionEnabled();
    expect(isEnabled).toBe(true);

    const subtitleStyle = await settingsManager.getSubtitleStyle();
    expect(subtitleStyle.fontSize).toBe(18);

    const languageSettings = await settingsManager.getLanguageSettings();
    expect(languageSettings.targetLanguage).toBe('es');
    expect(languageSettings.autoDetectLanguage).toBe(false);
  });
});