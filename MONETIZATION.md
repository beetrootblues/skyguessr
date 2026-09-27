# SKYGUESSR Monetization Playbook

Everything is wired to one config block: `AD_CONFIG` in `js/ads.js`.
Replace the placeholder IDs and the same code serves the website and the app.

## Revenue streams (in priority order)

### 1. Display ads
| Surface | Web | iOS |
|---|---|---|
| Placement | 2 slots below the board (adaptive banner + 300×250 rectangle) | Adaptive banner, bottom |
| Network | Google AdSense | Google AdMob |
| Filled by | `Monetization.initWebAds()` | `Monetization.initNativeAds()` |

- **Setup (web):** create an AdSense account → add site → create 2 display units →
  paste `client` + slot IDs into `AD_CONFIG.adsense`.
- **Setup (iOS):** create an AdMob app (iOS) → 1 adaptive banner unit + 1 rewarded unit →
  paste IDs into `AD_CONFIG.admob`. Add the AdMob Capacitor plugin:
  ```bash
  npm install @capacitor-community/admob
  npx cap sync ios
  ```
  `ads.js` already calls `AdMob.initialize / showBanner / prepareRewardVideoAd /
  showRewardVideoAd` through the Capacitor plugin bridge.
- The **"ADVERTISEMENT"** label above each slot is intentional: AdSense requires ads to be
  clearly distinguishable.

### 2. Rewarded video (the best converter in puzzle games)
The 💡 hint economy is ad-native:
- Player taps 💡 next to Origin/Destination → **"WATCH AD · GET 💡"** → rewarded video →
  hint banked → spends it to reveal one airport.
- One hint per side per game caps the economy; hints cost points (−150 each), so
  competitive players still avoid them.
- Web fallback before you configure anything: the button works instantly (demo grant) so
  you can test the flow; AdMob/AdSense rewarded replaces it in production.

### 3. Interstitial cadence (frequency-capped)
After a player finishes **all 3 dailies**, one interstitial/house-ad shows (max ~once/day
by design). This is the lowest-annoyance, highest-relevance moment. Wire AdMob
`showInterstitial` with the same plugin; the trigger is already in `app.js`.

### 4. In-app purchase — "Remove Ads" ($2.99–3.99 one-time)
- Product id: `com.skyq.removeads` (non-consumable).
- `Monetization.purchase('com.skyq.removeads')` flips the local flag, hides every ad slot,
  and is respected by all future ad calls (web + native).
- **Wire the store:** add `cordova-plugin-purchase` or RevenueCat's Capacitor SDK, then in
  `purchase()` call the real store API and only set the flag after a verified purchase.
- Price anchor: daily-play habits make one-time remove-ads a top-3 revenue line for
  Wordle-likes.

### 5. Hint packs (consumables, optional)
`com.skyq.hints5 / hints20 / hints60` — sell 💡 bundles to ad-averse players.
Same `purchase()` seam. Suggested pricing: $0.99 / $2.99 / $5.99.

### 6. Web payments (no app-store cut)
On the website you can sell Remove Ads via Stripe Payment Link and set
`localStorage.skyq.removeads = 1` on the success page — 100% margin vs 70/30 in-app.

## Policy must-dos before going live
1. **AdSense:** privacy policy URL is mandatory (a Privacy & Terms modal ships in-app;
   host it at `/privacy` too for the AdSense review).
2. **GDPR/UK:** add a Consent Management Platform (Google's own CMP or Funding Choices)
   before serving personalized ads in EEA — AdSense requires a certified CMP.
3. **ATT (iOS):** if you enable personalized ads in the app, add the
   `NSUserTrackingUsageDescription` key and the ATT prompt via the AdMob plugin.
4. **AdMob + kids:** do not tag this app "designed for families" — it disables rewarded ads.

## Realistic revenue model (back-of-envelope)
Wordle-like daily games have excellent session economics (3 puzzles/day, ~40s each).
Assuming 1,000 DAU: ≈ 3,000 daily sessions → ~6,000 banner impressions (~$8 RPM) +
~900 rewarded videos (~$15 eCPM) ≈ **$18–20/day**, plus 1–2% remove-ads conversion
(~$60–90/mo). The levers that matter: D30 retention (streaks + archive), rewarded take-rate
(frictionless 💡 flow), and pushing notifications at streak-loss moments.
