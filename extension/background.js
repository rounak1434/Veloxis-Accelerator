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
    fetch(`${DAEMON_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: request.url,
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
    fetch(`${DAEMON_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: request.url,
        fileName: request.filename,
        immediate: true
      })
    })
    .then(r => r.json())
    .then(data => sendResponse({ success: true, task: data.task }))
    .catch(err => sendResponse({ success: false, error: err.message }));

    return true; // async sendResponse
  }
});
