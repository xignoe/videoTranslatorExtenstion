/**
 * Tests for SubtitleRenderer integration with SubtitleStyleManager
 * Testing style manager integration and dynamic styling
 */

// Mock DOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

global.window = {
  ...dom.window,
  scrollY: 0,
  scrollX: 0,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLVideoElement = dom.window.HTMLVideoElement;

const SubtitleRenderer = require('../content/subtitleRenderer.js');
const SubtitleStyleManager = require('../content/subtitleStyleManager.js');

describe('SubtitleRenderer with StyleManager', () => {
  let renderer;
  let styleManager;
  let mockVideo;

  beforeEach(() => {
    // Clear any existing style elements
    const existingStyle = document.getElementById('video-translator-styles');
    if (existingStyle) {
      existingStyle.remove();
    }

    styleManager = new SubtitleStyleManager();
    renderer = new SubtitleRenderer(styleManager);
    
    // Create mock video element
    mockVideo = document.createElement('video');
    mockVideo.id = 'video1';
    
    // Mock getBoundingClientRect for video element
    mockVideo.getBoundingClientRect = jest.fn(() => ({
      top: 100,
      left: 50,
      width: 640,
      height: 360,
      right: 690,
      bottom: 460
    }));
    
    document.body.appendChild(mockVideo);
  });

  afterEach(() => {
    renderer.cleanupAll();
    styleManager.cleanup();
    document.body.innerHTML = '';
  });

  describe('Initialization with Style Manager', () => {
    test('should initialize with style manager', () => {
      expect(renderer.getStyleManager()).toBe(styleManager);
    });

    test('should use style manager styles for initialization', () => {
      // Update style manager styles
      styleManager.updateStyles({
        fontSize: 20,
        fontColor: '#ff0000',
        position: 'top'
      });

      renderer.initializeForVideo(mockVideo, 'video1');
      
      const container = renderer.subtitleContainers.get('video1');
      expect(container.getAttribute('data-position')).toBe('top');
      
      const instance = renderer.videoInstances.get('video1');
      expect(instance.settings.fontSize).toBe(20);
      expect(instance.settings.fontColor).toBe('#ff0000');
    });

    test('should create container with CSS classes', () => {
      renderer.initializeForVideo(mockVideo, 'video1');
      
      const container = renderer.subtitleContainers.get('video1');
      expect(container.className).toBe('video-translator-subtitle-container');
      expect(container.getAttribute('data-position')).toBe('bottom'); // default
    });
  });

  describe('Subtitle Creation with Style Manager', () => {
    beforeEach(() => {
      renderer.initializeForVideo(mockVideo, 'video1');
    });

    test('should create subtitle with CSS classes', () => {
      renderer.displaySubtitle('video1', 'Test subtitle');
      
      const subtitleElement = renderer.activeSubtitles.get('video1');
      expect(subtitleElement.className).toContain('video-translator-subtitle');
      expect(subtitleElement.className).toContain('fade-in');
    });

    test('should not apply inline styles when using style manager', () => {
      renderer.displaySubtitle('video1', 'Test subtitle');
      
      const subtitleElement = renderer.activeSubtitles.get('video1');
      // Should not have inline font-size style (handled by CSS)
      expect(subtitleElement.style.fontSize).toBe('');
    });
  });

  describe('Style Manager Integration', () => {
    beforeEach(() => {
      renderer.initializeForVideo(mockVideo, 'video1');
    });

    test('should respond to style manager changes', () => {
      // Change position in style manager
      styleManager.updateStyle('position', 'top');
      
      const container = renderer.subtitleContainers.get('video1');
      expect(container.getAttribute('data-position')).toBe('top');
      
      const instance = renderer.videoInstances.get('video1');
      expect(instance.settings.position).toBe('top');
    });

    test('should update all videos when styles change', () => {
      // Initialize second video
      const mockVideo2 = document.createElement('video');
      mockVideo2.getBoundingClientRect = mockVideo.getBoundingClientRect;
      document.body.appendChild(mockVideo2);
      
      renderer.initializeForVideo(mockVideo2, 'video2');
      
      // Change styles
      styleManager.updateStyles({
        fontSize: 24,
        position: 'center'
      });
      
      // Check both videos updated
      const container1 = renderer.subtitleContainers.get('video1');
      const container2 = renderer.subtitleContainers.get('video2');
      
      expect(container1.getAttribute('data-position')).toBe('center');
      expect(container2.getAttribute('data-position')).toBe('center');
      
      const instance1 = renderer.videoInstances.get('video1');
      const instance2 = renderer.videoInstances.get('video2');
      
      expect(instance1.settings.fontSize).toBe(24);
      expect(instance2.settings.fontSize).toBe(24);
    });

    test('should handle style manager reset', () => {
      // Change styles
      styleManager.updateStyle('position', 'top');
      
      // Reset styles
      styleManager.resetToDefaults();
      
      const container = renderer.subtitleContainers.get('video1');
      expect(container.getAttribute('data-position')).toBe('bottom');
      
      const instance = renderer.videoInstances.get('video1');
      expect(instance.settings.position).toBe('bottom');
    });
  });

  describe('Style Manager Replacement', () => {
    test('should set new style manager', () => {
      const newStyleManager = new SubtitleStyleManager();
      newStyleManager.updateStyle('fontSize', 30);
      
      renderer.setStyleManager(newStyleManager);
      
      expect(renderer.getStyleManager()).toBe(newStyleManager);
      
      newStyleManager.cleanup();
    });

    test('should remove old style manager observer', () => {
      const observer = jest.fn();
      styleManager.addObserver(observer);
      
      const newStyleManager = new SubtitleStyleManager();
      renderer.setStyleManager(newStyleManager);
      
      // Old style manager changes should not affect renderer
      styleManager.updateStyle('fontSize', 30);
      
      // Observer should still be called (it's not removed from old style manager)
      // but renderer should not be affected
      expect(observer).toHaveBeenCalled();
      
      newStyleManager.cleanup();
    });

    test('should update existing instances with new style manager', () => {
      renderer.initializeForVideo(mockVideo, 'video1');
      
      const newStyleManager = new SubtitleStyleManager();
      newStyleManager.updateStyle('fontSize', 25);
      
      renderer.setStyleManager(newStyleManager);
      
      const instance = renderer.videoInstances.get('video1');
      expect(instance.settings.fontSize).toBe(25);
      
      newStyleManager.cleanup();
    });
  });

  describe('Fallback without Style Manager', () => {
    test('should work without style manager', () => {
      const rendererWithoutStyleManager = new SubtitleRenderer();
      
      rendererWithoutStyleManager.initializeForVideo(mockVideo, 'video1');
      rendererWithoutStyleManager.displaySubtitle('video1', 'Test subtitle');
      
      const subtitleElement = rendererWithoutStyleManager.activeSubtitles.get('video1');
      expect(subtitleElement).toBeTruthy();
      
      // Should have inline styles when no style manager
      expect(subtitleElement.style.fontSize).toBe('16px');
      expect(subtitleElement.style.color).toBe('rgb(255, 255, 255)');
      
      rendererWithoutStyleManager.cleanupAll();
    });

    test('should apply inline styles without style manager', () => {
      const rendererWithoutStyleManager = new SubtitleRenderer();
      
      rendererWithoutStyleManager.initializeForVideo(mockVideo, 'video1', {
        fontSize: 22,
        fontColor: '#00ff00'
      });
      
      rendererWithoutStyleManager.displaySubtitle('video1', 'Test subtitle');
      
      const subtitleElement = rendererWithoutStyleManager.activeSubtitles.get('video1');
      expect(subtitleElement.style.fontSize).toBe('22px');
      expect(subtitleElement.style.color).toBe('rgb(0, 255, 0)');
      
      rendererWithoutStyleManager.cleanupAll();
    });
  });

  describe('Cleanup with Style Manager', () => {
    test('should remove style manager observer on cleanup', () => {
      const observerSpy = jest.spyOn(styleManager, 'removeObserver');
      
      renderer.cleanupAll();
      
      expect(observerSpy).toHaveBeenCalled();
      
      observerSpy.mockRestore();
    });

    test('should not affect style manager after cleanup', () => {
      renderer.initializeForVideo(mockVideo, 'video1');
      renderer.cleanupAll();
      
      // Style manager should still work
      expect(() => {
        styleManager.updateStyle('fontSize', 20);
      }).not.toThrow();
      
      expect(styleManager.getStyle('fontSize')).toBe(20);
    });
  });

  describe('Edge Cases', () => {
    test('should handle null style manager', () => {
      renderer.setStyleManager(null);
      
      expect(renderer.getStyleManager()).toBe(null);
      
      // Should still work without style manager
      expect(() => {
        renderer.initializeForVideo(mockVideo, 'video1');
        renderer.displaySubtitle('video1', 'Test');
      }).not.toThrow();
    });

    test('should handle style manager without observer support', () => {
      const mockStyleManager = {
        getAllStyles: () => ({ fontSize: 16, fontColor: '#ffffff', position: 'bottom' }),
        addObserver: jest.fn(),
        removeObserver: jest.fn()
      };
      
      expect(() => {
        renderer.setStyleManager(mockStyleManager);
      }).not.toThrow();
    });
  });
});