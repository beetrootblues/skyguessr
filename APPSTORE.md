# SKYGUESSR — App Store Launch Checklist

## 0. What you need
- Apple Developer Program membership ($99/yr): https://developer.apple.com/programs
- Xcode 15+ (installed ✅) with your Apple ID in Settings → Accounts
- ~1 hour for first submission

> **Verified in CI (no Apple identity available):** the pinned Capacitor package
> resolves over the network and all web assets build + sync; the actual
> compile/archive step must run on a Mac signed into Xcode (the sandboxed CLI here
> cannot start Apple's build service or create signing identities).

## 1. One-time Xcode setup
```bash
cd skyq
npm install
npx cap sync ios
open ios/App/App.xcodeproj
```
In Xcode:
1. Let it **resolve the `capacitor-swift-pm` package** (needs internet; File → Packages → Resolve).
2. Select the **App** target → **Signing & Capabilities**:
   - Tick *Automatically manage signing*, choose your **Team**.
   - Bundle Identifier is pre-set to `com.skyq.app` — change to something unique
     (you can't register an id already used on App Store Connect).
3. `Product → Run` — play a puzzle in the Simulator to confirm.

## 2. Build the .ipa
```bash
bash tools/build-ipa.sh simulator    # sanity check
bash tools/build-ipa.sh              # produces build/SKYGUESSR.ipa (App Store method)
```
The script archives with your Xcode signing and exports an App Store Connect .ipa.

## 3. App Store Connect
1. https://appstoreconnect.apple.com → My Apps → **+** → New App.
   - Name: `SKYGUESSR — Find the Route` · Bundle id: `com.skyq.app` · SKU: `skyq001`.
2. Upload the .ipa (Xcode Organizer → Distribute, or `xcrun altool --upload-app`).
3. Fill in:
   - **Screenshots:** generate them automatically — `bash tools/capture.sh 6.9 6.5 13`
     boots the Simulator, plays scripted games (photo-booth mode), and writes every
     required size to `build/screenshots/` (6.9" ⇒ 1320×2868, 6.5" crop ⇒ 1242×2688,
     iPad 13" ⇒ 2064×2752). States captured: live board, clues + feedback, win stamp,
     route chart map, world Bureau, charter request, stats/streak. On the first run the
     Simulator cold-boots (a few minutes); leave it booted for fast re-runs.
   - **Keywords:** `wordle,daily,game,travel,aviation,airports,quiz,puzzle,geography,flights`
   - **Category:** Games → Word (secondary: Trivia)
   - **Privacy policy URL:** required — host `MONETIZATION.md` §7's text at `https://yourdomain/privacy`
4. **App Privacy questionnaire:** "Data Not Collected" only if you skip AdMob personalization;
   with AdMob you must declare *Device ID → Analytics/Advertising*.
5. **Age rating:** 4+.
6. Submit for review.

## 4. AdMob pre-flight (do before archiving for release)
The build currently uses **Google's public test ad IDs** (launch-safe, no crash, test ads
only). Before submitting:
1. Create an AdMob app + banner + rewarded units: https://apps.admob.com
2. Replace all six ids in `js/ads.js` (`AD_CONFIG.admob.*`) **and** the
   `GADApplicationIdentifier` in `ios/App/App/Info.plist` (must match the iOS app id).
3. Re-run `npm run cap:sync`. Shipping test ads to production violates AdMob policy and
   earns zero revenue; shipping a placeholder `XXXX…` id **crashes at launch**.

> Also still placeholder until wired: the IAP products (`AD_CONFIG.iap.*`) — the "Remove
> Ads" purchase is NOT live; do not advertise it anywhere user-facing.

## 5. Review notes (paste into the Review Notes box)
> SKYGUESSR is a daily deduction game. All content is bundled offline; no account is needed.
> The app shows a Google AdMob banner and an optional rewarded video that grants one
> in-game hint. If ads fail to load, the hint button simply stays unavailable — the game
> is fully playable without them.
> Test hint flow: tap HINT next to either airport field → WATCH SPONSOR NOTICE.

> ⚠️ Do NOT claim a "Remove Ads" purchase in review notes or store metadata until the IAP
> is actually wired (see MONETIZATION.md §6) — review rejects unfulfillable purchases.

## 6. After approval — first week
- Announce with the share text (Wordle-style emoji grids are built for Twitter/X viral loops).
- Add the site URL + "Add to Home Screen" hint for web players (PWA installs to iOS home screen too).
- Watch AdMob eCPM and the rewarded take-rate in MONETIZATION.md's model.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `Resolve Package Graph` hangs in CLI builds | Resolve once inside Xcode GUI (first run needs network to github.com) — the pinned package is `capacitor-swift-pm` |
| `No signing certificate` / `No profiles for 'com.skyq.app'` | Xcode → Settings → Accounts → add Apple ID; target Signing & Capabilities → pick Team; tick *Automatically manage signing* |
| Archive succeeds, export fails | Check `ios/App/ExportOptions.plist` teamID; confirm paid membership (free accounts can't use `app-store-connect` method) |
| App shows white screen on launch | Re-run `npx cap sync ios` (stale `public/` web assets) |
| Signing error on archive | Xcode → Settings → Accounts → Download Manual Profiles, or re-tick automatic signing |
| `pod` errors | You're on the SPM layout — no CocoaPods needed; make sure `ios/App/CapApp-SPM` exists |
| Icon wrong size | `npm run icons` regenerates every size from `tools/genicons.js` |
