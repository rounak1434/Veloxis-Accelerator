const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'replica', 'downloads', 'data'
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'db.json'
]);

const configPath = path.join(__dirname, '..', 'replica', 'brand.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const avoidNames = config.avoid || [];
const avoidDomains = config.domains || [];
const avoidColors = (config.colors || []).map(c => c.toLowerCase());

const patterns = [];
for (const name of avoidNames) {
  // Case-insensitive regex matching boundary or identifiers
  patterns.push({
    type: 'name',
    label: name,
    regex: new RegExp(name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
  });
}
for (const domain of avoidDomains) {
  patterns.push({
    type: 'domain',
    label: domain,
    regex: new RegExp(domain.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
  });
}

let hits = [];

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (SKIP_DIRS.has(file)) continue;
    const fullPath = path.join(dir, file);
    const relPath = path.relative(path.join(__dirname, '..'), fullPath);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Check folder name
      for (const p of patterns) {
        if (p.regex.test(file)) {
          hits.push({ file: relPath, line: 0, match: p.label, text: 'Directory name matches' });
        }
      }
      scanDir(fullPath);
    } else {
      // Check file name
      for (const p of patterns) {
        if (p.regex.test(file)) {
          hits.push({ file: relPath, line: 0, match: p.label, text: 'File name matches' });
        }
      }

      // Check file contents (text files only)
      if (/\.(js|html|css|json|md|sql|ts)$/i.test(file)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const p of patterns) {
            if (p.regex.test(line)) {
              hits.push({
                file: relPath,
                line: i + 1,
                match: p.label,
                text: line.trim()
              });
            }
          }
          for (const c of avoidColors) {
            if (line.toLowerCase().includes(c)) {
              hits.push({
                file: relPath,
                line: i + 1,
                match: c,
                text: line.trim()
              });
            }
          }
        }
      }
    }
  }
}

console.log('=== Running Rebrand Sweep ===');
scanDir(path.join(__dirname, '..'));

if (hits.length === 0) {
  console.log('CLEAN: No references to original brand, domains, or colors found outside replica/.');
  process.exit(0);
} else {
  console.log(`FOUND ${hits.length} BRAND LEFTOVERS:`);
  for (const h of hits) {
    console.log(`  [!] ${h.file}:${h.line} -> matches "${h.match}"`);
    console.log(`      ${h.text.substring(0, 100)}`);
  }
  process.exit(1);
}
