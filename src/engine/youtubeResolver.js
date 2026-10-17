const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BIN_DIR = path.join(__dirname, '..', '..', 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp.exe');
const NODE_PATH = process.execPath;

function isYouTubeUrl(url) {
  if (!url) return false;
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

function getYtDlpPath() {
  if (fs.existsSync(YTDLP_PATH)) {
    return YTDLP_PATH;
  }
  return 'yt-dlp'; // fallback to PATH if installed globally
}

/**
 * Get video details and available qualities for a YouTube URL
 */
function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const ytdlp = getYtDlpPath();
    const args = [
      '--js-runtimes', `node:${NODE_PATH}`,
      '-J',
      '--no-playlist',
      url
    ];

    const proc = spawn(ytdlp, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => stdout += chunk);
    proc.stderr.on('data', chunk => stderr += chunk);

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }

      try {
        const data = JSON.parse(stdout);
        const title = data.title || 'YouTube Video';
        const duration = data.duration || 0;
        const thumbnail = data.thumbnail || (data.thumbnails && data.thumbnails.length ? data.thumbnails[data.thumbnails.length - 1].url : '');
        
        // Extract available resolutions and audio formats
        const formats = data.formats || [];
        const qualityMap = new Map();

        // Check for 1080p, 720p, 480p, 360p, 240p
        const heights = [1080, 720, 480, 360, 240];
        for (const h of heights) {
          const hasHeight = formats.some(f => f.height === h && f.vcodec !== 'none');
          if (hasHeight) {
            let label = `${h}p`;
            if (h === 1080) label = '1080p (Full HD)';
            else if (h === 720) label = '720p (HD)';
            else if (h === 480) label = '480p (Standard)';
            else if (h === 360) label = '360p (Medium)';

            // Look for best format specification
            qualityMap.set(label, {
              formatId: `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`,
              label,
              height: h,
              ext: 'mp4',
              type: 'video'
            });
          }
        }

        // Add Audio options
        const hasAudio = formats.some(f => f.acodec !== 'none');
        if (hasAudio) {
          qualityMap.set('Audio Only (M4A / High)', {
            formatId: 'bestaudio[ext=m4a]/bestaudio/best',
            label: 'Audio Only (M4A)',
            ext: 'm4a',
            type: 'audio'
          });
          qualityMap.set('Audio Only (MP3)', {
            formatId: 'bestaudio/best',
            label: 'Audio Only (MP3)',
            ext: 'mp3',
            type: 'audio'
          });
        }

        // Convert Map to array
        const qualities = Array.from(qualityMap.values());

        resolve({
          id: data.id,
          title,
          duration,
          thumbnail,
          author: data.uploader || data.channel || '',
          qualities
        });
      } catch (err) {
        reject(new Error(`Failed to parse YouTube metadata: ${err.message}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Download a YouTube video with real-time progress callbacks
 */
function downloadYouTube(url, options = {}, callbacks = {}) {
  const {
    formatId = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
    outputDir = path.join(__dirname, '..', '..', 'downloads'),
    filename = null
  } = options;

  const { onProgress, onComplete, onError } = callbacks;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const ytdlp = getYtDlpPath();
  const outputTemplate = filename ? path.join(outputDir, filename) : path.join(outputDir, '%(title)s.%(ext)s');

  const args = [
    '--js-runtimes', `node:${NODE_PATH}`,
    '-f', formatId,
    '-o', outputTemplate,
    '--newline',
    '--no-playlist',
    url
  ];

  console.log(`[YouTube Resolver] Spawning: ${ytdlp} ${args.join(' ')}`);
  const proc = spawn(ytdlp, args, { windowsHide: true });

  let finalDestination = '';
  let lastSpeed = 0;
  let lastDownloaded = 0;
  let lastTotal = 0;

  proc.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect destination file path
      const destMatch = trimmed.match(/\[download\] Destination:\s+(.*)/i);
      if (destMatch) {
        finalDestination = destMatch[1].trim();
        continue;
      }

      // Detect progress line:
      // [download]  45.2% of   25.10MiB at    4.50MiB/s ETA 00:03
      const progMatch = trimmed.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+)(KiB|MiB|GiB|B)\s+at\s+~?([\d.]+)(KiB|MiB|GiB|B)\/s/i);
      if (progMatch) {
        const percent = parseFloat(progMatch[1]);
        const sizeVal = parseFloat(progMatch[2]);
        const sizeUnit = progMatch[3].toUpperCase();
        const speedVal = parseFloat(progMatch[4]);
        const speedUnit = progMatch[5].toUpperCase();

        const unitMultiplier = {
          'B': 1,
          'KIB': 1024,
          'MIB': 1024 * 1024,
          'GIB': 1024 * 1024 * 1024
        };

        const totalBytes = Math.round(sizeVal * (unitMultiplier[sizeUnit] || 1));
        const speedBytes = Math.round(speedVal * (unitMultiplier[speedUnit] || 1));
        const downloadedBytes = Math.round(totalBytes * (percent / 100));

        lastDownloaded = downloadedBytes;
        lastTotal = totalBytes;
        lastSpeed = speedBytes;

        if (onProgress) {
          onProgress({
            percent,
            downloadedBytes,
            fileSize: totalBytes,
            speed: speedBytes,
            destination: finalDestination
          });
        }
      }
    }
  });

  let stderr = '';
  proc.stderr.on('data', chunk => stderr += chunk);

  proc.on('close', (code) => {
    if (code === 0) {
      if (onComplete) {
        onComplete({
          destination: finalDestination,
          fileSize: lastTotal || lastDownloaded
        });
      }
    } else {
      if (onError) {
        onError(new Error(stderr || `yt-dlp failed with exit code ${code}`));
      }
    }
  });

  proc.on('error', (err) => {
    if (onError) onError(err);
  });

  return {
    proc,
    cancel: () => {
      try {
        proc.kill('SIGTERM');
      } catch (_) {}
    }
  };
}

module.exports = {
  isYouTubeUrl,
  getVideoInfo,
  downloadYouTube
};
