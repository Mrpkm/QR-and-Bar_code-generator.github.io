# CodeSafe — Reliable QR & Barcode Generator

A QR code and barcode generator that runs **entirely in the browser**. No server, no APIs,
no build step — a plain static site designed for GitHub Pages.

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

## Technology

| Concern | Choice |
| --- | --- |
| QR rendering | [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) (vendored UMD build in `lib/`) |
| Barcode rendering | [JsBarcode](https://github.com/lindell/JsBarcode) (vendored UMD build in `lib/`) |
| Capacity & validation | Custom code in `js/qr-capacity.js` and `js/qr-validation.js` (ISO/IEC 18004 capacity tables) |
| UI | Plain HTML/CSS/JS, no framework, no bundler |

Libraries are vendored (committed to the repo) rather than loaded from a CDN, so the
deployed site has zero external dependencies at runtime.

## Project structure

```
codesafe/
├── index.html            # Single page, both generators
├── .nojekyll             # Disable Jekyll processing on GitHub Pages
├── css/
│   └── styles.css
├── js/
│   ├── qr-capacity.js    # QR capacity tables, mode detection, version estimation
│   ├── qr-validation.js  # Contrast + logo + shape reliability rules
│   ├── qr-app.js         # QR UI wiring (all changes flow through the rules engine)
│   ├── barcode-app.js    # Barcode UI wiring
│   └── tabs.js
├── lib/
│   ├── qr-code-styling.js
│   └── JsBarcode.all.min.js
└── test/
    ├── run-tests.js       # Capacity/validation unit tests (cscript //nologo test/run-tests.js)
    ├── integration.html   # Browser integration tests (open headless or in a browser,
    └── integration.js     #   results appear in the #test-results element)
```

## Run locally

It is a static site — any file server works:

```sh
# Python
python -m http.server 8000
# or Node
npx serve .
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
user-site root.
