// Settings Manager for Video Translator extension
// Handles user preferences and configuration persistence

class SettingsManager {
  constructor() {
    this.defaultSettings = {
      extensionEnabled: true,
      targetLanguage: 'en',
      sourceLanguage: 'auto',
      subtitleStyle: {
        fontSize: 16,
        fontColor: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        position: 'bottom'
      },
      autoDetectLanguage: true,
      translationProvider: 'google',
      showConfidenceIndicator: true,
      maxSubtitleLength: 100,
      translationDelay: 500,
      // Privacy and security settings
      privacySettings: {
        audioProcessingConsent: false,
        dataTransmissionConsent: false,
        storageAccessConsent: false,
        localProcessingOnly: false,
        encryptTransmissions: true,
        anonymizeRequests: true,
        minimizeDataCollection: true
      }
    };
    
    this.settingsCache = new Map();
    this.changeListeners = new Set();
    this.dataProtection = null;
    this.initializeDataProtection();
  }

  /**
   * Initialize data protection for settings validation
   */
  async initializeDataProtection() {
    try {
      if (typeof DataProtection !== 'undefined') {
        this.dataProtection = new DataProtection();
      }
    } catch (error) {
      console.error('Failed to initialize data protection for settings:', error);
    }
  }

  // Initialize settings with defaults
  async initializeSettings() {
    try {
      const existingSettings = await this.getAllSettings();
      const mergedSettings = { ...this.defaultSettings, ...existingSettings };
      
      // Save merged settings to ensure all defaults are present
      await this.saveSettings(mergedSettings);
      
      // Update cache
      this.settingsCache.clear();
      Object.entries(mergedSettings).forEach(([key, value]) => {
        this.settingsCache.set(key, value);
      });
      
      console.log('Settings initialized successfully');
      return mergedSettings;
    } catch (error) {
      console.error('Failed to initialize settings:', error);
      throw error;
    }
  }

  // Get all settings from storage
  async getAllSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(null, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  // Get specific settings by keys
  async getSettings(keys = null) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          // Update cache for retrieved settings
          if (keys === null) {
            // All settings retrieved
            this.settingsCache.clear();
            Object.entries(result).forEach(([key, value]) => {
              this.settingsCache.set(key, value);
            });
          } else if (Array.isArray(keys)) {
            // Specific keys retrieved
            keys.forEach(key => {
              if (result.hasOwnProperty(key)) {
                this.settingsCache.set(key, result[key]);
              }
            });
          } else if (typeof keys === 'string') {
            // Single key retrieved
            if (result.hasOwnProperty(keys)) {
              this.settingsCache.set(keys, result[keys]);
            }
          }
          
          resolve(result);
        }
      });
    });
  }

  // Get a single setting value with fallback to default
  async getSetting(key) {
    try {
      // Check cache first
      if (this.settingsCache.has(key)) {
        return this.settingsCache.get(key);
      }
      
      const result = await this.getSettings([key]);
      return result[key] !== undefined ? result[key] : this.defaultSettings[key];
    } catch (error) {
      console.warn(`Failed to get setting ${key}, using default:`, error);
      return this.defaultSettings[key];
    }
  }

  // Save settings to storage
  async saveSettings(settings) {
    try {
      // Validate settings before saving
      if (this.dataProtection) {
        const validation = this.dataProtection.validateSettings(settings);
        if (!validation.isValid) {
          throw new Error(`Settings validation failed: ${validation.errors.join(', ')}`);
        }
        
        // Use sanitized settings
        settings = validation.sanitizedSettings;
        
        // Log warnings if any
        if (validation.warnings.length > 0) {
          console.warn('Settings validation warnings:', validation.warnings);
        }
      }

      return new Promise((resolve, reject) => {
        chrome.storage.sync.set(settings, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            // Update cache
            Object.entries(settings).forEach(([key, value]) => {
              this.settingsCache.set(key, value);
            });
            
            // Notify listeners
            this.notifySettingsChanged(settings);
            
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  // Save a single setting
  async saveSetting(key, value) {
    return this.saveSettings({ [key]: value });
  }

  // Update settings (merge with existing)
  async updateSettings(newSettings) {
    try {
      const currentSettings = await this.getAllSettings();
      const mergedSettings = { ...currentSettings, ...newSettings };
      await this.saveSettings(mergedSettings);
      return mergedSettings;
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  }

  // Reset settings to defaults
  async resetSettings() {
    try {
      await this.clearAllSettings();
      await this.saveSettings(this.defaultSettings);
      console.log('Settings reset to defaults');
      return this.defaultSettings;
    } catch (error) {
      console.error('Failed to reset settings:', error);
      throw error;
    }
  }

  // Clear all settings
  async clearAllSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.clear(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          this.settingsCache.clear();
          resolve();
        }
      });
    });
  }

  // Export settings for backup
  async exportSettings() {
    try {
      const settings = await this.getAllSettings();
      const exportData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        settings: settings
      };
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Failed to export settings:', error);
      throw error;
    }
  }

  // Import settings from backup
  async importSettings(jsonData) {
    try {
      const importData = JSON.parse(jsonData);
      
      if (!importData.settings) {
        throw new Error('Invalid settings format');
      }
      
      // Validate settings against defaults
      const validatedSettings = this.validateSettings(importData.settings);
      
      await this.saveSettings(validatedSettings);
      console.log('Settings imported successfully');
      return validatedSettings;
    } catch (error) {
      console.error('Failed to import settings:', error);
      throw error;
    }
  }

  // Validate settings against schema
  validateSettings(settings) {
    const validated = {};
    
    // Validate each setting against defaults
    Object.keys(this.defaultSettings).forEach(key => {
      if (settings.hasOwnProperty(key)) {
        const defaultValue = this.defaultSettings[key];
        const providedValue = settings[key];
        
        // Type validation
        if (typeof providedValue === typeof defaultValue) {
          if (typeof defaultValue === 'object' && defaultValue !== null) {
            // For objects, merge with defaults
            validated[key] = { ...defaultValue, ...providedValue };
          } else {
            validated[key] = providedValue;
          }
        } else {
          console.warn(`Invalid type for setting ${key}, using default`);
          validated[key] = defaultValue;
        }
      } else {
        validated[key] = this.defaultSettings[key];
      }
    });
    
    return validated;
  }

  // Add settings change listener
  addChangeListener(listener) {
    this.changeListeners.add(listener);
  }

  // Remove settings change listener
  removeChangeListener(listener) {
    this.changeListeners.delete(listener);
  }

  // Notify all listeners of settings changes
  notifySettingsChanged(changedSettings) {
    this.changeListeners.forEach(listener => {
      try {
        listener(changedSettings);
      } catch (error) {
        console.error('Error in settings change listener:', error);
      }
    });
  }

  // Get storage usage information
  async getStorageInfo() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.getBytesInUse(null, (bytesInUse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve({
            bytesInUse: bytesInUse,
            maxBytes: chrome.storage.sync.QUOTA_BYTES,
            percentageUsed: (bytesInUse / chrome.storage.sync.QUOTA_BYTES) * 100
          });
        }
      });
    });
  }

  // Migrate settings from older versions
  async migrateSettings(fromVersion) {
    try {
      const currentSettings = await this.getAllSettings();
      let migratedSettings = { ...currentSettings };
      let needsMigration = false;
      
      // Version-specific migrations
      if (this.compareVersions(fromVersion, '1.0.0') < 0) {
        // Migration from pre-1.0.0
        if (!migratedSettings.subtitleStyle) {
          migratedSettings.subtitleStyle = this.defaultSettings.subtitleStyle;
          needsMigration = true;
        }
        
        if (!migratedSettings.autoDetectLanguage) {
          migratedSettings.autoDetectLanguage = this.defaultSettings.autoDetectLanguage;
          needsMigration = true;
        }
      }
      
      // Add any new default settings that don't exist
      Object.keys(this.defaultSettings).forEach(key => {
        if (!migratedSettings.hasOwnProperty(key)) {
          migratedSettings[key] = this.defaultSettings[key];
          needsMigration = true;
        }
      });
      
      if (needsMigration) {
        await this.saveSettings(migratedSettings);
        console.log(`Settings migrated from version ${fromVersion}`);
      }
      
      return migratedSettings;
    } catch (error) {
      console.error('Failed to migrate settings:', error);
      throw error;
    }
  }

  // Compare version strings
  compareVersions(version1, version2) {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;
      
      if (v1part < v2part) return -1;
      if (v1part > v2part) return 1;
    }
    
    return 0;
  }

  // Get cached setting (synchronous)
  getCachedSetting(key) {
    return this.settingsCache.get(key) || this.defaultSettings[key];
  }

  // Check if extension is enabled (commonly used)
  async isExtensionEnabled() {
    return await this.getSetting('extensionEnabled');
  }

  // Get subtitle style settings
  async getSubtitleStyle() {
    return await this.getSetting('subtitleStyle');
  }

  // Get language settings
  async getLanguageSettings() {
    const [targetLanguage, sourceLanguage, autoDetect] = await Promise.all([
      this.getSetting('targetLanguage'),
      this.getSetting('sourceLanguage'),
      this.getSetting('autoDetectLanguage')
    ]);
    
    return {
      targetLanguage,
      sourceLanguage,
      autoDetectLanguage: autoDetect
    };
  }

  // Get privacy settings
  async getPrivacySettings() {
    return await this.getSetting('privacySettings');
  }

  // Update privacy settings
  async updatePrivacySettings(newPrivacySettings) {
    const currentSettings = await this.getAllSettings();
    const updatedSettings = {
      ...currentSettings,
      privacySettings: {
        ...this.defaultSettings.privacySettings,
        ...currentSettings.privacySettings,
        ...newPrivacySettings
      }
    };
    
    await this.saveSettings(updatedSettings);
    return updatedSettings.privacySettings;
  }

  // Check if specific privacy consent is granted
  async hasPrivacyConsent(consentType) {
    const privacySettings = await this.getPrivacySettings();
    return privacySettings[`${consentType}Consent`] === true;
  }

  // Grant privacy consent
  async grantPrivacyConsent(consentType) {
    const updates = {};
    updates[`${consentType}Consent`] = true;
    return await this.updatePrivacySettings(updates);
  }

  // Revoke privacy consent
  async revokePrivacyConsent(consentType) {
    const updates = {};
    updates[`${consentType}Consent`] = false;
    return await this.updatePrivacySettings(updates);
  }
}

// Export for use in background script and tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SettingsManager;
} else {
  // Browser environment
  window.SettingsManager = SettingsManager;
}