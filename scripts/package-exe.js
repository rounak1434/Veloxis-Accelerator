const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createIconFile } = require('./generate-icon');

console.log('======================================================');
console.log('       BUILDING VELOXIS DESKTOP APPLICATION (.EXE)    ');
console.log('======================================================\n');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 1. Generate icon
console.log('[1/5] Generating application brand icon...');
const iconPath = path.join(projectRoot, 'assets', 'icon.ico');
createIconFile(iconPath);
// Also copy to dist
fs.copyFileSync(iconPath, path.join(distDir, 'icon.ico'));
console.log('  ✓ Generated assets/icon.ico');

// 2. Compile Backend Engine with pkg (standalone Node 18 runtime)
console.log('\n[2/5] Compiling standalone backend engine (VeloxisEngine.exe)...');
const serverScript = path.join(projectRoot, 'src', 'server', 'index.js');
const engineTarget = path.join(distDir, 'VeloxisEngine.exe');

try {
  execSync(`npx.cmd pkg "${serverScript}" --targets node18-win-x64 --output "${engineTarget}"`, {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  console.log('  ✓ Standalone VeloxisEngine.exe compiled successfully.');
} catch (err) {
  console.error('Engine compilation failed:', err.message);
  process.exit(1);
}

// 3. Compile Native Windows GUI Desktop & System Tray Application with csc.exe
console.log('\n[3/5] Compiling Native Windows System Tray GUI (Veloxis.exe)...');
const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
const appCs = path.join(projectRoot, 'src', 'desktop', 'VeloxisApp.cs');
const appTarget = path.join(distDir, 'Veloxis.exe');

if (!fs.existsSync(cscPath)) {
  console.error('csc.exe not found at:', cscPath);
  process.exit(1);
}

try {
  execSync(`"${cscPath}" /target:winexe /win32icon:"${iconPath}" /r:System.Windows.Forms.dll /r:System.Drawing.dll /out:"${appTarget}" "${appCs}"`, {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  console.log('  ✓ Native Windows GUI Tray Application compiled successfully.');
} catch (err) {
  console.error('GUI compilation failed:', err.message);
  process.exit(1);
}

// 4. Bundle public assets, bin tools, and assets
console.log('\n[4/5] Bundling application assets into dist/...');
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDirRecursive(path.join(projectRoot, 'public'), path.join(distDir, 'public'));
console.log('  ✓ Public web client assets mirrored.');

copyDirRecursive(path.join(projectRoot, 'bin'), path.join(distDir, 'bin'));
console.log('  ✓ Binary engine utilities (ffmpeg/yt-dlp) mirrored.');

copyDirRecursive(path.join(projectRoot, 'assets'), path.join(distDir, 'assets'));
console.log('  ✓ Brand assets mirrored.');

// 5. Verification
console.log('\n[5/5] Verifying generated executables...');
const appStats = fs.statSync(appTarget);
const engineStats = fs.statSync(engineTarget);

console.log('======================================================');
console.log('       VELOXIS DESKTOP PACKAGING COMPLETE!            ');
console.log('======================================================');
console.log(`GUI App (System Tray) : ${appTarget} (${(appStats.size / 1024).toFixed(1)} KB)`);
console.log(`Engine (Self-Contained): ${engineTarget} (${(engineStats.size / (1024 * 1024)).toFixed(2)} MB)`);
console.log('======================================================\n');
