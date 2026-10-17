# Brand Guide: Veloxis

Nothing in Veloxis uses the original's name, brand colors, trademarks, or visual copy. This document defines the independent identity for the Veloxis download acceleration suite.

---

## Step 1: The Name

### Candidate Pool (20 across 5 styles)
1. **Descriptive**: TurboFetcher, HyperStream, MultiFetch, StreamGrab
2. **Compound**: BitForge, FlowCatch, PackFlow, WarpGet
3. **Invented**: Veloxis, Nexura, Kinetiq, Aethel
4. **Metaphor**: Conduit, Torrential, Cataract, Prism
5. **Verb**: Accelerate, Pluck, Surge, Haul

### Shortlist (Top 5)
1. **Veloxis** (Selected Champion): Derived from Latin *velox* (swift, rapid). Distinct, phonetic, elegant, and completely untethered from any competitor in the utility or download manager space.
2. **WarpGet**: Developer-centric and memorable, referencing terminal utilities and warp-speed transfers.
3. **Conduit**: Clean, robust data pipeline metaphor.
4. **Kinetiq**: Kinetic energy and high-throughput data streams.
5. **PackFlow**: Evokes smooth packet-level orchestration.

---

## Step 2: Screening Checks

Screening checks run for the top candidates:

| Check | Source | Veloxis | WarpGet | Conduit | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| US Trademark | USPTO TESS (Class 9 & 42) | **Pass** (No direct conflicting live marks in Class 9 utility software) | **Pass** | **Conflict** (Multiple existing SaaS & software marks for "Conduit") | Checked 2026-10-18 |
| EU Trademark | EUIPO / TMview | **Pass** (Clear in Class 9 download utilities) | **Pass** | **Conflict** (Prior EU filings in networking) | Checked 2026-10-18 |
| Global | WIPO Global Brand Database | **Pass** (Zero exact matches in computer software) | **Pass** | **Conflict** (High saturation) | Checked 2026-10-18 |
| Domain | ICANN / Whois | `veloxis.app` / `veloxis.dev` available | `warpget.io` available | `conduit.com` premium taken | Suitable TLDs accessible |
| App Store & Play | Search exact name | **Clean** (No competing app under "Veloxis") | **Clean** | **Crowded** | Verified |
| GitHub & Handles | GitHub, X, Discord | `veloxis-app` clear | `warpget` clear | Taken | Verified |

---

## Step 3: Brand Palette

The original app relies on 1990s Windows cyan/blue (`#0055aa`), yellow folders, and bright green globes.
Veloxis uses an **Obsidian Midnight & Royal Electric Indigo** palette with cyber-cyan telemetry accents.

```json
{
  "bg": "#0b0f17",
  "surface": "#121824",
  "surface-raised": "#1a2234",
  "border": "#26334d",
  "border-input": "#64748b",
  "text": "#f3f6fb",
  "text-muted": "#93a4c0",
  "accent": "#4f46e5",
  "on-accent": "#ffffff",
  "accent-hover": "#4338ca",
  "danger": "#f43f5e",
  "success": "#10b981",
  "warning": "#f59e0b",
  "chunk-active": "#06b6d4",
  "chunk-completed": "#4f46e5"
}
```

### Contrast Verification (WCAG AA & AAA)
* `text` on `bg`: **17.71:1** (Passes AAA, threshold 4.5:1)
* `text` on `surface`: **16.40:1** (Passes AAA, threshold 4.5:1)
* `text-muted` on `bg`: **7.59:1** (Passes AAA, threshold 4.5:1)
* `on-accent` on `accent`: **6.29:1** (Passes AA, threshold 4.5:1)
* `accent` on `bg` (UI parts): **3.05:1** (Passes UI, threshold 3.0:1)
* `border-input` on `bg`: **4.03:1** (Passes UI, threshold 3.0:1)
* **Overall result**: 100% compliant with zero AA failures.

---

## Step 4: Logo Brief

* **Core Concept**: Parallel geometric streams converging into an accelerated, unified arrow/vector. Symbolizes dynamic segmentation merging into a flawless file.
* **Mark Type**: Geometric glyph / vector mark + clean sans wordmark.
* **Scale Requirements**:
  - Must remain instantly identifiable at 16x16px (favicon) and 24x24px (system tray icon).
  - High-res vector master rendering up to 1024x1024px for app stores and desktop packages.
* **Deliverables**:
  - `logo.svg` (monochrome & full color variants)
  - `app-icon.png` (1024x1024, no alpha channel for store compliance)
  - `favicon.ico` (multi-resolution 16/32/48px)
  - `og-card.png` (1200x630px social banner)
* **Anti-Copying Verification**:
  - NO globe imagery.
  - NO 3D bevels, drop shadows, or yellow folder icons.
  - Must use flat, modern 45-degree angle vectors in royal indigo and cyber cyan.

---

## Step 5: Voice & Copy Guide

### Attributes
1. **Direct, not blunt**: Provides exact numerical telemetry without condescending jargon or sterile hostility.
2. **Swift, not hurried**: Clear, compact confirmations without compromising safety or data integrity checks.
3. **Honest, not apologetic**: Transparent about server rate-limiting or range rejections without shifting blame.

### Do & Don't Principles
* **Do**: "Server rejected range requests. Downloading as single stream."  
  **Don't**: "Download acceleration error occurred."
* **Do**: "8 segments reassembled. SHA256 verified."  
  **Don't**: "Your file has downloaded successfully!"
* **Do**: "Speed throttled to 500 KB/s."  
  **Don't**: "Bandwidth limiter state is currently active."
* **Do**: "Link expired. Paste fresh URL to resume remaining 40%."  
  **Don't**: "HTTP 403 Forbidden. Download aborted."
* **Do**: "Drop file link or paste address."  
  **Don't**: "Please enter the uniform resource locator below."

### 10 Rewritten Core UI Strings
| UI Context | Original App Style | Veloxis Rebranded String |
| :--- | :--- | :--- |
| App Header Title | Internet Download Manager 6.42 | Veloxis Accelerator |
| Add URL Button | Add URL | + Add Address |
| Pre-download Confirmation | Start Download | Begin Transfer |
| Queue Choice | Download Later | Add to Queue |
| Segment Progress Bar | Connection 1-8 Status | Dynamic Thread Visualizer (8 Streams) |
| Speed Throttle | Turn on Speed Limiter | Throttle Bandwidth |
| Expired URL Recovery | Refresh Download Address | Update Expired Link |
| Completion Prompt | Download Complete | Transfer Assembled |
| File Open Action | Open | Launch File |
| Folder Reveal | Open folder | Show in Explorer |

---

## Step 6: Codebase Sweep Audit

Sweep tool run via `node scripts/sweep.js` using `replica/brand.json`:
* **Target terms scanned**: "Internet Download Manager", "IDM", "Tonec", "Tonec Inc", "internetdownloadmanager.com", "tonec.com", and legacy color hexes.
* **Result**: **CLEAN**. Zero instances found in production code, templates, or client assets outside the `replica/` specification archive.
