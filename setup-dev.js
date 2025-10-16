#!/usr/bin/env node

/**
 * Development setup script for Video Translator Chrome Extension
 * Prepares the extension for local testing and development
 */

const fs = require('fs');
const path = require('path');

class DevSetup {
  constructor() {
    this.projectRoot = __dirname;
  }

  /**
   * Run the complete development setup
   */
  async setup() {
    console.log('🔧 Setting up Video Translator Extension for development...');
    console.log('='.repeat(60));

    try {
      this.checkPrerequisites();
      this.validateManifest();
      this.checkRequiredFiles();
      this.setupDevManifest();
      this.createDevInstructions();
      
      console.log('='.repeat(60));
      console.log('✅ Development setup completed successfully!');
      console.log('\n📋 Next steps:');
      console.log('1. Open Chrome and go to chrome://extensions/');
      console.log('2. Enable "Developer mode" (toggle in top-right)');
      console.log('3. Click "Load unpacked" and select this directory');
      console.log('4. Test the extension on YouTube or other video sites');
      console.log('\n📖 See LOCAL_TESTING_GUIDE.md for detailed testing instructions');
      
    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Check if all prerequisites are met
   */
  checkPrerequisites() {
    console.log('🔍 Checking prerequisites...');

    // Check Node.js version
    const nodeVersion = process.version;
    console.log(`  Node.js version: ${nodeVersion}`);

    // Check if we're in the right directory
    if (!fs.existsSync('manifest.json')) {
      throw new Error('manifest.json not found. Please run this script from the extension root directory.');
    }

    // Check if package.json exists
    if (!fs.existsSync('package.json')) {
      console.warn('  ⚠️  package.json not found - some npm commands may not work');
    }

    console.log('  ✅ Prerequisites check passed');
  }

  /**
   * Validate manifest.json
   */
  validateManifest() {
    console.log('📋 Validating manifest.json...');

    try {
      const manifestContent = fs.readFileSync('manifest.json', 'utf8');
      const manifest = JSON.parse(manifestContent);

      // Check required fields
      const requiredFields = ['manifest_version', 'name', 'version', 'permissions'];
      const missingFields = requiredFields.filter(field => !manifest[field]);

      if (missingFields.length > 0) {
        throw new Error(`Missing required manifest fields: ${missingFields.join(', ')}`);
      }

      // Check manifest version
      if (manifest.manifest_version !== 3) {
        console.warn('  ⚠️  Manifest version is not 3 - may not work in modern Chrome');
      }

      // Check permissions
      const recommendedPermissions = ['activeTab', 'storage', 'scripting'];
      const missingPermissions = recommendedPermissions.filter(
        perm => !manifest.permissions?.includes(perm)
      );

      if (missingPermissions.length > 0) {
        console.warn(`  ⚠️  Missing recommended permissions: ${missingPermissions.join(', ')}`);
      }

      console.log('  ✅ Manifest validation passed');
      console.log(`  📦 Extension: ${manifest.name} v${manifest.version}`);

    } catch (error) {
      throw new Error(`Invalid manifest.json: ${error.message}`);
    }
  }

  /**
   * Check if all required files exist
   */
  checkRequiredFiles() {
    console.log('📁 Checking required files...');

    const requiredFiles = [
      'background/background.js',
      'content/content.js',
      'popup/popup.html',
      'popup/popup.js',
      'options/options.html',
      'options/options.js'
    ];

    const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));

    if (missingFiles.length > 0) {
      console.warn('  ⚠️  Missing files (extension may not work fully):');
      missingFiles.forEach(file => console.warn(`    - ${file}`));
    } else {
      console.log('  ✅ All required files present');
    }

    // Check for core content scripts
    const contentScripts = [
      'content/videoDetector.js',
      'content/audioProcessor.js',
      'content/speechRecognizer.js',
      'content/translationService.js',
      'content/subtitleRenderer.js'
    ];

    const missingContentScripts = contentScripts.filter(file => !fs.existsSync(file));

    if (missingContentScripts.length > 0) {
      console.warn('  ⚠️  Missing content scripts:');
      missingContentScripts.forEach(file => console.warn(`    - ${file}`));
    } else {
      console.log('  ✅ All content scripts present');
    }

    // Check for icon files
    this.checkIcons();
  }

  /**
   * Check and create missing icon files
   */
  checkIcons() {
    console.log('🎨 Checking icon files...');

    const iconSizes = [16, 32, 48, 128];
    const missingIcons = iconSizes.filter(size => !fs.existsSync(`icons/icon${size}.png`));

    if (missingIcons.length > 0) {
      console.log('  📝 Creating missing development icons...');
      
      // Ensure icons directory exists
      if (!fs.existsSync('icons')) {
        fs.mkdirSync('icons');
      }

      // Create missing icons
      missingIcons.forEach(size => {
        this.createDevIcon(size);
      });

      console.log('  ✅ Development icons created');
    } else {
      console.log('  ✅ All icon files present');
    }
  }

  /**
   * Create a simple development icon
   */
  createDevIcon(size) {
    const filename = `icons/icon${size}.png`;
    
    // Create a minimal valid PNG file (1x1 blue pixel that browsers will scale)
    const minimalPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    );
    
    fs.writeFileSync(filename, minimalPng);
    console.log(`    Created ${filename}`);
  }

  /**
   * Setup development-specific manifest modifications
   */
  setupDevManifest() {
    console.log('⚙️  Setting up development manifest...');

    try {
      const manifestPath = 'manifest.json';
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      // Add development-specific settings
      let modified = false;

      // Ensure content security policy allows eval for development
      if (!manifest.content_security_policy) {
        manifest.content_security_policy = {
          extension_pages: "script-src 'self'; object-src 'self'"
        };
        modified = true;
      }

      // Add developer-friendly name suffix
      if (!manifest.name.includes('(Dev)')) {
        manifest.name = manifest.name + ' (Dev)';
        modified = true;
      }

      // Ensure all necessary permissions for development
      const devPermissions = ['activeTab', 'storage', 'scripting'];
      devPermissions.forEach(permission => {
        if (!manifest.permissions.includes(permission)) {
          manifest.permissions.push(permission);
          modified = true;
        }
      });

      if (modified) {
        // Create backup of original manifest
        if (!fs.existsSync('manifest.json.backup')) {
          fs.copyFileSync(manifestPath, 'manifest.json.backup');
          console.log('  📄 Created manifest.json.backup');
        }

        // Write modified manifest
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log('  ✅ Development manifest configured');
      } else {
        console.log('  ✅ Manifest already configured for development');
      }

    } catch (error) {
      throw new Error(`Failed to setup development manifest: ${error.message}`);
    }
  }

  /**
   * Create development instructions file
   */
  createDevInstructions() {
    console.log('📝 Creating development instructions...');

    const instructions = `# Video Translator Extension - Development Mode

## Quick Start

1. **Load Extension in Chrome:**
   - Open Chrome and go to \`chrome://extensions/\`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked" and select this directory
   - The extension should appear in your extensions list

2. **Test Basic Functionality:**
   - Click the extension icon in the toolbar
   - Verify the popup opens correctly
   - Go to YouTube and play any video
   - Check browser console (F12) for logs

3. **Debug Issues:**
   - Open DevTools (F12) and check Console tab
   - Go to \`chrome://extensions/\` and click "Inspect views: background page"
   - Look for error messages or warnings

## Development Commands

\`\`\`bash
# Run tests
npm test

# Run specific test file
npm test tests/performance.test.js

# Run compatibility tests
npm run test:compatibility

# Build production version
npm run build
\`\`\`

## Common Development Tasks

### Reload Extension After Changes
1. Go to \`chrome://extensions/\`
2. Find "Video Translator (Dev)"
3. Click the refresh/reload button

### View Extension Logs
- **Content Script Logs**: Open DevTools on any webpage (F12)
- **Background Script Logs**: \`chrome://extensions/\` → "Inspect views: background page"
- **Popup Logs**: Right-click extension icon → "Inspect popup"

### Test Different Scenarios
- **YouTube**: https://youtube.com (any video)
- **Vimeo**: https://vimeo.com
- **News Sites**: Any site with video content
- **Multiple Videos**: Pages with several video elements

## Troubleshooting

### Extension Won't Load
- Check manifest.json syntax
- Verify all file paths exist
- Look at error message in Chrome

### No Video Detection
- Check browser console for errors
- Verify content scripts are injecting
- Test on different video sites

### Audio Issues
- Grant microphone permissions when prompted
- Check if video has audio track
- Test with different videos

## File Structure

\`\`\`
├── manifest.json          # Extension configuration
├── background/            # Background scripts
├── content/              # Content scripts (main functionality)
├── popup/                # Extension popup UI
├── options/              # Options page UI
├── icons/                # Extension icons
└── tests/                # Test files
\`\`\`

## Next Steps

1. Test the extension thoroughly using LOCAL_TESTING_GUIDE.md
2. Make any necessary code changes
3. Run the full test suite: \`npm run test:all\`
4. Build for production: \`npm run build\`

---
Generated by setup-dev.js on ${new Date().toISOString()}
`;

    fs.writeFileSync('DEV_INSTRUCTIONS.md', instructions);
    console.log('  ✅ Created DEV_INSTRUCTIONS.md');
  }

  /**
   * Restore original manifest from backup
   */
  restoreManifest() {
    console.log('🔄 Restoring original manifest...');

    if (fs.existsSync('manifest.json.backup')) {
      fs.copyFileSync('manifest.json.backup', 'manifest.json');
      fs.unlinkSync('manifest.json.backup');
      console.log('  ✅ Original manifest restored');
    } else {
      console.log('  ℹ️  No backup found - manifest unchanged');
    }
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--restore')) {
  const setup = new DevSetup();
  setup.restoreManifest();
} else if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Video Translator Extension - Development Setup

Usage:
  node setup-dev.js          # Setup for development
  node setup-dev.js --restore # Restore original manifest
  node setup-dev.js --help   # Show this help

This script prepares the extension for local development and testing.
`);
} else {
  // Run setup if this script is executed directly
  if (require.main === module) {
    const setup = new DevSetup();
    setup.setup().catch(error => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
  }
}

module.exports = DevSetup;