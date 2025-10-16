// Background service worker for Video Translator extension

// Import SettingsManager
importScripts('settingsManager.js');

// Extension state management
const extensionState = {
  tabStates: new Map(), // Track state per tab
  activeTranslations: new Map(), // Track active translation requests
  apiRequestQueue: [], // Queue for API requests
  isProcessingQueue: false
};

// Initialize settings manager
const settingsManager = new SettingsManager();

// Extension lifecycle management
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Video Translator extension installed:', details.reason);
  
  try {
    // Initialize default settings on install
    if (details.reason === 'install') {
      await settingsManager.initializeSettings();
      console.log('Extension installed and settings initialized');
    }
    
    // Handle extension updates
    if (details.reason === 'update') {
      console.log('Extension updated from version:', details.previousVersion);
      await settingsManager.migrateSettings(details.previousVersion);
      console.log('Settings migrated successfully');
    }
  } catch (error) {
    console.error('Error during extension lifecycle management:', error);
  }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Video Translator extension started');
  // Clear any stale state
  extensionState.tabStates.clear();
  extensionState.activeTranslations.clear();
  extensionState.apiRequestQueue.length = 0;
});

// Tab lifecycle management
chrome.tabs.onActivated.addListener((activeInfo) => {
  updateIconForTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    // Clear tab state when page starts loading
    extensionState.tabStates.delete(tabId);
    extensionState.activeTranslations.delete(tabId);
  }
  
  if (changeInfo.status === 'complete') {
    updateIconForTab(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  // Clean up tab state when tab is closed
  extensionState.tabStates.delete(tabId);
  extensionState.activeTranslations.delete(tabId);
  console.log('Cleaned up state for closed tab:', tabId);
});

// Update extension icon based on tab status
async function updateIconForTab(tabId) {
  try {
    const isEnabled = await settingsManager.isExtensionEnabled();
    
    if (!isEnabled) {
      setIconState(tabId, 'disabled');
      return;
    }
    
    // Get current tab state
    const tabState = extensionState.tabStates.get(tabId);
    if (tabState) {
      updateIconFromStatus(tabId, tabState);
      return;
    }
    
    // Query content script for current status
    chrome.tabs.sendMessage(tabId, {action: 'getStatus'}, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not available or tab not ready
        setIconState(tabId, 'inactive');
        return;
      }
      
      if (response && response.status) {
        extensionState.tabStates.set(tabId, response.status);
        updateIconFromStatus(tabId, response.status);
      } else {
        setIconState(tabId, 'inactive');
      }
    });
  } catch (error) {
    console.error('Error updating icon for tab:', tabId, error);
    setIconState(tabId, 'inactive');
  }
}

// Set icon state with predefined configurations
function setIconState(tabId, state) {
  const iconConfigs = {
    disabled: {
      path: {
        "16": "icons/icon16-disabled.png",
        "32": "icons/icon32-disabled.png", 
        "48": "icons/icon48-disabled.png",
        "128": "icons/icon128-disabled.png"
      },
      badge: { text: '', color: '#666666' }
    },
    inactive: {
      path: {
        "16": "icons/icon16.png",
        "32": "icons/icon32.png",
        "48": "icons/icon48.png", 
        "128": "icons/icon128.png"
      },
      badge: { text: '', color: '#666666' }
    },
    active: {
      path: {
        "16": "icons/icon16-active.png",
        "32": "icons/icon32-active.png",
        "48": "icons/icon48-active.png",
        "128": "icons/icon128-active.png"
      },
      badge: { text: '', color: '#28a745' }
    }
  };
  
  const config = iconConfigs[state] || iconConfigs.inactive;
  
  chrome.action.setIcon({ tabId: tabId, path: config.path });
  chrome.action.setBadgeText({ tabId: tabId, text: config.badge.text });
  if (config.badge.text) {
    chrome.action.setBadgeBackgroundColor({ color: config.badge.color });
  }
}

// Update icon based on detailed status response
function updateIconFromStatus(tabId, status) {
  let badgeText = '';
  let badgeColor = '#666666';
  let iconSuffix = '';
  
  switch (status.state) {
    case 'processing':
      badgeText = '●';
      badgeColor = '#007bff';
      iconSuffix = '-active';
      break;
    case 'translating':
      badgeText = '⟳';
      badgeColor = '#ffc107';
      iconSuffix = '-active';
      break;
    case 'error':
      badgeText = '!';
      badgeColor = '#dc3545';
      iconSuffix = '';
      break;
    case 'video-detected':
      iconSuffix = '-active';
      if (status.videoCount && status.videoCount > 1) {
        badgeText = status.videoCount.toString();
        badgeColor = '#28a745';
      }
      break;
    case 'no-audio':
      badgeText = '○';
      badgeColor = '#6c757d';
      iconSuffix = '';
      break;
    default:
      badgeText = '';
      iconSuffix = '';
  }
  
  const iconPath = {
    "16": `icons/icon16${iconSuffix}.png`,
    "32": `icons/icon32${iconSuffix}.png`,
    "48": `icons/icon48${iconSuffix}.png`,
    "128": `icons/icon128${iconSuffix}.png`
  };
  
  chrome.action.setIcon({ tabId: tabId, path: iconPath });
  chrome.action.setBadgeText({ tabId: tabId, text: badgeText });
  if (badgeText) {
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });
  }
}

// Comprehensive message handling between content scripts and background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  
  switch (request.action) {
    case 'statusUpdate':
      handleStatusUpdate(request, tabId, sendResponse);
      break;
      
    case 'getSettings':
      handleGetSettings(request, sendResponse);
      break;
      
    case 'updateSettings':
      handleUpdateSettings(request, sendResponse);
      break;
      
    case 'translateText':
      handleTranslateText(request, tabId, sendResponse);
      return true; // Keep message channel open for async response
      
    case 'getTabState':
      handleGetTabState(tabId, sendResponse);
      break;
      
    case 'reportError':
      handleErrorReport(request, tabId);
      break;
      
    case 'resetSettings':
      handleResetSettings(sendResponse);
      return true; // Keep message channel open for async response
      
    case 'exportSettings':
      handleExportSettings(sendResponse);
      return true; // Keep message channel open for async response
      
    case 'importSettings':
      handleImportSettings(request, sendResponse);
      return true; // Keep message channel open for async response
      
    case 'getStorageInfo':
      handleGetStorageInfo(sendResponse);
      return true; // Keep message channel open for async response
      
    case 'getErrorLog':
      handleGetErrorLog(request, sendResponse);
      break;
      
    case 'clearErrorLog':
      handleClearErrorLog(sendResponse);
      break;
      
    default:
      console.warn('Unknown message action:', request.action);
      sendResponse({ error: 'Unknown action' });
  }
  
  return false; // Close message channel unless explicitly kept open
});

// Handle status updates from content scripts
function handleStatusUpdate(request, tabId, sendResponse) {
  if (!tabId) {
    sendResponse({ error: 'No tab ID available' });
    return;
  }
  
  // Update tab state
  extensionState.tabStates.set(tabId, request.status);
  
  // Update icon
  updateIconFromStatus(tabId, request.status);
  
  // Forward status to popup if open
  chrome.runtime.sendMessage({
    action: 'statusUpdate',
    tabId: tabId,
    status: request.status
  }).catch(() => {
    // Popup not open, ignore error
  });
  
  sendResponse({ success: true });
}

// Handle settings requests
async function handleGetSettings(request, sendResponse) {
  try {
    const keys = request.keys || null;
    const settings = await settingsManager.getSettings(keys);
    sendResponse({ settings: settings });
  } catch (error) {
    console.error('Error getting settings:', error);
    sendResponse({ error: error.message });
  }
}

// Handle settings updates
async function handleUpdateSettings(request, sendResponse) {
  try {
    await settingsManager.updateSettings(request.settings);
    sendResponse({ success: true });
    
    // Notify all tabs about settings change
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'settingsChanged',
          settings: request.settings
        }).catch(() => {
          // Tab may not have content script, ignore error
        });
      });
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    sendResponse({ error: error.message });
  }
}

// Handle translation requests (placeholder for future implementation)
function handleTranslateText(request, tabId, sendResponse) {
  // This will be implemented when translation service is integrated
  console.log('Translation request received:', request);
  
  // For now, return a placeholder response
  setTimeout(() => {
    sendResponse({
      success: true,
      translatedText: `[Translated: ${request.text}]`,
      sourceLanguage: request.sourceLanguage || 'auto',
      targetLanguage: request.targetLanguage
    });
  }, 100);
}

// Handle tab state requests
function handleGetTabState(tabId, sendResponse) {
  const tabState = extensionState.tabStates.get(tabId);
  sendResponse({ 
    tabState: tabState || { state: 'inactive' },
    hasActiveTranslations: extensionState.activeTranslations.has(tabId)
  });
}

// Handle error reports from content scripts
function handleErrorReport(request, tabId) {
  const errorInfo = request.error;
  console.error('Error reported from tab', tabId, ':', errorInfo);
  
  // Store error in extension state for debugging
  if (!extensionState.errorLog) {
    extensionState.errorLog = [];
  }
  
  const logEntry = {
    ...errorInfo,
    tabId,
    timestamp: Date.now(),
    url: request.url || 'unknown'
  };
  
  extensionState.errorLog.unshift(logEntry);
  
  // Keep only last 50 errors
  if (extensionState.errorLog.length > 50) {
    extensionState.errorLog = extensionState.errorLog.slice(0, 50);
  }
  
  // Update tab state to show error
  const currentState = extensionState.tabStates.get(tabId) || {};
  const errorState = {
    ...currentState,
    state: 'error',
    error: errorInfo,
    timestamp: Date.now()
  };
  
  extensionState.tabStates.set(tabId, errorState);
  updateIconFromStatus(tabId, errorState);
  
  // Forward error to popup if open
  chrome.runtime.sendMessage({
    action: 'errorReport',
    tabId: tabId,
    error: errorInfo
  }).catch(() => {
    // Popup not open, ignore error
  });
}

// Handle settings reset
async function handleResetSettings(sendResponse) {
  try {
    const resetSettings = await settingsManager.resetSettings();
    sendResponse({ success: true, settings: resetSettings });
    
    // Notify all tabs about settings reset
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'settingsChanged',
          settings: resetSettings
        }).catch(() => {
          // Tab may not have content script, ignore error
        });
      });
    });
  } catch (error) {
    console.error('Error resetting settings:', error);
    sendResponse({ error: error.message });
  }
}

// Handle settings export
async function handleExportSettings(sendResponse) {
  try {
    const exportData = await settingsManager.exportSettings();
    sendResponse({ success: true, data: exportData });
  } catch (error) {
    console.error('Error exporting settings:', error);
    sendResponse({ error: error.message });
  }
}

// Handle settings import
async function handleImportSettings(request, sendResponse) {
  try {
    const importedSettings = await settingsManager.importSettings(request.data);
    sendResponse({ success: true, settings: importedSettings });
    
    // Notify all tabs about settings import
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'settingsChanged',
          settings: importedSettings
        }).catch(() => {
          // Tab may not have content script, ignore error
        });
      });
    });
  } catch (error) {
    console.error('Error importing settings:', error);
    sendResponse({ error: error.message });
  }
}

// Handle storage info request
async function handleGetStorageInfo(sendResponse) {
  try {
    const storageInfo = await settingsManager.getStorageInfo();
    sendResponse({ success: true, storageInfo: storageInfo });
  } catch (error) {
    console.error('Error getting storage info:', error);
    sendResponse({ error: error.message });
  }
}

// Handle error log requests
function handleGetErrorLog(request, sendResponse) {
  const limit = request.limit || 20;
  const errorLog = extensionState.errorLog || [];
  
  sendResponse({ 
    success: true, 
    errors: errorLog.slice(0, limit),
    totalCount: errorLog.length
  });
}

// Handle error log clearing
function handleClearErrorLog(sendResponse) {
  extensionState.errorLog = [];
  sendResponse({ success: true });
}

// API coordination utilities
function queueApiRequest(request) {
  extensionState.apiRequestQueue.push(request);
  processApiQueue();
}

function processApiQueue() {
  if (extensionState.isProcessingQueue || extensionState.apiRequestQueue.length === 0) {
    return;
  }
  
  extensionState.isProcessingQueue = true;
  
  // Process requests with rate limiting
  const processNext = () => {
    if (extensionState.apiRequestQueue.length === 0) {
      extensionState.isProcessingQueue = false;
      return;
    }
    
    const request = extensionState.apiRequestQueue.shift();
    // Process request here (implementation depends on specific API)
    
    // Rate limiting delay
    setTimeout(processNext, 100);
  };
  
  processNext();
}

// Extension context menu (for future enhancement)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'toggleTranslation',
    title: 'Toggle Video Translation',
    contexts: ['video']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'toggleTranslation') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'toggleTranslation'
    });
  }
});