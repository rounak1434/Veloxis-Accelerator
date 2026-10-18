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

function isStreamUrl(url) {
  if (!url) return false;
  if (isYouTubeUrl(url)) return true;
  const lower = url.toLowerCase();
  return lower.includes('.m3u8') || lower.includes('.mpd') || lower.includes('/hls/') || lower.includes('/dash/');
}

function getYtDlpPath() {
  if (fs.existsSync(YTDLP_PATH)) {
    return YTDLP_PATH;
  }
  return 'yt-dlp'; // fallback to PATH if installed globally
}

/**
 * Get video details and available qualities for a YouTube or media stream URL
 */
function getVideoInfo(url, options = {}) {
  return new Promise((resolve, reject) => {
    const ytdlp = getYtDlpPath();
    const args = [
      '--js-runtimes', `node:${NODE_PATH}`,
      '--extractor-args', 'generic:impersonate',
      '--impersonate', 'chrome',
      '--no-check-certificates',
      '-J',
      '--no-playlist'
    ];

    if (options.referrer) {
      args.push('--referer', options.referrer);
      try {
        const refUrl = new URL(options.referrer);
        args.push('--add-header', `Origin:${refUrl.origin}`);
      } catch (_) {}
    }

    args.push(url);

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
        const title = data.title || 'Video Stream';
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

        // If no discrete heights found, fallback to Best Adaptive Stream
        if (qualityMap.size === 0) {
          qualityMap.set('Best Adaptive Stream', {
            formatId: 'bestvideo+bestaudio/best',
            label: 'Best Adaptive Stream (MP4)',
            ext: 'mp4',
            type: 'video'
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
        reject(new Error(`Failed to parse media metadata: ${err.message}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Universal media stream & YouTube download with real-time progress callbacks
 */
function downloadMediaStream(url, options = {}, callbacks = {}) {
  const {
    formatId = 'bestvideo+bestaudio/best',
    outputDir = path.join(__dirname, '..', '..', 'downloads'),
    filename = null,
    referrer = null
  } = options;

  const { onProgress, onComplete, onError } = callbacks;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const ytdlp = getYtDlpPath();
  const outputTemplate = filename ? path.join(outputDir, filename) : path.join(outputDir, '%(title)s.%(ext)s');

  const ffmpegPath = path.join(BIN_DIR, 'ffmpeg.exe');
  const hasFfmpeg = fs.existsSync(ffmpegPath);

  const args = [
    '--js-runtimes', `node:${NODE_PATH}`,
    '--extractor-args', 'generic:impersonate',
    '--impersonate', 'chrome',
    '--no-check-certificates',
    '-N', '8',
    '-f', formatId,
    '-o', outputTemplate,
    '--newline',
    '--no-playlist'
  ];

  if (referrer) {
    args.push('--referer', referrer);
    try {
      const refUrl = new URL(referrer);
      args.push('--add-header', `Origin:${refUrl.origin}`);
    } catch (_) {}
  }

  args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  if (hasFfmpeg) {
    args.push('--ffmpeg-location', BIN_DIR);
    if (!formatId.startsWith('bestaudio')) {
      args.push('--merge-output-format', 'mp4');
    }
  }

  args.push(url);

  console.log(`[Media Stream Resolver] Spawning: ${ytdlp} ${args.join(' ')}`);
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

      // Detect Merger destination file path
      const mergerMatch = trimmed.match(/\[Merger\] Merging formats into "([^"]+)"/i);
      if (mergerMatch) {
        finalDestination = mergerMatch[1].trim();
        continue;
      }

      // Detect destination file path
      const destMatch = trimmed.match(/\[download\] Destination:\s+(.*)/i);
      if (destMatch && !finalDestination.endsWith('.mp4')) {
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
        continue;
      }

      // Handle HLS fragment progress: [download] (frag 12/120)
      const fragMatch = trimmed.match(/\[download\]\s+\(frag\s+(\d+)\/(\d+)\)/i);
      if (fragMatch) {
        const currFrag = parseInt(fragMatch[1], 10);
        const totalFrag = parseInt(fragMatch[2], 10);
        if (totalFrag > 0) {
          const percent = parseFloat(((currFrag / totalFrag) * 100).toFixed(1));
          const estTotal = lastTotal > 0 ? lastTotal : totalFrag * 500000;
          const estDownloaded = Math.round(estTotal * (percent / 100));

          if (onProgress) {
            onProgress({
              percent,
              downloadedBytes: estDownloaded,
              fileSize: estTotal,
              speed: lastSpeed || 1500000,
              destination: finalDestination
            });
          }
        }
      }
    }
  });

  let stderr = '';
  proc.stderr.on('data', chunk => stderr += chunk);

  proc.on('close', (code) => {
    if (code === 0) {
      if (finalDestination) {
        const mp4Candidate = finalDestination.replace(/\.[^.]+$/, '.mp4');
        if (fs.existsSync(mp4Candidate)) {
          finalDestination = mp4Candidate;
        }
      }
      if (onComplete) {
        let size = lastTotal;
        try {
          if (finalDestination && fs.existsSync(finalDestination)) {
            size = fs.statSync(finalDestination).size;
          }
        } catch (_) {}

        onComplete({
          destination: finalDestination,
          fileSize: size || lastDownloaded
        });
      }
    } else {
      if (url.toLowerCase().includes('.m3u8') && fs.existsSync(path.join(BIN_DIR, 'ffmpeg.exe'))) {
        console.warn(`[Media Stream Resolver] yt-dlp exited with code ${code}, engaging FFmpeg direct stream fallback...`);
        downloadHlsWithFfmpeg(url, outputTemplate, options, callbacks);
        return;
      }
      if (onError) {
        onError(new Error(stderr || `yt-dlp failed with exit code ${code}`));
      }
    }
  });

  proc.on('error', (err) => {
    if (url.toLowerCase().includes('.m3u8') && fs.existsSync(path.join(BIN_DIR, 'ffmpeg.exe'))) {
      console.warn(`[Media Stream Resolver] yt-dlp error (${err.message}), engaging FFmpeg direct stream fallback...`);
      downloadHlsWithFfmpeg(url, outputTemplate, options, callbacks);
      return;
    }
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

/**
 * Direct FFmpeg HLS stream copy fallback for any custom or non-standard M3U8 streams
 */
function downloadHlsWithFfmpeg(url, outputTemplate, options = {}, callbacks = {}) {
  const ffmpegPath = path.join(BIN_DIR, 'ffmpeg.exe');
  const { onProgress, onComplete, onError } = callbacks;

  if (!fs.existsSync(ffmpegPath)) {
    if (onError) onError(new Error('FFmpeg not found for HLS stream fallback'));
    return;
  }

  const destFile = outputTemplate.endsWith('.mp4') ? outputTemplate : outputTemplate.replace(/\.[^.]+$/, '') + '.mp4';
  const headers = [
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
  if (options.referrer) {
    headers.push(`Referer: ${options.referrer}`);
  }

  const args = [
    '-headers', headers.join('\r\n') + '\r\n',
    '-i', url,
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc',
    '-y',
    destFile
  ];

  console.log(`[FFmpeg Fallback] Spawning: ${ffmpegPath} ${args.join(' ')}`);
  const proc = spawn(ffmpegPath, args, { windowsHide: true });

  let stderr = '';
  proc.stderr.on('data', chunk => {
    stderr += chunk;
    const match = chunk.toString().match(/size=\s*(\d+)kB\s+time=([\d:.]+)\s+bitrate=\s*([\d.]+)kbits\/s/i);
    if (match && onProgress) {
      const sizeKb = parseInt(match[1], 10);
      onProgress({
        percent: 50,
        downloadedBytes: sizeKb * 1024,
        fileSize: sizeKb * 1024,
        speed: 1500000,
        destination: destFile
      });
    }
  });

  proc.on('close', (code) => {
    if (code === 0 && fs.existsSync(destFile)) {
      const size = fs.statSync(destFile).size;
      if (onComplete) {
        onComplete({
          destination: destFile,
          fileSize: size
        });
      }
    } else {
      if (onError) onError(new Error(`FFmpeg fallback failed with code ${code}: ${stderr.slice(-300)}`));
    }
  });

  proc.on('error', (err) => {
    if (onError) onError(err);
  });

  return {
    proc,
    cancel: () => {
      try { proc.kill('SIGTERM'); } catch (_) {}
    }
  };
}

module.exports = {
  isYouTubeUrl,
  isStreamUrl,
  getVideoInfo,
  downloadYouTube: downloadMediaStream,
  downloadMediaStream,
  downloadHlsWithFfmpeg
};
