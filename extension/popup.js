const DAEMON_URL = 'http://localhost:6789';

async function checkStatus() {
  const badge = document.getElementById('conn-status');
  try {
    const res = await fetch(`${DAEMON_URL}/api/tasks`, { method: 'GET' });
    if (res.ok) {
      badge.textContent = 'Connected (Port 6789)';
      badge.className = 'status-badge status-connected';
    } else {
      throw new Error();
    }
  } catch (_) {
    badge.textContent = 'Disconnected';
    badge.className = 'status-badge status-disconnected';
  }
}

document.getElementById('btn-open-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: DAEMON_URL });
});

checkStatus();
