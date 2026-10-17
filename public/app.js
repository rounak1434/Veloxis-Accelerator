// Nexus Download Accelerator - Interactive Single-Page App
(function() {
  const API_BASE = window.location.origin;
  let tasks = [];
  let categories = [];
  let queues = [];
  let settings = {};
  let currentFilter = 'all';
  let selectedTaskIds = new Set();
  let currentTrackingTaskId = null;
  let ws = null;

  // Formatting helpers
  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '0.0 KB/s';
    return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
  }

  function formatEta(bytesLeft, speed) {
    if (!speed || speed <= 0 || !bytesLeft || bytesLeft <= 0) return '--';
    const seconds = Math.ceil(bytesLeft / speed);
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  }

  // Modal helpers
  function openModal(id) {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
  }

  // Setup WebSocket connection
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'telemetry') {
          handleTelemetry(msg);
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    ws.onclose = () => {
      setTimeout(connectWebSocket, 2000);
    };
  }

  function handleTelemetry(data) {
    // Total speed readout
    const totalSpeedEl = document.getElementById('stat-total-speed');
    if (totalSpeedEl) totalSpeedEl.textContent = formatSpeed(data.totalSpeed);

    const activeCountEl = document.getElementById('stat-active-count');
    if (activeCountEl) activeCountEl.textContent = data.activeTasks.length;

    // Update active tasks in memory and UI
    for (const active of data.activeTasks) {
      const task = tasks.find(t => t.id === active.id);
      if (task) {
        task.speed = active.speed;
        task.downloadedBytes = active.downloadedBytes;
        task.fileSize = active.fileSize || task.fileSize;
        task.segments = active.segments;

        // Update table row inline
        updateTableRow(task);

        // If currently viewing in S04 Progress modal
        if (currentTrackingTaskId === task.id) {
          updateProgressModal(task);
        }
      }
    }
  }

  async function fetchTasks() {
    try {
      const res = await fetch(`${API_BASE}/api/tasks`);
      const data = await res.json();
      tasks = data.tasks || [];
      categories = data.categories || [];
      queues = data.queues || [];
      renderTable();
      updateBadges();
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  }

  async function fetchSettings() {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      const data = await res.json();
      settings = data.settings || {};
      const speedLimitLabel = document.getElementById('speed-limit-label');
      if (speedLimitLabel) {
        speedLimitLabel.textContent = settings.speedLimitEnabled ? `${Math.round(settings.speedLimitBytesPerSec / 1024)} KB/s` : 'Off';
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  }

  function renderTable() {
    const tbody = document.getElementById('tasks-tbody');
    const emptyState = document.getElementById('empty-state');
    if (!tbody) return;

    tbody.innerHTML = '';

    const query = (document.getElementById('search-input')?.value || '').toLowerCase();

    let filtered = tasks.filter(t => {
      if (query && !t.fileName.toLowerCase().includes(query) && !t.url.toLowerCase().includes(query)) {
        return false;
      }
      if (currentFilter === 'all') return true;
      if (currentFilter === 'downloading') return t.status === 'downloading';
      if (currentFilter === 'completed') return t.status === 'completed';
      if (currentFilter === 'paused') return t.status === 'paused' || t.status === 'queued';
      if (currentFilter.startsWith('cat-')) return t.categoryId === currentFilter;
      if (currentFilter.startsWith('queue-')) return t.queueId === currentFilter;
      return true;
    });

    if (filtered.length === 0) {
      emptyState.style.display = 'block';
      return;
    } else {
      emptyState.style.display = 'none';
    }

    filtered.forEach(task => {
      const tr = document.createElement('tr');
      tr.id = `row-${task.id}`;
      if (selectedTaskIds.has(task.id)) tr.classList.add('selected');

      const percent = task.fileSize > 0 ? Math.min(100, Math.round((task.downloadedBytes / task.fileSize) * 100)) : 0;
      const typeClass = getCategoryTypeClass(task.categoryId);

      tr.innerHTML = `
        <td><input type="checkbox" class="task-check" data-id="${task.id}" ${selectedTaskIds.has(task.id) ? 'checked' : ''}></td>
        <td>
          <div class="filename-cell" title="${task.fileName}">
            <div class="file-type-icon ${typeClass}">${getFileExtensionBadge(task.fileName)}</div>
            <span>${task.fileName}</span>
          </div>
        </td>
        <td style="font-family: var(--font-mono);">${formatBytes(task.fileSize)}</td>
        <td>
          <span class="status-chip status-${task.status}">
            ${task.status}
          </span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="progress-container">
              ${renderSegmentChunksMini(task)}
            </div>
            <span style="font-size: 11px; font-family: var(--font-mono); width: 32px;">${percent}%</span>
          </div>
        </td>
        <td class="cell-speed" style="font-family: var(--font-mono);">${formatSpeed(task.speed)}</td>
        <td class="cell-eta" style="font-family: var(--font-mono);">${formatEta((task.fileSize || 0) - (task.downloadedBytes || 0), task.speed)}</td>
        <td style="font-size: 12px; color: var(--color-text-muted);">${new Date(task.createdAt).toLocaleDateString()}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            ${task.status === 'downloading'
              ? `<button class="btn btn-secondary btn-sm" onclick="window.nexusApp.pauseTask('${task.id}')">⏸</button>`
              : task.status === 'completed'
              ? `<button class="btn btn-primary btn-sm" onclick="window.nexusApp.openFile('${task.id}', false)">Open</button>`
              : `<button class="btn btn-primary btn-sm" onclick="window.nexusApp.startTask('${task.id}')">▶</button>`
            }
            <button class="btn btn-ghost btn-sm" onclick="window.nexusApp.showProgressModal('${task.id}')">ℹ</button>
          </div>
        </td>
      `;

      tr.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
          window.nexusApp.showProgressModal(task.id);
        }
      });

      tbody.appendChild(tr);
    });
  }

  function updateTableRow(task) {
    const tr = document.getElementById(`row-${task.id}`);
    if (!tr) return;

    const percent = task.fileSize > 0 ? Math.min(100, Math.round((task.downloadedBytes / task.fileSize) * 100)) : 0;
    const speedCell = tr.querySelector('.cell-speed');
    const etaCell = tr.querySelector('.cell-eta');
    const statusChip = tr.querySelector('.status-chip');
    const progressContainer = tr.querySelector('.progress-container');

    if (speedCell) speedCell.textContent = formatSpeed(task.speed);
    if (etaCell) etaCell.textContent = formatEta((task.fileSize || 0) - (task.downloadedBytes || 0), task.speed);
    if (statusChip) {
      statusChip.className = `status-chip status-${task.status}`;
      statusChip.textContent = task.status;
    }
    if (progressContainer) {
      progressContainer.innerHTML = renderSegmentChunksMini(task);
    }
  }

  function renderSegmentChunksMini(task) {
    if (!task.segments || task.segments.length === 0) {
      const pct = task.fileSize > 0 ? Math.min(100, (task.downloadedBytes / task.fileSize) * 100) : 0;
      return `<div style="width: ${pct}%; background: var(--color-accent); height: 100%;"></div>`;
    }

    return task.segments.map(seg => {
      const segSize = seg.endByte - seg.startByte + 1;
      const segDone = seg.currentByte - seg.startByte;
      const segPct = segSize > 0 ? Math.min(100, Math.max(0, (segDone / segSize) * 100)) : 0;
      const flex = Math.max(1, segSize);

      return `<div class="progress-segment segment-${seg.status}" style="flex: ${flex};">
        <div style="width: ${segPct}%; height: 100%; background: ${seg.status === 'completed' ? 'var(--color-accent)' : 'var(--color-chunk-active)'};"></div>
      </div>`;
    }).join('');
  }

  function getFileExtensionBadge(filename) {
    const ext = (filename.split('.').pop() || '').toUpperCase();
    return ext.substring(0, 4) || 'FILE';
  }

  function getCategoryTypeClass(catId) {
    if (catId === 'cat-comp') return 'type-zip';
    if (catId === 'cat-doc') return 'type-doc';
    if (catId === 'cat-vid') return 'type-vid';
    if (catId === 'cat-mus') return 'type-mus';
    if (catId === 'cat-prog') return 'type-prog';
    return 'type-other';
  }

  function updateBadges() {
    document.getElementById('count-all').textContent = tasks.length;
    document.getElementById('count-downloading').textContent = tasks.filter(t => t.status === 'downloading').length;
    document.getElementById('count-completed').textContent = tasks.filter(t => t.status === 'completed').length;
    document.getElementById('count-paused').textContent = tasks.filter(t => t.status === 'paused' || t.status === 'queued').length;

    categories.forEach(c => {
      const el = document.getElementById(`count-${c.id}`);
      if (el) el.textContent = tasks.filter(t => t.categoryId === c.id).length;
    });

    queues.forEach(q => {
      const el = document.getElementById(`count-${q.id}`);
      if (el) el.textContent = tasks.filter(t => t.queueId === q.id).length;
    });
  }

  // S04: Progress Modal rendering
  function updateProgressModal(task) {
    document.getElementById('progress-modal-title').textContent = `Downloading: ${task.fileName}`;
    document.getElementById('modal-transfer-rate').textContent = formatSpeed(task.speed);
    document.getElementById('modal-eta').textContent = `Time left: ${formatEta((task.fileSize || 0) - (task.downloadedBytes || 0), task.speed)}`;
    document.getElementById('modal-downloaded-ratio').textContent = `${formatBytes(task.downloadedBytes)} of ${formatBytes(task.fileSize)}`;

    const percent = task.fileSize > 0 ? Math.min(100, Math.round((task.downloadedBytes / task.fileSize) * 100)) : 0;
    document.getElementById('modal-percentage').textContent = `${percent}%`;
    document.getElementById('modal-progress-fill').style.width = `${percent}%`;

    const segmentsGrid = document.getElementById('modal-segments-grid');
    if (segmentsGrid && task.segments) {
      segmentsGrid.innerHTML = task.segments.map(seg => {
        const segSize = Math.max(1, seg.endByte - seg.startByte + 1);
        const segDone = Math.max(0, seg.currentByte - seg.startByte);
        const segPct = Math.min(100, Math.round((segDone / segSize) * 100));

        return `
          <div class="segment-row">
            <span class="segment-num">Part ${seg.index + 1}</span>
            <div class="segment-track">
              <div class="segment-fill" style="width: ${segPct}%; background: ${seg.status === 'completed' ? 'var(--color-accent)' : 'linear-gradient(90deg, #06b6d4, #3b82f6)'}"></div>
            </div>
            <span style="width: 45px; text-align: right;">${segPct}%</span>
            <span class="status-chip status-${seg.status}" style="font-size: 9px; padding: 1px 4px;">${seg.status}</span>
          </div>
        `;
      }).join('');
    }

    const btnPauseToggle = document.getElementById('btn-modal-pause-toggle');
    if (btnPauseToggle) {
      btnPauseToggle.textContent = task.status === 'downloading' ? 'Pause' : 'Resume';
    }
  }

  // App API exposed globally
  window.nexusApp = {
    async startTask(id) {
      await fetch(`${API_BASE}/api/tasks/${id}/start`, { method: 'POST' });
      fetchTasks();
    },

    async pauseTask(id) {
      await fetch(`${API_BASE}/api/tasks/${id}/pause`, { method: 'POST' });
      fetchTasks();
    },

    async openFile(id, isFolder = false) {
      await fetch(`${API_BASE}/api/open-file/${id}?folder=${isFolder}`, { method: 'POST' });
    },

    showProgressModal(id) {
      const task = tasks.find(t => t.id === id);
      if (!task) return;
      currentTrackingTaskId = id;
      updateProgressModal(task);
      openModal('modal-progress');
    },

    async quickDownloadMedia(url, filename) {
      closeModal('modal-media-grabber');
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, fileName: filename, immediate: true })
      });
      const data = await res.json();
      await fetchTasks();
      if (data.task) {
        window.nexusApp.showProgressModal(data.task.id);
      }
    }
  };

  // Event Listeners Initialization
  function initEvents() {
    // Category Sidebar navigation
    document.querySelectorAll('.category-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentFilter = item.dataset.category || item.dataset.queue || 'all';
        renderTable();
      });
    });

    // Close buttons for all modals
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        closeModal(btn.dataset.close);
        currentTrackingTaskId = null;
      });
    });

    // Toolbar buttons
    document.getElementById('btn-toolbar-add')?.addEventListener('click', () => {
      openModal('modal-add-url');
    });

    document.getElementById('btn-toolbar-scheduler')?.addEventListener('click', () => {
      openModal('modal-scheduler');
    });

    document.getElementById('btn-toolbar-options')?.addEventListener('click', () => {
      openModal('modal-options');
    });

    document.getElementById('btn-toolbar-batch')?.addEventListener('click', () => {
      openModal('modal-batch');
    });

    document.getElementById('btn-toolbar-grabber')?.addEventListener('click', () => {
      openModal('modal-site-grabber');
    });

    document.getElementById('btn-toolbar-media-sim')?.addEventListener('click', () => {
      openModal('modal-media-grabber');
    });

    document.getElementById('floating-grabber-pill')?.addEventListener('click', () => {
      window.nexusApp.quickDownloadMedia('https://speed.hetzner.de/100MB.bin', 'Injected_Stream_1080p.mp4');
    });

    document.getElementById('btn-speed-limiter-toggle')?.addEventListener('click', () => {
      openModal('modal-speed-limiter');
    });

    // S02 -> S03 Probe Flow
    document.getElementById('btn-probe-url')?.addEventListener('click', async () => {
      const urlInput = document.getElementById('add-url-input');
      const url = urlInput.value.trim();
      if (!url) return alert('Please enter a valid URL');

      try {
        const btn = document.getElementById('btn-probe-url');
        btn.textContent = 'Probing...';
        btn.disabled = true;

        const res = await fetch(`${API_BASE}/api/probe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const info = await res.json();
        btn.textContent = 'Probe File';
        btn.disabled = false;

        if (info.error) {
          alert('Probe error: ' + info.error);
          return;
        }

        // Open S03 File Info
        closeModal('modal-add-url');
        document.getElementById('info-file-name').textContent = info.filename;
        document.getElementById('info-url').textContent = info.url;
        document.getElementById('info-size').textContent = formatBytes(info.fileSize);
        document.getElementById('info-resumable').textContent = info.resumable ? 'Yes (Multipart Range Supported)' : 'Single Connection Stream';
        document.getElementById('info-resumable').className = `status-chip ${info.resumable ? 'status-completed' : 'status-paused'}`;

        openModal('modal-file-info');
      } catch (err) {
        alert('Failed to probe: ' + err.message);
      }
    });

    document.getElementById('btn-confirm-add-url')?.addEventListener('click', async () => {
      const url = document.getElementById('add-url-input').value.trim();
      const referrer = document.getElementById('add-referrer-input').value.trim();
      const categoryId = document.getElementById('add-category-select').value;
      if (!url) return;

      closeModal('modal-add-url');
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, referrer, categoryId, immediate: true })
      });
      const data = await res.json();
      await fetchTasks();
      if (data.task) window.nexusApp.showProgressModal(data.task.id);
    });

    // S03 start / queue buttons
    document.getElementById('btn-info-start-now')?.addEventListener('click', async () => {
      const url = document.getElementById('info-url').textContent;
      const fileName = document.getElementById('info-file-name').textContent;
      const queueId = document.getElementById('info-queue-select').value;

      closeModal('modal-file-info');
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, fileName, queueId, immediate: true })
      });
      const data = await res.json();
      await fetchTasks();
      if (data.task) window.nexusApp.showProgressModal(data.task.id);
    });

    // S04 Modal Pause toggle
    document.getElementById('btn-modal-pause-toggle')?.addEventListener('click', () => {
      if (!currentTrackingTaskId) return;
      const task = tasks.find(t => t.id === currentTrackingTaskId);
      if (!task) return;
      if (task.status === 'downloading') {
        window.nexusApp.pauseTask(task.id);
      } else {
        window.nexusApp.startTask(task.id);
      }
    });

    // S04 Open Refresh Link Modal (S10)
    document.getElementById('btn-open-refresh-from-progress')?.addEventListener('click', () => {
      if (!currentTrackingTaskId) return;
      const task = tasks.find(t => t.id === currentTrackingTaskId);
      if (!task) return;
      document.getElementById('refresh-old-url').value = task.url;
      openModal('modal-refresh-url');
    });

    // S10 Refresh URL Submit
    document.getElementById('btn-submit-refreshed-url')?.addEventListener('click', async () => {
      const newUrl = document.getElementById('refresh-new-url').value.trim();
      if (!newUrl || !currentTrackingTaskId) return;

      await fetch(`${API_BASE}/api/tasks/${currentTrackingTaskId}/refresh-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUrl })
      });

      closeModal('modal-refresh-url');
      window.nexusApp.startTask(currentTrackingTaskId);
    });

    // S09 Batch Pattern generator
    const updateBatchPreview = () => {
      const tpl = document.getElementById('batch-template-input').value;
      const start = parseInt(document.getElementById('batch-start-num').value, 10) || 1;
      const end = parseInt(document.getElementById('batch-end-num').value, 10) || 5;
      const listEl = document.getElementById('batch-preview-list');
      const countLabel = document.getElementById('batch-count-label');

      const generated = [];
      for (let i = start; i <= end; i++) {
        const numStr = String(i).padStart(2, '0');
        const url = tpl.replace(/\[01-\d+\]|\[\*\]/, numStr);
        generated.push(url);
      }

      countLabel.textContent = generated.length;
      listEl.innerHTML = generated.map(u => `<div>${u}</div>`).join('');
    };

    document.getElementById('batch-template-input')?.addEventListener('input', updateBatchPreview);
    document.getElementById('batch-start-num')?.addEventListener('input', updateBatchPreview);
    document.getElementById('batch-end-num')?.addEventListener('input', updateBatchPreview);
    updateBatchPreview();

    document.getElementById('btn-add-batch-queue')?.addEventListener('click', async () => {
      const tpl = document.getElementById('batch-template-input').value;
      const start = parseInt(document.getElementById('batch-start-num').value, 10) || 1;
      const end = parseInt(document.getElementById('batch-end-num').value, 10) || 5;

      const urls = [];
      for (let i = start; i <= end; i++) {
        const numStr = String(i).padStart(2, '0');
        urls.push(tpl.replace(/\[01-\d+\]|\[\*\]/, numStr));
      }

      closeModal('modal-batch');
      await fetch(`${API_BASE}/api/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
      });
      fetchTasks();
    });

    // S11 Site Spider Crawl
    document.getElementById('btn-spider-crawl')?.addEventListener('click', async () => {
      const startUrl = document.getElementById('spider-start-url').value;
      const res = await fetch(`${API_BASE}/api/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: startUrl })
      });
      const data = await res.json();
      const tree = document.getElementById('spider-results-tree');
      document.getElementById('spider-found-count').textContent = data.discovered.length;

      tree.innerHTML = data.discovered.map(item => `
        <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--color-border);">
          <span>${item.filename} (${item.type})</span>
          <span style="font-family: var(--font-mono); color: var(--color-accent);">${formatBytes(item.size)}</span>
        </div>
      `).join('');
    });

    document.getElementById('btn-spider-download-all')?.addEventListener('click', async () => {
      const startUrl = document.getElementById('spider-start-url').value;
      closeModal('modal-site-grabber');
      await fetch(`${API_BASE}/api/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: [
            `${startUrl}/assets/logo.png`,
            `${startUrl}/assets/banner.jpg`,
            `${startUrl}/media/promo.mp4`
          ]
        })
      });
      fetchTasks();
    });

    // S12 Speed Limiter Slider
    const slider = document.getElementById('speed-limit-slider');
    const sliderLabel = document.getElementById('speed-limit-slider-label');
    slider?.addEventListener('input', () => {
      sliderLabel.textContent = `${slider.value} KB/s`;
    });

    document.getElementById('btn-save-speed-limiter')?.addEventListener('click', async () => {
      const enabled = document.getElementById('speed-limiter-active-check').checked;
      const val = parseInt(slider.value, 10) * 1024;
      await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speedLimitEnabled: enabled, speedLimitBytesPerSec: val })
      });
      closeModal('modal-speed-limiter');
      fetchSettings();
    });

    // S06 Options tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.tab);
        if (target) target.style.display = 'block';
      });
    });

    // Search input
    document.getElementById('search-input')?.addEventListener('input', () => {
      renderTable();
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openModal('modal-add-url');
      }
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        currentTrackingTaskId = null;
      }
    });
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    fetchTasks();
    fetchSettings();
    connectWebSocket();
    setInterval(fetchTasks, 3000);
  });
})();
