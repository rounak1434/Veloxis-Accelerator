// In-Browser Media Grabber Content Script
(function() {
  function scanMediaPlayers() {
    const videos = document.querySelectorAll('video');
    videos.forEach((video) => {
      if (video.dataset.nexusGrabberAttached) return;
      video.dataset.nexusGrabberAttached = 'true';

      const wrapper = video.parentElement;
      if (!wrapper) return;

      const pill = document.createElement('div');
      pill.className = 'nexus-media-pill';
      pill.innerHTML = `
        <span class="nexus-icon">⚡</span>
        <span>Download Video</span>
      `;

      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();

        const src = video.currentSrc || video.src;
        if (!src) {
          alert('Stream source not currently playing or protected.');
          return;
        }

        const filename = (document.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'web_video') + '.mp4';
        chrome.runtime.sendMessage({
          action: 'download_stream',
          url: src,
          filename: filename
        }, (res) => {
          if (res && res.success) {
            pill.innerHTML = `<span>✅ Queued!</span>`;
            setTimeout(() => {
              pill.innerHTML = `<span class="nexus-icon">⚡</span><span>Download Video</span>`;
            }, 3000);
          }
        });
      });

      // Position relative to player
      if (getComputedStyle(wrapper).position === 'static') {
        wrapper.style.position = 'relative';
      }
      wrapper.appendChild(pill);
    });
  }

  // Scan periodically for newly loaded players
  setInterval(scanMediaPlayers, 2000);
})();
