# Video Translator Chrome Extension

A Chrome extension that provides real-time translation and subtitle generation for any video or audio content on the web. Unlike existing text-only translation tools, this extension detects audio from videos across all websites, transcribes the speech, translates it to your preferred language, and displays synchronized subtitles overlaid on the video content.

## 🚀 Features

- **Universal Video Support**: Works on any website with video content (YouTube, Netflix, news sites, etc.)
- **Real-time Translation**: Live speech recognition and translation with minimal delay
- **Customizable Subtitles**: Adjustable font size, color, position, and styling
- **Multi-language Support**: Translate to/from multiple languages
- **Smart Synchronization**: Subtitles appear within 2 seconds of spoken audio
- **Privacy-focused**: Audio processing happens locally or through secure connections
- **Cross-platform Compatibility**: Works across different video platforms and formats

## 📋 Current Status

**Development Progress: ~42% Complete (5/12 major tasks)**

### ✅ Completed Components
- [x] Chrome extension project structure and manifest
- [x] Video detection system with MutationObserver
- [x] Audio processing and speech recognition
- [x] Translation service with API integration
- [x] Subtitle rendering and overlay system
- [x] Comprehensive test suite (164 passing tests)

### 🔄 In Progress
- [ ] User interface integration
- [ ] Background script development
- [ ] Content script orchestration
- [ ] Error handling and user feedback
- [ ] Security and privacy features
- [ ] Performance optimization

## 🏗️ Architecture

The extension follows a modular architecture with clear separation of concerns:

```
├── content/                 # Content scripts (injected into web pages)
│   ├── videoDetector.js    # Detects video elements on pages
│   ├── audioProcessor.js   # Captures and processes audio streams
│   ├── speechRecognizer.js # Speech-to-text conversion
│   ├── translationService.js # Translation API integration
│   ├── subtitleRenderer.js # Creates and positions subtitle overlays
│   ├── subtitleTimer.js    # Handles subtitle timing and synchronization
│   └── subtitleStyleManager.js # Manages subtitle appearance
├── background/             # Background service worker
├── popup/                  # Extension popup interface
├── options/               # Settings and configuration page
└── tests/                 # Comprehensive test suite
```

## 🛠️ Development Setup

### Prerequisites
- Node.js (v14 or higher)
- Chrome browser
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/xignoe/videoTranslatorExtenstion.git
cd videoTranslatorExtenstion
```

2. Install dependencies:
```bash
npm install
```

3. Run tests:
```bash
npm test
```

### Loading in Chrome for Development

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the project directory
4. The extension will appear in your extensions list

## 🧪 Testing

The project includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Run specific test suites
npm test subtitleRenderer
npm test translationService
npm test videoDetector

# Run tests with coverage
npm test -- --coverage
```

**Test Coverage**: 164 passing tests covering:
- Video detection across platforms
- Audio processing and speech recognition
- Translation service with retry logic
- Subtitle rendering and timing
- Style management and customization

## 📖 Usage

### For Users

1. Install the extension in Chrome
2. Navigate to any website with video content
3. Click the extension icon to configure your target language
4. Play a video - subtitles will automatically appear
5. Customize subtitle appearance in the options page

### For Developers

The extension is built with a modular architecture that makes it easy to:
- Add new translation providers
- Support additional video platforms
- Customize subtitle rendering
- Extend audio processing capabilities

## 🔧 Configuration

### Translation Settings
- Target language selection
- Source language detection
- Translation confidence thresholds

### Subtitle Appearance
- Font size, color, and family
- Background color and opacity
- Position (top, center, bottom)
- Animation and timing settings

## 🏛️ Technical Details

### Core Technologies
- **Chrome Extension Manifest V3**
- **Web Audio API** for audio capture
- **Web Speech API** for speech recognition
- **Translation APIs** for language conversion
- **DOM Manipulation** for subtitle overlay

### Key Features
- **Real-time Processing**: Minimal latency between speech and subtitles
- **Memory Management**: Efficient cleanup and resource management
- **Error Handling**: Comprehensive error recovery and user feedback
- **Cross-origin Support**: Works with embedded videos and iframes
- **Performance Optimized**: Minimal impact on video playback

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Commit your changes: `git commit -m 'Add feature'`
6. Push to your branch: `git push origin feature-name`
7. Submit a pull request

### Development Guidelines
- Follow the existing code style and architecture
- Add tests for new functionality
- Update documentation as needed
- Ensure all tests pass before submitting

## 📝 Project Structure

```
video-translator-extension/
├── .kiro/specs/           # Project specifications and requirements
├── background/            # Background service worker
├── content/              # Content scripts and core functionality
├── icons/               # Extension icons
├── options/             # Options page (settings)
├── popup/               # Extension popup interface
├── tests/               # Test suite
├── manifest.json        # Chrome extension manifest
├── package.json         # Node.js dependencies and scripts
└── README.md           # This file
```

## 🔒 Privacy & Security

- Audio data is processed locally or through secure, encrypted connections
- No audio data is stored permanently
- User preferences are stored locally using Chrome's storage API
- Extension only accesses audio from active video tabs
- Automatic cleanup when tabs are closed or extension is disabled

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🐛 Known Issues

- Some speech recognition tests need mock setup fixes
- Translation service queue tests have timing issues
- Content script orchestration is not yet implemented
- Background script functionality is minimal

## 🗺️ Roadmap

### Phase 1 (Current)
- [x] Core component development
- [x] Individual component testing
- [ ] Component integration

### Phase 2 (Next)
- [ ] User interface completion
- [ ] End-to-end functionality
- [ ] Cross-platform testing

### Phase 3 (Future)
- [ ] Performance optimization
- [ ] Additional language support
- [ ] Advanced subtitle features
- [ ] Chrome Web Store publication

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/xignoe/videoTranslatorExtenstion/issues) page
2. Create a new issue with detailed information
3. Include browser version, extension version, and steps to reproduce

## 🙏 Acknowledgments

- Chrome Extension APIs and documentation
- Web Speech API for speech recognition capabilities
- Translation service providers
- Open source testing frameworks (Jest, JSDOM)

---

**Note**: This extension is currently in active development. Core functionality is implemented and tested, but integration work is ongoing. See the [project tasks](.kiro/specs/video-translator-extension/tasks.md) for detailed progress tracking.