# Deploy Checklist: Veloxis Download Accelerator

**Date**: 2026-10-18  
**Commit**: `22362f2`  
**Go from user**: Pending user approval (Preflight gates passed 100%)

---

## 1. Preflight Gates (All Passed Cleanly)

- [x] **E2E Test Suite Green**: **8 / 8 cases passed** (`node tests/e2e.test.js`)
  - `F01-H1`: Multipart range download (8 streams) & SHA256 integrity stitching (PASS)
  - `F01-E1`: Single stream fallback on servers lacking Accept-Ranges (PASS)
  - `F02-H1`: Manual URL probe via HTTP HEAD (PASS)
  - `F02-N1`: Negative probe on invalid/unreachable host (PASS)
  - `F04-H1`: Pause active transfer mid-flight and resume (PASS)
  - `F05-H1`: Refresh expired signed link token and resume without byte loss (PASS)
  - `F06-H1`: Batch URL pattern expansion and queue enqueuing (PASS)
  - `S12-H1`: Speed limiter bandwidth throttling persistence (PASS)
- [x] **No Open S1 or S2 Bugs**: **0 open critical bugs** recorded in [`replica/bugs.md`](file:///c:/Rounak/IDM/replica/bugs.md)
- [x] **Feature Parity**: **100.0% Must-Haves Done** (15/15), Overall Feature Score: **96.5%** recorded in [`replica/parity.md`](file:///c:/Rounak/IDM/replica/parity.md)
- [x] **Rebrand Sweep Clean**: **CLEAN (exit 0)** via `node scripts/sweep.js` — zero competitor names, domains, or obsolete hex colors in codebase outside `replica/`
- [x] **Store Listing Metadata Valid**: **0 errors, 0 warnings (exit 0)** via `node scripts/listing.js replica/launch/listing.json`
- [x] **Production Build Passes**: **PASS (exit 0)** via `node scripts/build.js` — all syntax valid, public client assets verified, WebExtension Manifest V3 bundle verified
- [x] **Privacy Policy & Terms Live**: [`public/privacy.html`](file:///c:/Rounak/IDM/public/privacy.html) and [`public/terms.html`](file:///c:/Rounak/IDM/public/terms.html) live, listing all sub-processors (Stripe, self-hosted Sentry), zero personal URL logging
- [x] **Account Deletion / Data Erasure Works**: Self-serve data wipe supported via `storage.clearAll()` and local database erasure
- [x] **Brand Assets Complete**: Favicon ([`public/favicon.svg`](file:///c:/Rounak/IDM/public/favicon.svg)), clean vector typography, dark tokens, and store assets configured

---

## 2. Production Services & Hosting Configuration

### Hosting Platform: Render / Fly.io / Cloudflare Pages / Vercel
- **Production URL**: `https://veloxis.dev` (or `https://app.veloxis.dev`)
- **Docker / Node Deployment**:
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --omit=dev
  COPY . .
  ENV NODE_ENV=production
  EXPOSE 6789
  CMD ["node", "src/server/index.js"]
  ```

### Production Environment Variables (`.env.production`)
The user creates these secrets in their hosting dashboard (e.g. Render/Fly secret manager):

| Variable Name | Required Value / Source | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimizations and disables debug traces |
| `PORT` | `6789` (or host assigned `$PORT`) | Port for HTTP REST daemon and WebSocket server |
| `ALLOWED_ORIGINS` | `https://veloxis.dev,https://app.veloxis.dev` | Strict CORS policy allowing only production origins |
| `VELOXIS_DATA_DIR` | `/var/data/veloxis` | Persistent volume mount for `db.json` and download states |
| `STRIPE_SECRET_KEY` | `sk_live_...` (from user Stripe account) | Secure payment processing for Pro/Studio licenses |
| `STRIPE_PUBLISHABLE_KEY`| `pk_live_...` (from user Stripe account) | Client checkout session initialization |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (from user Stripe dashboard) | Cryptographic signature validation on `checkout.session.completed` |
| `SENTRY_DSN` | `https://...@sentry.veloxis.dev/1` | Anonymous crash telemetry |

### Stripe Live Mode Steps (User Action):
1. Switch Stripe Dashboard toggle from **Test mode** to **Live mode**.
2. Create the 3 products matching [`replica/launch/pricing.md`](file:///c:/Rounak/IDM/replica/launch/pricing.md):
   - `Veloxis Pro — Lifetime (3 Devices)`: $29.00 USD (one-time)
   - `Veloxis Pro — Annual (3 Devices)`: $25.00 USD / year (recurring)
   - `Veloxis Studio & Homelab (10 Seats)`: $79.00 USD (one-time)
3. Add production webhook endpoint:
   - **URL**: `https://api.veloxis.dev/api/webhooks/stripe`
   - **Events to listen for**: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Execute one test transaction with a real card and refund it immediately via the dashboard to verify live webhook receipt.

---

## 3. Domain & DNS Records (`veloxis.dev`)

After registering the domain at registrar (e.g., Cloudflare Registrar, Namecheap, Porkbun):

### Web Traffic Records:
| Type | Name | Content / Target | TTL | Proxy / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `@` | `76.76.21.21` *(or apex IP assigned by your host)* | Auto | Apex traffic |
| **CNAME** | `www` | `cname.veloxis.dev` *(or host target)* | Auto | Canonical redirect to apex |
| **CNAME** | `api` | `veloxis-daemon.fly.dev` *(or host target)* | Auto | Headless API & WebSocket ingress |

### Email Authentication Records (Resend / Postmark / SendGrid):
| Type | Name | Content / Target | Purpose |
| :--- | :--- | :--- | :--- |
| **TXT** | `@` | `v=spf1 include:sendgrid.net ~all` | Sender Policy Framework (SPF) |
| **CNAME** | `s1._domainkey` | `s1.domainkey.u12345.wl.sendgrid.net` | DKIM 2048-bit digital signing |
| **CNAME** | `s2._domainkey` | `s2.domainkey.u12345.wl.sendgrid.net` | DKIM rotation key |
| **TXT** | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc-reports@veloxis.dev` | DMARC policy (switch to `quarantine` after week 1) |

---

## 4. Production Monitoring & Telemetry

- **Uptime Monitoring**:
  - Service: Better Uptime / UptimeRobot
  - Monitor 1: `GET https://veloxis.dev/landing.html` (Expected: 200 OK)
  - Monitor 2: `GET https://api.veloxis.dev/api/tasks` (Expected: 200 OK, latency < 200ms)
- **Error Tracking**:
  - Sentry / GlitchTip logging uncaught node exceptions or broken range pipeline failures.
- **Privacy-Friendly Analytics**:
  - Plausible / Fathom Analytics (Cookieless, GDPR compliant, zero cookie banner required).

---

## 5. First-Week Post-Launch Verification

- [ ] Execute complete manual download of a 500MB test ISO on the live production site.
- [ ] Verify WebExtension connects to `https://api.veloxis.dev` via secure WebSocket (`wss://`).
- [ ] Confirm Stripe webhook correctly issues license token on live test purchase.
- [ ] Confirm automated SPF/DKIM validation reports 100% email inbox delivery.
- [ ] Verify zero false-positive antivirus warnings on Windows SmartScreen (submit EV code-signed binary).
