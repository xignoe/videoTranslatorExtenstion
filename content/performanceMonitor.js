/**
 * PerformanceMonitor - Tracks and optimizes extension performance
 * Monitors CPU usage, memory consumption, and processing latency
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      audioProcessingTime: [],
      translationLatency: [],
      subtitleRenderTime: [],
      memoryUsage: [],
      cpuUsage: []
    };
    
    this.thresholds = {
      maxAudioProcessingTime: 10, // ms
      maxTranslationLatency: 2000, // ms
      maxSubtitleRenderTime: 50, // ms
      maxMemoryIncrease: 50 * 1024 * 1024, // 50MB
      maxCpuUsage: 80 // percentage
    };
    
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.baselineMemory = 0;
    this.performanceObserver = null;
    
    this.initializePerformanceObserver();
  }

  /**
   * Initialize Performance Observer for detailed metrics
   */
  initializePerformanceObserver() {
    if ('PerformanceObserver' in window) {
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            if (entry.name.startsWith('video-translator-')) {
              this.recordMetric(entry.name, entry.duration);
            }
          });
        });
        
        this.performanceObserver.observe({ entryTypes: ['measure'] });
      } catch (error) {
        console.warn('PerformanceObserver not supported:', error);
      }
    }
  }

  /**
   * Start performance monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = true;
    this.baselineMemory = this.getCurrentMemoryUsage();
    
    // Monitor memory and CPU usage every 5 seconds
    this.monitoringInterval = setInterval(() => {
      this.recordMemoryUsage();
      this.recordCpuUsage();
      this.checkThresholds();
    }, 5000);
    
    console.log('Performance monitoring started');
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    
    console.log('Performance monitoring stopped');
  }

  /**
   * Record audio processing performance
   * @param {number} startTime - Processing start time
   * @param {number} endTime - Processing end time
   */
  recordAudioProcessing(startTime, endTime) {
    const duration = endTime - startTime;
    this.recordMetric('audioProcessingTime', duration);
    
    // Mark performance for detailed analysis
    if (performance.mark && performance.measure) {
      performance.mark('video-translator-audio-end');
      performance.measure('video-translator-audio-processing', 'video-translator-audio-start', 'video-translator-audio-end');
    }
  }

  /**
   * Record translation latency
   * @param {number} startTime - Translation start time
   * @param {number} endTime - Translation end time
   */
  recordTranslationLatency(startTime, endTime) {
    const latency = endTime - startTime;
    this.recordMetric('translationLatency', latency);
    
    if (performance.mark && performance.measure) {
      performance.mark('video-translator-translation-end');
      performance.measure('video-translator-translation', 'video-translator-translation-start', 'video-translator-translation-end');
    }
  }

  /**
   * Record subtitle rendering performance
   * @param {number} startTime - Rendering start time
   * @param {number} endTime - Rendering end time
   */
  recordSubtitleRendering(startTime, endTime) {
    const duration = endTime - startTime;
    this.recordMetric('subtitleRenderTime', duration);
    
    if (performance.mark && performance.measure) {
      performance.mark('video-translator-subtitle-end');
      performance.measure('video-translator-subtitle-rendering', 'video-translator-subtitle-start', 'video-translator-subtitle-end');
    }
  }

  /**
   * Record a metric value
   * @param {string} metricName - Name of the metric
   * @param {number} value - Metric value
   */
  recordMetric(metricName, value) {
    if (!this.metrics[metricName]) {
      this.metrics[metricName] = [];
    }
    
    this.metrics[metricName].push({
      value,
      timestamp: Date.now()
    });
    
    // Keep only last 100 measurements to prevent memory bloat
    if (this.metrics[metricName].length > 100) {
      this.metrics[metricName] = this.metrics[metricName].slice(-100);
    }
  }

  /**
   * Record current memory usage
   */
  recordMemoryUsage() {
    const memoryUsage = this.getCurrentMemoryUsage();
    this.recordMetric('memoryUsage', memoryUsage);
  }

  /**
   * Record CPU usage estimation
   */
  recordCpuUsage() {
    // Estimate CPU usage based on frame timing
    const cpuUsage = this.estimateCpuUsage();
    this.recordMetric('cpuUsage', cpuUsage);
  }

  /**
   * Get current memory usage
   * @returns {number} Memory usage in bytes
   */
  getCurrentMemoryUsage() {
    if (performance.memory) {
      return performance.memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Estimate CPU usage based on frame timing
   * @returns {number} Estimated CPU usage percentage
   */
  estimateCpuUsage() {
    // Simple estimation based on frame timing
    // This is not perfectly accurate but gives a rough indication
    const now = performance.now();
    if (!this.lastFrameTime) {
      this.lastFrameTime = now;
      return 0;
    }
    
    const frameDelta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    // Assume 60fps as baseline (16.67ms per frame)
    const expectedFrameTime = 16.67;
    const cpuUsage = Math.min(100, (frameDelta / expectedFrameTime) * 100);
    
    return cpuUsage;
  }

  /**
   * Check if any performance thresholds are exceeded
   */
  checkThresholds() {
    const warnings = [];
    
    // Check audio processing time
    const avgAudioTime = this.getAverageMetric('audioProcessingTime', 10);
    if (avgAudioTime > this.thresholds.maxAudioProcessingTime) {
      warnings.push(`Audio processing time too high: ${avgAudioTime.toFixed(2)}ms`);
    }
    
    // Check translation latency
    const avgTranslationLatency = this.getAverageMetric('translationLatency', 5);
    if (avgTranslationLatency > this.thresholds.maxTranslationLatency) {
      warnings.push(`Translation latency too high: ${avgTranslationLatency.toFixed(0)}ms`);
    }
    
    // Check subtitle rendering time
    const avgSubtitleTime = this.getAverageMetric('subtitleRenderTime', 10);
    if (avgSubtitleTime > this.thresholds.maxSubtitleRenderTime) {
      warnings.push(`Subtitle rendering time too high: ${avgSubtitleTime.toFixed(2)}ms`);
    }
    
    // Check memory usage
    const currentMemory = this.getCurrentMemoryUsage();
    const memoryIncrease = currentMemory - this.baselineMemory;
    if (memoryIncrease > this.thresholds.maxMemoryIncrease) {
      warnings.push(`Memory usage increased by ${(memoryIncrease / 1024 / 1024).toFixed(1)}MB`);
    }
    
    // Check CPU usage
    const avgCpuUsage = this.getAverageMetric('cpuUsage', 5);
    if (avgCpuUsage > this.thresholds.maxCpuUsage) {
      warnings.push(`CPU usage too high: ${avgCpuUsage.toFixed(1)}%`);
    }
    
    if (warnings.length > 0) {
      console.warn('Performance warnings:', warnings);
      this.triggerOptimizations(warnings);
    }
  }

  /**
   * Get average value for a metric over the last N measurements
   * @param {string} metricName - Name of the metric
   * @param {number} count - Number of recent measurements to average
   * @returns {number} Average value
   */
  getAverageMetric(metricName, count = 10) {
    const metrics = this.metrics[metricName];
    if (!metrics || metrics.length === 0) {
      return 0;
    }
    
    const recentMetrics = metrics.slice(-count);
    const sum = recentMetrics.reduce((acc, metric) => acc + metric.value, 0);
    return sum / recentMetrics.length;
  }

  /**
   * Trigger performance optimizations based on warnings
   * @param {Array<string>} warnings - Performance warnings
   */
  triggerOptimizations(warnings) {
    warnings.forEach(warning => {
      if (warning.includes('Audio processing')) {
        this.optimizeAudioProcessing();
      } else if (warning.includes('Translation latency')) {
        this.optimizeTranslation();
      } else if (warning.includes('Subtitle rendering')) {
        this.optimizeSubtitleRendering();
      } else if (warning.includes('Memory usage')) {
        this.optimizeMemoryUsage();
      } else if (warning.includes('CPU usage')) {
        this.optimizeCpuUsage();
      }
    });
  }

  /**
   * Optimize audio processing performance
   */
  optimizeAudioProcessing() {
    console.log('Optimizing audio processing...');
    
    // Suggestions for audio processing optimization
    const optimizations = [
      'Reduce audio analysis frequency',
      'Increase voice activity detection threshold',
      'Use smaller FFT size for analysis',
      'Skip processing when no voice activity'
    ];
    
    console.log('Audio processing optimizations:', optimizations);
  }

  /**
   * Optimize translation performance
   */
  optimizeTranslation() {
    console.log('Optimizing translation performance...');
    
    const optimizations = [
      'Implement request batching',
      'Increase cache hit rate',
      'Use faster translation provider',
      'Reduce translation frequency'
    ];
    
    console.log('Translation optimizations:', optimizations);
  }

  /**
   * Optimize subtitle rendering performance
   */
  optimizeSubtitleRendering() {
    console.log('Optimizing subtitle rendering...');
    
    const optimizations = [
      'Use CSS transforms instead of layout changes',
      'Batch DOM updates',
      'Reduce subtitle update frequency',
      'Use requestAnimationFrame for updates'
    ];
    
    console.log('Subtitle rendering optimizations:', optimizations);
  }

  /**
   * Optimize memory usage
   */
  optimizeMemoryUsage() {
    console.log('Optimizing memory usage...');
    
    const optimizations = [
      'Clear old audio buffers',
      'Reduce translation cache size',
      'Remove unused DOM elements',
      'Force garbage collection if available'
    ];
    
    console.log('Memory optimizations:', optimizations);
    
    // Force garbage collection if available (development only)
    if (typeof gc === 'function') {
      gc();
    }
  }

  /**
   * Optimize CPU usage
   */
  optimizeCpuUsage() {
    console.log('Optimizing CPU usage...');
    
    const optimizations = [
      'Reduce processing frequency',
      'Use Web Workers for heavy computation',
      'Implement processing throttling',
      'Skip unnecessary calculations'
    ];
    
    console.log('CPU optimizations:', optimizations);
  }

  /**
   * Get performance report
   * @returns {Object} Performance metrics summary
   */
  getPerformanceReport() {
    const report = {
      timestamp: Date.now(),
      monitoring: this.isMonitoring,
      metrics: {}
    };
    
    Object.keys(this.metrics).forEach(metricName => {
      const metrics = this.metrics[metricName];
      if (metrics.length > 0) {
        const values = metrics.map(m => m.value);
        report.metrics[metricName] = {
          count: metrics.length,
          average: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          latest: values[values.length - 1]
        };
      }
    });
    
    return report;
  }

  /**
   * Reset all metrics
   */
  resetMetrics() {
    Object.keys(this.metrics).forEach(key => {
      this.metrics[key] = [];
    });
    
    this.baselineMemory = this.getCurrentMemoryUsage();
    console.log('Performance metrics reset');
  }

  /**
   * Mark performance measurement start
   * @param {string} operation - Operation name
   */
  markStart(operation) {
    if (performance.mark) {
      performance.mark(`video-translator-${operation}-start`);
    }
  }

  /**
   * Mark performance measurement end
   * @param {string} operation - Operation name
   */
  markEnd(operation) {
    if (performance.mark) {
      performance.mark(`video-translator-${operation}-end`);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PerformanceMonitor;
}