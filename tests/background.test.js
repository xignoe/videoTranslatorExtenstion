// Tests for background service worker functionality

describe('Background Service Worker', () => {
  test('should have background script file', () => {
    const fs = require('fs');
    const path = require('path');
    
    const backgroundPath = path.join(__dirname, '../background/background.js');
    expect(fs.existsSync(backgroundPath)).toBe(true);
    
    const content = fs.readFileSync(backgroundPath, 'utf8');
    expect(content).toContain('chrome.runtime.onInstalled');
    expect(content).toContain('chrome.runtime.onMessage');
    expect(content).toContain('chrome.tabs.onActivated');
    expect(content).toContain('chrome.contextMenus.create');
  });

  test('should contain required message handlers', () => {
    const fs = require('fs');
    const path = require('path');
    
    const backgroundPath = path.join(__dirname, '../background/background.js');
    const content = fs.readFileSync(backgroundPath, 'utf8');
    
    expect(content).toContain('statusUpdate');
    expect(content).toContain('getSettings');
    expect(content).toContain('updateSettings');
    expect(content).toContain('translateText');
    expect(content).toContain('reportError');
  });

  test('should contain extension lifecycle management', () => {
    const fs = require('fs');
    const path = require('path');
    
    const backgroundPath = path.join(__dirname, '../background/background.js');
    const content = fs.readFileSync(backgroundPath, 'utf8');
    
    expect(content).toContain('settingsManager.initializeSettings');
    expect(content).toContain('settingsManager.migrateSettings');
    expect(content).toContain('extensionState');
    expect(content).toContain('updateIconForTab');
  });
});