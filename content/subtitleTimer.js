/**
 * SubtitleTimer - Handles timing and synchronization of subtitles with video playback
 * Ensures subtitles appear within 2-second requirement and handles video state changes
 */
class SubtitleTimer {
  constructor(subtitleRenderer) {
    this.subtitleRenderer = subtitleRenderer;
    this.videoTimers = new Map(); // videoId -> timer data
    this.subtitleQueue = new Map(); // videoId -> subtitle queue
    this.syncThreshold = 2000; // 2 second synchronization requirement
    this.cleanupInterval = 30000; // Clean up old subtitles every 30 seconds
  }

  /**
   * Initialize timing system for a video
   * @param {HTMLVideoElement} videoElement - The video element
   * @param {string} videoId - Unique identifier for the video
   */
  initializeForVideo(videoElement, videoId) {
    if (this.videoTimers.has(videoId)) {
      console.warn(`Timer already initialized for video: ${videoId}`);
      return;
    }

    const timerData = {
      videoElement,
      isPlaying: false,
      currentTime: 0,
      playbackRate: 1,
      lastSyncTime: 0,
      pendingSubtitles: [],
      activeSubtitle: null,
      eventListeners: new Map()
    };

    this.videoTimers.set(videoId, timerData);
    this.subtitleQueue.set(videoId, []);
    
    this.setupVideoEventListeners(videoElement, videoId);
    this.startSyncMonitoring(videoId);
    
    console.log(`Subtitle timer initialized for video: ${videoId}`);
  }

  /**
   * Set up video event listeners for timing synchronization
   * @param {HTMLVideoElement} videoElement - Video element
   * @param {string} videoId - Video identifier
   */
  setupVideoEventListeners(videoElement, videoId) {
    const timerData = this.videoTimers.get(videoId);
    
    const listeners = {
      play: () => this.handleVideoPlay(videoId),
      pause: () => this.handleVideoPause(videoId),
      seeked: () => this.handleVideoSeeked(videoId),
      timeupdate: () => this.handleTimeUpdate(videoId),
      ratechange: () => this.handleRateChange(videoId),
      ended: () => this.handleVideoEnded(videoId),
      loadstart: () => this.handleVideoLoadStart(videoId)
    };

    // Add event listeners and store references for cleanup
    Object.entries(listeners).forEach(([event, handler]) => {
      videoElement.addEventListener(event, handler);
      timerData.eventListeners.set(event, handler);
    });
  }

  /**
   * Handle video play event
   * @param {string} videoId - Video identifier
   */
  handleVideoPlay(videoId) {
    const timerData = this.videoTimers.get(videoId);
    if (!timerData) return;

    timerData.isPlaying = true;
    timerData.lastSyncTime = Date.now();
    
    // Resume subtitle display if there are queued subtitles
    this.processSubtitleQueue(videoId);
    
    console.log(`Video ${videoId} started playing`);
  }

  /**
   * Handle video pause event
   * @param {string} videoId - Video identifier
   */
  handleVideoPause(videoId) {
    const timerData = this.videoTimers.get(videoId);
    if (!timerData) return;

    timerData.isPlaying = false;
    
    // Keep current subtitle visible but stop processing queue
    console.log(`Video ${videoId} paused`);
  }

  /**
   * Handle video seek event
   * @param {string} videoId - Video identifier
   */
  handleVideoSeeked(videoId) {
    const timerData = this.videoTimers.get(videoId);
    if (!timerData) return;

    const currentTime = timerData.videoElement.currentTime;
    timerData.currentTime = currentTime;
    timerData.lastSyncTime = Date.now();
    
    // Clear current subtitle and find appropriate subtitle for new time
    this.subtitleRenderer.clearSubtitle(videoId);
    this.syncSubtitleToTime(videoId, currentTime);
    
    console.log(`Video ${videoId} seeked to ${currentTime}s`);
  }

  /**
   * Handle video time update event
   * @param {string} videoId - Video identifier
   */
  handleTimeUpdate(videoId) {
    const timerData = this.videoTimers.get(videoId);
    if (!timerData) return;

    const currentTime = timerData.videoElement.currentTime;
    timerData.currentTime = currentTime;
    
    // Check if we need to sync subtitles
    const timeSinceLastSync = Date.now() - timerData.lastSyncTime;
    if (timeSinceLastSync > 1000) { // Sync every second
      this.syncSubtitleToTime(videoId, currentTime);
      timerData.lastSyncTime = Date.now();
    }
  }

  /**
   * Handle video playback rate change
   * @param {string} videoId - Video identifier
   */
  handleRateChange(videoId) {
    const timerData = this.videoTimers.get(videoId);
    if (!timerData) return;

    timerData.playbackRate = timerData.videoElement.playbackRate;
    
    // Adjust subtitle timing for new playback rate
    this.adjustSubtitleTimingForRate(videoId, timerData.playbackRate);
    
    console.log(`Video ${videoId} playback rate changed to ${timerData.playbackRate}x`);
  }

  /**
   * Handle video ended event
   * @param {string} videoId - Video identifier
   */
  handleVideoEnded(videoId) {
    const timerData = this.videoTimers.get(videoId);
    if (!timerData) return;

    timerData.isPlaying = false;
    this.subtitleRenderer.clearSubtitle(videoId);
    
    console.log(`Video ${videoId} ended`);
  }

  /**
   * Handle video load start event
   * @param {string} videoId - Video identifier
   */
  handleVideoLoadStart(videoId) {
    // Clear all subtitles when video starts loading new content
    this.clearSubtitleQueue(videoId);
    this.subtitleRenderer.clearSubtitle(videoId);
  }

  /**
   * Queue subtitle for display at specific time
   * @param {string} videoId - Video identifier
   * @param {Object} subtitle - Subtitle data
   * @param {string} subtitle.text - Subtitle text
   * @param {number} subtitle.startTime - Start time in seconds
   * @param {number} subtitle.endTime - End time in seconds
   * @param {number} subtitle.confidence - Recognition confidence (0-1)
   */
  queueSubtitle(videoId, subtitle) {
    const queue = this.subtitleQueue.get(videoId);
    const timerData = this.videoTimers.get(videoId);
    
    if (!queue || !timerData) {
      console.warn(`No timer data found for video: ${videoId}`);
      return;
    }

    // Add timestamp for synchronization tracking
    subtitle.queueTime = Date.now();
    subtitle.id = `${videoId}_${subtitle.startTime}_${Date.now()}`;
    
    // Insert subtitle in chronological order
    const insertIndex = queue.findIndex(s => s.startTime > subtitle.startTime);
    if (insertIndex === -1) {
      queue.push(subtitle);
    } else {
      queue.splice(insertIndex, 0, subtitle);
    }

    // If video is playing and subtitle should be shown now, display it
    if (timerData.isPlaying) {
      this.processSubtitleQueue(videoId);
    }

    console.log(`Subtitle queued for video ${videoId} at ${subtitle.startTime}s`);
  }

  /**
   * Process subtitle queue for a video
   * @param {string} videoId - Video identifier
   */
  processSubtitleQueue(videoId) {
    const queue = this.subtitleQueue.get(videoId);
    const timerData = this.videoTimers.get(videoId);
    
    if (!queue || !timerData || !timerData.isPlaying) {
      return;
    }

    const currentTime = timerData.currentTime;
    const currentTimestamp = Date.now();
    
    // Find subtitles that should be displayed now
    const activeSubtitles = queue.filter(subtitle => {
      const shouldStart = currentTime >= subtitle.startTime;
      const shouldEnd = currentTime <= subtitle.endTime;
      const timeSinceQueue = currentTimestamp - subtitle.queueTime;
      
      // Only apply sync threshold to prevent very old subtitles (more than 10 seconds old)
      // This allows for processing delays while preventing stale subtitles
      const withinSyncThreshold = timeSinceQueue <= 10000; // 10 seconds
      
      return shouldStart && shouldEnd && withinSyncThreshold;
    });

    // Display the most recent appropriate subtitle
    if (activeSubtitles.length > 0) {
      const latestSubtitle = activeSubtitles[activeSubtitles.length - 1];
      
      // Only update if it's different from current subtitle
      if (!timerData.activeSubtitle || timerData.activeSubtitle.id !== latestSubtitle.id) {
        this.displayTimedSubtitle(videoId, latestSubtitle);
        timerData.activeSubtitle = latestSubtitle;
      }
    } else if (timerData.activeSubtitle) {
      // Clear subtitle if no active subtitle should be shown
      const activeEndTime = timerData.activeSubtitle.endTime;
      if (currentTime > activeEndTime) {
        this.subtitleRenderer.clearSubtitle(videoId);
        timerData.activeSubtitle = null;
      }
    }

    // Clean up old subtitles from queue
    this.cleanupOldSubtitles(videoId, currentTime);
  }

  /**
   * Display subtitle with timing information
   * @param {string} videoId - Video identifier
   * @param {Object} subtitle - Subtitle data
   */
  displayTimedSubtitle(videoId, subtitle) {
    const timerData = this.videoTimers.get(videoId);
    if (!timerData) return;

    // Calculate display duration based on subtitle timing
    const duration = (subtitle.endTime - subtitle.startTime) * 1000; // Convert to milliseconds
    const adjustedDuration = duration / timerData.playbackRate; // Adjust for playback rate
    
    // Add confidence indicator if low confidence
    let displayText = subtitle.text;
    if (subtitle.confidence < 0.7) {
      displayText = `${subtitle.text} [?]`;
    }

    this.subtitleRenderer.displaySubtitle(videoId, displayText, {
      duration: adjustedDuration,
      confidence: subtitle.confidence,
      startTime: subtitle.startTime,
      endTime: subtitle.endTime
    });
  }

  /**
   * Sync subtitle to specific video time
   * @param {string} videoId - Video identifier
   * @param {number} currentTime - Current video time in seconds
   */
  syncSubtitleToTime(videoId, currentTime) {
    const queue = this.subtitleQueue.get(videoId);
    if (!queue) return;

    // Find subtitle that should be active at current time
    const activeSubtitle = queue.find(subtitle => 
      currentTime >= subtitle.startTime && currentTime <= subtitle.endTime
    );

    if (activeSubtitle) {
      this.displayTimedSubtitle(videoId, activeSubtitle);
    } else {
      this.subtitleRenderer.clearSubtitle(videoId);
    }
  }

  /**
   * Adjust subtitle timing for playback rate changes
   * @param {string} videoId - Video identifier
   * @param {number} playbackRate - New playback rate
   */
  adjustSubtitleTimingForRate(videoId, playbackRate) {
    const timerData = this.videoTimers.get(videoId);
    if (!timerData || !timerData.activeSubtitle) return;

    // Recalculate duration for current subtitle
    const subtitle = timerData.activeSubtitle;
    const remainingTime = subtitle.endTime - timerData.currentTime;
    const adjustedDuration = (remainingTime * 1000) / playbackRate;

    // Update current subtitle with new timing
    this.displayTimedSubtitle(videoId, subtitle);
  }

  /**
   * Clean up old subtitles from queue
   * @param {string} videoId - Video identifier
   * @param {number} currentTime - Current video time
   */
  cleanupOldSubtitles(videoId, currentTime) {
    const queue = this.subtitleQueue.get(videoId);
    if (!queue) return;

    // Remove subtitles that are more than 30 seconds old
    const cutoffTime = currentTime - 30;
    const initialLength = queue.length;
    
    // Keep only recent subtitles
    const filteredQueue = queue.filter(subtitle => subtitle.endTime > cutoffTime);
    
    if (filteredQueue.length !== initialLength) {
      this.subtitleQueue.set(videoId, filteredQueue);
      console.log(`Cleaned up ${initialLength - filteredQueue.length} old subtitles for video ${videoId}`);
    }
  }

  /**
   * Clear subtitle queue for a video
   * @param {string} videoId - Video identifier
   */
  clearSubtitleQueue(videoId) {
    const queue = this.subtitleQueue.get(videoId);
    if (queue) {
      queue.length = 0;
      console.log(`Cleared subtitle queue for video: ${videoId}`);
    }
  }

  /**
   * Start sync monitoring for a video
   * @param {string} videoId - Video identifier
   */
  startSyncMonitoring(videoId) {
    const timerData = this.videoTimers.get(videoId);
    if (!timerData) return;

    // Set up periodic sync checking
    const syncInterval = setInterval(() => {
      if (timerData.isPlaying) {
        this.processSubtitleQueue(videoId);
      }
    }, 500); // Check every 500ms for smooth synchronization

    timerData.syncInterval = syncInterval;
  }

  /**
   * Get timing statistics for a video
   * @param {string} videoId - Video identifier
   * @returns {Object} Timing statistics
   */
  getTimingStats(videoId) {
    const timerData = this.videoTimers.get(videoId);
    const queue = this.subtitleQueue.get(videoId);
    
    if (!timerData || !queue) {
      return null;
    }

    return {
      isPlaying: timerData.isPlaying,
      currentTime: timerData.currentTime,
      playbackRate: timerData.playbackRate,
      queueLength: queue.length,
      activeSubtitle: timerData.activeSubtitle,
      lastSyncTime: timerData.lastSyncTime
    };
  }

  /**
   * Clean up timing system for a video
   * @param {string} videoId - Video identifier
   */
  cleanup(videoId) {
    const timerData = this.videoTimers.get(videoId);
    
    if (timerData) {
      // Clear sync interval
      if (timerData.syncInterval) {
        clearInterval(timerData.syncInterval);
      }
      
      // Remove event listeners
      timerData.eventListeners.forEach((handler, event) => {
        timerData.videoElement.removeEventListener(event, handler);
      });
      
      // Clear from maps
      this.videoTimers.delete(videoId);
    }
    
    this.subtitleQueue.delete(videoId);
    
    console.log(`Subtitle timer cleaned up for video: ${videoId}`);
  }

  /**
   * Clean up all timing systems
   */
  cleanupAll() {
    const videoIds = Array.from(this.videoTimers.keys());
    videoIds.forEach(videoId => this.cleanup(videoId));
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SubtitleTimer;
}