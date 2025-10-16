// Jest setup file for video translator extension tests

// Mock TextEncoder/TextDecoder for JSDOM compatibility
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock Chrome extension APIs
global.chrome = {
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn()
    },
    local: {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn()
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    getURL: jest.fn(path => `chrome-extension://test-id/${path}`),
    id: 'test-extension-id'
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  action: {
    setIcon: jest.fn(),
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn()
  }
};

// Mock Web APIs for audio processing
global.AudioContext = jest.fn(() => ({
  state: 'running',
  sampleRate: 44100,
  createMediaElementSource: jest.fn(),
  createAnalyser: jest.fn(),
  createGain: jest.fn(),
  createScriptProcessor: jest.fn(),
  resume: jest.fn(() => Promise.resolve()),
  close: jest.fn(() => Promise.resolve())
}));

global.webkitAudioContext = global.AudioContext;

// Mock Speech Recognition API
global.SpeechRecognition = jest.fn(() => ({
  continuous: true,
  interimResults: true,
  lang: 'en-US',
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
}));

global.webkitSpeechRecognition = global.SpeechRecognition;

// Mock MediaStream API
global.MediaStream = jest.fn(() => ({
  getTracks: jest.fn(() => []),
  getAudioTracks: jest.fn(() => []),
  getVideoTracks: jest.fn(() => [])
}));

// Mock MutationObserver
global.MutationObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  takeRecords: jest.fn(() => [])
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// Mock requestAnimationFrame and related timing functions
global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 16));
global.cancelAnimationFrame = jest.fn(id => clearTimeout(id));

// Mock performance API
global.performance = {
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn(),
  getEntriesByName: jest.fn(() => []),
  getEntriesByType: jest.fn(() => [])
};

// Mock URL API
global.URL = {
  createObjectURL: jest.fn(() => 'blob:mock-url'),
  revokeObjectURL: jest.fn()
};

// Mock Blob API
global.Blob = jest.fn((content, options) => ({
  size: content ? content.length : 0,
  type: options?.type || '',
  slice: jest.fn(),
  stream: jest.fn(),
  text: jest.fn(() => Promise.resolve(content?.join('') || '')),
  arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(0)))
}));

// Mock fetch API for translation services
global.fetch = jest.fn(() => 
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ translatedText: 'Mock translation' }),
    text: () => Promise.resolve('Mock response'),
    headers: new Map()
  })
);

// Mock localStorage and sessionStorage
const mockStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn()
};

global.localStorage = mockStorage;
global.sessionStorage = mockStorage;

// Mock ResizeObserver
global.ResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));

// Setup test environment cleanup
afterEach(() => {
  // Clear all mocks after each test
  jest.clearAllMocks();
  
  // Reset DOM if needed
  if (global.document && global.document.body) {
    global.document.body.innerHTML = '';
  }
});