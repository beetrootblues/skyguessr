#!/usr/bin/env bash
# SKYGUESSR — build a distributable .ipa (Capacitor 7 + Swift Package Manager, no CocoaPods)
#
# Prerequisites (one-time):
#   1) npm install                       (installs Capacitor 7)
#   2) open ios/App/App.xcodeproj        (resolves the pinned capacitor-swift-pm package,
#                                         needs internet, ~30s)
#      → App target → Signing & Capabilities:
#          • Automatically manage signing ✓
#          • Select your Team
#          • (optional) change bundle id com.skyq.app to your own
#   3) Apple Developer Program membership for App Store distribution
#
# Usage:
#   bash tools/build-ipa.sh simulator   # no-signing sanity build for the Simulator
#   bash tools/build-ipa.sh             # archive + export App Store .ipa
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Building web assets"
node tools/build-www.js
npx cap sync ios

PROJ="ios/App/App.xcodeproj"
CONFIGURATION="Release"
BUILD_DIR="build"
ARCHIVE="$BUILD_DIR/SKYGUESSR.xcarchive"

echo "==> Preflight"
command -v xcodebuild >/dev/null 2>&1 || { echo "❌ xcodebuild not found. Install Xcode, then: xcode-select --install"; exit 1; }
xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1 || true

if [ "${1:-}" = "simulator" ]; then
  echo "==> Simulator sanity build (no signing needed)"
  xcodebuild -project "$PROJ" -scheme App -configuration Debug \
    -destination "generic/platform=iOS Simulator" -derivedDataPath "$BUILD_DIR/DD" build 2>&1 | tail -5
  APP=$(find "$BUILD_DIR/DD/Build/Products/Debug-iphonesimulator" -maxdepth 1 -name '*.app' 2>/dev/null | head -1 || true)
  echo "==> OK. App at: ${APP:-<not found — see output above>}"
  echo "   Run it:  xcrun simctl install booted \"$APP\" && xcrun simctl launch booted com.skyq.app"
  exit 0
fi

TEAM=$(security find-identity -v -p codesigning 2>/dev/null \
  | grep -oE '\(([A-Z0-9]{10})\)$' | tr -d '()' | head -1 || true)
if [ -z "$TEAM" ]; then
  echo "⚠️  No signing identity found — archive will only work if Xcode can create one"
  echo "   (requires your Apple ID logged into Xcode → Settings → Accounts)."
fi

echo "==> Archiving (automatically managed signing${TEAM:+, team $TEAM})"
xcodebuild -project "$PROJ" -scheme App -configuration "$CONFIGURATION" \
  -destination "generic/platform=iOS" -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates archive

if [ ! -f "ios/App/ExportOptions.plist" ]; then
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo '  <key>method</key><string>app-store-connect</string>'
    echo '  <key>uploadSymbols</key><true/>'
    echo '  <key>signingStyle</key><string>automatic</string>'
    [ -n "$TEAM" ] && echo "  <key>teamID</key><string>$TEAM</string>"
    echo '</dict></plist>'
  } > ios/App/ExportOptions.plist
fi

echo "==> Exporting .ipa"
mkdir -p "$BUILD_DIR"
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist ios/App/ExportOptions.plist \
  -exportPath "$BUILD_DIR" -allowProvisioningUpdates

IPA=$(find "$BUILD_DIR" -maxdepth 1 -name '*.ipa' 2>/dev/null | head -1 || true)
if [ -n "$IPA" ]; then
  echo ""
  echo "✅ Built $IPA"
  echo "   Upload: Xcode Organizer → Distribute App"
  echo "   or:     xcrun altool --upload-app -f \"$IPA\" --apiKey KEY_ID --apiIssuer ISSUER"
else
  echo "❌ No .ipa produced — check signing errors above."
  echo "   Common fixes:"
  echo "   • open ios/App/App.xcodeproj → Signing & Capabilities → pick your Team"
  echo "   • Verify membership: https://developer.apple.com/account"
  echo "   • If 'Resolve Package Graph' hangs: File → Packages → Resolve in Xcode (network)"
  exit 1
fi
