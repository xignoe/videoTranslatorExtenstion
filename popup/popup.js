// Popup script for Video Translator extension
document.addEventListener('DOMContentLoaded', function() {
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const extensionEnabledToggle = document.getElementById('extensionEnabled');
  const openOptionsButton = document.getElementById('openOptions');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  // Load saved settings
  chrome.storage.sync.get(['targetLanguage', 'extensionEnabled'], function(result) {
    if (result.targetLanguage) {
      targetLanguageSelect.value = result.targetLanguage;
    }
    if (result.extensionEnabled !== undefined) {
      extensionEnabledToggle.checked = result.extensionEnabled;
    }
  });

  // Save target language when changed
  targetLanguageSelect.addEventListener('change', function() {
    chrome.storage.sync.set({
      targetLanguage: targetLanguageSelect.value
    });
  });

  // Save extension enabled state when toggled
  extensionEnabledToggle.addEventListener('change', function() {
    chrome.storage.sync.set({
      extensionEnabled: extensionEnabledToggle.checked
    });
    
    // Update status indicator
    updateStatusIndicator();
  });

  // Open options page
  openOptionsButton.addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });

  // Update status indicator based on extension state
  function updateStatusIndicator() {
    if (extensionEnabledToggle.checked) {
      statusDot.className = 'status-dot';
      statusText.textContent = 'Ready';
    } else {
      statusDot.className = 'status-dot inactive';
      statusText.textContent = 'Disabled';
    }
  }

  // Initial status update
  updateStatusIndicator();
});