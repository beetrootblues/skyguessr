/* SKYQ app controller — ticket edition. */
'use strict';

(function () {
  const $ = id => document.getElementById(id);
  const E = window.SKYQ;

  const DIFFS = ['easy', 'medium', 'hard'];
  const DIFF_META = {
    easy: { label: 'Easy Route', fare: 'any region · hubs', minKm: 1500, maxKm: 9000, allowUS: true, poolLabel: 'ANY REGION · HUB AIRPORTS' },
    medium: { label: 'Medium Route', fare: 'worldwide', minKm: 1000, maxKm: 13000, allowUS: true, poolLabel: 'WORLDWIDE DEPARTURES' },
    hard: { label: 'Hard Route', fare: 'non-US only', minKm: 700, maxKm: 15000, allowUS: false, poolLabel: 'NON-US DEPARTURES' },
  };

  /* ---------- persistent state ---------- */
  const store = {
    get(d, k) { try { return JSON.parse(localStorage.getItem(`skyq.${d}.${k}`) || 'null'); } catch (e) { return null; } },
    set(d, k, v) { try { localStorage.setItem(`skyq.${d}.${k}`, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  let stats = (() => { try { return JSON.parse(localStorage.getItem('skyq.stats') || 'null') || E.blankStats(); } catch (e) { return E.blankStats(); } })();
  let theme = localStorage.getItem('skyq.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  let currentDiff = localStorage.getItem('skyq.diff') || 'hard';

  /* ---------- game state ---------- */
  let game = null;

  /* ---------- minimap (brand palette) ---------- */
  function proj(lat, lon, w, h) {
    const x = (lon + 180) / 360 * w;
    const latR = lat * Math.PI / 180;
    const y = (1 - Math.log(Math.tan(Math.PI / 4 + latR / 2)) / Math.PI) / 2 * h;
    return [x, y];
  }
  function minimapSVG(oCode, dCode, w, h) {
    const o = E.airportByCode(oCode), d = E.airportByCode(dCode);
    const [x1, y1] = proj(o.lat, o.lon, w, h);
    const [x2, y2] = proj(d.lat, d.lon, w, h);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const arcH = Math.min(50, dist * 0.28);
    const nx = -(y2 - y1), ny = (x2 - x1);
    const nl = Math.hypot(nx, ny) || 1;
    const cx = mx + (nx / nl) * arcH, cy = my + (ny / nl) * arcH;
    let grid = '';
    for (let lon = -150; lon <= 150; lon += 30) { const [x] = proj(0, lon, w, h); grid += `<line x1="${x}" y1="0" x2="${x}" y2="${h}"/>`; }
    for (let lat = -60; lat <= 60; lat += 30) { const [, y] = proj(lat, 0, w, h); grid += `<line x1="0" y1="${y}" x2="${w}" y2="${y}"/>`; }
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" fill="var(--paper)"/>
      <g stroke="var(--line-soft)" stroke-width="1" fill="none">${grid}</g>
      <path d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="1 7"/>
      <circle cx="${x1}" cy="${y1}" r="7.5" fill="var(--blue)" stroke="var(--paper)" stroke-width="3"/>
      <circle cx="${x2}" cy="${y2}" r="7.5" fill="var(--red)" stroke="var(--paper)" stroke-width="3"/>
      <text x="${x1}" y="${y1 - 13}" text-anchor="middle" font-family="IBM Plex Mono,Menlo,monospace" font-weight="600" font-size="15" letter-spacing="2" fill="var(--ink)">${oCode}</text>
      <text x="${x2}" y="${y2 - 13}" text-anchor="middle" font-family="IBM Plex Mono,Menlo,monospace" font-weight="600" font-size="15" letter-spacing="2" fill="var(--ink)">${dCode}</text>
    </svg>`;
  }

  /* ---------- game lifecycle ---------- */
  function dayKey(offset) {
    const d = new Date();
    if (offset) d.setDate(d.getDate() + offset);
    return E.todaySeedKey(d);
  }

  /* ---------- charter config (scopes) ---------- */
  const DEFAULT_CONFIG = { region: '*', country: null, groups: [], rangeBand: 'ANY', extraHard: false };
  let charterCfg = (() => {
    try { return { ...DEFAULT_CONFIG, ...(JSON.parse(localStorage.getItem('skyq.charter') || 'null') || {}) }; } catch (e) { return { ...DEFAULT_CONFIG }; }
  })();
  function saveCharter() { try { localStorage.setItem('skyq.charter', JSON.stringify(charterCfg)); } catch (e) { /* ignore */ } }
  function cfgScope() {
    const s = {};
    if (charterCfg.region && charterCfg.region !== '*') s.region = charterCfg.region;
    if (charterCfg.country) s.country = charterCfg.country;
    if (charterCfg.groups && charterCfg.groups.length) s.groups = charterCfg.groups;
    return s;
  }
  function regionForCountry(c) {
    const a = E.AIRPORTS.find(x => x[3] === c);
    return a ? a[4] : null;
  }
  function scopeHasAirports(s) {
    return E.AIRPORTS.some(a =>
      (!s.country || a[3] === s.country) && (!s.region || s.region === '*' || a[4] === s.region));
  }
  function todayGame(d, difficulty) {
    const meta = DIFF_META[difficulty];
    const seed = E.dailySeed(d, difficulty) + charterSeedSuffix();
    const route = E.makeRoute(seed, {
      difficulty, allowUS: meta.allowUS,
      minKm: meta.minKm, maxKm: meta.maxKm,
      scope: cfgScope(), rangeBand: charterCfg.rangeBand,
      extraHard: charterCfg.extraHard,
    });
    return E.newGame(route, difficulty);
  }
  function charterSeedSuffix() {
    const c = charterCfg;
    return (c.region === '*' ? '' : '-' + c.region) + (c.country ? '-' + c.country.replace(/\W+/g, '').slice(0, 10) : '') + (c.groups && c.groups.length ? '-' + c.groups.slice().sort().join('') : '') + (c.rangeBand !== 'ANY' ? '-' + c.rangeBand : '') + (c.extraHard ? '-XH' : '');
  }
  function loadOrStart(difficulty) {
    const saved = store.get(difficulty, 'game');
    const today = dayKey();
    if (saved && saved.day === today
      && !(saved.route && String(saved.route.seed || '').startsWith('practice'))
      && saved.charter === charterSeedSuffix()) {  // stale charter → re-issue
      const g = E.newGame(saved.route, difficulty);
      g.guesses = saved.guesses; g.status = saved.status; g.hintsUsed = saved.hintsUsed || 0;
      g.usedHints = saved.usedHints || { origin: 0, dest: 0 };
      return g;
    }
    return todayGame(today, difficulty);
  }
  function persist() {
    if (practiceMode) return; // practice tickets are ephemeral
    store.set(game.difficulty, 'game', {
      day: dayKey(), guesses: game.guesses, status: game.status,
      hintsUsed: game.hintsUsed, usedHints: game.usedHints, route: game.route,
      charter: charterSeedSuffix(),
    });
  }
  function markArchive(win, count) {
    const a = store.get(game.difficulty, 'archive') || [];
    const today = dayKey();
    const i = a.findIndex(x => x.day === today);
    const entry = { day: today, won: win, guesses: count };
    if (i >= 0) a[i] = entry; else a.unshift(entry);
    store.set(game.difficulty, 'archive', a.slice(0, 30));
  }

  /* ---------- rendering ---------- */
  function render() {
    renderTabs();
    renderHead();
    renderClues();
    renderLedger();
    renderStamp();
    renderStreak();
    renderSerial();
  }
  function renderTabs() {
    const today = dayKey();
    document.querySelectorAll('.class-tab').forEach(el => {
      const d = el.dataset.diff;
      el.classList.toggle('active', d === currentDiff);
      const a = store.get(d, 'archive') || [];
      const done = a.some(x => x.day === today);
      let chk = el.querySelector('.tab-done');
      if (done && !chk) { chk = document.createElement('span'); chk.className = 'tab-done'; chk.textContent = '●'; el.appendChild(chk); }
      if (!done && chk) chk.remove();
    });
  }
  function renderHead() {
    $('diffLabel').textContent = DIFF_META[currentDiff].label;
    $('poolLabel').textContent = DIFF_META[currentDiff].poolLabel;
    $('guessCount').textContent = `${game.guesses.length}/5`;
  }
  function renderClues() {
    const rows = $('clueRows');
    rows.innerHTML = '';
    for (const c of E.clueList(game)) {
      if (c.map) {
        const wrap = document.createElement('div');
        wrap.className = 'clue-map';
        if (c.value) {
          wrap.innerHTML = `<div class="map-frame" style="height:230px"></div>`;
          const frame = wrap.firstElementChild;
          const drawPaper = () => {
            if (frame.dataset.paper) return;
            frame.dataset.paper = '1';
            frame.style.height = '';
            frame.innerHTML = minimapSVG(c.value.origin, c.value.dest, 640, 230);
          };
          if (window.RouteMap && navigator.onLine) {
            RouteMap.mount(frame, c.value.origin, c.value.dest, 640, 230, drawPaper);
          } else {
            drawPaper();
          }
        } else {
          const row = document.createElement('div');
          row.className = 'clue';
          row.innerHTML = `<span class="clue-label">ROUTE CHART</span><span class="clue-dots"></span><span class="clue-value pending">stamp on arrival</span>`;
          wrap.appendChild(row);
        }
        rows.appendChild(wrap);
        continue;
      }
      const row = document.createElement('div');
      row.className = 'clue';
      const val = c.value === null
        ? `<span class="clue-value pending">after filing ${c.unlockAt - 1}</span>`
        : `<span class="clue-value revealed">${c.value}</span>`;
      row.innerHTML = `<span class="clue-label">${c.label}</span><span class="clue-dots"></span>${val}`;
      rows.appendChild(row);
    }
  }
  function renderLedger() {
    const rows = $('guessRows');
    rows.innerHTML = '';
    for (let i = 0; i < E.maxGuesses(); i++) {
      const g = game.guesses[i];
      const row = document.createElement('div');
      row.className = 'leg-row';
      if (g) {
        const dist = (g.originOk && g.destOk)
          ? ''
          : `<div class="leg-dist">${E.fmtKm(g.distO)}<span class="sep">·</span>${E.fmtKm(g.distD)} km</div>`;
        const fresh = i === game.guesses.length - 1; // only the just-filed guess stamps in
        const st = fresh ? ' stampin' : '';
        row.innerHTML = `
          <div class="leg-num">${String(i + 1).padStart(2, '0')}</div>
          <div class="leg-cell ${g.originOk ? 'hit' : 'miss'}${st}"><span>${g.origin}</span><span class="tick">${g.originOk ? '●' : '✕'}</span></div>
          <div class="leg-cell ${g.destOk ? 'hit' : 'miss'}${st}"><span class="arrow">✈</span><span>${g.dest}</span><span class="tick">${g.destOk ? '●' : '✕'}</span></div>
          ${dist || '<div></div>'}`;
      } else {
        row.innerHTML = `
          <div class="leg-num">${String(i + 1).padStart(2, '0')}</div>
          <div class="leg-cell empty"><span>————</span></div>
          <div class="leg-cell empty"><span class="arrow">✈</span><span>————</span></div>
          <div></div>`;
      }
      rows.appendChild(row);
    }
  }
  function renderStamp() {
    const wrap = $('stampWrap');
    if (game.status === 'playing') { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    const won = game.status === 'won';
    const stamp = $('stampText');
    stamp.textContent = won ? ['STRAIGHT-TO-DESTINATION', 'CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'CONFIRMED'][game.guesses.length - 1] || 'CONFIRMED' : 'DIVERTED';
    stamp.classList.toggle('lost', !won);
    // retrigger slam animation
    stamp.style.animation = 'none'; void stamp.offsetWidth; stamp.style.animation = '';
    const eh = game.route.extraHard;
    const intel = eh ? ` · ${eh.registration} · ${eh.airframeAge} yrs${eh.engineOption ? ' · ' + eh.engineOption : ''}` : '';
    $('stampSub').textContent = won
      ? `${game.route.aircraft} · ${E.fmtDuration(game.route.durationMins)} · ${game.route.airline}${intel}`
      : 'The route you were searching for:';
    $('stampRoute').innerHTML = `${game.origin} → ${game.dest} <span class="km">· ${E.fmtKm(game.km)} KM</span>`;
    let pts = E.scoreFor(game);
    const hadIncident = !!(eh && eh.incident);
    if (won && hadIncident) pts += 250;
    const p = $('stampPoints');
    p.textContent = won
      ? `+${pts} POINTS · FILED IN ${game.guesses.length}/5${game.route.niche > 1 ? ' · NICHE ×' + game.route.niche : ''}${hadIncident ? ' · AIRFRAME BONUS +250' : ''}`
      : 'NO POINTS THIS TIME — THE STREAK RESETS';
    p.classList.toggle('zero', !won);
  }
  function renderStreak() {
    const b = $('streakBanner');
    if (stats.streak >= 2) {
      b.style.display = 'flex';
      $('streakText').textContent = `Consecutive service: ${stats.streak} days`;
      $('streakCount').textContent = '×'.repeat(Math.min(stats.streak, 5));
    } else b.style.display = 'none';
  }
  function renderSerial() {
    const d = dayKey().replace(/-/g, '');
    $('ticketSerial').textContent = `SER. ${d.slice(2, 4)}${d.slice(6)}-${(E.daysSinceEpoch() % 997).toString().padStart(3, '0')}`;
    // charter config summary under the serial
    const c = charterCfg;
    const parts = [];
    if (c.country) parts.push(c.country.toUpperCase());
    else if (c.region && c.region !== '*') parts.push(E.REGIONS[c.region].toUpperCase());
    if (c.groups && c.groups.length) parts.push(c.groups.map(g => ({ FLAG: 'FLAG', LCC: 'LCC', CARGO: 'CARGO', MAJOR: 'MAJOR', REGIONAL: 'REGIONAL', LEISURE: 'LEISURE', CHARTER: 'CHARTER' }[g] || g)).join('+'));
    if (c.rangeBand !== 'ANY') parts.push((E.RANGE_BANDS.find(b => b.id === c.rangeBand) || {}).label || c.rangeBand);
    if (c.extraHard) parts.push('EXTRA HARD');
    const el = $('configSummary');
    if (el) el.textContent = parts.length ? parts.join(' · ') : 'WORLD · ALL CARRIERS · ANY RANGE';
    const nicheEl = $('nicheBadge');
    if (nicheEl) {
      const m = E.nicheMultiplier({ ...(cfgScope()), extraHard: c.extraHard, rangeBand: c.rangeBand });
      const changed = nicheEl.textContent !== '×' + m;
      nicheEl.textContent = '×' + m;
      nicheEl.style.display = m > 1 ? 'inline-block' : 'none';
      if (changed) { // rubber-stamp pop when the multiplier moves
        nicheEl.classList.remove('bump'); void nicheEl.offsetWidth;
        nicheEl.classList.add('bump');
      }
    }
    const strip = $('configSummary');
    if (strip && strip.textContent) { // brief red flash when the charter summary changes
      const prev = strip.getAttribute('data-prev');
      if (prev !== null && prev !== strip.textContent) {
        strip.classList.remove('flash'); void strip.offsetWidth;
        strip.classList.add('flash');
      }
      strip.setAttribute('data-prev', strip.textContent);
    }
  }

  /* ---------- composer & autocomplete ---------- */
  const inO = $('inOrigin'), inD = $('inDest');
  let acOpen = { origin: false, dest: false };

  function setupAutocomplete(input, side) {
    const listEl = side === 'origin' ? $('acOrigin') : $('acDest');
    input.addEventListener('input', () => {
      const res = input.value.trim().length < 1 ? [] : E.searchAirports(input.value, 7);
      acOpen[side] = res.length > 0;
      renderAc(listEl, res);
    });
    input.addEventListener('focus', () => {
      const res = input.value.trim().length < 2 ? [] : E.searchAirports(input.value, 7);
      if (res.length) { acOpen[side] = true; renderAc(listEl, res); }
    });
    input.addEventListener('blur', () => setTimeout(() => { listEl.style.display = 'none'; }, 160));
    input.addEventListener('keydown', ev => {
      const items = [...listEl.querySelectorAll('.ac-item')];
      let hl = items.findIndex(x => x.classList.contains('hl'));
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (items.length) { items.forEach(x => x.classList.remove('hl')); items[Math.min(items.length - 1, hl + 1)].classList.add('hl'); } }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (items.length) { items.forEach(x => x.classList.remove('hl')); items[Math.max(0, hl - 1)].classList.add('hl'); } }
      else if (ev.key === 'Enter') {
        ev.preventDefault();
        if (hl >= 0) items[hl].click();
        else if (items.length === 1) items[0].click();
        else submit();
      }
    });
  }
  function renderAc(listEl, res) {
    listEl.innerHTML = '';
    if (!res.length) { listEl.style.display = 'none'; return; }
    for (const a of res) {
      const el = document.createElement('div');
      el.className = 'ac-item';
      el.innerHTML = `<span class="c">${a[0]}</span><span class="n">${a[2]} — ${a[1]}</span>`;
      el.addEventListener('mousedown', ev => ev.preventDefault());
      el.addEventListener('click', () => {
        listEl.closest('.cmp-field').querySelector('input').value = a[0];
        listEl.style.display = 'none';
        if (listEl.id === 'acOrigin') inD.focus(); else $('btnSubmit').focus();
      });
      listEl.appendChild(el);
    }
    listEl.style.display = 'block';
  }
  setupAutocomplete(inO, 'origin');
  setupAutocomplete(inD, 'dest');

  function submit() {
    if (game.status !== 'playing') return;
    // If an autocomplete suggestion is highlighted/open, resolve it first (city → code)
    const resolveSide = (input, listEl) => {
      const v = input.value.trim();
      if (/^[A-Za-z]{3}$/.test(v) && E.airportByCode(v.toUpperCase())) return v.toUpperCase();
      const items = [...listEl.querySelectorAll('.ac-item')];
      if (!items.length) return null;
      const hl = items.find(x => x.classList.contains('hl')) || (items.length === 1 ? items[0] : null);
      if (hl) {
        const code = hl.querySelector('.c').textContent.trim().toUpperCase();
        input.value = code;
        listEl.style.display = 'none';
        return code;
      }
      // multiple matches: try exact city-name match
      const exact = items.find(x => x.querySelector('.n').textContent.toLowerCase().startsWith(v.toLowerCase() + ' —'));
      if (exact) {
        const code = exact.querySelector('.c').textContent.trim().toUpperCase();
        input.value = code;
        listEl.style.display = 'none';
        return code;
      }
      return null;
    };
    const o = resolveSide(inO, $('acOrigin'));
    const d = resolveSide(inD, $('acDest'));
    if (!o || !d) return toast(o || d ? 'Resolve the other field — pick an airport from the list' : 'Complete both fields first');
    const res = E.applyGuess(game, o, d);
    if (!res.ok) return toast(res.error);
    persist();
    inO.value = ''; inD.value = '';
    render();
    if (game.status !== 'playing') finishGame();
    else toast(`Manifest update: ${nextClueName(game.guesses.length)} declassified`);
    inO.focus();
  }
  function nextClueName(n) {
    return { 1: 'Duration', 2: 'Aircraft', 3: 'Route type', 4: 'Direction', 5: 'Airline' }[n] || 'Route chart';
  }
  $('btnSubmit').addEventListener('click', submit);

  let toastTimer;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------- hints (rewarded) ---------- */
  function bindHint(btnId, side) {
    $(btnId).addEventListener('click', () => {
      if (game.status !== 'playing') return toast('This ticket is closed');
      const already = game.guesses.some(g => side === 'origin' ? g.originOk : g.destOk);
      if (already) return toast(`You already hold the ${side}`);
      showHintOffer(side);
    });
  }
  bindHint('hintOrigin', 'origin');
  bindHint('hintDest', 'dest');

  function showHintOffer(side) {
    const bank = getBank();
    const modal = document.createElement('div');
    modal.className = 'overlay open';
    modal.innerHTML = `<div class="dialog">
      <div class="dialog-head"><h2>Classified Intel</h2><span class="form-no">ONE PER SIDE</span><button class="dialog-x" data-close>CLOSE</button></div>
      <p style="font-size:14.5px;line-height:1.55;margin:4px 0 14px">Reveal the hidden <b>${side}</b> airport. Costs one <b>●</b> intel token — current stock: <b>${bank}</b>.</p>
      <div class="submit-row">
        <button class="btn-primary" id="hintAd">WATCH SPONSOR NOTICE · GET ●</button>
      </div>
      <div class="submit-row">
        <button class="btn-primary" id="hintUse" style="${bank ? '' : 'opacity:.4;pointer-events:none'}">SPEND 1 ●</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', ev => {
      if (ev.target === modal || ev.target.hasAttribute('data-close')) { modal.remove(); return; }
      if (ev.target.id === 'hintAd') {
        Monetization.earnHintByAd().then(r => {
          modal.remove();
          if (r.ok) { updateHintUI(); toast('Intel token received — spend it from the HINT button'); }
          else toast('Sponsor notice unavailable right now');
        });
      } else if (ev.target.id === 'hintUse') {
        if (getBank() <= 0) return;
        setBank(getBank() - 1);
        const h = E.hintFor(game, side);
        modal.remove();
        if (h.ok) {
          persist();
          if (side === 'origin') inO.value = h.code; else inD.value = h.code;
          toast(`${side} revealed: ${h.code}`);
          (side === 'origin' ? inD : $('btnSubmit')).focus();
        }
      }
    });
  }
  function hintBankKey() { return 'skyq.hintbank'; }
  function getBank() { return parseInt(localStorage.getItem(hintBankKey()) || '0', 10) || 0; }
  function setBank(v) { localStorage.setItem(hintBankKey(), String(v)); updateHintUI(); }
  function updateHintUI() {
    const n = getBank();
    for (const id of ['hintOrigin', 'hintDest']) {
      const b = $(id);
      b.textContent = n > 0 ? `HINT ●${n}` : 'HINT';
      b.style.opacity = n > 0 ? '1' : '.75';
    }
  }

  /* ---------- finish ---------- */
  function finishGame() {
    const won = game.status === 'won';
    if (practiceMode) {
      // practice: no stats, no archive — just show the result on the ticket
      renderStamp();
      if (won) toast(`Practice solved · would have scored +${E.scoreFor(game) + (game.route.extraHard && game.route.extraHard.incident ? 250 : 0)}`);
      return;
    }
    const already = stats.lastDay === dayKey() && stats.lastDifficulty === game.difficulty;
    if (!already) {
      E.updateStats(stats, game, dayKey());
      if (won) {
        let pts = E.scoreFor(game);
        // incident bonus: +250 when the airframe type has a notable event
        if (game.route.extraHard && game.route.extraHard.incident) pts += 250;
        stats.points = (stats.points || 0) + pts;
      }
      try { localStorage.setItem('skyq.stats', JSON.stringify(stats)); } catch (e) { /* ignore */ }
    }
    markArchive(won, game.guesses.length);
    renderTabs();
    renderStreak();
    renderStamp();
    setTimeout(() => openStats(won), 850);
  }
  let practiceMode = false;
  function startPractice() {
    const meta = DIFF_META[currentDiff];
    game = E.newGame(E.makeRoute('practice-' + Date.now(), {
      difficulty: currentDiff, allowUS: meta.allowUS, minKm: meta.minKm, maxKm: meta.maxKm,
      scope: cfgScope(), rangeBand: charterCfg.rangeBand, extraHard: charterCfg.extraHard,
    }), currentDiff);
    practiceMode = true;
    render();
    maybeIncidentPopup();
    toast('Practice ticket — no points, no streak');
  }
  $('btnPractice').addEventListener('click', startPractice);

  /* ---------- modals ---------- */
  function openModal(id) { $(id).classList.add('open'); }
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
    b.closest('.overlay').classList.remove('open');
  }));
  document.querySelectorAll('.overlay').forEach(m => m.addEventListener('click', ev => {
    if (ev.target === m) m.classList.remove('open');
  }));

  function openStats(showArchive) {
    $('stPlayed').textContent = stats.played;
    $('stWinPct').textContent = stats.played ? Math.round(stats.wins / stats.played * 100) + '%' : '0%';
    $('stStreak').textContent = stats.streak;
    $('stMax').textContent = stats.maxStreak;
    $('stPoints').textContent = (stats.points || 0).toLocaleString();
    $('stDist').textContent = stats.distN ? E.fmtKm(stats.distSum / stats.distN) + ' km' : '—';
    if (showArchive) renderArchiveList(); else $('archiveRows').innerHTML = '';
    openModal('modalStats');
    tickNext();
    if (showArchive === true && wonTodayAllDiffs()) setTimeout(showHouseAd, 400);
  }
  function renderArchiveList() {
    const a = store.get(currentDiff, 'archive') || [];
    const rowsEl = $('archiveRows');
    rowsEl.innerHTML = a.length ? '<div class="stat-lines" style="border-top:none;margin-top:10px"></div>' : '';
    if (!a.length) { rowsEl.innerHTML = '<p style="font-family:var(--mono-stack);font-size:11px;color:var(--ink-faint);text-align:center;margin:12px 0 0">NO PAST ROUTES ON FILE — SOLVE TODAY\'S TO OPEN THE LEDGER</p>'; return; }
    const box = rowsEl.firstChild;
    for (const e of a.slice(0, 14)) {
      const row = document.createElement('div');
      row.className = 'stat-line';
      row.innerHTML = `<span class="sl-label">${e.day}</span><span class="sl-dots"></span><span class="sl-val ${e.won ? '' : 'x'}" style="${e.won ? 'color:var(--green)' : 'color:var(--red)'}">${e.won ? e.guesses + '/5' : 'X/5'}</span>`;
      box.appendChild(row);
    }
  }
  function tickNext() {
    const el = $('stNext');
    if (!el) return;
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const s = Math.max(0, Math.floor((next - now) / 1000));
    el.textContent = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    setTimeout(tickNext, 1000);
  }
  function wonTodayAllDiffs() {
    return DIFFS.every(d => {
      const g = store.get(d, 'game');
      return g && g.status === 'won';
    });
  }
  function showHouseAd() {
    if (Monetization.adsRemoved()) return;
    const m = document.createElement('div');
    m.className = 'overlay open';
    m.innerHTML = `<div class="dialog" style="text-align:center">
      <h2 style="font-family:var(--cond-stack);letter-spacing:3px;margin:6px 0 4px">ALL TICKETS STAMPED</h2>
      <p style="font-family:var(--mono-stack);font-size:11px;color:var(--ink-soft);margin:0 0 16px">NEW ROUTES AT MIDNIGHT · RETURN FOR YOUR STREAK</p>
      <button class="btn-primary" data-close>NOTED</button>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', ev => { if (ev.target === m || ev.target.hasAttribute('data-close')) m.remove(); });
  }

  /* ---------- share ---------- */
  $('btnShare').addEventListener('click', async () => {
    if (game.status === 'playing') { toast('Close the ticket first — then share your result'); return; }
    const txt = E.shareEmoji(game);
    try {
      if (navigator.share) await navigator.share({ text: txt });
      else { await navigator.clipboard.writeText(txt); toast('Result copied — paste it anywhere'); }
    } catch (e) { /* cancelled */ }
  });

  /* ---------- theme ---------- */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme);
    $('btnTheme').textContent = theme === 'dark' ? '☀' : '☾';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#141d26' : '#efe7d6');
  }
  $('btnTheme').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('skyq.theme', theme);
    applyTheme();
  });

  /* ---------- tabs & misc ---------- */
  document.querySelectorAll('.class-tab').forEach(el => el.addEventListener('click', () => {
    currentDiff = el.dataset.diff;
    localStorage.setItem('skyq.diff', currentDiff);
    game = loadOrStart(currentDiff);
    render();
  }));
  $('btnStats').addEventListener('click', () => openStats(false));
  $('btnArchive').addEventListener('click', () => openStats(true));
  $('btnHelp').addEventListener('click', () => openModal('modalHelp'));
  $('btnCharter').addEventListener('click', openCharter);
  $('btnPrivacy').addEventListener('click', ev => { ev.preventDefault(); openModal('modalPrivacy'); });
  $('btnTerms').addEventListener('click', ev => { ev.preventDefault(); openModal('modalPrivacy'); });

  document.addEventListener('keydown', ev => {
    if (ev.key === '/' && document.activeElement !== inO && document.activeElement !== inD) { ev.preventDefault(); inO.focus(); }
  });

  /* ---------- charter request dialog ---------- */
  function openCharter() {
    const regions = E.REGIONS;
    const countries = [...new Set(window.AIRLINES.map(a => a[2]))].sort();
    const groups = [
      ['FLAG', 'Flag carriers'], ['LCC', 'Low-cost'], ['CARGO', 'Cargo'],
      ['MAJOR', 'Majors'], ['REGIONAL', 'Regional'], ['LEISURE', 'Leisure'], ['CHARTER', 'Charter'],
    ];
    const m = document.createElement('div');
    m.className = 'overlay open';
    m.innerHTML = `<div class="dialog" id="charterDlg">
      <div class="dialog-head"><h2>Charter Request</h2><span class="form-no">SPECIFY YOUR ROUTE</span><button class="dialog-x" data-close>CLOSE</button></div>

      <div class="ch-section">
        <div class="ch-label">Region</div>
        <div class="ch-chips" id="chRegion">
          <button class="ch-chip ${charterCfg.region === '*' ? 'on' : ''}" data-v="*">WORLD</button>
          ${Object.keys(regions).filter(r => r !== '*').map(r => `<button class="ch-chip ${charterCfg.region === r ? 'on' : ''}" data-v="${r}">${regions[r].toUpperCase()}</button>`).join('')}
        </div>
      </div>

      <div class="ch-section">
        <div class="ch-label">Country (optional — deepens the niche)</div>
        <select class="ch-select" id="chCountry">
          <option value="">— Any / all —</option>
          ${countries.map(c => `<option ${charterCfg.country === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>

      <div class="ch-section">
        <div class="ch-label">Carrier class (tap any to combine)</div>
        <div class="ch-chips" id="chGroups">
          ${groups.map(([g, lbl]) => `<button class="ch-chip ${charterCfg.groups.includes(g) ? 'on' : ''}" data-v="${g}">${lbl.toUpperCase()}</button>`).join('')}
        </div>
      </div>

      <div class="ch-section">
        <div class="ch-label">Range · <span id="chRangeLbl">${(E.RANGE_BANDS.find(b => b.id === charterCfg.rangeBand) || E.RANGE_BANDS[0]).label}</span></div>
        <input type="range" class="ch-slider" id="chRange" min="0" max="4" step="1" value="${E.RANGE_BANDS.findIndex(b => b.id === charterCfg.rangeBand)}">
        <div class="ch-slider-marks"><span>Short</span><span>Medium</span><span>Long</span><span>Ultra</span><span>Any</span></div>
      </div>

      <div class="ch-section ch-row">
        <div>
          <div class="ch-label">Extra hard mode</div>
          <div class="ch-sub">Registration, airframe age & engines become clues · incident bonuses · ×1.2 points</div>
        </div>
        <button class="ch-toggle ${charterCfg.extraHard ? 'on' : ''}" id="chExtra" aria-pressed="${charterCfg.extraHard}"><span></span></button>
      </div>

      <div class="ch-niche-line">NICHE MULTIPLIER: <b id="chNiche">×${E.nicheMultiplier({ ...(cfgScope()), extraHard: charterCfg.extraHard, rangeBand: charterCfg.rangeBand })}</b></div>

      <div class="submit-row">
        <button class="btn-primary" id="chGo">Issue ticket</button>
        <button class="btn-primary" id="chReset" style="background:transparent;color:var(--ink);border-color:var(--line);box-shadow:none">Reset</button>
      </div>
    </div>`;
    document.body.appendChild(m);

    const dlg = m.querySelector('#charterDlg');
    const nicheEl = dlg.querySelector('#chNiche');
    const updNiche = () => {
      nicheEl.textContent = '×' + E.nicheMultiplier({ ...(cfgScope()), extraHard: charterCfg.extraHard, rangeBand: charterCfg.rangeBand });
    };
    dlg.querySelector('#chRegion').addEventListener('click', ev => {
      const b = ev.target.closest('.ch-chip'); if (!b) return;
      charterCfg.region = b.dataset.v;
      if (b.dataset.v !== '*' && charterCfg.country && regionForCountry(charterCfg.country) !== b.dataset.v) {
        charterCfg.country = null; // country sits in another region — drop it to keep the pool valid
        dlg.querySelector('#chCountry').value = '';
      }
      dlg.querySelectorAll('#chRegion .ch-chip').forEach(x => x.classList.toggle('on', x === b));
      updNiche();
    });
    dlg.querySelector('#chCountry').addEventListener('change', ev => {
      charterCfg.country = ev.target.value || null;
      if (charterCfg.country) {
        const reg = regionForCountry(charterCfg.country);
        if (reg && charterCfg.region !== '*' && charterCfg.region !== reg) {
          charterCfg.region = reg; // country implies its own region
          dlg.querySelectorAll('#chRegion .ch-chip').forEach(x => x.classList.toggle('on', x.dataset.v === reg));
        }
      }
      updNiche();
    });
    dlg.querySelector('#chGroups').addEventListener('click', ev => {
      const b = ev.target.closest('.ch-chip'); if (!b) return;
      const g = b.dataset.v;
      if (charterCfg.groups.includes(g)) charterCfg.groups = charterCfg.groups.filter(x => x !== g);
      else charterCfg.groups = [...charterCfg.groups, g];
      b.classList.toggle('on');
      updNiche();
    });
    dlg.querySelector('#chRange').addEventListener('input', ev => {
      charterCfg.rangeBand = E.RANGE_BANDS[+ev.target.value].id;
      dlg.querySelector('#chRangeLbl').textContent = E.RANGE_BANDS[+ev.target.value].label;
      updNiche();
    });
    dlg.querySelector('#chExtra').addEventListener('click', ev => {
      charterCfg.extraHard = !charterCfg.extraHard;
      ev.currentTarget.classList.toggle('on', charterCfg.extraHard);
      updNiche();
    });
    dlg.querySelector('#chReset').addEventListener('click', () => {
      charterCfg = { ...DEFAULT_CONFIG };
      saveCharter();
      m.remove();
      openCharter();
    });
    dlg.querySelector('#chGo').addEventListener('click', () => {
      if (charterCfg.country && !scopeHasAirports(cfgScope())) {
        toast('No SKYGUESSR airports in that scope — widen the region or pick another country');
        return;
      }
      saveCharter();
      m.remove();
      if (!game || game.practice) { render(); return; } // boot in progress — loadOrStart will issue it
      game = todayGame(dayKey(), currentDiff);
      persist();
      render();
      maybeIncidentPopup();
      toast('Charter issued — new route on your ticket');
    });
    m.addEventListener('click', ev => { if (ev.target === m) m.remove(); });
  }

  /* ---------- incident bonus popup ---------- */
  function maybeIncidentPopup() {
    if (!game || !game.route || !game.route.extraHard || !game.route.extraHard.incident) return;
    const [title, blurb] = game.route.extraHard.incident;
    const m = document.createElement('div');
    m.className = 'overlay open';
    m.innerHTML = `<div class="dialog" style="max-width:520px">
      <div class="dialog-head"><h2>Notable Airframe</h2><span class="form-no">BONUS +250 PTS</span><button class="dialog-x" data-close>CLOSE</button></div>
      <div class="incident-card">
        <div class="inc-title">${title}</div>
        <p class="inc-blurb">${blurb}</p>
        <div class="inc-note">This ticket's airframe type is linked to this event. Solve the route for a <b>+250 point</b> bonus.</div>
      </div>
      <button class="btn-primary" data-close>NOTED — AVIATE</button>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', ev => { if (ev.target === m || ev.target.hasAttribute('data-close')) m.remove(); });
  }

  /* ---------- home country ---------- */
  let homeCountry = localStorage.getItem('skyq.home') || null;

  function flagOf(country) { return window.Bureau ? Bureau.flagOf(country) : ''; }

  function renderHomeCard() {
    const card = $('homeCard');
    if (!card) return;
    if (!homeCountry) { card.style.display = 'none'; return; }
    const airlines = window.AIRLINES.filter(a => a[2] === homeCountry);
    const airports = window.AIRPORTS.filter(a => a[3] === homeCountry);
    card.style.display = 'block';
    card.innerHTML = `
      <div class="hc-flag">${flagOf(homeCountry)}</div>
      <div class="hc-body">
        <div class="hc-name">${homeCountry} <span>· HOME BASE</span></div>
        <div class="hc-meta">${airlines.length} carriers · ${airports.length} airport${airports.length === 1 ? '' : 's'} in network</div>
      </div>
      <div class="hc-actions">
        <button class="foot-link" id="hcFly">FLY ${homeCountry.toUpperCase()} →</button>
        <button class="foot-link" id="hcClear" style="color:var(--ink-faint)">CLEAR</button>
      </div>`;
    card.querySelector('#hcFly').addEventListener('click', () => {
      charterCfg.country = homeCountry;
      saveCharter();
      game = todayGame(dayKey(), currentDiff);
      persist();
      render();
      toast(`Charter issued · ${homeCountry}`);
      scrollToTicket();
    });
    card.querySelector('#hcClear').addEventListener('click', () => {
      homeCountry = null;
      localStorage.removeItem('skyq.home');
      if (window.Bureau) Bureau.setHome(null);
      renderHomeCard();
      toast('Home base cleared');
    });
  }

  function scrollToTicket() {
    document.querySelector('.ticket').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- bureau map & country popup ---------- */
  async function initBureau() {
    if (!window.Bureau || !$('bureauMapMount')) return;
    await Bureau.init($('bureauMapMount'), {
      homeCountry,
      onPickCountry: (country) => openCountryPopup(country),
    });
    if (homeCountry) {
      Bureau.focusCountry(homeCountry);
      renderHomeCard();
    }
  }

  function openCountryPopup(country) {
    const all = window.AIRLINES.filter(a => a[2] === country);
    const byGroup = g => all.filter(a => a[3] === g);
    const airports = window.AIRPORTS.filter(a => a[3] === country);
    const sec = (list, label) => list.length
      ? `<div class="cp-group"><div class="cp-group-label">${label} · ${list.length}</div><div class="cp-names">${list.map(a => `<span class="cp-airline">${a[0]}</span>`).join('')}</div></div>`
      : '';
    const m = document.createElement('div');
    m.className = 'overlay open';
    m.innerHTML = `<div class="dialog country-dialog">
      <div class="dialog-head">
        <h2>${flagOf(country)} ${country}</h2>
        <span class="form-no">CARRIER REGISTER</span>
        <button class="dialog-x" data-close>CLOSE</button>
      </div>
      <div class="cp-meta">${airports.length ? airports.map(a => a[0]).join(' · ') : 'NO AIRPORTS IN NETWORK — CARRIERS OPERATE FROM NEIGHBORING GATES'}</div>
      ${sec(byGroup('FLAG'), 'FLAG CARRIERS')}
      ${sec(byGroup('LCC'), 'LOW-COST CARRIERS')}
      ${sec(byGroup('CARGO'), 'CARGO CARRIERS')}
      ${sec(byGroup('MAJOR'), 'MAJOR CARRIERS')}
      ${sec(byGroup('REGIONAL'), 'REGIONAL')}
      ${sec(byGroup('LEISURE'), 'LEISURE')}
      ${sec(byGroup('CHARTER'), 'CHARTER')}
      ${sec(byGroup('GOV'), 'GOVERNMENT')}
      <div class="submit-row">
        <button class="btn-primary" id="cpFly">CHARTER ${country.toUpperCase()}</button>
        <button class="btn-primary" id="cpHome" style="background:transparent;color:var(--ink);border-color:var(--line);box-shadow:none">${homeCountry === country ? '★ HOME BASE' : 'SET AS HOME'}</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', ev => {
      if (ev.target === m || ev.target.hasAttribute('data-close')) { m.remove(); return; }
      if (ev.target.id === 'cpFly') {
        charterCfg.country = country;
        saveCharter();
        m.remove();
        game = todayGame(dayKey(), currentDiff);
        persist();
        render();
        toast(`Charter issued · ${country}`);
        scrollToTicket();
      } else if (ev.target.id === 'cpHome') {
        if (homeCountry === country) return;
        homeCountry = country;
        localStorage.setItem('skyq.home', country);
        Bureau.setHome(country);
        Bureau.focusCountry(country);
        renderHomeCard();
        m.remove();
        toast(`${flagOf(country)} ${country} is now your home base`);
      }
    });
  }

  $('btnHomeCountry').addEventListener('click', () => {
    // convenience: open the same picker sorted, with quick search — reuse popup on chosen
    const countries = [...new Set(window.AIRLINES.map(a => a[2]))].sort();
    const m = document.createElement('div');
    m.className = 'overlay open';
    m.innerHTML = `<div class="dialog">
      <div class="dialog-head"><h2>Home Base</h2><span class="form-no">WHERE DO YOU FLY FROM?</span><button class="dialog-x" data-close>CLOSE</button></div>
      <input class="cmp-input" id="homeSearch" placeholder="type a country…" style="width:100%;margin-bottom:10px">
      <div class="home-list" id="homeList"></div>
    </div>`;
    document.body.appendChild(m);
    const list = m.querySelector('#homeList');
    function render(q) {
      const f = countries.filter(c => !q || c.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
      list.innerHTML = f.map(c => `<button class="home-item" data-c="${c}">${flagOf(c)} ${c}</button>`).join('') || '<div class="hc-meta" style="padding:10px">No match</div>';
    }
    render('');
    m.querySelector('#homeSearch').addEventListener('input', ev => render(ev.target.value));
    list.addEventListener('click', ev => {
      const b = ev.target.closest('.home-item');
      if (!b) return;
      homeCountry = b.dataset.c;
      localStorage.setItem('skyq.home', homeCountry);
      Bureau.setHome(homeCountry);
      Bureau.focusCountry(homeCountry);
      renderHomeCard();
      m.remove();
      toast(`${flagOf(homeCountry)} ${homeCountry} is now your home base`);
    });
    m.addEventListener('click', ev => { if (ev.target === m || ev.target.hasAttribute('data-close')) m.remove(); });
  });

  /* ---------- boot ---------- */
  function boot() {
    E.initData(window.AIRPORTS, window.AIRLINES, window.AIRCRAFT);
    applyTheme();
    game = loadOrStart(currentDiff);
    render();
    updateHintUI();
    Monetization.initWebAds();
    Monetization.initNativeAds();
    renderHomeCard();
    initBureau();
    if (!localStorage.getItem('skyq.seen')) {
      localStorage.setItem('skyq.seen', '1');
      openModal('modalHelp');
    }
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  boot();

  /* test/debug hook — read-only access to live state */
  window.SKYQ_DEBUG = {
    get game() { return game; },
    get stats() { return stats; },
    get config() { return charterCfg; },
    get isPractice() { return practiceMode; },
    startPractice,
  };

  /* ---------- screenshot photo-booth mode (#photo) ----------
     Deterministic, seeded states for App Store screenshots — used by tools/capture.sh.
     Not linked from anywhere in the UI; inert unless the page is loaded with #photo. */
  (function photoBooth() {
    if (!/^#photo(\b|$|&)/.test(location.hash)) return;
    document.documentElement.setAttribute('data-photobooth', '1');
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const guessObj = (o, d) => {
      const ao = E.airportByCode(o), ad = E.airportByCode(d);
      const so = E.airportByCode(game.route.origin), sd = E.airportByCode(game.route.dest);
      return { origin: o, dest: d, originOk: o === game.route.origin, destOk: d === game.route.dest,
        distO: ao && so ? Math.round(E.greatCircleKm(ao, so)) : 0,
        distD: ad && sd ? Math.round(E.greatCircleKm(ad, sd)) : 0,
        bearO: ao && so ? E.initialBearing(ao, so) : 0,
        bearD: ad && sd ? E.initialBearing(ad, sd) : 0 };
    };
    async function stage(kind) {
      document.querySelectorAll('.overlay.open').forEach(m => m.classList.remove('open'));
      practiceMode = false;
      localStorage.setItem('skyq.seen', '1');
      game = E.newGame(E.makeRoute('photo-' + kind, { difficulty: 'medium', allowUS: true, minKm: 1000, maxKm: 13000 }), 'medium');
      game.guesses = [];
      render();
      if (kind === 'clues') {
        const route = game.route;
        game.guesses = [guessObj('JFK', 'LHR'), guessObj('BOS', 'CDG')];
        render();
      }
      if (kind === 'win') {
        game.guesses = [guessObj(game.route.origin, game.route.dest)];
        game.status = 'won';
        render();
        renderStamp();
      }
      if (kind === 'map') {
        game.guesses = [guessObj('JFK', 'LHR'), guessObj('SFO', 'NRT'), guessObj(game.route.origin, game.route.dest)];
        game.status = 'won';
        render();
        renderStamp();
      }
      await sleep(700); // fonts, tile fetch, ledger stamp-in
    }
    async function run() {
      await sleep(600);
      const steps = (location.hash.match(/only=([\w,]+)/) || [])[1];
      const shots = steps ? steps.split(',') : ['board', 'clues', 'win', 'map', 'bureau', 'stats', 'charter'];
      for (const kind of shots) {
        if (kind === 'bureau') {
          document.querySelector('.bureau-section')?.scrollIntoView({ behavior: 'instant', block: 'start' });
          await sleep(600);
          // stage the money shot: a country popup full of carriers (UAE = flag + LCC + cargo)
          const path = [...document.querySelectorAll('.bm-country')].find(x => x.dataset.geo === 'United Arab Emirates');
          path?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await sleep(500);
        }
        else if (kind === 'stats') {
          await stage('board');
          // a fresh-player stats modal looks empty — stage a believable season for the shot
          stats = { played: 12, wins: 9, streak: 4, maxStreak: 6, lastDay: dayKey(), lastDifficulty: 'medium', points: 8420, distSum: 62340, distN: 12 };
          openStats(true);
          await sleep(400);
        }
        else if (kind === 'charter') { await stage('board'); openCharter(); await sleep(400); }
        else { await stage(kind); window.scrollTo({ top: 0, behavior: 'instant' }); }
        window.__SHOTS__ = window.__SHOTS__ || [];
        window.__SHOTS__.push(kind);
        fetch('/__pb/' + kind).catch(() => {}); // completion beacon for tools/capture.sh
        await sleep(500);
      }
      document.documentElement.setAttribute('data-photobooth-done', shots.join(','));
    }
    run();
  })();
})();
