# Video Translator Extension - Local Testing Guide

## Prerequisites

Before testing locally, ensure you have:
- Chrome browser (version 88 or higher)
- Node.js installed (for running tests)
- A microphone (for audio capture testing)

## Step 1: Load Extension in Chrome Developer Mode

### 1.1 Enable Developer Mode
1. Open Chrome and navigate to `chrome://extensions/`
2. Toggle "Developer mode" ON (top-right corner)
3. You should see additional buttons appear: "Load unpacked", "Pack extension", "Update"

### 1.2 Load the Extension
1. Click "Load unpacked"
2. Navigate to your project directory and select the root folder (where `manifest.json` is located)
3. The extension should appear in your extensions list
4. Note the extension ID (you'll need this for debugging)

### 1.3 Verify Installation
- Check that the extension icon appears in the Chrome toolbar
- Click the extension icon to open the popup
- Verify the popup loads without errors

## Step 2: Test Basic Functionality

### 2.1 Test Extension Popup
1. Click the Video Translator extension icon
2. Verify the popup opens and displays:
   - Language selection dropdowns
   - Enable/disable toggle
   - Settings button
3. Try changing language settings and verify they persist

### 2.2 Test Options Page
1. Right-click the extension icon → "Options"
2. Or go to `chrome://extensions/` → Click "Details" → "Extension options"
3. Verify the options page loads with:
   - Language preferences
   - Subtitle styling options
   - Privacy settings

## Step 3: Test Video Detection and Translation

### 3.1 Test on YouTube
1. Go to any YouTube video
2. Enable the extension via the popup
3. Play the video
4. Check the browser console (F12) for:
   - "Video detected" messages
   - "Audio processing started" messages
   - Any error messages

### 3.2 Test on Other Platforms
Try these test sites:
- **Vimeo**: https://vimeo.com/
- **HTML5 video sites**: Any news site with video content
- **Embedded videos**: Sites with iframe-embedded videos

### 3.3 Expected Behavior
- Extension should detect video elements automatically
- Status indicator should appear near videos
- Subtitles should overlay on videos when speech is detected

## Step 4: Debug Common Issues

### 4.1 Check Browser Console
1. Open Developer Tools (F12)
2. Go to Console tab
3. Look for:
   - Extension loading messages
   - Video detection logs
   - Error messages (red text)

### 4.2 Check Extension Console
1. Go to `chrome://extensions/`
2. Find Video Translator extension
3. Click "Details" → "Inspect views: background page"
4. This opens the background script console

### 4.3 Common Issues and Solutions

#### Issue: Extension not loading
**Solution:**
- Check `manifest.json` syntax
- Verify all file paths in manifest exist
- Check browser console for errors

#### Issue: No video detection
**Solution:**
- Ensure you're on a page with HTML5 video elements
- Check if the video is playing
- Verify content script injection in DevTools → Sources tab

#### Issue: No audio processing
**Solution:**
- Grant microphone permissions when prompted
- Check if video has audio track
- Verify Web Audio API support

#### Issue: No translations appearing
**Solution:**
- Check internet connection
- Verify translation service is responding
- Check if speech recognition is working

## Step 5: Test with Different Content Types

### 5.1 Test Different Languages
1. Find videos in different languages:
   - Spanish: Search "noticias en español"
   - French: Search "actualités françaises"
   - German: Search "deutsche nachrichten"
2. Set target language to English
3. Verify translations appear

### 5.2 Test Different Video Types
- **Short videos** (< 1 minute)
- **Long videos** (> 10 minutes)
- **Live streams**
- **Videos with background music**
- **Videos with multiple speakers**

## Step 6: Performance Testing

### 6.1 Monitor Resource Usage
1. Open Chrome Task Manager (Shift+Esc)
2. Look for extension processes
3. Monitor CPU and memory usage while videos play

### 6.2 Test Multiple Videos
1. Open multiple tabs with videos
2. Enable extension on all tabs
3. Verify performance remains acceptable

## Step 7: Test Privacy and Security Features

### 7.1 Test Privacy Controls
1. Go to extension options
2. Disable audio processing
3. Verify no audio is captured
4. Re-enable and test normal functionality

### 7.2 Test Cross-Origin Handling
1. Try videos from different domains
2. Verify CORS restrictions are handled gracefully
3. Check for appropriate error messages

## Step 8: Automated Testing

### 8.1 Run Unit Tests
```bash
npm test
```

### 8.2 Run Performance Tests
```bash
npm test tests/performance.test.js
```

### 8.3 Run Compatibility Tests
```bash
npm run test:compatibility
```

## Step 9: Test Extension Updates

### 9.1 Test Hot Reload
1. Make a small change to any file
2. Go to `chrome://extensions/`
3. Click the refresh button for your extension
4. Verify changes take effect

### 9.2 Test Settings Persistence
1. Change extension settings
2. Reload the extension
3. Verify settings are preserved

## Step 10: Test Edge Cases

### 10.1 Test Error Scenarios
- **No internet connection**: Disable network and test
- **Blocked microphone**: Deny microphone permissions
- **Unsupported video format**: Try videos that might not work
- **Very quiet audio**: Test with low-volume videos

### 10.2 Test Browser Scenarios
- **Incognito mode**: Test extension in private browsing
- **Multiple windows**: Test with multiple Chrome windows
- **Tab switching**: Switch between tabs with videos

## Debugging Tools and Tips

### Chrome DevTools Extensions Panel
1. Open DevTools (F12)
2. Look for "Extensions" tab (if available)
3. Use for debugging extension-specific issues

### Console Logging
The extension includes comprehensive logging. Look for:
```
[VideoTranslator] Video detected: youtube
[AudioProcessor] Audio processing started
[SpeechRecognizer] Speech recognized: "hello world"
[TranslationService] Translation completed
[SubtitleRenderer] Subtitle displayed
```

### Network Tab
1. Open DevTools → Network tab
2. Look for translation API requests
3. Verify requests are successful (200 status)

### Performance Tab
1. Open DevTools → Performance tab
2. Record while using extension
3. Look for performance bottlenecks

## Test Checklist

### Basic Functionality ✓
- [ ] Extension loads without errors
- [ ] Popup opens and functions correctly
- [ ] Options page accessible and functional
- [ ] Settings persist across browser sessions

### Video Detection ✓
- [ ] Detects YouTube videos
- [ ] Detects Vimeo videos
- [ ] Detects generic HTML5 videos
- [ ] Handles multiple videos on same page

### Audio Processing ✓
- [ ] Captures audio from videos
- [ ] Processes speech recognition
- [ ] Handles different audio qualities
- [ ] Respects privacy settings

### Translation ✓
- [ ] Translates speech to target language
- [ ] Handles different source languages
- [ ] Shows appropriate error messages
- [ ] Caches translations efficiently

### Subtitle Display ✓
- [ ] Overlays subtitles on videos
- [ ] Positions subtitles correctly
- [ ] Applies custom styling
- [ ] Handles fullscreen mode

### Performance ✓
- [ ] Minimal impact on video playback
- [ ] Reasonable CPU usage
- [ ] Proper memory management
- [ ] No memory leaks detected

### Error Handling ✓
- [ ] Graceful degradation when APIs unavailable
- [ ] Clear error messages for users
- [ ] Proper cleanup on errors
- [ ] Recovery from temporary failures

## Troubleshooting Common Problems

### Problem: "Extension could not be loaded"
**Cause**: Manifest.json syntax error or missing files
**Solution**: 
1. Validate manifest.json syntax
2. Check all file paths exist
3. Look at specific error message in Chrome

### Problem: "This site can't be reached" for translation
**Cause**: Network issues or API endpoint problems
**Solution**:
1. Check internet connection
2. Verify translation service is accessible
3. Check for CORS issues in console

### Problem: No subtitles appearing
**Cause**: Multiple possible issues
**Solution**:
1. Check if video has audio
2. Verify microphone permissions granted
3. Check speech recognition is working
4. Verify translation service responds

### Problem: High CPU usage
**Cause**: Inefficient audio processing
**Solution**:
1. Check performance monitor output
2. Reduce audio processing frequency
3. Disable extension on unused tabs

## Getting Help

If you encounter issues:

1. **Check the console** for error messages
2. **Review the logs** for debugging information
3. **Test with different videos** to isolate the problem
4. **Try disabling other extensions** to avoid conflicts
5. **Test in incognito mode** to rule out cache issues

## Next Steps

Once local testing is complete:
1. Run the full test suite: `npm run test:all`
2. Build production version: `npm run build`
3. Test the production build
4. Prepare for Chrome Web Store submission

---

**Happy Testing!** 🚀

The extension should work seamlessly once properly loaded. Most issues are related to permissions or network connectivity, which are easily resolved by following this guide.