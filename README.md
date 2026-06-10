# CodeSafe — Free QR & Barcode Generator

**Use it here: https://mrpkm.github.io/QR-and-Bar_code-generator.github.io/**

CodeSafe creates QR codes and barcodes right in your browser — free, no ads, no
sign-up required. What you type never leaves your device unless you explicitly
turn on scan tracking.

## What you can make

**QR codes** — for links, Wi-Fi passwords, contact info, or any text up to
~4,000 characters. Customize colors, module shapes, eye styles, and embed your
logo. Download as PNG (512–2048 px) or SVG (infinitely scalable, perfect for print).

**Barcodes** — Code 128, Code 39, EAN-13, EAN-8, UPC-A, ITF-14, MSI and Codabar,
with automatic check digits and input validation that tells you exactly what each
format accepts.

### Codes that always scan

CodeSafe refuses to produce a broken code. As you type and style, it automatically:

- blocks color combinations with too little contrast (and inverted codes, which
  most phone cameras can't read),
- limits logo size so the hidden area stays recoverable by error correction,
- switches off decorative shapes when your data gets dense enough that they'd
  stop scanning,
- picks the strongest error-correction level that still fits your data,

…and tells you about every adjustment it makes, so there are no surprises.

## Accounts (optional)

Everything above works without an account. Creating one takes three fields —
**username, password, and how you'll use CodeSafe** — no email, no phone number.

| Account type | Your Analytics tab shows |
| --- | --- |
| **Business Owner** | total scans, unique visitors, 30-day trends, your most popular codes, scan devices, geography, peak hours |
| **Personal Hobbyist** | your most scanned code, scan history, milestones, daily streaks, fun achievements |
| **Developer** | site-wide trends (verification code required — see below) |

⚠️ Because we store no email address, **a forgotten password cannot be reset**.
Pick one you'll keep.

### Scan tracking

Signed in, you can switch on **"Track scans"** for any QR code that contains a
link. The downloaded code then points through a short redirect on this site that
counts the scan (when, device type, approximate country) before instantly
forwarding to your link. Codes without tracking encode your content directly,
work forever, and never touch our database.

### The community counter

The banner at the top — *"QR Codes Successfully Generated: X / Goal"* — counts
every download by everyone, working toward shared milestones from 100 up to
10,000,000. When the community hits a goal, you'll see the celebration. 🎉

## Privacy, plainly

- Untracked codes: **nothing** is uploaded — not your text, not your design.
- Every download adds +1 to the community counter. That's all.
- Tracked codes store the target link you chose and, per scan: time, device class
  (phone/tablet/desktop), and a country guessed from the scanner's timezone.
- **No IP addresses, no email, no third-party trackers, no ad tech. Ever.**

## Developer accounts

Developer accounts see anonymous, site-wide trends (user counts, signups,
generation and scan volumes, devices, geography). They require a verification
code at sign-up.

**To get a dev account, consult with the developer:
[github.com/Mrpkm](https://github.com/Mrpkm)**

## Run your own copy

CodeSafe is open source and runs on any static host — the generators work with
zero setup:

1. Fork or clone this repository and enable **GitHub Pages** (Settings → Pages →
   deploy from branch `main`, folder `/ (root)`).
2. *(Optional, for accounts/analytics/community features)* Create a free
   [Supabase](https://supabase.com) project, run `supabase/migration.sql` in its
   SQL editor, disable "Confirm email" under Authentication, and put your project
   URL + publishable key into `js/config.js`. With `config.js` left empty the
   site simply runs in local-only mode.

Technical details — how a static site does accounts, live counters, and scan
analytics — are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Credits

Built with [qr-code-styling](https://github.com/kozakdenys/qr-code-styling),
[JsBarcode](https://github.com/lindell/JsBarcode) and
[Chart.js](https://www.chartjs.org), all bundled locally — the site loads no
third-party scripts at runtime.
