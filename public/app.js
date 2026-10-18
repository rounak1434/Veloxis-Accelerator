// Nexus Download Accelerator - Interactive Single-Page App
(function() {
  const API_BASE = window.location.origin;
  let tasks = [];
  let categories = [];
  let queues = [];
  let settings = {};
  let currentFilter = 'all';
  let selectedTaskIds = new Set();
  let lastSelectedTaskId = null;
  let activeContextMenuTaskId = null;
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
      if (document.getElementById('opt-speed-limit-val') && settings.speedLimitBytesPerSec) {
        document.getElementById('opt-speed-limit-val').value = Math.round(settings.speedLimitBytesPerSec / 1024);
      }
      if (document.getElementById('opt-max-connections') && settings.maxSegmentsPerDownload) {
        document.getElementById('opt-max-connections').value = String(settings.maxSegmentsPerDownload);
      }
      if (document.getElementById('opt-file-extensions') && settings.interceptExtensions) {
        document.getElementById('opt-file-extensions').value = settings.interceptExtensions.join(' ');
      }
      if (document.getElementById('opt-default-dir') && settings.defaultDownloadDir) {
        document.getElementById('opt-default-dir').value = settings.defaultDownloadDir;
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  }

  function updateSelectionUI() {
    const btnDel = document.getElementById('btn-toolbar-delete');
    if (btnDel) {
      if (selectedTaskIds.size > 0) {
        btnDel.textContent = `🗑 Delete (${selectedTaskIds.size})`;
      } else {
        btnDel.textContent = '🗑 Delete';
      }
    }
  }

  function showContextMenu(e, task) {
    const menu = document.getElementById('task-context-menu');
    if (!menu) return;

    const isOpenable = task && task.status === 'completed';
    const isDownloading = task && task.status === 'downloading';
    const isPaused = task && (task.status === 'paused' || task.status === 'queued' || task.status === 'error');

    const elOpen = document.getElementById('ctx-open');
    const elOpenWith = document.getElementById('ctx-open-with');
    const elOpenFolder = document.getElementById('ctx-open-folder');
    const elResume = document.getElementById('ctx-resume');
    const elStop = document.getElementById('ctx-stop');

    if (elOpen) elOpen.classList.toggle('disabled', !isOpenable);
    if (elOpenWith) elOpenWith.classList.toggle('disabled', !isOpenable);
    if (elOpenFolder) elOpenFolder.classList.toggle('disabled', !task.savePath && !isOpenable);
    if (elResume) elResume.classList.toggle('disabled', !isPaused);
    if (elStop) elStop.classList.toggle('disabled', !isDownloading);

    menu.style.display = 'flex';

    const menuWidth = 210;
    const menuHeight = menu.offsetHeight || 380;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 8;
    }
    if (y + menuHeight > window.innerHeight) {
      y = Math.max(8, window.innerHeight - menuHeight - 8);
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const submenus = menu.querySelectorAll('.context-submenu');
    submenus.forEach(sub => {
      if (x + menuWidth + 180 > window.innerWidth) {
        sub.classList.add('open-left');
      } else {
        sub.classList.remove('open-left');
      }
    });
  }

  function hideContextMenu() {
    const menu = document.getElementById('task-context-menu');
    if (menu) menu.style.display = 'none';
  }

  function openDeleteConfirmModal() {
    if (selectedTaskIds.size === 0) {
      alert('Please select one or more downloads to delete.');
      return;
    }

    const previewEl = document.getElementById('delete-files-preview');
    const msgEl = document.getElementById('delete-confirm-message');
    const chkDisk = document.getElementById('delete-from-disk-checkbox');
    if (chkDisk) chkDisk.checked = false;

    const selectedTasks = tasks.filter(t => selectedTaskIds.has(t.id));
    if (msgEl) {
      msgEl.textContent = selectedTaskIds.size === 1
        ? 'Are you sure you want to remove the selected download?'
        : `Are you sure you want to remove the selected ${selectedTaskIds.size} downloads?`;
    }

    if (previewEl) {
      previewEl.innerHTML = selectedTasks.map(t => `<div style="padding: 2px 0;">• ${t.fileName}</div>`).join('');
    }

    openModal('modal-delete-confirm');
  }

  function openRenameModal(taskId) {
    const targetId = taskId || Array.from(selectedTaskIds)[0];
    if (!targetId) {
      alert('Please select a download to rename.');
      return;
    }
    const task = tasks.find(t => t.id === targetId);
    if (!task) return;

    activeContextMenuTaskId = targetId;
    document.getElementById('rename-input-filename').value = task.fileName;
    document.getElementById('rename-input-folder').value = task.saveDir || settings.defaultDownloadDir || 'Downloads';
    openModal('modal-rename');
  }

  function renderTable() {
    const tbody = document.getElementById('tasks-tbody');
    const emptyState = document.getElementById('empty-state');
    if (!tbody) return;

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
      tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    } else {
      if (emptyState) emptyState.style.display = 'none';
    }

    // Check if the current DOM rows match filtered task IDs exactly
    const existingRowIds = Array.from(tbody.querySelectorAll('tr')).map(r => r.id.replace('row-', ''));
    const isSameStructure = existingRowIds.length === filtered.length && existingRowIds.every((id, idx) => id === filtered[idx].id);

    if (isSameStructure) {
      // In-place update to preserve DOM elements and selection state
      filtered.forEach(task => {
        updateTableRow(task);
        const tr = document.getElementById(`row-${task.id}`);
        const chk = tr?.querySelector('.task-check');
        const isSelected = selectedTaskIds.has(task.id);
        if (tr) tr.classList.toggle('selected', isSelected);
        if (chk) chk.checked = isSelected;
      });
      updateSelectionUI();
      return;
    }

    tbody.innerHTML = '';

    filtered.forEach(task => {
      const tr = document.createElement('tr');
      tr.id = `row-${task.id}`;
      const isSelected = selectedTaskIds.has(task.id);
      if (isSelected) tr.classList.add('selected');

      const percent = task.fileSize > 0 ? Math.min(100, Math.round((task.downloadedBytes / task.fileSize) * 100)) : 0;
      const typeClass = getCategoryTypeClass(task.categoryId);

      tr.innerHTML = `
        <td><input type="checkbox" class="task-check" data-id="${task.id}" ${isSelected ? 'checked' : ''}></td>
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

      const chk = tr.querySelector('.task-check');
      chk?.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      chk?.addEventListener('change', (e) => {
        e.stopPropagation();
        if (chk.checked) {
          selectedTaskIds.add(task.id);
          tr.classList.add('selected');
        } else {
          selectedTaskIds.delete(task.id);
          tr.classList.remove('selected');
        }
        lastSelectedTaskId = task.id;
        updateSelectionUI();
      });

      tr.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        if (e.target.tagName === 'INPUT') return;

        if (e.ctrlKey || e.metaKey) {
          if (selectedTaskIds.has(task.id)) {
            selectedTaskIds.delete(task.id);
            tr.classList.remove('selected');
            if (chk) chk.checked = false;
          } else {
            selectedTaskIds.add(task.id);
            tr.classList.add('selected');
            if (chk) chk.checked = true;
          }
        } else if (e.shiftKey && lastSelectedTaskId) {
          const ids = filtered.map(t => t.id);
          const idx1 = ids.indexOf(lastSelectedTaskId);
          const idx2 = ids.indexOf(task.id);
          if (idx1 !== -1 && idx2 !== -1) {
            const start = Math.min(idx1, idx2);
            const end = Math.max(idx1, idx2);
            for (let i = start; i <= end; i++) {
              const tid = ids[i];
              selectedTaskIds.add(tid);
              const r = document.getElementById(`row-${tid}`);
              if (r) {
                r.classList.add('selected');
                const c = r.querySelector('.task-check');
                if (c) c.checked = true;
              }
            }
          }
        } else {
          selectedTaskIds.clear();
          document.querySelectorAll('#tasks-tbody tr.selected').forEach(r => r.classList.remove('selected'));
          document.querySelectorAll('#tasks-tbody .task-check').forEach(c => c.checked = false);

          selectedTaskIds.add(task.id);
          tr.classList.add('selected');
          if (chk) chk.checked = true;
        }
        lastSelectedTaskId = task.id;
        updateSelectionUI();
      });

      tr.addEventListener('dblclick', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        const dblAction = localStorage.getItem('dblClickAction') || 'open';
        if (dblAction === 'open' && task.status === 'completed') {
          window.nexusApp.openFile(task.id, false);
        } else {
          window.nexusApp.showProgressModal(task.id);
        }
      });

      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedTaskIds.has(task.id)) {
          selectedTaskIds.clear();
          document.querySelectorAll('#tasks-tbody tr.selected').forEach(r => r.classList.remove('selected'));
          document.querySelectorAll('#tasks-tbody .task-check').forEach(c => c.checked = false);
          selectedTaskIds.add(task.id);
          tr.classList.add('selected');
          if (chk) chk.checked = true;
          lastSelectedTaskId = task.id;
          updateSelectionUI();
        }
        activeContextMenuTaskId = task.id;
        showContextMenu(e, task);
      });

      tbody.appendChild(tr);
    });

    updateSelectionUI();
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

    async redownloadTask(id) {
      await fetch(`${API_BASE}/api/tasks/${id}/redownload`, { method: 'POST' });
      fetchTasks();
    },

    async openFile(id, isFolder = false) {
      await fetch(`${API_BASE}/api/open-file/${id}?folder=${isFolder}`, { method: 'POST' });
    },

    async openFileWith(id) {
      await fetch(`${API_BASE}/api/open-file/${id}?openWith=true`, { method: 'POST' });
    },

    async setTaskQueue(id, queueId) {
      await fetch(`${API_BASE}/api/tasks/${id}/set-queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId })
      });
      fetchTasks();
    },

    async renameTask(id, newFileName) {
      const res = await fetch(`${API_BASE}/api/tasks/${id}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newFileName })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      fetchTasks();
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

    // Toolbar selection actions
    document.getElementById('btn-toolbar-resume')?.addEventListener('click', async () => {
      if (selectedTaskIds.size === 0) return alert('Please select one or more downloads to resume.');
      for (const id of selectedTaskIds) {
        await window.nexusApp.startTask(id);
      }
    });

    document.getElementById('btn-toolbar-pause')?.addEventListener('click', async () => {
      if (selectedTaskIds.size === 0) return alert('Please select one or more downloads to pause.');
      for (const id of selectedTaskIds) {
        await window.nexusApp.pauseTask(id);
      }
    });

    document.getElementById('btn-toolbar-pause-all')?.addEventListener('click', async () => {
      for (const task of tasks.filter(t => t.status === 'downloading')) {
        await window.nexusApp.pauseTask(task.id);
      }
    });

    // Toolbar Delete button
    document.getElementById('btn-toolbar-delete')?.addEventListener('click', () => {
      openDeleteConfirmModal();
    });

    // Table Header Select-All Checkbox
    document.querySelector('thead input[type="checkbox"]')?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      document.querySelectorAll('#tasks-tbody .task-check').forEach(chk => {
        chk.checked = checked;
        const id = chk.dataset.id;
        const row = document.getElementById(`row-${id}`);
        if (checked) {
          selectedTaskIds.add(id);
          row?.classList.add('selected');
        } else {
          selectedTaskIds.delete(id);
          row?.classList.remove('selected');
        }
      });
      updateSelectionUI();
    });

    document.getElementById('btn-speed-limiter-toggle')?.addEventListener('click', () => {
      openModal('modal-speed-limiter');
    });

    // Listen for YouTube URL pasted into Add Address
    document.getElementById('add-url-input')?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      const isYT = val.includes('youtube.com') || val.includes('youtu.be');
      const qualityGrp = document.getElementById('add-quality-group');
      if (qualityGrp) qualityGrp.style.display = isYT ? 'block' : 'none';
      if (isYT) {
        const catSelect = document.getElementById('add-category-select');
        if (catSelect) catSelect.value = 'cat-vid';
      }
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
        document.getElementById('info-size').textContent = info.fileSize > 0 ? formatBytes(info.fileSize) : (info.isYouTube ? 'Adaptive Stream' : 'Calculating...');
        document.getElementById('info-resumable').textContent = info.resumable ? 'Yes (Multipart Range Supported)' : 'Single Connection Stream';
        document.getElementById('info-resumable').className = `status-chip ${info.resumable ? 'status-completed' : 'status-paused'}`;

        if (info.isYouTube && info.qualities && info.qualities.length > 0) {
          const qGroup = document.getElementById('info-quality-group');
          const qSelect = document.getElementById('info-quality-select');
          if (qSelect && qGroup) {
            qSelect.innerHTML = info.qualities.map(q => `<option value="${q.formatId}">${q.label} • ${(q.ext || 'mp4').toUpperCase()}</option>`).join('');
            qGroup.style.display = 'block';
          }
        } else {
          const qGroup = document.getElementById('info-quality-group');
          if (qGroup) qGroup.style.display = 'none';
        }

        openModal('modal-file-info');
      } catch (err) {
        alert('Failed to probe: ' + err.message);
      }
    });

    document.getElementById('btn-confirm-add-url')?.addEventListener('click', async () => {
      const url = document.getElementById('add-url-input').value.trim();
      const referrer = document.getElementById('add-referrer-input').value.trim();
      const categoryId = document.getElementById('add-category-select').value;
      const isYT = url.includes('youtube.com') || url.includes('youtu.be');
      const formatId = (isYT && document.getElementById('add-quality-group')?.style.display !== 'none')
        ? document.getElementById('add-quality-select')?.value
        : null;

      if (!url) return;

      closeModal('modal-add-url');
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, referrer, categoryId, formatId, isYouTube: isYT, immediate: true })
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
      const isYT = url.includes('youtube.com') || url.includes('youtu.be');
      const formatId = (isYT && document.getElementById('info-quality-group')?.style.display !== 'none')
        ? document.getElementById('info-quality-select')?.value
        : null;

      closeModal('modal-file-info');
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, fileName, queueId, formatId, isYouTube: isYT, immediate: true })
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

    // S06 Save Settings button
    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
      const maxSegments = parseInt(document.getElementById('opt-max-connections')?.value || '8', 10);
      const speedLimitKb = parseInt(document.getElementById('opt-speed-limit-val')?.value || '500', 10);
      const extensions = (document.getElementById('opt-file-extensions')?.value || '').split(/[\s,]+/).filter(Boolean);
      const defaultDir = document.getElementById('opt-default-dir')?.value?.trim();

      await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxSegmentsPerDownload: maxSegments,
          speedLimitBytesPerSec: speedLimitKb * 1024,
          interceptExtensions: extensions.length > 0 ? extensions : undefined,
          defaultDownloadDir: defaultDir || undefined
        })
      });
      closeModal('modal-options');
      fetchSettings();
    });

    // Exit Background Application
    document.getElementById('btn-shutdown-engine')?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to stop the Veloxis background engine and exit?')) {
        try {
          await fetch(`${API_BASE}/api/shutdown`, { method: 'POST' });
        } catch (_) {}
        window.close();
      }
    });

    // Search input
    document.getElementById('search-input')?.addEventListener('input', () => {
      renderTable();
    });

    // Context Menu Action Handlers
    document.getElementById('ctx-open')?.addEventListener('click', () => {
      if (activeContextMenuTaskId) window.nexusApp.openFile(activeContextMenuTaskId, false);
      hideContextMenu();
    });

    document.getElementById('ctx-open-with')?.addEventListener('click', () => {
      if (activeContextMenuTaskId) window.nexusApp.openFileWith(activeContextMenuTaskId);
      hideContextMenu();
    });

    document.getElementById('ctx-open-folder')?.addEventListener('click', () => {
      if (activeContextMenuTaskId) window.nexusApp.openFile(activeContextMenuTaskId, true);
      hideContextMenu();
    });

    document.getElementById('ctx-rename')?.addEventListener('click', () => {
      hideContextMenu();
      openRenameModal(activeContextMenuTaskId);
    });

    document.getElementById('ctx-redownload')?.addEventListener('click', () => {
      if (activeContextMenuTaskId) window.nexusApp.redownloadTask(activeContextMenuTaskId);
      hideContextMenu();
    });

    document.getElementById('ctx-resume')?.addEventListener('click', async () => {
      const ids = selectedTaskIds.size > 0 ? Array.from(selectedTaskIds) : [activeContextMenuTaskId];
      for (const id of ids) {
        if (id) await window.nexusApp.startTask(id);
      }
      hideContextMenu();
    });

    document.getElementById('ctx-stop')?.addEventListener('click', async () => {
      const ids = selectedTaskIds.size > 0 ? Array.from(selectedTaskIds) : [activeContextMenuTaskId];
      for (const id of ids) {
        if (id) await window.nexusApp.pauseTask(id);
      }
      hideContextMenu();
    });

    document.getElementById('ctx-refresh')?.addEventListener('click', () => {
      hideContextMenu();
      if (!activeContextMenuTaskId) return;
      const task = tasks.find(t => t.id === activeContextMenuTaskId);
      if (!task) return;
      currentTrackingTaskId = activeContextMenuTaskId;
      document.getElementById('refresh-old-url').value = task.url;
      document.getElementById('refresh-new-url').value = '';
      openModal('modal-refresh-url');
    });

    document.getElementById('ctx-remove')?.addEventListener('click', () => {
      hideContextMenu();
      openDeleteConfirmModal();
    });

    document.getElementById('ctx-queue-sublist')?.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', async () => {
        const queueId = item.dataset.queue;
        const ids = selectedTaskIds.size > 0 ? Array.from(selectedTaskIds) : [activeContextMenuTaskId];
        for (const id of ids) {
          if (id) await window.nexusApp.setTaskQueue(id, queueId);
        }
        hideContextMenu();
      });
    });

    document.getElementById('ctx-del-from-queue')?.addEventListener('click', async () => {
      const ids = selectedTaskIds.size > 0 ? Array.from(selectedTaskIds) : [activeContextMenuTaskId];
      for (const id of ids) {
        if (id) await window.nexusApp.setTaskQueue(id, null);
      }
      hideContextMenu();
    });

    document.getElementById('ctx-double-click-opt')?.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.dblAction;
        if (action) localStorage.setItem('dblClickAction', action);
        hideContextMenu();
      });
    });

    document.getElementById('ctx-properties')?.addEventListener('click', () => {
      hideContextMenu();
      if (activeContextMenuTaskId) window.nexusApp.showProgressModal(activeContextMenuTaskId);
    });

    // Dismiss context menu on click outside, scroll or resize
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#task-context-menu')) {
        hideContextMenu();
      }
    });

    window.addEventListener('resize', hideContextMenu);
    window.addEventListener('scroll', hideContextMenu, true);

    // Delete Confirmation modal confirm button
    document.getElementById('btn-confirm-delete')?.addEventListener('click', async () => {
      const deleteFile = document.getElementById('delete-from-disk-checkbox')?.checked === true;
      const ids = Array.from(selectedTaskIds);
      if (ids.length === 0) return;

      closeModal('modal-delete-confirm');
      await fetch(`${API_BASE}/api/tasks/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: ids, deleteFile })
      });
      selectedTaskIds.clear();
      updateSelectionUI();
      fetchTasks();
    });

    // Rename modal submit button
    document.getElementById('btn-submit-rename')?.addEventListener('click', async () => {
      const newName = document.getElementById('rename-input-filename').value.trim();
      if (!newName || !activeContextMenuTaskId) return;

      closeModal('modal-rename');
      await window.nexusApp.renameTask(activeContextMenuTaskId, newName);
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openModal('modal-add-url');
      }
      if (e.key === 'Delete') {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        if (selectedTaskIds.size > 0) {
          e.preventDefault();
          openDeleteConfirmModal();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
        if (selectedTaskIds.size > 0) {
          e.preventDefault();
          openRenameModal();
        }
      }
      if (e.key === 'Escape') {
        hideContextMenu();
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
