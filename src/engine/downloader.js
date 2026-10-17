const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const storage = require('./storage');

class DownloadEngine extends EventEmitter {
  constructor() {
    super();
    this.activeJobs = new Map(); // taskId -> job state
  }

  // Probe server to get file info before starting
  async probe(url, customHeaders = {}) {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(url);
        const client = parsed.protocol === 'https:' ? https : http;

        const options = {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...customHeaders
          }
        };

        const req = client.request(url, options, (res) => {
          // Follow redirect
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, url).toString();
            return resolve(this.probe(redirectUrl, customHeaders));
          }

          let filename = this.extractFilename(url, res.headers['content-disposition']);
          const contentLength = parseInt(res.headers['content-length'] || '0', 10);
          const acceptRanges = res.headers['accept-ranges'] === 'bytes' || res.statusCode === 206;
          const etag = res.headers['etag'] || null;
          const contentType = res.headers['content-type'] || 'application/octet-stream';

          resolve({
            url,
            statusCode: res.statusCode,
            filename,
            fileSize: contentLength,
            resumable: acceptRanges && contentLength > 0,
            etag,
            contentType
          });
        });

        req.on('error', (err) => {
          // If HEAD fails, try a GET with Range: bytes=0-0
          this.probeFallback(url, customHeaders).then(resolve).catch(reject);
        });

        req.setTimeout(8000, () => {
          req.destroy(new Error('Connection timeout probing URL'));
        });

        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  async probeFallback(url, customHeaders = {}) {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(url);
        const client = parsed.protocol === 'https:' ? https : http;

        const options = {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Range': 'bytes=0-0',
            ...customHeaders
          }
        };

        const req = client.request(url, options, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, url).toString();
            return resolve(this.probe(redirectUrl, customHeaders));
          }

          let filename = this.extractFilename(url, res.headers['content-disposition']);
          let fileSize = 0;
          let resumable = false;

          const contentRange = res.headers['content-range'];
          if (contentRange && contentRange.includes('/')) {
            const total = contentRange.split('/')[1];
            fileSize = parseInt(total, 10) || 0;
            resumable = true;
          } else {
            fileSize = parseInt(res.headers['content-length'] || '0', 10);
          }

          res.destroy(); // Abort stream immediately

          resolve({
            url,
            statusCode: res.statusCode,
            filename,
            fileSize,
            resumable: resumable || res.headers['accept-ranges'] === 'bytes',
            etag: res.headers['etag'] || null,
            contentType: res.headers['content-type'] || 'application/octet-stream'
          });
        });

        req.on('error', reject);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  extractFilename(url, disposition) {
    if (disposition) {
      const match = disposition.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
      if (match && match[1]) {
        try {
          return decodeURIComponent(match[1].trim());
        } catch (_) {
          return match[1].trim();
        }
      }
    }
    try {
      const pathname = new URL(url).pathname;
      const basename = path.basename(pathname);
      if (basename && basename.includes('.')) {
        return decodeURIComponent(basename);
      }
    } catch (_) {}
    return 'downloaded_file_' + Date.now();
  }

  // Create segments for a task
  initializeSegments(task, chunkCount = 8) {
    if (!task.resumable || task.fileSize <= 0) {
      // Single chunk fallback
      return [{
        index: 0,
        startByte: 0,
        endByte: task.fileSize > 0 ? task.fileSize - 1 : 0,
        currentByte: 0,
        status: 'waiting',
        tempFile: `${task.id}.part0`
      }];
    }

    const segments = [];
    const chunkSize = Math.floor(task.fileSize / chunkCount);
    let start = 0;

    for (let i = 0; i < chunkCount; i++) {
      const end = (i === chunkCount - 1) ? task.fileSize - 1 : start + chunkSize - 1;
      segments.push({
        index: i,
        startByte: start,
        endByte: end,
        currentByte: start,
        status: 'waiting',
        tempFile: `${task.id}.part${i}`
      });
      start = end + 1;
    }

    return segments;
  }

  // Start or resume a task
  async startTask(task) {
    if (this.activeJobs.has(task.id)) {
      return; // Already running
    }

    const settings = storage.getSettings();
    const tempDir = settings.tempDir;
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    if (!task.segments || task.segments.length === 0) {
      task.segments = this.initializeSegments(task, settings.maxSegmentsPerDownload);
    }

    task.status = 'downloading';
    task.errorMessage = null;
    storage.upsertTask(task);

    const job = {
      task,
      requests: [],
      speed: 0,
      recentBytes: 0,
      lastTickTime: Date.now(),
      isPaused: false
    };

    this.activeJobs.set(task.id, job);
    this.emit('task-started', task);

    // Launch worker segments concurrently
    const promises = task.segments.map(seg => this.downloadSegment(job, seg));

    try {
      await Promise.all(promises);

      if (!job.isPaused) {
        await this.assembleFile(job);
      }
    } catch (err) {
      if (!job.isPaused) {
        console.error(`Task ${task.id} failed:`, err.message);
        task.status = 'error';
        task.errorMessage = err.message;
        storage.upsertTask(task);
        this.emit('task-error', { task, error: err.message });
      }
    } finally {
      this.activeJobs.delete(task.id);
    }
  }

  downloadSegment(job, segment) {
    return new Promise((resolve, reject) => {
      const { task } = job;
      const settings = storage.getSettings();
      const tempFilePath = path.join(settings.tempDir, segment.tempFile);

      // Check if this segment is already completed
      if (task.resumable && segment.currentByte > segment.endByte && segment.endByte > 0) {
        segment.status = 'completed';
        return resolve();
      }

      const parsed = new URL(task.url);
      const client = parsed.protocol === 'https:' ? https : http;

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };

      if (task.referrer) headers['Referer'] = task.referrer;

      // Range request
      if (task.resumable && segment.endByte > 0) {
        headers['Range'] = `bytes=${segment.currentByte}-${segment.endByte}`;
      }

      segment.status = 'downloading';

      // Open stream in append mode if resuming
      const fileStream = fs.createWriteStream(tempFilePath, { flags: 'a' });

      const req = client.request(task.url, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Handle redirect
          task.url = new URL(res.headers.location, task.url).toString();
          fileStream.close();
          return this.downloadSegment(job, segment).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          fileStream.close();
          const err = new Error(`Server returned HTTP ${res.statusCode}`);
          segment.status = 'failed';
          return reject(err);
        }

        res.on('data', (chunk) => {
          if (job.isPaused) {
            req.destroy();
            fileStream.close();
            return;
          }

          fileStream.write(chunk);
          segment.currentByte += chunk.length;
          task.downloadedBytes = (task.downloadedBytes || 0) + chunk.length;
          job.recentBytes += chunk.length;

          // Throttling if speed limiter enabled
          if (settings.speedLimitEnabled && settings.speedLimitBytesPerSec > 0) {
            // Basic stream backpressure throttle
            const segmentQuota = Math.floor(settings.speedLimitBytesPerSec / (task.segments.length || 1));
            if (job.recentBytes > segmentQuota) {
              res.pause();
              setTimeout(() => {
                if (!job.isPaused) res.resume();
              }, 100);
            }
          }
        });

        res.on('end', () => {
          fileStream.end(() => {
            segment.status = 'completed';
            resolve();
          });
        });

        res.on('error', (err) => {
          fileStream.close();
          segment.status = 'failed';
          reject(err);
        });
      });

      req.on('error', (err) => {
        fileStream.close();
        segment.status = 'failed';
        reject(err);
      });

      job.requests.push(req);
      req.end();
    });
  }

  pauseTask(taskId) {
    const job = this.activeJobs.get(taskId);
    if (!job) return;

    job.isPaused = true;
    for (const req of job.requests) {
      try {
        req.destroy();
      } catch (_) {}
    }

    job.task.status = 'paused';
    storage.upsertTask(job.task);
    this.activeJobs.delete(taskId);
    this.emit('task-paused', job.task);
  }

  async assembleFile(job) {
    const { task } = job;
    const settings = storage.getSettings();
    const destDir = task.saveDir || settings.defaultDownloadDir;
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    let finalFilePath = path.join(destDir, task.fileName);

    // If file already exists, deduplicate filename (e.g. file(1).zip)
    let counter = 1;
    const ext = path.extname(task.fileName);
    const base = path.basename(task.fileName, ext);
    while (fs.existsSync(finalFilePath)) {
      finalFilePath = path.join(destDir, `${base}(${counter})${ext}`);
      counter++;
    }

    const outStream = fs.createWriteStream(finalFilePath);
    const hash = crypto.createHash('sha256');

    for (let i = 0; i < task.segments.length; i++) {
      const partPath = path.join(settings.tempDir, task.segments[i].tempFile);
      if (fs.existsSync(partPath)) {
        const data = fs.readFileSync(partPath);
        outStream.write(data);
        hash.update(data);
        fs.unlinkSync(partPath); // clean up segment part file
      }
    }

    await new Promise((res) => outStream.end(res));

    task.savePath = finalFilePath;
    task.checksum = hash.digest('hex');
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.downloadedBytes = task.fileSize || fs.statSync(finalFilePath).size;

    storage.upsertTask(task);
    this.emit('task-completed', task);
  }

  // Calculate live transfer rates periodically
  calculateMetrics() {
    const now = Date.now();
    for (const [taskId, job] of this.activeJobs.entries()) {
      const elapsed = (now - job.lastTickTime) / 1000;
      if (elapsed > 0) {
        job.speed = Math.round(job.recentBytes / elapsed);
        job.recentBytes = 0;
        job.lastTickTime = now;
      }
    }
  }

  getActiveJob(taskId) {
    return this.activeJobs.get(taskId);
  }

  // Update expired download address
  updateTaskUrl(taskId, newUrl) {
    const task = storage.getTask(taskId);
    if (!task) throw new Error('Task not found');
    task.url = newUrl;
    task.originalUrl = newUrl;
    task.status = 'paused';
    task.errorMessage = null;
    storage.upsertTask(task);
    return task;
  }
}

module.exports = new DownloadEngine();
