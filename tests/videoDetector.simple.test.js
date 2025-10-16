/**
 * Simple focused tests for VideoDetector core functionality
 */

// Mock DOM environment
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
      width: this.attributes.width || 0,
      height: this.attributes.height || 0,
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
}

// Set up global mocks
global.document = new MockDocument();
global.window = new MockWindow();
global.MutationObserver = MockMutationObserver;
global.Node = { ELEMENT_NODE: 1 };

// Import VideoDetector
const VideoDetector = require('../content/videoDetector.js');

// Simple test runner
function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, testFn) {
    try {
      // Reset document for each test
      global.document = new MockDocument();
      testFn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`✗ ${name}: ${error.message}`);
      failed++;
    }
  }

  function expect(actual) {
    return {
      toBe: (expected) => {
        if (actual !== expected) {
          throw new Error(`Expected ${actual} to be ${expected}`);
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
      }
    };
  }

  console.log('=== VideoDetector Core Functionality Tests ===\n');

  test('should detect basic video element', () => {
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const videoElement = new MockElement('video', { 
      src: 'test.mp4',
      width: 640,
      height: 480
    });
    
    global.document.addElement(videoElement);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(1);
    expect(addedVideos[0].tagName).toBe('video');
    expect(addedVideos[0].src).toBe('test.mp4');
    
    detector.destroy();
  });

  test('should detect audio element', () => {
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const audioElement = new MockElement('audio', { 
      src: 'test.mp3',
      width: 300,
      height: 50
    });
    
    global.document.addElement(audioElement);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(1);
    expect(addedVideos[0].tagName).toBe('audio');
    expect(addedVideos[0].src).toBe('test.mp3');
    
    detector.destroy();
  });

  test('should not detect hidden video elements', () => {
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const hiddenVideo = new MockElement('video', { 
      src: 'test.mp4',
      width: 0,
      height: 0
    });
    
    global.document.addElement(hiddenVideo);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(0);
    
    detector.destroy();
  });

  test('should generate unique IDs for videos', () => {
    const detector = new VideoDetector();
    let addedVideos = [];
    
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
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(2);
    expect(addedVideos[0].id !== addedVideos[1].id).toBeTruthy();
    
    detector.destroy();
  });

  test('should use element ID when available', () => {
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const videoElement = new MockElement('video', { 
      id: 'my-video',
      src: 'test.mp4',
      width: 640,
      height: 480
    });
    
    global.document.addElement(videoElement);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(1);
    expect(addedVideos[0].id).toBe('video_my-video');
    
    detector.destroy();
  });

  test('should get video info by element', () => {
    const detector = new VideoDetector();
    
    const videoElement = new MockElement('video', { 
      src: 'test.mp4',
      width: 640,
      height: 480
    });
    
    global.document.addElement(videoElement);
    detector.initialize();

    const videoInfo = detector.getVideoInfo(videoElement);
    expect(videoInfo).toBeTruthy();
    expect(videoInfo.src).toBe('test.mp4');
    
    detector.destroy();
  });

  test('should return null for unknown video element', () => {
    const detector = new VideoDetector();
    const unknownVideo = new MockElement('video', { src: 'unknown.mp4' });
    
    detector.initialize();

    const videoInfo = detector.getVideoInfo(unknownVideo);
    expect(videoInfo).toBeNull();
    
    detector.destroy();
  });

  test('should handle videos without src', () => {
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const videoElement = new MockElement('video', { 
      width: 640,
      height: 480
    });
    
    global.document.addElement(videoElement);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(1);
    expect(addedVideos[0].src).toBe('unknown');
    
    detector.destroy();
  });

  test('should handle currentSrc property', () => {
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const videoElement = new MockElement('video', { 
      currentSrc: 'current.mp4',
      width: 640,
      height: 480
    });
    
    global.document.addElement(videoElement);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(1);
    expect(addedVideos[0].src).toBe('current.mp4');
    
    detector.destroy();
  });

  test('should set up event listeners for detected videos', () => {
    const detector = new VideoDetector();
    
    const videoElement = new MockElement('video', { 
      src: 'test.mp4',
      width: 640,
      height: 480
    });
    
    global.document.addElement(videoElement);
    detector.initialize();

    // Check that event listeners were added
    expect(videoElement.eventListeners.play).toBeTruthy();
    expect(videoElement.eventListeners.pause).toBeTruthy();
    expect(videoElement.eventListeners.ended).toBeTruthy();
    
    detector.destroy();
  });

  console.log(`\n=== Test Summary ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  
  return failed === 0;
}

// Run the tests
runTests();