# Component Specifications: Nexus Download Accelerator

Design specs for all repeatable UI primitives reconstructed from the recon map.

---

### Button
* **variants**: `primary`, `secondary`, `ghost`, `danger`, `icon-only`
* **sizes**: `sm` (26px height, 12px font), `md` (34px height, 13px font), `lg` (42px height, 14px font)
* **states**: `default`, `hover`, `active`, `focus-visible` (2px outline `var(--color-accent)` with 2px offset), `disabled` (opacity 0.5, cursor not-allowed), `loading`
* **tokens**: `primary` -> `bg accent`, `text on-accent`, `radius md`, `font sm/600`; `secondary` -> `bg surface-raised`, `border border`, `text text`
* **a11y**: Native `<button>`, explicit `aria-label` for icon-only buttons, preserves focus ring under keyboard navigation (`Tab`/`Shift+Tab`)
* **used on**: S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11, S12

---

### Table (Virtualized Download List)
* **variants**: `download-list`, `segment-list`, `batch-preview`
* **sizes**: row height 42px (compact 36px)
* **states**: `default`, `row-hover`, `single-selected` (rgba accent tint), `multi-selected`, `empty`
* **tokens**: `header-bg surface`, `border border`, `text text`, `text-muted text-muted`, `font sm/400`, `mono mono`
* **a11y**: Semantic `<table>`, `<thead>`, `<tbody>`, sortable columns with `aria-sort`, full row focusable with arrow key navigation
* **used on**: S01, S04, S07, S09, S11

---

### TreeView (Category & Crawl Sidebar)
* **variants**: `sidebar-nav`, `asset-crawler-tree`
* **sizes**: item height 32px
* **states**: `expanded`, `collapsed`, `item-hover`, `item-active` (accent text + subtle surface background)
* **tokens**: `bg surface`, `text text`, `active-text accent`, `badge-bg surface-raised`, `radius md`
* **a11y**: `role="tree"`, `role="treeitem"`, `aria-expanded="true/false"`, keyboard expandable via `Enter` and arrow keys
* **used on**: S01, S11

---

### SegmentProgressBar (Multi-Chunk Thread Visualizer)
* **variants**: `compact-inline` (8px height), `detailed-modal-grid` (12px height)
* **sizes**: compact (140px width), detailed (100% fluid)
* **states**: `waiting` (border color), `downloading` (shimmer animated gradient `chunk-active` to `accent`), `completed` (solid `accent`), `failed` (`danger`)
* **tokens**: `track surface-raised`, `fill chunk-active` & `accent`, `radius pill`
* **a11y**: `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, screen reader label with downloaded byte ratio
* **used on**: S01, S04

---

### ModalDialog (App Shell Modals)
* **variants**: `alert`, `form-input`, `stepper-wizard`, `fullscreen-overlay`
* **sizes**: `sm` (440px), `md` (580px), `lg` (650px)
* **states**: `closed` (opacity 0, pointer-events none), `entering` (scale 0.96 to 1, fade-in), `active`, `exiting`
* **tokens**: `bg surface`, `border border`, `shadow pop`, `radius lg`, `header-border border`
* **a11y**: `role="dialog"`, `aria-modal="true"`, focus trapped inside modal, `Escape` key closes, restores focus to triggering button
* **used on**: S02, S03, S04, S05, S06, S07, S09, S10, S11, S12

---

### FloatingGrabberPill (Browser Extension Injected Button)
* **variants**: `compact-icon`, `expanded-pill`, `active-dropdown`
* **sizes**: 32px height, pill radius 9999px
* **states**: `idle`, `hover` (elevates -1px, shadow pop), `pulsing` (glow animation when active video detected), `downloading` ("Queued!" feedback)
* **tokens**: `bg surface` (rgba 92%), `border accent`, `text text`, `shadow pop`, `glow shadow-glow`
* **a11y**: High contrast against dark and bright video canvases, keyboard triggerable via extension shortcut
* **used on**: S08 (Web extension content script)

---

### TabPanel (Preferences & Multi-section Container)
* **variants**: `horizontal-underlined`
* **sizes**: tab item height 36px
* **states**: `active` (accent underline 2px, accent text), `inactive` (text-muted), `hover` (text text)
* **tokens**: `border border`, `active-border accent`, `text-muted text-muted`
* **a11y**: `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected="true/false"`, arrow key navigation between tabs
* **used on**: S04, S06, S07

---

### SpeedGauge (Throughput Meter)
* **variants**: `status-bar-stat`, `modal-headline`
* **sizes**: sm (12px), lg (20px bold)
* **states**: `active` (white text, font-mono), `throttled` (accent colored), `idle` (muted)
* **tokens**: `font mono`, `text text`, `accent accent`
* **a11y**: Live region `aria-live="polite"` announces significant speed changes to assistive technologies
* **used on**: S01, S04, S12

---

### StatusBadge (Chip)
* **variants**: `downloading` (blue), `completed` (green), `paused` (amber), `queued` (slate), `error` (red)
* **sizes**: height 20px, font 11px
* **states**: `normal`
* **tokens**: `downloading` -> rgba accent 18%, text #60a5fa; `completed` -> rgba success 18%, text #34d399; `radius pill`
* **a11y**: Clear textual representation matching the color cue
* **used on**: S01, S03, S04, S07

---

### ToastNotification
* **variants**: `success-toast`, `error-toast`
* **sizes**: width 320px
* **states**: `slide-in`, `visible`, `dismissed`
* **tokens**: `bg surface-raised`, `border border`, `shadow pop`, `radius md`
* **a11y**: `role="status"`, auto-dismiss with manual dismiss button
* **used on**: System Tray / Desktop notifications
