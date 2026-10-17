# Bug Ledger: Veloxis

Severity Definitions:
- **S1**: Data loss, security vulnerability, core transfer loop blocked
- **S2**: Key feature broken with no workaround
- **S3**: Broken feature with workaround, or visible layout glitch
- **S4**: Minor cosmetic imperfection

---

### Resolved Issues During Build & Test Phase

#### BUG-001: Segment Range End-Byte 1-Offset Alignment
- **Severity**: S1
- **Flow / case**: F01-H1 (Multipart Range Download)
- **Screen**: S04 / Engine
- **Steps to reproduce**:
  1. Download a file using 8 dynamic segments.
  2. Inspect end byte of each chunk.
- **Expected**: Segment chunk bounds must strictly end at `startByte + chunkSize - 1` to avoid duplicating bytes across boundary connections.
- **Actual**: Segment bounds initially computed without `-1`, causing duplicated byte at boundary.
- **Fix**: Updated `initializeSegments` in `src/engine/downloader.js` with exact `endByte = start + chunkSize - 1`.
- **Status**: **Fixed** (Verified with SHA256 byte-for-byte check passing in `tests/e2e.test.js`).

#### BUG-002: Remote Probe Hang on Unreachable Host
- **Severity**: S3
- **Flow / case**: F02-N1 (Manual Probe)
- **Screen**: S02 / S03
- **Steps to reproduce**:
  1. Input a dead or unresponsive URL into `POST /api/probe`.
  2. Request waited indefinitely for OS socket timeout.
- **Expected**: Socket should abort within 8 seconds and return a clean HTTP 400 error.
- **Fix**: Added `req.setTimeout(8000)` with `req.destroy(new Error('Connection timeout probing URL'))`.
- **Status**: **Fixed** (Verified in `F02-N1` passing).

#### BUG-003: Brand Identifier in package.json
- **Severity**: S3
- **Flow / case**: Brand Sweep Audit
- **Screen**: Project metadata
- **Steps to reproduce**:
  1. Run `node scripts/sweep.js`.
  2. Found `"name": "idm"` in `package.json`.
- **Expected**: Entire codebase outside `replica/` must be 100% free of target app references.
- **Fix**: Renamed package to `"veloxis"` in `package.json` and synchronized `package-lock.json`.
- **Status**: **Fixed** in commit `5dc22dd`.

---

### Open Bug Summary

| Severity | Open Count | Status |
| :--- | :--- | :--- |
| **S1** | **0** | Clean (Zero blockers) |
| **S2** | **0** | Clean (Zero high-impact defects) |
| **S3** | **0** | Clean (Zero open issues) |
| **S4** | **0** | Clean |
