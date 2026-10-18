const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('======================================================');
console.log('       BUILDING VELOXIS DESKTOP EXECUTABLE (.EXE)     ');
console.log('======================================================\n');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const exeTarget = path.join(distDir, 'Veloxis.exe');

// 1. Run pkg compiler
console.log('[1/4] Compiling desktop application with pkg (node18-win-x64)...');
const launcherScript = path.join(projectRoot, 'src', 'desktop', 'launcher.js');

try {
  execSync(`npx.cmd pkg "${launcherScript}" --targets node18-win-x64 --output "${exeTarget}"`, {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  console.log('  ✓ Standalone binary compilation succeeded.');
} catch (err) {
  console.error('Compilation failed:', err.message);
  process.exit(1);
}

// 2. Mirror public UI directory into dist/public
console.log('\n[2/4] Bundling public dashboard assets into dist/public...');
const publicSrc = path.join(projectRoot, 'public');
const publicDest = path.join(distDir, 'public');
if (!fs.existsSync(publicDest)) fs.mkdirSync(publicDest, { recursive: true });

function copyDirRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDirRecursive(publicSrc, publicDest);
console.log('  ✓ Public web client assets mirrored.');

// 3. Mirror bin dependencies into dist/bin
console.log('\n[3/4] Bundling binary engine utilities into dist/bin...');
const binSrc = path.join(projectRoot, 'bin');
const binDest = path.join(distDir, 'bin');
if (!fs.existsSync(binDest)) fs.mkdirSync(binDest, { recursive: true });

if (fs.existsSync(binSrc)) {
  const bins = fs.readdirSync(binSrc);
  for (const b of bins) {
    const srcFile = path.join(binSrc, b);
    const destFile = path.join(binDest, b);
    if (fs.statSync(srcFile).isFile()) {
      fs.copyFileSync(srcFile, destFile);
      console.log(`  ✓ Copied ${b}`);
    }
  }
}

// 4. Verify output executable
console.log('\n[4/4] Verifying generated executable...');
if (!fs.existsSync(exeTarget)) {
  console.error(`Executable not found at ${exeTarget}`);
  process.exit(1);
}

const stats = fs.statSync(exeTarget);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

console.log('======================================================');
console.log('       VELOXIS DESKTOP EXECUTABLE GENERATED!          ');
console.log('======================================================');
console.log(`Executable Location: ${exeTarget}`);
console.log(`Binary File Size:    ${sizeMb} MB`);
console.log('======================================================\n');
