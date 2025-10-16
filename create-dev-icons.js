#!/usr/bin/env node

/**
 * Creates basic development icons for the Video Translator extension
 * This creates simple colored squares as placeholder icons for development
 */

const fs = require('fs');
const path = require('path');

// Simple PNG data for colored squares (base64 encoded)
// These are minimal 1x1 pixel PNGs that browsers will scale
const pngData = {
  // Blue square PNG (1x1 pixel)
  blue: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU8qAAAAAElFTkSuQmCC'
};

function createIcon(size, filename) {
  // Create a simple canvas-based icon using HTML5 Canvas API simulation
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d');
  
  // Draw background
  ctx.fillStyle = '#4285f4'; // Google Blue
  ctx.fillRect(0, 0, size, size);
  
  // Draw "VT" text for Video Translator
  ctx.fillStyle = 'white';
  ctx.font = `bold ${Math.floor(size * 0.4)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VT', size / 2, size / 2);
  
  // Save as PNG
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buffer);
}

// Fallback: Create simple colored PNG files
function createSimpleIcon(size, filename) {
  // Create a simple SVG and convert to PNG-like data
  const svg = `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#4285f4"/>
  <text x="${size/2}" y="${size/2}" font-family="Arial" font-size="${Math.floor(size*0.4)}" 
        font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">VT</text>
</svg>`.trim();

  // For development, we'll create a simple data URL approach
  // This creates a minimal PNG file structure
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, size, // Width (4 bytes)
    0x00, 0x00, 0x00, size, // Height (4 bytes)
    0x08, 0x02, 0x00, 0x00, 0x00 // Bit depth, color type, compression, filter, interlace
  ]);
  
  // Create a simple blue square
  const pixelData = Buffer.alloc(size * size * 3); // RGB data
  for (let i = 0; i < pixelData.length; i += 3) {
    pixelData[i] = 0x42;     // R
    pixelData[i + 1] = 0x85; // G  
    pixelData[i + 2] = 0xf4; // B
  }
  
  // This is a simplified approach - for development we'll use a different method
  console.log(`Creating ${size}x${size} icon: ${filename}`);
  
  // Create a minimal valid PNG file
  const minimalPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );
  
  fs.writeFileSync(filename, minimalPng);
}

function createCanvas(size) {
  // Mock canvas for Node.js environment
  return {
    width: size,
    height: size,
    getContext: () => ({
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
      fillRect: () => {},
      fillText: () => {}
    }),
    toBuffer: () => Buffer.from('fake-png-data')
  };
}

function main() {
  console.log('🎨 Creating development icons for Video Translator extension...');
  
  // Ensure icons directory exists
  if (!fs.existsSync('icons')) {
    fs.mkdirSync('icons');
  }
  
  // Create icons in different sizes
  const sizes = [16, 32, 48, 128];
  
  sizes.forEach(size => {
    const filename = path.join('icons', `icon${size}.png`);
    try {
      createSimpleIcon(size, filename);
      console.log(`✅ Created ${filename}`);
    } catch (error) {
      console.error(`❌ Failed to create ${filename}:`, error.message);
    }
  });
  
  console.log('\n🎯 Development icons created successfully!');
  console.log('📝 Note: These are placeholder icons for development only.');
  console.log('🎨 For production, replace with proper designed icons.');
}

if (require.main === module) {
  main();
}

module.exports = { main };