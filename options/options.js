// Options page script for Video Translator extension
document.addEventListener('DOMContentLoaded', function() {
  // Get all form elements
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const autoDetectLanguageCheckbox = document.getElementById('autoDetectLanguage');
  const fontSizeSelect = document.getElementById('fontSize');
  const fontColorInput = document.getElementById('fontColor');
  const backgroundColorInput = document.getElementById('backgroundColor');
  const subtitlePositionSelect = document.getElementById('subtitlePosition');
  const showConfidenceIndicatorCheckbox = document.getElementById('showConfidenceIndicator');
  const enableKeyboardShortcutsCheckbox = document.getElementById('enableKeyboardShortcuts');
  const saveSettingsButton = document.getElementById('saveSettings');
  const resetSettingsButton = document.getElementById('resetSettings');

  // Default settings
  const defaultSettings = {
    targetLanguage: 'en',
    autoDetectLanguage: true,
    fontSize: '16',
    fontColor: '#ffffff',
    backgroundColor: '#000000',
    subtitlePosition: 'bottom',
    showConfidenceIndicator: false,
    enableKeyboardShortcuts: true
  };

  // Load saved settings
  function loadSettings() {
    chrome.storage.sync.get(defaultSettings, function(settings) {
      targetLanguageSelect.value = settings.targetLanguage;
      autoDetectLanguageCheckbox.checked = settings.autoDetectLanguage;
      fontSizeSelect.value = settings.fontSize;
      fontColorInput.value = settings.fontColor;
      backgroundColorInput.value = settings.backgroundColor;
      subtitlePositionSelect.value = settings.subtitlePosition;
      showConfidenceIndicatorCheckbox.checked = settings.showConfidenceIndicator;
      enableKeyboardShortcutsCheckbox.checked = settings.enableKeyboardShortcuts;
    });
  }

  // Save settings
  function saveSettings() {
    const settings = {
      targetLanguage: targetLanguageSelect.value,
      autoDetectLanguage: autoDetectLanguageCheckbox.checked,
      fontSize: fontSizeSelect.value,
      fontColor: fontColorInput.value,
      backgroundColor: backgroundColorInput.value,
      subtitlePosition: subtitlePositionSelect.value,
      showConfidenceIndicator: showConfidenceIndicatorCheckbox.checked,
      enableKeyboardShortcuts: enableKeyboardShortcutsCheckbox.checked
    };

    chrome.storage.sync.set(settings, function() {
      // Show save confirmation
      const originalText = saveSettingsButton.textContent;
      saveSettingsButton.textContent = 'Saved!';
      saveSettingsButton.style.backgroundColor = '#28a745';
      
      setTimeout(() => {
        saveSettingsButton.textContent = originalText;
        saveSettingsButton.style.backgroundColor = '#007bff';
      }, 2000);
    });
  }

  // Reset to default settings
  function resetSettings() {
    if (confirm('Are you sure you want to reset all settings to their default values?')) {
      chrome.storage.sync.set(defaultSettings, function() {
        loadSettings();
        
        // Show reset confirmation
        const originalText = resetSettingsButton.textContent;
        resetSettingsButton.textContent = 'Reset Complete!';
        resetSettingsButton.style.backgroundColor = '#28a745';
        resetSettingsButton.style.color = 'white';
        
        setTimeout(() => {
          resetSettingsButton.textContent = originalText;
          resetSettingsButton.style.backgroundColor = 'white';
          resetSettingsButton.style.color = '#6c757d';
        }, 2000);
      });
    }
  }

  // Event listeners
  saveSettingsButton.addEventListener('click', saveSettings);
  resetSettingsButton.addEventListener('click', resetSettings);

  // Load settings on page load
  loadSettings();
});