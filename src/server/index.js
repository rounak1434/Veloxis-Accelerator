const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');
const storage = require('../engine/storage');
const downloader = require('../engine/downloader');
const queueManager = require('../engine/queueManager');
const youtubeResolver = require('../engine/youtubeResolver');

const PORT = process.env.PORT || 6789;
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  try {
    // API Routes
    if (pathname === '/api/tasks' && req.method === 'GET') {
      const tasks = storage.getTasks().map(t => {
        const job = downloader.getActiveJob(t.id);
        return {
          ...t,
          speed: job ? job.speed : 0,
          isActive: !!job
        };
      });
      return sendJson(res, 200, { tasks, categories: storage.getCategories(), queues: storage.getQueues() });
    }

    if (pathname === '/api/probe' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.url) return sendJson(res, 400, { error: 'URL required' });

      try {
        const info = await downloader.probe(body.url);
        const categoryId = storage.determineCategory(info.filename);
        return sendJson(res, 200, { ...info, categoryId });
      } catch (err) {
        return sendJson(res, 400, { error: err.message || 'Probe failed' });
      }
    }

    if (pathname === '/api/video-info' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.url) return sendJson(res, 400, { error: 'URL required' });

      try {
        if (youtubeResolver.isYouTubeUrl(body.url)) {
          const info = await youtubeResolver.getVideoInfo(body.url);
          return sendJson(res, 200, { success: true, ...info });
        } else {
          const probe = await downloader.probe(body.url);
          return sendJson(res, 200, {
            success: true,
            title: probe.filename,
            qualities: [
              { formatId: 'direct', label: 'Direct Stream (Original)', ext: probe.filename.split('.').pop() || 'mp4' }
            ]
          });
        }
      } catch (err) {
        return sendJson(res, 500, { error: err.message || 'Failed to extract video info' });
      }
    }

    if (pathname === '/api/tasks' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.url) return sendJson(res, 400, { error: 'URL is required' });

      const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const settings = storage.getSettings();
      const isYT = youtubeResolver.isYouTubeUrl(body.url) || body.isYouTube;
      const defaultExt = body.ext || (isYT ? 'mp4' : '');
      let filename = body.fileName || (isYT && body.title ? `${body.title.replace(/[^a-z0-9]/gi, '_')}.${defaultExt}` : downloader.extractFilename(body.url));
      if (!path.extname(filename) && defaultExt) {
        filename += '.' + defaultExt;
      }

      const categoryId = body.categoryId || (isYT ? (body.type === 'audio' ? 'cat-music' : 'cat-video') : storage.determineCategory(filename));
      const queueId = body.queueId || 'queue-main';

      const task = {
        id: taskId,
        url: body.url,
        originalUrl: body.url,
        referrer: body.referrer || '',
        fileName: filename,
        fileSize: body.fileSize || 0,
        downloadedBytes: 0,
        saveDir: body.saveDir || settings.defaultDownloadDir,
        categoryId,
        queueId,
        status: body.immediate !== false ? 'queued' : 'paused',
        resumable: body.resumable !== false,
        etag: body.etag || null,
        contentType: body.contentType || (isYT ? 'video/mp4' : 'application/octet-stream'),
        createdAt: new Date().toISOString(),
        segments: [],
        isYouTube: !!isYT,
        formatId: body.formatId || (isYT ? 'bestvideo[height<=720]+bestaudio/best[height<=720]/best' : null),
        qualityLabel: body.qualityLabel || null
      };

      storage.upsertTask(task);

      if (body.immediate !== false) {
        downloader.startTask(task).catch(err => {
          console.error(`Task ${task.id} launch error:`, err.message);
        });
      }

      return sendJson(res, 201, { task });
    }

    if (pathname.startsWith('/api/tasks/') && req.method === 'POST') {
      const parts = pathname.split('/');
      const taskId = parts[3];
      const action = parts[4];

      const task = storage.getTask(taskId);
      if (!task) return sendJson(res, 404, { error: 'Task not found' });

      if (action === 'start' || action === 'resume') {
        task.status = 'queued';
        storage.upsertTask(task);
        downloader.startTask(task).catch(err => console.error(err));
        return sendJson(res, 200, { success: true, task });
      }

      if (action === 'pause') {
        downloader.pauseTask(taskId);
        return sendJson(res, 200, { success: true });
      }

      if (action === 'refresh-url') {
        const body = await parseJsonBody(req);
        if (!body.newUrl) return sendJson(res, 400, { error: 'newUrl required' });
        const updated = downloader.updateTaskUrl(taskId, body.newUrl);
        return sendJson(res, 200, { success: true, task: updated });
      }
    }

    if (pathname.startsWith('/api/tasks/') && req.method === 'DELETE') {
      const taskId = pathname.split('/')[3];
      downloader.pauseTask(taskId);
      const deleteFile = parsedUrl.searchParams.get('deleteFile') === 'true';
      const task = storage.getTask(taskId);
      if (task && deleteFile && task.savePath && fs.existsSync(task.savePath)) {
        try { fs.unlinkSync(task.savePath); } catch (_) {}
      }
      storage.deleteTask(taskId);
      return sendJson(res, 200, { success: true });
    }

    if (pathname === '/api/batch' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const urls = body.urls || [];
      const queueId = body.queueId || 'queue-main';
      const categoryId = body.categoryId || null;
      const settings = storage.getSettings();

      const created = [];
      for (const url of urls) {
        if (!url || !url.trim()) continue;
        const filename = downloader.extractFilename(url);
        const cat = categoryId || storage.determineCategory(filename);
        const task = {
          id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          url: url.trim(),
          originalUrl: url.trim(),
          referrer: '',
          fileName: filename,
          fileSize: 0,
          downloadedBytes: 0,
          saveDir: settings.defaultDownloadDir,
          categoryId: cat,
          queueId,
          status: 'queued',
          resumable: true,
          createdAt: new Date().toISOString(),
          segments: []
        };
        storage.upsertTask(task);
        created.push(task);
      }

      queueManager.processQueues();
      return sendJson(res, 200, { count: created.length, tasks: created });
    }

    if (pathname === '/api/queues' && req.method === 'GET') {
      return sendJson(res, 200, { queues: storage.getQueues() });
    }

    if (pathname.startsWith('/api/queues/') && req.method === 'PUT') {
      const queueId = pathname.split('/')[3];
      const body = await parseJsonBody(req);
      const updated = storage.updateQueue({ id: queueId, ...body });
      return sendJson(res, 200, { queue: updated });
    }

    if (pathname.startsWith('/api/queues/') && req.method === 'POST') {
      const parts = pathname.split('/');
      const queueId = parts[3];
      const action = parts[4];
      if (action === 'start') {
        queueManager.startQueue(queueId);
        return sendJson(res, 200, { success: true });
      }
      if (action === 'stop') {
        queueManager.stopQueue(queueId);
        return sendJson(res, 200, { success: true });
      }
    }

    if (pathname === '/api/settings' && req.method === 'GET') {
      return sendJson(res, 200, { settings: storage.getSettings() });
    }

    if (pathname === '/api/settings' && req.method === 'PUT') {
      const body = await parseJsonBody(req);
      const updated = storage.updateSettings(body);
      return sendJson(res, 200, { settings: updated });
    }

    if (pathname.startsWith('/api/open-file/') && req.method === 'POST') {
      const taskId = pathname.split('/')[3];
      const task = storage.getTask(taskId);
      if (!task || !task.savePath || !fs.existsSync(task.savePath)) {
        return sendJson(res, 404, { error: 'File does not exist on disk' });
      }
      const isFolder = parsedUrl.searchParams.get('folder') === 'true';
      if (isFolder) {
        exec(`explorer.exe /select,"${task.savePath.replace(/\//g, '\\')}"`);
      } else {
        exec(`start "" "${task.savePath.replace(/\//g, '\\')}"`);
      }
      return sendJson(res, 200, { success: true });
    }

    if (pathname === '/api/crawl' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const startUrl = body.url || 'https://example.com';
      // Simulate/perform structured crawl for Site Grabber
      const mockDiscovered = [
        { url: `${startUrl}/assets/logo.png`, filename: 'logo.png', size: 45200, type: 'image' },
        { url: `${startUrl}/assets/banner.jpg`, filename: 'banner.jpg', size: 312000, type: 'image' },
        { url: `${startUrl}/media/promo.mp4`, filename: 'promo.mp4', size: 14200000, type: 'video' },
        { url: `${startUrl}/docs/manual.pdf`, filename: 'manual.pdf', size: 2450000, type: 'document' },
        { url: `${startUrl}/release/bundle.zip`, filename: 'bundle.zip', size: 35100000, type: 'compressed' }
      ];
      return sendJson(res, 200, { discovered: mockDiscovered });
    }

    // Static File Serving
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'text/plain';
    const content = fs.readFileSync(filePath);

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: err.message || 'Internal Server Error' });
  }
});

// Setup WebSocket Server for Live Real-time Telemetry
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connected', time: Date.now() }));
});

// Periodic broadcast (100ms) for high-framerate transfer progress
setInterval(() => {
  downloader.calculateMetrics();

  if (wss.clients.size > 0) {
    const tasks = storage.getTasks();
    let totalSpeed = 0;
    const activeTasks = [];

    for (const t of tasks) {
      const job = downloader.getActiveJob(t.id);
      if (job) {
        totalSpeed += job.speed;
        activeTasks.push({
          id: t.id,
          speed: job.speed,
          downloadedBytes: t.downloadedBytes,
          fileSize: t.fileSize,
          segments: t.segments
        });
      }
    }

    const payload = JSON.stringify({
      type: 'telemetry',
      totalSpeed,
      activeTasks,
      timestamp: Date.now()
    });

    for (const client of wss.clients) {
      if (client.readyState === 1) { // OPEN
        client.send(payload);
      }
    }
  }
}, 150);

server.listen(PORT, () => {
  console.log(`Veloxis Accelerator server listening on http://localhost:${PORT}`);
});
