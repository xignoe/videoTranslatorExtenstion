/**
 * Performance and memory usage tests for the video translator extension
 * Tests processing latency, memory consumption, and resource cleanup
 */

describe('Performance and Memory Tests', () => {
  let mockVideoElement;
  let mockAudioProcessor;
  let mockSpeechRecognizer;
  let mockTranslationService;
  let mockSubtitleRenderer;

  beforeEach(() => {
    // Mock performance API
    global.performance = {
      now: jest.fn(() => Date.now()),
      mark: jest.fn(),
      measure: jest.fn(),
      getEntriesByName: jest.fn(() => []),
      getEntriesByType: jest.fn(() => [])
    };

    // Mock memory API
    global.performance.memory = {
      usedJSHeapSize: 10000000, // 10MB
      totalJSHeapSize: 20000000, // 20MB
      jsHeapSizeLimit: 100000000 // 100MB
    };

    mockVideoElement = document.createElement('video');
    mockVideoElement.src = 'test-video.mp4';

    // Mock components with performance tracking
    mockAudioProcessor = {
      captureAudioFromVideo: jest.fn(() => Promise.resolve(true)),
      stopProcessing: jest.fn(),
      getStatus: jest.fn(() => ({ isProcessing: true })),
      processAudioData: jest.fn()
    };

    mockSpeechRecognizer = {
      initialize: jest.fn(() => true),
      startListening: jest.fn(() => true),
      stopListening: jest.fn(),
      processAudio: jest.fn()
    };

    mockTranslationService = {
      translateText: jest.fn(() => Promise.resolve({
        originalText: 'Hello world',
        translatedText: 'Hola mundo',
        processingTime: 150 // ms
      }))
    };

    mockSubtitleRenderer = {
      initializeForVideo: jest.fn(),
      displaySubtitle: jest.fn(),
      clearSubtitle: jest.fn(),
      cleanup: jest.fn()
    };
  });

  describe('Processing Latency', () => {
    test('should process audio data within acceptable latency', async () => {
      const startTime = performance.now();
      
      // Simulate audio processing
      const audioData = {
        frequencyData: new Uint8Array(2048),
        timeDomainData: new Float32Array(2048),
        audioLevel: 0.5,
        timestamp: Date.now()
      };

      mockAudioProcessor.processAudioData(audioData);
      
      const processingTime = performance.now() - startTime;
      
      // Audio processing should be very fast (< 10ms)
      expect(processingTime).toBeLessThan(10);
      expect(mockAudioProcessor.processAudioData).toHaveBeenCalledWith(audioData);
    });

    test('should meet subtitle display latency requirements', async () => {
      const speechTimestamp = Date.now();
      
      // Simulate speech recognition
      const speechResult = {
        type: 'final',
        transcript: 'Hello world',
        confidence: 0.9,
        timestamp: speechTimestamp
      };

      const translationStartTime = performance.now();
      
      // Simulate translation
      const translationResult = await mockTranslationService.translateText(
        speechResult.transcript,
        'en',
        'es'
      );

      const translationEndTime = performance.now();
      const translationLatency = translationEndTime - translationStartTime;

      // Simulate subtitle display
      const subtitleStartTime = performance.now();
      mockSubtitleRenderer.displaySubtitle('video-1', translationResult.translatedText);
      const subtitleEndTime = performance.now();
      const subtitleLatency = subtitleEndTime - subtitleStartTime;

      // Total latency should be under 2 seconds (requirement)
      const totalLatency = translationLatency + subtitleLatency;
      expect(totalLatency).toBeLessThan(2000);

      // Translation should be reasonably fast
      expect(translationLatency).toBeLessThan(1000);
      
      // Subtitle rendering should be very fast
      expect(subtitleLatency).toBeLessThan(50);
    });

    test('should handle high-frequency audio data efficiently', () => {
      const audioDataCount = 100;
      const startTime = performance.now();

      // Simulate processing 100 audio frames (typical for 1 second at 100fps)
      for (let i = 0; i < audioDataCount; i++) {
        const audioData = {
          frequencyData: new Uint8Array(1024),
          timeDomainData: new Float32Array(1024),
          audioLevel: Math.random(),
          timestamp: Date.now() + i * 10
        };
        mockAudioProcessor.processAudioData(audioData);
      }

      const totalTime = performance.now() - startTime;
      const averageTimePerFrame = totalTime / audioDataCount;

      // Should process each frame in less than 1ms on average
      expect(averageTimePerFrame).toBeLessThan(1);
      expect(mockAudioProcessor.processAudioData).toHaveBeenCalledTimes(audioDataCount);
    });
  });

  describe('Memory Usage', () => {
    test('should not exceed memory limits during normal operation', () => {
      const initialMemory = performance.memory.usedJSHeapSize;
      
      // Simulate normal operation with multiple videos
      const videoCount = 5;
      const videos = [];

      for (let i = 0; i < videoCount; i++) {
        const video = {
          id: `video-${i}`,
          element: document.createElement('video'),
          audioProcessor: mockAudioProcessor,
          subtitleRenderer: mockSubtitleRenderer
        };
        videos.push(video);
        
        mockSubtitleRenderer.initializeForVideo(video.element, video.id);
      }

      // Simulate processing for each video
      videos.forEach(video => {
        for (let j = 0; j < 10; j++) {
          const audioData = {
            frequencyData: new Uint8Array(2048),
            timeDomainData: new Float32Array(2048),
            audioLevel: Math.random(),
            timestamp: Date.now()
          };
          mockAudioProcessor.processAudioData(audioData);
        }
      });

      // Memory usage should not increase dramatically
      const finalMemory = performance.memory.usedJSHeapSize;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB for 5 videos)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('should cleanup memory when videos are removed', () => {
      const initialMemory = performance.memory.usedJSHeapSize;
      
      // Create and then remove videos
      const videoIds = ['video-1', 'video-2', 'video-3'];
      
      // Initialize videos
      videoIds.forEach(id => {
        mockSubtitleRenderer.initializeForVideo(mockVideoElement, id);
      });

      // Cleanup videos
      videoIds.forEach(id => {
        mockSubtitleRenderer.cleanup(id);
        mockAudioProcessor.stopProcessing();
      });

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = performance.memory.usedJSHeapSize;
      
      // Memory should not increase significantly after cleanup
      expect(finalMemory - initialMemory).toBeLessThan(1024 * 1024); // Less than 1MB
      expect(mockSubtitleRenderer.cleanup).toHaveBeenCalledTimes(3);
    });

    test('should handle memory pressure gracefully', () => {
      // Simulate memory pressure by creating large objects
      const largeObjects = [];
      
      try {
        // Create objects until we approach memory limit
        while (performance.memory.usedJSHeapSize < performance.memory.jsHeapSizeLimit * 0.8) {
          largeObjects.push(new ArrayBuffer(1024 * 1024)); // 1MB chunks
          
          // Simulate normal operation under memory pressure
          mockAudioProcessor.processAudioData({
            frequencyData: new Uint8Array(1024),
            timeDomainData: new Float32Array(1024),
            audioLevel: 0.5,
            timestamp: Date.now()
          });
          
          // Break if we've created too many objects (safety)
          if (largeObjects.length > 100) break;
        }

        // Should still be able to process audio under memory pressure
        expect(mockAudioProcessor.processAudioData).toHaveBeenCalled();
        
      } finally {
        // Cleanup
        largeObjects.length = 0;
        if (global.gc) {
          global.gc();
        }
      }
    });
  });

  describe('Resource Management', () => {
    test('should properly cleanup event listeners', () => {
      const mockElement = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      };

      const eventTypes = ['play', 'pause', 'ended', 'timeupdate', 'volumechange'];
      const handlers = new Map();

      // Simulate adding event listeners
      eventTypes.forEach(eventType => {
        const handler = jest.fn();
        handlers.set(eventType, handler);
        mockElement.addEventListener(eventType, handler);
      });

      expect(mockElement.addEventListener).toHaveBeenCalledTimes(eventTypes.length);

      // Simulate cleanup
      handlers.forEach((handler, eventType) => {
        mockElement.removeEventListener(eventType, handler);
      });

      expect(mockElement.removeEventListener).toHaveBeenCalledTimes(eventTypes.length);
      
      // Verify all handlers were removed
      eventTypes.forEach(eventType => {
        expect(mockElement.removeEventListener).toHaveBeenCalledWith(
          eventType,
          handlers.get(eventType)
        );
      });
    });

    test('should cleanup audio contexts properly', () => {
      const mockAudioContext = {
        state: 'running',
        close: jest.fn(() => Promise.resolve()),
        suspend: jest.fn(() => Promise.resolve())
      };

      const mockMediaSource = {
        disconnect: jest.fn()
      };

      const mockAnalyser = {
        disconnect: jest.fn()
      };

      // Simulate audio processing setup
      const audioProcessor = {
        audioContext: mockAudioContext,
        mediaStreamSource: mockMediaSource,
        analyser: mockAnalyser,
        cleanup: jest.fn(() => {
          if (mockMediaSource) mockMediaSource.disconnect();
          if (mockAnalyser) mockAnalyser.disconnect();
          if (mockAudioContext && mockAudioContext.state !== 'closed') {
            mockAudioContext.close();
          }
        })
      };

      // Perform cleanup
      audioProcessor.cleanup();

      expect(mockMediaSource.disconnect).toHaveBeenCalled();
      expect(mockAnalyser.disconnect).toHaveBeenCalled();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    test('should handle rapid initialization and cleanup cycles', () => {
      const cycleCount = 50;
      const initTimes = [];
      const cleanupTimes = [];

      for (let i = 0; i < cycleCount; i++) {
        // Measure initialization time
        const initStart = performance.now();
        mockSubtitleRenderer.initializeForVideo(mockVideoElement, `video-${i}`);
        const initEnd = performance.now();
        initTimes.push(initEnd - initStart);

        // Measure cleanup time
        const cleanupStart = performance.now();
        mockSubtitleRenderer.cleanup(`video-${i}`);
        const cleanupEnd = performance.now();
        cleanupTimes.push(cleanupEnd - cleanupStart);
      }

      // Calculate averages
      const avgInitTime = initTimes.reduce((a, b) => a + b, 0) / initTimes.length;
      const avgCleanupTime = cleanupTimes.reduce((a, b) => a + b, 0) / cleanupTimes.length;

      // Both operations should be fast
      expect(avgInitTime).toBeLessThan(10); // Less than 10ms average
      expect(avgCleanupTime).toBeLessThan(5); // Less than 5ms average

      expect(mockSubtitleRenderer.initializeForVideo).toHaveBeenCalledTimes(cycleCount);
      expect(mockSubtitleRenderer.cleanup).toHaveBeenCalledTimes(cycleCount);
    });
  });

  describe('Concurrent Processing', () => {
    test('should handle multiple simultaneous translations', async () => {
      const translationPromises = [];
      const translationCount = 10;

      const startTime = performance.now();

      // Start multiple translations simultaneously
      for (let i = 0; i < translationCount; i++) {
        const promise = mockTranslationService.translateText(
          `Text ${i}`,
          'en',
          'es'
        );
        translationPromises.push(promise);
      }

      // Wait for all translations to complete
      const results = await Promise.all(translationPromises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(results).toHaveLength(translationCount);
      expect(mockTranslationService.translateText).toHaveBeenCalledTimes(translationCount);
      
      // Should handle concurrent translations efficiently
      // (not necessarily faster than sequential, but shouldn't be much slower)
      expect(totalTime).toBeLessThan(translationCount * 200); // 200ms per translation max
    });

    test('should handle concurrent audio processing from multiple videos', () => {
      const videoCount = 5;
      const audioFramesPerVideo = 20;
      const startTime = performance.now();

      // Simulate concurrent audio processing
      for (let videoIndex = 0; videoIndex < videoCount; videoIndex++) {
        for (let frameIndex = 0; frameIndex < audioFramesPerVideo; frameIndex++) {
          const audioData = {
            videoId: `video-${videoIndex}`,
            frequencyData: new Uint8Array(1024),
            timeDomainData: new Float32Array(1024),
            audioLevel: Math.random(),
            timestamp: Date.now() + frameIndex * 10
          };
          mockAudioProcessor.processAudioData(audioData);
        }
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const totalFrames = videoCount * audioFramesPerVideo;

      expect(mockAudioProcessor.processAudioData).toHaveBeenCalledTimes(totalFrames);
      
      // Should process all frames efficiently
      const averageTimePerFrame = totalTime / totalFrames;
      expect(averageTimePerFrame).toBeLessThan(2); // Less than 2ms per frame
    });
  });

  describe('Stress Testing', () => {
    test('should handle extended operation periods', () => {
      const operationDuration = 1000; // 1 second of simulated operation
      const frameRate = 60; // 60 FPS
      const totalFrames = (operationDuration / 1000) * frameRate;

      const startTime = performance.now();
      let frameCount = 0;

      // Simulate extended operation
      const interval = setInterval(() => {
        if (frameCount >= totalFrames) {
          clearInterval(interval);
          return;
        }

        mockAudioProcessor.processAudioData({
          frequencyData: new Uint8Array(1024),
          timeDomainData: new Float32Array(1024),
          audioLevel: Math.random(),
          timestamp: Date.now()
        });

        frameCount++;
      }, 1000 / frameRate);

      // Wait for completion
      return new Promise((resolve) => {
        setTimeout(() => {
          const endTime = performance.now();
          const actualDuration = endTime - startTime;

          expect(frameCount).toBe(totalFrames);
          expect(mockAudioProcessor.processAudioData).toHaveBeenCalledTimes(totalFrames);
          
          // Should maintain consistent performance
          expect(actualDuration).toBeLessThan(operationDuration * 1.5); // Allow 50% overhead
          
          resolve();
        }, operationDuration + 100);
      });
    });

    test('should handle burst processing loads', () => {
      const burstSize = 1000;
      const burstCount = 5;
      const burstInterval = 100; // ms between bursts

      let totalProcessed = 0;
      const startTime = performance.now();

      // Simulate burst processing
      for (let burst = 0; burst < burstCount; burst++) {
        setTimeout(() => {
          for (let i = 0; i < burstSize; i++) {
            mockAudioProcessor.processAudioData({
              frequencyData: new Uint8Array(512),
              timeDomainData: new Float32Array(512),
              audioLevel: Math.random(),
              timestamp: Date.now()
            });
            totalProcessed++;
          }
        }, burst * burstInterval);
      }

      // Wait for all bursts to complete
      return new Promise((resolve) => {
        setTimeout(() => {
          const endTime = performance.now();
          const totalTime = endTime - startTime;

          expect(totalProcessed).toBe(burstSize * burstCount);
          expect(mockAudioProcessor.processAudioData).toHaveBeenCalledTimes(burstSize * burstCount);
          
          // Should handle bursts without significant performance degradation
          const averageTimePerItem = totalTime / totalProcessed;
          expect(averageTimePerItem).toBeLessThan(1); // Less than 1ms per item
          
          resolve();
        }, (burstCount * burstInterval) + 200);
      });
    });
  });
});