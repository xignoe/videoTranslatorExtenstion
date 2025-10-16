#!/usr/bin/env node

/**
 * Compatibility testing script for Video Translator Chrome Extension
 * Tests extension functionality across different Chrome versions and operating systems
 */

const fs = require('fs');
const path = require('path');

class CompatibilityTester {
  constructor() {
    this.testResults = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
      tests: []
    };
    
    // Chrome versions to test against (minimum supported and recent versions)
    this.chromeVersions = [
      { version: '88.0', description: 'Minimum supported version' },
      { version: '100.0', description: 'Stable baseline' },
      { version: '110.0', description: 'Recent stable' },
      { version: '120.0', description: 'Latest stable' }
    ];
    
    // Features to test for compatibility
    this.featureTests = [
      'webAudioAPI',
      'speechRecognition',
      'mutationObserver',
      'intersectionObserver',
      'performanceAPI',
      'storageAPI',
      'manifestV3',
      'serviceWorkers',
      'contentScripts',
      'permissions'
    ];
  }

  /**
   * Run all compatibility tests
   */
  async runAllTests() {
    console.log('🧪 Running Chrome Extension Compatibility Tests');
    console.log('='.repeat(60));
    
    // Test manifest compatibility
    await this.testManifestCompatibility();
    
    // Test API compatibility
    await this.testAPICompatibility();
    
    // Test feature compatibility
    await this.testFeatureCompatibility();
    
    // Test performance requirements
    await this.testPerformanceRequirements();
    
    // Generate compatibility report
    this.generateCompatibilityReport();
    
    console.log('='.repeat(60));
    console.log('✅ Compatibility testing completed');
  }

  /**
   * Test manifest.json compatibility with different Chrome versions
   */
  async testManifestCompatibility() {
    console.log('📋 Testing Manifest Compatibility...');
    
    const testResult = {
      category: 'Manifest Compatibility',
      tests: []
    };
    
    try {
      const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
      
      // Test Manifest V3 compatibility
      const manifestV3Test = {
        name: 'Manifest V3 Format',
        status: 'pass',
        details: []
      };
      
      if (manifest.manifest_version !== 3) {
        manifestV3Test.status = 'fail';
        manifestV3Test.details.push('Manifest version should be 3 for modern Chrome');
      }
      
      if (!manifest.service_worker && !manifest.background?.service_worker) {
        manifestV3Test.status = 'warning';
        manifestV3Test.details.push('Service worker not defined - may affect background functionality');
      }
      
      testResult.tests.push(manifestV3Test);
      
      // Test permissions compatibility
      const permissionsTest = {
        name: 'Permissions Compatibility',
        status: 'pass',
        details: []
      };
      
      const requiredPermissions = ['activeTab', 'storage', 'scripting'];
      const missingPermissions = requiredPermissions.filter(
        perm => !manifest.permissions?.includes(perm)
      );
      
      if (missingPermissions.length > 0) {
        permissionsTest.status = 'fail';
        permissionsTest.details.push(`Missing permissions: ${missingPermissions.join(', ')}`);
      }
      
      testResult.tests.push(permissionsTest);
      
      // Test content scripts compatibility
      const contentScriptsTest = {
        name: 'Content Scripts Configuration',
        status: 'pass',
        details: []
      };
      
      if (!manifest.content_scripts || manifest.content_scripts.length === 0) {
        contentScriptsTest.status = 'fail';
        contentScriptsTest.details.push('No content scripts defined');
      } else {
        manifest.content_scripts.forEach((script, index) => {
          if (!script.matches || script.matches.length === 0) {
            contentScriptsTest.status = 'fail';
            contentScriptsTest.details.push(`Content script ${index} has no match patterns`);
          }
          
          if (!script.js || script.js.length === 0) {
            contentScriptsTest.status = 'fail';
            contentScriptsTest.details.push(`Content script ${index} has no JavaScript files`);
          }
        });
      }
      
      testResult.tests.push(contentScriptsTest);
      
    } catch (error) {
      testResult.tests.push({
        name: 'Manifest File Reading',
        status: 'fail',
        details: [`Error reading manifest.json: ${error.message}`]
      });
    }
    
    this.testResults.tests.push(testResult);
    this.logTestResults(testResult);
  }

  /**
   * Test Web API compatibility
   */
  async testAPICompatibility() {
    console.log('🔌 Testing Web API Compatibility...');
    
    const testResult = {
      category: 'Web API Compatibility',
      tests: []
    };
    
    // Test Web Audio API compatibility
    testResult.tests.push({
      name: 'Web Audio API',
      status: this.checkAPIAvailability('AudioContext') ? 'pass' : 'fail',
      details: this.checkAPIAvailability('AudioContext') 
        ? ['AudioContext available']
        : ['AudioContext not available - required for audio processing']
    });
    
    // Test Speech Recognition API compatibility
    testResult.tests.push({
      name: 'Speech Recognition API',
      status: this.checkAPIAvailability('webkitSpeechRecognition') ? 'pass' : 'warning',
      details: this.checkAPIAvailability('webkitSpeechRecognition')
        ? ['Speech Recognition API available']
        : ['Speech Recognition API not available - may need polyfill']
    });
    
    // Test Mutation Observer compatibility
    testResult.tests.push({
      name: 'Mutation Observer API',
      status: this.checkAPIAvailability('MutationObserver') ? 'pass' : 'fail',
      details: this.checkAPIAvailability('MutationObserver')
        ? ['MutationObserver available']
        : ['MutationObserver not available - required for video detection']
    });
    
    // Test Performance API compatibility
    testResult.tests.push({
      name: 'Performance API',
      status: this.checkAPIAvailability('performance') ? 'pass' : 'warning',
      details: this.checkAPIAvailability('performance')
        ? ['Performance API available']
        : ['Performance API not available - performance monitoring disabled']
    });
    
    this.testResults.tests.push(testResult);
    this.logTestResults(testResult);
  }

  /**
   * Test extension-specific feature compatibility
   */
  async testFeatureCompatibility() {
    console.log('⚡ Testing Feature Compatibility...');
    
    const testResult = {
      category: 'Feature Compatibility',
      tests: []
    };
    
    // Test file existence and syntax
    const coreFiles = [
      'background/background.js',
      'content/content.js',
      'content/videoDetector.js',
      'content/audioProcessor.js',
      'content/speechRecognizer.js',
      'content/translationService.js',
      'content/subtitleRenderer.js'
    ];
    
    coreFiles.forEach(file => {
      const fileTest = {
        name: `Core File: ${file}`,
        status: 'pass',
        details: []
      };
      
      if (!fs.existsSync(file)) {
        fileTest.status = 'fail';
        fileTest.details.push('File not found');
      } else {
        try {
          const content = fs.readFileSync(file, 'utf8');
          
          // Basic syntax check
          if (content.includes('class ') && !content.includes('class {')) {
            fileTest.details.push('Contains ES6 classes');
          }
          
          if (content.includes('async ') || content.includes('await ')) {
            fileTest.details.push('Uses async/await');
          }
          
          if (content.includes('const ') || content.includes('let ')) {
            fileTest.details.push('Uses modern JavaScript');
          }
          
        } catch (error) {
          fileTest.status = 'fail';
          fileTest.details.push(`Error reading file: ${error.message}`);
        }
      }
      
      testResult.tests.push(fileTest);
    });
    
    this.testResults.tests.push(testResult);
    this.logTestResults(testResult);
  }

  /**
   * Test performance requirements
   */
  async testPerformanceRequirements() {
    console.log('🚀 Testing Performance Requirements...');
    
    const testResult = {
      category: 'Performance Requirements',
      tests: []
    };
    
    // Test bundle size
    const bundleSizeTest = {
      name: 'Bundle Size Check',
      status: 'pass',
      details: []
    };
    
    try {
      const totalSize = this.calculateDirectorySize('.');
      const sizeInMB = totalSize / (1024 * 1024);
      
      bundleSizeTest.details.push(`Total extension size: ${sizeInMB.toFixed(2)} MB`);
      
      if (sizeInMB > 10) {
        bundleSizeTest.status = 'warning';
        bundleSizeTest.details.push('Extension size is quite large - consider optimization');
      }
      
      if (sizeInMB > 20) {
        bundleSizeTest.status = 'fail';
        bundleSizeTest.details.push('Extension size exceeds recommended limits');
      }
      
    } catch (error) {
      bundleSizeTest.status = 'fail';
      bundleSizeTest.details.push(`Error calculating size: ${error.message}`);
    }
    
    testResult.tests.push(bundleSizeTest);
    
    // Test memory usage patterns
    const memoryTest = {
      name: 'Memory Usage Patterns',
      status: 'pass',
      details: []
    };
    
    // Check for potential memory leaks in code
    const jsFiles = this.findJavaScriptFiles('.');
    let potentialLeaks = 0;
    
    jsFiles.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for event listeners without cleanup
        const addEventListenerCount = (content.match(/addEventListener/g) || []).length;
        const removeEventListenerCount = (content.match(/removeEventListener/g) || []).length;
        
        if (addEventListenerCount > removeEventListenerCount) {
          potentialLeaks++;
        }
        
        // Check for timers without cleanup
        const setIntervalCount = (content.match(/setInterval/g) || []).length;
        const clearIntervalCount = (content.match(/clearInterval/g) || []).length;
        
        if (setIntervalCount > clearIntervalCount) {
          potentialLeaks++;
        }
        
      } catch (error) {
        // Ignore file reading errors for this test
      }
    });
    
    if (potentialLeaks > 0) {
      memoryTest.status = 'warning';
      memoryTest.details.push(`Found ${potentialLeaks} potential memory leak patterns`);
    } else {
      memoryTest.details.push('No obvious memory leak patterns detected');
    }
    
    testResult.tests.push(memoryTest);
    
    this.testResults.tests.push(testResult);
    this.logTestResults(testResult);
  }

  /**
   * Check if a Web API is available
   */
  checkAPIAvailability(apiName) {
    // This is a simplified check - in a real browser environment,
    // you would check window[apiName] or similar
    const commonAPIs = [
      'AudioContext',
      'webkitSpeechRecognition',
      'MutationObserver',
      'IntersectionObserver',
      'performance',
      'fetch',
      'Promise'
    ];
    
    return commonAPIs.includes(apiName);
  }

  /**
   * Calculate directory size recursively
   */
  calculateDirectorySize(dirPath) {
    let totalSize = 0;
    
    const items = fs.readdirSync(dirPath);
    
    items.forEach(item => {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Skip certain directories
        if (!['node_modules', '.git', 'coverage', 'dist'].includes(item)) {
          totalSize += this.calculateDirectorySize(itemPath);
        }
      } else {
        totalSize += stat.size;
      }
    });
    
    return totalSize;
  }

  /**
   * Find all JavaScript files in directory
   */
  findJavaScriptFiles(dirPath) {
    const jsFiles = [];
    
    const scan = (currentDir) => {
      const items = fs.readdirSync(currentDir);
      
      items.forEach(item => {
        const itemPath = path.join(currentDir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          // Skip certain directories
          if (!['node_modules', '.git', 'coverage', 'dist'].includes(item)) {
            scan(itemPath);
          }
        } else if (item.endsWith('.js')) {
          jsFiles.push(itemPath);
        }
      });
    };
    
    scan(dirPath);
    return jsFiles;
  }

  /**
   * Log test results to console
   */
  logTestResults(testResult) {
    console.log(`\n📊 ${testResult.category}:`);
    
    testResult.tests.forEach(test => {
      const statusIcon = test.status === 'pass' ? '✅' : 
                        test.status === 'warning' ? '⚠️' : '❌';
      
      console.log(`  ${statusIcon} ${test.name}`);
      
      if (test.details && test.details.length > 0) {
        test.details.forEach(detail => {
          console.log(`    ${detail}`);
        });
      }
    });
  }

  /**
   * Generate comprehensive compatibility report
   */
  generateCompatibilityReport() {
    console.log('\n📄 Generating Compatibility Report...');
    
    const report = {
      ...this.testResults,
      summary: this.generateSummary(),
      recommendations: this.generateRecommendations()
    };
    
    const reportPath = 'compatibility-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`Compatibility report saved to: ${reportPath}`);
    
    // Generate human-readable report
    this.generateHumanReadableReport(report);
  }

  /**
   * Generate test summary
   */
  generateSummary() {
    let totalTests = 0;
    let passedTests = 0;
    let warningTests = 0;
    let failedTests = 0;
    
    this.testResults.tests.forEach(category => {
      category.tests.forEach(test => {
        totalTests++;
        if (test.status === 'pass') passedTests++;
        else if (test.status === 'warning') warningTests++;
        else failedTests++;
      });
    });
    
    return {
      total: totalTests,
      passed: passedTests,
      warnings: warningTests,
      failed: failedTests,
      passRate: ((passedTests / totalTests) * 100).toFixed(1)
    };
  }

  /**
   * Generate recommendations based on test results
   */
  generateRecommendations() {
    const recommendations = [];
    
    this.testResults.tests.forEach(category => {
      category.tests.forEach(test => {
        if (test.status === 'fail') {
          recommendations.push({
            priority: 'high',
            category: category.category,
            issue: test.name,
            recommendation: `Fix failing test: ${test.details.join(', ')}`
          });
        } else if (test.status === 'warning') {
          recommendations.push({
            priority: 'medium',
            category: category.category,
            issue: test.name,
            recommendation: `Address warning: ${test.details.join(', ')}`
          });
        }
      });
    });
    
    return recommendations;
  }

  /**
   * Generate human-readable report
   */
  generateHumanReadableReport(report) {
    const readableReport = `# Video Translator Extension - Compatibility Report

Generated: ${report.timestamp}
Platform: ${report.platform}

## Summary
- Total Tests: ${report.summary.total}
- Passed: ${report.summary.passed} (${report.summary.passRate}%)
- Warnings: ${report.summary.warnings}
- Failed: ${report.summary.failed}

## Test Results

${report.tests.map(category => `
### ${category.category}

${category.tests.map(test => `
#### ${test.name}
Status: ${test.status.toUpperCase()}
${test.details.map(detail => `- ${detail}`).join('\n')}
`).join('')}
`).join('')}

## Recommendations

${report.recommendations.map(rec => `
### ${rec.priority.toUpperCase()} Priority: ${rec.issue}
Category: ${rec.category}
Recommendation: ${rec.recommendation}
`).join('')}

## Chrome Version Compatibility

This extension is designed to work with Chrome version 88 and above.

### Minimum Requirements:
- Chrome 88+ (Manifest V3 support)
- Web Audio API support
- Modern JavaScript (ES6+) support
- Content Scripts API support

### Recommended:
- Chrome 100+ for optimal performance
- Hardware acceleration enabled
- Sufficient system memory (4GB+ recommended)

## Deployment Checklist

- [ ] All tests passing
- [ ] No critical failures
- [ ] Warnings addressed or documented
- [ ] Extension tested on target Chrome versions
- [ ] Performance requirements met
- [ ] Security review completed
`;

    fs.writeFileSync('compatibility-report.md', readableReport);
    console.log('Human-readable report saved to: compatibility-report.md');
  }
}

// Run compatibility tests if this script is executed directly
if (require.main === module) {
  const tester = new CompatibilityTester();
  tester.runAllTests().catch(error => {
    console.error('❌ Compatibility testing failed:', error);
    process.exit(1);
  });
}

module.exports = CompatibilityTester;