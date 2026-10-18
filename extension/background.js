// Background service worker for Veloxis Download Accelerator
const DAEMON_URL = 'http://localhost:6789';
const INTERCEPT_EXTENSIONS = ['zip', 'rar', '7z', 'iso', 'exe', 'msi', 'tar', 'gz', 'mp4', 'mkv', 'mp3', 'flac', 'pdf'];

// In-memory cache of media streams detected per browser tab
const tabStreams = new Map(); // tabId -> Array<{ url, type, label, format, timestamp, initiator, referrer }>

const IGNORED_URL_PATTERNS = [
  /googleads/i,
  /doubleclick/i,
  /googlesyndication/i,
  /adnxs\.com/i,
  /analytics/i,
  /facebook\.com\/tr/i,
  /pagead/i,
  /\.woff2?(\?|$)/i,
  /\.(png|jpe?g|gif|webp|svg|ico)(\?|$)/i,
  /\.(css|js)(\?|$)/i
];

function shouldIgnoreUrl(url) {
  if (!url || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('chrome:')) return true;
  return IGNORED_URL_PATTERNS.some(p => p.test(url));
}

function registerDetectedStream(tabId, streamData) {
  if (!tabId || tabId < 0) return;
  if (!tabStreams.has(tabId)) {
    tabStreams.set(tabId, []);
  }

  const list = tabStreams.get(tabId);
  const cleanUrl = streamData.url.split('?')[0];

  const idx = list.findIndex(item => item.url.split('?')[0] === cleanUrl);
  if (idx >= 0) {
    list[idx] = {
      ...streamData,
      timestamp: Date.now()
    };
  } else {
    list.push({
      ...streamData,
      timestamp: Date.now()
    });
    if (list.length > 15) list.shift();
  }

  // Broadcast stream detection to the tab
  chrome.tabs.sendMessage(tabId, {
    action: 'stream_detected',
    stream: streamData
  }).catch(() => {});
}

// Intercept browser downloads and route to desktop accelerator
chrome.downloads.onCreated.addListener(async (downloadItem) => {
  try {
    const url = downloadItem.finalUrl || downloadItem.url;
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return;

    const pathname = new URL(url).pathname.toLowerCase();
    const ext = pathname.split('.').pop();

    if (INTERCEPT_EXTENSIONS.includes(ext)) {
      try {
        // Send to Veloxis Desktop Accelerator
        const response = await fetch(`${DAEMON_URL}/api/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: url,
            referrer: downloadItem.referrer || '',
            fileSize: downloadItem.fileSize || 0,
            immediate: true
          })
        });

        if (response.ok) {
          // Only cancel browser's standard download when desktop accelerator has received the task
          chrome.downloads.cancel(downloadItem.id, () => {
            chrome.downloads.erase({ id: downloadItem.id });
          });
          console.log('[Veloxis] Intercepted and routed to desktop accelerator:', url);
        } else {
          console.warn('[Veloxis] Accelerator daemon returned non-200, letting browser download proceed.');
        }
      } catch (fetchErr) {
        // Daemon is offline or restarting - silently allow browser's native download to proceed
        console.warn('[Veloxis] Desktop accelerator offline, allowing browser download to continue normally.');
      }
    }
  } catch (err) {
    console.warn('[Veloxis] Download check:', err?.message || err);
  }
});

// Network Stream Sniffer (Passive inspection of HLS playlists, DASH manifests, and video streams)
if (chrome.webRequest) {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.tabId < 0) return;

      // Clear streams when top-level navigation occurs
      if (details.type === 'main_frame') {
        tabStreams.delete(details.tabId);
        return;
      }

      const url = details.url;
      if (shouldIgnoreUrl(url)) return;

      const lower = url.toLowerCase();
      if (lower.includes('.m3u8')) {
        registerDetectedStream(details.tabId, {
          url: details.url,
          type: 'hls',
          label: 'HLS Video Stream (M3U8)',
          ext: 'mp4',
          referrer: details.initiator || ''
        });
      } else if (lower.includes('.mpd')) {
        registerDetectedStream(details.tabId, {
          url: details.url,
          type: 'dash',
          label: 'DASH Video Stream (MPD)',
          ext: 'mp4',
          referrer: details.initiator || ''
        });
      } else if (/\.(mp4|webm|mkv|flv)($|\?)/i.test(lower) && details.type === 'media') {
        registerDetectedStream(details.tabId, {
          url: details.url,
          type: 'direct',
          label: 'Direct Video Stream',
          ext: lower.split('?')[0].split('.').pop() || 'mp4',
          referrer: details.initiator || ''
        });
      }
    },
    { urls: ['<all_urls>'] }
  );

  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (details.tabId < 0) return;
      const url = details.url;
      if (shouldIgnoreUrl(url)) return;

      const ctHeader = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type');
      const contentType = (ctHeader?.value || '').toLowerCase();

      if (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegurl')) {
        registerDetectedStream(details.tabId, {
          url: details.url,
          type: 'hls',
          label: 'HLS Master Stream',
          ext: 'mp4',
          referrer: details.initiator || ''
        });
      } else if (contentType.includes('application/dash+xml')) {
        registerDetectedStream(details.tabId, {
          url: details.url,
          type: 'dash',
          label: 'DASH Adaptive Stream',
          ext: 'mp4',
          referrer: details.initiator || ''
        });
      } else if (contentType.startsWith('video/') && !contentType.includes('mp2t')) {
        registerDetectedStream(details.tabId, {
          url: details.url,
          type: 'direct',
          label: 'Video Stream (' + (contentType.split('/')[1] || 'mp4').toUpperCase() + ')',
          ext: contentType.includes('webm') ? 'webm' : 'mp4',
          referrer: details.initiator || ''
        });
      }
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );
}

// Clean up memory when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStreams.delete(tabId);
});

// Handle messages from content script (Media Grabber & Quality Selector)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get_tab_streams') {
    const tabId = sender.tab?.id;
    const streams = tabId ? (tabStreams.get(tabId) || []) : [];
    sendResponse({ success: true, streams });
    return false;
  }

  if (request.action === 'get_video_info') {
    fetch(`${DAEMON_URL}/api/video-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: request.url })
    })
    .then(r => r.json())
    .then(data => sendResponse(data))
    .catch(err => sendResponse({ success: false, error: err.message }));

    return true; // async sendResponse
  }

  if (request.action === 'download_youtube') {
    let url = request.url;
    if (!url || url.startsWith('blob:')) {
      url = sender.tab?.url || url;
    }

    fetch(`${DAEMON_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url,
        title: request.title,
        formatId: request.formatId,
        qualityLabel: request.qualityLabel,
        type: request.type || 'video',
        ext: request.ext || 'mp4',
        referrer: request.referrer || sender.tab?.url || '',
        isYouTube: true,
        immediate: true
      })
    })
    .then(r => r.json())
    .then(data => sendResponse({ success: true, task: data.task }))
    .catch(err => sendResponse({ success: false, error: err.message }));

    return true; // async sendResponse
  }

  if (request.action === 'download_stream') {
    let url = request.url;
    let isYT = false;
    let formatId = request.formatId || null;

    if (!url || url.startsWith('blob:')) {
      if (sender.tab && sender.tab.url) {
        url = sender.tab.url;
        isYT = url.includes('youtube.com') || url.includes('youtu.be');
        if (isYT && !formatId) formatId = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best';
      }
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
      isYT = true;
      if (!formatId) formatId = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best';
    }

    const isHls = url.toLowerCase().includes('.m3u8') || request.type === 'hls';
    const isDash = url.toLowerCase().includes('.mpd') || request.type === 'dash';

    fetch(`${DAEMON_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url,
        title: request.title,
        fileName: request.filename,
        referrer: request.referrer || sender.tab?.url || '',
        isYouTube: isYT,
        isStream: isHls || isDash || isYT,
        formatId: formatId || 'bestvideo+bestaudio/best',
        qualityLabel: request.qualityLabel || 'Stream',
        type: request.type || 'video',
        ext: request.ext || 'mp4',
        immediate: true
      })
    })
    .then(r => r.json())
    .then(data => sendResponse({ success: true, task: data.task }))
    .catch(err => sendResponse({ success: false, error: err.message }));

    return true; // async sendResponse
  }
});
