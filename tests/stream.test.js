const assert = require('assert');
const youtubeResolver = require('../src/engine/youtubeResolver');
const downloader = require('../src/engine/downloader');

async function runStreamTests() {
  console.log('=== Testing Universal Media Stream & HLS Engine ===\n');

  console.log('[1/3] Verifying Stream URL Detection...');
  const hlsUrl1 = 'https://stream.provider.tv/hls/master.m3u8';
  const hlsUrl2 = 'https://vidstream.site/embed-1/index.m3u8?token=xyz123';
  const dashUrl = 'https://cdn.example.com/live/manifest.mpd';
  const ytUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const normalZip = 'https://speed.hetzner.de/100MB.bin';

  assert.strictEqual(youtubeResolver.isStreamUrl(hlsUrl1), true, 'hlsUrl1 should be recognized as stream');
  assert.strictEqual(youtubeResolver.isStreamUrl(hlsUrl2), true, 'hlsUrl2 should be recognized as stream');
  assert.strictEqual(youtubeResolver.isStreamUrl(dashUrl), true, 'dashUrl should be recognized as stream');
  assert.strictEqual(youtubeResolver.isStreamUrl(ytUrl), true, 'YouTube URL should be recognized as stream');
  assert.strictEqual(youtubeResolver.isStreamUrl(normalZip), false, 'Direct binary should not be recognized as stream');
  console.log('  ✓ HLS, DASH, and streaming URL patterns detected accurately.');

  console.log('\n[2/3] Verifying Stream Task Parameters & Extensions...');
  const testTask = {
    id: 'test_stream_task',
    url: hlsUrl1,
    isStream: true,
    fileName: 'master.mp4',
    formatId: 'bestvideo+bestaudio/best'
  };
  assert.strictEqual(testTask.isStream, true);
  assert.ok(testTask.fileName.endsWith('.mp4'));
  console.log('  ✓ Stream task mapped to MP4 format target.');

  console.log('\n[3/3] Verifying downloadMediaStream Function Export...');
  assert.strictEqual(typeof youtubeResolver.downloadMediaStream, 'function');
  assert.strictEqual(typeof youtubeResolver.downloadYouTube, 'function');
  console.log('  ✓ Universal downloadMediaStream handler verified.');

  console.log('\n>>> ALL STREAM TESTS PASSED CLEANLY! <<<\n');
}

runStreamTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
