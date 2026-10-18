const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

console.log('=== Building Veloxis Windows Setup Installer ===\n');

const projectRoot = path.resolve(__dirname, '..');
const isccPath = path.join(projectRoot, 'node_modules', 'innosetup-compiler', 'bin', 'ISCC.exe');
const issFile = path.join(projectRoot, 'scripts', 'installer.iss');

if (!fs.existsSync(isccPath)) {
  console.error('ISCC compiler not found at:', isccPath);
  process.exit(1);
}

try {
  execSync(`"${isccPath}" "${issFile}"`, {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  console.log('\n✓ Setup Installer created at: dist\\Veloxis-Accelerator-Setup.exe');
} catch (err) {
  console.error('Setup compilation failed:', err.message);
  process.exit(1);
}
