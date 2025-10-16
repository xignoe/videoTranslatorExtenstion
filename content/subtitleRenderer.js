/**
 * SubtitleRenderer - Handles creation and positioning of subtitle overlays
 * Supports multiple simultaneous videos with dynamic positioning
 */
class SubtitleRenderer {
  constructor(styleManager = null) {
    this.activeSubtitles = new Map(); // videoId -> subtitle elements
    this.videoInstances = new Map(); // videoId -> video metadata
    this.subtitleContainers = new Map(); // videoId -> container element
    this.styleManager = styleManager;
    
    // Default settings for fallback when no style manager is provided
    this.defaultSettings = {
      fontSize: 16,
      fontColor: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      position: 'bottom',
      padding: '8px 12px',
      borderRadius: '4px',
      fontFamily: 'Arial, sans-serif',
      lineHeight: '1.4',
      maxWidth: '80%',
      zIndex: 10000
    };

    // Listen for style changes if style manager is provided
    if (this.styleManager) {
      this.styleManager.addObserver((property, value) => {
        this.handleStyleChange(property, value);
      });
    }
  }

  /**
   * Initialize subtitle rendering for a video element
   * @param {HTMLVideoElement} videoElement - The video element to attach subtitles to
   * @param {string} videoId - Unique identifier for the video
   * @param {Object} settings - Custom styling settings (optional, overrides style manager)
   */
  initializeForVideo(videoElement, videoId, settings = {}) {
    if (this.videoInstances.has(videoId)) {
      console.warn(`Video ${videoId} already initialized for subtitles`);
      return;
    }

    // Get current styles from style manager or use defaults
    const currentStyles = this.styleManager ? this.styleManager.getAllStyles() : this.defaultSettings;
    const mergedSettings = { ...currentStyles, ...settings };
    
    // Create subtitle container
    const container = this.createSubtitleContainer(videoElement, videoId, mergedSettings);
    
    // Store video instance data
    this.videoInstances.set(videoId, {
      videoElement,
      settings: mergedSettings,
      isVisible: true,
      currentSubtitle: null
    });
    
    this.subtitleContainers.set(videoId, container);
    
    // Set up video event listeners for positioning updates
    this.setupVideoEventListeners(videoElement, videoId);
    
    console.log(`Subtitle renderer initialized for video: ${videoId}`);
  }

  /**
   * Create and position subtitle container relative to video
   * @param {HTMLVideoElement} videoElement - The video element
   * @param {string} videoId - Video identifier
   * @param {Object} settings - Styling settings
   * @returns {HTMLElement} The created container element
   */
  createSubtitleContainer(videoElement, videoId, settings) {
    const container = document.createElement('div');
    container.className = 'video-translator-subtitle-container';
    container.setAttribute('data-video-id', videoId);
    container.setAttribute('data-position', settings.position);
    
    // If using style manager, let CSS handle styling
    if (this.styleManager) {
      // Minimal inline styles for positioning
      Object.assign(container.style, {
        position: 'absolute',
        pointerEvents: 'none',
        zIndex: (settings.zIndex || 10000).toString()
      });
    } else {
      // Apply inline styles when no style manager
      Object.assign(container.style, {
        position: 'absolute',
        pointerEvents: 'none',
        zIndex: settings.zIndex.toString(),
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: settings.position === 'top' ? 'flex-start' : 
                     settings.position === 'center' ? 'center' : 'flex-end'
      });
    }

    // Position container relative to video
    this.positionContainer(container, videoElement, settings);
    
    // Insert container into DOM
    const videoParent = videoElement.parentElement || document.body;
    videoParent.appendChild(container);
    
    return container;
  }

  /**
   * Position subtitle container relative to video element
   * @param {HTMLElement} container - Subtitle container
   * @param {HTMLVideoElement} videoElement - Video element
   * @param {Object} settings - Positioning settings
   */
  positionContainer(container, videoElement, settings) {
    const videoRect = videoElement.getBoundingClientRect();
    const videoStyle = window.getComputedStyle(videoElement);
    
    // Calculate positioning based on video element
    const top = videoRect.top + window.scrollY;
    const left = videoRect.left + window.scrollX;
    const width = videoRect.width;
    const height = videoRect.height;
    
    Object.assign(container.style, {
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      height: `${height}px`
    });

    // Adjust for video position type
    if (videoStyle.position === 'fixed') {
      container.style.position = 'fixed';
      container.style.top = `${videoRect.top}px`;
      container.style.left = `${videoRect.left}px`;
    }
  }

  /**
   * Display subtitle text for a specific video
   * @param {string} videoId - Video identifier
   * @param {string} text - Subtitle text to display
   * @param {Object} options - Display options (duration, fade, etc.)
   */
  displaySubtitle(videoId, text, options = {}) {
    const container = this.subtitleContainers.get(videoId);
    const videoInstance = this.videoInstances.get(videoId);
    
    if (!container || !videoInstance) {
      console.warn(`No subtitle container found for video: ${videoId}`);
      return;
    }

    if (!videoInstance.isVisible) {
      return; // Don't display if subtitles are hidden
    }

    // Clear existing subtitle
    this.clearSubtitle(videoId);
    
    // Create subtitle element
    const subtitleElement = this.createSubtitleElement(text, videoInstance.settings);
    
    // Add to container
    container.appendChild(subtitleElement);
    
    // Store reference
    this.activeSubtitles.set(videoId, subtitleElement);
    videoInstance.currentSubtitle = {
      element: subtitleElement,
      text,
      timestamp: Date.now(),
      ...options
    };

    // Handle auto-hide if duration specified
    if (options.duration) {
      setTimeout(() => {
        this.clearSubtitle(videoId);
      }, options.duration);
    }
  }

  /**
   * Create styled subtitle element
   * @param {string} text - Subtitle text
   * @param {Object} settings - Styling settings
   * @returns {HTMLElement} Styled subtitle element
   */
  createSubtitleElement(text, settings) {
    const subtitle = document.createElement('div');
    subtitle.className = 'video-translator-subtitle';
    subtitle.textContent = text;
    
    // If using style manager, let CSS handle most styling
    if (this.styleManager) {
      // Add fade-in animation class
      subtitle.classList.add('fade-in');
    } else {
      // Apply inline styles when no style manager
      Object.assign(subtitle.style, {
        fontSize: `${settings.fontSize}px`,
        color: settings.fontColor,
        backgroundColor: settings.backgroundColor,
        padding: settings.padding,
        borderRadius: settings.borderRadius,
        fontFamily: settings.fontFamily,
        lineHeight: settings.lineHeight,
        maxWidth: settings.maxWidth,
        textAlign: 'center',
        wordWrap: 'break-word',
        whiteSpace: 'pre-wrap',
        boxSizing: 'border-box',
        margin: '10px',
        textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)'
      });
    }

    return subtitle;
  }

  /**
   * Clear subtitle for a specific video
   * @param {string} videoId - Video identifier
   */
  clearSubtitle(videoId) {
    const subtitleElement = this.activeSubtitles.get(videoId);
    const videoInstance = this.videoInstances.get(videoId);
    
    if (subtitleElement && subtitleElement.parentNode) {
      subtitleElement.parentNode.removeChild(subtitleElement);
    }
    
    this.activeSubtitles.delete(videoId);
    
    if (videoInstance) {
      videoInstance.currentSubtitle = null;
    }
  }

  /**
   * Update subtitle styling for a video
   * @param {string} videoId - Video identifier
   * @param {Object} newSettings - New styling settings
   */
  updateSettings(videoId, newSettings) {
    const videoInstance = this.videoInstances.get(videoId);
    const container = this.subtitleContainers.get(videoId);
    
    if (!videoInstance || !container) {
      return;
    }

    // Merge settings
    videoInstance.settings = { ...videoInstance.settings, ...newSettings };
    
    // Update container positioning if position changed
    if (newSettings.position) {
      container.style.alignItems = newSettings.position === 'top' ? 'flex-start' : 
                                   newSettings.position === 'center' ? 'center' : 'flex-end';
    }
    
    // Update active subtitle styling
    const activeSubtitle = this.activeSubtitles.get(videoId);
    if (activeSubtitle) {
      const currentText = activeSubtitle.textContent;
      this.clearSubtitle(videoId);
      this.displaySubtitle(videoId, currentText);
    }
  }

  /**
   * Show/hide subtitles for a video
   * @param {string} videoId - Video identifier
   * @param {boolean} visible - Whether subtitles should be visible
   */
  setVisibility(videoId, visible) {
    const videoInstance = this.videoInstances.get(videoId);
    const container = this.subtitleContainers.get(videoId);
    
    if (!videoInstance || !container) {
      return;
    }

    videoInstance.isVisible = visible;
    container.style.display = visible ? 'flex' : 'none';
  }

  /**
   * Set up event listeners for video positioning updates
   * @param {HTMLVideoElement} videoElement - Video element
   * @param {string} videoId - Video identifier
   */
  setupVideoEventListeners(videoElement, videoId) {
    const updatePosition = () => {
      const container = this.subtitleContainers.get(videoId);
      const videoInstance = this.videoInstances.get(videoId);
      
      if (container && videoInstance) {
        this.positionContainer(container, videoElement, videoInstance.settings);
      }
    };

    // Update position on various events
    videoElement.addEventListener('loadedmetadata', updatePosition);
    videoElement.addEventListener('resize', updatePosition);
    
    // Handle fullscreen changes
    document.addEventListener('fullscreenchange', updatePosition);
    document.addEventListener('webkitfullscreenchange', updatePosition);
    
    // Update on window resize and scroll
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);
    
    // Store cleanup function
    if (!videoElement._subtitleCleanup) {
      videoElement._subtitleCleanup = () => {
        videoElement.removeEventListener('loadedmetadata', updatePosition);
        videoElement.removeEventListener('resize', updatePosition);
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition);
      };
    }
  }

  /**
   * Clean up subtitle rendering for a video
   * @param {string} videoId - Video identifier
   */
  cleanup(videoId) {
    // Clear active subtitle
    this.clearSubtitle(videoId);
    
    // Remove container
    const container = this.subtitleContainers.get(videoId);
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    
    // Clean up event listeners
    const videoInstance = this.videoInstances.get(videoId);
    if (videoInstance && videoInstance.videoElement._subtitleCleanup) {
      videoInstance.videoElement._subtitleCleanup();
      delete videoInstance.videoElement._subtitleCleanup;
    }
    
    // Remove from maps
    this.activeSubtitles.delete(videoId);
    this.subtitleContainers.delete(videoId);
    this.videoInstances.delete(videoId);
    
    console.log(`Subtitle renderer cleaned up for video: ${videoId}`);
  }

  /**
   * Get current subtitle info for a video
   * @param {string} videoId - Video identifier
   * @returns {Object|null} Current subtitle information
   */
  getCurrentSubtitle(videoId) {
    const videoInstance = this.videoInstances.get(videoId);
    return videoInstance ? videoInstance.currentSubtitle : null;
  }

  /**
   * Get all active video IDs
   * @returns {Array<string>} Array of active video IDs
   */
  getActiveVideoIds() {
    return Array.from(this.videoInstances.keys());
  }

  /**
   * Handle style changes from style manager
   * @param {string} property - Changed property name
   * @param {*} value - New value
   */
  handleStyleChange(property, value) {
    // Update all video instances with new styles
    this.videoInstances.forEach((instance, videoId) => {
      if (property === 'position' || property === 'multiple' || property === 'reset' || property === 'loaded') {
        // Update container position attribute
        const container = this.subtitleContainers.get(videoId);
        if (container) {
          const newPosition = property === 'position' ? value : 
                             (this.styleManager ? this.styleManager.getStyle('position') : 'bottom');
          container.setAttribute('data-position', newPosition);
        }
      }
      
      // Update instance settings
      if (this.styleManager) {
        instance.settings = this.styleManager.getAllStyles();
      }
    });
  }

  /**
   * Set style manager
   * @param {SubtitleStyleManager} styleManager - Style manager instance
   */
  setStyleManager(styleManager) {
    // Remove old observer
    if (this.styleManager) {
      this.styleManager.removeObserver(this.handleStyleChange.bind(this));
    }
    
    this.styleManager = styleManager;
    
    // Add new observer
    if (this.styleManager) {
      this.styleManager.addObserver(this.handleStyleChange.bind(this));
      
      // Update all existing instances
      this.handleStyleChange('loaded', this.styleManager.getAllStyles());
    }
  }

  /**
   * Get current style manager
   * @returns {SubtitleStyleManager|null} Current style manager
   */
  getStyleManager() {
    return this.styleManager;
  }

  /**
   * Clean up all subtitle renderers
   */
  cleanupAll() {
    const videoIds = this.getActiveVideoIds();
    videoIds.forEach(videoId => this.cleanup(videoId));
    
    // Remove style manager observer
    if (this.styleManager) {
      this.styleManager.removeObserver(this.handleStyleChange.bind(this));
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SubtitleRenderer;
}