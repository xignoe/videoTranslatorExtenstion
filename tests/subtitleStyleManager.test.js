/**
 * Tests for SubtitleStyleManager class
 * Testing customizable styling, CSS management, and user preferences
 */

// Mock DOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

const SubtitleStyleManager = require('../content/subtitleStyleManager.js');

describe('SubtitleStyleManager', () => {
  let styleManager;

  beforeEach(() => {
    // Clear any existing style elements
    const existingStyle = document.getElementById('video-translator-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    styleManager = new SubtitleStyleManager();
  });

  afterEach(() => {
    styleManager.cleanup();
  });

  describe('Initialization', () => {
    test('should initialize with default styles', () => {
      const styles = styleManager.getAllStyles();
      
      expect(styles.fontSize).toBe(16);
      expect(styles.fontColor).toBe('#ffffff');
      expect(styles.backgroundColor).toBe('rgba(0, 0, 0, 0.8)');
      expect(styles.position).toBe('bottom');
      expect(styles.fontFamily).toBe('Arial, sans-serif');
    });

    test('should create stylesheet element', () => {
      const styleElement = document.getElementById('video-translator-styles');
      expect(styleElement).toBeTruthy();
      expect(styleElement.tagName).toBe('STYLE');
    });

    test('should initialize CSS rules', () => {
      const styleElement = document.getElementById('video-translator-styles');
      const sheet = styleElement.sheet;
      
      expect(sheet.cssRules.length).toBeGreaterThan(0);
      
      // Check for container rule
      const containerRule = Array.from(sheet.cssRules).find(rule => 
        rule.selectorText && rule.selectorText.includes('video-translator-subtitle-container')
      );
      expect(containerRule).toBeTruthy();
    });
  });

  describe('Style Updates', () => {
    test('should update single style property', () => {
      styleManager.updateStyle('fontSize', 20);
      
      expect(styleManager.getStyle('fontSize')).toBe(20);
    });

    test('should update multiple style properties', () => {
      const newStyles = {
        fontSize: 18,
        fontColor: '#ff0000',
        position: 'top'
      };
      
      styleManager.updateStyles(newStyles);
      
      expect(styleManager.getStyle('fontSize')).toBe(18);
      expect(styleManager.getStyle('fontColor')).toBe('#ff0000');
      expect(styleManager.getStyle('position')).toBe('top');
    });

    test('should warn about unknown properties', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      styleManager.updateStyle('unknownProperty', 'value');
      
      expect(consoleSpy).toHaveBeenCalledWith('Unknown style property: unknownProperty');
      
      consoleSpy.mockRestore();
    });

    test('should update stylesheet when styles change', () => {
      const initialRuleCount = document.getElementById('video-translator-styles').sheet.cssRules.length;
      
      styleManager.updateStyle('fontSize', 24);
      
      // Should still have same number of rules (updated, not added)
      expect(document.getElementById('video-translator-styles').sheet.cssRules.length).toBe(initialRuleCount);
      
      // Check that the rule contains the new font size
      const subtitleRule = Array.from(document.getElementById('video-translator-styles').sheet.cssRules)
        .find(rule => rule.selectorText && rule.selectorText === '.video-translator-subtitle');
      
      expect(subtitleRule).toBeTruthy();
      expect(subtitleRule.cssText).toContain('font-size: 24px');
    });
  });

  describe('Style Validation', () => {
    test('should validate font size', () => {
      expect(styleManager.validateStyleValue('fontSize', 16)).toBe(true);
      expect(styleManager.validateStyleValue('fontSize', 8)).toBe(true);
      expect(styleManager.validateStyleValue('fontSize', 72)).toBe(true);
      expect(styleManager.validateStyleValue('fontSize', 5)).toBe(false);
      expect(styleManager.validateStyleValue('fontSize', 100)).toBe(false);
      expect(styleManager.validateStyleValue('fontSize', 'invalid')).toBe(false);
    });

    test('should validate colors', () => {
      expect(styleManager.validateStyleValue('fontColor', '#ffffff')).toBe(true);
      expect(styleManager.validateStyleValue('fontColor', '#000')).toBe(false); // Too short
      expect(styleManager.validateStyleValue('fontColor', 'rgba(255, 255, 255, 0.8)')).toBe(true);
      expect(styleManager.validateStyleValue('fontColor', 'rgb(255, 255, 255)')).toBe(true);
      expect(styleManager.validateStyleValue('fontColor', 'invalid')).toBe(false);
    });

    test('should validate position', () => {
      expect(styleManager.validateStyleValue('position', 'top')).toBe(true);
      expect(styleManager.validateStyleValue('position', 'center')).toBe(true);
      expect(styleManager.validateStyleValue('position', 'bottom')).toBe(true);
      expect(styleManager.validateStyleValue('position', 'invalid')).toBe(false);
    });

    test('should validate opacity', () => {
      expect(styleManager.validateStyleValue('opacity', 0)).toBe(true);
      expect(styleManager.validateStyleValue('opacity', 0.5)).toBe(true);
      expect(styleManager.validateStyleValue('opacity', 1)).toBe(true);
      expect(styleManager.validateStyleValue('opacity', -0.1)).toBe(false);
      expect(styleManager.validateStyleValue('opacity', 1.1)).toBe(false);
    });

    test('should validate font weight', () => {
      expect(styleManager.validateStyleValue('fontWeight', 'normal')).toBe(true);
      expect(styleManager.validateStyleValue('fontWeight', 'bold')).toBe(true);
      expect(styleManager.validateStyleValue('fontWeight', 400)).toBe(true);
      expect(styleManager.validateStyleValue('fontWeight', 700)).toBe(true);
      expect(styleManager.validateStyleValue('fontWeight', 50)).toBe(false);
      expect(styleManager.validateStyleValue('fontWeight', 1000)).toBe(false);
    });
  });

  describe('Style Reset', () => {
    test('should reset all styles to defaults', () => {
      // Change some styles
      styleManager.updateStyles({
        fontSize: 24,
        fontColor: '#ff0000',
        position: 'top'
      });
      
      // Reset to defaults
      styleManager.resetToDefaults();
      
      expect(styleManager.getStyle('fontSize')).toBe(16);
      expect(styleManager.getStyle('fontColor')).toBe('#ffffff');
      expect(styleManager.getStyle('position')).toBe('bottom');
    });

    test('should reset single style to default', () => {
      styleManager.updateStyle('fontSize', 24);
      styleManager.resetStyle('fontSize');
      
      expect(styleManager.getStyle('fontSize')).toBe(16);
    });
  });

  describe('Style Loading and Saving', () => {
    test('should load styles from saved data', () => {
      const savedStyles = {
        fontSize: 20,
        fontColor: '#00ff00',
        position: 'center'
      };
      
      styleManager.loadStyles(savedStyles);
      
      expect(styleManager.getStyle('fontSize')).toBe(20);
      expect(styleManager.getStyle('fontColor')).toBe('#00ff00');
      expect(styleManager.getStyle('position')).toBe('center');
    });

    test('should ignore invalid properties when loading', () => {
      const savedStyles = {
        fontSize: 20,
        invalidProperty: 'value',
        fontColor: '#00ff00'
      };
      
      styleManager.loadStyles(savedStyles);
      
      expect(styleManager.getStyle('fontSize')).toBe(20);
      expect(styleManager.getStyle('fontColor')).toBe('#00ff00');
      expect(styleManager.getStyle('invalidProperty')).toBeUndefined();
    });

    test('should get styles for saving', () => {
      styleManager.updateStyles({
        fontSize: 18,
        fontColor: '#ff0000'
      });
      
      const stylesForSaving = styleManager.getStylesForSaving();
      
      expect(stylesForSaving.fontSize).toBe(18);
      expect(stylesForSaving.fontColor).toBe('#ff0000');
      expect(typeof stylesForSaving).toBe('object');
    });
  });

  describe('Preview Generation', () => {
    test('should create preview element', () => {
      const preview = styleManager.createPreview('Test subtitle');
      
      expect(preview.className).toBe('video-translator-subtitle-container');
      expect(preview.getAttribute('data-position')).toBe('bottom');
      
      const subtitle = preview.querySelector('.video-translator-subtitle');
      expect(subtitle).toBeTruthy();
      expect(subtitle.textContent).toBe('Test subtitle');
    });

    test('should create preview with custom text', () => {
      const preview = styleManager.createPreview('Custom preview text');
      const subtitle = preview.querySelector('.video-translator-subtitle');
      
      expect(subtitle.textContent).toBe('Custom preview text');
    });

    test('should create preview with default text', () => {
      const preview = styleManager.createPreview();
      const subtitle = preview.querySelector('.video-translator-subtitle');
      
      expect(subtitle.textContent).toBe('Sample subtitle text');
    });
  });

  describe('Available Options', () => {
    test('should provide available fonts', () => {
      const fonts = styleManager.getAvailableFonts();
      
      expect(Array.isArray(fonts)).toBe(true);
      expect(fonts.length).toBeGreaterThan(0);
      
      const arial = fonts.find(font => font.name === 'Arial');
      expect(arial).toBeTruthy();
      expect(arial.value).toBe('Arial, sans-serif');
    });

    test('should provide available positions', () => {
      const positions = styleManager.getAvailablePositions();
      
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBe(3);
      
      const positionValues = positions.map(p => p.value);
      expect(positionValues).toContain('top');
      expect(positionValues).toContain('center');
      expect(positionValues).toContain('bottom');
    });
  });

  describe('Observer Pattern', () => {
    test('should add and notify observers', () => {
      const observer = jest.fn();
      styleManager.addObserver(observer);
      
      styleManager.updateStyle('fontSize', 20);
      
      expect(observer).toHaveBeenCalledWith('fontSize', 20);
    });

    test('should remove observers', () => {
      const observer = jest.fn();
      styleManager.addObserver(observer);
      styleManager.removeObserver(observer);
      
      styleManager.updateStyle('fontSize', 20);
      
      expect(observer).not.toHaveBeenCalled();
    });

    test('should notify multiple observers', () => {
      const observer1 = jest.fn();
      const observer2 = jest.fn();
      
      styleManager.addObserver(observer1);
      styleManager.addObserver(observer2);
      
      styleManager.updateStyle('fontSize', 20);
      
      expect(observer1).toHaveBeenCalledWith('fontSize', 20);
      expect(observer2).toHaveBeenCalledWith('fontSize', 20);
    });

    test('should handle observer errors gracefully', () => {
      const errorObserver = jest.fn(() => {
        throw new Error('Observer error');
      });
      const normalObserver = jest.fn();
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      styleManager.addObserver(errorObserver);
      styleManager.addObserver(normalObserver);
      
      styleManager.updateStyle('fontSize', 20);
      
      expect(consoleSpy).toHaveBeenCalledWith('Error in style observer:', expect.any(Error));
      expect(normalObserver).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('CSS Alignment', () => {
    test('should get correct alignment for positions', () => {
      expect(styleManager.getAlignmentForPosition('top')).toBe('flex-start');
      expect(styleManager.getAlignmentForPosition('center')).toBe('center');
      expect(styleManager.getAlignmentForPosition('bottom')).toBe('flex-end');
      expect(styleManager.getAlignmentForPosition('invalid')).toBe('flex-end');
    });
  });

  describe('Cleanup', () => {
    test('should remove stylesheet on cleanup', () => {
      expect(document.getElementById('video-translator-styles')).toBeTruthy();
      
      styleManager.cleanup();
      
      expect(document.getElementById('video-translator-styles')).toBeFalsy();
    });

    test('should clear observers on cleanup', () => {
      const observer = jest.fn();
      styleManager.addObserver(observer);
      
      styleManager.cleanup();
      
      // Try to trigger observer after cleanup
      styleManager.updateStyle('fontSize', 20);
      expect(observer).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    test('should handle null/undefined saved styles', () => {
      expect(() => {
        styleManager.loadStyles(null);
        styleManager.loadStyles(undefined);
        styleManager.loadStyles('invalid');
      }).not.toThrow();
    });

    test('should handle missing stylesheet', () => {
      // Remove stylesheet manually
      const styleElement = document.getElementById('video-translator-styles');
      if (styleElement) {
        styleElement.remove();
      }
      styleManager.styleSheet = null;
      
      expect(() => {
        styleManager.updateStyle('fontSize', 20);
      }).not.toThrow();
    });

    test('should handle reinitialization of existing stylesheet', () => {
      // Create another style manager (should reuse existing stylesheet)
      const styleManager2 = new SubtitleStyleManager();
      
      expect(document.querySelectorAll('#video-translator-styles').length).toBe(1);
      
      styleManager2.cleanup();
    });
  });
});