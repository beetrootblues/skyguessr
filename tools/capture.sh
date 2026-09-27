#!/usr/bin/env bash
# SKYGUESSR — App Store screenshot capture
#
# Boots an iOS Simulator, opens the game's built-in photo-booth mode (#photo) in Safari,
# drives scripted game states, and captures every App Store display size in one pass:
#   • 6.9"  iPhone 17 Pro Max / 16 Pro Max   (1320×2868 required)
#   • 6.5"  iPhone 11 Pro Max / XS Max       (1242×2688 required)
#   • 13"   iPad Pro 13-inch                 (2064×2752 required)
# The page signals each staged state via /__pb/<kind>; this script serves the web
# assets from a local port and waits on the request log so captures never race.
#
# Usage:
#   bash tools/capture.sh                 # all sizes
#   bash tools/capture.sh 6.9 6.5         # subset
#   SHOTS=board,win bash tools/capture.sh # subset of states (see SHOT_ORDER below)
#
# Output: build/screenshots/<size>/<NN>-<kind>.png  (+ .log for upload debugging)
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-5173}"
[ "$PORT" = "0" ] && PORT=5173   # CI shells sometimes export PORT=0
OUT="${OUT:-build/screenshots}"
IFS=',' read -r -a SHOT_ORDER <<< "${SHOTS:-board,clues,win,map,bureau,charter,stats}"

have() { command -v "$1" >/dev/null 2>&1; }
for tool in xcrun python3 sips; do
  have "$tool" || { echo "❌ $tool is required"; exit 1; }
done
xcrun -f simctl >/dev/null 2>&1 || { echo "❌ simctl not found (install Xcode)"; exit 1; }

echo "==> Building fresh web assets"
node tools/build-www.js

# tiny static server that logs /__pb/<kind> beacons so the runner can sync on them
serve() {
  python3 - "$PORT" <<'PY'
import http.server, socketserver, sys, os, threading
os.chdir('www')  # serve the built web bundle, not the repo root
port = int(sys.argv[1])
beacons = []
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        with open('/tmp/skyq_pb_reqs', 'a') as f: f.write(self.path + '\n')
        if self.path.startswith('/__pb/'):
            beacons.append(self.path.split('/')[-1])
            self.send_response(204); self.end_headers(); return
        super().do_GET()
    def log_message(self, *a): pass
class S(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
srv = S(('127.0.0.1', port), H)
def watch():
    import time
    while True:
        time.sleep(0.25)
        with open('/tmp/skyq_pb_beacons', 'a') as f:
            for b in list(beacons):
                f.write(b + '\n')
            beacons.clear()
threading.Thread(target=watch, daemon=True).start()
srv.serve_forever()
PY
}

# wait until /tmp/skyq_pb_beacons contains all expected kinds (in order, latest occurrence)
await_beacons() {
  local want=("$@") got n
  for _ in $(seq 1 100); do # up to 25s per state
    got=(); n=0
    for w in "${want[@]}"; do
      if tail -50 /tmp/skyq_pb_beacons 2>/dev/null | grep -q "^${w}$"; then
        got+=("$w")
      fi
    done
    [ "${#got[@]}" -eq "${#want[@]}" ] && return 0
    sleep 0.25
  done
  echo "⚠️  beacons not seen: $(printf '%s ' "${want[@]}")"
  return 1
}

# SKIP_SERVE=1 reuses a server you already run on $PORT (e.g. for CI sandbox reaping)
if [ "${SKIP_SERVE:-0}" = "1" ]; then
  curl -sf -o /dev/null "http://127.0.0.1:${PORT}/index.html" || { echo "❌ no server on :$PORT — start one or unset SKIP_SERVE"; exit 1; }
  echo "==> Using external server on :$PORT"
else
  # another instance (or a stray dev server) on our port ⇒ beacons go missing — clear it FIRST
  lsof -ti tcp:"$PORT" 2>/dev/null | xargs kill 2>/dev/null || true
  sleep 0.3
  serve & SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
  for _ in $(seq 1 20); do
    curl -sf -o /dev/null "http://127.0.0.1:${PORT}/index.html" && break
    sleep 0.5
  done
  curl -sf -o /dev/null "http://127.0.0.1:${PORT}/index.html" || { echo "❌ local server failed to start"; exit 1; }
fi
: > /tmp/skyq_pb_beacons

URL="http://127.0.0.1:${PORT}/index.html"   # cache-buster goes BEFORE the hash
SHOT_LIST="${SHOTS:-board,clues,win,map,bureau,charter,stats}"
SHOT_COUNT=0

capture_size() {
  local label="$1" device="$2" kind_offset="$3"
  # cold boots take minutes — only wait when actually booting; leave the sim booted after
  if ! xcrun simctl list devices booted | grep -q "$device"; then
    echo "==> Cold booting $label (first run takes a few minutes)"
    xcrun simctl boot "$device" 2>/dev/null || true
    xcrun simctl bootstatus "$device" -b >/dev/null 2>&1 || true
  fi

  # clean, reviewer-like status bar (9:41, full bars); best-effort on older runtimes
  xcrun simctl status_bar "$device" override \
    --time "9:41" --batteryLevel 100 --batteryState charged \
    --wifiBars 3 --cellularBars 4 --dataNetwork wifi 2>/dev/null || true

  echo "==> Opening photo booth in Safari ($label)"
  : > /tmp/skyq_pb_beacons   # this pass's beacons only — keeps re-runs in sync
  xcrun simctl openurl "$device" "${URL}?pb=$(date +%s)#photo&only=${SHOT_LIST}"

  echo "==> Capturing ${#SHOT_ORDER[@]} states"
  local i=0
  for kind in "${SHOT_ORDER[@]}"; do
    await_beacons "$kind" || true
    local padded
    padded=$(printf '%02d' "$i")
    xcrun simctl io "$device" screenshot "$OUT/$label/$padded-$kind.png" 2>/dev/null \
      || xcrun simctl io "$device" screenshot --mask ignored "$OUT/$label/$padded-$kind.png"
    SHOT_COUNT=$((SHOT_COUNT + 1))
    i=$((i + 1))
  done

  # sim stays booted — re-runs are then fast (use `xcrun simctl shutdown all` to tear down)
}

CROP6_5="1:1:1242:2208" # left:top:width:height — trims top/bottom status/nav areas for 6.5"

for want in "$@"; do
  case "$want" in
    6.9)
      DEV=$(xcrun simctl list devices available | grep -m1 -oE 'iPhone 1[67] Pro Max \([A-F0-9-]+\)' | grep -oE '[A-F0-9-]{25,}')
      [ -z "${DEV:-}" ] && { echo "⚠️  no iPhone Pro Max simulator found — skipping 6.9"; continue; }
      mkdir -p "$OUT/6.9"
      capture_size "6.9" "$DEV" 0
      ;;
    6.5)
      DEV=$(xcrun simctl list devices available | grep -m1 -oE 'iPhone 11 Pro Max \([A-F0-9-]+\)' | grep -oE '[A-F0-9-]{25,}')
      [ -z "${DEV:-}" ] && { echo "⚠️  no iPhone 11 Pro Max simulator found — skipping 6.5"; continue; }
      mkdir -p "$OUT/6.5"
      capture_size "6.5" "$DEV" 0
      # native capture is the modern point size; crop to the exact 1242×2688 App Store frame
      for f in "$OUT/6.5"/*.png; do
        sips -c 2688 1242 --cropOffset 0 0 "$f" >/dev/null 2>&1 || true
      done
      echo "==> 6.5 set cropped to 1242×2688"
      ;;
    ipad|13)
      DEV=$(xcrun simctl list devices available | grep -m1 -oE 'iPad Pro 13-inch \([^)]+\) \([A-F0-9-]+\)' | grep -oE '[A-F0-9-]{25,}')
      [ -z "${DEV:-}" ] && { echo "⚠️  no iPad Pro 13 simulator found — skipping 13"; continue; }
      mkdir -p "$OUT/13"
      capture_size "13" "$DEV" 0
      ;;
    *) echo "⚠️  unknown size '$want' (use: 6.9 6.5 13)";;
  esac
done

if [ "$SHOT_COUNT" -eq 0 ]; then
  echo "❌ no screenshots captured — is a simulator installed? (Xcode → Settings → Platforms)"
  exit 1
fi

echo ""
echo "✅ $SHOT_COUNT screenshots in $OUT/:"
du -sh "$OUT"/* 2>/dev/null
echo ""
echo "Upload order for App Store Connect:"
echo "  6.9 → iPhone 6.9\" display set   |  6.5 → iPhone 6.5\" set  |  13 → iPad Pro 12.9\"/13\" set"
