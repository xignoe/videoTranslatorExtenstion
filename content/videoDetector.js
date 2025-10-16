/**
 * VideoDetector - Detects and monitors video elements on web pages
 * Uses MutationObserver to detect dynamically added videos
 */
class VideoDetector {
  constructor() {
    this.detectedVideos = new Map();
    this.observers = [];
    this.callbacks = {
      onVideoAdded: null,
      onVideoRemoved: null
    };
    
    // Video selectors for different types of video elements
    this.videoSelectors = [
      'video',
      'video[src]',
      'video source',
      'audio',
      'audio[src]',
      'iframe[src*="youtube.com"]',
      'iframe[src*="youtu.be"]',
      'iframe[src*="vimeo.com"]',
      'iframe[src*="netflix.com"]',
      'iframe[src*="hulu.com"]',
      'iframe[src*="twitch.tv"]',
      'iframe[data-video-id]',
      'iframe[data-player]'
    ];
    
    // Platform-specific detection patterns
    this.platformPatterns = {
      youtube: {
        selectors: [
          'video[src*="googlevideo.com"]',
          'video[src*="youtube.com"]',
          '.html5-video-player video',
          '#movie_player video',
          'iframe[src*="youtube.com"]',
          'iframe[src*="youtu.be"]'
        ],
        containerSelectors: [
          '.html5-video-player',
          '#movie_player',
          '.ytp-html5-video-container'
        ]
      },
      netflix: {
        selectors: [
          'video[src*="netflix.com"]',
          '.VideoContainer video',
          '.watch-video video',
          'iframe[src*="netflix.com"]'
        ],
        containerSelectors: [
          '.VideoContainer',
          '.watch-video'
        ]
      },
      vimeo: {
        selectors: [
          'video[src*="vimeo.com"]',
          'video[src*="vimeocdn.com"]',
          'iframe[src*="vimeo.com"]'
        ],
        containerSelectors: [
          '.vp-video-wrapper',
          '.player'
        ]
      },
      twitch: {
        selectors: [
          'video[src*="twitch.tv"]',
          'video[src*="ttvnw.net"]',
          'iframe[src*="twitch.tv"]'
        ],
        containerSelectors: [
          '.video-player',
          '.player-video'
        ]
      },
      hulu: {
        selectors: [
          'video[src*="hulu.com"]',
          'video[src*="hulustream.com"]',
          'iframe[src*="hulu.com"]'
        ],
        containerSelectors: [
          '.video-player',
          '.player-container'
        ]
      },
      generic: {
        selectors: [
          'iframe[src*="player"]',
          'iframe[data-video]',
          'iframe[data-player]',
          'embed[src*="video"]',
          'object[data*="video"]'
        ]
      }
    };
  }

  /**
   * Initialize video detection
   * @param {Object} callbacks - Callback functions for video events
   * @param {Function} callbacks.onVideoAdded - Called when a video is detected
   * @param {Function} callbacks.onVideoRemoved - Called when a video is removed
   */
  initialize(callbacks = {}) {
    this.callbacks = { ...this.callbacks, ...callbacks };
    
    // Scan for existing videos
    this.scanForVideos();
    
    // Set up mutation observer for dynamic content
    this.setupMutationObserver();
    
    console.log('[VideoDetector] Initialized with', this.detectedVideos.size, 'videos detected');
  }

  /**
   * Scan the current DOM for video elements
   */
  scanForVideos() {
    const videos = this.findVideoElements();
    
    videos.forEach(video => {
      if (!this.detectedVideos.has(video)) {
        this.addVideo(video);
      }
    });
  }

  /**
   * Find all video elements in the DOM
   * @returns {Array<HTMLElement>} Array of video elements
   */
  findVideoElements() {
    const videos = [];
    
    // Find standard video and audio elements
    const standardSelectors = [
      'video',
      'video[src]',
      'video source',
      'audio',
      'audio[src]'
    ];
    
    standardSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (this.isValidVideoElement(element)) {
          videos.push(element);
        }
      });
    });
    
    // Find platform-specific video elements
    videos.push(...this.findPlatformSpecificVideos());
    
    // Find iframe-embedded videos
    videos.push(...this.findIframeVideos());
    
    // Remove duplicates
    return [...new Set(videos)];
  }

  /**
   * Find platform-specific video elements
   * @returns {Array<HTMLElement>} Array of platform-specific video elements
   */
  findPlatformSpecificVideos() {
    const videos = [];
    const currentDomain = window.location.hostname.toLowerCase();
    
    // Detect current platform
    const platform = this.detectPlatform(currentDomain);
    
    if (platform && this.platformPatterns[platform]) {
      const patterns = this.platformPatterns[platform];
      
      // Search using platform-specific selectors
      patterns.selectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            if (this.isValidVideoElement(element)) {
              videos.push(element);
            }
          });
        } catch (error) {
          console.warn(`[VideoDetector] Invalid selector: ${selector}`, error);
        }
      });
      
      // Search within platform-specific containers
      if (patterns.containerSelectors) {
        patterns.containerSelectors.forEach(containerSelector => {
          try {
            const containers = document.querySelectorAll(containerSelector);
            containers.forEach(container => {
              const videoElements = container.querySelectorAll('video, audio');
              videoElements.forEach(element => {
                if (this.isValidVideoElement(element)) {
                  videos.push(element);
                }
              });
            });
          } catch (error) {
            console.warn(`[VideoDetector] Invalid container selector: ${containerSelector}`, error);
          }
        });
      }
    }
    
    return videos;
  }

  /**
   * Find iframe-embedded videos
   * @returns {Array<HTMLElement>} Array of iframe elements containing videos
   */
  findIframeVideos() {
    const iframes = [];
    
    // Find iframes that likely contain video content
    const iframeSelectors = [
      'iframe[src*="youtube.com"]',
      'iframe[src*="youtu.be"]',
      'iframe[src*="vimeo.com"]',
      'iframe[src*="netflix.com"]',
      'iframe[src*="hulu.com"]',
      'iframe[src*="twitch.tv"]',
      'iframe[data-video-id]',
      'iframe[data-player]',
      'iframe[src*="player"]',
      'iframe[src*="embed"]'
    ];
    
    iframeSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(iframe => {
          if (this.isValidIframeVideo(iframe)) {
            iframes.push(iframe);
          }
        });
      } catch (error) {
        console.warn(`[VideoDetector] Invalid iframe selector: ${selector}`, error);
      }
    });
    
    return iframes;
  }

  /**
   * Detect the current platform based on domain
   * @param {string} domain - Current domain
   * @returns {string|null} Platform name or null
   */
  detectPlatform(domain) {
    if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
      return 'youtube';
    }
    if (domain.includes('netflix.com')) {
      return 'netflix';
    }
    if (domain.includes('vimeo.com')) {
      return 'vimeo';
    }
    if (domain.includes('twitch.tv')) {
      return 'twitch';
    }
    if (domain.includes('hulu.com')) {
      return 'hulu';
    }
    return null;
  }

  /**
   * Detect the platform for a specific element
   * @param {HTMLElement} element - Video element
   * @returns {string|null} Platform name or null
   */
  detectElementPlatform(element) {
    const src = this.getVideoSource(element).toLowerCase();
    const className = element.className.toLowerCase();
    const parentClasses = element.parentElement ? element.parentElement.className.toLowerCase() : '';
    
    // Check source URL for platform indicators
    if (src.includes('youtube.com') || src.includes('youtu.be') || src.includes('googlevideo.com')) {
      return 'youtube';
    }
    if (src.includes('netflix.com')) {
      return 'netflix';
    }
    if (src.includes('vimeo.com') || src.includes('vimeocdn.com')) {
      return 'vimeo';
    }
    if (src.includes('twitch.tv') || src.includes('ttvnw.net')) {
      return 'twitch';
    }
    if (src.includes('hulu.com') || src.includes('hulustream.com')) {
      return 'hulu';
    }
    
    // Check class names for platform indicators
    if (className.includes('youtube') || parentClasses.includes('youtube')) {
      return 'youtube';
    }
    if (className.includes('netflix') || parentClasses.includes('netflix')) {
      return 'netflix';
    }
    if (className.includes('vimeo') || parentClasses.includes('vimeo')) {
      return 'vimeo';
    }
    if (className.includes('twitch') || parentClasses.includes('twitch')) {
      return 'twitch';
    }
    if (className.includes('hulu') || parentClasses.includes('hulu')) {
      return 'hulu';
    }
    
    // Check current page domain as fallback
    return this.detectPlatform(window.location.hostname.toLowerCase());
  }

  /**
   * Check if an element is a valid video element for processing
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if element is a valid video
   */
  isValidVideoElement(element) {
    if (!element) return false;
    
    // Check if it's a video, audio, or iframe element
    const tagName = element.tagName.toLowerCase();
    if (!['video', 'audio', 'iframe'].includes(tagName)) return false;
    
    // Special handling for iframes
    if (tagName === 'iframe') {
      return this.isValidIframeVideo(element);
    }
    
    // Check if element has dimensions (not hidden)
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    
    // Check if element is visible
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    
    return true;
  }

  /**
   * Check if an iframe element contains video content
   * @param {HTMLElement} iframe - Iframe element to check
   * @returns {boolean} True if iframe likely contains video
   */
  isValidIframeVideo(iframe) {
    if (!iframe || iframe.tagName.toLowerCase() !== 'iframe') return false;
    
    // Check if element has dimensions (not hidden)
    const rect = iframe.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    
    // Check if element is visible
    const style = window.getComputedStyle(iframe);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    
    const src = iframe.src || '';
    const dataSrc = iframe.getAttribute('data-src') || '';
    const combinedSrc = (src + ' ' + dataSrc).toLowerCase();
    
    // Check for video-related URLs or attributes
    const videoIndicators = [
      'youtube.com', 'youtu.be', 'vimeo.com', 'netflix.com', 
      'hulu.com', 'twitch.tv', 'player', 'embed', 'video'
    ];
    
    const hasVideoIndicator = videoIndicators.some(indicator => 
      combinedSrc.includes(indicator)
    );
    
    // Check for video-related data attributes
    const hasVideoAttributes = iframe.hasAttribute('data-video-id') ||
                              iframe.hasAttribute('data-player') ||
                              iframe.hasAttribute('data-video') ||
                              iframe.className.toLowerCase().includes('video') ||
                              iframe.className.toLowerCase().includes('player');
    
    return hasVideoIndicator || hasVideoAttributes;
  }

  /**
   * Add a video to the detected videos collection
   * @param {HTMLElement} videoElement - Video element to add
   */
  addVideo(videoElement) {
    const videoId = this.generateVideoId(videoElement);
    
    const tagName = videoElement.tagName.toLowerCase();
    const videoInfo = {
      id: videoId,
      element: videoElement,
      tagName: tagName,
      src: this.getVideoSource(videoElement),
      platform: this.detectElementPlatform(videoElement),
      isPlaying: tagName === 'iframe' ? null : !videoElement.paused, // iframes can't report playing state
      currentTime: tagName === 'iframe' ? null : (videoElement.currentTime || 0),
      duration: tagName === 'iframe' ? null : (videoElement.duration || 0),
      detectedAt: Date.now()
    };
    
    this.detectedVideos.set(videoElement, videoInfo);
    
    // Set up event listeners for this video
    this.setupVideoEventListeners(videoElement);
    
    // Notify callback
    if (this.callbacks.onVideoAdded) {
      this.callbacks.onVideoAdded(videoInfo);
    }
    
    console.log('[VideoDetector] Added video:', videoId, videoInfo);
  }

  /**
   * Remove a video from the detected videos collection
   * @param {HTMLElement} videoElement - Video element to remove
   */
  removeVideo(videoElement) {
    const videoInfo = this.detectedVideos.get(videoElement);
    if (!videoInfo) return;
    
    // Clean up event listeners
    this.cleanupVideoEventListeners(videoElement);
    
    // Remove from collection
    this.detectedVideos.delete(videoElement);
    
    // Notify callback
    if (this.callbacks.onVideoRemoved) {
      this.callbacks.onVideoRemoved(videoInfo);
    }
    
    console.log('[VideoDetector] Removed video:', videoInfo.id);
  }

  /**
   * Generate a unique ID for a video element
   * @param {HTMLElement} videoElement - Video element
   * @returns {string} Unique video ID
   */
  generateVideoId(videoElement) {
    // Try to use existing ID or create one based on element properties
    if (videoElement.id) {
      return `video_${videoElement.id}`;
    }
    
    const src = this.getVideoSource(videoElement);
    const rect = videoElement.getBoundingClientRect();
    const hash = this.simpleHash(`${src}_${rect.left}_${rect.top}_${rect.width}_${rect.height}`);
    
    return `video_${hash}_${Date.now()}`;
  }

  /**
   * Get the source URL of a video element
   * @param {HTMLElement} videoElement - Video element
   * @returns {string} Video source URL
   */
  getVideoSource(videoElement) {
    const tagName = videoElement.tagName.toLowerCase();
    
    // Handle iframe elements
    if (tagName === 'iframe') {
      return videoElement.src || 
             videoElement.getAttribute('data-src') || 
             'iframe-embedded';
    }
    
    // Check direct src attribute
    if (videoElement.src) {
      return videoElement.src;
    }
    
    // Check source elements
    const sourceElement = videoElement.querySelector('source');
    if (sourceElement && sourceElement.src) {
      return sourceElement.src;
    }
    
    // Check currentSrc property
    if (videoElement.currentSrc) {
      return videoElement.currentSrc;
    }
    
    return 'unknown';
  }

  /**
   * Set up mutation observer to detect dynamically added videos
   */
  setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Handle added nodes
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.handleAddedNode(node);
          }
        });
        
        // Handle removed nodes
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.handleRemovedNode(node);
          }
        });
        
        // Handle attribute changes that might affect video visibility
        if (mutation.type === 'attributes' && mutation.target) {
          this.handleAttributeChange(mutation.target, mutation.attributeName);
        }
      });
    });
    
    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'style', 'class', 'hidden']
    });
    
    this.observers.push(observer);
    console.log('[VideoDetector] MutationObserver set up');
  }

  /**
   * Handle newly added DOM nodes
   * @param {Node} node - Added node
   */
  handleAddedNode(node) {
    // Check if the node itself is a video
    if (this.isValidVideoElement(node)) {
      this.addVideo(node);
    }
    
    // Check for video elements within the added node
    if (node.querySelectorAll) {
      const videos = this.findVideoElementsInNode(node);
      videos.forEach(video => {
        if (!this.detectedVideos.has(video)) {
          this.addVideo(video);
        }
      });
    }
  }

  /**
   * Handle removed DOM nodes
   * @param {Node} node - Removed node
   */
  handleRemovedNode(node) {
    // Check if any detected videos were in the removed node
    this.detectedVideos.forEach((videoInfo, videoElement) => {
      if (!document.contains(videoElement)) {
        this.removeVideo(videoElement);
      }
    });
  }

  /**
   * Handle attribute changes that might affect video detection
   * @param {Element} element - Element with changed attributes
   * @param {string} attributeName - Name of changed attribute
   */
  handleAttributeChange(element, attributeName) {
    if (['src', 'style', 'class', 'hidden'].includes(attributeName)) {
      // Re-evaluate if this element should be detected as a video
      if (this.isValidVideoElement(element) && !this.detectedVideos.has(element)) {
        this.addVideo(element);
      } else if (!this.isValidVideoElement(element) && this.detectedVideos.has(element)) {
        this.removeVideo(element);
      }
    }
  }

  /**
   * Find video elements within a specific node
   * @param {Node} node - Node to search within
   * @returns {Array<HTMLElement>} Array of video elements
   */
  findVideoElementsInNode(node) {
    const videos = [];
    
    this.videoSelectors.forEach(selector => {
      const elements = node.querySelectorAll ? node.querySelectorAll(selector) : [];
      elements.forEach(element => {
        if (this.isValidVideoElement(element)) {
          videos.push(element);
        }
      });
    });
    
    return videos;
  }

  /**
   * Set up event listeners for a video element
   * @param {HTMLElement} videoElement - Video element
   */
  setupVideoEventListeners(videoElement) {
    const tagName = videoElement.tagName.toLowerCase();
    
    // iframes have limited event access, so we set up different listeners
    if (tagName === 'iframe') {
      this.setupIframeEventListeners(videoElement);
    } else {
      // Standard video/audio elements
      const events = ['play', 'pause', 'ended', 'loadstart', 'canplay', 'timeupdate'];
      
      events.forEach(eventType => {
        videoElement.addEventListener(eventType, (event) => {
          this.handleVideoEvent(event);
        });
      });
    }
  }

  /**
   * Set up event listeners for iframe elements
   * @param {HTMLElement} iframeElement - Iframe element
   */
  setupIframeEventListeners(iframeElement) {
    // For iframes, we can only listen to load events and intersection changes
    const events = ['load', 'error'];
    
    events.forEach(eventType => {
      iframeElement.addEventListener(eventType, (event) => {
        this.handleIframeEvent(event);
      });
    });
    
    // Set up intersection observer to detect when iframe is visible
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.target === iframeElement) {
            this.handleIframeVisibilityChange(entry);
          }
        });
      });
      
      observer.observe(iframeElement);
      
      // Store observer reference for cleanup
      if (!iframeElement._videoDetectorObserver) {
        iframeElement._videoDetectorObserver = observer;
      }
    }
  }

  /**
   * Handle iframe-specific events
   * @param {Event} event - Iframe event
   */
  handleIframeEvent(event) {
    const iframeElement = event.target;
    const videoInfo = this.detectedVideos.get(iframeElement);
    
    if (videoInfo) {
      console.log(`[VideoDetector] Iframe event: ${event.type} for ${videoInfo.id}`);
      
      // Update iframe status based on event
      if (event.type === 'load') {
        videoInfo.loaded = true;
      } else if (event.type === 'error') {
        videoInfo.error = true;
      }
    }
  }

  /**
   * Handle iframe visibility changes
   * @param {IntersectionObserverEntry} entry - Intersection observer entry
   */
  handleIframeVisibilityChange(entry) {
    const iframeElement = entry.target;
    const videoInfo = this.detectedVideos.get(iframeElement);
    
    if (videoInfo) {
      videoInfo.isVisible = entry.isIntersecting;
      videoInfo.visibilityRatio = entry.intersectionRatio;
      
      console.log(`[VideoDetector] Iframe visibility changed: ${videoInfo.id} - visible: ${entry.isIntersecting}`);
    }
  }

  /**
   * Clean up event listeners for a video element
   * @param {HTMLElement} videoElement - Video element
   */
  cleanupVideoEventListeners(videoElement) {
    // Clean up intersection observer for iframes
    if (videoElement._videoDetectorObserver) {
      videoElement._videoDetectorObserver.disconnect();
      delete videoElement._videoDetectorObserver;
    }
    
    // Note: In a real implementation, we'd need to store references to the event handlers
    // to properly remove them. For now, this is a placeholder.
    console.log('[VideoDetector] Cleaning up event listeners for video');
  }

  /**
   * Handle video events
   * @param {Event} event - Video event
   */
  handleVideoEvent(event) {
    const videoElement = event.target;
    const videoInfo = this.detectedVideos.get(videoElement);
    
    if (videoInfo) {
      // Update video info based on event
      videoInfo.isPlaying = !videoElement.paused;
      videoInfo.currentTime = videoElement.currentTime || 0;
      videoInfo.duration = videoElement.duration || 0;
      
      console.log(`[VideoDetector] Video event: ${event.type} for ${videoInfo.id}`);
    }
  }

  /**
   * Get all currently detected videos
   * @returns {Array<Object>} Array of video information objects
   */
  getDetectedVideos() {
    return Array.from(this.detectedVideos.values());
  }

  /**
   * Get video information by element
   * @param {HTMLElement} videoElement - Video element
   * @returns {Object|null} Video information object
   */
  getVideoInfo(videoElement) {
    return this.detectedVideos.get(videoElement) || null;
  }

  /**
   * Simple hash function for generating IDs
   * @param {string} str - String to hash
   * @returns {string} Hash value
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Destroy the video detector and clean up resources
   */
  destroy() {
    // Stop all observers
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    
    // Clean up all video event listeners
    this.detectedVideos.forEach((videoInfo, videoElement) => {
      this.cleanupVideoEventListeners(videoElement);
    });
    
    // Clear detected videos
    this.detectedVideos.clear();
    
    console.log('[VideoDetector] Destroyed');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VideoDetector;
}