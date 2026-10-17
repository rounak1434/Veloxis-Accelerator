# Architecture: Nexus Download Accelerator (Modern IDM Rebuild)

## Stack

| layer | choice | why |
| --- | --- | --- |
| desktop shell | Node.js + Electron / Fastify + Vite SPA | Ultra-fast native IO, zero lag, cross-platform (Win/Mac/Linux) |
| frontend | TypeScript + React + Tailwind Tokens | Clean component hierarchy, fast virtualized list, responsive 390px to 1440px |
| engine | Native Node.js `undici` / `http` stream with worker pools | Raw async streaming with dynamic HTTP Range chunking & sparse file writing |
| database | SQLite (via `better-sqlite3` or local JSON/WAL DB) | Zero-config embedded local database, ACID durability, instant queries |
| browser extension | Manifest V3 (Chrome, Edge, Firefox) | Native Messaging Host + declarativeNetRequest + content scripts |
| state management | Zustand / React Context with WebSockets | Real-time 60fps download progress, throughput sparklines, reactive updates |

## Schema

Tables: 6. Access rules: local user SQLite file with schema migrations.

```sql
-- See replica/schema.sql
```

## API (Local Daemon IPC & Native Messaging)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| `POST /api/tasks` | Creates and queues a new download task | Browser Ext / UI | `{ url, referrer, savePath, categoryId, immediate }` | `{ task }` | F01, F02 |
| `GET /api/tasks` | Lists all tasks with pagination & filter | UI Dashboard | `?status=all&category=all` | `{ tasks: [...] }` | F01, F02 |
| `GET /api/tasks/:id` | Detailed task stats & active segments | UI Progress | `{ id }` | `{ task, segments: [...] }` | F01, F04 |
| `POST /api/tasks/:id/pause` | Pauses active chunk streams | UI Dashboard | `{ id }` | `{ success: true }` | F04 |
| `POST /api/tasks/:id/resume` | Resumes chunk streams with Range headers | UI Dashboard | `{ id }` | `{ success: true }` | F04 |
| `DELETE /api/tasks/:id` | Deletes task & optionally removes file | UI Dashboard | `{ id, deleteFile }` | `{ success: true }` | Dashboard |
| `POST /api/tasks/:id/refresh-url` | Updates expired download link URL | UI Recovery | `{ id, newUrl }` | `{ success: true }` | F05 |
| `POST /api/batch` | Queues array of parsed wildcard URLs | UI Batch Wizard | `{ urls: [...], categoryId }` | `{ count }` | F06 |
| `GET /api/queues` | Retrieves queue configurations | UI Scheduler | None | `{ queues: [...] }` | F03 |
| `PUT /api/queues/:id` | Updates schedule time & concurrency | UI Scheduler | `{ startTime, stopTime, maxConcurrent }` | `{ queue }` | F03 |
| `GET /api/system/settings` | Gets global preferences | UI Options | None | `{ settings }` | Settings |
| `PUT /api/system/settings` | Updates speed limits & categories | UI Options | `{ speedLimit, categories }` | `{ settings }` | Settings |

Jobs:
- `QueueSchedulerJob`: Evaluates every 10 seconds against active queue schedules, starts/stops tasks.
- `SpeedThrottlerJob`: Enforces token-bucket rate limiter per chunk stream when limit is active.

## The parts that bite

- **Multipart range fragmentation**: Servers might reset connections if > 8 parallel sockets open to the same IP. Mitigated with auto-sensing socket throttling (default 8, max 32 with backoff).
- **Disk IO contention**: Writing 32 raw streams simultaneously can cause disk thrashing. Mitigated using pre-allocated disk space and 64KB write buffers.
- **Dynamic link expiration**: Signed tokens (AWS S3, Google Drive, Rapidgator) expire in 1-4 hours. Handled by retaining byte offsets and allowing instant URL swap without restarting.

## Build order

1. **Vertical slice**: S01 (Dashboard), S02 (Add URL), S03 (Probe / Confirmation), S04 (Multi-Segment Progress), S05 (Completion) with active range-based chunk download engine.
2. **Must-haves**: S07 (Scheduler & Queues), S06 (Options & Extension configuration), S08 (Browser Media Grabber overlay).
3. **Should-haves**: S09 (Batch / Wildcard Wizard), S10 (Expired URL Refresher), S12 (Speed Limiter).
4. **Could-haves**: S11 (Site Grabber crawler).
