/* RouteMap — real-map route chart. Raster tiles (CARTO "light_all", © OpenStreetMap
   contributors, © CARTO — open, keyless) with an SVG route overlay.
   Falls back to the built-in paper chart whenever tiles can't load (offline / blocked),
   so the game never shows a blank frame. No external libraries. */
'use strict';

(function () {
  const SUBS = ['a', 'b', 'c', 'd'];
  const TILE = 256;
  const instances = new Set();

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function tileUrl(z, x, y) {
    const s = SUBS[Math.abs(x + y + z) % SUBS.length];
    return `https://${s}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`;
  }
  function lngToX(lon, z) { return ((lon + 180) / 360) * Math.pow(2, z); }
  function latToY(lat, z) {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2 * Math.pow(2, z);
  }
  function fitZoom(lat1, lon1, lat2, lon2, w, h) {
    const dl = Math.abs(((lon2 - lon1 + 540) % 360) - 180); // antimeridian-safe span
    let best = 2;
    for (let z = 2; z <= 12; z++) {
      const dx = dl / 360 * Math.pow(2, z) * TILE;
      const dy = Math.abs(latToY(lat1, z) - latToY(lat2, z)) * TILE;
      if (dx <= w * 0.7 && dy <= h * 0.6) best = z; else break;
    }
    return best;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* Build the tile-map markup inside .map-frame for the given route endpoints.
     Calls onFallback() if tiles look unavailable (or if the probe errors out). */
  function mount(frame, originCode, destCode, w, h, onFallback) {
    const E = window.SKYQ;
    const o = E.airportByCode(originCode), d = E.airportByCode(destCode);
    if (!o || !d) { onFallback(); return; }

    const z = fitZoom(o.lat, o.lon, d.lat, d.lon, w, h);
    const x1 = lngToX(o.lon, z), y1 = latToY(o.lat, z);
    const x2 = lngToX(d.lon, z), y2 = latToY(d.lat, z);
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    // viewport centered on the route midpoint (pixels!): center tile coords × TILE
    const spanPxX = (maxX - minX) * TILE;
    const viewW = Math.max(w, spanPxX + 80);
    const viewH = h;
    const originPxX = cx * TILE - viewW / 2;
    const originPxY = cy * TILE - viewH / 2;

    const tiles = [];
    const tx0 = Math.floor(originPxX / TILE), tx1 = Math.floor((originPxX + viewW) / TILE);
    const ty0 = Math.floor(originPxY / TILE), ty1 = Math.floor((originPxY + viewH) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        if (ty < 0 || ty >= Math.pow(2, z)) continue;
        const wrapped = ((tx % Math.pow(2, z)) + Math.pow(2, z)) % Math.pow(2, z);
        tiles.push(`<img class="rm-tile" src="${tileUrl(z, wrapped, ty)}" alt="" draggable="false"
          style="left:${tx * TILE - originPxX}px;top:${ty * TILE - originPxY}px">`);
      }
    }

    const sx = x => x * TILE - originPxX;
    const sy = y => y * TILE - originPxY;
    const ax = sx(x1), ay = sy(y1), bx = sx(x2), by = sy(y2);
    // vertical-lifted arc, like the paper chart
    const lift = Math.max(18, Math.min(46, Math.hypot(bx - ax, by - ay) * 0.18));

    frame.innerHTML = `
      <div class="rm-tiles" style="width:${w}px;height:${h}px">${tiles.join('')}</div>
      <div class="rm-veil"></div>
      <svg class="rm-route" width="${viewW}" height="${viewH}" viewBox="0 0 ${viewW} ${viewH}" xmlns="http://www.w3.org/2000/svg">
        <path d="M ${ax} ${ay} Q ${(ax + bx) / 2} ${Math.min(ay, by) - lift} ${bx} ${by}"
          fill="none" stroke="var(--red)" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="2 8"/>
        <circle cx="${ax}" cy="${ay}" r="6" fill="var(--blue)" stroke="var(--paper)" stroke-width="2.5"/>
        <circle cx="${bx}" cy="${by}" r="6" fill="var(--red)" stroke="var(--paper)" stroke-width="2.5"/>
        <text x="${ax}" y="${ay - 12}" text-anchor="middle">${esc(o.code)}</text>
        <text x="${bx}" y="${by - 12}" text-anchor="middle">${esc(d.code)}</text>
      </svg>
      <div class="rm-attr">© OpenStreetMap · © CARTO</div>`;

    // probe: if the first tile errors, fall back to the paper chart
    const probe = frame.querySelector('.rm-tile');
    let done = false;
    const fallback = () => { if (!done) { done = true; onFallback(); } };
    if (!probe) { fallback(); return; }
    probe.addEventListener('error', fallback);
    probe.addEventListener('load', () => { done = true; });
    setTimeout(fallback, 6000); // no tiles after 6s ⇒ paper chart
    instances.add(frame);
  }

  function unmount(frame) { instances.delete(frame); }

  window.RouteMap = { mount, unmount };
})();
