// Background service worker for Veloxis Download Accelerator
const DAEMON_URL = 'http://localhost:6789';
const INTERCEPT_EXTENSIONS = ['zip', 'rar', '7z', 'iso', 'exe', 'msi', 'tar', 'gz', 'mp4', 'mkv', 'mp3', 'flac', 'pdf'];

chrome.downloads.onCreated.addListener(async (downloadItem) => {
  try {
    const url = downloadItem.finalUrl || downloadItem.url;
    if (!url || url.startsWith('blob:') || url.startsWith('data:')) return;

    const pathname = new URL(url).pathname.toLowerCase();
    const ext = pathname.split('.').pop();

    if (INTERCEPT_EXTENSIONS.includes(ext)) {
      // Cancel browser's standard download
      chrome.downloads.cancel(downloadItem.id, () => {
        chrome.downloads.erase({ id: downloadItem.id });
      });

      // Send to Veloxis Desktop Daemon
      await fetch(`${DAEMON_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url,
          referrer: downloadItem.referrer || '',
          fileSize: downloadItem.fileSize || 0,
          immediate: true
        })
      });

      console.log('[Veloxis] Intercepted and routed to desktop accelerator:', url);
    }
  } catch (err) {
    console.error('[Veloxis] Failed to intercept download:', err);
  }
});

// Handle messages from content script (Media Grabber & Quality Selector)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
    let formatId = null;

    if (!url || url.startsWith('blob:')) {
      if (sender.tab && sender.tab.url) {
        url = sender.tab.url;
        isYT = url.includes('youtube.com') || url.includes('youtu.be');
        if (isYT) formatId = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best';
      }
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
      isYT = true;
      formatId = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best';
    }

    fetch(`${DAEMON_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url,
        fileName: request.filename,
        isYouTube: isYT,
        formatId: formatId,
        immediate: true
      })
    })
    .then(r => r.json())
    .then(data => sendResponse({ success: true, task: data.task }))
    .catch(err => sendResponse({ success: false, error: err.message }));

    return true; // async sendResponse
  }
});
