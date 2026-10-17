const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const downloader = require('../src/engine/downloader');
const storage = require('../src/engine/storage');

const TEST_PORT = 9876;
const TEST_FILE_SIZE = 512 * 1024; // 512 KB
const TEST_DATA = crypto.randomBytes(TEST_FILE_SIZE);
const EXPECTED_HASH = crypto.createHash('sha256').update(TEST_DATA).digest('hex');

// Spin up test HTTP server with Range request support
const testServer = http.createServer((req, res) => {
  const rangeHeader = req.headers['range'];

  if (req.method === 'HEAD') {
    res.writeHead(200, {
      'Content-Length': TEST_FILE_SIZE,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': 'attachment; filename="benchmark.dat"',
      'Content-Type': 'application/octet-stream'
    });
    return res.end();
  }

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : TEST_FILE_SIZE - 1;

    const chunk = TEST_DATA.subarray(start, end + 1);
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${TEST_FILE_SIZE}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunk.length,
      'Content-Type': 'application/octet-stream'
    });
    res.end(chunk);
  } else {
    res.writeHead(200, {
      'Content-Length': TEST_FILE_SIZE,
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream'
    });
    res.end(TEST_DATA);
  }
});

async function runTests() {
  console.log('=== Nexus Download Accelerator Test Suite ===');

  await new Promise(r => testServer.listen(TEST_PORT, r));
  console.log(`[PASS] Test HTTP server started on port ${TEST_PORT}`);

  const testUrl = `http://localhost:${TEST_PORT}/benchmark.dat`;

  // Test 1: Probe URL
  console.log('[RUN] Test 1: URL Probe & Header Extraction');
  const probeInfo = await downloader.probe(testUrl);
  if (probeInfo.filename !== 'benchmark.dat') throw new Error(`Wrong filename: ${probeInfo.filename}`);
  if (probeInfo.fileSize !== TEST_FILE_SIZE) throw new Error(`Wrong size: ${probeInfo.fileSize}`);
  if (!probeInfo.resumable) throw new Error('Should be resumable');
  console.log('[PASS] Probe successful: File size, range support, and filename verified.');

  // Test 2: Dynamic Segmentation
  console.log('[RUN] Test 2: Dynamic Multipart Segmentation');
  const mockTask = {
    id: 'test_task_1',
    resumable: true,
    fileSize: TEST_FILE_SIZE
  };
  const segments = downloader.initializeSegments(mockTask, 4);
  if (segments.length !== 4) throw new Error(`Expected 4 segments, got ${segments.length}`);
  if (segments[0].startByte !== 0) throw new Error('Segment 0 should start at 0');
  if (segments[3].endByte !== TEST_FILE_SIZE - 1) throw new Error('Segment 3 should end at fileSize-1');
  console.log('[PASS] 4 segments initialized with correct byte boundaries.');

  // Test 3: Download & Multi-Segment Reassembly
  console.log('[RUN] Test 3: Concurrent Range Downloading & Checksum Verification');
  const testOutputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(testOutputDir)) fs.mkdirSync(testOutputDir, { recursive: true });

  const downloadTask = {
    id: 'test_exec_task',
    url: testUrl,
    originalUrl: testUrl,
    fileName: 'downloaded_benchmark.dat',
    fileSize: TEST_FILE_SIZE,
    downloadedBytes: 0,
    saveDir: testOutputDir,
    categoryId: 'cat-comp',
    queueId: 'queue-main',
    resumable: true,
    status: 'queued',
    segments: []
  };

  await downloader.startTask(downloadTask);

  if (downloadTask.status !== 'completed') {
    throw new Error(`Task status should be completed, got ${downloadTask.status}`);
  }

  const downloadedData = fs.readFileSync(downloadTask.savePath);
  const resultHash = crypto.createHash('sha256').update(downloadedData).digest('hex');

  if (resultHash !== EXPECTED_HASH) {
    throw new Error(`Hash mismatch! Expected ${EXPECTED_HASH}, got ${resultHash}`);
  }
  console.log(`[PASS] File downloaded, reassembled, and verified byte-for-byte! SHA256: ${resultHash}`);

  // Test 4: Storage operations
  console.log('[RUN] Test 4: Storage persistence');
  storage.upsertTask(downloadTask);
  const retrieved = storage.getTask('test_exec_task');
  if (!retrieved || retrieved.fileName !== 'downloaded_benchmark.dat') {
    throw new Error('Storage task retrieval failed');
  }
  console.log('[PASS] Storage read/write verified.');

  // Clean up
  testServer.close();
  try {
    fs.unlinkSync(downloadTask.savePath);
    fs.rmdirSync(testOutputDir);
  } catch (_) {}

  console.log('\n>>> ALL 4 TEST SUITES PASSED CLEANLY! <<<');
  process.exit(0);
}

runTests().catch(err => {
  console.error('[FAIL]', err);
  testServer.close();
  process.exit(1);
});
