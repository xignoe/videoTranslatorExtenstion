/**
 * Tests for VideoDetector platform-specific functionality
 */

// Mock DOM environment
class MockElement {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.style = {};
    this.paused = true;
    this.currentTime = 0;
    this.duration = 0;
    this.src = attributes.src || '';
    this.currentSrc = attributes.currentSrc || '';
    this.id = attributes.id || '';
    this.className = attributes.class || attributes.className || '';
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

  hasAttribute(name) {
    return this.attributes.hasOwnProperty(name);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body');
    this.elements = [];
  }

  querySelectorAll(selector) {
    return this.elements.filter(element => {
      // Handle basic selectors
      if (selector === 'video' || selector === 'audio') {
        return element.tagName.toLowerCase() === selector;
      }
      
      // Handle attribute selectors
      if (selector.includes('[src*=')) {
        const match = selector.match(/\[src\*="([^"]+)"\]/);
        if (match) {
          const searchTerm = match[1];
          return element.src.includes(searchTerm);
        }
      }
      
      // Handle iframe selectors
      if (selector.startsWith('iframe')) {
        if (element.tagName.toLowerCase() !== 'iframe') return false;
        
        if (selector.includes('[src*=')) {
          const match = selector.match(/\[src\*="([^"]+)"\]/);
          if (match) {
            const searchTerm = match[1];
            return element.src.includes(searchTerm);
          }
        }
        
        if (selector.includes('[data-')) {
          const match = selector.match(/\[([^=\]]+)\]/);
          if (match) {
            const attrName = match[1];
            return element.hasAttribute(attrName);
          }
        }
        
        return true;
      }
      
      // Handle class selectors
      if (selector.startsWith('.')) {
        const className = selector.substring(1);
        return element.className.includes(className);
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
  constructor(hostname = 'example.com') {
    this.location = { hostname };
  }

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

// Mock IntersectionObserver
class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
  }

  observe(target) {
    this.target = target;
  }

  disconnect() {}
}

// Set up global mocks
global.document = new MockDocument();
global.window = new MockWindow();
global.MutationObserver = MockMutationObserver;
global.IntersectionObserver = MockIntersectionObserver;
global.Node = { ELEMENT_NODE: 1 };

// Import VideoDetector
const VideoDetector = require('../content/videoDetector.js');

// Simple test runner
function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, testFn) {
    try {
      // Reset document and window for each test
      global.document = new MockDocument();
      global.window = new MockWindow();
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
      },
      toContain: (expected) => {
        if (!actual.includes(expected)) {
          throw new Error(`Expected ${actual} to contain ${expected}`);
        }
      }
    };
  }

  console.log('=== VideoDetector Platform-Specific Tests ===\n');

  test('should detect YouTube iframe videos', () => {
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const youtubeIframe = new MockElement('iframe', { 
      src: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      width: 640,
      height: 480
    });
    
    global.document.addElement(youtubeIframe);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(1);
    expect(addedVideos[0].tagName).toBe('iframe');
    expect(addedVideos[0].src).toContain('youtube.com');
    expect(addedVideos[0].platform).toBe('youtube');
    
    detector.destroy();
  });

  test('should detect Vimeo iframe videos', () => {
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const vimeoIframe = new MockElement('iframe', { 
      src: 'https://player.vimeo.com/video/123456789',
      width: 640,
      height: 480
    });
    
    global.document.addElement(vimeoIframe);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(1);
    expect(addedVideos[0].tagName).toBe('iframe');
    expect(addedVideos[0].src).toContain('vimeo.com');
    expect(addedVideos[0].platform).toBe('vimeo');
    
    detector.destroy();
  });

  test('should detect platform-specific videos on YouTube', () => {
    global.window = new MockWindow('www.youtube.com');
    
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const youtubeVideo = new MockElement('video', { 
      src: 'https://r1---sn-4g5e6nez.googlevideo.com/videoplayback',
      width: 640,
      height: 480,
      className: 'html5-main-video'
    });
    
    global.document.addElement(youtubeVideo);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(1);
    expect(addedVideos[0].tagName).toBe('video');
    expect(addedVideos[0].platform).toBe('youtube');
    
    detector.destroy();
  });

  test('should detect Netflix videos', () => {
    global.window = new MockWindow('www.netflix.com');
    
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const netflixVideo = new MockElement('video', { 
      src: 'https://netflix.com/video/123456',
      width: 640,
      height: 480,
      className: 'VideoContainer'
    });
    
    global.document.addElement(netflixVideo);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(1);
    expect(addedVideos[0].platform).toBe('netflix');
    
    detector.destroy();
  });

  test('should handle iframe with data attributes', () => {
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const dataIframe = new MockElement('iframe', { 
      'data-video-id': '123456',
      'data-player': 'custom',
      width: 640,
      height: 480
    });
    
    global.document.addElement(dataIframe);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(1);
    expect(addedVideos[0].tagName).toBe('iframe');
    
    detector.destroy();
  });

  test('should not detect invalid iframes', () => {
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const invalidIframe = new MockElement('iframe', { 
      src: 'https://example.com/not-a-video',
      width: 640,
      height: 480
    });
    
    global.document.addElement(invalidIframe);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(0);
    
    detector.destroy();
  });

  test('should detect multiple platform videos', () => {
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const youtubeIframe = new MockElement('iframe', { 
      src: 'https://www.youtube.com/embed/abc123',
      width: 640,
      height: 480
    });
    
    const vimeoIframe = new MockElement('iframe', { 
      src: 'https://player.vimeo.com/video/456789',
      width: 640,
      height: 480
    });
    
    const regularVideo = new MockElement('video', { 
      src: 'https://example.com/video.mp4',
      width: 640,
      height: 480
    });
    
    global.document.addElement(youtubeIframe);
    global.document.addElement(vimeoIframe);
    global.document.addElement(regularVideo);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(3);
    
    const platforms = addedVideos.map(v => v.platform);
    expect(platforms).toContain('youtube');
    expect(platforms).toContain('vimeo');
    
    detector.destroy();
  });

  test('should handle Twitch videos', () => {
    global.window = new MockWindow('www.twitch.tv');
    
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const twitchVideo = new MockElement('video', { 
      src: 'https://video-weaver.sea01.hls.ttvnw.net/v1/playlist.m3u8',
      width: 640,
      height: 480
    });
    
    global.document.addElement(twitchVideo);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(1);
    expect(addedVideos[0].platform).toBe('twitch');
    
    detector.destroy();
  });

  test('should detect platform from element class names', () => {
    const detector = new VideoDetector();
    let addedVideos = [];
    
    const videoWithClass = new MockElement('video', { 
      src: 'https://example.com/video.mp4',
      width: 640,
      height: 480,
      className: 'youtube-player-video'
    });
    
    global.document.addElement(videoWithClass);
    
    detector.initialize({
      onVideoAdded: (video) => addedVideos.push(video)
    });

    expect(addedVideos).toHaveLength(1);
    expect(addedVideos[0].platform).toBe('youtube');
    
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