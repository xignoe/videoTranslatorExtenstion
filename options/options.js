// Options page script for Video Translator extension
document.addEventListener('DOMContentLoaded', function() {
  // Get all form elements
  const targetLanguageSelect = document.getElementById('targetLanguage');
  const autoDetectLanguageCheckbox = document.getElementById('autoDetectLanguage');
  const fontSizeSelect = document.getElementById('fontSize');
  const fontColorInput = document.getElementById('fontColor');
  const backgroundColorInput = document.getElementById('backgroundColor');
  const subtitlePositionSelect = document.getElementById('subtitlePosition');
  const backgroundOpacitySlider = document.getElementById('backgroundOpacity');
  const subtitleMarginSlider = document.getElementById('subtitleMargin');
  const fontFamilySelect = document.getElementById('fontFamily');
  const enableTextShadowCheckbox = document.getElementById('enableTextShadow');
  const translationDelaySlider = document.getElementById('translationDelay');
  const maxSubtitleLengthSlider = document.getElementById('maxSubtitleLength');
  const enableCachingCheckbox = document.getElementById('enableCaching');
  const showConfidenceIndicatorCheckbox = document.getElementById('showConfidenceIndicator');
  const enableKeyboardShortcutsCheckbox = document.getElementById('enableKeyboardShortcuts');
  const enableDebugModeCheckbox = document.getElementById('enableDebugMode');
  const translationProviderSelect = document.getElementById('translationProvider');
  const saveSettingsButton = document.getElementById('saveSettings');
  const resetSettingsButton = document.getElementById('resetSettings');
  const exportSettingsButton = document.getElementById('exportSettings');
  const importSettingsInput = document.getElementById('importSettings');
  const importSettingsButton = document.getElementById('importSettingsButton');
  const subtitlePreview = document.getElementById('subtitlePreview');

  // Slider value display elements
  const backgroundOpacityValue = document.getElementById('backgroundOpacityValue');
  const subtitleMarginValue = document.getElementById('subtitleMarginValue');
  const translationDelayValue = document.getElementById('translationDelayValue');
  const maxSubtitleLengthValue = document.getElementById('maxSubtitleLengthValue');
  const importFileName = document.getElementById('importFileName');

  // Default settings
  const defaultSettings = {
    targetLanguage: 'en',
    autoDetectLanguage: true,
    fontSize: '16',
    fontColor: '#ffffff',
    backgroundColor: '#000000',
    subtitlePosition: 'bottom',
    backgroundOpacity: 80,
    subtitleMargin: 20,
    fontFamily: 'Arial, sans-serif',
    enableTextShadow: true,
    translationDelay: 1.0,
    maxSubtitleLength: 100,
    enableCaching: true,
    showConfidenceIndicator: false,
    enableKeyboardShortcuts: true,
    enableDebugMode: false,
    translationProvider: 'google'
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
      backgroundOpacitySlider.value = settings.backgroundOpacity;
      subtitleMarginSlider.value = settings.subtitleMargin;
      fontFamilySelect.value = settings.fontFamily;
      enableTextShadowCheckbox.checked = settings.enableTextShadow;
      translationDelaySlider.value = settings.translationDelay;
      maxSubtitleLengthSlider.value = settings.maxSubtitleLength;
      enableCachingCheckbox.checked = settings.enableCaching;
      showConfidenceIndicatorCheckbox.checked = settings.showConfidenceIndicator;
      enableKeyboardShortcutsCheckbox.checked = settings.enableKeyboardShortcuts;
      enableDebugModeCheckbox.checked = settings.enableDebugMode;
      translationProviderSelect.value = settings.translationProvider;
      
      updateSliderValues();
      updatePreview();
    });
  }

  // Update slider value displays
  function updateSliderValues() {
    backgroundOpacityValue.textContent = backgroundOpacitySlider.value + '%';
    subtitleMarginValue.textContent = subtitleMarginSlider.value + 'px';
    translationDelayValue.textContent = translationDelaySlider.value + 's';
    maxSubtitleLengthValue.textContent = maxSubtitleLengthSlider.value + ' chars';
  }

  // Update subtitle preview
  function updatePreview() {
    const fontSize = fontSizeSelect.value + 'px';
    const fontColor = fontColorInput.value;
    const backgroundColor = backgroundColorInput.value;
    const backgroundOpacity = backgroundOpacitySlider.value / 100;
    const fontFamily = fontFamilySelect.value;
    const enableTextShadow = enableTextShadowCheckbox.checked;
    
    // Convert hex to rgba
    const bgColor = hexToRgba(backgroundColor, backgroundOpacity);
    
    subtitlePreview.style.fontSize = fontSize;
    subtitlePreview.style.color = fontColor;
    subtitlePreview.style.backgroundColor = bgColor;
    subtitlePreview.style.fontFamily = fontFamily;
    subtitlePreview.style.textShadow = enableTextShadow ? '2px 2px 4px rgba(0,0,0,0.8)' : 'none';
  }

  // Convert hex color to rgba
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Get current settings from form
  function getCurrentSettings() {
    return {
      targetLanguage: targetLanguageSelect.value,
      autoDetectLanguage: autoDetectLanguageCheckbox.checked,
      fontSize: fontSizeSelect.value,
      fontColor: fontColorInput.value,
      backgroundColor: backgroundColorInput.value,
      subtitlePosition: subtitlePositionSelect.value,
      backgroundOpacity: parseInt(backgroundOpacitySlider.value),
      subtitleMargin: parseInt(subtitleMarginSlider.value),
      fontFamily: fontFamilySelect.value,
      enableTextShadow: enableTextShadowCheckbox.checked,
      translationDelay: parseFloat(translationDelaySlider.value),
      maxSubtitleLength: parseInt(maxSubtitleLengthSlider.value),
      enableCaching: enableCachingCheckbox.checked,
      showConfidenceIndicator: showConfidenceIndicatorCheckbox.checked,
      enableKeyboardShortcuts: enableKeyboardShortcutsCheckbox.checked,
      enableDebugMode: enableDebugModeCheckbox.checked,
      translationProvider: translationProviderSelect.value
    };
  }

  // Save settings
  function saveSettings() {
    const settings = getCurrentSettings();

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

  // Export settings
  function exportSettings() {
    const settings = getCurrentSettings();
    const dataStr = JSON.stringify(settings, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = 'video-translator-settings.json';
    link.click();
    
    // Show export confirmation
    const originalText = exportSettingsButton.textContent;
    exportSettingsButton.textContent = 'Exported!';
    exportSettingsButton.style.backgroundColor = '#28a745';
    exportSettingsButton.style.color = 'white';
    
    setTimeout(() => {
      exportSettingsButton.textContent = originalText;
      exportSettingsButton.style.backgroundColor = 'white';
      exportSettingsButton.style.color = '#007bff';
    }, 2000);
  }

  // Import settings
  function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    importFileName.textContent = file.name;
    
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const importedSettings = JSON.parse(e.target.result);
        
        // Validate imported settings
        const validatedSettings = {...defaultSettings, ...importedSettings};
        
        chrome.storage.sync.set(validatedSettings, function() {
          loadSettings();
          
          // Show import confirmation
          const originalText = importSettingsButton.textContent;
          importSettingsButton.textContent = 'Imported!';
          importSettingsButton.style.backgroundColor = '#28a745';
          importSettingsButton.style.color = 'white';
          
          setTimeout(() => {
            importSettingsButton.textContent = originalText;
            importSettingsButton.style.backgroundColor = 'white';
            importSettingsButton.style.color = '#007bff';
          }, 2000);
        });
      } catch (error) {
        alert('Error importing settings: Invalid file format');
      }
    };
    reader.readAsText(file);
  }

  // Event listeners
  saveSettingsButton.addEventListener('click', saveSettings);
  resetSettingsButton.addEventListener('click', resetSettings);
  exportSettingsButton.addEventListener('click', exportSettings);
  importSettingsButton.addEventListener('click', () => importSettingsInput.click());
  importSettingsInput.addEventListener('change', importSettings);

  // Slider event listeners
  backgroundOpacitySlider.addEventListener('input', () => {
    updateSliderValues();
    updatePreview();
  });
  
  subtitleMarginSlider.addEventListener('input', updateSliderValues);
  translationDelaySlider.addEventListener('input', updateSliderValues);
  maxSubtitleLengthSlider.addEventListener('input', updateSliderValues);

  // Preview update listeners
  fontSizeSelect.addEventListener('change', updatePreview);
  fontColorInput.addEventListener('input', updatePreview);
  backgroundColorInput.addEventListener('input', updatePreview);
  fontFamilySelect.addEventListener('change', updatePreview);
  enableTextShadowCheckbox.addEventListener('change', updatePreview);

  // Load settings on page load
  loadSettings();
});