/**
 * Simple unit tests for VideoDetector class
 * Basic functionality tests for video detection
 */

const VideoDetector = require('../content/videoDetector.js');

describe('VideoDetector Basic Functionality', () => {
  let detector;
  let mockCallbacks;

  beforeEach(() => {
    detector = new VideoDetector();
    mockCallbacks = {
      onVideoAdded: jest.fn(),
      onVideoRemoved: jest.fn()
    };

    // Mock DOM elements
    global.document = {
      querySelectorAll: jest.fn(() => []),
      body: {
        appendChild: jest.fn(),
        removeChild: jest.fn()
      }
    };

    global.window = {
      getComputedStyle: jest.fn(() => ({
        display: 'block',
        visibility: 'visible'
      }))
    };

    global.MutationObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn()
    }));
  });

  afterEach(() => {
    if (detector) {
      detector.destroy();
    }
  });

  test('should initialize without errors', () => {
    expect(() => {
      detector.initialize(mockCallbacks);
    }).not.toThrow();
  });

  test('should detect existing videos on initialization', () => {
    const mockVideo = {
      tagName: 'VIDEO',
      src: 'test.mp4',
      getBoundingClientRect: () => ({ width: 640, height: 480 }),
      id: 'test-video',
      paused: true,
      currentTime: 0,
      duration: 120
    };

    global.document.querySelectorAll = jest.fn((selector) => {
      if (selector === 'video, audio') {
        return [mockVideo];
      }
      return [];
    });

    detector.initialize(mockCallbacks);

    expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(1);
    expect(detector.getDetectedVideos()).toHaveLength(1);
  });

  test('should generate unique IDs for videos', () => {
    const mockVideo1 = {
      tagName: 'VIDEO',
      src: 'test1.mp4',
      getBoundingClientRect: () => ({ width: 640, height: 480 }),
      id: '',
      paused: true,
      currentTime: 0,
      duration: 120
    };

    const mockVideo2 = {
      tagName: 'VIDEO',
      src: 'test2.mp4',
      getBoundingClientRect: () => ({ width: 640, height: 480 }),
      id: '',
      paused: true,
      currentTime: 0,
      duration: 120
    };

    global.document.querySelectorAll = jest.fn((selector) => {
      if (selector === 'video, audio') {
        return [mockVideo1, mockVideo2];
      }
      return [];
    });

    detector.initialize(mockCallbacks);

    const detectedVideos = detector.getDetectedVideos();
    expect(detectedVideos).toHaveLength(2);
    expect(detectedVideos[0].id).not.toBe(detectedVideos[1].id);
  });

  test('should not detect hidden videos', () => {
    const mockVideo = {
      tagName: 'VIDEO',
      src: 'test.mp4',
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
      id: 'hidden-video',
      paused: true,
      currentTime: 0,
      duration: 120
    };

    global.document.querySelectorAll = jest.fn((selector) => {
      if (selector === 'video, audio') {
        return [mockVideo];
      }
      return [];
    });

    detector.initialize(mockCallbacks);

    expect(mockCallbacks.onVideoAdded).not.toHaveBeenCalled();
    expect(detector.getDetectedVideos()).toHaveLength(0);
  });

  test('should get video info by element', () => {
    const mockVideo = {
      tagName: 'VIDEO',
      src: 'test.mp4',
      getBoundingClientRect: () => ({ width: 640, height: 480 }),
      id: 'test-video',
      paused: true,
      currentTime: 0,
      duration: 120
    };

    global.document.querySelectorAll = jest.fn((selector) => {
      if (selector === 'video, audio') {
        return [mockVideo];
      }
      return [];
    });

    detector.initialize(mockCallbacks);

    const videoInfo = detector.getVideoInfo(mockVideo);
    expect(videoInfo).toBeTruthy();
    expect(videoInfo.src).toBe('test.mp4');
    expect(videoInfo.element).toBe(mockVideo);
  });

  test('should return null for unknown video element', () => {
    const unknownVideo = {
      tagName: 'VIDEO',
      src: 'unknown.mp4'
    };

    detector.initialize(mockCallbacks);

    const videoInfo = detector.getVideoInfo(unknownVideo);
    expect(videoInfo).toBeNull();
  });

  test('should cleanup resources on destroy', () => {
    detector.initialize(mockCallbacks);
    
    expect(detector.observers).toBeDefined();
    
    detector.destroy();
    
    expect(detector.getDetectedVideos()).toHaveLength(0);
  });

  test('should handle multiple videos on same page', () => {
    const mockVideos = [];
    for (let i = 0; i < 3; i++) {
      mockVideos.push({
        tagName: 'VIDEO',
        src: `test${i}.mp4`,
        getBoundingClientRect: () => ({ width: 640, height: 480 }),
        id: `video-${i}`,
        paused: true,
        currentTime: 0,
        duration: 120
      });
    }

    global.document.querySelectorAll = jest.fn((selector) => {
      if (selector === 'video, audio') {
        return mockVideos;
      }
      return [];
    });

    detector.initialize(mockCallbacks);

    expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(3);
    expect(detector.getDetectedVideos()).toHaveLength(3);
  });
});