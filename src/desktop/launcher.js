const path = require('path');
const fs = require('fs');
const http = require('http');
const { exec } = require('child_process');

const PORT = process.env.PORT || 6789;
const DAEMON_URL = `http://localhost:${PORT}`;

function isServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(`${DAEMON_URL}/api/tasks`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function launchAppWindow() {
  const url = DAEMON_URL;
  // Try Microsoft Edge in standalone app mode (borderless, native desktop window)
  const edgeCmd = `start msedge.exe --app="${url}" --window-size=1280,820`;
  const chromeCmd = `start chrome.exe --app="${url}" --window-size=1280,820`;
  const defaultCmd = `start "" "${url}"`;

  exec(edgeCmd, (err) => {
    if (err) {
      exec(chromeCmd, (err2) => {
        if (err2) {
          exec(defaultCmd);
        }
      });
    }
  });
}

async function main() {
  console.log('======================================================');
  console.log('           VELOXIS ACCELERATOR DESKTOP                ');
  console.log('======================================================\n');

  const running = await isServerRunning();
  if (running) {
    console.log(`[Veloxis] Background accelerator already active at ${DAEMON_URL}`);
    console.log('[Veloxis] Launching desktop application window...');
    launchAppWindow();
    return;
  }

  console.log('[Veloxis] Starting download acceleration engine...');
  // Require and start the server
  require('../server/index');

  // Wait for server to be responsive
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 200));
    ready = await isServerRunning();
    if (ready) break;
  }

  if (ready) {
    console.log(`[Veloxis] Engine active on ${DAEMON_URL}`);
    console.log('[Veloxis] Opening desktop application window...');
    launchAppWindow();
    console.log('\n[Ready] Veloxis is running in the background.');
    console.log('[Info]  Browser downloads and stream captures are actively accelerated.');
    console.log('[Exit]  Press Ctrl+C to stop Veloxis.\n');
  } else {
    console.error('[Veloxis] Timed out waiting for server to start.');
  }
}

main().catch(err => {
  console.error('[Veloxis] Launch error:', err);
});
