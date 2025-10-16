/**
 * SubtitleStyleManager - Handles customizable subtitle styling and CSS management
 * Provides user-configurable font size, color, positioning, and appearance options
 */
class SubtitleStyleManager {
  constructor() {
    this.defaultStyles = {
      fontSize: 16,
      fontColor: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      fontFamily: 'Arial, sans-serif',
      position: 'bottom',
      padding: '8px 12px',
      borderRadius: '4px',
      lineHeight: '1.4',
      maxWidth: '80%',
      textAlign: 'center',
      fontWeight: 'normal',
      textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)',
      border: 'none',
      opacity: 1,
      letterSpacing: 'normal',
      textTransform: 'none',
      wordSpacing: 'normal'
    };

    this.userStyles = { ...this.defaultStyles };
    this.styleSheet = null;
    this.observers = new Set();
    
    this.initializeStyleSheet();
  }

  /**
   * Initialize CSS stylesheet for subtitle styling
   */
  initializeStyleSheet() {
    // Create or get existing stylesheet
    let styleElement = document.getElementById('video-translator-styles');
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'video-translator-styles';
      styleElement.type = 'text/css';
      document.head.appendChild(styleElement);
    }
    
    this.styleSheet = styleElement.sheet || styleElement.styleSheet;
    this.updateStyleSheet();
  }

  /**
   * Update the CSS stylesheet with current styles
   */
  updateStyleSheet() {
    if (!this.styleSheet) return;

    // Clear existing rules
    while (this.styleSheet.cssRules.length > 0) {
      this.styleSheet.deleteRule(0);
    }

    // Add base container styles
    const containerRule = `
      .video-translator-subtitle-container {
        position: absolute !important;
        pointer-events: none !important;
        z-index: 10000 !important;
        width: 100% !important;
        display: flex !important;
        justify-content: center !important;
        align-items: ${this.getAlignmentForPosition(this.userStyles.position)} !important;
      }
    `;
    this.styleSheet.insertRule(containerRule, 0);

    // Add subtitle element styles
    const subtitleRule = `
      .video-translator-subtitle {
        font-size: ${this.userStyles.fontSize}px !important;
        color: ${this.userStyles.fontColor} !important;
        background-color: ${this.userStyles.backgroundColor} !important;
        font-family: ${this.userStyles.fontFamily} !important;
        padding: ${this.userStyles.padding} !important;
        border-radius: ${this.userStyles.borderRadius} !important;
        line-height: ${this.userStyles.lineHeight} !important;
        max-width: ${this.userStyles.maxWidth} !important;
        text-align: ${this.userStyles.textAlign} !important;
        font-weight: ${this.userStyles.fontWeight} !important;
        text-shadow: ${this.userStyles.textShadow} !important;
        border: ${this.userStyles.border} !important;
        opacity: ${this.userStyles.opacity} !important;
        letter-spacing: ${this.userStyles.letterSpacing} !important;
        text-transform: ${this.userStyles.textTransform} !important;
        word-spacing: ${this.userStyles.wordSpacing} !important;
        word-wrap: break-word !important;
        white-space: pre-wrap !important;
        box-sizing: border-box !important;
        margin: 10px !important;
        display: inline-block !important;
        transition: opacity 0.3s ease !important;
      }
    `;
    this.styleSheet.insertRule(subtitleRule, 1);

    // Add position-specific styles
    this.addPositionSpecificStyles();
    
    // Add animation styles
    this.addAnimationStyles();
  }

  /**
   * Add position-specific CSS rules
   */
  addPositionSpecificStyles() {
    if (!this.styleSheet) return;

    // Top position styles
    const topRule = `
      .video-translator-subtitle-container[data-position="top"] {
        align-items: flex-start !important;
      }
      .video-translator-subtitle-container[data-position="top"] .video-translator-subtitle {
        margin-top: 20px !important;
        margin-bottom: 10px !important;
      }
    `;
    this.styleSheet.insertRule(topRule, this.styleSheet.cssRules.length);

    // Center position styles
    const centerRule = `
      .video-translator-subtitle-container[data-position="center"] {
        align-items: center !important;
      }
      .video-translator-subtitle-container[data-position="center"] .video-translator-subtitle {
        margin: 10px !important;
      }
    `;
    this.styleSheet.insertRule(centerRule, this.styleSheet.cssRules.length);

    // Bottom position styles (default)
    const bottomRule = `
      .video-translator-subtitle-container[data-position="bottom"] {
        align-items: flex-end !important;
      }
      .video-translator-subtitle-container[data-position="bottom"] .video-translator-subtitle {
        margin-top: 10px !important;
        margin-bottom: 20px !important;
      }
    `;
    this.styleSheet.insertRule(bottomRule, this.styleSheet.cssRules.length);
  }

  /**
   * Add animation and transition styles
   */
  addAnimationStyles() {
    if (!this.styleSheet) return;

    const animationRule = `
      .video-translator-subtitle.fade-in {
        animation: subtitleFadeIn 0.3s ease-in-out !important;
      }
      .video-translator-subtitle.fade-out {
        animation: subtitleFadeOut 0.3s ease-in-out !important;
      }
      @keyframes subtitleFadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes subtitleFadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-10px); }
      }
    `;
    this.styleSheet.insertRule(animationRule, this.styleSheet.cssRules.length);
  }

  /**
   * Get CSS alignment value for position
   * @param {string} position - Position setting (top, center, bottom)
   * @returns {string} CSS alignment value
   */
  getAlignmentForPosition(position) {
    switch (position) {
      case 'top': return 'flex-start';
      case 'center': return 'center';
      case 'bottom': 
      default: return 'flex-end';
    }
  }

  /**
   * Update a specific style property
   * @param {string} property - Style property name
   * @param {*} value - New value for the property
   */
  updateStyle(property, value) {
    if (this.userStyles.hasOwnProperty(property)) {
      this.userStyles[property] = value;
      this.updateStyleSheet();
      this.notifyObservers(property, value);
    } else {
      console.warn(`Unknown style property: ${property}`);
    }
  }

  /**
   * Update multiple style properties at once
   * @param {Object} styles - Object containing style properties and values
   */
  updateStyles(styles) {
    let hasChanges = false;
    
    Object.entries(styles).forEach(([property, value]) => {
      if (this.userStyles.hasOwnProperty(property)) {
        this.userStyles[property] = value;
        hasChanges = true;
      } else {
        console.warn(`Unknown style property: ${property}`);
      }
    });

    if (hasChanges) {
      this.updateStyleSheet();
      this.notifyObservers('multiple', styles);
    }
  }

  /**
   * Get current style value
   * @param {string} property - Style property name
   * @returns {*} Current value of the property
   */
  getStyle(property) {
    return this.userStyles[property];
  }

  /**
   * Get all current styles
   * @returns {Object} Copy of current user styles
   */
  getAllStyles() {
    return { ...this.userStyles };
  }

  /**
   * Reset styles to default values
   */
  resetToDefaults() {
    this.userStyles = { ...this.defaultStyles };
    this.updateStyleSheet();
    this.notifyObservers('reset', this.userStyles);
  }

  /**
   * Reset a specific style property to default
   * @param {string} property - Style property name
   */
  resetStyle(property) {
    if (this.defaultStyles.hasOwnProperty(property)) {
      this.userStyles[property] = this.defaultStyles[property];
      this.updateStyleSheet();
      this.notifyObservers(property, this.userStyles[property]);
    }
  }

  /**
   * Load styles from storage or configuration
   * @param {Object} savedStyles - Previously saved styles
   */
  loadStyles(savedStyles) {
    if (savedStyles && typeof savedStyles === 'object') {
      // Validate and merge saved styles with defaults
      const validStyles = {};
      
      Object.entries(savedStyles).forEach(([property, value]) => {
        if (this.defaultStyles.hasOwnProperty(property)) {
          validStyles[property] = value;
        }
      });

      this.userStyles = { ...this.defaultStyles, ...validStyles };
      this.updateStyleSheet();
      this.notifyObservers('loaded', this.userStyles);
    }
  }

  /**
   * Get styles in a format suitable for saving
   * @returns {Object} Serializable styles object
   */
  getStylesForSaving() {
    return { ...this.userStyles };
  }

  /**
   * Create a preview of how subtitles will look with current styles
   * @param {string} sampleText - Text to use for preview
   * @returns {HTMLElement} Preview element
   */
  createPreview(sampleText = 'Sample subtitle text') {
    const container = document.createElement('div');
    container.className = 'video-translator-subtitle-container';
    container.setAttribute('data-position', this.userStyles.position);
    container.style.position = 'relative';
    container.style.width = '400px';
    container.style.height = '200px';
    container.style.border = '1px solid #ccc';
    container.style.backgroundColor = '#000';

    const subtitle = document.createElement('div');
    subtitle.className = 'video-translator-subtitle';
    subtitle.textContent = sampleText;

    container.appendChild(subtitle);
    return container;
  }

  /**
   * Get available font families
   * @returns {Array<Object>} Array of font family options
   */
  getAvailableFonts() {
    return [
      { name: 'Arial', value: 'Arial, sans-serif' },
      { name: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
      { name: 'Times New Roman', value: '"Times New Roman", Times, serif' },
      { name: 'Georgia', value: 'Georgia, serif' },
      { name: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
      { name: 'Courier New', value: '"Courier New", Courier, monospace' },
      { name: 'Impact', value: 'Impact, Charcoal, sans-serif' },
      { name: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
      { name: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif' },
      { name: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' }
    ];
  }

  /**
   * Get available position options
   * @returns {Array<Object>} Array of position options
   */
  getAvailablePositions() {
    return [
      { name: 'Top', value: 'top' },
      { name: 'Center', value: 'center' },
      { name: 'Bottom', value: 'bottom' }
    ];
  }

  /**
   * Validate style value
   * @param {string} property - Style property name
   * @param {*} value - Value to validate
   * @returns {boolean} Whether the value is valid
   */
  validateStyleValue(property, value) {
    switch (property) {
      case 'fontSize':
        return typeof value === 'number' && value >= 8 && value <= 72;
      case 'fontColor':
      case 'backgroundColor':
        return typeof value === 'string' && /^(#[0-9A-Fa-f]{6}|rgba?\([^)]+\))/.test(value);
      case 'position':
        return ['top', 'center', 'bottom'].includes(value);
      case 'opacity':
        return typeof value === 'number' && value >= 0 && value <= 1;
      case 'fontWeight':
        return ['normal', 'bold', 'lighter', 'bolder'].includes(value) || 
               (typeof value === 'number' && value >= 100 && value <= 900);
      case 'textAlign':
        return ['left', 'center', 'right', 'justify'].includes(value);
      default:
        return typeof value === 'string';
    }
  }

  /**
   * Add observer for style changes
   * @param {Function} callback - Callback function to call on style changes
   */
  addObserver(callback) {
    this.observers.add(callback);
  }

  /**
   * Remove observer
   * @param {Function} callback - Callback function to remove
   */
  removeObserver(callback) {
    this.observers.delete(callback);
  }

  /**
   * Notify all observers of style changes
   * @param {string} property - Changed property name
   * @param {*} value - New value
   */
  notifyObservers(property, value) {
    this.observers.forEach(callback => {
      try {
        callback(property, value);
      } catch (error) {
        console.error('Error in style observer:', error);
      }
    });
  }

  /**
   * Clean up resources
   */
  cleanup() {
    // Remove stylesheet
    const styleElement = document.getElementById('video-translator-styles');
    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
    }
    
    // Clear observers
    this.observers.clear();
    
    this.styleSheet = null;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SubtitleStyleManager;
}