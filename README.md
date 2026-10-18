# ⚡ Veloxis Download Accelerator

> A modern, high-performance, multi-threaded download accelerator and universal media grabber — built from the ground up as a fast, beautiful, and open-source **Internet Download Manager (IDM) alternative**.

[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Manifest V3](https://img.shields.io/badge/extension-Manifest%20V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](LICENSE)
[![Build Status](https://img.shields.io/badge/tests-passing-emerald.svg)](#testing)

---

## 🌟 Why Veloxis?

For decades, **Internet Download Manager (IDM)** has been the benchmark for high-speed segmented downloads. However, it is closed-source, requires paid licensing, sports a dated Windows 98-era UI, and struggles with modern streaming architectures (Shadow DOM, Cloudflare bot challenges, dynamic iframe players, and fragmented HLS streams).

**Veloxis** reimagines what a download manager should be in 2026:
- 🚀 **8x–16x Download Speeds**: Dynamic multi-part chunking with HTTP Range requests.
- 🎨 **Sleek Cyberpunk Dashboard**: Modern dark-mode UI with live WebSocket speedometers and transfer rate telemetry.
- ⚡ **Universal Browser Media Grabber**: A floating download pill that detects video streams across YouTube, anime platforms (`an!koto`, `MegaPlay`), Twitch, Twitter/X, Reddit, TikTok, and Vimeo.
- 🛡️ **Cloudflare & Anti-Bot Bypass**: Native browser TLS fingerprint impersonation (`curl_cffi` Chrome JA3/JA4 handshakes) to conquer protected media CDNs.
- 🔄 **Autonomous HLS (.m3u8) & DASH (.mpd) Stitching**: Multi-threaded fragment fetching (`-N 8`) and lossless audio/video remuxing into single `.mp4` files via FFmpeg.
- 💸 **100% Free & Open Source**: No trial expiration, no popups, no registration keys.

---

## 📸 Key Features & Capabilities

### 1. Dynamic Multi-Part Segmentation
Files are split into up to **8 concurrent byte-range segments**. Each segment downloads asynchronously with independent reconnection and backpressure throttling. Upon completion, fragments are seamlessly reassembled on disk and verified with SHA-256 checksums.

### 2. Universal In-Browser Media Grabber
The Veloxis Manifest V3 browser extension injects into both top-level web pages and embedded player iframes (`all_frames: true`):
- **Shadow DOM Traversal**: Scans through custom web components and open shadow roots to locate hidden player elements.
- **Network-Level Sniffing**: Passively listens for media requests (`.m3u8`, `.mpd`, `.mp4`, `.webm`, `video/*`).
- **Dynamic Token Refresh**: Keeps streaming tokens fresh in real-time, preventing `403 Forbidden` errors on time-sensitive links.

### 3. YouTube & Social Media Engine
- Extract and download videos in **1080p Full HD, 720p HD, 480p, 360p**, or extract audio in **M4A / MP3**.
- Merges separate 1080p adaptive video and high-bitrate audio streams into a single playable MP4 file using FFmpeg.

### 4. Smart Organization & Queue Scheduler
- Automatic file categorization into **Video**, **Compressed**, **Music**, **Documents**, and **Programs**.
- Queue management: Schedule overnight downloads, pause/resume tasks, and set global speed limits.

---

## 📊 Veloxis vs. Traditional IDM

| Feature | Veloxis Accelerator | Internet Download Manager (IDM) |
| :--- | :---: | :---: |
| **Pricing / License** | **100% Free & Open Source (MIT)** | \$24.95 Paid License / 30-Day Trial |
| **User Interface** | Modern Cyberpunk Glassmorphism WebUI | Legacy Windows 98/XP GUI |
| **Browser Extension** | Manifest V3 (Chrome, Edge, Brave, Opera) | Legacy Extension |
| **Cross-Platform Ready** | Yes (Node.js engine runs anywhere) | Windows only |
| **HLS / DASH Streams** | 8-fragment parallel downloading + MP4 remux | Basic single-stream capture |
| **Cloudflare TLS Bypass** | Native Chrome TLS impersonation (`curl_cffi`) | Fails or requires manual headers |
| **Real-time Telemetry** | High-framerate WebSocket (100ms updates) | Basic polling timer |

---

## 🏗️ Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│               Chrome / Edge / Chromium Browser         │
│  ┌───────────────────────┐  ┌───────────────────────┐  │
│  │  Content Script       │  │  Background Worker    │  │
│  │  - Shadow DOM Scanner │  │  - WebRequest Sniffer │  │
│  │  - Media Grabber Pill │  │  - Stream Cache       │  │
│  └───────────┬───────────┘  └───────────┬───────────┘  │
└──────────────┼──────────────────────────┼──────────────┘
               │ HTTP / JSON API          │
               ▼                          ▼
┌────────────────────────────────────────────────────────┐
│             Veloxis Desktop Daemon (Node.js)           │
│  ┌──────────────────────────────────────────────────┐  │
│  │  HTTP REST API & WebSocket Server (:6789)        │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │                              │
│  ┌──────────────────────┼───────────────────────────┐  │
│  │                      ▼                           │  │
│  │  Download Engine (downloader.js)                 │  │
│  │  - Multipart Range Worker Pool                   │  │
│  │  - Queue Scheduler & Category Router             │  │
│  │  - Storage Persistence (db.json)                 │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │                              │
│  ┌──────────────────────┼───────────────────────────┐  │
│  │                      ▼                           │  │
│  │  Universal Media Stream Resolver                 │  │
│  │  - yt-dlp.exe (Chrome TLS Impersonation)         │  │
│  │  - ffmpeg.exe (Lossless Audio/Video Muxer)       │  │
│  │  - Direct FFmpeg HLS Fallback Engine             │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** (v18.0.0 or higher): [Download Node.js](https://nodejs.org/)
- **Google Chrome**, **Microsoft Edge**, **Brave**, or any Chromium-based browser.

### 2. Installation
Clone the repository:
```bash
git clone https://github.com/rounak1434/Veloxis-Accelerator.git
cd Veloxis-Accelerator
```

Install dependencies:
```bash
npm install
```

### 3. Start the Server
Launch the accelerator server and web dashboard:
```powershell
npm.cmd start
# or on Linux/macOS:
npm start
```

Open your browser and navigate to:
```
http://localhost:6789
```

---

## 🧩 Installing the Browser Extension

1. Open your browser and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top right corner.
3. Click the **Load unpacked** button.
4. Select the `extension/` directory inside this project:
   ```
   C:\Rounak\IDM\extension
   ```
5. The **Veloxis Accelerator Integration** icon will appear in your toolbar.

---

## 🎬 How to Download Media

### Option A: Direct Web Video Grabber (Recommended)
1. Navigate to any video or streaming page (e.g., YouTube, anime portals like `an!koto`, Twitter, Twitch, Reddit, etc.).
2. Play the video.
3. A floating **`⚡ Download Video ▼`** button will appear in the top-right corner of the video player.
4. Click the button and select your desired stream or resolution:
   - **YouTube**: Choose 1080p Full HD, 720p HD, 480p, or Audio Only (MP3/M4A).
   - **Anime / Streaming Sites**: Choose **HLS Stream (M3U8)** for parallel chunk extraction.
   - **Social Media**: Choose **Web Page Video Stream (Auto HD)**.
5. Click **Get** — your download starts instantly in the desktop dashboard.

### Option B: Automatic Browser Download Interception
Any browser download with supported file extensions (`.zip`, `.rar`, `.7z`, `.iso`, `.exe`, `.msi`, `.mp4`, `.mkv`, `.pdf`, `.mp3`) is automatically intercepted and routed to the Veloxis multi-threaded accelerator.

### Option C: Manual URL Addition
1. Open the dashboard at `http://localhost:6789`.
2. Click **+ Add Download** in the sidebar.
3. Paste any direct download link or media URL.
4. Veloxis will automatically probe the headers, detect the file size, and assign the proper category.

---

## 🧪 Testing

Veloxis includes an end-to-end automated test suite covering range chunking, probe resolution, checksum verification, and stream detection:

```powershell
npm.cmd test
```

All 8 core end-to-end test cases and universal stream suites run and verify in under 3 seconds:
```
======================================================
       VELOXIS END-TO-END AUTOMATED TEST SUITE        
======================================================
[RUN] F01-H1: Multipart range download (8 streams) & SHA256 reassembly -> [PASS]
[RUN] F01-E1: Single stream fallback on servers lacking Accept-Ranges   -> [PASS]
[RUN] F02-H1: Manual URL Probe via HEAD                                 -> [PASS]
[RUN] F02-N1: Negative probe on non-existent host                       -> [PASS]
[RUN] F04-H1: Pause active task mid-flight and resume                   -> [PASS]
[RUN] F05-H1: Refresh expired signed URL token and resume               -> [PASS]
[RUN] F06-H1: Batch URL pattern generation and enqueuing                -> [PASS]
[RUN] S12-H1: Speed limiter setting persistence                         -> [PASS]
======================================================
TOTAL CASES: 8 | PASSED: 8 | FAILED: 0
======================================================
```

---

## 📂 Project Structure

```
├── bin/                       # Local yt-dlp and ffmpeg executables
├── data/
│   └── db.json                # Task database and user configuration
├── downloads/                 # Default destination directory for downloaded files
├── extension/                 # Chrome Manifest V3 Browser Extension
│   ├── manifest.json          # Extension permissions & iframe injection rules
│   ├── background.js          # WebRequest sniffer & download interceptor
│   ├── content.js             # Shadow DOM video grabber widget
│   ├── media-grabber.css      # Floating pill & dropdown stylesheet
│   └── popup.html / popup.js  # Toolbar popup status viewer
├── public/                    # Frontend Web Dashboard
│   ├── index.html             # Main dashboard UI
│   ├── landing.html           # Marketing landing page
│   ├── styles.css             # Cyberpunk design system
│   └── app.js                 # Dashboard controller & WebSocket client
├── src/
│   ├── engine/
│   │   ├── downloader.js      # Multi-part chunk download engine
│   │   ├── storage.js         # Persistence & atomic JSON write engine
│   │   ├── queueManager.js    # Task scheduling and concurrency queue
│   │   └── youtubeResolver.js # Stream resolution, Cloudflare bypass, & FFmpeg muxer
│   └── server/
│       └── index.js           # REST API & WebSocket telemetry server (:6789)
├── tests/                     # Automated test suites
└── package.json               # Scripts and dependencies
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — free for personal, educational, and commercial use.
