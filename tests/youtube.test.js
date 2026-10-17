const { isYouTubeUrl, getVideoInfo } = require('../src/engine/youtubeResolver');

async function testYouTube() {
  console.log('=== Testing YouTube Video Info & Quality Resolver ===\n');

  const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  console.log('[1/2] Verifying URL pattern detection...');
  if (!isYouTubeUrl(testUrl)) throw new Error('URL regex failed');
  console.log('  ✓ Recognized YouTube URL');

  console.log('[2/2] Fetching video metadata and qualities...');
  const info = await getVideoInfo(testUrl);
  if (!info.title) throw new Error('Missing title');
  if (!info.qualities || info.qualities.length === 0) throw new Error('Missing qualities');

  console.log(`  ✓ Title: "${info.title}"`);
  console.log(`  ✓ Available Qualities: ${info.qualities.length}`);
  info.qualities.forEach(q => console.log(`     - [${q.label}] (${q.formatId})`));

  console.log('\n>>> YOUTUBE RESOLVER TEST PASSED! <<<\n');
}

testYouTube().catch(err => {
  console.error('[FAIL] YouTube test error:', err.message);
  process.exit(1);
});
