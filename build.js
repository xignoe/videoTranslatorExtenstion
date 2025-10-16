#!/usr/bin/env node

/**
 * Production build script for Video Translator Chrome Extension
 * Handles minification, optimization, and packaging for deployment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ExtensionBuilder {
  constructor() {
    this.sourceDir = __dirname;
    this.buildDir = path.join(__dirname, 'dist');
    this.version = this.getVersion();
    
    // Files to include in the build
    this.includeFiles = [
      'manifest.json',
      'background/',
      'content/',
      'popup/',
      'options/',
      'icons/',
      'LICENSE',
      'README.md'
    ];
    
    // Files to exclude from the build
    this.excludeFiles = [
      'node_modules/',
      'tests/',
      'coverage/',
      '.git/',
      '.vscode/',
      '.kiro/',
      'build.js',
      'jest.config.js',
      'package.json',
      'package-lock.json',
      'TEST_COVERAGE_REPORT.md'
    ];
  }

  /**
   * Get version from manifest.json
   */
  getVersion() {
    try {
      const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
      return manifest.version;
    } catch (error) {
      console.error('Error reading version from manifest.json:', error);
      return '1.0.0';
    }
  }

  /**
   * Clean and create build directory
   */
  prepareBuildDirectory() {
    console.log('Preparing build directory...');
    
    // Remove existing build directory
    if (fs.existsSync(this.buildDir)) {
      fs.rmSync(this.buildDir, { recursive: true, force: true });
    }
    
    // Create new build directory
    fs.mkdirSync(this.buildDir, { recursive: true });
  }

  /**
   * Copy source files to build directory
   */
  copySourceFiles() {
    console.log('Copying source files...');
    
    this.includeFiles.forEach(file => {
      const sourcePath = path.join(this.sourceDir, file);
      const destPath = path.join(this.buildDir, file);
      
      if (fs.existsSync(sourcePath)) {
        const stat = fs.statSync(sourcePath);
        
        if (stat.isDirectory()) {
          this.copyDirectory(sourcePath, destPath);
        } else {
          this.copyFile(sourcePath, destPath);
        }
      } else {
        console.warn(`Warning: Source file not found: ${file}`);
      }
    });
  }

  /**
   * Copy a directory recursively
   */
  copyDirectory(source, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(source);
    
    files.forEach(file => {
      const sourcePath = path.join(source, file);
      const destPath = path.join(dest, file);
      const stat = fs.statSync(sourcePath);
      
      if (stat.isDirectory()) {
        this.copyDirectory(sourcePath, destPath);
      } else {
        this.copyFile(sourcePath, destPath);
      }
    });
  }

  /**
   * Copy a single file
   */
  copyFile(source, dest) {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.copyFileSync(source, dest);
  }

  /**
   * Minify JavaScript files
   */
  minifyJavaScript() {
    console.log('Minifying JavaScript files...');
    
    const jsFiles = this.findFiles(this.buildDir, '.js');
    
    jsFiles.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const minified = this.minifyJS(content);
        fs.writeFileSync(file, minified);
        
        const originalSize = content.length;
        const minifiedSize = minified.length;
        const savings = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
        
        console.log(`  ${path.relative(this.buildDir, file)}: ${originalSize} → ${minifiedSize} bytes (${savings}% reduction)`);
      } catch (error) {
        console.error(`Error minifying ${file}:`, error.message);
      }
    });
  }

  /**
   * Simple JavaScript minification
   * Note: For production, consider using a proper minifier like Terser
   */
  minifyJS(code) {
    return code
      // Remove single-line comments
      .replace(/\/\/.*$/gm, '')
      // Remove multi-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Remove whitespace around operators
      .replace(/\s*([{}();,=+\-*/<>!&|])\s*/g, '$1')
      // Remove leading/trailing whitespace
      .trim();
  }

  /**
   * Minify CSS files
   */
  minifyCSS() {
    console.log('Minifying CSS files...');
    
    const cssFiles = this.findFiles(this.buildDir, '.css');
    
    cssFiles.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const minified = this.minifyCSSContent(content);
        fs.writeFileSync(file, minified);
        
        const originalSize = content.length;
        const minifiedSize = minified.length;
        const savings = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
        
        console.log(`  ${path.relative(this.buildDir, file)}: ${originalSize} → ${minifiedSize} bytes (${savings}% reduction)`);
      } catch (error) {
        console.error(`Error minifying ${file}:`, error.message);
      }
    });
  }

  /**
   * Simple CSS minification
   */
  minifyCSSContent(css) {
    return css
      // Remove comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Remove whitespace around special characters
      .replace(/\s*([{}:;,>+~])\s*/g, '$1')
      // Remove trailing semicolons before closing braces
      .replace(/;}/g, '}')
      // Remove leading/trailing whitespace
      .trim();
  }

  /**
   * Optimize HTML files
   */
  optimizeHTML() {
    console.log('Optimizing HTML files...');
    
    const htmlFiles = this.findFiles(this.buildDir, '.html');
    
    htmlFiles.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const optimized = this.optimizeHTMLContent(content);
        fs.writeFileSync(file, optimized);
        
        const originalSize = content.length;
        const optimizedSize = optimized.length;
        const savings = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
        
        console.log(`  ${path.relative(this.buildDir, file)}: ${originalSize} → ${optimizedSize} bytes (${savings}% reduction)`);
      } catch (error) {
        console.error(`Error optimizing ${file}:`, error.message);
      }
    });
  }

  /**
   * Simple HTML optimization
   */
  optimizeHTMLContent(html) {
    return html
      // Remove HTML comments (but keep conditional comments)
      .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
      // Remove extra whitespace between tags
      .replace(/>\s+</g, '><')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Remove leading/trailing whitespace
      .trim();
  }

  /**
   * Update manifest.json for production
   */
  updateManifest() {
    console.log('Updating manifest for production...');
    
    const manifestPath = path.join(this.buildDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // Remove development-specific fields
    delete manifest.key;
    delete manifest.update_url;
    
    // Ensure version is set
    manifest.version = this.version;
    
    // Add production-specific optimizations
    if (manifest.content_scripts) {
      manifest.content_scripts.forEach(script => {
        // Ensure run_at is optimized for performance
        if (!script.run_at) {
          script.run_at = 'document_idle';
        }
      });
    }
    
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Generate build report
   */
  generateBuildReport() {
    console.log('Generating build report...');
    
    const report = {
      version: this.version,
      buildDate: new Date().toISOString(),
      files: {},
      totalSize: 0
    };
    
    const allFiles = this.findFiles(this.buildDir, '');
    
    allFiles.forEach(file => {
      const relativePath = path.relative(this.buildDir, file);
      const stat = fs.statSync(file);
      
      report.files[relativePath] = {
        size: stat.size,
        modified: stat.mtime.toISOString()
      };
      
      report.totalSize += stat.size;
    });
    
    const reportPath = path.join(this.buildDir, 'build-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`Build report saved to: ${reportPath}`);
    console.log(`Total build size: ${(report.totalSize / 1024).toFixed(1)} KB`);
  }

  /**
   * Create ZIP package for Chrome Web Store
   */
  createZipPackage() {
    console.log('Creating ZIP package...');
    
    const zipName = `video-translator-extension-v${this.version}.zip`;
    const zipPath = path.join(__dirname, zipName);
    
    try {
      // Remove existing zip
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
      
      // Create zip using system zip command (cross-platform alternative would be better)
      const command = process.platform === 'win32' 
        ? `powershell Compress-Archive -Path "${this.buildDir}\\*" -DestinationPath "${zipPath}"`
        : `cd "${this.buildDir}" && zip -r "${zipPath}" .`;
      
      execSync(command, { stdio: 'inherit' });
      
      const stat = fs.statSync(zipPath);
      console.log(`ZIP package created: ${zipName} (${(stat.size / 1024).toFixed(1)} KB)`);
      
    } catch (error) {
      console.error('Error creating ZIP package:', error.message);
      console.log('You can manually create a ZIP file from the dist/ directory');
    }
  }

  /**
   * Validate the build
   */
  validateBuild() {
    console.log('Validating build...');
    
    const errors = [];
    const warnings = [];
    
    // Check required files
    const requiredFiles = ['manifest.json', 'background/background.js', 'content/content.js'];
    
    requiredFiles.forEach(file => {
      const filePath = path.join(this.buildDir, file);
      if (!fs.existsSync(filePath)) {
        errors.push(`Required file missing: ${file}`);
      }
    });
    
    // Check manifest.json
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(this.buildDir, 'manifest.json'), 'utf8'));
      
      if (!manifest.version) {
        errors.push('Manifest missing version');
      }
      
      if (!manifest.permissions || manifest.permissions.length === 0) {
        warnings.push('Manifest has no permissions defined');
      }
      
    } catch (error) {
      errors.push('Invalid manifest.json: ' + error.message);
    }
    
    // Report validation results
    if (errors.length > 0) {
      console.error('Validation errors:');
      errors.forEach(error => console.error(`  ❌ ${error}`));
      return false;
    }
    
    if (warnings.length > 0) {
      console.warn('Validation warnings:');
      warnings.forEach(warning => console.warn(`  ⚠️  ${warning}`));
    }
    
    console.log('✅ Build validation passed');
    return true;
  }

  /**
   * Find files with specific extension
   */
  findFiles(dir, extension) {
    const files = [];
    
    const scan = (currentDir) => {
      const items = fs.readdirSync(currentDir);
      
      items.forEach(item => {
        const itemPath = path.join(currentDir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          scan(itemPath);
        } else if (extension === '' || item.endsWith(extension)) {
          files.push(itemPath);
        }
      });
    };
    
    scan(dir);
    return files;
  }

  /**
   * Run the complete build process
   */
  async build() {
    console.log(`🚀 Building Video Translator Extension v${this.version}`);
    console.log('='.repeat(50));
    
    try {
      this.prepareBuildDirectory();
      this.copySourceFiles();
      this.minifyJavaScript();
      this.minifyCSS();
      this.optimizeHTML();
      this.updateManifest();
      this.generateBuildReport();
      
      if (this.validateBuild()) {
        this.createZipPackage();
        
        console.log('='.repeat(50));
        console.log('✅ Build completed successfully!');
        console.log(`📦 Build output: ${this.buildDir}`);
        console.log(`🎯 Ready for Chrome Web Store submission`);
      } else {
        console.error('❌ Build validation failed');
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Build failed:', error.message);
      process.exit(1);
    }
  }
}

// Run the build if this script is executed directly
if (require.main === module) {
  const builder = new ExtensionBuilder();
  builder.build();
}

module.exports = ExtensionBuilder;