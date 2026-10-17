const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Building Veloxis Production Distribution ===\n');

// 1. Verify Node syntax of all src files
const srcFiles = [
  'src/engine/downloader.js',
  'src/engine/storage.js',
  'src/engine/queueManager.js',
  'src/server/index.js'
];

console.log('[1/4] Verifying engine and server modules...');
for (const file of srcFiles) {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing required source file: ${file}`);
    process.exit(1);
  }
  try {
    // Check syntax with node -c
    execSync(`node -c "${fullPath}"`);
    console.log(`  ✓ ${file} syntax valid`);
  } catch (err) {
    console.error(`Syntax error in ${file}: ${err.message}`);
    process.exit(1);
  }
}

// 2. Verify static web UI assets
console.log('\n[2/4] Verifying public client dashboard & landing assets...');
const publicFiles = [
  'public/index.html',
  'public/landing.html',
  'public/styles.css',
  'public/app.js'
];

for (const file of publicFiles) {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing required client file: ${file}`);
    process.exit(1);
  }
  const stats = fs.statSync(fullPath);
  console.log(`  ✓ ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
}

// 3. Verify Browser Extension Manifest V3 integrity
console.log('\n[3/4] Verifying WebExtension bundle...');
const extensionFiles = [
  'extension/manifest.json',
  'extension/background.js',
  'extension/content.js',
  'extension/popup.html',
  'extension/popup.js'
];

for (const file of extensionFiles) {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing required extension file: ${file}`);
    process.exit(1);
  }
}

const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) {
  console.error('Extension manifest must be version 3');
  process.exit(1);
}
console.log(`  ✓ WebExtension Manifest V3 valid: ${manifest.name} v${manifest.version}`);

// 4. Create dist directory metadata
console.log('\n[4/4] Generating release package manifest in dist/ ...');
const distDir = path.resolve('dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const releaseInfo = {
  app: 'Veloxis Download Accelerator',
  version: '1.0.0',
  buildTimestamp: new Date().toISOString(),
  targetPlatforms: ['win32-x64', 'darwin-arm64', 'darwin-x64', 'linux-x64'],
  daemonPort: 6789,
  clientEntry: 'public/index.html',
  landingEntry: 'public/landing.html',
  extensionManifest: 'extension/manifest.json'
};

fs.writeFileSync(path.join(distDir, 'release.json'), JSON.stringify(releaseInfo, null, 2), 'utf8');
console.log(`  ✓ Release metadata written to dist/release.json`);

console.log('\n======================================================');
console.log('   PRODUCTION BUILD COMPLETED SUCCESSFULLY (EXIT 0)   ');
console.log('======================================================\n');
