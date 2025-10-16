// Background service worker for Video Translator extension
// This file will be implemented in later tasks

// Basic extension lifecycle management
chrome.runtime.onInstalled.addListener(() => {
  console.log('Video Translator extension installed');
  
  // Set default settings
  chrome.storage.sync.get(['extensionEnabled'], (result) => {
    if (result.extensionEnabled === undefined) {
      chrome.storage.sync.set({
        extensionEnabled: true,
        targetLanguage: 'en'
      });
    }
  });
});

// Handle extension icon state
chrome.tabs.onActivated.addListener((activeInfo) => {
  // Icon state management will be implemented in later tasks
});

// Message handling between content scripts and background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Message handling will be implemented in later tasks
  return true;
});