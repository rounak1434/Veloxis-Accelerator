# Architecture: Nexus Download Accelerator (a rebuild of Internet Download Manager's core features)

## Stack

| layer | choice | why |
| --- | --- | --- |
| desktop shell | Node.js + Electron / Fastify + Vite SPA | Ultra-fast native IO, zero lag, cross-platform (Windows, macOS, Linux) |
| frontend | TypeScript + React + Tailwind Tokens | Clean component hierarchy, virtualized download table, responsive 390px to 1440px |
| download engine | Node.js native `http`/`https`/`undici` streams | Concurrent HTTP Range request chunking with dynamic thread allocation and zero-copy reassembly |
| database | SQLite (via `better-sqlite3` or local JSON/WAL DB) | Zero-config embedded local storage, ACID durability, instant queries, single file migration |
| browser extension | Manifest V3 (Chrome, Edge, Firefox) | Native Messaging Host + downloads interception + content script media grabber |
| telemetry / IPC | WebSocket server (60fps updates) | Low-overhead push telemetry for per-segment byte progress and live transfer speeds |

## Schema

Tables: 6. Access rules: local user SQLite file with schema migrations and foreign key constraints.

```sql
-- See replica/schema.sql
```

- `download_tasks`: Core download entity storing target URL, filename, file size, status, save location, checksum, and metadata.
- `download_segments`: 1-to-n child records representing discrete byte range slices (`startByte`, `endByte`, `currentByte`, chunk file path).
- `download_queues`: Queue definitions with scheduled time windows (start/stop), concurrency limits, and post-completion triggers.
- `categories`: Automatic classification mapping extensions to folders (Compressed, Documents, Music, Programs, Video).
- `site_credentials`: Secure credential store for Basic/Digest/Bearer authenticated endpoints.
- `settings`: Key-value store for application preferences (thread count, speed limit, clipboard watcher).

## API

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| `POST /api/probe` | Probes remote URL via HTTP `HEAD` / Range to detect size & resumability | UI / Ext | `{ url }` | `{ filename, fileSize, resumable, etag }` | F01, F02 |
| `POST /api/tasks` | Creates, allocates, and optionally starts a download task | UI / Ext | `{ url, referrer, fileName, saveDir, categoryId, queueId, immediate }` | `{ task }` | F01, F02, F07 |
| `GET /api/tasks` | Retrieves all tasks with active speed and filtering | UI Dashboard | `?status=all&category=all` | `{ tasks: [...], categories: [...], queues: [...] }` | F01, F02 |
| `GET /api/tasks/:id` | Returns single task status and segment thread states | UI Progress | `{ id }` | `{ task, segments: [...] }` | F01, F04 |
| `POST /api/tasks/:id/start` | Starts or resumes download segments via `Range` requests | UI / Queue | `{ id }` | `{ success: true, task }` | F01, F04 |
| `POST /api/tasks/:id/pause` | Gracefully closes active chunk sockets and records byte offsets | UI Dashboard | `{ id }` | `{ success: true }` | F04 |
| `DELETE /api/tasks/:id` | Removes task and optionally deletes file from disk | UI Dashboard | `?deleteFile=true` | `{ success: true }` | Dashboard |
| `POST /api/tasks/:id/refresh-url` | Updates expired URL without discarding existing chunk bytes | UI Recovery | `{ id, newUrl }` | `{ success: true, task }` | F05 |
| `POST /api/batch` | Parses and enqueues an array of wildcard/batch URLs | UI Batch Wizard | `{ urls: [...], categoryId, queueId }` | `{ count, tasks: [...] }` | F06 |
| `GET /api/queues` | Lists download queues and schedule parameters | UI Scheduler | None | `{ queues: [...] }` | F03 |
| `PUT /api/queues/:id` | Updates schedule time window and max concurrent tasks | UI Scheduler | `{ startTime, stopTime, daysOfWeek, maxConcurrent }` | `{ queue }` | F03 |
| `POST /api/queues/:id/start` | Forces all paused/queued tasks in queue to start | UI Scheduler | `{ id }` | `{ success: true }` | F03 |
| `POST /api/queues/:id/stop` | Forces all active tasks in queue to pause | UI Scheduler | `{ id }` | `{ success: true }` | F03 |
| `GET /api/settings` | Fetches global application settings | UI Settings | None | `{ settings }` | Settings |
| `PUT /api/settings` | Updates speed limits, extension rules, and folders | UI Settings | `{ speedLimitEnabled, speedLimitBytesPerSec, ... }` | `{ settings }` | Settings |
| `POST /api/open-file/:id` | Opens file or reveals folder in Windows Explorer | UI Complete | `?folder=true` | `{ success: true }` | F01, S05 |
| `POST /api/crawl` | Crawls website and returns discovered asset list | UI Spider | `{ url, depth, filters }` | `{ discovered: [...] }` | S11 |
| `WS /` (WebSocket) | Streams 60fps telemetry (throughput, chunk progress, ETA) | UI Realtime | None | `{ type: "telemetry", totalSpeed, activeTasks }` | S01, S04 |

Webhooks in: None (local standalone desktop application).  
Webhooks out: None.  
Jobs:
- `QueueSchedulerJob` (every 10 seconds): Evaluates current system time against active queue schedules; starts/stops tasks automatically.
- `SpeedThrottlerJob` (real-time stream backpressure): Restricts socket read chunk throughput when bandwidth limit is enabled.

## The parts that bite

- **Multipart range socket fragmentation**: Aggressive parallel socket connections (> 8) to strict CDN endpoints may trigger HTTP 429 Too Many Requests or TCP resets. *Remedy*: Auto-negotiating connection thread pool (default 8, fallback to single stream if server rejects `Range`).
- **Disk write thrashing & chunk reassembly**: Writing 32 raw streams concurrently can bottleneck disk IO. *Remedy*: Writing to isolated chunk files with 64KB OS buffers and streaming sequential reassembly into target destination upon completion.
- **Dynamic signed URL expiration**: Cloud and one-click file hosts issue temporary signed URLs (valid 1-2 hours) that return 403 Forbidden when resuming. *Remedy*: Decoupling target URL from byte progress offset (`refresh-url` endpoint allows instant URL swap without restarting download).
- **Idempotency & byte overlap**: Multiple resumed requests must never duplicate or skip bytes. *Remedy*: Segment tracking uses strict inclusive byte boundaries (`startByte` to `endByte`) persisted to SQLite/JSON storage.

## Build order

1. **Vertical slice**: S01 (Dashboard), S02 (Add URL), S03 (Probe / Confirmation), S04 (Multi-Segment Progress), S05 (Completion) with active multipart range downloader engine and SQLite storage.
2. **Must-haves**: S07 (Scheduler & Queues), S06 (Options & Extension configuration), S08 (Browser Media Grabber overlay).
3. **Should-haves**: S09 (Batch / Wildcard Wizard), S10 (Expired URL Refresher), S12 (Speed Limiter).
4. **Fixes from replica-entrepreneur**: S11 (Site Spider), Modern dark theme design system, zero-bloat UI.
