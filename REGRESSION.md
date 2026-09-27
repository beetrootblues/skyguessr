# SKYQ — Regression Test Plan

Manual + automated checklist. Run **T1** (fast, ~30s) after any engine or build change;
run the full sweep (T1–T9) before any release or store submission.

Test harness notes:

- Automated: `npm test` → `tools/test-engine.js` (22 assertions, no framework).
- Manual/browser: serve the folder (`npx serve .` or open `skyq-standalone.html` directly —
  it is fully self-contained). Use DevTools console; a debug hook is exposed as
  `window.SKYQ_DEBUG` with getters `game`, `stats`, `config`, `isPractice` and
  `startPractice()`.
- DevTools helper: throttle CPU 6× and test on the standalone file to emulate the
  low-end WebView on the iOS build.

---

## T1 — Engine unit tests (automated)

`npm test` must print **22 passed, 0 failed**.

| # | Assertion |
|---|-----------|
| 1 | Deterministic daily seed — same seed ⇒ identical origin/dest/aircraft/airline |
| 2 | Different days produce different routes |
| 3 | Difficulty tiers: easy ≤ 2 guesses-locked clues, hard reveals fewest clues up front |
| 4 | Guesses: correct pair wins; wrong pair appends a row with distance/bearing |
| 5 | Loss after `maxGuesses()` (5) wrong guesses |
| 6 | Scoring: base table [1000,700,500,350,200] − 150/hint, floored at 50 |
| 7 | Country scope: both endpoints inside the charter country |
| 8 | Region scope: both endpoints inside the region |
| 9 | Carrier-class scope: airline group matches (e.g. CARGO ⇒ freighter aircraft) |
| 10 | Range bands: SHORT ≤ ~1500 km, ULTRA ≥ ~9000 km |
| 11 | Extra-hard: registration, airframe year, engine option always present; incident appears sometimes (seeded) |
| 12 | Niche scoring: scoped routes score higher than world routes; cargo bonus ≥ ×1.8 |
| 13 | Score applies niche multiplier |
| 14 | Periphery rule: single-airport countries pair with one of 4 nearest foreign gates |
| 15 | `allowUS:false` (hard) never yields a US endpoint |
| 16 | Clue schedule: unlock order 2..5; extra-hard adds REGISTRATION/AIRFRAME/ENGINES |
| 17 | Share emoji grid: `X/5` header on loss, hit/miss glyphs match guesses, hint counter |
| 18 | `blankStats()` shape and `updateStats` streak reset on loss |
| 19 | Unknown airport guess rejected |
| 20 | Same-code guess rejected |
| 21 | Aircraft always feasible: `aircraft.range ≥ 0.9 × route.km` (50 seeds) |
| 22 | Mileage/duration math consistent with great-circle distance |

**Engine invariants (added during the Sept-28 hardening — keep these true):**

- `makeRoute` **never throws**, whatever scope it is handed (unknown country ⇒ degrades
  to world scope; conflicting country+region ⇒ country wins; empty pool ⇒ full list).
- Every returned route is **flyable**: range cap also respects the longest freighter
  (`maxFrRange / 1.02`) so a picked CARGO airline never needs an impossible aircraft.
- When no in-band pair exists inside a narrow scope (e.g. LONG band in Japan), the route
  is the **closest-to-band pair still within aircraft range** — never a silently
  out-of-band random pair.

---

## T2 — Boot & first render

| # | Step | Expected |
|---|------|----------|
| 2.1 | Fresh profile, open app | Ticket renders ≤ 1s; no console errors |
| 2.2 | First visit | Manual/how-to dialog opens once; closed state persists (`skyq.seenHelp`) |
| 2.3 | Serial line | `SER. YYMM-xxx` matches today's date; changes next day |
| 2.4 | Config strip | Reads `WORLD · ALL CARRIERS · ANY RANGE` and hidden `×1` badge by default |
| 2.5 | Saved game mid-day | Reload restores guesses/status/hints exactly (localStorage `skyq.<diff>.game`) |
| 2.6 | Day rollover | New day ⇒ fresh ticket; old one archived |
| 2.7 | Fonts | Barlow Condensed / Barlow / IBM Plex Mono render (self-hosted woff2, no network) |

**Boot-crash guard (regression):** with garbage/legacy `skyq.charter` in localStorage
(e.g. `{"region":"OC","country":"Japan"}`), boot must still succeed — route degrades,
never throws `undefined[0]`.

## T3 — Ticket & composer

| # | Step | Expected |
|---|------|----------|
| 3.1 | Difficulty tabs | Switch reloads per-difficulty game; active tab highlighted; persists |
| 3.2 | Empty submit | Toast prompts for both fields; no ledger row |
| 3.3 | 1-char autocomplete | Typing `T` lists matches (min length 1); keyboard ↑↓/Enter select |
| 3.4 | Invalid code submit | Toast; no ledger row |
| 3.5 | Same code both fields | Toast "must differ"; no ledger row |
| 3.6 | City-name submit | Typing `tokyo` (or clicking a highlighted suggestion) resolves to a code |
| 3.7 | Clue reveals | Each filed guess reveals next clue; pending rows show `after filing n` |
| 3.8 | Guess counter | `n/5` updates; at 5/5 loss state |

## T4 — Hints & monetization (web)

| # | Step | Expected |
|---|------|----------|
| 4.1 | Hint offer | With tokens or ad available, HINT button enabled |
| 4.2 | Rewarded ad (web demo) | Grants +1 token (`skyq.hintbank`) |
| 4.3 | Spend hint | Reveals one side + fills input; `hintsUsed` +1 (−150 pts) |
| 4.4 | Bank empty | Button disabled/offer path only; no negative bank |
| 4.5 | Practice isolation | Hints in practice don't touch daily save/stats |
| 4.6 | **Native no-free-grant (App Review rule)** | In the iOS bundle (`www/js/ads.js` override), the rewarded path NEVER grants a hint without a completed ad — `ads-unavailable` ⇒ toast only |
| 4.7 | Ad IDs launch-safe | No `ca-app-pub-XXXX…` placeholders anywhere in Info.plist/ads.js (placeholder ⇒ SDK aborts at launch). Test IDs are OK for TestFlight, NOT for production |
| 4.8 | Web ad slots hidden on iOS | `[data-ad] { display:none }` in the native bundle CSS; AdMob banner renders via SDK instead |

## T5 — Charters (region / country / class / band / extra-hard)

| # | Step | Expected |
|---|------|----------|
| 5.1 | Open charter dialog | Region chips, country select, group chips, range slider, EXTRA HARD |
| 5.2 | Region charter | Both endpoints in region; strip shows region name |
| 5.3 | Country charter | Both endpoints in country; **region auto-syncs to the country's region** |
| 5.4 | Region→country conflict | Picking a country from another region drops/re-syncs the region — never an empty scope |
| 5.5 | Class charter | e.g. CARGO ⇒ freighter airline; groups shown on strip |
| 5.6 | Range band | Respected when the scope allows; narrow scopes fall back to nearest-feasible pair |
| 5.7 | Extra hard | REGISTRATION/AIRFRAME/ENGINES clue rows appear; intel line under stamp; incident popup occasionally |
| 5.8 | **Charter re-issue (stale-charter regression)** | Change charter after playing today ⇒ same-day game is re-issued (persisted `charter` mismatch ⇒ new route) |
| 5.9 | Issue during boot guard | No crash if charter dialog confirmed while no game is live |
| 5.10 | Niche badge | Bumps (scale/rotate pop) when multiplier changes; hidden at ×1 |
| 5.11 | Seed suffix | Same charter config ⇒ same route all day (`-<Region>-<Country>-<GROUPS>-<BAND>-XH`) |

## T6 — Route Bureau (world map home screen)

| # | Step | Expected |
|---|------|----------|
| 6.1 | Map renders | 175 country paths; `has-ops` tint for countries with carriers; legend visible |
| 6.2 | Zoom controls | +/− change viewBox; FIT resets |
| 6.3 | Drag/scroll | Pan & wheel-zoom work; country hover fill transition |
| 6.4 | Country click | Popup: flag emoji, airport codes, carriers grouped FLAG/LCC/CARGO/etc., counts |
| 6.5 | Popup actions | `CHARTER <country>` issues a country charter; `SET AS HOME` persists `skyq.home` |
| 6.6 | Home Base dialog | Search filters list; selection persists; home card renders flag + name |
| 6.7 | Home card actions | `FLY <country>` re-issues home-country charter; `CLEAR` removes it |
| 6.8 | Tiny territories | Singapore, Hong Kong SAR, Bahrain, Maldives, Malta resolve via pins |
| 6.9 | Offline | Map JSON inlined (`window.WORLD_MAP_JSON`) — no fetch on the standalone/iOS build |

## T7 — Endgame, stats & archive

| # | Step | Expected |
|---|------|----------|
| 7.1 | Win | Stamp `CONFIRMED` (1st guess: `STRAIGHT-TO-DESTINATION`), slam animation, points line |
| 7.2 | Loss | Stamp `DIVERTED` (red), answer shown, `NO POINTS` line, `.lost` state |
| 7.3 | Stats after loss | `played +1`, `wins` unchanged, **streak → 0**, avg-distance updates |
| 7.4 | Stats after win | `wins +1`, streak continues/breaks correctly vs `lastDay` |
| 7.5 | Archive | Row appended (win/loss, guesses, day); capped at 30; per difficulty |
| 7.6 | Share — win | `SKYQ <date> <D> n/5` + ✅ rows; hint counter when used |
| 7.7 | Share — loss | Header `X/5`, ❌ rows; never shows ✅ for a missed endpoint |
| 7.8 | Share while playing | Blocked with toast |
| 7.9 | Countdown | `stNext` ticks to next local midnight (HH:MM:SS) |
| 7.10 | Practice | `startPractice()` ⇒ ephemeral ticket: no save overwrite, no stats/archive/modal, `NO POINTS` shown, share output correct for its own result |

## T7.5 — Route chart tile map (OpenStreetMap/CARTO overlay)

The ROUTE CHART clue renders **live basemap tiles** (CARTO `light_all`, © OpenStreetMap
contributors, © CARTO — keyless and open) with an SVG route arc on top. A built-in
hand-drawn paper chart renders instead whenever tiles are unavailable.

| # | Step | Expected |
|---|------|----------|
| 7.5.1 | Win-or-reveal a chart, online | `.map-frame` shows `.rm-tile` imgs + `.rm-route` SVG with both airport codes and dashed red arc; attribution `© OpenStreetMap · © CARTO` visible |
| 7.5.2 | Marker accuracy | Airport markers sit on the correct geography (probe: reverse-project marker px → lat/lon through tile coords; error ≤ ~0.1°) |
| 7.5.3 | Zoom fits route | Short hop ⇒ high zoom (city detail); ULTRA ⇒ low zoom (continent); markers never clipped, arc lifted above the line |
| 7.5.4 | Antimeridian | A route crossing ±180° (e.g. trans-Pacific) keeps both markers on-frame — span uses antimeridian-safe delta |
| 7.5.5 | Offline / blocked | `navigator.onLine === false` (or tile error / 6s timeout) ⇒ paper chart renders, **never a blank frame** |
| 7.5.6 | Airline/airport data edge | Unknown airport codes ⇒ immediate paper fallback, no console error |
| 7.5.7 | Theme parity | Veil + marker colors legible in both light and dark themes; attribution readable |
| 7.5.8 | Attribution presence | Required by OSM/CARTO license — must not be removed in any build |

## T8 — Theme, a11y & motion

| # | Step | Expected |
|---|------|----------|
| 8.1 | Theme toggle | Light/dark persisted (`skyq.theme`); respects `prefers-color-scheme` on first run |
| 8.2 | Reduced motion | `prefers-reduced-motion: reduce` kills ALL animations/transitions |
| 8.3 | Animation inventory | `stampIn` (clue reveal), `cellIn` (fresh ledger row only — not replayed on re-render), `slam` (final stamp), `dlgUp` (dialogs), `badgeBump` (niche ×), `stripFlash` (charter summary change), `acIn` (autocomplete), `hcIn` (home card), `groupIn` (popup carrier groups), toast slide |
| 8.4 | No animation loops | Animations fire once per event, not on every `render()` (check by toggling tabs repeatedly) |
| 8.5 | Focus | Dialog close buttons, autocomplete items, tabs reachable via keyboard |
| 8.6 | 480px viewport | Ledger grid, brand, composer all fit; no horizontal scroll |

## T9 — Build, storage & release

| # | Step | Expected |
|---|------|----------|
| 9.1 | `npm test` | 22/22 |
| 9.2 | `node tools/build-single.js` | `skyq-standalone.html` regenerated (~500 KB), loads offline, no console errors |
| 9.3 | `node tools/build-www.js` | `www/` rebuilt, service worker cache-busted (bump `CACHE_VERSION`) |
| 9.4 | iOS sync | `cp -R www/* ios/App/App/public/` before archiving |
| 9.5 | Storage schema | `skyq.<diff>.game` carries `charter` field; legacy saves without it still load (re-issue, don't crash) |
| 9.6 | PWA | Manifest + SW serve; offline reload works |
| 9.7 | Xcode | Package graph resolved + signing team set once in GUI (sandboxed CLI can't); then archive .ipa (see APPSTORE.md) |
| 9.8 | AdMob/AdSense IDs | Production IDs replace Google test IDs (`ca-app-pub-3940…`) in both `js/ads.js` AND Info.plist `GADApplicationIdentifier`; `npm run cap:sync` after |
| 9.9 | Privacy manifest | App + AdMob SDK privacy manifests present (add `PrivacyInfo.xcprivacy` to the app target in Xcode GUI if App Store Connect flags it) |
| 9.10 | Offline first-run | Fresh install with airplane mode: paper chart (not blank), system fonts fallback acceptable, no console errors, Bureau map renders (world-map.json precached) |

---

## Known environment limits (not bugs)

- **Xcode CLI**: `xcodebuild` stalls at *Resolve Package Graph* without network access —
  final .ipa build must be done in the Xcode GUI once (resolves SPM deps + signing).
- **Screenshot compositor** in the test browser may return no frames; verify visually via
  DOM probes (`SKYQ_DEBUG`, `preview_evaluate`) instead.
- Ad network IDs are placeholders until accounts exist (see MONETIZATION.md).
- Route-chart tiles require network at runtime; the paper chart covers offline play by design (iOS offline review builds show the paper chart for the chart clue only).
