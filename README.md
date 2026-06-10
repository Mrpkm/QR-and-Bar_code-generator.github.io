# CodeSafe — Reliable QR & Barcode Generator

A QR code and barcode generator that runs **entirely in the browser**. No server, no build
step — a plain static site designed for GitHub Pages. Optional cloud features (accounts,
scan analytics, a community counter) are powered by a free Supabase project that the
static pages talk to directly; the site itself stays 100% static.

## Features

**QR codes**
- Up to 4,296 characters (alphanumeric mode) / 2,953 bytes (arbitrary text) — full QR version 40 support
- Customization: foreground/background colors, module shapes, eye styles, embedded logos
- Reliability guardrails that make unscannable codes impossible to produce:
  - Contrast ratio between colors must be ≥ 4:1 (WCAG relative luminance), with a
    recommendation banner below 7:1; light-on-dark (inverted) codes are rejected
  - Logos require error correction Q or H; the size cap keeps the obscured area below
    half of the error-correction recovery budget (12% of area at H, 6% at Q)
  - Decorative module shapes and logos are automatically restricted as data density
    rises (QR version > 15 and > 25), where shrunken modules stop scanning reliably
  - Error correction levels that can no longer hold the entered data are disabled,
    with automatic fallback to the highest level that fits
  - Every automatic adjustment is explained in a visible feedback message
- PNG and SVG export at 512–2048 px

**Barcodes**
- Code 128, Code 39, EAN-13, EAN-8, UPC-A, ITF-14, MSI, Codabar
- Per-format input validation with helpful hints, automatic check digits
- PNG and SVG export

**Accounts & analytics** (see [ARCHITECTURE.md](ARCHITECTURE.md) for the full design)
- Username + password accounts — no email, no phone, three-field signup.
  Because nothing is on file, a forgotten password cannot be recovered (stated at signup).
- At signup you choose **Business Owner** or **Personal Hobbyist**, which selects your
  analytics dashboard:
  - *Business:* total codes, total/unique scans, 30-day scan trend, most popular codes,
    device types, geographic distribution (timezone-derived, privacy-friendly),
    repeat-scan rate and peak-hour conversion signals
  - *Personal:* totals, most scanned code, scan history, personal milestones,
    usage streaks, fun achievements
- **Scan tracking** for signed-in users: a "Track scans" toggle makes the downloaded QR
  encode a short `s.html?c=…` link on this site that logs the scan (device class,
  timezone-derived country, repeat flag — never IPs) and instantly redirects to your URL.
  Untracked codes encode your data directly and never touch the database.
- **Community progress banner**: "QR Codes Successfully Generated: X / Goal" across all
  users, with goals advancing 100 → 1,000 → … → 10,000,000, a confetti celebration when
  a milestone is reached, and a preserved milestone history.
- Without cloud configuration the site runs in **local-only mode**: generators work
  exactly as before, guest analytics come from this browser's IndexedDB, and all
  cloud UI hides itself. Guest history can be imported into an account on first sign-in.

## Technology

| Concern | Choice |
| --- | --- |
| QR rendering | [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) (vendored UMD build in `lib/`) |
| Barcode rendering | [JsBarcode](https://github.com/lindell/JsBarcode) (vendored UMD build in `lib/`) |
| Accounts & data (optional) | [Supabase](https://supabase.com) — GoTrue auth + Postgres with row-level security, called directly from the browser (`lib/supabase.js`, vendored) |
| Charts | [Chart.js](https://www.chartjs.org) (vendored UMD build in `lib/`) |
| Capacity & validation | Custom code in `js/qr-capacity.js` and `js/qr-validation.js` (ISO/IEC 18004 capacity tables) |
| Analytics logic | Custom pure functions in `js/analytics-core.js` (unit-tested) |
| Local storage | IndexedDB + localStorage (`js/storage.js`) |
| UI | Plain HTML/CSS/JS, no framework, no bundler |

Libraries are vendored (committed to the repo) rather than loaded from a CDN, so the
deployed site has zero external dependencies at runtime — except the optional Supabase
API, which is the one cloud service accounts and shared statistics require
(GitHub Pages itself cannot store shared state).

## Project structure

```
codesafe/
├── index.html             # Single page: generators + analytics + account modal
├── s.html                 # Tiny scan-redirect page for tracked QR codes
├── .nojekyll              # Disable Jekyll processing on GitHub Pages
├── ARCHITECTURE.md        # Design for accounts/analytics/community features
├── css/
│   └── styles.css
├── js/
│   ├── config.js          # Supabase URL + anon key (empty ⇒ local-only mode)
│   ├── qr-capacity.js     # QR capacity tables, mode detection, version estimation
│   ├── qr-validation.js   # Contrast + logo + shape reliability rules
│   ├── analytics-core.js  # Milestone ladder, streaks, achievements, device/geo logic
│   ├── storage.js         # IndexedDB/localStorage wrapper
│   ├── backend.js         # Cloud (Supabase) / local adapter — the only seam
│   ├── qr-app.js          # QR UI wiring (all changes flow through the rules engine)
│   ├── barcode-app.js     # Barcode UI wiring
│   ├── account.js         # Sign-in/sign-up modal and header controls
│   ├── community.js       # Community banner, celebrations, milestone history
│   ├── analytics.js       # Business/personal/guest dashboards
│   └── tabs.js
├── lib/                   # Vendored third-party UMD builds
│   ├── qr-code-styling.js
│   ├── JsBarcode.all.min.js
│   ├── supabase.js
│   └── chart.umd.js
├── supabase/
│   └── migration.sql      # Schema + row-level security + RPC functions
└── test/
    ├── run-tests.js       # Unit tests (cscript //nologo test/run-tests.js)
    ├── integration.html   # Browser integration tests
    ├── integration.js
    └── serve.ps1          # Static server for running integration tests over http://
```

## Run locally

It is a static site — any file server works:

```sh
# Python
python -m http.server 8000
# or Node
npx serve .
# or PowerShell (no installs needed)
powershell -ExecutionPolicy Bypass -File test/serve.ps1 -Port 8000 -MaxSeconds 3600
```

Then open http://localhost:8000.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this folder's contents to it:

   ```sh
   git init
   git add .
   git commit -m "QR & barcode generator"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo>.git
   git push -u origin main
   ```

2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*,
   choose branch `main` and folder `/ (root)`, then save.
4. After a minute the site is live at `https://<your-username>.github.io/<repo>/`.

No build step, no Actions workflow, and no configuration files are needed. All asset
paths are relative, so the site works both at a project URL (`/repo/`) and at a
user-site root. With `js/config.js` left empty this deploys in local-only mode.

## Cloud features (accounts, analytics, community counter)

One-time setup, about 15 minutes, free tier, no credit card:

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the contents of `supabase/migration.sql`, **Run**.
3. Open **Authentication → Sign In / Up → Email** and turn **off** "Confirm email"
   (accounts are username-only; the synthetic `…@users.codesafe.invalid` addresses
   can never receive mail). Set minimum password length to 8.
4. Open **Settings → API** and copy the **Project URL** and the **anon public** key
   into `js/config.js`, commit, and push.

The anon key is intended to be public: every protection lives in the row-level-security
policies and the two SQL functions created by the migration. Never put the
`service_role` key anywhere in this repo.

Operational notes:
- Free-tier Supabase projects pause after about a week without traffic and need a
  one-click resume from the dashboard. Tracked QR links don't resolve while paused —
  prefer untracked codes for anything long-lived and critical.
- Tracked links depend on your GitHub Pages URL staying stable; untracked codes work forever.
- Privacy: untracked QR/barcode content never leaves the browser. The database stores
  generation counts, and for tracked codes the target URL plus per-scan device class and
  timezone-derived country. No IP addresses, no third-party trackers.

## Tests

```sh
# Unit tests (capacity, validation, milestone ladder, streaks, achievements, …)
cscript //nologo test/run-tests.js

# Browser integration tests: serve the folder, open the page, results appear in
# #test-results (and are POSTed to /__results when using test/serve.ps1)
powershell -ExecutionPolicy Bypass -File test/serve.ps1
# then open http://localhost:8123/test/integration.html
```
