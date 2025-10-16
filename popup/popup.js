// Popup script for Video Translator extension
document.addEventListener('DOMContentLoaded', function() {
  const sourceLanguageSelect = document.getElementById('sourceLanguage');
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const extensionEnabledToggle = document.getElementById('extensionEnabled');
  const requestMicrophoneButton = document.getElementById('requestMicrophone');
  const openOptionsButton = document.getElementById('openOptions');
  const refreshStatusButton = document.getElementById('refreshStatus');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const infoSection = document.getElementById('infoSection');
  const videoCountElement = document.getElementById('videoCount');
  const currentDomainElement = document.getElementById('currentDomain');

  // Load saved settings
  chrome.storage.sync.get(['sourceLanguage', 'targetLanguage', 'extensionEnabled'], function(result) {
    if (result.sourceLanguage) {
      sourceLanguageSelect.value = result.sourceLanguage;
    }
    if (result.targetLanguage) {
      targetLanguageSelect.value = result.targetLanguage;
    }
    if (result.extensionEnabled !== undefined) {
      extensionEnabledToggle.checked = result.extensionEnabled;
    }
    
    // Initial status update after loading settings
    updateStatusIndicator();
    checkCurrentTabStatus();
  });

  // Save source language when changed
  sourceLanguageSelect.addEventListener('change', function() {
    const newLanguage = sourceLanguageSelect.value;
    chrome.storage.sync.set({
      sourceLanguage: newLanguage
    });
    
    // Notify content scripts of language change
    notifyContentScripts('languageChanged', { 
      sourceLanguage: newLanguage,
      targetLanguage: targetLanguageSelect.value
    });
  });

  // Save target language when changed
  targetLanguageSelect.addEventListener('change', function() {
    const newLanguage = targetLanguageSelect.value;
    chrome.storage.sync.set({
      targetLanguage: newLanguage
    });
    
    // Notify content scripts of language change
    notifyContentScripts('languageChanged', { 
      sourceLanguage: sourceLanguageSelect.value,
      targetLanguage: newLanguage
    });
  });

  // Save extension enabled state when toggled
  extensionEnabledToggle.addEventListener('change', function() {
    const isEnabled = extensionEnabledToggle.checked;
    chrome.storage.sync.set({
      extensionEnabled: isEnabled
    });
    
    // Update status indicator
    updateStatusIndicator();
    
    // Notify content scripts of state change
    notifyContentScripts('extensionToggled', { enabled: isEnabled });
  });

  // Request microphone permission
  requestMicrophoneButton.addEventListener('click', function() {
    // Send message to content script to request microphone permission
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'requestMicrophonePermission'
        }, function(response) {
          if (response && response.success) {
            requestMicrophoneButton.textContent = '✅ Microphone Enabled';
            requestMicrophoneButton.disabled = true;
            statusText.textContent = 'Microphone access granted';
          } else {
            statusText.textContent = 'Microphone access denied';
          }
        });
      }
    });
  });

  // Open options page
  openOptionsButton.addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });
  
  // Refresh status manually
  refreshStatusButton.addEventListener('click', function() {
    refreshStatusButton.style.transform = 'rotate(360deg)';
    setTimeout(() => {
      refreshStatusButton.style.transform = 'rotate(0deg)';
    }, 300);
    
    updateStatusIndicator();
    updatePageInfo();
  });

  // Update status indicator based on extension state and current activity
  function updateStatusIndicator() {
    if (!extensionEnabledToggle.checked) {
      statusDot.className = 'status-dot inactive';
      statusText.textContent = 'Disabled';
      return;
    }
    
    // Check if we have video activity on current tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'getStatus'}, function(response) {
          if (chrome.runtime.lastError) {
            // Content script not loaded or no response
            statusDot.className = 'status-dot inactive';
            statusText.textContent = 'Ready';
            return;
          }
          
          if (response && response.status) {
            updateStatusFromResponse(response.status);
          } else {
            statusDot.className = 'status-dot';
            statusText.textContent = 'Ready';
          }
        });
      }
    });
  }
  
  // Update status based on content script response
  function updateStatusFromResponse(status) {
    switch (status.state) {
      case 'processing':
        statusDot.className = 'status-dot active';
        statusText.textContent = 'Translating...';
        infoSection.style.display = 'block';
        break;
      case 'error':
        statusDot.className = 'status-dot error';
        statusText.textContent = status.message || 'Error occurred';
        infoSection.style.display = 'block';
        break;
      case 'no-video':
        statusDot.className = 'status-dot inactive';
        statusText.textContent = 'No video detected';
        infoSection.style.display = 'none';
        break;
      case 'video-detected':
        statusDot.className = 'status-dot';
        statusText.textContent = `Video found (${status.videoCount || 1})`;
        infoSection.style.display = 'block';
        videoCountElement.textContent = status.videoCount || 1;
        break;
      default:
        statusDot.className = 'status-dot';
        statusText.textContent = 'Ready';
        infoSection.style.display = 'none';
    }
    
    // Update video count if available
    if (status.videoCount !== undefined) {
      videoCountElement.textContent = status.videoCount;
    }
  }
  
  // Check current tab status
  function checkCurrentTabStatus() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'getStatus'}, function(response) {
          if (!chrome.runtime.lastError && response && response.status) {
            updateStatusFromResponse(response.status);
          }
        });
      }
    });
  }
  
  // Notify content scripts of changes
  function notifyContentScripts(action, data) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: action,
          data: data
        });
      }
    });
  }
  
  // Listen for status updates from content scripts
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'statusUpdate') {
      updateStatusFromResponse(request.status);
    }
  });
  
  // Update page information
  function updatePageInfo() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        try {
          const url = new URL(tabs[0].url);
          currentDomainElement.textContent = url.hostname;
        } catch (e) {
          currentDomainElement.textContent = 'Unknown';
        }
      }
    });
  }
  
  // Refresh status when popup is opened
  updateStatusIndicator();
  updatePageInfo();
});