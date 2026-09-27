/* SKYQ Route Bureau — interactive world map.
   Renders from assets/world-map.json {countries:[{n,c,p:[rings]}], alias, pins}.
   Zoom/pan via viewBox manipulation; countries clickable → app-level popup. */
'use strict';

const Bureau = (() => {
  const W = 1000, H = 500;
  let svg = null;
  let vb = { x: 0, y: 0, w: W, h: H };
  let data = null, byGeoName = null, ourByGeo = null;
  let homeCountry = null;
  let onPickCountry = null;

  function geoToOur(name) { return (ourByGeo && ourByGeo.get(name)) || name; }

  function flagOf(country) {
    try {
      const iso = window.COUNTRY_ISO && window.COUNTRY_ISO[country];
      if (!iso) return '';
      return String.fromCodePoint(...[...iso.toUpperCase()].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
    } catch (e) { return ''; }
  }

  function opsFor(ourCountry) {
    if (!window.AIRLINES) return [];
    return window.AIRLINES.filter(a => a[2] === ourCountry);
  }

  async function init(container, opts) {
    const o = opts || {};
    onPickCountry = o.onPickCountry || null;
    homeCountry = o.homeCountry || null;

    if (window.WORLD_MAP_JSON) {
      data = window.WORLD_MAP_JSON;
    } else {
      const res = await fetch(o.mapUrl || 'assets/world-map.json');
      data = await res.json();
    }
    byGeoName = new Map(data.countries.map(c => [c.n, c]));
    ourByGeo = new Map(Object.entries(data.alias || {}).map(([ours, geo]) => [geo, ours]));

    container.innerHTML = `
      <div class="bureau-wrap">
        <svg class="bureau-map" id="bureauMap" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
          <rect class="bm-ocean" x="0" y="0" width="${W}" height="${H}"/>
          <g class="bm-graticule">${graticule()}</g>
          <g class="bm-countries" id="bmCountries"></g>
          <g class="bm-pins" id="bmPins"></g>
        </svg>
        <div class="bureau-zoom">
          <button class="bz-btn" id="bzIn" title="Zoom in">＋</button>
          <button class="bz-btn" id="bzOut" title="Zoom out">－</button>
          <button class="bz-btn" id="bzFit" title="Fit world">⌂</button>
        </div>
        <div class="bureau-tip" id="bureauTip"></div>
        <div class="bureau-legend">TAP A COUNTRY FOR ITS CARRIERS · DRAG TO PAN · SCROLL TO ZOOM</div>
      </div>`;

    svg = container.querySelector('#bureauMap');
    renderCountries();
    renderPins();
    bindPanZoom();
    refreshHome();
  }

  function graticule() {
    let s = '';
    for (let lon = -150; lon <= 150; lon += 30) {
      const x = (lon + 180) / 360 * W;
      s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`;
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = (90 - lat) / 180 * H;
      s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`;
    }
    return s;
  }

  function ringPath(ring) { return 'M' + ring.map(p => p[0] + ' ' + p[1]).join('L') + 'Z'; }

  function renderCountries() {
    const g = svg.querySelector('#bmCountries');
    let html = '';
    for (const c of data.countries) {
      const our = geoToOur(c.n);
      const hasOps = opsFor(our).length > 0;
      html += `<path class="bm-country ${hasOps ? 'has-ops' : 'no-ops'}" data-geo="${c.n}" data-our="${our}"
        d="${c.p.map(ringPath).join(' ')}"/>`;
    }
    g.innerHTML = html;
    g.addEventListener('click', ev => {
      const p = ev.target.closest('.bm-country');
      if (p && onPickCountry) onPickCountry(p.dataset.our);
    });
    g.addEventListener('mousemove', ev => {
      const p = ev.target.closest('.bm-country');
      showTip(ev, p ? p.dataset.our : null);
    });
    g.addEventListener('mouseleave', () => hideTip());
  }

  function renderPins() {
    const g = svg.querySelector('#bmPins');
    let html = '';
    for (const [our, ll] of Object.entries(data.pins || {})) {
      if (!ll) continue;
      const x = (ll[0] + 180) / 360 * W, y = (90 - ll[1]) / 180 * H;
      html += `<g class="bm-pin" data-our="${our}">
        <circle cx="${x}" cy="${y}" r="5"/>
        <circle class="pin-dot" cx="${x}" cy="${y}" r="2"/>
      </g>`;
    }
    g.innerHTML = html;
    g.addEventListener('click', ev => {
      const pin = ev.target.closest('.bm-pin');
      if (pin && onPickCountry) onPickCountry(pin.dataset.our);
    });
    g.addEventListener('mousemove', ev => {
      const pin = ev.target.closest('.bm-pin');
      showTip(ev, pin ? pin.dataset.our : null);
    });
    g.addEventListener('mouseleave', () => hideTip());
  }

  function showTip(ev, our) {
    const tip = document.getElementById('bureauTip');
    if (!tip) return;
    if (!our) { tip.style.display = 'none'; return; }
    const n = opsFor(our).length;
    tip.innerHTML = `${flagOf(our)} <b>${our}</b><span>${n} carrier${n === 1 ? '' : 's'}</span>`;
    tip.style.display = 'block';
    const wrap = tip.parentElement.getBoundingClientRect();
    tip.style.left = Math.min(ev.clientX - wrap.left + 14, wrap.width - 160) + 'px';
    tip.style.top = (ev.clientY - wrap.top - 36) + 'px';
  }
  function hideTip() {
    const tip = document.getElementById('bureauTip');
    if (tip) tip.style.display = 'none';
  }

  /* ---------- pan & zoom ---------- */
  function applyVB() {
    vb.w = Math.max(W / 8, Math.min(W * 1.6, vb.w));
    vb.h = vb.w * (H / W);
    vb.x = Math.max(-W * 0.3, Math.min(W - vb.w * 0.7, vb.x));
    vb.y = Math.max(-H * 0.3, Math.min(H - vb.h * 0.7, vb.y));
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }
  function zoomAt(factor, cx, cy) {
    const wx = vb.x + cx * vb.w / W, wy = vb.y + cy * vb.h / H;
    vb.w *= factor;
    vb.h = vb.w * (H / W);
    vb.x = wx - cx * vb.w / W;
    vb.y = wy - cy * vb.h / H;
    applyVB();
  }
  function bindPanZoom() {
    let drag = null, moved = false;
    svg.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, vx: vb.x, vy: vb.y }; moved = false; });
    svg.addEventListener('pointermove', ev => {
      if (!drag) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (!moved) return;
      const rect = svg.getBoundingClientRect();
      vb.x = drag.vx - dx * vb.w / rect.width;
      vb.y = drag.vy - dy * vb.h / rect.height;
      applyVB();
    });
    svg.addEventListener('pointerup', () => { drag = null; });
    svg.addEventListener('wheel', ev => {
      ev.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAt(ev.deltaY > 0 ? 1.2 : 1 / 1.2, (ev.clientX - rect.left) * W / rect.width, (ev.clientY - rect.top) * H / rect.height);
    }, { passive: false });
    svg.addEventListener('dblclick', ev => {
      const rect = svg.getBoundingClientRect();
      zoomAt(1 / 1.6, (ev.clientX - rect.left) * W / rect.width, (ev.clientY - rect.top) * H / rect.height);
    });
    svg.addEventListener('click', ev => {
      if (moved) { ev.stopPropagation(); moved = false; }
    }, true);
    document.getElementById('bzIn').addEventListener('click', () => zoomAt(1 / 1.4, W / 2, H / 2));
    document.getElementById('bzOut').addEventListener('click', () => zoomAt(1.4, W / 2, H / 2));
    document.getElementById('bzFit').addEventListener('click', () => { vb = { x: 0, y: 0, w: W, h: H }; applyVB(); });
    applyVB();
  }

  function focusCountry(our) {
    const geoName = (data.alias && data.alias[our]) || our;
    const c = byGeoName.get(geoName);
    let cx, cy;
    if (c) { cx = c.c[0]; cy = c.c[1]; }
    else if (data.pins && data.pins[our]) {
      cx = (data.pins[our][0] + 180) / 360 * W;
      cy = (90 - data.pins[our][1]) / 180 * H;
    } else return;
    vb.w = 200; vb.h = 100;
    vb.x = cx - 100; vb.y = cy - 50;
    applyVB();
    svg.querySelectorAll('.bm-country.selected').forEach(x => x.classList.remove('selected'));
    const shape = svg.querySelector(`.bm-country[data-geo="${CSS.escape(geoName)}"]`);
    if (shape) shape.classList.add('selected');
  }

  function refreshHome() {
    if (!svg) return;
    svg.querySelectorAll('.bm-home').forEach(x => x.remove());
    if (!homeCountry) return;
    const geoName = (data.alias && data.alias[homeCountry]) || homeCountry;
    const c = byGeoName.get(geoName);
    let cx, cy;
    if (c) { cx = c.c[0]; cy = c.c[1]; }
    else if (data.pins && data.pins[homeCountry]) {
      cx = (data.pins[homeCountry][0] + 180) / 360 * W;
      cy = (90 - data.pins[homeCountry][1]) / 180 * H;
    } else return;
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'bm-home');
    g.innerHTML = `<circle cx="${cx}" cy="${cy}" r="11" fill="none"/><circle cx="${cx}" cy="${cy}" r="3.6"/>`;
    svg.appendChild(g);
  }

  return { init, focusCountry, setHome(c) { homeCountry = c; refreshHome(); }, flagOf, opsFor };
})();

if (typeof window !== 'undefined') window.Bureau = Bureau;
