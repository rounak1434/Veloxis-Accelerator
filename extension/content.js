// Veloxis In-Browser Media Grabber & Quality Selector Content Script
(function() {
  const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');

  let activeDropdown = null;

  function getCleanVideoTitle() {
    let title = document.title || 'video_stream';
    if (isYouTube) {
      title = title.replace(/\s*-\s*YouTube\s*$/i, '');
      const ytTitleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1, .ytp-title-link');
      if (ytTitleEl && ytTitleEl.textContent.trim()) {
        title = ytTitleEl.textContent.trim();
      }
    }
    return title.trim();
  }

  function getOrCreateDropdown() {
    if (activeDropdown) return activeDropdown;

    const dropdown = document.createElement('div');
    dropdown.className = 'veloxis-dropdown-panel';
    document.body.appendChild(dropdown);
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
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.left = `${Math.max(10, rect.right - 300)}px`;
  }

  function createGrabberWidget(video) {
    if (video.dataset.veloxisGrabberAttached) return;
    video.dataset.veloxisGrabberAttached = 'true';

    // Prefer top-level player element on YouTube
    const playerTarget = isYouTube
      ? (document.getElementById('movie_player') || video.closest('.html5-video-player') || video.parentElement)
      : video.parentElement;

    if (!playerTarget) return;

    // Avoid duplicate containers
    if (playerTarget.querySelector('.veloxis-grabber-container')) return;

    const container = document.createElement('div');
    container.className = 'veloxis-grabber-container';

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
        renderQualityOptions(dropdown, pill, video);
        dropdown.classList.add('show');
      }
    });

    if (getComputedStyle(playerTarget).position === 'static') {
      playerTarget.style.position = 'relative';
    }
    playerTarget.appendChild(container);
  }

  function renderQualityOptions(dropdown, pill, video) {
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

      // Async fetch dynamic metadata if server responds
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
    } else {
      // Non-YouTube video element
      const src = video.currentSrc || video.src;
      dropdown.innerHTML = `
        <div class="veloxis-panel-header">
          <span class="veloxis-panel-title">Media Stream</span>
          <button class="veloxis-panel-close">&times;</button>
        </div>
        <div class="veloxis-quality-list">
          <div class="veloxis-quality-item" data-format="direct" data-label="Direct Video" data-src="${src || ''}">
            <div class="veloxis-item-left">
              <span class="veloxis-badge badge-hd">Stream</span>
              <span class="veloxis-item-name">Original Video Stream</span>
            </div>
            <span class="veloxis-item-btn">Get</span>
          </div>
        </div>
      `;
      dropdown.querySelector('.veloxis-panel-close')?.addEventListener('click', closeDropdown);
      attachItemListeners(dropdown, pill, title);
    }
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
        const customSrc = item.dataset.src;

        const pillText = pill.querySelector('.veloxis-pill-text');
        pillText.textContent = `Queuing [${label}]...`;
        closeDropdown();

        chrome.runtime.sendMessage({
          action: 'download_youtube',
          url: customSrc || window.location.href,
          title: title,
          formatId: formatId,
          qualityLabel: label,
          type: type,
          ext: ext
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

  function scanMediaPlayers() {
    const videos = document.querySelectorAll('video');
    videos.forEach((video) => {
      createGrabberWidget(video);
    });
  }

  setInterval(scanMediaPlayers, 1500);
})();
