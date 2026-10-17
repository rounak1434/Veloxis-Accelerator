const fs = require('fs');
const path = require('path');

const LIMITS = {
  app_store: {
    name: 30,
    subtitle: 30,
    promotional_text: 170,
    description: 4000,
    keywords: 100,
    whats_new: 4000
  },
  google_play: {
    title: 30,
    short_description: 80,
    full_description: 4000
  }
};

const SHORT_FIELDS = new Set(['name', 'subtitle', 'title', 'short_description']);
const CLAIMS = /(#\s?1\b|\bnumber one\b|\bno\.? ?1\b|\bbest\b|\btop[- ]rated\b|\b(app|game) of the year\b|\bfree\b|\bdiscount\b|\bsale\b|\b\d+%\s*off\b|\bnew!?$)/i;
const STOP = new Set(['a', 'an', 'and', 'app', 'for', 'the', 'to', 'of', 'with', 'your', 'you', 'in', 'on', '&']);

function length(text) {
  if (!text) return 0;
  // Count unicode characters like a human
  const normalized = (text || '').normalize('NFC');
  let count = 0;
  let prevJoiner = false;
  for (const ch of normalized) {
    const code = ch.codePointAt(0);
    if (ch === '\u200D') {
      prevJoiner = true;
      continue;
    }
    // Combining marks or skin tone modifiers
    if ((code >= 0x0300 && code <= 0x036F) || (code >= 0x1F3FB && code <= 0x1F3FF) || ch === '\uFE0E' || ch === '\uFE0F') {
      continue;
    }
    if (prevJoiner) {
      prevJoiner = false;
      continue;
    }
    count++;
  }
  return count;
}

function hasEmoji(text) {
  if (!text) return false;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code >= 0x1F000 && code <= 0x1FFFF) return true;
    if (code >= 0x2600 && code <= 0x27BF) return true;
  }
  return false;
}

function words(text) {
  if (!text) return [];
  const matches = (text.toLowerCase()).match(/[a-z0-9']+/g) || [];
  return matches.filter(w => !STOP.has(w));
}

function lint(listing, avoidList) {
  const issues = [];
  const avoid = (avoidList || listing.avoid || []).map(a => a.trim()).filter(Boolean);

  function add(level, store, field, msg) {
    issues.push({ level, store, field, message: msg });
  }

  let foundStore = false;
  for (const [store, limits] of Object.entries(LIMITS)) {
    const data = listing[store];
    if (!data) continue;
    foundStore = true;

    for (const [field, limit] of Object.entries(limits)) {
      const value = data[field] || '';
      const n = length(value);

      if (!value) {
        const level = ['name', 'title', 'description', 'full_description'].includes(field) ? 'error' : 'warn';
        add(level, store, field, 'empty');
        continue;
      }

      if (n > limit) {
        add('error', store, field, `${n} characters, limit is ${limit} (${n - limit} over)`);
      }

      for (const name of avoid) {
        const regex = new RegExp(`(?<!\\w)${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?!\\w)`, 'i');
        if (regex.test(value)) {
          add('error', store, field, `mentions '${name}'. Another app's name or trademark in your metadata gets the listing rejected and invites a takedown. Describe what yours does instead.`);
        }
      }

      if (SHORT_FIELDS.has(field)) {
        const m = value.match(CLAIMS);
        if (m) {
          add('warn', store, field, `'${m[0].trim()}' reads as a ranking or price claim. Google Play bans these in the title and short description, and Apple rejects claims you cannot back up.`);
        }
        if (hasEmoji(value)) {
          add('warn', store, field, 'emoji in a short field. Play rejects them in titles; App Store reviewers often do too.');
        }
        const caps = value.match(/\b[A-Z]{4,}\b/g);
        if (caps) {
          add('warn', store, field, `all-caps word(s): ${caps.join(', ')}`);
        }
      }
    }

    if (store === 'app_store' && data.keywords) {
      const kwRaw = data.keywords;
      const parts = kwRaw.split(',').map(k => k.trim().toLowerCase());
      if (/,\s/.test(kwRaw)) {
        add('warn', store, 'keywords', 'spaces after commas waste characters. Use word1,word2,word3');
      }
      const counts = {};
      parts.forEach(k => { if (k) counts[k] = (counts[k] || 0) + 1; });
      const dupes = Object.keys(counts).filter(k => counts[k] > 1);
      if (dupes.length > 0) {
        add('warn', store, 'keywords', `repeated: ${dupes.join(', ')}`);
      }
      const inName = new Set([...words(data.name || ''), ...words(data.subtitle || '')]);
      const wasted = [...new Set(parts.flatMap(k => words(k)).filter(w => inName.has(w)))];
      if (wasted.length > 0) {
        add('warn', store, 'keywords', `already in the name or subtitle, so these characters are wasted: ${wasted.join(', ')}`);
      }
      if (parts.some(k => !k)) {
        add('warn', store, 'keywords', 'empty entry (double comma or trailing comma)');
      }
    }
  }

  if (!foundStore) {
    add('error', '-', '-', 'no app_store or google_play section found');
  }

  return issues;
}

function render(listing, issues) {
  const out = [];
  for (const [store, limits] of Object.entries(LIMITS)) {
    const data = listing[store];
    if (!data) continue;
    out.push(store.replace('_', ' ').toUpperCase());
    for (const [field, limit] of Object.entries(limits)) {
      const n = length(data[field] || '');
      const mark = n > limit ? 'OVER' : (n ? 'ok' : '--');
      out.push(`  ${field.padEnd(18)} ${String(n).padStart(5)} / ${String(limit).padEnd(5)} ${mark}`);
    }
    out.push('');
  }

  if (issues.length === 0) {
    out.push('No issues.');
  }
  for (const i of issues) {
    out.push(`${i.level.toUpperCase().padEnd(5)} ${i.store}.${i.field}: ${i.message}`);
  }
  const errs = issues.filter(i => i.level === 'error').length;
  const warns = issues.length - errs;
  out.push('');
  out.push(`${errs} errors, ${warns} warnings`);
  return out.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/listing.js <path-to-listing.json>');
    process.exit(2);
  }

  const filePath = path.resolve(args[0]);
  let listing;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    listing = JSON.parse(raw);
  } catch (err) {
    console.error(`listing: ${err.message}`);
    process.exit(2);
  }

  const issues = lint(listing);
  console.log(render(listing, issues));
  const hasErrors = issues.some(i => i.level === 'error');
  process.exit(hasErrors ? 1 : 0);
}

main();
