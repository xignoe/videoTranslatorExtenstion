/**
 * Debug script to help troubleshoot Video Translator extension
 * Run this in the browser console to check extension status
 */

(function() {
  console.log('🔍 Video Translator Extension Debug Tool');
  console.log('='.repeat(50));
  
  // Check if extension components are loaded
  const components = [
    'VideoDetector',
    'AudioProcessor', 
    'SpeechRecognizer',
    'TranslationService',
    'SubtitleRenderer',
    'VideoTranslator'
  ];
  
  console.log('📦 Checking extension components:');
  components.forEach(component => {
    if (typeof window[component] !== 'undefined') {
      console.log(`✅ ${component} loaded`);
    } else {
      console.log(`❌ ${component} NOT loaded`);
    }
  });
  
  // Check for video elements
  console.log('\n🎥 Checking for video elements:');
  const videos = document.querySelectorAll('video');
  console.log(`Found ${videos.length} video element(s)`);
  
  videos.forEach((video, index) => {
    console.log(`Video ${index + 1}:`);
    console.log(`  - Source: ${video.src || video.currentSrc || 'No source'}`);
    console.log(`  - Playing: ${!video.paused}`);
    console.log(`  - Has audio: ${video.volume > 0 && !video.muted}`);
    console.log(`  - Duration: ${video.duration || 'Unknown'}`);
  });
  
  // Check Web Audio API support
  console.log('\n🔊 Checking Web Audio API:');
  if (window.AudioContext || window.webkitAudioContext) {
    console.log('✅ Web Audio API supported');
  } else {
    console.log('❌ Web Audio API NOT supported');
  }
  
  // Check Speech Recognition API
  console.log('\n🎤 Checking Speech Recognition API:');
  if (window.SpeechRecognition || window.webkitSpeechRecognition) {
    console.log('✅ Speech Recognition API supported');
  } else {
    console.log('❌ Speech Recognition API NOT supported');
  }
  
  // Check permissions
  console.log('\n🔐 Checking permissions:');
  if (navigator.permissions) {
    navigator.permissions.query({name: 'microphone'}).then(result => {
      console.log(`Microphone permission: ${result.state}`);
    });
  }
  
  // Check if extension is active
  console.log('\n⚡ Checking extension status:');
  if (window.videoTranslator) {
    console.log('✅ VideoTranslator instance found');
    console.log('Status:', window.videoTranslator.currentStatus);
    console.log('Settings:', window.videoTranslator.settings);
  } else {
    console.log('❌ VideoTranslator instance NOT found');
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🎯 Debug complete! Check the results above.');
})();