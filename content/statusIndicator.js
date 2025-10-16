/**
 * StatusIndicator - Visual status indicators and user feedback system
 * Provides subtle on-video indicators and accessibility features
 */
class StatusIndicator {
  constructor() {
    this.indicators = new Map(); // videoId -> indicator elements
    this.globalIndicator = null;
    this.currentStatus = { state: 'inactive' };
    this.settings = {
      showIndicators: true,
      indicatorPosition: 'top-right',
      indicatorSize: 'small',
      showTooltips: true,
      accessibilityMode: false
    };

    // Status types and their visual representations
    this.statusTypes = {
      inactive: {
        icon: '⏸️',
        color: '#666666',
        message: 'Extension inactive',
        ariaLabel: 'Video translator is inactive'
      },
      initializing: {
        icon: '⚙️',
        color: '#FFA500',
        message: 'Initializing...',
        ariaLabel: 'Video translator is initializing',
        animated: true
      },
      detecting: {
        icon: '🔍',
        color: '#2196F3',
        message: 'Detecting videos...',
        ariaLabel: 'Detecting videos on page',
        animated: true
      },
      listening: {
        icon: '🎤',
        color: '#4CAF50',
        message: 'Listening for speech...',
        ariaLabel: 'Listening for speech in video',
        animated: true
      },
      processing: {
        icon: '🔄',
        color: '#2196F3',
        message: 'Processing audio...',
        ariaLabel: 'Processing audio for translation',
        animated: true
      },
      translating: {
        icon: '🌐',
        color: '#FF9800',
        message: 'Translating...',
        ariaLabel: 'Translating speech to target language',
        animated: true
      },
      displaying: {
        icon: '💬',
        color: '#4CAF50',
        message: 'Displaying subtitles',
        ariaLabel: 'Displaying translated subtitles'
      },
      error: {
        icon: '⚠️',
        color: '#F44336',
        message: 'Error occurred',
        ariaLabel: 'An error has occurred'
      },
      'no-audio': {
        icon: '🔇',
        color: '#9E9E9E',
        message: 'No audio detected',
        ariaLabel: 'No audio detected in video'
      },
      'rate-limited': {
        icon: '⏳',
        color: '#FF9800',
        message: 'Rate limited - waiting...',
        ariaLabel: 'Translation service rate limited, waiting'
      },
      paused: {
        icon: '⏸️',
        color: '#9E9E9E',
        message: 'Paused',
        ariaLabel: 'Video translation paused'
      }
    };

    // Create global styles
    this.injectStyles();
  }

  /**
   * Inject CSS styles for status indicators
   */
  injectStyles() {
    if (document.getElementById('video-translator-status-styles')) {
      return; // Already injected
    }

    const styles = `
      .vt-status-indicator {
        position: absolute;
        z-index: 10001;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        pointer-events: none;
        user-select: none;
        transition: opacity 0.3s ease, transform 0.3s ease;
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .vt-status-indicator.small {
        font-size: 11px;
        padding: 3px 6px;
      }

      .vt-status-indicator.medium {
        font-size: 12px;
        padding: 4px 8px;
      }

      .vt-status-indicator.large {
        font-size: 14px;
        padding: 6px 10px;
      }

      .vt-status-indicator.top-left {
        top: 10px;
        left: 10px;
      }

      .vt-status-indicator.top-right {
        top: 10px;
        right: 10px;
      }

      .vt-status-indicator.bottom-left {
        bottom: 10px;
        left: 10px;
      }

      .vt-status-indicator.bottom-right {
        bottom: 10px;
        right: 10px;
      }

      .vt-status-indicator.center {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }

      .vt-status-indicator.animated {
        animation: vt-pulse 2s infinite;
      }

      .vt-status-indicator.error {
        background: rgba(244, 67, 54, 0.9);
        border-color: rgba(244, 67, 54, 0.3);
      }

      .vt-status-indicator.success {
        background: rgba(76, 175, 80, 0.9);
        border-color: rgba(76, 175, 80, 0.3);
      }

      .vt-status-indicator.warning {
        background: rgba(255, 152, 0, 0.9);
        border-color: rgba(255, 152, 0, 0.3);
      }

      .vt-status-indicator.hidden {
        opacity: 0;
        transform: scale(0.8);
        pointer-events: none;
      }

      .vt-status-tooltip {
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 6px 8px;
        border-radius: 4px;
        font-size: 11px;
        white-space: nowrap;
        margin-bottom: 5px;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
        z-index: 10002;
      }

      .vt-status-indicator:hover .vt-status-tooltip {
        opacity: 1;
      }

      .vt-global-status {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        max-width: 300px;
        transition: opacity 0.3s ease, transform 0.3s ease;
      }

      .vt-global-status.hidden {
        opacity: 0;
        transform: translateY(-10px);
        pointer-events: none;
      }

      .vt-status-details {
        margin-top: 4px;
        font-size: 11px;
        opacity: 0.8;
      }

      .vt-error-details {
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .vt-recovery-suggestions {
        margin-top: 4px;
        font-size: 10px;
        opacity: 0.7;
      }

      .vt-recovery-suggestions ul {
        margin: 2px 0;
        padding-left: 12px;
      }

      .vt-recovery-suggestions li {
        margin: 1px 0;
      }

      @keyframes vt-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }

      @keyframes vt-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .vt-status-indicator .vt-icon {
        display: inline-block;
        margin-right: 4px;
      }

      .vt-status-indicator.animated .vt-icon {
        animation: vt-spin 2s linear infinite;
      }

      /* Accessibility styles */
      .vt-accessibility-mode .vt-status-indicator {
        font-size: 14px !important;
        padding: 8px 12px !important;
        background: rgba(0, 0, 0, 0.95) !important;
        border: 2px solid white !important;
      }

      .vt-accessibility-mode .vt-global-status {
        font-size: 16px !important;
        padding: 12px 16px !important;
        background: rgba(0, 0, 0, 0.95) !important;
        border: 2px solid white !important;
      }

      /* High contrast mode */
      @media (prefers-contrast: high) {
        .vt-status-indicator {
          background: black !important;
          color: white !important;
          border: 2px solid white !important;
        }
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .vt-status-indicator.animated,
        .vt-status-indicator .vt-icon {
          animation: none !important;
        }
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.id = 'video-translator-status-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  /**
   * Update settings for status indicators
   * @param {Object} newSettings - New settings
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    
    // Update accessibility mode
    if (newSettings.accessibilityMode !== undefined) {
      document.body.classList.toggle('vt-accessibility-mode', newSettings.accessibilityMode);
    }

    // Update existing indicators
    this.indicators.forEach((indicator, videoId) => {
      this.updateIndicatorAppearance(indicator);
    });

    if (this.globalIndicator) {
      this.updateIndicatorAppearance(this.globalIndicator);
    }
  }

  /**
   * Create status indicator for a video
   * @param {string} videoId - Video identifier
   * @param {HTMLVideoElement} videoElement - Video element
   * @returns {HTMLElement} Created indicator element
   */
  createIndicator(videoId, videoElement) {
    if (this.indicators.has(videoId)) {
      return this.indicators.get(videoId);
    }

    const indicator = document.createElement('div');
    indicator.className = `vt-status-indicator ${this.settings.indicatorSize} ${this.settings.indicatorPosition}`;
    indicator.setAttribute('data-video-id', videoId);
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');

    // Create tooltip if enabled
    if (this.settings.showTooltips) {
      const tooltip = document.createElement('div');
      tooltip.className = 'vt-status-tooltip';
      indicator.appendChild(tooltip);
    }

    // Position relative to video
    this.positionIndicator(indicator, videoElement);

    // Add to video container or parent
    const container = this.findVideoContainer(videoElement);
    container.appendChild(indicator);

    // Store reference
    this.indicators.set(videoId, indicator);

    // Set initial status
    this.updateIndicatorStatus(videoId, 'inactive');

    return indicator;
  }

  /**
   * Find appropriate container for video indicator
   * @param {HTMLVideoElement} videoElement - Video element
   * @returns {HTMLElement} Container element
   */
  findVideoContainer(videoElement) {
    // Try to find a positioned parent
    let parent = videoElement.parentElement;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      if (style.position === 'relative' || style.position === 'absolute' || style.position === 'fixed') {
        return parent;
      }
      parent = parent.parentElement;
    }

    // Fallback to video's direct parent
    return videoElement.parentElement || document.body;
  }

  /**
   * Position indicator relative to video element
   * @param {HTMLElement} indicator - Indicator element
   * @param {HTMLVideoElement} videoElement - Video element
   */
  positionIndicator(indicator, videoElement) {
    const videoRect = videoElement.getBoundingClientRect();
    const containerRect = indicator.parentElement.getBoundingClientRect();

    // Calculate relative position
    const relativeTop = videoRect.top - containerRect.top;
    const relativeLeft = videoRect.left - containerRect.left;

    // Apply positioning based on settings
    switch (this.settings.indicatorPosition) {
      case 'top-left':
        indicator.style.top = `${relativeTop + 10}px`;
        indicator.style.left = `${relativeLeft + 10}px`;
        break;
      case 'top-right':
        indicator.style.top = `${relativeTop + 10}px`;
        indicator.style.right = `${containerRect.width - (relativeLeft + videoRect.width) + 10}px`;
        break;
      case 'bottom-left':
        indicator.style.bottom = `${containerRect.height - (relativeTop + videoRect.height) + 10}px`;
        indicator.style.left = `${relativeLeft + 10}px`;
        break;
      case 'bottom-right':
        indicator.style.bottom = `${containerRect.height - (relativeTop + videoRect.height) + 10}px`;
        indicator.style.right = `${containerRect.width - (relativeLeft + videoRect.width) + 10}px`;
        break;
      case 'center':
        indicator.style.top = `${relativeTop + videoRect.height / 2}px`;
        indicator.style.left = `${relativeLeft + videoRect.width / 2}px`;
        break;
    }
  }

  /**
   * Update status for a specific video indicator
   * @param {string} videoId - Video identifier
   * @param {string} status - Status type
   * @param {Object} details - Additional status details
   */
  updateIndicatorStatus(videoId, status, details = {}) {
    const indicator = this.indicators.get(videoId);
    if (!indicator || !this.settings.showIndicators) {
      return;
    }

    const statusInfo = this.statusTypes[status] || this.statusTypes.inactive;
    
    // Update indicator content
    const icon = document.createElement('span');
    icon.className = 'vt-icon';
    icon.textContent = statusInfo.icon;

    const text = document.createElement('span');
    text.textContent = details.message || statusInfo.message;

    indicator.innerHTML = '';
    indicator.appendChild(icon);
    indicator.appendChild(text);

    // Update classes
    indicator.className = `vt-status-indicator ${this.settings.indicatorSize} ${this.settings.indicatorPosition}`;
    
    if (statusInfo.animated && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      indicator.classList.add('animated');
    }

    // Add status-specific classes
    if (status === 'error') {
      indicator.classList.add('error');
    } else if (status === 'displaying') {
      indicator.classList.add('success');
    } else if (status === 'rate-limited') {
      indicator.classList.add('warning');
    }

    // Update accessibility attributes
    indicator.setAttribute('aria-label', details.ariaLabel || statusInfo.ariaLabel);
    indicator.style.color = statusInfo.color;

    // Update tooltip
    const tooltip = indicator.querySelector('.vt-status-tooltip');
    if (tooltip && this.settings.showTooltips) {
      tooltip.textContent = details.tooltip || statusInfo.message;
    }

    // Auto-hide certain statuses
    if (status === 'displaying' && details.duration) {
      setTimeout(() => {
        this.updateIndicatorStatus(videoId, 'listening');
      }, details.duration);
    }
  }

  /**
   * Show global status indicator
   * @param {string} status - Status type
   * @param {Object} details - Status details
   */
  showGlobalStatus(status, details = {}) {
    if (!this.globalIndicator) {
      this.createGlobalIndicator();
    }

    const statusInfo = this.statusTypes[status] || this.statusTypes.inactive;
    
    // Update content
    const content = `
      <div style="display: flex; align-items: center;">
        <span class="vt-icon" style="margin-right: 8px;">${statusInfo.icon}</span>
        <span>${details.message || statusInfo.message}</span>
      </div>
    `;

    let detailsHtml = '';
    if (details.videoCount !== undefined) {
      detailsHtml += `<div class="vt-status-details">Videos: ${details.videoCount}</div>`;
    }

    if (status === 'error' && details.error) {
      detailsHtml += `
        <div class="vt-error-details">
          <div style="color: #ffcdd2;">${details.error}</div>
      `;
      
      if (details.suggestions && details.suggestions.length > 0) {
        detailsHtml += `
          <div class="vt-recovery-suggestions">
            <strong>Try:</strong>
            <ul>
              ${details.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
            </ul>
          </div>
        `;
      }
      
      detailsHtml += '</div>';
    }

    this.globalIndicator.innerHTML = content + detailsHtml;
    
    // Update classes
    this.globalIndicator.className = 'vt-global-status';
    if (status === 'error') {
      this.globalIndicator.classList.add('error');
    } else if (status === 'displaying') {
      this.globalIndicator.classList.add('success');
    }

    // Show indicator
    this.globalIndicator.classList.remove('hidden');

    // Update accessibility
    this.globalIndicator.setAttribute('aria-label', details.ariaLabel || statusInfo.ariaLabel);

    // Auto-hide after delay for non-error statuses
    if (status !== 'error' && details.autoHide !== false) {
      setTimeout(() => {
        this.hideGlobalStatus();
      }, details.duration || 3000);
    }
  }

  /**
   * Create global status indicator
   */
  createGlobalIndicator() {
    this.globalIndicator = document.createElement('div');
    this.globalIndicator.className = 'vt-global-status hidden';
    this.globalIndicator.setAttribute('role', 'status');
    this.globalIndicator.setAttribute('aria-live', 'polite');
    
    document.body.appendChild(this.globalIndicator);
  }

  /**
   * Hide global status indicator
   */
  hideGlobalStatus() {
    if (this.globalIndicator) {
      this.globalIndicator.classList.add('hidden');
    }
  }

  /**
   * Update indicator appearance based on current settings
   * @param {HTMLElement} indicator - Indicator element
   */
  updateIndicatorAppearance(indicator) {
    // Update size class
    indicator.classList.remove('small', 'medium', 'large');
    indicator.classList.add(this.settings.indicatorSize);

    // Update position class
    indicator.classList.remove('top-left', 'top-right', 'bottom-left', 'bottom-right', 'center');
    indicator.classList.add(this.settings.indicatorPosition);

    // Update tooltip visibility
    const tooltip = indicator.querySelector('.vt-status-tooltip');
    if (tooltip) {
      tooltip.style.display = this.settings.showTooltips ? 'block' : 'none';
    }
  }

  /**
   * Show error with recovery options
   * @param {Object} errorInfo - Error information from ErrorHandler
   */
  showError(errorInfo) {
    // Show on global indicator
    this.showGlobalStatus('error', {
      message: errorInfo.userMessage,
      error: errorInfo.userMessage,
      suggestions: errorInfo.suggestions,
      ariaLabel: `Error: ${errorInfo.userMessage}`,
      autoHide: false
    });

    // Update video indicators if specific to a video
    if (errorInfo.metadata && errorInfo.metadata.videoId) {
      this.updateIndicatorStatus(errorInfo.metadata.videoId, 'error', {
        message: 'Error',
        tooltip: errorInfo.userMessage,
        ariaLabel: `Error: ${errorInfo.userMessage}`
      });
    }
  }

  /**
   * Remove indicator for a video
   * @param {string} videoId - Video identifier
   */
  removeIndicator(videoId) {
    const indicator = this.indicators.get(videoId);
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
    this.indicators.delete(videoId);
  }

  /**
   * Hide all indicators
   */
  hideAllIndicators() {
    this.indicators.forEach(indicator => {
      indicator.classList.add('hidden');
    });
    this.hideGlobalStatus();
  }

  /**
   * Show all indicators
   */
  showAllIndicators() {
    this.indicators.forEach(indicator => {
      indicator.classList.remove('hidden');
    });
  }

  /**
   * Get current status
   * @returns {Object} Current status information
   */
  getCurrentStatus() {
    return {
      ...this.currentStatus,
      indicatorCount: this.indicators.size,
      globalVisible: this.globalIndicator && !this.globalIndicator.classList.contains('hidden')
    };
  }

  /**
   * Clean up all indicators
   */
  cleanup() {
    // Remove all video indicators
    this.indicators.forEach((indicator, videoId) => {
      this.removeIndicator(videoId);
    });

    // Remove global indicator
    if (this.globalIndicator && this.globalIndicator.parentNode) {
      this.globalIndicator.parentNode.removeChild(this.globalIndicator);
      this.globalIndicator = null;
    }

    // Remove styles
    const styleSheet = document.getElementById('video-translator-status-styles');
    if (styleSheet && styleSheet.parentNode) {
      styleSheet.parentNode.removeChild(styleSheet);
    }

    // Remove accessibility class
    document.body.classList.remove('vt-accessibility-mode');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StatusIndicator;
} else if (typeof window !== 'undefined') {
  window.StatusIndicator = StatusIndicator;
}