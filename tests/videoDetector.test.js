/**
 * Unit tests for VideoDetector class
 */

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

