/**
 * Platform-specific tests for VideoDetector class
 * Tests video detection across different video platforms
 */

const VideoDetector = require('../content/videoDetector.js');

describe('VideoDetector Platform Compatibility', () => {
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
      })),
      location: {
        href: 'https://example.com'
      }
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

  describe('YouTube Platform', () => {
    beforeEach(() => {
      global.window.location.href = 'https://www.youtube.com/watch?v=test';
    });

    test('should detect YouTube video player', () => {
      const mockYouTubeVideo = {
        tagName: 'VIDEO',
        src: '',
        currentSrc: 'https://r1---sn-test.googlevideo.com/videoplayback',
        getBoundingClientRect: () => ({ width: 854, height: 480 }),
        id: 'movie_player',
        className: 'video-stream html5-main-video',
        paused: false,
        currentTime: 30,
        duration: 300
      };

      global.document.querySelectorAll = jest.fn((selector) => {
        if (selector === 'video, audio') {
          return [mockYouTubeVideo];
        }
        return [];
      });

      detector.initialize(mockCallbacks);

      expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(1);
      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.platform).toBe('youtube');
      expect(detectedVideo.isPlaying).toBe(true);
    });

    test('should handle YouTube shorts', () => {
      global.window.location.href = 'https://www.youtube.com/shorts/test';
      
      const mockShortsVideo = {
        tagName: 'VIDEO',
        src: '',
        currentSrc: 'https://r1---sn-test.googlevideo.com/videoplayback',
        getBoundingClientRect: () => ({ width: 405, height: 720 }),
        id: 'shorts-player',
        className: 'video-stream html5-main-video',
        paused: false,
        currentTime: 5,
        duration: 60
      };

      global.document.querySelectorAll = jest.fn((selector) => {
        if (selector === 'video, audio') {
          return [mockShortsVideo];
        }
        return [];
      });

      detector.initialize(mockCallbacks);

      expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(1);
      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.platform).toBe('youtube');
      expect(detectedVideo.aspectRatio).toBeCloseTo(0.56, 2); // 405/720
    });
  });

  describe('Netflix Platform', () => {
    beforeEach(() => {
      global.window.location.href = 'https://www.netflix.com/watch/12345';
    });

    test('should detect Netflix video player', () => {
      const mockNetflixVideo = {
        tagName: 'VIDEO',
        src: 'https://netflix-video.com/stream',
        getBoundingClientRect: () => ({ width: 1280, height: 720 }),
        id: 'netflix-player',
        className: 'VideoContainer--video',
        paused: false,
        currentTime: 600,
        duration: 3600
      };

      global.document.querySelectorAll = jest.fn((selector) => {
        if (selector === 'video, audio') {
          return [mockNetflixVideo];
        }
        return [];
      });

      detector.initialize(mockCallbacks);

      expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(1);
      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.platform).toBe('netflix');
      expect(detectedVideo.isPlaying).toBe(true);
    });
  });

  describe('Vimeo Platform', () => {
    beforeEach(() => {
      global.window.location.href = 'https://vimeo.com/12345';
    });

    test('should detect Vimeo video player', () => {
      const mockVimeoVideo = {
        tagName: 'VIDEO',
        src: 'https://vod-progressive.akamaized.net/exp=test/video.mp4',
        getBoundingClientRect: () => ({ width: 960, height: 540 }),
        id: 'vimeo-player',
        className: 'vp-video',
        paused: true,
        currentTime: 0,
        duration: 180
      };

      global.document.querySelectorAll = jest.fn((selector) => {
        if (selector === 'video, audio') {
          return [mockVimeoVideo];
        }
        return [];
      });

      detector.initialize(mockCallbacks);

      expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(1);
      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.platform).toBe('vimeo');
      expect(detectedVideo.isPlaying).toBe(false);
    });
  });

  describe('Generic Platform', () => {
    beforeEach(() => {
      global.window.location.href = 'https://example.com/video-page';
    });

    test('should detect generic HTML5 video', () => {
      const mockGenericVideo = {
        tagName: 'VIDEO',
        src: 'https://example.com/video.mp4',
        getBoundingClientRect: () => ({ width: 800, height: 450 }),
        id: 'generic-video',
        className: 'video-player',
        paused: false,
        currentTime: 45,
        duration: 120
      };

      global.document.querySelectorAll = jest.fn((selector) => {
        if (selector === 'video, audio') {
          return [mockGenericVideo];
        }
        return [];
      });

      detector.initialize(mockCallbacks);

      expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(1);
      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.platform).toBe('generic');
      expect(detectedVideo.isPlaying).toBe(true);
    });

    test('should handle iframe-embedded videos', () => {
      const mockIframeVideo = {
        tagName: 'VIDEO',
        src: 'https://player.example.com/embed/video.mp4',
        getBoundingClientRect: () => ({ width: 560, height: 315 }),
        id: 'iframe-video',
        className: 'embedded-video',
        paused: false,
        currentTime: 10,
        duration: 90,
        ownerDocument: {
          defaultView: {
            parent: global.window,
            frameElement: {
              tagName: 'IFRAME',
              src: 'https://player.example.com/embed/12345'
            }
          }
        }
      };

      global.document.querySelectorAll = jest.fn((selector) => {
        if (selector === 'video, audio') {
          return [mockIframeVideo];
        }
        return [];
      });

      detector.initialize(mockCallbacks);

      expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(1);
      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.platform).toBe('generic');
      expect(detectedVideo.isEmbedded).toBe(true);
    });
  });

  describe('Audio Content', () => {
    test('should detect audio elements', () => {
      const mockAudio = {
        tagName: 'AUDIO',
        src: 'https://example.com/audio.mp3',
        getBoundingClientRect: () => ({ width: 300, height: 30 }),
        id: 'audio-player',
        className: 'audio-controls',
        paused: false,
        currentTime: 60,
        duration: 240
      };

      global.document.querySelectorAll = jest.fn((selector) => {
        if (selector === 'video, audio') {
          return [mockAudio];
        }
        return [];
      });

      detector.initialize(mockCallbacks);

      expect(mockCallbacks.onVideoAdded).toHaveBeenCalledTimes(1);
      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.type).toBe('audio');
      expect(detectedVideo.isPlaying).toBe(true);
    });
  });

  describe('Platform-Specific Features', () => {
    test('should extract platform-specific metadata', () => {
      global.window.location.href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      const mockYouTubeVideo = {
        tagName: 'VIDEO',
        src: '',
        currentSrc: 'https://r1---sn-test.googlevideo.com/videoplayback',
        getBoundingClientRect: () => ({ width: 854, height: 480 }),
        id: 'movie_player',
        className: 'video-stream html5-main-video',
        paused: false,
        currentTime: 30,
        duration: 300
      };

      // Mock YouTube-specific DOM elements
      global.document.querySelector = jest.fn((selector) => {
        if (selector === 'h1.title') {
          return { textContent: 'Never Gonna Give You Up' };
        }
        if (selector === '#owner-name a') {
          return { textContent: 'Rick Astley' };
        }
        return null;
      });

      global.document.querySelectorAll = jest.fn((selector) => {
        if (selector === 'video, audio') {
          return [mockYouTubeVideo];
        }
        return [];
      });

      detector.initialize(mockCallbacks);

      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.platform).toBe('youtube');
      expect(detectedVideo.videoId).toBe('dQw4w9WgXcQ');
    });

    test('should handle platform-specific quality settings', () => {
      global.window.location.href = 'https://www.netflix.com/watch/12345';
      
      const mockNetflixVideo = {
        tagName: 'VIDEO',
        src: 'https://netflix-video.com/stream',
        getBoundingClientRect: () => ({ width: 1920, height: 1080 }),
        id: 'netflix-player',
        className: 'VideoContainer--video',
        paused: false,
        currentTime: 600,
        duration: 3600,
        videoWidth: 1920,
        videoHeight: 1080
      };

      global.document.querySelectorAll = jest.fn((selector) => {
        if (selector === 'video, audio') {
          return [mockNetflixVideo];
        }
        return [];
      });

      detector.initialize(mockCallbacks);

      const detectedVideo = detector.getDetectedVideos()[0];
      expect(detectedVideo.platform).toBe('netflix');
      expect(detectedVideo.quality).toBe('1080p');
      expect(detectedVideo.aspectRatio).toBeCloseTo(1.78, 2); // 16:9
    });
  });
});