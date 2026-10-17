# Recon map: Internet Download Manager (Desktop & Browser Extension)

Scope: Core download accelerator engine (dynamic multipart segmentation, queue scheduler, browser extension interception, streaming media grabber, resume & link refresh recovery).
For: Power users, developers, and media collectors seeking an ultra-fast, cross-platform download manager with a contemporary dark/light UX, zero nagware, and open integration.
Date: 2026-10-18

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | Official Features & Tech Overview | https://www.internetdownloadmanager.com/features.html | Explains dynamic segmentation, multipart acceleration, resume capabilities |
| 2 | Browser Integration FAQ | https://www.internetdownloadmanager.com/register/new_faq/bi.html | Extension architecture, web event interception, MIME type handling |
| 3 | Video Grabber Documentation | https://www.internetdownloadmanager.com/register/new_faq/video.html | Floating download panel, stream capture mechanics, video formats |
| 4 | Scheduler & Queues Guide | https://www.internetdownloadmanager.com/support/scheduler.html | Queue sequencing, off-peak timing windows, post-download power triggers |
| 5 | Site Spider / Grabber Docs | https://www.internetdownloadmanager.com/support/grabber.html | Multi-level website crawling, asset filter rules, offline mirroring |
| 6 | Changelog & Version History | https://www.internetdownloadmanager.com/news.html | Recent fixes, browser manifest updates, Windows 11 integration notes |
| 7 | Product Pricing & Packaging | https://secure.internetdownloadmanager.com/buy_idm.html | Commercial licensing model, feature gating, update periods |

## Core loop

Intercepting and accelerating file and media downloads from any web source via multi-connection dynamic segmentation with seamless auto-resuming.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Main Dashboard | App Launch / System Tray Double-Click | Central management hub for all downloads, queues, and categories | Toolbar, Category Sidebar Tree, Virtualized Download Table, Status Bar | empty, filled, searching/filtered, multi-selected |
| S02 | Add URL Modal | Dashboard Toolbar -> "Add URL" (`Ctrl+N`) | Manually add a direct download URL with custom referrer and credentials | URL Input, Referrer Input, Credentials Expander, Browse Path Picker, Action Buttons | empty, validating, filled, error (invalid URL) |
| S03 | Download File Info Modal | Intercepted from browser OR "Add URL" -> "OK" | Pre-download confirmation displaying probed size, destination, and immediate vs. queue choice | File Header Card, Category Auto-Dropdown, Save Path Selector, Description Box, Start/Queue Buttons | loading (probing HEAD), filled, unresolvable size, error (403/404) |
| S04 | Active Download Progress Dialog | Triggered on download start (or click active task) | Live visual status of transfer rate, time left, and multi-segment connection chunks | File Summary, Transfer Stats Grid, Per-Segment Progress Visualizer, Speed Limiter Toggle, Pause/Cancel Buttons | connecting, actively downloading, throttling, paused, reconnecting |
| S05 | Download Complete Dialog | Automatically shown when all segments merge | Instant action prompt upon successful file completion | File Icon/Name Display, Open File Button, Open Folder Button, Checksum Details, Close Button | completed, error (post-processing failure), scanning (antivirus) |
| S06 | Global Options & Preferences | Dashboard Toolbar -> "Options" | Configuration for network, file types, default folders, and extensions | Tabbed Container, Extension List Editor, Directory Mapping Table, Connection Slider, Antivirus Picker | default, modified, dirty/saving |
| S07 | Scheduler & Queue Manager | Dashboard Toolbar -> "Scheduler" | Manage download queues, time-based triggers, and concurrency limits | Queue Selector Sidebar, Schedule Time Grid, Concurrency Counter, Post-Download Action Dropdown, Reorderable Task List | empty queue, scheduled, active queue, completed |
| S08 | In-Browser Media Grabber Panel | Injected floating badge on web video/audio playback | One-click stream detection and quality extraction on web pages | Floating Pill Anchor, Quality Dropdown Menu (1080p, 720p, audio-only), Stream Format Tags | hidden, appearing, expanded dropdown, downloading |
| S09 | Batch / Pattern Download Wizard | Dashboard Menu -> Tasks -> "Add Batch Download" | Generate and queue batches of sequential links (e.g. `img[01-50].jpg`) | Pattern Input Field, Wildcard Config (numeric/alpha), Range Bounds, Match Preview Table | empty, valid pattern preview, invalid syntax |
| S10 | Expired Link Refresh Modal | Right-click broken/expired task -> "Refresh Download Address" | Re-captures expired signed URLs (e.g., file hosts, cloud storage) without losing completed bytes | Step Instructions, Open Web Page Button, Waiting for Capture Spinner, URL Comparison Diff, Resume Button | waiting for navigation, token captured, token mismatch error |
| S11 | Site Grabber / Spider Wizard | Dashboard Menu -> Tasks -> "Run Site Grabber" | Multi-step wizard to crawl a website and batch-download filtered media assets | Wizard Step Bar, Domain Scope Options, Depth Level Slider, File Type Checklist, Discovered Asset Tree | step 1-4 configuration, crawling/discovering, downloading batch |
| S12 | Speed Limiter Config Dialog | Dashboard Menu -> Downloads -> "Speed Limiter" -> "Settings" | Configure maximum download throughput to prevent bandwidth hogging | Enable Checkbox, Max Speed Input (KB/s or MB/s), Apply Globally / Per Task Toggle | enabled, disabled |

## Flows

```
F01 Browser Extension Auto-Interception & Multi-Segment Download (Happy Path)
    Browser link click -> Extension detects downloadable MIME/extension -> S03 Download File Info -> S04 Active Download Progress -> S05 Download Complete -> Open Folder
    happy path clicks: 2 (Click link in browser -> Click "Start Download" on S03)
    edge: Server rejects HTTP Range requests (falls back to single-stream download); server limits concurrent connections to 1 IP (reduces active segments); connection resets mid-flight (auto-reconnects with exponential backoff).

F02 Manual URL Addition
    S01 Dashboard -> Click "Add URL" -> S02 Modal opens -> Paste URL -> S03 File Info probes server -> S04 Active Download -> S05 Download Complete
    happy path clicks: 4
    edge: URL requires HTTP Basic/Bearer auth (credentials prompted); URL returns HTTP redirect loop (capped at 10 hops).

F03 Off-Peak Scheduled Queue Download
    S01 Dashboard -> Select multiple tasks -> Context Menu "Add to Queue" -> S07 Scheduler -> Set Start Time 02:00 AM, Stop Time 06:00 AM -> Set Concurrency Limit 2 -> Check "Turn off computer when done" -> Save
    happy path clicks: 6
    edge: System goes into sleep mode before scheduled time (wake timer support required); network connection unavailable at start time (retries every 60s).

F04 Resuming Interrupted / Broken Download
    S01 Dashboard -> Select paused/interrupted task -> Click "Resume" Toolbar Button -> Engine sends Range: bytes=X- request -> Server responds HTTP 206 Partial Content -> S04 Progress opens -> Merges remainder
    happy path clicks: 1
    edge: Remote file changed on server (ETag or Last-Modified mismatch; prompts user whether to restart from byte 0 or overwrite).

F05 Refreshing Expired Session Download URL
    S01 Dashboard -> Resume fails with HTTP 403 Forbidden or 410 Gone -> Click "Refresh Address" -> S10 Modal opens -> Browser navigates to source page -> User re-authenticates / clicks download -> Extension intercepts new URL -> S10 confirms updated address -> Download resumes with existing chunk data
    happy path clicks: 4
    edge: User navigates to a different file on the page (checksum/size mismatch validation warns user).

F06 Batch Download via Pattern Generator
    S01 Dashboard -> "Add Batch Download" -> S09 Wizard -> Enter URL template with wildcard: `https://example.com/archive/data_[01-20].zip` -> Preview generates 20 URLs -> Select All -> Add to Main Queue -> S01
    happy path clicks: 5
    edge: Some sequence numbers return 404 (flagged individually in queue without aborting whole batch).

F07 In-Browser Video/Audio Stream Grab
    User plays video on web page -> S08 Floating Grabber appears above player -> User clicks grabber -> Dropdown lists parsed qualities (e.g., 1080p MP4, 720p WebM, 128kbps AAC) -> Select 1080p -> S03 Dialog -> S04 Download Progress
    happy path clicks: 3
    edge: Stream is segmented HLS/DASH (m3u8 manifest; engine fetches and stitches TS/M4S chunks via ffmpeg or native remuxer); DRM-encrypted stream (gracefully displays "Protected stream cannot be downloaded").
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger, icon-only | default, hover, active, focus, disabled, loading | all screens |
| Table (Virtualized) | download list, segment list, batch preview | default, sorting, row-hover, single-selected, multi-selected | S01, S04, S07, S09, S11 |
| TreeView | category nav, site crawl structure | expanded, collapsed, item-selected, item-hover | S01, S11 |
| SegmentProgressBar | multi-chunk segmented bar, single progress bar | active-byte chunks (striped color), completed, paused, error | S01, S04 |
| ModalDialog | fixed-size alert, resizable settings, multi-step wizard | closed, entering, active, exiting | S02, S03, S05, S06, S07, S09, S10, S11, S12 |
| FloatingGrabberPill | compact icon, expanded with text, dropdown active | idle, hover, pulsing (new media detected), expanded, disabled | S08 |
| TabPanel | horizontal navigation tabs | active tab, inactive tab, hover | S04, S06, S07 |
| SpeedGauge | textual throughput gauge, graphical sparkline | active transfer, throttled, stalled | S01, S04, S12 |
| StatusBadge | status chip (Downloading, Paused, Complete, Error, Queued) | normal, warning, success, error, neutral | S01, S07 |
| ToastNotification | bottom-right system alert / desktop notification | slide-in, visible, slide-out, dismissed | system tray / desktop |

## Inferred data model

```
DownloadTask
  id (uuid), url (string), original_url (string), referrer_url (string),
  file_name (string), file_size (bigint), downloaded_bytes (bigint),
  save_path (string), temp_dir (string), category_id (uuid),
  status (enum: queued, connecting, downloading, paused, completed, error),
  etag (string), last_modified (string), allows_range (boolean),
  chunk_count (integer), speed_limit_bps (integer),
  created_at (timestamp), completed_at (timestamp), error_message (string)
  evidence: S01 table columns, S03 file info, S04 transfer stats
  confidence: high

DownloadSegment
  id (uuid), task_id (uuid), segment_index (integer),
  start_byte (bigint), end_byte (bigint), current_byte (bigint),
  temp_file_name (string), status (enum: waiting, downloading, completed, failed)
  evidence: S04 segment progress bars, IDM multi-part tech whitepaper
  confidence: high

DownloadQueue
  id (uuid), name (string), is_scheduled (boolean),
  start_time (time), stop_time (time), days_of_week (integer[]),
  max_concurrent_tasks (integer), on_complete_action (enum: none, exit, sleep, shutdown)
  evidence: S07 Scheduler dialog
  confidence: high

Category
  id (uuid), name (string), target_folder (string), file_extensions (string[])
  evidence: S01 Sidebar categories, S06 Save To settings
  confidence: high

SiteCredential
  id (uuid), domain_pattern (string), auth_type (enum: basic, digest, bearer, cookie),
  username (string), encrypted_secret (string)
  evidence: S02 Add URL credentials, S06 Site Logins tab
  confidence: high

BrowserRule
  id (uuid), extension_match (string[]), excluded_domains (string[]),
  min_file_size_bytes (bigint), intercept_clicks (boolean)
  evidence: S06 File Types & General tabs
  confidence: high
```

Relationships:
- `Category` 1-n `DownloadTask`
- `DownloadQueue` 1-n `DownloadTask`
- `DownloadTask` 1-n `DownloadSegment`
- `SiteCredential` 1-n `DownloadTask` (matched by domain)

## Feature matrix

See [`features.csv`](file:///c:/Rounak/IDM/replica/features.csv).
- **Must**: 15 (Core multipart engine, range requests, native messaging host, media grabber, queue, dashboard)
- **Should**: 11 (Speed limiter, address refresh recovery, batch patterns, dark theme, clipboard monitor, antivirus integration)
- **Could**: 4 (ZIP preview via range probe, audio extraction, site spider, checksum hashing)
- **Skip**: 2 (Legacy dial-up modem auto-dialer, proprietary activation key DRM)
- **Total evaluated**: 32

## Out of scope (cannot or should not be cloned)

- **Legacy Windows RAS Dial-Up / VPN Networking**: Windows 98/2000/XP era dial-up modem telephone connection routines are obsolete for modern broadband and Wi-Fi networks.
- **Legacy Internet Explorer ActiveX COM Extensions**: Internet Explorer is deprecated; integration focuses on Chromium (Chrome/Edge/Brave/Opera) and Gecko (Firefox) WebExtensions via Native Messaging Host.
- **Proprietary Tonec Serial Key & DRM Infrastructure**: The replica uses a clean-room design with modern open-source licensing or custom developer licensing.

## Size

Screens: 12, Flows: 7, Entities: 6.
Hard parts:
1. Dynamic segmented range chunk streaming with concurrent IO buffer write & zero-data-loss sparse file assembly.
2. Cross-browser Native Messaging Host bidirectional IPC with secure extension handshake.
3. Media grabber web inspection: sniffing video/audio streaming manifests (HLS `.m3u8`, MPEG-DASH `.mpd`, segmented WebM) and remuxing into single playable containers.

Size: **M** (a few weeks for a dedicated vertical slice).
