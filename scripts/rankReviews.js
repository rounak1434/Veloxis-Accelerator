const fs = require('fs');
const path = require('path');

const REVIEWS_FILE = path.join(__dirname, '..', 'replica', 'reviews.csv');
const OUT_FILE = path.join(__dirname, '..', 'replica', 'feedback.md');

const THEMES = [
  {
    id: 'outdated_ui',
    label: 'Outdated 1990s UI & Missing Dark Mode',
    kind: 'complaint',
    patterns: [/windows (98|xp|2002)/i, /outdated/i, /ancient/i, /dated/i, /dark mode/i, /clunky/i, /high dpi/i]
  },
  {
    id: 'popups_nags',
    label: 'Aggressive Popups, Nag Screens & Focus Stealing',
    kind: 'complaint',
    patterns: [/pop.?ups?/i, /fake serial/i, /nag/i, /interrupt/i, /steal.*focus/i, /dialogs/i, /unbearable/i]
  },
  {
    id: 'cross_platform',
    label: 'Trapped on Windows (No Mac or Linux Support)',
    kind: 'request',
    patterns: [/windows.?only/i, /linux/i, /mac/i, /macos/i, /wine/i, /cross.?platform/i]
  },
  {
    id: 'licensing_restrictions',
    label: 'Harsh Single-PC Licensing & Blocked Keys',
    kind: 'complaint',
    patterns: [/license/i, /serial number/i, /blocked/i, /motherboard/i, /renewal/i, /deceitful/i, /hardware lock/i, /twice/i]
  },
  {
    id: 'malware_risk',
    label: 'Malware and Trojan Risks from Cracks',
    kind: 'complaint',
    patterns: [/pirat/i, /crack/i, /trojan/i, /crypto miner/i, /malware/i, /infected/i]
  },
  {
    id: 'automation_cli',
    label: 'Missing Headless Daemon / REST API / CLI',
    kind: 'request',
    patterns: [/cli/i, /api/i, /headless/i, /terminal/i, /script/i]
  }
];

function parseCsv(content) {
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const rows = [];
  const header = lines[0].split(',').map(h => h.trim());

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // CSV parser handling quoted strings
    const match = line.match(/^([^,]+),([^,]+),([^,]*),([^,]*),"(.*)"$/);
    if (match) {
      rows.push({
        source: match[1].trim(),
        url: match[2].trim(),
        date: match[3].trim(),
        rating: match[4].trim() ? parseFloat(match[4].trim()) : null,
        text: match[5].trim()
      });
    }
  }
  return rows;
}

function rankReviews() {
  const raw = fs.readFileSync(REVIEWS_FILE, 'utf8');
  const reviews = parseCsv(raw);

  const themeResults = THEMES.map(theme => {
    const matched = [];
    let totalWeight = 0;
    const sources = new Set();

    for (const rev of reviews) {
      const isMatch = theme.patterns.some(p => p.test(rev.text));
      if (isMatch) {
        matched.push(rev);
        sources.add(rev.source);

        let weight = 0.6;
        if (rev.rating !== null) {
          if (rev.rating === 1) weight = 1.0;
          else if (rev.rating === 2) weight = 0.8;
          else if (rev.rating === 3) weight = 0.5;
          else if (rev.rating === 4) weight = 0.3;
          else if (rev.rating === 5) weight = 0.2;
        }
        totalWeight += weight;
      }
    }

    return {
      ...theme,
      count: matched.length,
      sources: Array.from(sources),
      totalWeight: parseFloat(totalWeight.toFixed(2)),
      reviews: matched
    };
  });

  themeResults.sort((a, b) => b.totalWeight - a.totalWeight);

  let md = `# Feedback Analysis: Target Application Review Audit\n\n`;
  md += `Sample size: ${reviews.length} authentic public reviews analyzed across ${new Set(reviews.map(r => r.source)).size} sources (Trustpilot, Reddit, Hacker News, AlternativeTo, G2).\n\n`;
  md += `## Ranked Theme Breakdown\n\n`;
  md += `| Rank | Theme | Weight | Reviews | Sources | Status |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  themeResults.forEach((t, idx) => {
    const status = t.count >= 3 && t.sources.length >= 2 ? 'Significant' : 'Thin';
    md += `| ${idx + 1} | ${t.label} | ${t.totalWeight} | ${t.count} | ${t.sources.length} | ${status} |\n`;
  });

  md += `\n---\n\n## Theme Details & Verbatim Linked Evidence\n\n`;

  themeResults.forEach((t, idx) => {
    md += `### ${idx + 1}. ${t.label} (${t.kind})\n`;
    md += `* **Weight**: ${t.totalWeight} | **Reviews**: ${t.count} across ${t.sources.join(', ')}\n\n`;
    t.reviews.slice(0, 3).forEach(r => {
      md += `> "${r.text}"\n`;
      md += `> — *[${r.source} review](${r.url}) (${r.date || 'recent'}, Rating: ${r.rating ? r.rating + '/5' : 'N/A'})*\n\n`;
    });
  });

  fs.writeFileSync(OUT_FILE, md, 'utf8');
  console.log(`Ranked ${reviews.length} reviews into ${OUT_FILE}`);
}

rankReviews();
