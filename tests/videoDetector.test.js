/**
 * Unit tests for VideoDetector class
 */

// Mock Jest functions first
global.jest = {
  fn: () => {
    const mockFn = function(...args) {
      mockFn.calls.push(args);
      return mockFn.returnValue;
    };
    mockFn.calls = [];
    mockFn.returnValue = undefined;
    return mockFn;
  }
};

let testResults = { passed: 0, failed: 0 };

global.describe = (name, fn) => {
  console.log(`\n=== ${name} ===`);
  fn();
};

global.test = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
    testResults.passed++;
  } catch (error) {
    console.log(`✗ ${name}: ${error.message}`);
    testResults.failed++;
  }
};

global.beforeEach = (fn) => fn();
global.afterEach = (fn) => fn();

global.expect = (actual) => ({
  toBe: (expected) => {
    if (actual !== expected) {
      throw new Error(`Expected ${actual} to be ${expected}`);
    }
  },
  toHaveBeenCalledTimes: (times) => {
    if (actual.calls.length !== times) {
      throw new Error(`Expected ${actual.calls.length} calls, got ${times}`);
    }
  },
  toHaveLength: (length) => {
    if (actual.length !== length) {
      throw new Error(`Expected length ${actual.length} to be ${length}`);
    }
  },
  toBeTruthy: () => {
    if (!actual) {
      throw new Error(`Expected ${actual} to be truthy`);
    }
  },
  toBeNull: () => {
    if (actual !== null) {
      throw new Error(`Expected ${actual} to be null`);
    }
  },
  toBeDefined: () => {
    if (actual === undefined) {
      throw new Error(`Expected ${actual} to be defined`);
    }
  },
  not: {
    toBe: (expected) => {
      if (actual === expected) {
        throw new Error(`Expected ${actual} not to be ${expected}`);
      }
    },
    toHaveBeenCalled: () => {
      if (actual.calls.length > 0) {
        throw new Error(`Expected function not to have been called`);
      }
    }
  }
});

// Run tests and show summary
process.on('exit', () => {
  console.log(`\n=== Test Summary ===`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Total: ${testResults.passed + testResults.failed}`);
});

// Mock DOM environment for testing
class MockElement {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.paused = true;
    this.currentTime = 0;
    this.duration = 0;
    this.src = attributes.src || '';
    this.currentSrc = attributes.currentSrc || '';
    this.id = attributes.id || '';
    this.eventListeners = {};
  }

  getBoundingClientRect() {
    return {
      width: this.attributes.width || 640,
      height: this.attributes.height || 480,
      left: this.attributes.left || 0,
      top: this.attributes.top || 0
    };
  }

  querySelector(selector) {
    return this.children.find(child => 
      child.tagName.toLowerCase() === selector.toLowerCase()
    ) || null;
  }

  querySelectorAll(selector) {
    return this.children.filter(child => 
      child.tagName.toLowerCase() === selector.toLowerCase()
    );
  }

  addEventListener(event, handler) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event, handler) {
    if (this.eventListeners[event]) {
      const index = this.eventListeners[event].indexOf(handler);
      if (index > -1) {
        this.eventListeners[event].splice(index, 1);
      }
    }
  }

  dispatchEvent(event) {
    if (this.eventListeners[event.type]) {
      this.eventListeners[event.type].forEach(handler => handler(event));
    }
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body');
    this.elements = [];
  }

  querySelectorAll(selector) {
    return this.elements.filter(element => {
      if (selector === 'video' || selector === 'video[src]') {
        return element.tagName.toLowerCase() === 'video';
      }
      if (selector === 'audio' || selector === 'audio[src]') {
        return element.tagName.toLowerCase() === 'audio';
      }
      if (selector === 'video source') {
        return element.tagName.toLowerCase() === 'source' && 
               element.parentNode && element.parentNode.tagName.toLowerCase() === 'video';
      }
      return false;
    });
  }

  contains(element) {
    return this.elements.includes(element);
  }

  addElement(element) {
    this.elements.push(element);
    element.parentNode = this.body;
  }

  removeElement(element) {
    const index = this.elements.indexOf(element);
    if (index > -1) {
      this.elements.splice(index, 1);
      element.parentNode = null;
    }
  }
}

class MockWindow {
  getComputedStyle(element) {
    return {
      display: element.style.display || 'block',
      visibility: element.style.visibility || 'visible'
    };
  }
}

class MockMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.isObserving = false;
  }

  observe(target, options) {
    this.target = target;
    this.options = options;
    this.isObserving = true;
  }

  disconnect() {
    this.isObserving = false;
  }

  // Helper method to simulate mutations
  simulateMutation(type, addedNodes = [], removedNodes = [], target = null, attributeName = null) {
    if (this.isObserving && this.callback) {
      const mutation = {
        type,
        addedNodes,
        removedNodes,
        target,
        attributeName
      };
      this.callback([mutation]);
    }
  }
}

// Set up global mocks
global.document = new MockDocument();
global.window = new MockWindow();
global.MutationObserver = MockMutationObserver;
global.Node = {
  ELEMENT_NODE: 1
};

// Import VideoDetector after setting up mocks
const VideoDetector = require('../content/videoDetector.js');

describe('VideoDetector', () => {
  let detector;
  let mockCallbacks;

  beforeEach(() => {
    // Create fresh document mock for each test
    global.document = new MockDocument();
    
    detector = new VideoDetector();
    mockCallbacks = {
      onVideoAdded: jest.fn(),
      onVideoRemoved: jest.fn()
    };
  });

  afterEach(() => {
    if (detector) {
      detector.destroy();
    }
  });

  describe('Video Detection', () => {
    test('should detect basic video element', () => {
      const videoElement = new MockElement('video', { 
        src: 'test.mp4',
        width: 640,
        height: 480
      });
      
      global.document.addElement(videoElement);
      detector.initialize(mockCallbacks);

      expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(1);
      expect(detector.getDetectedVideos()).toHaveLength(1);
      
      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.tagName).toBe('video');
      expect(detectedVideo.src).toBe('test.mp4');
    });

    test('should detect audio element', () => {
      const audioElement = new MockElement('audio', { 
        src: 'test.mp3',
        width: 300,
        height: 50
      });
      
      global.document.addElement(audioElement);
      detector.initialize(mockCallbacks);

      expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(1);
      expect(detector.getDetectedVideos()).toHaveLength(1);
      
      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.tagName).toBe('audio');
      expect(detectedVideo.src).toBe('test.mp3');
    });

    test('should detect video with source element', () => {
      const videoElement = new MockElement('video', { width: 640, height: 480 });
      const sourceElement = new MockElement('source', { src: 'test.mp4' });
      
      videoElement.children.push(sourceElement);
      sourceElement.parentNode = videoElement;
      
      global.document.addElement(videoElement);
      global.document.addElement(sourceElement);
      
      detector.initialize(mockCallbacks);

      expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(1);
      
      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.src).toBe('test.mp4');
    });

    test('should not detect hidden video elements', () => {
      const hiddenVideo = new MockElement('video', { 
        src: 'test.mp4',
        width: 0,
        height: 0
      });
      
      global.document.addElement(hiddenVideo);
      detector.initialize(mockCallbacks);

      expect(mockCallbacks.onVideoAdded).not.toHaveBeenCalled();
      expect(detector.getDetectedVideos()).toHaveLength(0);
    });

    test('should not detect video with display none', () => {
      const hiddenVideo = new MockElement('video', { 
        src: 'test.mp4',
        width: 640,
        height: 480
      });
      hiddenVideo.style.display = 'none';
      
      global.document.addElement(hiddenVideo);
      detector.initialize(mockCallbacks);

      expect(mockCallbacks.onVideoAdded).not.toHaveBeenCalled();
      expect(detector.getDetectedVideos()).toHaveLength(0);
    });

    test('should generate unique IDs for videos', () => {
      const video1 = new MockElement('video', { 
        src: 'test1.mp4',
        width: 640,
        height: 480
      });
      const video2 = new MockElement('video', { 
        src: 'test2.mp4',
        width: 640,
        height: 480
      });
      
      global.document.addElement(video1);
      global.document.addElement(video2);
      detector.initialize(mockCallbacks);

      const detectedVideos = detector.getDetectedVideos();
      expect(detectedVideos).toHaveLength(2);
      expect(detectedVideos[0].id).not.toBe(detectedVideos[1].id);
    });

    test('should use element ID when available', () => {
      const videoElement = new MockElement('video', { 
        id: 'my-video',
        src: 'test.mp4',
        width: 640,
        height: 480
      });
      
      global.document.addElement(videoElement);
      detector.initialize(mockCallbacks);

      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.id).toBe('video_my-video');
    });
  });

  describe('Dynamic Video Detection', () => {
    test('should detect dynamically added videos', () => {
      detector.initialize(mockCallbacks);
      
      // Simulate adding a video element
      const newVideo = new MockElement('video', { 
        src: 'dynamic.mp4',
        width: 640,
        height: 480
      });
      newVideo.nodeType = 1; // ELEMENT_NODE
      
      global.document.addElement(newVideo);
      
      // Simulate MutationObserver callback
      const observer = detector.observers[0];
      observer.simulateMutation('childList', [newVideo], []);

      expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(1);
      expect(detector.getDetectedVideos()).toHaveLength(1);
    });

    test('should handle video removal', () => {
      const videoElement = new MockElement('video', { 
        src: 'test.mp4',
        width: 640,
        height: 480
      });
      
      global.document.addElement(videoElement);
      detector.initialize(mockCallbacks);

      expect(detector.getDetectedVideos()).toHaveLength(1);
      
      // Remove video from document
      global.document.removeElement(videoElement);
      
      // Simulate MutationObserver callback for removal
      const observer = detector.observers[0];
      observer.simulateMutation('childList', [], [videoElement]);

      expect(mockCallbacks.onVideoRemoved).toHaveBeenCalledTimes(1);
      expect(detector.getDetectedVideos()).toHaveLength(0);
    });

    test('should handle attribute changes', () => {
      const videoElement = new MockElement('video', { 
        src: 'test.mp4',
        width: 640,
        height: 480
      });
      videoElement.style.display = 'none';
      
      global.document.addElement(videoElement);
      detector.initialize(mockCallbacks);

      // Should not be detected initially (hidden)
      expect(detector.getDetectedVideos()).toHaveLength(0);
      
      // Show the video
      videoElement.style.display = 'block';
      
      // Simulate attribute change
      const observer = detector.observers[0];
      observer.simulateMutation('attributes', [], [], videoElement, 'style');

      expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(1);
      expect(detector.getDetectedVideos()).toHaveLength(1);
    });
  });

  describe('Video Information', () => {
    test('should track video state information', () => {
      const videoElement = new MockElement('video', { 
        src: 'test.mp4',
        width: 640,
        height: 480
      });
      videoElement.paused = false;
      videoElement.currentTime = 30;
      videoElement.duration = 120;
      
      global.document.addElement(videoElement);
      detector.initialize(mockCallbacks);

      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.isPlaying).toBe(true);
      expect(detectedVideo.currentTime).toBe(30);
      expect(detectedVideo.duration).toBe(120);
    });

    test('should get video info by element', () => {
      const videoElement = new MockElement('video', { 
        src: 'test.mp4',
        width: 640,
        height: 480
      });
      
      global.document.addElement(videoElement);
      detector.initialize(mockCallbacks);

      const videoInfo = detector.getVideoInfo(videoElement);
      expect(videoInfo).toBeTruthy();
      expect(videoInfo.src).toBe('test.mp4');
    });

    test('should return null for unknown video element', () => {
      const unknownVideo = new MockElement('video', { src: 'unknown.mp4' });
      detector.initialize(mockCallbacks);

      const videoInfo = detector.getVideoInfo(unknownVideo);
      expect(videoInfo).toBeNull();
    });
  });

  describe('Event Handling', () => {
    test('should set up event listeners for detected videos', () => {
      const videoElement = new MockElement('video', { 
        src: 'test.mp4',
        width: 640,
        height: 480
      });
      
      global.document.addElement(videoElement);
      detector.initialize(mockCallbacks);

      // Check that event listeners were added
      expect(videoElement.eventListeners.play).toBeDefined();
      expect(videoElement.eventListeners.pause).toBeDefined();
      expect(videoElement.eventListeners.ended).toBeDefined();
    });

    test('should handle video play event', () => {
      const videoElement = new MockElement('video', { 
        src: 'test.mp4',
        width: 640,
        height: 480
      });
      
      global.document.addElement(videoElement);
      detector.initialize(mockCallbacks);

      // Simulate play event
      videoElement.paused = false;
      videoElement.dispatchEvent({ type: 'play', target: videoElement });

      const videoInfo = detector.getVideoInfo(videoElement);
      expect(videoInfo.isPlaying).toBe(true);
    });
  });

  describe('Cleanup', () => {
    test('should clean up resources on destroy', () => {
      const videoElement = new MockElement('video', { 
        src: 'test.mp4',
        width: 640,
        height: 480
      });
      
      global.document.addElement(videoElement);
      detector.initialize(mockCallbacks);

      expect(detector.observers).toHaveLength(1);
      expect(detector.getDetectedVideos()).toHaveLength(1);

      detector.destroy();

      expect(detector.observers).toHaveLength(0);
      expect(detector.getDetectedVideos()).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle multiple videos on same page', () => {
      const videos = [];
      for (let i = 0; i < 5; i++) {
        const video = new MockElement('video', { 
          src: `test${i}.mp4`,
          width: 640,
          height: 480
        });
        videos.push(video);
        global.document.addElement(video);
      }
      
      detector.initialize(mockCallbacks);

      expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(5);
      expect(detector.getDetectedVideos()).toHaveLength(5);
    });

    test('should handle videos without src', () => {
      const videoElement = new MockElement('video', { 
        width: 640,
        height: 480
      });
      
      global.document.addElement(videoElement);
      detector.initialize(mockCallbacks);

      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.src).toBe('unknown');
    });

    test('should handle currentSrc property', () => {
      const videoElement = new MockElement('video', { 
        currentSrc: 'current.mp4',
        width: 640,
        height: 480
      });
      
      global.document.addElement(videoElement);
      detector.initialize(mockCallbacks);

      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.src).toBe('current.mp4');
    });
  });
});

