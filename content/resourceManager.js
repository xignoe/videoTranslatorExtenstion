/**
 * ResourceManager - Manages extension resources and cleanup
 * Handles memory management, event listener cleanup, and resource optimization
 */
class ResourceManager {
  constructor() {
    this.resources = new Map(); // resourceId -> resource info
    this.eventListeners = new Map(); // element -> listeners array
    this.timers = new Set(); // active timers
    this.audioContexts = new Set(); // active audio contexts
    this.observers = new Set(); // mutation observers, intersection observers, etc.
    this.cleanupCallbacks = new Set(); // custom cleanup functions
    
    this.isCleanupScheduled = false;
    this.cleanupInterval = null;
    this.memoryThreshold = 50 * 1024 * 1024; // 50MB
    
    this.setupPeriodicCleanup();
    this.setupPageUnloadCleanup();
  }

  /**
   * Register a resource for tracking and cleanup
   * @param {string} resourceId - Unique identifier for the resource
   * @param {Object} resourceInfo - Resource information
   */
  registerResource(resourceId, resourceInfo) {
    this.resources.set(resourceId, {
      ...resourceInfo,
      createdAt: Date.now(),
      lastAccessed: Date.now()
    });
  }

  /**
   * Unregister a resource
   * @param {string} resourceId - Resource identifier
   */
  unregisterResource(resourceId) {
    const resource = this.resources.get(resourceId);
    if (resource && resource.cleanup) {
      try {
        resource.cleanup();
      } catch (error) {
        console.error(`Error cleaning up resource ${resourceId}:`, error);
      }
    }
    
    this.resources.delete(resourceId);
  }

  /**
   * Register an event listener for cleanup tracking
   * @param {EventTarget} element - Element with event listener
   * @param {string} event - Event type
   * @param {Function} handler - Event handler
   * @param {Object} options - Event listener options
   */
  registerEventListener(element, event, handler, options = {}) {
    if (!this.eventListeners.has(element)) {
      this.eventListeners.set(element, []);
    }
    
    const listenerInfo = { event, handler, options, addedAt: Date.now() };
    this.eventListeners.get(element).push(listenerInfo);
    
    element.addEventListener(event, handler, options);
  }

  /**
   * Remove and cleanup event listeners for an element
   * @param {EventTarget} element - Element to cleanup
   */
  cleanupEventListeners(element) {
    const listeners = this.eventListeners.get(element);
    if (!listeners) {
      return;
    }
    
    listeners.forEach(({ event, handler, options }) => {
      try {
        element.removeEventListener(event, handler, options);
      } catch (error) {
        console.error('Error removing event listener:', error);
      }
    });
    
    this.eventListeners.delete(element);
  }

  /**
   * Register a timer for cleanup tracking
   * @param {number} timerId - Timer ID from setTimeout/setInterval
   * @param {string} type - 'timeout' or 'interval'
   */
  registerTimer(timerId, type = 'timeout') {
    this.timers.add({ id: timerId, type, createdAt: Date.now() });
  }

  /**
   * Clear and unregister a timer
   * @param {number} timerId - Timer ID
   */
  clearTimer(timerId) {
    const timer = Array.from(this.timers).find(t => t.id === timerId);
    if (timer) {
      if (timer.type === 'interval') {
        clearInterval(timerId);
      } else {
        clearTimeout(timerId);
      }
      this.timers.delete(timer);
    }
  }

  /**
   * Register an audio context for cleanup tracking
   * @param {AudioContext} audioContext - Audio context to track
   */
  registerAudioContext(audioContext) {
    this.audioContexts.add(audioContext);
  }

  /**
   * Close and cleanup an audio context
   * @param {AudioContext} audioContext - Audio context to cleanup
   */
  cleanupAudioContext(audioContext) {
    if (audioContext && audioContext.state !== 'closed') {
      try {
        audioContext.close();
      } catch (error) {
        console.error('Error closing audio context:', error);
      }
    }
    this.audioContexts.delete(audioContext);
  }

  /**
   * Register an observer for cleanup tracking
   * @param {Object} observer - Observer to track (MutationObserver, IntersectionObserver, etc.)
   */
  registerObserver(observer) {
    this.observers.add(observer);
  }

  /**
   * Disconnect and cleanup an observer
   * @param {Object} observer - Observer to cleanup
   */
  cleanupObserver(observer) {
    if (observer && typeof observer.disconnect === 'function') {
      try {
        observer.disconnect();
      } catch (error) {
        console.error('Error disconnecting observer:', error);
      }
    }
    this.observers.delete(observer);
  }

  /**
   * Register a custom cleanup callback
   * @param {Function} callback - Cleanup function
   */
  registerCleanupCallback(callback) {
    this.cleanupCallbacks.add(callback);
  }

  /**
   * Remove a cleanup callback
   * @param {Function} callback - Cleanup function to remove
   */
  unregisterCleanupCallback(callback) {
    this.cleanupCallbacks.delete(callback);
  }

  /**
   * Perform memory optimization
   */
  optimizeMemory() {
    console.log('Performing memory optimization...');
    
    // Clean up old resources
    this.cleanupOldResources();
    
    // Clean up unused event listeners
    this.cleanupUnusedEventListeners();
    
    // Clear expired timers
    this.cleanupExpiredTimers();
    
    // Close unused audio contexts
    this.cleanupUnusedAudioContexts();
    
    // Disconnect unused observers
    this.cleanupUnusedObservers();
    
    // Run custom cleanup callbacks
    this.runCleanupCallbacks();
    
    // Force garbage collection if available (development only)
    if (typeof gc === 'function') {
      gc();
    }
    
    console.log('Memory optimization completed');
  }

  /**
   * Clean up resources that haven't been accessed recently
   */
  cleanupOldResources() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    for (const [resourceId, resource] of this.resources) {
      if (now - resource.lastAccessed > maxAge) {
        console.log(`Cleaning up old resource: ${resourceId}`);
        this.unregisterResource(resourceId);
      }
    }
  }

  /**
   * Clean up event listeners on elements that are no longer in the DOM
   */
  cleanupUnusedEventListeners() {
    for (const [element, listeners] of this.eventListeners) {
      if (!document.contains(element)) {
        console.log('Cleaning up event listeners for removed element');
        this.cleanupEventListeners(element);
      }
    }
  }

  /**
   * Clean up expired timers
   */
  cleanupExpiredTimers() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    for (const timer of this.timers) {
      if (now - timer.createdAt > maxAge) {
        console.log(`Cleaning up expired timer: ${timer.id}`);
        this.clearTimer(timer.id);
      }
    }
  }

  /**
   * Clean up unused audio contexts
   */
  cleanupUnusedAudioContexts() {
    for (const audioContext of this.audioContexts) {
      if (audioContext.state === 'suspended' || audioContext.state === 'closed') {
        console.log('Cleaning up unused audio context');
        this.cleanupAudioContext(audioContext);
      }
    }
  }

  /**
   * Clean up unused observers
   */
  cleanupUnusedObservers() {
    // Note: This is a basic implementation. In practice, you'd need more
    // sophisticated logic to determine if an observer is still needed
    for (const observer of this.observers) {
      if (observer._isUnused) { // Custom flag that would be set by the application
        console.log('Cleaning up unused observer');
        this.cleanupObserver(observer);
      }
    }
  }

  /**
   * Run all registered cleanup callbacks
   */
  runCleanupCallbacks() {
    for (const callback of this.cleanupCallbacks) {
      try {
        callback();
      } catch (error) {
        console.error('Error running cleanup callback:', error);
      }
    }
  }

  /**
   * Setup periodic cleanup
   */
  setupPeriodicCleanup() {
    // Run cleanup every 2 minutes
    this.cleanupInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 2 * 60 * 1000);
    
    this.registerTimer(this.cleanupInterval, 'interval');
  }

  /**
   * Check memory usage and trigger cleanup if needed
   */
  checkMemoryUsage() {
    if (performance.memory) {
      const memoryUsage = performance.memory.usedJSHeapSize;
      const memoryLimit = performance.memory.jsHeapSizeLimit;
      
      // Trigger cleanup if memory usage is high
      if (memoryUsage > this.memoryThreshold || memoryUsage > memoryLimit * 0.8) {
        console.log(`High memory usage detected: ${(memoryUsage / 1024 / 1024).toFixed(1)}MB`);
        this.optimizeMemory();
      }
    }
  }

  /**
   * Setup cleanup on page unload
   */
  setupPageUnloadCleanup() {
    const cleanup = () => {
      this.cleanupAll();
    };
    
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('unload', cleanup);
    
    // Also cleanup on visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.optimizeMemory();
      }
    });
  }

  /**
   * Clean up all tracked resources
   */
  cleanupAll() {
    console.log('Cleaning up all resources...');
    
    // Clean up all resources
    for (const resourceId of this.resources.keys()) {
      this.unregisterResource(resourceId);
    }
    
    // Clean up all event listeners
    for (const element of this.eventListeners.keys()) {
      this.cleanupEventListeners(element);
    }
    
    // Clear all timers
    for (const timer of this.timers) {
      this.clearTimer(timer.id);
    }
    
    // Close all audio contexts
    for (const audioContext of this.audioContexts) {
      this.cleanupAudioContext(audioContext);
    }
    
    // Disconnect all observers
    for (const observer of this.observers) {
      this.cleanupObserver(observer);
    }
    
    // Run cleanup callbacks
    this.runCleanupCallbacks();
    
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    console.log('All resources cleaned up');
  }

  /**
   * Get resource usage statistics
   * @returns {Object} Resource usage stats
   */
  getResourceStats() {
    return {
      resources: this.resources.size,
      eventListeners: Array.from(this.eventListeners.values()).reduce((sum, listeners) => sum + listeners.length, 0),
      timers: this.timers.size,
      audioContexts: this.audioContexts.size,
      observers: this.observers.size,
      cleanupCallbacks: this.cleanupCallbacks.size,
      memoryUsage: performance.memory ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      } : null
    };
  }

  /**
   * Update resource access time
   * @param {string} resourceId - Resource identifier
   */
  touchResource(resourceId) {
    const resource = this.resources.get(resourceId);
    if (resource) {
      resource.lastAccessed = Date.now();
    }
  }

  /**
   * Check if a resource exists
   * @param {string} resourceId - Resource identifier
   * @returns {boolean} Whether the resource exists
   */
  hasResource(resourceId) {
    return this.resources.has(resourceId);
  }

  /**
   * Get resource information
   * @param {string} resourceId - Resource identifier
   * @returns {Object|null} Resource information
   */
  getResource(resourceId) {
    return this.resources.get(resourceId) || null;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResourceManager;
}