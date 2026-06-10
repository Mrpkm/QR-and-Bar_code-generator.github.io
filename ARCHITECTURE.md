# How CodeSafe Works

A plain-language tour of what happens behind the scenes — and exactly what data
exists where. A short technical appendix for developers is at the end.

## The big picture

CodeSafe is a **static website**: a folder of HTML, CSS and JavaScript served by
GitHub Pages. There is no application server. Your browser does all the work of
building QR codes and barcodes, which is why the generators are fast, free, and
work without an account.

A static site, however, can't remember anything shared between visitors — it has
no memory of its own. So the features that need shared memory (accounts, the
community counter, scan statistics) use one small cloud database
([Supabase](https://supabase.com)) that your browser talks to directly over HTTPS.
If that database is ever unreachable, code generation keeps working untouched.

```
your browser ──── builds codes locally (always)
      │
      └───────── talks to the database only for:
                 accounts · community counter · scan tracking
```

## What is stored, and what never is

| You do this | What gets stored |
| --- | --- |
| Generate / download any code | +1 on the community counter — never the content |
| Create an account | username, password (encrypted*), account type |
| Turn on "Track scans" for a QR code | the target link, a label, and per scan: time, device class, approximate country |
| Everything else | nothing |

\* Passwords are protected with bcrypt, the industry-standard one-way hash —
nobody, including the developer, can read them back.

**Never stored:** the content of untracked codes, your designs and logos, IP
addresses, email addresses, phone numbers, precise locations.

The achievements on the Personal dashboard are computed from a history kept in
**your own browser** (IndexedDB) — that data never leaves your device either.

## How accounts work without email

Sign-up asks only for a username and password. Under the hood, the username is
wrapped into a synthetic address ending in `.invalid` — a reserved internet
domain that can never receive mail — purely because the login service is
organised around email-shaped identifiers. No mailbox is involved at any point.

The honest trade-off: with nothing on file to verify you, **a lost password
means a lost account**. The sign-up form warns about this.

## How a static site counts scans

A QR code is just a picture; nobody can tell when it's scanned. So when you
enable **Track scans**, CodeSafe doesn't encode your link directly — it encodes
a short link to a tiny page on this site (`s.html`). When someone scans the code:

1. that page looks up your real link in the database,
2. records the scan — time, device class from the browser, and a country guessed
   from the phone's timezone (deliberately vague: no IP lookup, no GPS),
3. forwards the visitor to your link, all in a fraction of a second.

This is also why tracked codes depend on this site staying online, while
untracked codes are self-contained and work forever.

## How the community counter works

Every download calls one small database function that adds +1, atomically, no
matter how many people click at the same instant. The same function checks
whether the community just crossed the current goal (100 → 1,000 → 10,000 →
100,000 → 1,000,000 → 10,000,000); if so, it records the milestone with a
timestamp — that's the history behind the 🏆 button — and advances to the next
goal. Because this logic lives *inside* the database, no misbehaving browser can
corrupt the goal ladder or erase the history.

## How developer accounts are protected

Choosing **Developer** at sign-up requires a verification code. The code is
never present in the site's code — only a bcrypt fingerprint of it exists, in a
database table that the public API cannot read at all. The check happens inside
the database, and the site-wide trends function double-checks that the caller
really has a developer profile before answering. Hiding the Developer tab from
other users is cosmetic; the real lock is server-side.

To request a code: [github.com/Mrpkm](https://github.com/Mrpkm).

## Why this design is safe to run in the open

The database key shipped with this site is the **publishable** key — it's meant
to be public. Every row in the database is guarded by *row-level security*:
rules enforced by the database itself that say, for example, "a user may read
only their own profile" or "scan rows may only be read by the owner of the
scanned code." The few shared things (the community counter, the scan logger)
are reachable only through narrow, single-purpose database functions that
validate their input and rate-limit abuse. There is no admin key anywhere in
this repository.

---

## Technical appendix (for developers)

**Stack.** Plain HTML/CSS/JS, no framework, no build step. Vendored UMD builds:
qr-code-styling, JsBarcode, Chart.js, supabase-js. `js/backend.js` is the single
adapter between the UI and either Supabase (when `js/config.js` is filled) or a
local IndexedDB-only mode (when it isn't) — every cloud feature hides itself in
local mode.

**Database** (see `supabase/migration.sql` for the full, commented schema):

| Table | Purpose | Access (RLS) |
| --- | --- | --- |
| `profiles` | username, account type, counters | own row only |
| `qr_codes` | tracked codes: short id → target URL | owner only |
| `scans` | one row per scan of a tracked code | owner of the code; insert only via RPC |
| `creation_events` | per-user generation log (trends, streaks) | own rows only |
| `community_stats` | single row: total + current goal | public read; write only via RPC |
| `milestones` | goal + timestamp history | public read |
| `dev_codes` | bcrypt hashes of developer codes | no policies — API-invisible |

**Functions** (`security definer`, the only write paths to shared state):
`record_generation(kind)` increments the counter, advances the milestone ladder
atomically, logs a creation event for signed-in users, and rate-limits to one
count per 3 s per user. `resolve_and_log_scan(...)` resolves a short id and logs
the scan in one round trip, clamping all inputs. `register_profile(...)` creates
profiles and verifies developer codes against `dev_codes`. `dev_overview()`
returns site-wide aggregates to developer accounts only.

**Auth.** Supabase GoTrue, email/password under the hood with synthetic
`<username>@users.codesafe.invalid` addresses, confirmations disabled, bcrypt
server-side, JWT sessions handled by supabase-js. No custom cryptography
anywhere in this codebase.

**Scan metadata.** Device class is parsed from the user agent; country comes
from `Intl.DateTimeFormat().resolvedOptions().timeZone` mapped through a static
table — privacy-friendly by construction. "Unique scans" use a first-scan flag
in the scanner's localStorage and are best-effort.

**Limits worth knowing.** Free-tier Supabase projects pause after ~1 week
without traffic (tracked links don't resolve while paused; untracked codes are
unaffected). The community counter trusts callers up to its rate limit — spam
could only make the number climb faster, never corrupt milestone state. Scan
counts stop at the redirect; for downstream conversions, add UTM parameters to
your target URLs and use your own web analytics.
