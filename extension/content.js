// Veloxis In-Browser Universal Media Grabber & Quality Selector Content Script
(function() {
  const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');
  const isIframe = window.self !== window.top;

  let activeDropdown = null;
  let activePillContainer = null;
  let detectedLocalStreams = [];

  // Clean video title from page or frame
  function getCleanVideoTitle() {
    let title = '';
    try {
      title = (isIframe && window.top?.document?.title) ? window.top.document.title : document.title;
    } catch (_) {
      title = document.title || 'Video_Stream';
    }

    if (!title || title.trim() === '') {
      title = 'Video_Stream_' + Date.now();
    }

    if (isYouTube) {
      title = title.replace(/\s*-\s*YouTube\s*$/i, '');
      const ytTitleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1, .ytp-title-link');
      if (ytTitleEl && ytTitleEl.textContent.trim()) {
        title = ytTitleEl.textContent.trim();
      }
    } else {
      // Remove generic streaming site watermarks / suffixes from title
      title = title.replace(/\s*[-–|•]\s*(Watch.*|Anikoto.*|9anime.*|HiAnime.*|Episode.*|Online Free.*)$/i, '');
    }

    return title.trim().replace(/[\\/:*?"<>|]/g, '_');
  }

  // Recursive search for all video elements, including through Shadow DOM roots
  function findAllVideos(root = document) {
    let vids = [];
    try {
      if (root.querySelectorAll) {
        vids = Array.from(root.querySelectorAll('video') || []);
        const allElements = root.querySelectorAll('*');
        for (const el of allElements) {
          if (el.shadowRoot) {
            vids = vids.concat(findAllVideos(el.shadowRoot));
          }
        }
      }
    } catch (_) {}
    return vids;
  }

  // Scan frame network entries for HLS (.m3u8), DASH (.mpd), and direct video files
  function scanPerformanceEntries() {
    try {
      if (!window.performance || !performance.getEntriesByType) return;
      const entries = performance.getEntriesByType('resource');
      for (const r of entries) {
        const u = r.name;
        if (!u || u.startsWith('blob:') || u.startsWith('data:')) continue;

        const clean = u.split('?')[0].toLowerCase();
        if (clean.includes('.m3u8')) {
          addDetectedStream({
            url: u,
            type: 'hls',
            label: 'HLS Stream (M3U8)',
            ext: 'mp4'
          });
        } else if (clean.includes('.mpd')) {
          addDetectedStream({
            url: u,
            type: 'dash',
            label: 'DASH Adaptive Stream',
            ext: 'mp4'
          });
        } else if (/\.(mp4|webm|mkv)($|\?)/i.test(clean)) {
          addDetectedStream({
            url: u,
            type: 'direct',
            label: 'Direct Video (' + clean.split('.').pop().toUpperCase() + ')',
            ext: clean.split('.').pop() || 'mp4'
          });
        }
      }
    } catch (_) {}
  }

  function addDetectedStream(stream) {
    const base = stream.url.split('?')[0];
    const exists = detectedLocalStreams.some(s => s.url.split('?')[0] === base);
    if (!exists) {
      detectedLocalStreams.push(stream);
      // Ensure grabber widget is mounted when a stream is detected
      ensureGrabberWidget();
    }
  }

  // Listen for messages from background sniffer
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'stream_detected' && msg.stream) {
      addDetectedStream(msg.stream);
    }
  });

  // Query background for streams already intercepted for this tab
  function queryBackgroundStreams() {
    try {
      chrome.runtime.sendMessage({ action: 'get_tab_streams' }, (res) => {
        if (res && res.success && Array.isArray(res.streams)) {
          res.streams.forEach(s => addDetectedStream(s));
        }
      });
    } catch (_) {}
  }

  function getOrCreateDropdown() {
    if (activeDropdown) return activeDropdown;

    const dropdown = document.createElement('div');
    dropdown.className = 'veloxis-dropdown-panel';
    (document.fullscreenElement || document.body || document.documentElement).appendChild(dropdown);
    activeDropdown = dropdown;

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !e.target.closest('.veloxis-media-pill')) {
        closeDropdown();
      }
    });

    window.addEventListener('resize', closeDropdown);
    window.addEventListener('scroll', closeDropdown);

    return dropdown;
  }

  function closeDropdown() {
    if (activeDropdown) {
      activeDropdown.classList.remove('show');
    }
    document.querySelectorAll('.veloxis-media-pill.open').forEach(p => p.classList.remove('open'));
  }

  function positionDropdown(dropdown, pill) {
    const rect = pill.getBoundingClientRect();
    const dropdownWidth = 320;
    let top = rect.bottom + 8;
    let left = rect.right - dropdownWidth;

    if (left < 10) left = 10;
    if (top + 280 > window.innerHeight) {
      top = Math.max(10, rect.top - 290);
    }

    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;
  }

  function createGrabberWidget(targetParent = null) {
    if (activePillContainer && document.contains(activePillContainer)) {
      return activePillContainer;
    }

    const container = document.createElement('div');
    container.className = 'veloxis-grabber-container' + (isIframe ? ' veloxis-in-iframe' : '');

    const pill = document.createElement('div');
    pill.className = 'veloxis-media-pill';
    pill.innerHTML = `
      <span class="veloxis-icon">⚡</span>
      <span class="veloxis-pill-text">Download Video</span>
      <span class="veloxis-caret">▼</span>
    `;

    container.appendChild(pill);

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const dropdown = getOrCreateDropdown();
      const isAlreadyOpen = pill.classList.contains('open');

      if (isAlreadyOpen) {
        closeDropdown();
      } else {
        closeDropdown();
        pill.classList.add('open');
        positionDropdown(dropdown, pill);
        renderQualityOptions(dropdown, pill);
        dropdown.classList.add('show');
      }
    });

    // Mount container
    const mountTarget = targetParent || document.body || document.documentElement;
    if (mountTarget) {
      if (!isIframe && getComputedStyle(mountTarget).position === 'static') {
        mountTarget.style.position = 'relative';
      }
      mountTarget.appendChild(container);
      activePillContainer = container;
    }

    return container;
  }

  function ensureGrabberWidget() {
    const videos = findAllVideos();

    if (isYouTube) {
      const ytPlayer = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (ytPlayer && (!activePillContainer || !document.contains(activePillContainer))) {
        createGrabberWidget(ytPlayer);
      }
      return;
    }

    // Inside an iframe player or streaming website
    if (isIframe) {
      // In player iframes (like Vidstream, MegaCloud, RapidCloud), pin to top-right of the iframe view
      if (!activePillContainer || !document.contains(activePillContainer)) {
        createGrabberWidget(document.fullscreenElement || document.body);
      }
      return;
    }

    // Top-level page with videos or detected streams
    if (videos.length > 0) {
      const mainVideo = videos[0];
      const playerWrapper = mainVideo.closest('.player, .video-player, [class*="player"], [id*="player"]') || mainVideo.parentElement;
      if (!activePillContainer || !document.contains(activePillContainer)) {
        createGrabberWidget(playerWrapper || document.body);
      }
    } else if (detectedLocalStreams.length > 0) {
      // Stream detected on page even if video element is masked
      if (!activePillContainer || !document.contains(activePillContainer)) {
        createGrabberWidget(document.body);
      }
    }
  }

  function renderQualityOptions(dropdown, pill) {
    const title = getCleanVideoTitle();

    if (isYouTube) {
      dropdown.innerHTML = `
        <div class="veloxis-panel-header">
          <span class="veloxis-panel-title">Choose Quality</span>
          <button class="veloxis-panel-close">&times;</button>
        </div>
        <div class="veloxis-quality-list">
          <div class="veloxis-quality-item" data-format="bestvideo[height<=1080]+bestaudio/best[height<=1080]/best" data-label="1080p" data-type="video" data-ext="mp4">
            <div class="veloxis-item-left">
              <span class="veloxis-badge badge-fhd">1080p</span>
              <span class="veloxis-item-name">Full HD • MP4</span>
            </div>
            <span class="veloxis-item-btn">Get</span>
          </div>
          <div class="veloxis-quality-item" data-format="bestvideo[height<=720]+bestaudio/best[height<=720]/best" data-label="720p" data-type="video" data-ext="mp4">
            <div class="veloxis-item-left">
              <span class="veloxis-badge badge-hd">720p</span>
              <span class="veloxis-item-name">High Def • MP4</span>
            </div>
            <span class="veloxis-item-btn">Get</span>
          </div>
          <div class="veloxis-quality-item" data-format="bestvideo[height<=480]+bestaudio/best[height<=480]/best" data-label="480p" data-type="video" data-ext="mp4">
            <div class="veloxis-item-left">
              <span class="veloxis-badge badge-sd">480p</span>
              <span class="veloxis-item-name">Standard • MP4</span>
            </div>
            <span class="veloxis-item-btn">Get</span>
          </div>
          <div class="veloxis-quality-item" data-format="bestvideo[height<=360]+bestaudio/best[height<=360]/best" data-label="360p" data-type="video" data-ext="mp4">
            <div class="veloxis-item-left">
              <span class="veloxis-badge badge-sd">360p</span>
              <span class="veloxis-item-name">Medium • MP4</span>
            </div>
            <span class="veloxis-item-btn">Get</span>
          </div>
          <div class="veloxis-quality-item" data-format="bestaudio[ext=m4a]/bestaudio/best" data-label="Audio M4A" data-type="audio" data-ext="m4a">
            <div class="veloxis-item-left">
              <span class="veloxis-badge badge-audio">Audio</span>
              <span class="veloxis-item-name">Audio Only • M4A</span>
            </div>
            <span class="veloxis-item-btn">Get</span>
          </div>
          <div class="veloxis-quality-item" data-format="bestaudio/best" data-label="Audio MP3" data-type="audio" data-ext="mp3">
            <div class="veloxis-item-left">
              <span class="veloxis-badge badge-audio">Audio</span>
              <span class="veloxis-item-name">Audio Only • MP3</span>
            </div>
            <span class="veloxis-item-btn">Get</span>
          </div>
        </div>
      `;

      dropdown.querySelector('.veloxis-panel-close')?.addEventListener('click', closeDropdown);
      attachItemListeners(dropdown, pill, title);

      chrome.runtime.sendMessage({
        action: 'get_video_info',
        url: window.location.href
      }, (res) => {
        if (res && res.success && res.qualities && res.qualities.length > 0) {
          const list = dropdown.querySelector('.veloxis-quality-list');
          if (!list) return;

          let html = '';
          res.qualities.forEach(q => {
            let badgeClass = 'badge-sd';
            if (q.height >= 2160 || q.height >= 1440) badgeClass = 'badge-uhd';
            else if (q.height >= 1080) badgeClass = 'badge-fhd';
            else if (q.height >= 720) badgeClass = 'badge-hd';
            else if (q.type === 'audio') badgeClass = 'badge-audio';

            html += `
              <div class="veloxis-quality-item" data-format="${q.formatId}" data-label="${q.label}" data-type="${q.type || 'video'}" data-ext="${q.ext || 'mp4'}">
                <div class="veloxis-item-left">
                  <span class="veloxis-badge ${badgeClass}">${q.label.split(' ')[0]}</span>
                  <span class="veloxis-item-name">${q.label} • ${(q.ext || 'mp4').toUpperCase()}</span>
                </div>
                <span class="veloxis-item-btn">Get</span>
              </div>
            `;
          });
          list.innerHTML = html;
          attachItemListeners(dropdown, pill, title);
        }
      });
      return;
    }

    // Streaming video player (an!koto, anime players, HLS / DASH / MP4 streams)
    scanPerformanceEntries();

    // Check direct video element sources
    const videos = findAllVideos();
    videos.forEach(v => {
      const src = v.currentSrc || v.src;
      if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
        addDetectedStream({
          url: src,
          type: 'direct',
          label: 'Direct HTML5 Stream',
          ext: 'mp4'
        });
      }
      v.querySelectorAll('source').forEach(s => {
        if (s.src && !s.src.startsWith('blob:')) {
          addDetectedStream({
            url: s.src,
            type: 'direct',
            label: 'Video Source Stream',
            ext: 'mp4'
          });
        }
      });
    });

    let itemsHtml = '';
    if (detectedLocalStreams.length > 0) {
      detectedLocalStreams.forEach((s, idx) => {
        let badgeClass = s.type === 'hls' ? 'badge-fhd' : (s.type === 'dash' ? 'badge-hd' : 'badge-sd');
        let badgeLabel = s.type === 'hls' ? 'HLS' : (s.type === 'dash' ? 'DASH' : 'STREAM');
        let name = s.label || `Stream ${idx + 1}`;

        itemsHtml += `
          <div class="veloxis-quality-item" data-url="${s.url}" data-type="${s.type}" data-label="${name}" data-ext="${s.ext || 'mp4'}">
            <div class="veloxis-item-left">
              <span class="veloxis-badge ${badgeClass}">${badgeLabel}</span>
              <span class="veloxis-item-name">${name} • ${(s.ext || 'mp4').toUpperCase()}</span>
            </div>
            <span class="veloxis-item-btn">Get</span>
          </div>
        `;
      });
    } else {
      // Fallback stream item
      const pageUrl = window.location.href;
      itemsHtml = `
        <div class="veloxis-quality-item" data-url="${pageUrl}" data-type="auto" data-label="Adaptive Stream" data-ext="mp4">
          <div class="veloxis-item-left">
            <span class="veloxis-badge badge-fhd">AUTO</span>
            <span class="veloxis-item-name">Adaptive Stream • MP4</span>
          </div>
          <span class="veloxis-item-btn">Get</span>
        </div>
      `;
    }

    dropdown.innerHTML = `
      <div class="veloxis-panel-header">
        <span class="veloxis-panel-title">Detected Media Streams</span>
        <button class="veloxis-panel-close">&times;</button>
      </div>
      <div class="veloxis-quality-list">
        ${itemsHtml}
      </div>
    `;

    dropdown.querySelector('.veloxis-panel-close')?.addEventListener('click', closeDropdown);
    attachStreamListeners(dropdown, pill, title);
  }

  function attachItemListeners(dropdown, pill, title) {
    const items = dropdown.querySelectorAll('.veloxis-quality-item');
    items.forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const formatId = item.dataset.format;
        const label = item.dataset.label;
        const type = item.dataset.type || 'video';
        const ext = item.dataset.ext || (type === 'audio' ? 'm4a' : 'mp4');

        const pillText = pill.querySelector('.veloxis-pill-text');
        pillText.textContent = `Queuing [${label}]...`;
        closeDropdown();

        chrome.runtime.sendMessage({
          action: 'download_youtube',
          url: window.location.href,
          title: title,
          formatId: formatId,
          qualityLabel: label,
          type: type,
          ext: ext,
          referrer: window.location.href
        }, (res) => {
          if (res && res.success) {
            pillText.textContent = `✓ Queued [${label}]!`;
            setTimeout(() => {
              pillText.textContent = `Download Video`;
            }, 4000);
          } else {
            pillText.textContent = `Error queueing`;
            setTimeout(() => {
              pillText.textContent = `Download Video`;
            }, 3000);
          }
        });
      };
    });
  }

  function attachStreamListeners(dropdown, pill, title) {
    const items = dropdown.querySelectorAll('.veloxis-quality-item');
    items.forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const streamUrl = item.dataset.url;
        const label = item.dataset.label;
        const streamType = item.dataset.type;
        const ext = item.dataset.ext || 'mp4';

        const pillText = pill.querySelector('.veloxis-pill-text');
        pillText.textContent = `Queuing stream...`;
        closeDropdown();

        chrome.runtime.sendMessage({
          action: 'download_stream',
          url: streamUrl,
          title: title,
          filename: `${title}.${ext}`,
          qualityLabel: label,
          type: streamType,
          ext: ext,
          referrer: window.location.href
        }, (res) => {
          if (res && res.success) {
            pillText.textContent = `✓ Queued [${ext.toUpperCase()}]!`;
            setTimeout(() => {
              pillText.textContent = `Download Video`;
            }, 4000);
          } else {
            pillText.textContent = `Error queueing`;
            setTimeout(() => {
              pillText.textContent = `Download Video`;
            }, 3000);
          }
        });
      };
    });
  }

  // Periodic heartbeat scanner
  setInterval(() => {
    scanPerformanceEntries();
    ensureGrabberWidget();
  }, 1500);

  // Hook into video playback events across DOM and Shadow DOM
  function bindVideoListeners() {
    const videos = findAllVideos();
    videos.forEach(v => {
      if (!v.dataset.veloxisObserved) {
        v.dataset.veloxisObserved = 'true';
        ['play', 'playing', 'loadedmetadata', 'canplay', 'timeupdate'].forEach(evt => {
          v.addEventListener(evt, () => {
            scanPerformanceEntries();
            ensureGrabberWidget();
          }, { once: evt !== 'timeupdate' });
        });
      }
    });
  }

  setInterval(bindVideoListeners, 2000);

  // Initial queries on frame load
  queryBackgroundStreams();
  scanPerformanceEntries();
  ensureGrabberWidget();
})();
