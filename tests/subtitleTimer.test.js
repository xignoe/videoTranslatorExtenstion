/**
 * Tests for SubtitleTimer class
 * Testing timing synchronization, video event handling, and 2-second requirement
 */

// Mock DOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLVideoElement = dom.window.HTMLVideoElement;

// Mock timers
jest.useFakeTimers();

// Mock Date.now for consistent timing
const mockNow = jest.spyOn(Date, 'now');
let mockTime = 1000000; // Start at a fixed time

const SubtitleTimer = require('../content/subtitleTimer.js');

// Mock SubtitleRenderer
const mockSubtitleRenderer = {
  displaySubtitle: jest.fn(),
  clearSubtitle: jest.fn()
};

describe('SubtitleTimer', () => {
  let timer;
  let mockVideo;

  beforeEach(() => {
    timer = new SubtitleTimer(mockSubtitleRenderer);
    
    // Create mock video element
    mockVideo = document.createElement('video');
    mockVideo.currentTime = 0;
    mockVideo.playbackRate = 1;
    
    // Mock video methods
    mockVideo.addEventListener = jest.fn();
    mockVideo.removeEventListener = jest.fn();
    
    // Reset mocks
    mockSubtitleRenderer.displaySubtitle.mockClear();
    mockSubtitleRenderer.clearSubtitle.mockClear();
    
    // Reset mock time
    mockTime = 1000000;
    mockNow.mockReturnValue(mockTime);
  });

  afterEach(() => {
    timer.cleanupAll();
    jest.clearAllTimers();
    mockNow.mockRestore();
  });

  describe('Initialization', () => {
    test('should initialize timer for video', () => {
      timer.initializeForVideo(mockVideo, 'video1');
      
      expect(timer.videoTimers.has('video1')).toBe(true);
      expect(timer.subtitleQueue.has('video1')).toBe(true);
      
      const timerData = timer.videoTimers.get('video1');
      expect(timerData.videoElement).toBe(mockVideo);
      expect(timerData.isPlaying).toBe(false);
      expect(timerData.playbackRate).toBe(1);
    });

    test('should set up video event listeners', () => {
      timer.initializeForVideo(mockVideo, 'video1');
      
      expect(mockVideo.addEventListener).toHaveBeenCalledWith('play', expect.any(Function));
      expect(mockVideo.addEventListener).toHaveBeenCalledWith('pause', expect.any(Function));
      expect(mockVideo.addEventListener).toHaveBeenCalledWith('seeked', expect.any(Function));
      expect(mockVideo.addEventListener).toHaveBeenCalledWith('timeupdate', expect.any(Function));
      expect(mockVideo.addEventListener).toHaveBeenCalledWith('ratechange', expect.any(Function));
    });

    test('should not reinitialize existing video', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      timer.initializeForVideo(mockVideo, 'video1');
      timer.initializeForVideo(mockVideo, 'video1');
      
      expect(consoleSpy).toHaveBeenCalledWith('Timer already initialized for video: video1');
      expect(timer.videoTimers.size).toBe(1);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Video Event Handling', () => {
    beforeEach(() => {
      timer.initializeForVideo(mockVideo, 'video1');
    });

    test('should handle video play event', () => {
      timer.handleVideoPlay('video1');
      
      const timerData = timer.videoTimers.get('video1');
      expect(timerData.isPlaying).toBe(true);
      expect(timerData.lastSyncTime).toBeGreaterThan(0);
    });

    test('should handle video pause event', () => {
      timer.handleVideoPlay('video1');
      timer.handleVideoPause('video1');
      
      const timerData = timer.videoTimers.get('video1');
      expect(timerData.isPlaying).toBe(false);
    });

    test('should handle video seek event', () => {
      mockVideo.currentTime = 30;
      timer.handleVideoSeeked('video1');
      
      const timerData = timer.videoTimers.get('video1');
      expect(timerData.currentTime).toBe(30);
      expect(mockSubtitleRenderer.clearSubtitle).toHaveBeenCalledWith('video1');
    });

    test('should handle time update event', () => {
      mockVideo.currentTime = 15;
      timer.handleTimeUpdate('video1');
      
      const timerData = timer.videoTimers.get('video1');
      expect(timerData.currentTime).toBe(15);
    });

    test('should handle playback rate change', () => {
      mockVideo.playbackRate = 1.5;
      timer.handleRateChange('video1');
      
      const timerData = timer.videoTimers.get('video1');
      expect(timerData.playbackRate).toBe(1.5);
    });

    test('should handle video ended event', () => {
      timer.handleVideoPlay('video1');
      timer.handleVideoEnded('video1');
      
      const timerData = timer.videoTimers.get('video1');
      expect(timerData.isPlaying).toBe(false);
      expect(mockSubtitleRenderer.clearSubtitle).toHaveBeenCalledWith('video1');
    });
  });

  describe('Subtitle Queueing', () => {
    beforeEach(() => {
      timer.initializeForVideo(mockVideo, 'video1');
    });

    test('should queue subtitle in chronological order', () => {
      const subtitle1 = { text: 'First', startTime: 10, endTime: 15, confidence: 0.9 };
      const subtitle2 = { text: 'Second', startTime: 5, endTime: 8, confidence: 0.8 };
      const subtitle3 = { text: 'Third', startTime: 20, endTime: 25, confidence: 0.95 };
      
      timer.queueSubtitle('video1', subtitle1);
      timer.queueSubtitle('video1', subtitle2);
      timer.queueSubtitle('video1', subtitle3);
      
      const queue = timer.subtitleQueue.get('video1');
      expect(queue[0].text).toBe('Second'); // startTime: 5
      expect(queue[1].text).toBe('First');  // startTime: 10
      expect(queue[2].text).toBe('Third');  // startTime: 20
    });

    test('should add queue timestamp to subtitles', () => {
      const subtitle = { text: 'Test', startTime: 10, endTime: 15, confidence: 0.9 };
      const beforeQueue = Date.now();
      
      timer.queueSubtitle('video1', subtitle);
      
      const queue = timer.subtitleQueue.get('video1');
      expect(queue[0].queueTime).toBeGreaterThanOrEqual(beforeQueue);
      expect(queue[0].id).toBeDefined();
    });

    test('should process queue when video is playing', () => {
      const subtitle = { text: 'Test', startTime: 0, endTime: 5, confidence: 0.9 };
      
      timer.handleVideoPlay('video1');
      timer.queueSubtitle('video1', subtitle);
      
      // Should trigger processing since video is playing
      expect(timer.videoTimers.get('video1').isPlaying).toBe(true);
    });
  });

  describe('Subtitle Processing and Synchronization', () => {
    beforeEach(() => {
      timer.initializeForVideo(mockVideo, 'video1');
      timer.handleVideoPlay('video1');
    });

    test('should display subtitle when within time range', () => {
      const subtitle = { text: 'Current subtitle', startTime: 8, endTime: 12, confidence: 0.9 };
      
      // Ensure video is playing
      timer.handleVideoPlay('video1');
      
      // Queue subtitle at time T
      mockNow.mockReturnValue(mockTime);
      timer.queueSubtitle('video1', subtitle);
      
      // Check queue was populated
      const queue = timer.subtitleQueue.get('video1');
      expect(queue.length).toBe(1);
      expect(queue[0].text).toBe('Current subtitle');
      
      // Set video time and update timer data
      mockVideo.currentTime = 10; // Within range
      timer.handleTimeUpdate('video1'); // This updates timerData.currentTime
      
      // Advance time by 100ms to simulate processing delay
      mockTime += 100;
      mockNow.mockReturnValue(mockTime);
      
      // Check timer data
      const timerData = timer.videoTimers.get('video1');
      expect(timerData.isPlaying).toBe(true);
      expect(timerData.currentTime).toBe(10);
      
      timer.processSubtitleQueue('video1');
      
      expect(mockSubtitleRenderer.displaySubtitle).toHaveBeenCalledWith(
        'video1',
        'Current subtitle',
        expect.objectContaining({
          confidence: 0.9,
          startTime: 8,
          endTime: 12
        })
      );
    });

    test('should not display subtitle outside time range', () => {
      const subtitle = { text: 'Future subtitle', startTime: 20, endTime: 25, confidence: 0.9 };
      timer.queueSubtitle('video1', subtitle);
      
      mockVideo.currentTime = 10; // Before start time
      timer.processSubtitleQueue('video1');
      
      expect(mockSubtitleRenderer.displaySubtitle).not.toHaveBeenCalled();
    });

    test('should clear subtitle when past end time', () => {
      const subtitle = { text: 'Past subtitle', startTime: 5, endTime: 8, confidence: 0.9 };
      
      timer.handleVideoPlay('video1');
      
      mockNow.mockReturnValue(mockTime);
      timer.queueSubtitle('video1', subtitle);
      
      // First show the subtitle
      mockVideo.currentTime = 6;
      timer.handleTimeUpdate('video1');
      
      mockTime += 100;
      mockNow.mockReturnValue(mockTime);
      timer.processSubtitleQueue('video1');
      
      // Verify subtitle was displayed
      expect(mockSubtitleRenderer.displaySubtitle).toHaveBeenCalled();
      
      const timerData = timer.videoTimers.get('video1');
      timerData.activeSubtitle = { ...subtitle, id: `video1_${subtitle.startTime}_${mockTime}` };
      
      // Then move past end time
      mockVideo.currentTime = 10;
      timer.handleTimeUpdate('video1');
      timer.processSubtitleQueue('video1');
      
      expect(mockSubtitleRenderer.clearSubtitle).toHaveBeenCalledWith('video1');
    });

    test('should respect 2-second synchronization threshold', () => {
      const subtitle = { text: 'Old subtitle', startTime: 8, endTime: 12, confidence: 0.9 };
      
      // Queue subtitle and simulate it being old (beyond 2-second threshold)
      timer.queueSubtitle('video1', subtitle);
      const queue = timer.subtitleQueue.get('video1');
      queue[0].queueTime = Date.now() - 3000; // 3 seconds ago
      
      mockVideo.currentTime = 10; // Within time range but beyond sync threshold
      timer.processSubtitleQueue('video1');
      
      // Should not display due to sync threshold
      expect(mockSubtitleRenderer.displaySubtitle).not.toHaveBeenCalled();
    });

    test('should add confidence indicator for low confidence subtitles', () => {
      const subtitle = { text: 'Uncertain text', startTime: 8, endTime: 12, confidence: 0.6 };
      
      timer.handleVideoPlay('video1');
      
      mockNow.mockReturnValue(mockTime);
      timer.queueSubtitle('video1', subtitle);
      
      mockVideo.currentTime = 10;
      timer.handleTimeUpdate('video1');
      
      mockTime += 100;
      mockNow.mockReturnValue(mockTime);
      timer.processSubtitleQueue('video1');
      
      expect(mockSubtitleRenderer.displaySubtitle).toHaveBeenCalledWith(
        'video1',
        'Uncertain text [?]',
        expect.any(Object)
      );
    });
  });

  describe('Playback Rate Adjustment', () => {
    beforeEach(() => {
      timer.initializeForVideo(mockVideo, 'video1');
      timer.handleVideoPlay('video1');
    });

    test('should adjust subtitle duration for playback rate', () => {
      const subtitle = { text: 'Speed test', startTime: 10, endTime: 15, confidence: 0.9 };
      
      timer.handleVideoPlay('video1');
      
      mockNow.mockReturnValue(mockTime);
      timer.queueSubtitle('video1', subtitle);
      
      mockVideo.playbackRate = 2; // 2x speed
      timer.handleRateChange('video1');
      
      mockVideo.currentTime = 12;
      timer.handleTimeUpdate('video1');
      
      mockTime += 100;
      mockNow.mockReturnValue(mockTime);
      timer.processSubtitleQueue('video1');
      
      // Duration should be adjusted: (15-10) * 1000 / 2 = 2500ms
      expect(mockSubtitleRenderer.displaySubtitle).toHaveBeenCalledWith(
        'video1',
        'Speed test',
        expect.objectContaining({
          duration: 2500 // Adjusted for 2x playback rate
        })
      );
    });
  });

  describe('Subtitle Queue Management', () => {
    beforeEach(() => {
      timer.initializeForVideo(mockVideo, 'video1');
    });

    test('should clean up old subtitles from queue', () => {
      const oldSubtitle = { text: 'Old', startTime: 5, endTime: 8, confidence: 0.9 };
      const currentSubtitle = { text: 'Current', startTime: 35, endTime: 40, confidence: 0.9 };
      
      timer.queueSubtitle('video1', oldSubtitle);
      timer.queueSubtitle('video1', currentSubtitle);
      
      mockVideo.currentTime = 40; // 30+ seconds after old subtitle
      timer.cleanupOldSubtitles('video1', 40);
      
      const queue = timer.subtitleQueue.get('video1');
      expect(queue.length).toBe(1);
      expect(queue[0].text).toBe('Current');
    });

    test('should clear entire subtitle queue', () => {
      timer.queueSubtitle('video1', { text: 'Test1', startTime: 5, endTime: 8, confidence: 0.9 });
      timer.queueSubtitle('video1', { text: 'Test2', startTime: 10, endTime: 15, confidence: 0.9 });
      
      timer.clearSubtitleQueue('video1');
      
      const queue = timer.subtitleQueue.get('video1');
      expect(queue.length).toBe(0);
    });
  });

  describe('Sync Monitoring', () => {
    beforeEach(() => {
      timer.initializeForVideo(mockVideo, 'video1');
    });

    test('should start periodic sync monitoring', () => {
      const timerData = timer.videoTimers.get('video1');
      expect(timerData.syncInterval).toBeDefined();
    });

    test('should process queue periodically when playing', () => {
      const processSpy = jest.spyOn(timer, 'processSubtitleQueue');
      
      timer.handleVideoPlay('video1');
      
      // Fast-forward time to trigger interval
      jest.advanceTimersByTime(500);
      
      expect(processSpy).toHaveBeenCalledWith('video1');
      
      processSpy.mockRestore();
    });

    test('should not process queue when paused', () => {
      const processSpy = jest.spyOn(timer, 'processSubtitleQueue');
      
      timer.handleVideoPause('video1');
      
      // Fast-forward time
      jest.advanceTimersByTime(500);
      
      expect(processSpy).not.toHaveBeenCalled();
      
      processSpy.mockRestore();
    });
  });

  describe('Timing Statistics', () => {
    beforeEach(() => {
      timer.initializeForVideo(mockVideo, 'video1');
    });

    test('should return timing statistics', () => {
      timer.handleVideoPlay('video1');
      mockVideo.currentTime = 25;
      timer.handleTimeUpdate('video1');
      
      const stats = timer.getTimingStats('video1');
      
      expect(stats).toEqual({
        isPlaying: true,
        currentTime: 25,
        playbackRate: 1,
        queueLength: 0,
        activeSubtitle: null,
        lastSyncTime: expect.any(Number)
      });
    });

    test('should return null for non-existent video', () => {
      const stats = timer.getTimingStats('nonexistent');
      expect(stats).toBe(null);
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      timer.initializeForVideo(mockVideo, 'video1');
    });

    test('should cleanup specific video timer', () => {
      const timerData = timer.videoTimers.get('video1');
      const syncInterval = timerData.syncInterval;
      
      timer.cleanup('video1');
      
      expect(timer.videoTimers.has('video1')).toBe(false);
      expect(timer.subtitleQueue.has('video1')).toBe(false);
      expect(mockVideo.removeEventListener).toHaveBeenCalled();
    });

    test('should cleanup all video timers', () => {
      timer.initializeForVideo(document.createElement('video'), 'video2');
      
      expect(timer.videoTimers.size).toBe(2);
      
      timer.cleanupAll();
      
      expect(timer.videoTimers.size).toBe(0);
      expect(timer.subtitleQueue.size).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle operations on non-existent video gracefully', () => {
      expect(() => {
        timer.handleVideoPlay('nonexistent');
        timer.queueSubtitle('nonexistent', { text: 'Test', startTime: 0, endTime: 5 });
        timer.processSubtitleQueue('nonexistent');
      }).not.toThrow();
    });

    test('should handle empty subtitle queue', () => {
      timer.initializeForVideo(mockVideo, 'video1');
      timer.handleVideoPlay('video1');
      
      expect(() => {
        timer.processSubtitleQueue('video1');
      }).not.toThrow();
    });

    test('should handle subtitle with zero duration', () => {
      timer.initializeForVideo(mockVideo, 'video1');
      timer.handleVideoPlay('video1');
      
      const subtitle = { text: 'Instant', startTime: 10, endTime: 10, confidence: 0.9 };
      timer.queueSubtitle('video1', subtitle);
      
      mockVideo.currentTime = 10;
      
      expect(() => {
        timer.processSubtitleQueue('video1');
      }).not.toThrow();
    });
  });
});