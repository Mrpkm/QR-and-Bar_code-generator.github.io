# CodeSafe — Accounts, Analytics & Community Progress: Architecture

This document specifies how to extend CodeSafe with user accounts, profile-based
analytics, and a community progress tracker **without giving up GitHub Pages
hosting**. Every choice below is justified against that constraint.

---

## 0. The constraint, stated honestly

GitHub Pages serves static files. It cannot:

- verify a password (anything checked only in the browser can be bypassed with DevTools),
- store data shared between users (a global counter, scan events from strangers' phones),
- run any code when someone *scans* a QR code.

Three of the requested features therefore need shared, writable, server-side state:

| Feature | Why client-only is impossible |
| --- | --- |
| Accounts usable across devices | Credentials must be verified somewhere the attacker doesn't control |
| Scan analytics | Scans happen on *other people's devices*; events must land in a shared store |
| Community counter | Cumulative across all users, with atomic increments |

The constraints explicitly allow "compatible cloud services when account persistence
is required." The design uses exactly one: a **Backend-as-a-Service consumed directly
from the browser**. No server we write, host, patch, or scale. The site remains 100%
static; the BaaS is just an HTTPS API the static pages call — the same relationship
the site already has with the visitor's browser APIs.

Everything that *can* stay frontend-only does: rendering, validation, guest-mode
stats (IndexedDB/localStorage), achievement computation, dashboard charting, device
detection, and coarse geography.

---

## 1. Recommended architecture

```
┌────────────────────────────  GitHub Pages (static)  ───────────────────────────┐
│ index.html      generators + community banner + Analytics tab + account modal  │
│ s.html          tiny scan-redirect page (tracked QR codes point here)          │
│ js/config.js    SUPABASE_URL + anon key (empty ⇒ local-only mode)              │
│ js/backend.js   single adapter: cloud (supabase-js) or local (IndexedDB) impl  │
│ lib/supabase.js vendored UMD build, same policy as qr-code-styling/JsBarcode   │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ HTTPS (supabase-js, anon key + RLS)
                          ┌────────────▼────────────┐
                          │   Supabase (free tier)  │
                          │  Auth (GoTrue, bcrypt)  │
                          │  Postgres + RLS         │
                          │  RPC functions (atomic  │
                          │   counter, milestones)  │
                          └─────────────────────────┘
```

**Why Supabase** (over the alternatives):

- **Postgres functions give us server-side logic without a server.** The atomic
  community counter, milestone advancement, and rate limiting all live in SQL
  `security definer` functions. Firebase would need Cloud Functions for the same
  guarantees, which now require the paid Blaze plan; Firestore security rules alone
  cannot express "advance the goal ×10 and record history atomically."
- **Row Level Security** is a proven, declarative way to isolate per-user data when
  the API key is public (which it must be on a static site).
- **Auth is GoTrue**: bcrypt password hashing, JWT sessions, refresh — zero custom
  cryptography, satisfying the "proven technologies" requirement.
- Free tier, no credit card, open-source (self-hostable exit path).
- **Known trade-off:** free-tier projects pause after ~1 week of inactivity and need
  a one-click resume from the dashboard. If that is unacceptable, Firebase
  (Auth + Firestore) is the drop-in alternative — the `backend.js` adapter isolates
  the choice — at the cost of weaker server-side counter integrity.

**Local-only mode is first-class.** If `js/config.js` is left empty, the site works
exactly as it does today, plus guest analytics from IndexedDB. Cloud-dependent UI
(sign-in, community banner, scan tracking) hides itself. This means the repo still
deploys to GitHub Pages with zero setup, honoring "prefer frontend-based solutions
whenever practical."

**No accounts required to use the app.** Generation, export, and guest analytics
work signed-out. An account is needed only for cross-device sync and scan tracking.

---

## 2. Authentication approach

**Mechanism:** Supabase Auth (GoTrue) with the synthetic-email pattern — a widely
used, boring solution for username-only auth on providers that key accounts by email:

- Signup maps `username` → `<username>@users.codesafe.invalid` (`.invalid` is the
  IETF-reserved TLD; no mail can ever be delivered). Email confirmation is disabled
  in the Supabase dashboard.
- Username uniqueness is enforced twice: by the unique synthetic email in GoTrue,
  and by a unique lower-cased index on `profiles.username`.
- Username rules: 3–20 chars, `a–z 0–9 _`, case-insensitive. Password: minimum
  8 characters (enforced by GoTrue settings; no custom strength meter).
- Sessions: supabase-js stores the JWT in localStorage and auto-refreshes. Sign-out
  clears it.

**Signup is three fields** — username, password, and the Business Owner / Personal
Hobbyist choice — one screen, no verification step. That is the friction floor for
real authentication.

**The honest trade-off of "no email, no phone": there is no password reset.**
A forgotten password means a lost account. The signup screen must say so plainly
("Your password cannot be recovered — there is no email on file"). Do **not**
compensate with custom recovery-code crypto; that violates the proven-technology
rule. If reset ever becomes necessary, the fix is an *optional* email field, not
homemade recovery.

**What we never do:** hash passwords in the browser, store credentials in
localStorage as "auth", roll our own tokens, or treat client-side checks as
security. Local-only guest mode has **no password at all** — a client-side password
would be theater, and theater is worse than nothing.

---

## 3. Analytics design

### 3.1 What counts as what

- **A "generation"** = a successful **download** (PNG or SVG, QR or barcode), not
  every preview re-render. Hook points already exist:
  `download()` in [js/qr-app.js:254](js/qr-app.js#L254) and the two download
  handlers in [js/barcode-app.js:79-106](js/barcode-app.js#L79-L106). One line each:
  `Backend.recordGeneration(kind)`.
- **A "scan"** is only observable for **tracked QR codes** (next section). Static
  QR codes encode the data directly and are invisible after download — the UI must
  say this rather than pretend.

### 3.2 Scan tracking on a static host (dynamic-QR redirect pattern)

A "Track scans" toggle appears in the QR panel for URL content when signed in.
Instead of encoding the target URL, the QR encodes:

```
https://<user>.github.io/<repo>/s.html?c=<short_id>
```

`s.html` is a deliberately tiny page (no app bundle, loads in milliseconds) that:

1. reads `c`, fetches the target URL via an RPC (`resolve_and_log_scan`),
2. sends the scan event in the same call: timestamp; device class parsed from
   `navigator.userAgent` (mobile/tablet/desktop); country derived from
   `Intl.DateTimeFormat().resolvedOptions().timeZone` (the "when available" geo —
   privacy-friendly, no IP lookup, no permission prompt, no third-party API);
   a `repeat` flag from a random visitor id in the scanner's localStorage
   (basis for "unique scans" — best-effort and documented as such),
3. `location.replace(target)` — after validating the scheme is `http(s):` (§6).

If the database is unreachable, `s.html` falls back to a stored-in-QR fallback?
No — the target lives only in the DB (that is the point of tracking). It shows a
brief "link unavailable" message instead. The UI warns creators that tracked codes
depend on the service and the Pages URL staying up; untracked codes never do.

### 3.3 Dashboards (a third tab: "Analytics")

The `account_type` chosen at signup selects which dashboard renders. All charts are
drawn client-side; vendor Chart.js (UMD) into `lib/`, consistent with the existing
vendoring policy.

**Business Owner:**

| Metric | Source |
| --- | --- |
| Total QR codes created | `profiles.codes_created` (+ local guest history merged) |
| Total scans / unique scans | `count(*)` / `count(*) where not repeat` on `scans` |
| Scan trends over time | scans grouped by day, line chart, 7/30/90-day ranges |
| Most popular QR codes | top 10 tracked codes by scan count, with labels |
| Device types | pie of `device_type` |
| Geographic distribution | bar of `country` ("when available" — unknown bucket shown honestly) |
| Conversion-focused | repeat-visit rate, scans-per-code, peak scan hours; plus a tip to add UTM parameters to target URLs so downstream conversion shows up in the user's own web analytics — we cannot see past the redirect and don't pretend to |

**Personal Hobbyist:**

| Metric | Source |
| --- | --- |
| Total QR codes created | as above |
| Most scanned QR code | top-1 with a small spotlight card |
| Scan history | recent scans list (when, device, country) |
| Personal milestones | thresholds: 1st/10th/50th/100th code, 1st/100th/1,000th scan |
| Usage streaks | consecutive days with ≥1 generation, computed client-side from `creation_events` timestamps |
| Fun achievements | computed client-side from existing generator state — e.g. "Colorist" (5 distinct color pairs), "Logo Lover" (first logo QR), "Heavyweight" (a version-30+ QR), "Barcode Polyglot" (4 barcode formats) — no new data collection needed |

Both dashboards read the **same tables**; only the queries and presentation differ.
Guest mode shows the same layout fed from IndexedDB, with scan metrics replaced by
an explainer ("scan tracking needs an account").

---

## 4. Community progress system

**Display:** a slim banner in the existing `<header>`:
`QR Codes Successfully Generated: 4,217 / 10,000` with a progress bar.

**Data:** two tiny tables (`community_stats` single row, `milestones` history) and
one RPC, `record_generation()`, callable by anonymous and signed-in visitors alike
(guests' downloads count toward the community total — it is a *community* number).
The function, atomically in one transaction:

1. `UPDATE community_stats SET total = total + 1` (row-locked ⇒ no lost updates),
2. if `total >= current_goal`: insert a `milestones` row (`goal`, `reached_at`)
   and advance `current_goal` through the fixed ladder
   100 → 1,000 → 10,000 → 100,000 → 1,000,000 → 10,000,000,
3. return `{ total, goal, milestone_just_reached }`.

This answers "how can global statistics exist on static hosting": the static page
makes one HTTPS call to a managed Postgres function. The milestone state machine
runs **inside the database**, so a tampered client can at worst add counts (§6) —
it can never corrupt the goal ladder or the history.

**Frontend behavior:**

- On load, fetch `{total, goal}`; cache in localStorage for instant paint next visit.
- Refresh the number on every own-download response, plus a 60-second poll while
  the tab is visible. (Supabase Realtime could push updates, but polling one tiny
  row is simpler and well within free-tier limits — simplest thing that works.)
- When a response carries `milestone_just_reached`: a celebration overlay — CSS
  confetti animation, "🎉 100,000 codes generated by the community!", auto-dismiss,
  `aria-live="polite"` announcement for screen readers.
- "Past milestones" link in the banner opens the preserved history (goal + date
  reached) from the `milestones` table.
- In local-only mode the banner hides (a per-browser number labeled "community"
  would be a lie).

---

## 5. Database / storage strategy

### 5.1 Postgres schema (Supabase migration)

```sql
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  username      text not null,
  account_type  text not null check (account_type in ('business','personal')),
  codes_created integer not null default 0,
  created_at    timestamptz not null default now()
);
create unique index profiles_username_ci on profiles (lower(username));

create table qr_codes (              -- tracked codes only
  short_id   text primary key,       -- 8-char base58, generated client-side, collision-checked
  owner      uuid not null references profiles on delete cascade,
  target_url text not null check (target_url ~* '^https?://'),
  label      text not null default '',
  created_at timestamptz not null default now()
);

create table scans (
  id          bigint generated always as identity primary key,
  short_id    text not null references qr_codes on delete cascade,
  scanned_at  timestamptz not null default now(),
  device_type text not null default 'unknown',   -- mobile | tablet | desktop | unknown
  country     text,                              -- country name from timezone, nullable
  is_repeat   boolean not null default false
);

create table creation_events (       -- powers trends, streaks, milestones
  id         bigint generated always as identity primary key,
  owner      uuid not null references profiles on delete cascade,
  kind       text not null check (kind in ('qr','barcode')),
  created_at timestamptz not null default now()
);

create table community_stats (
  id           int primary key default 1 check (id = 1),
  total        bigint not null default 0,
  current_goal bigint not null default 100
);
insert into community_stats default values;

create table milestones (
  goal       bigint primary key,
  reached_at timestamptz not null
);
```

### 5.2 Row Level Security (the whole authorization model)

```sql
-- profiles: owner reads/updates own row; insert own row at signup
-- qr_codes: owner full CRUD on own rows; NO public select
--           (s.html resolves targets via the RPC below, never by reading the table)
-- scans:    owner select where short_id in (own codes); inserts only via RPC
-- creation_events: owner select/insert own rows
-- community_stats, milestones: public select; writes only via RPC
```

### 5.3 RPC functions (`security definer`, the only write paths for shared state)

- `record_generation(kind text)` — community counter + milestone ladder (§4);
  if signed in, also appends a `creation_events` row and bumps `codes_created`.
  Rate-limited inside the function: max 1 increment per 3 seconds per auth uid
  (and best-effort for anon callers) — a human downloading codes never notices.
- `resolve_and_log_scan(short_id, device_type, country, repeat)` — returns the
  target URL and inserts the scan row in one round trip. Validates `short_id`
  exists; clamps `device_type`/`country` to known values server-side.

### 5.4 Browser-side storage

| Store | Contents | Why |
| --- | --- | --- |
| **IndexedDB** (`codesafe-local`) | guest creation events (timestamps, kind, style facts for achievements) | structured, unlimited-ish, survives localStorage pressure |
| **localStorage** | Supabase session (managed by supabase-js); cached `{total, goal}` for instant banner paint; scanner visitor-id on `s.html` | tiny key-value needs |
| **No Web Workers** | — | nothing here is CPU-bound; listed for completeness because the constraints mention them — adding one would be unjustified complexity |

On first sign-in, offer a one-time merge of guest IndexedDB history into the
account (`creation_events` bulk insert), so pre-signup activity isn't lost.

---

## 6. Security considerations

1. **The anon key is public — by design.** On a static site every secret ships to
   the client. Supabase's model assumes this: the anon key only grants what RLS
   policies and RPCs allow. There must be **no** policy like `using (true)` for
   writes, and the `service_role` key never appears in the repo.
2. **No custom cryptography.** Passwords: GoTrue/bcrypt server-side. Transport:
   TLS. Sessions: GoTrue JWTs. The frontend never hashes, signs, or encrypts.
3. **Counter abuse is bounded, not eliminated.** Any client-callable increment can
   be scripted. Mitigations: server-side rate limit in `record_generation`,
   counts capped at +1 per call, milestone logic server-side so spam can only make
   the community *faster*, never corrupt state. For a feel-good community number
   this is proportionate; don't build CAPTCHA for it.
4. **Open-redirect / XSS via tracked codes.** `target_url` is checked
   `^https?://` both in the DB (`check` constraint) and in `s.html` before
   `location.replace` — `javascript:` and `data:` URLs are impossible. Labels and
   usernames are rendered with `textContent`, never `innerHTML` (the existing code
   already follows this discipline).
5. **Privacy.** No IPs stored, no precise geolocation, no third-party trackers,
   no fingerprinting beyond a self-set random visitor id. Geography is
   timezone-derived country only. Untracked QR/barcode content **never leaves the
   browser** — only the count does — so the footer promise needs just one honest
   amendment: "generation counts and, for tracked codes, scan events are stored in
   our database."
6. **Account loss is permanent** (no email ⇒ no reset). Stated at signup, §2.
7. **Enumeration.** Signup reveals whether a username is taken — unavoidable for
   any unique-username system; passwords remain protected by GoTrue's rate limits.

---

## 7. Implementation plan

Each phase leaves the site deployable and the existing test suites green
(`cscript //nologo test/run-tests.js`, `test/integration.html`).

**Phase 0 — Service setup** (one-time, manual, ~15 min)
Create the Supabase project; run the §5 SQL migration; disable email confirmation;
set password min-length 8. Copy URL + anon key into `js/config.js`. Document all of
this in the README (mirroring the existing GitHub Pages instructions' style).

**Phase 1 — Backend adapter + local mode**
`js/config.js` (gitignored values optional — anon key is safe to commit),
`js/backend.js` exposing one interface (`recordGeneration`, `getCommunityStats`,
`signUp`, `signIn`, `signOut`, `currentUser`, `createTrackedCode`, `fetchAnalytics`,
`mergeGuestHistory`) with two implementations: supabase-js when configured,
IndexedDB/no-op when not. Vendor `lib/supabase.js` (UMD). All later phases call
only this interface — this is what keeps Firebase as a drop-in alternative.

**Phase 2 — Community banner**
Banner markup in the `<header>` of [index.html](index.html); hook
`Backend.recordGeneration` into the three download paths
([js/qr-app.js:254](js/qr-app.js#L254),
[js/barcode-app.js:79](js/barcode-app.js#L79),
[js/barcode-app.js:87](js/barcode-app.js#L87)); localStorage paint cache;
60 s visibility-gated poll; celebration overlay + milestone history popover.

**Phase 3 — Accounts**
Header account button + modal (sign in / sign up with username, password, profile
type). Profile row creation on signup. Guest-history merge prompt on first sign-in.
Lost-password warning copy.

**Phase 4 — Tracked QR codes + `s.html`**
"Track scans" toggle in the QR Content fieldset (visible when signed in and content
is a URL); on download, create the `qr_codes` row first, then encode the `s.html`
short link. Build `s.html` standalone — an anonymous RPC needs no client library,
so it is one plain `fetch` plus ~60 lines inline: resolve, log, validate scheme,
redirect. The scanner's phone never downloads the app bundle.

**Phase 5 — Analytics tab**
Third tab via the existing [tabs.js](js/tabs.js) mechanism. Vendor Chart.js.
Business and personal dashboard renderers over the shared `fetchAnalytics` data;
streak/achievement computation client-side; guest variant from IndexedDB.

**Phase 6 — Tests + docs**
Unit tests: milestone-ladder logic (mirrored in JS for the celebration check),
streak computation, device/timezone parsing, URL-scheme validation. Integration
tests in the existing harness with the local backend. README: new features,
Supabase setup, the static-vs-tracked QR distinction, privacy note.

**Explicitly out of scope** (per "do not add features beyond these requirements"):
email/phone fields, password reset flows, OAuth providers, teams/sharing, QR scan
A/B testing, paid-tier scaling work, service workers/offline-first, and any custom
crypto.

---

### Decision summary

| Deliverable | Decision |
| --- | --- |
| Architecture | Static site on GitHub Pages + Supabase consumed from the browser; local-only fallback mode |
| Authentication | Supabase Auth (GoTrue), username via synthetic `.invalid` email, no custom crypto, no reset (disclosed) |
| Analytics | Generation events at download time; scan tracking via `s.html` redirect pattern; profile-type-selected dashboards over shared tables |
| Community progress | Single-row counter + milestone ladder advanced atomically in a Postgres RPC; banner with poll + celebration + preserved history |
| Storage | Postgres with RLS for shared/user data; IndexedDB for guest history; localStorage for session + paint cache |
| Security | RLS as the authorization model, server-side rate limiting, URL-scheme validation, timezone-only geo, honest limits documented |
| Plan | Six phases, each independently deployable, adapter-isolated so the BaaS is swappable |
