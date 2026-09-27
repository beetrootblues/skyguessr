# SKYGUESSR — App Store Listing (copy-paste ready)

Character limits verified against App Store Connect fields.
Pair with `bash tools/capture.sh` (see APPSTORE.md §3) — captions below map 1:1 to the
photo-booth states in `build/screenshots/`.

---

## Name (30 chars max)
```
SKYGUESSR — Find the Route
```
(25 chars ✓)

## Subtitle (30 chars max, no keyword spam)
```
Daily flight deduction game
```
(26 chars ✓)

## Promotional text (170 chars max, editable without a new build)
```
A new secret flight every day. Read the clues, feel the distances, land on the exact
origin & destination in 5 guesses. Watch the world's routes come alive. ✈️
```
(~140 chars ✓)

## Description (4000 chars max)

```
Every day, one secret flight departs somewhere on Earth.

SKYGUESSR hands you a 1960s airline ticket with the names torn off. Your job: find the exact origin and destination airports in five guesses or fewer — guided only by great-circle distances, directions, and clues that drip in with every attempt.

HOW IT PLAYS
• Enter any airport pair in the world — by code, city, or a quick search.
• After each guess, the ledger tells you how far off you were and which way to turn, just like Wordle told you which letters were right.
• Every guess reveals a new line of the ticket: the aircraft, its range, the cabin era, even the flight's duration.
• Five rows on the ledger. One route to find. Streaks and daily puzzles keep you coming back.

CHARTER YOUR OWN ROUTE
Don't feel like a worldwide puzzle today? Issue a charter: pin the game to a region (Oceania only? why not), a single country, a class of carrier — flag airlines, low-cost, cargo — or a distance band from short hops to ultra-long-haul. Narrower scopes earn bigger score multipliers. Flip on Extra Hard for tail numbers, airframe ages, engine options and real aviation-history bonuses.

A LIVING MAP
The Route Bureau opens the whole world: tap any country to see its flag carriers, low-cost heroes, cargo haulers and regional connectors — over a thousand airlines across 190 countries. Set your home country and fly from its gates every day.

BUILT FOR THE LOVE OF AVIATION
• 260 real airports, from mega-hubs to single-strip island nations
• Period-perfect ticket design — manila paper, perforated edges, rubber stamps
• Fair seeds: everyone worldwide flies the same route each day
• Practice mode: unlimited tickets, no pressure, no streak risk
• Works offline; your progress stays on your device

No account. No tracking. No timer. Just you, a ticket, and the world's air routes.

The route chart uses map data © OpenStreetMap contributors, tiles © CARTO.
```
(~1,940 chars ✓)

## Keywords (100 chars max, comma-separated, no spaces, don't repeat name/subtitle words)
```
wordle,daily,puzzle,aviation,airports,flights,travel,geography,planes,airline,quiz,logic
```
(87 chars ✓ — "game" and "travel" style generics kept minimal; Wordle is allowed as a keyword but not in the name/subtitle)

## Category
- Primary: **Games → Word**
- Secondary: **Games → Trivia**

## Age rating
4+ (no objectionable content; simulates no gambling; ads noted in questionnaire)

## What's New (v1.0)
```
First release! Daily routes, charters, the Route Bureau world map, practice mode — and a
ticket worth pinning to the fridge.
```

---

## Screenshot plan — 5 shots, mapped to `tools/capture.sh` states

Run: `bash tools/capture.sh 6.9 6.5 13` → `build/screenshots/<size>/NN-<kind>.png`.
All states are scripted and deterministic (seeded), so every device size shows the same game.

| # | Booth state (file) | Caption for App Store Connect (≤ ~40 chars ideal) | What must be on screen |
|---|--------------------|---------------------------------------------------|------------------------|
| 1 | `00-board.png` (`board`) | **Today's ticket. Two names torn off.** | Fresh manila ticket: masthead SKYGUESSR, config strip `WORLD · ALL CARRIERS · ANY RANGE`, clue manifest with several revealed lines (aircraft / duration), empty ledger rows, serial `SER. YYMM-xxx`. |
| 2 | `01-clues.png` (`clues`) | **Every guess brings you closer.** | Two wrong guesses filed: green/red leg cells with ✕/● ticks, km-distance feedback under both fields, one new clue line revealed vs shot 1. |
| 3 | `02-win.png` (`win`) | **Stamp it. Fly home happy.** | 1st-try win: big rubber stamp `STRAIGHT-TO-DESTINATION`, score line, complete ledger, share sheet button visible. |
| 4 | `03-map.png` (`map`) | **See the world. Find the flight.** | Win state with the ROUTE CHART fully revealed: live OpenStreetMap/CARTO tiles, dashed red route arc, both airport pins + codes, `© OpenStreetMap · © CARTO` attribution visible. |
| 5 | `04-bureau.png` (`bureau`) | **190 countries. 1,000+ airlines. Yours.** | Route Bureau world map, UAE popup open: 🇦🇪 flag, airport codes, grouped carrier chips (FLAG / LOW-COST / CARGO), CHARTER + SET AS HOME buttons, home-card visible. |

**Regenerating:** the booth re-stages identical games on every run (seeded routes,
deterministic guesses), so re-shots after design tweaks stay consistent across sizes.
`bureau` stages the UAE popup automatically; `stats` (optional 6th shot: `06-stats.png`)
shows a staged 12-game season — use it if you want a stats/streak tile in the set.

## Framework the captions follow (for future versions)
1. What the game IS (ticket + mystery).
2. The core loop (guess → feedback).
3. The emotional payoff (win/stamp).
4. The differentiator (real map, real distances).
5. The breadth (world/airlines/home country).
