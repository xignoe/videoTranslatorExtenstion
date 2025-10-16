/**
 * Tests for SubtitleRenderer class
 * Testing DOM manipulation, positioning, and multiple video support
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

// Mock getBoundingClientRect
HTMLElement.prototype.getBoundingClientRect = function() {
  return {
    top: 100,
    left: 50,
    width: 640,
    height: 360,
    right: 690,
    bottom: 460
  };
};

// Mock getComputedStyle
global.getComputedStyle = () => ({
  position: 'static'
});

// Mock window properties
global.window = {
  ...dom.window,
  scrollY: 0,
  scrollX: 0,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

const SubtitleRenderer = require('../content/subtitleRenderer.js');

describe('SubtitleRenderer', () => {
  let renderer;
  let mockVideo1, mockVideo2;

  beforeEach(() => {
    renderer = new SubtitleRenderer();
    
    // Create mock video elements
    mockVideo1 = document.createElement('video');
    mockVideo1.id = 'video1';
    mockVideo2 = document.createElement('video');
    mockVideo2.id = 'video2';
    
    // Mock getBoundingClientRect for specific elements
    mockVideo1.getBoundingClientRect = jest.fn(() => ({
      top: 100,
      left: 50,
      width: 640,
      height: 360,
      right: 690,
      bottom: 460
    }));
    
    mockVideo2.getBoundingClientRect = jest.fn(() => ({
      top: 200,
      left: 100,
      width: 800,
      height: 450,
      right: 900,
      bottom: 650
    }));
    
    document.body.appendChild(mockVideo1);
    document.body.appendChild(mockVideo2);
  });

  afterEach(() => {
    renderer.cleanupAll();
    document.body.innerHTML = '';
  });

  describe('Initialization', () => {
    test('should initialize subtitle renderer for video', () => {
      renderer.initializeForVideo(mockVideo1, 'video1');
      
      expect(renderer.videoInstances.has('video1')).toBe(true);
      expect(renderer.subtitleContainers.has('video1')).toBe(true);
      
      const container = renderer.subtitleContainers.get('video1');
      expect(container.className).toBe('video-translator-subtitle-container');
      expect(container.getAttribute('data-video-id')).toBe('video1');
    });

    test('should handle multiple video initialization', () => {
      renderer.initializeForVideo(mockVideo1, 'video1');
      renderer.initializeForVideo(mockVideo2, 'video2');
      
      expect(renderer.videoInstances.size).toBe(2);
      expect(renderer.subtitleContainers.size).toBe(2);
      expect(renderer.getActiveVideoIds()).toEqual(['video1', 'video2']);
    });

    test('should not reinitialize existing video', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      renderer.initializeForVideo(mockVideo1, 'video1');
      renderer.initializeForVideo(mockVideo1, 'video1');
      
      expect(consoleSpy).toHaveBeenCalledWith('Video video1 already initialized for subtitles');
      expect(renderer.videoInstances.size).toBe(1);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Container Creation and Positioning', () => {
    test('should create properly positioned subtitle container', () => {
      renderer.initializeForVideo(mockVideo1, 'video1');
      
      const container = renderer.subtitleContainers.get('video1');
      expect(container.style.position).toBe('absolute');
      expect(container.style.zIndex).toBe('10000');
      expect(container.style.display).toBe('flex');
      // Width gets overridden by positioning, so check initial setup
      expect(container.className).toBe('video-translator-subtitle-container');
    });

    test('should position container relative to video element', () => {
      renderer.initializeForVideo(mockVideo1, 'video1');
      
      const container = renderer.subtitleContainers.get('video1');
      // After positioning, these values should be set
      expect(container.style.top).toBe('100px');
      expect(container.style.left).toBe('50px');
      expect(container.style.width).toBe('640px');
      expect(container.style.height).toBe('360px');
    });

    test('should apply custom settings to container', () => {
      const customSettings = {
        position: 'top',
        zIndex: 15000
      };
      
      renderer.initializeForVideo(mockVideo1, 'video1', customSettings);
      
      const container = renderer.subtitleContainers.get('video1');
      expect(container.style.zIndex).toBe('15000');
      expect(container.style.alignItems).toBe('flex-start');
    });
  });

  describe('Subtitle Display', () => {
    beforeEach(() => {
      renderer.initializeForVideo(mockVideo1, 'video1');
    });

    test('should display subtitle text', () => {
      renderer.displaySubtitle('video1', 'Hello World');
      
      const container = renderer.subtitleContainers.get('video1');
      const subtitleElement = container.querySelector('.video-translator-subtitle');
      
      expect(subtitleElement).toBeTruthy();
      expect(subtitleElement.textContent).toBe('Hello World');
      expect(renderer.activeSubtitles.has('video1')).toBe(true);
    });

    test('should apply default styling to subtitle', () => {
      renderer.displaySubtitle('video1', 'Test subtitle');
      
      const subtitleElement = renderer.activeSubtitles.get('video1');
      expect(subtitleElement.style.fontSize).toBe('16px');
      expect(subtitleElement.style.color).toBe('rgb(255, 255, 255)');
      expect(subtitleElement.style.backgroundColor).toBe('rgba(0, 0, 0, 0.8)');
      expect(subtitleElement.style.textAlign).toBe('center');
    });

    test('should clear existing subtitle when displaying new one', () => {
      renderer.displaySubtitle('video1', 'First subtitle');
      const firstSubtitle = renderer.activeSubtitles.get('video1');
      
      renderer.displaySubtitle('video1', 'Second subtitle');
      const secondSubtitle = renderer.activeSubtitles.get('video1');
      
      expect(firstSubtitle.parentNode).toBe(null);
      expect(secondSubtitle.textContent).toBe('Second subtitle');
    });

    test('should handle subtitle duration auto-hide', (done) => {
      renderer.displaySubtitle('video1', 'Temporary subtitle', { duration: 100 });
      
      expect(renderer.activeSubtitles.has('video1')).toBe(true);
      
      setTimeout(() => {
        expect(renderer.activeSubtitles.has('video1')).toBe(false);
        done();
      }, 150);
    });

    test('should not display subtitle when visibility is false', () => {
      renderer.setVisibility('video1', false);
      renderer.displaySubtitle('video1', 'Hidden subtitle');
      
      expect(renderer.activeSubtitles.has('video1')).toBe(false);
    });
  });

  describe('Multiple Video Support', () => {
    beforeEach(() => {
      renderer.initializeForVideo(mockVideo1, 'video1');
      renderer.initializeForVideo(mockVideo2, 'video2');
    });

    test('should handle subtitles for multiple videos independently', () => {
      renderer.displaySubtitle('video1', 'Subtitle 1');
      renderer.displaySubtitle('video2', 'Subtitle 2');
      
      const subtitle1 = renderer.activeSubtitles.get('video1');
      const subtitle2 = renderer.activeSubtitles.get('video2');
      
      expect(subtitle1.textContent).toBe('Subtitle 1');
      expect(subtitle2.textContent).toBe('Subtitle 2');
      expect(renderer.activeSubtitles.size).toBe(2);
    });

    test('should clear subtitle for specific video only', () => {
      renderer.displaySubtitle('video1', 'Subtitle 1');
      renderer.displaySubtitle('video2', 'Subtitle 2');
      
      renderer.clearSubtitle('video1');
      
      expect(renderer.activeSubtitles.has('video1')).toBe(false);
      expect(renderer.activeSubtitles.has('video2')).toBe(true);
    });

    test('should update settings for specific video only', () => {
      renderer.updateSettings('video1', { fontSize: 20 });
      
      const instance1 = renderer.videoInstances.get('video1');
      const instance2 = renderer.videoInstances.get('video2');
      
      expect(instance1.settings.fontSize).toBe(20);
      expect(instance2.settings.fontSize).toBe(16); // default
    });
  });

  describe('Settings Management', () => {
    beforeEach(() => {
      renderer.initializeForVideo(mockVideo1, 'video1');
    });

    test('should update subtitle settings', () => {
      const newSettings = {
        fontSize: 20,
        fontColor: '#ff0000',
        position: 'top'
      };
      
      renderer.updateSettings('video1', newSettings);
      
      const instance = renderer.videoInstances.get('video1');
      expect(instance.settings.fontSize).toBe(20);
      expect(instance.settings.fontColor).toBe('#ff0000');
      expect(instance.settings.position).toBe('top');
    });

    test('should update container alignment when position changes', () => {
      renderer.updateSettings('video1', { position: 'top' });
      
      const container = renderer.subtitleContainers.get('video1');
      expect(container.style.alignItems).toBe('flex-start');
    });

    test('should re-render active subtitle with new settings', () => {
      renderer.displaySubtitle('video1', 'Test subtitle');
      renderer.updateSettings('video1', { fontSize: 24 });
      
      const subtitleElement = renderer.activeSubtitles.get('video1');
      expect(subtitleElement.style.fontSize).toBe('24px');
    });
  });

  describe('Visibility Control', () => {
    beforeEach(() => {
      renderer.initializeForVideo(mockVideo1, 'video1');
    });

    test('should hide subtitle container when visibility is false', () => {
      renderer.setVisibility('video1', false);
      
      const container = renderer.subtitleContainers.get('video1');
      expect(container.style.display).toBe('none');
    });

    test('should show subtitle container when visibility is true', () => {
      renderer.setVisibility('video1', false);
      renderer.setVisibility('video1', true);
      
      const container = renderer.subtitleContainers.get('video1');
      expect(container.style.display).toBe('flex');
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      renderer.initializeForVideo(mockVideo1, 'video1');
      renderer.initializeForVideo(mockVideo2, 'video2');
    });

    test('should cleanup specific video', () => {
      renderer.displaySubtitle('video1', 'Test subtitle');
      renderer.cleanup('video1');
      
      expect(renderer.videoInstances.has('video1')).toBe(false);
      expect(renderer.subtitleContainers.has('video1')).toBe(false);
      expect(renderer.activeSubtitles.has('video1')).toBe(false);
      
      // Other video should remain
      expect(renderer.videoInstances.has('video2')).toBe(true);
    });

    test('should cleanup all videos', () => {
      renderer.displaySubtitle('video1', 'Subtitle 1');
      renderer.displaySubtitle('video2', 'Subtitle 2');
      
      renderer.cleanupAll();
      
      expect(renderer.videoInstances.size).toBe(0);
      expect(renderer.subtitleContainers.size).toBe(0);
      expect(renderer.activeSubtitles.size).toBe(0);
    });

    test('should remove container from DOM on cleanup', () => {
      const container = renderer.subtitleContainers.get('video1');
      expect(container.parentNode).toBeTruthy();
      
      renderer.cleanup('video1');
      expect(container.parentNode).toBe(null);
    });
  });

  describe('Utility Methods', () => {
    test('should get current subtitle info', () => {
      renderer.initializeForVideo(mockVideo1, 'video1');
      renderer.displaySubtitle('video1', 'Test subtitle', { duration: 5000 });
      
      const subtitleInfo = renderer.getCurrentSubtitle('video1');
      expect(subtitleInfo.text).toBe('Test subtitle');
      expect(subtitleInfo.duration).toBe(5000);
      expect(subtitleInfo.timestamp).toBeDefined();
    });

    test('should return null for non-existent video', () => {
      const subtitleInfo = renderer.getCurrentSubtitle('nonexistent');
      expect(subtitleInfo).toBe(null);
    });

    test('should get active video IDs', () => {
      renderer.initializeForVideo(mockVideo1, 'video1');
      renderer.initializeForVideo(mockVideo2, 'video2');
      
      const activeIds = renderer.getActiveVideoIds();
      expect(activeIds).toEqual(['video1', 'video2']);
    });
  });
});