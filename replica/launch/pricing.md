# Pricing Strategy: Veloxis Download Accelerator

---

## 1. Competitive Pricing Landscape

Prices recorded on **October 18, 2026**:

| Software | Pricing Model | Price | Platform | Limitations / Complaints | Source URL |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Internet Download Manager (Tonec)** | 1-Year or "Lifetime" per PC | **$11.95/yr** (1 PC)<br>**$24.95** "lifetime" (1 PC) | Windows only | Hardware/motherboard locked; updates cut off after 3 years; false fake-serial nag popups. | `https://www.internetdownloadmanager.com/buy_idm.html` *(read 2026-10-18)* |
| **Downie 4 (Charlie Monroe Software)** | One-time or Subscription | **$19.99** one-time<br>or **$9.99/mo** (Setapp) | macOS only | Video grabber only; lacks general multi-part segmented file downloader and Windows/Linux support. | `https://software.charliemonroe.net/downie/` *(read 2026-10-18)* |
| **Free Download Manager (FDM)** | Free (Ad/Data supported) | **$0** (Free) | Windows, Mac, Linux, Android | Inconsistent multi-threading speeds; bundled third-party telemetry/prompts. | `https://www.freedownloadmanager.org/` *(read 2026-10-18)* |
| **JDownloader 2** | Open Source / Donation | **$0** (Free) | Cross-platform (Java) | Heavy Java memory footprint; historical adware bundled into default installers. | `https://jdownloader.org/` *(read 2026-10-18)* |

---

## 2. Reviewer Feedback on Price & Billing

From [`feedback.md`](file:///c:/Rounak/IDM/replica/feedback.md) across Trustpilot, Reddit, and G2:

1. **Deceitful Lifetime Renewal & Cutoffs (5 reviews, Weight: 4.1)**:
   - Users who purchased a "lifetime license" discovered that feature updates ceased after 3 years, followed by intrusive modal banners urging them to pay again.
2. **Motherboard / Hardware Key Blocking (5 reviews, Weight: 4.1)**:
   - Changing a motherboard, upgrading a CPU, or formatting a drive invalidated serial keys. Support routinely refused to unlock keys, demanding another purchase.
3. **Paying Twice for Laptop + Desktop (4 reviews)**:
   - Modern power users operate multiple workstations (e.g. desktop + laptop). Requiring a separate license per physical computer was widely condemned as an outdated cash grab.

---

## 3. The Veloxis Pricing Model

### Design Principles:
1. **Never Motherboard-Locked**: Activations are managed by a simple account token or transferable offline key. If you upgrade your PC or buy a new laptop, transfer your activation in one click.
2. **True Lifetime Means Lifetime**: Lifetime tiers include all future updates, major releases, and bug fixes without expiration cliffs or renewal nag screens.
3. **Generous Multi-Device Allowance**: Every paid license covers both your desktop, laptop, and home server (up to 3 personal devices).

---

## 4. The Three Tiers

### 1. Free (Personal)
*Target: Everyday casual downloaders and open-source advocates.*
- **Price**: **$0** forever.
- Up to 4 parallel segmented connections per file.
- Manifest V3 browser companion (Chrome, Edge, Firefox).
- Floating media stream grabber.
- Full Obsidian Midnight Dark theme & virtualized table.
- Expired link URL updating.
- Single device usage.

### 2. Pro (Power Users & Multi-Device) — RECOMMENDED
*Target: Media archivers, gamers, remote workers with multiple PCs.*
- **Price**: **$29 one-time** (Lifetime with perpetual updates) or **$25/year** (Annual subscription).
- Up to 32 parallel connections with dynamic chunk rebalancing.
- **Coverage for up to 3 personal devices** (mix and match Windows, macOS, Linux).
- Headless background daemon with REST API and WebSocket telemetry.
- Advanced priority queue scheduling and automated speed throttling.
- Priority customer support and self-serve device transfer dashboard.

### 3. Studio & Homelab (Devs & Teams)
*Target: Small dev teams, homelab enthusiasts, and media production studios.*
- **Price**: **$79 one-time** (Lifetime).
- Up to 10 user seats or dedicated server daemon instances.
- Unlimited parallel connections and headless cluster scheduling.
- Webhook triggers and custom post-download automation scripts.
- Multi-seat centralized license management.

---

## 5. Billing Complaints Resolved

| Customer Pain Point | Veloxis Fix |
| :--- | :--- |
| **Hardware binding / invalidation** | Machine-independent license token with self-serve deactivation in user portal. |
| **Unexpected renewal charges** | 14-day and 3-day automated email notices before annual renewals. |
| **Difficult cancellations** | One-click cancel button directly in account settings (instant Stripe cancellation). |
| **Nag screens / fake serial warnings** | 0 modal popup warnings. Non-blocking banner in Settings menu only. |

---

## 6. Stripe Products & Prices to Configure

Create these products in the Stripe Dashboard (`https://dashboard.stripe.com/products`):

```json
[
  {
    "id": "prod_veloxis_pro_lifetime",
    "name": "Veloxis Pro — Lifetime (3 Devices)",
    "description": "Perpetual license for up to 3 personal machines (Windows, macOS, Linux) with lifetime updates.",
    "type": "one_time",
    "amount": 2900,
    "currency": "usd"
  },
  {
    "id": "prod_veloxis_pro_annual",
    "name": "Veloxis Pro — Annual (3 Devices)",
    "description": "Annual subscription for up to 3 personal machines with continuous cloud sync.",
    "type": "recurring",
    "interval": "year",
    "amount": 2500,
    "currency": "usd"
  },
  {
    "id": "prod_veloxis_studio_lifetime",
    "name": "Veloxis Studio & Homelab — Lifetime (10 Seats)",
    "description": "Perpetual team/homelab license for up to 10 seats or dedicated daemon servers.",
    "type": "one_time",
    "amount": 7900,
    "currency": "usd"
  }
]
```
