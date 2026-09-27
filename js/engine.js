/* SKYQ engine — seeded puzzle generation, great-circle feedback, clues, hints, stats.
   Pure logic, no DOM: the same file powers the website, node tests and the iOS wrapper. */
'use strict';

/* ---------- seeded PRNG (xmur3 + sfc32) ---------- */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function makeRng(seedStr) {
  const h = xmur3(seedStr);
  return sfc32(h(), h(), h(), h());
}

/* ---------- geo helpers ---------- */
const R_EARTH = 6371; // km
function toRad(d) { return d * Math.PI / 180; }
function greatCircleKm(a, b) {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}
function initialBearing(a, b) {
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat), dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function compass8(deg) {
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(deg / 45) % 8];
}
function oppositeComp(c) {
  return { north: 'south', south: 'north', east: 'west', west: 'east', northeast: 'southwest', southwest: 'northeast', southeast: 'northwest', northwest: 'southeast' }[c];
}
function distanceBand(km) {
  if (km < 750) return 'short';
  if (km < 2000) return 'medium';
  if (km < 5500) return 'long';
  return 'ultra';
}

/* ---------- formatting ---------- */
function fmtKm(km) { return Math.round(km).toLocaleString('en-US'); }
function fmtDuration(mins) {
  const m = Math.round(mins);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/* ---------- airport helpers ---------- */
const AP = {}; let APLIST = [];
function initData(airports, airlines, aircraft) {
  AP.__clear && (AP.__clear = null);
  for (const k of Object.keys(AP)) delete AP[k];
  APLIST = airports;
  for (const row of airports) {
    AP[row[0]] = { code: row[0], name: row[1], city: row[2], country: row[3], region: row[4], lat: row[5], lon: row[6], tier: row[7] };
  }
  AIRLINE_ROWS = airlines;
  AIRCRAFT_ROWS = aircraft;
}
let AIRLINE_ROWS = [], AIRCRAFT_ROWS = [];
function airportByCode(code) { return AP[code] || null; }
function searchAirports(q, limit) {
  const s = q.trim().toUpperCase();
  if (!s) return [];
  const starts = [], contains = [];
  for (const a of APLIST) {
    const code = a[0], hay = (code + ' ' + a[2] + ' ' + a[1] + ' ' + a[3]).toUpperCase();
    if (code.startsWith(s)) starts.push(a);
    else if (hay.includes(s)) contains.push(a);
  }
  return starts.concat(contains).slice(0, limit || 8);
}

/* ---------- aircraft suitability ---------- */
function pickAircraft(km, rng, opts) {
  const o = opts || {};
  let okList = AIRCRAFT_ROWS.filter(a => a[1] >= km * 1.05);
  if (o.freighterOnly) {
    const freighters = okList.filter(a => a[3]);
    if (freighters.length) okList = freighters;
    else {
      // no freighter in range: fall back to the longest-range freighter overall
      const anyFr = AIRCRAFT_ROWS.filter(a => a[3]);
      if (anyFr.length) return anyFr.reduce((a, b) => (b[1] > a[1] ? b : a));
    }
  }
  if (!okList.length) {
    return AIRCRAFT_ROWS.reduce((a, b) => (b[1] > a[1] ? b : a));
  }
  okList.sort((x, y) => (x[1] - km) - (y[1] - km));
  let window = okList.slice(0, Math.max(3, Math.floor(okList.length * 0.35)));
  // keep historically notable types (A380, MAX 8/9 …) in play so extra-hard intel stays interesting
  const notable = okList.filter(a => a[7] && a[7].length && a[1] >= km && !window.includes(a));
  if (notable.length && rng() < 0.25) window = window.concat(notable.slice(0, 2));
  return window[Math.floor(rng() * window.length)];
}

/* ---------- carrier groups & scoping ---------- */
const GROUPS = ['FLAG', 'MAJOR', 'LCC', 'CARGO', 'REGIONAL', 'LEISURE', 'CHARTER', 'GOV'];
const REGIONS = {
  NA: 'North America', CA: 'Central America & Caribbean', SA: 'South America',
  EU: 'Europe', ME: 'Middle East & Central Asia', AF: 'Africa', AS: 'Asia', OC: 'Oceania', '*': 'Global',
};

/* niche score: the narrower the slice, the bigger the multiplier */
function nicheMultiplier(scope) {
  const s = scope || {};
  let m = 1;
  if (s.groups && s.groups.length) m += 0.35 * Math.max(0, s.groups.length - 1);
  if (s.group === 'CARGO') m += 0.8;
  if (s.group === 'REGIONAL' || s.group === 'CHARTER' || s.group === 'GOV') m += 0.6;
  if (s.group === 'LEISURE') m += 0.3;
  if (s.group === 'FLAG') m += 0.15;
  if (s.group === 'LCC') m += 0.2;
  if (s.country) m += 0.9;         // single-country isolation
  if (s.region && s.region !== '*') m += 0.15;
  if (s.extraHard) m += 1.2;
  if (s.rangeBand === 'ULTRA') m += 0.2;
  if (s.rangeBand === 'SHORT') m += 0.1;
  return Math.round(m * 100) / 100;
}

/* ---------- range bands (slider) ---------- */
const RANGE_BANDS = [
  { id: 'ANY', label: 'Any range', minKm: 400, maxKm: 16000 },
  { id: 'SHORT', label: 'Short hop', minKm: 400, maxKm: 1500 },
  { id: 'MEDIUM', label: 'Medium haul', minKm: 1500, maxKm: 4000 },
  { id: 'LONG', label: 'Long haul', minKm: 4000, maxKm: 9000 },
  { id: 'ULTRA', label: 'Ultra long haul', minKm: 9000, maxKm: 16000 },
];
function rangeBandById(id) { return RANGE_BANDS.find(b => b.id === (id || 'ANY')) || RANGE_BANDS[0]; }

/* ---------- route (puzzle) ---------- */
function makeRoute(seed, opts) {
  const rng = makeRng(seed);
  const o = opts || {};
  const difficulty = o.difficulty || 'medium';
  const maxTier2 = difficulty === 'easy' ? 0 : difficulty === 'medium' ? 1 : 2;
  const band = rangeBandById(o.rangeBand);
  const scope = o.scope || {};

  // airport pool honoring region/country scope
  const regionForCountry = c => { const a = APLIST.find(x => x[3] === c); return a ? a[4] : null; };
  if (scope.country && !regionForCountry(scope.country)) delete scope.country; // unknown country → degrade to world scope
  // a country always implies its own region: drop a conflicting region filter so the pool never empties
  if (scope.country && scope.region && scope.region !== '*' && regionForCountry(scope.country) !== scope.region) scope.region = '*';
  let pool = APLIST.filter(a => {
    if (o.allowUS === false && a[3] === 'United States') return false;
    if (scope.country && a[3] !== scope.country) return false;
    if (scope.region && scope.region !== '*' && a[4] !== scope.region) return false;
    return true;
  });
  if (!pool.length) pool = APLIST.slice(); // last-resort fallback — never crash
  // single-country charters are exempt from the min-4 fallback: fly domestic with what exists
  const strictCountry = !!scope.country;
  if (pool.length < 4 && !strictCountry) pool = APLIST.slice();

  let origin = null, dest = null, km = 0, tries = 0;
  const fits = d => d >= band.minKm && d <= band.maxKm && (!o.minKm || d >= o.minKm) && (!o.maxKm || d <= o.maxKm);
  const dOf = o0 => a => greatCircleKm({ lat: o0[5], lon: o0[6] }, { lat: a[5], lon: a[6] });
  const periphery = o0 => { // single-airport scope: pair with a nearby foreign gate
    const oApt = airportByCode(o0[0]);
    const near = APLIST.filter(a => a[0] !== o0[0])
      .map(a => ({ a: a, d: greatCircleKm(oApt, { lat: a[5], lon: a[6] }) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, 4);
    if (near.length) { dest = near[Math.floor(rng() * near.length)].a; km = greatCircleKm(oApt, { lat: dest[5], lon: dest[6] }); }
  };
  do {
    origin = pool[Math.floor(rng() * pool.length)];
    const cands = pool.filter(a => {
      if (a[0] === origin[0]) return false;
      if (origin[7] === 2 && a[7] === 2) return false;
      if (scope.country && a[3] !== scope.country) return false;
      if (scope.region && scope.region !== '*' && a[4] !== scope.region) return false;
      return true;
    });
    if (!cands.length) { periphery(origin); break; }
    const dist = dOf(origin);
    const inBand = cands.filter(a => fits(dist(a)));
    if (inBand.length) { dest = inBand[Math.floor(rng() * inBand.length)]; km = dist(dest); break; }
    tries++;
  } while (tries < 200);
  if (!dest) {
    // no in-band pair exists in scope (e.g. LONG band in a compact country):
    // serve the pair closest to the band, capped at the longest aircraft's range
    origin = pool[Math.floor(rng() * pool.length)];
    const cands = pool.filter(a => a[0] !== origin[0] && !(origin[7] === 2 && a[7] === 2));
    if (!cands.length) { periphery(origin); }
    else {
      const dist = dOf(origin);
      const maxAcRange = AIRCRAFT_ROWS.reduce((m, a) => Math.max(m, a[1]), 0);
      const maxFrRange = AIRCRAFT_ROWS.filter(a => a[3]).reduce((m, a) => Math.max(m, a[1]), 0);
      // keep the route flyable even if a cargo carrier (shorter-range freighters) ends up on it
      const capKm = Math.min(maxAcRange * 0.98, maxFrRange / 1.02);
      let list = cands.filter(a => dist(a) <= capKm);
      if (!list.length) list = cands;
      const ds = list.map(a => dist(a));
      const target = Math.max(...ds) < band.minKm ? band.minKm : Math.min(...ds) > band.maxKm ? band.maxKm : band.maxKm;
      dest = list.slice().sort((x, y) => Math.abs(dist(x) - target) - Math.abs(dist(y) - target))[0];
      km = dist(dest);
    }
  }

  // airline pool honoring carrier-class scope; matches either endpoint's region or global
  const groupOk = al => {
    if (scope.groups && scope.groups.length) return scope.groups.includes(al[3]);
    if (scope.group) return al[3] === scope.group;
    return true;
  };
  const countryOk = al => scope.country ? al[2] === scope.country : true;
  let airlinePool = AIRLINE_ROWS.filter(al => groupOk(al) && countryOk(al) && (al[1] === '*' || al[1] === origin[4] || al[1] === dest[4] || (scope.country && al[2] === scope.country)));
  if (!airlinePool.length) airlinePool = AIRLINE_ROWS.filter(al => groupOk(al) && (al[1] === '*' || al[1] === origin[4] || al[1] === dest[4]));
  if (!airlinePool.length) {
    const freighterAirlines = AIRLINE_ROWS.filter(al => al[3] === 'CARGO');
    airlinePool = freighterAirlines.length ? freighterAirlines : AIRLINE_ROWS.filter(al => groupOk(al));
  }
  let airlineRow = airlinePool.length ? airlinePool[Math.floor(rng() * airlinePool.length)] : ['SkyGuessr Air', origin[4], origin[3], 'MAJOR'];
  // a 15,000km passenger leg is realistic; a freighter leg that long is not — swap cargo carriers out
  const maxFrRange = AIRCRAFT_ROWS.filter(a => a[3]).reduce((m, a) => Math.max(m, a[1]), 0);
  if (km > maxFrRange / 1.05) {
    const nonCargo = airlinePool.filter(al => al[3] !== 'CARGO');
    if (nonCargo.length) { airlinePool = nonCargo; airlineRow = nonCargo[Math.floor(rng() * nonCargo.length)]; }
  }

  const freighterOnly = airlineRow[3] === 'CARGO';
  const aircraft = pickAircraft(km, rng, { freighterOnly, widebodyOk: difficulty !== 'easy' || true });
  const speed = 810 + rng() * 40;
  const durationMins = Math.round((km / speed) * 60 + 30 + rng() * 20);

  // extra-hard intel: registration, airframe age, engine option, incidents
  const extra = o.extraHard ? buildExtraHard(aircraft, rng) : null;

  return {
    seed,
    origin: origin[0], dest: dest[0], km: Math.round(km),
    aircraft: aircraft[0], widebody: aircraft[2], freighter: !!aircraft[3],
    engines: aircraft[4] || [], firstFlight: aircraft[5] || null,
    durationMins, airline: airlineRow[0], airlineGroup: airlineRow[3], airlineCountry: airlineRow[2],
    international: airportByCode(origin[0]).country !== airportByCode(dest[0]).country,
    region: airportByCode(origin[0]).region,
    extraHard: extra,
    scope, rangeBand: band.id, niche: nicheMultiplier({ ...scope, extraHard: o.extraHard, rangeBand: band.id }),
  };
}

/* registration prefix per country (common ICAO blocks) */
const REG_PREFIX = {
  'United States': 'N', 'United Kingdom': 'G-', Germany: 'D-', France: 'F-',
  Netherlands: 'PH-', Belgium: 'OO-', Switzerland: 'HB-', Austria: 'OE-',
  Spain: 'EC-', Portugal: 'CS-', Italy: 'I-', Ireland: 'EI-',
  Sweden: 'SE-', Denmark: 'OY-', Norway: 'LN-', Finland: 'OH-',
  Poland: 'SP-', Czechia: 'OK-', Hungary: 'HA-', Romania: 'YR-',
  Bulgaria: 'LZ-', Greece: 'SX-', Turkey: 'TC-', Russia: 'RA-',
  Ukraine: 'UR-', 'United Arab Emirates': 'A6-', Qatar: 'A7-',
  Bahrain: 'A9-', Kuwait: '9K-', Oman: 'A4-', 'Saudi Arabia': 'HZ-',
  Israel: '4X-', Jordan: 'JY-', Lebanon: 'OD-', Egypt: 'SU-',
  Morocco: 'CN-', Tunisia: 'TS-', Algeria: '7T-', Nigeria: '5N-',
  Ethiopia: 'ET-', Kenya: '5Y-', 'South Africa': 'ZS-', India: 'VT-',
  Pakistan: 'AP-', Bangladesh: 'S2-', 'Sri Lanka': '4R-', Singapore: '9V-',
  Malaysia: '9M-', Indonesia: 'PK-', Thailand: 'HS-', Vietnam: 'VN-',
  Philippines: 'RP-C', China: 'B-', Japan: 'JA', 'South Korea': 'HL-',
  Taiwan: 'B-', 'Hong Kong SAR': 'B-H', Australia: 'VH-', 'New Zealand': 'ZK-',
  Canada: 'C-F', Mexico: 'XA-', Brazil: 'PR-', Argentina: 'LV-',
  Chile: 'CC-', Colombia: 'HK-', Peru: 'OB-', Panama: 'HP-',
};
function buildExtraHard(aircraft, rng) {
  const name = aircraft[0];
  const pool = aircraft[6] || ['N'];
  const prefix = pool[Math.floor(rng() * pool.length)];
  // synthesize a plausible tail number
  let tail = prefix;
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  if (prefix === 'N') tail += (100 + Math.floor(rng() * 900)) + String(letters[Math.floor(rng() * letters.length)]);
  else if (prefix === 'JA') tail += (10 + Math.floor(rng() * 89)) + String(letters[Math.floor(rng() * letters.length)]);
  else for (let i = 0; i < (prefix.endsWith('-') ? 3 : 2); i++) tail += letters[Math.floor(rng() * letters.length)];
  const currentYear = new Date().getFullYear();
  const ff = aircraft[5] || 2000;
  const age = Math.min(currentYear - ff, currentYear - ff === 0 ? 1 : currentYear - ff) || 1;
  const airframeYear = Math.max(ff, Math.min(currentYear - 1, ff + Math.floor(rng() * (currentYear - ff))));
  const engines = aircraft[4] || [];
  const engineOption = engines.length ? engines[Math.floor(rng() * engines.length)] : null;
  const incidents = aircraft[7] || [];
  const incident = incidents.length && rng() < 0.45 ? incidents[Math.floor(rng() * incidents.length)] : null;
  return {
    registration: tail,
    airframeYear,
    airframeAge: Math.max(1, currentYear - airframeYear),
    engineOption,
    incident, // [title, blurb] or null — bonus pop-up
  };
}

/* ---------- daily seed ---------- */
function todaySeedKey(date) {
  const d = asDate(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function asDate(x) {
  if (x instanceof Date) return x;
  if (typeof x === 'string') return new Date(x + 'T12:00:00');
  return new Date();
}
function daysSinceEpoch(date) {
  const d = asDate(date);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}
function dailySeed(date, difficulty, salt) {
  return `skyq-${daysSinceEpoch(date)}-${difficulty}${salt ? '-' + salt : ''}`;
}

/* ---------- clue schedule ---------- */
/* Clues revealed by guess count (number of guesses already made). */
const CLUE_SCHEDULE = {
  duration: 1, aircraft: 2, type: 3, direction: 4, airline: 5, map: 6,
};
const CLUE_LABELS = {
  duration: 'DURATION', aircraft: 'AIRCRAFT', type: 'TYPE',
  direction: 'DIRECTION', airline: 'AIRLINE', route: 'ROUTE',
};

function clueValue(route, key) {
  switch (key) {
    case 'duration': return fmtDuration(route.durationMins);
    case 'aircraft': return route.aircraft;
    case 'type': return route.international ? 'International' : 'Domestic';
    case 'direction': return `Mostly ${compass8(initialBearing(airportByCode(route.origin), airportByCode(route.dest)))}`;
    case 'airline': return route.airline;
    case 'registration': return route.extraHard ? route.extraHard.registration : null;
    case 'age': return route.extraHard ? `Built ${route.extraHard.airframeYear} · ${route.extraHard.airframeAge} yrs` : null;
    case 'engines': return route.extraHard && route.extraHard.engineOption ? `${route.extraHard.engineOption}` : null;
    default: return null;
  }
}

/* ---------- game state ---------- */
function newGame(route, difficulty) {
  return {
    seed: route.seed,
    difficulty,
    origin: route.origin,
    dest: route.dest,
    km: route.km,
    route, // full puzzle data (secret until end)
    guesses: [],          // [{origin, dest, originOk, destOk, distO, distD, bearO, bearD}]
    status: 'playing',    // playing | won | lost
    hintsUsed: 0,
    usedHints: { origin: 0, dest: 0 },
    startedAt: Date.now(),
  };
}
function maxGuesses() { return 5; }

function applyGuess(state, oCode, dCode) {
  if (state.status !== 'playing') return { ok: false, error: 'Game over' };
  if (!airportByCode(oCode) || !airportByCode(dCode)) return { ok: false, error: 'Unknown airport' };
  if (oCode === dCode) return { ok: false, error: 'Origin and destination must differ' };

  const g = {
    origin: oCode, dest: dCode,
    originOk: oCode === state.origin,
    destOk: dCode === state.dest,
  };
  const ao = airportByCode(oCode), ad = airportByCode(dCode);
  const so = airportByCode(state.origin), sd = airportByCode(state.dest);
  g.distO = Math.round(greatCircleKm(ao, so));
  g.distD = Math.round(greatCircleKm(ad, sd));
  g.bearO = initialBearing(ao, so);
  g.bearD = initialBearing(ad, sd);
  state.guesses.push(g);

  if (g.originOk && g.destOk) state.status = 'won';
  else if (state.guesses.length >= maxGuesses()) state.status = 'lost';
  return { ok: true };
}

function cluesRevealedCount(state) {
  return state.guesses.length;
}
function clueList(state) {
  const n = cluesRevealedCount(state);
  const out = [];
  const keys = ['duration', 'aircraft', 'type', 'direction', 'airline'];
  const labels = { ...CLUE_LABELS, registration: 'REGISTRATION', age: 'AIRFRAME', engines: 'ENGINES' };
  if (state.route.extraHard) {
    // extra-hard interleaves intel into the manifest schedule
    keys.push('registration', 'age', 'engines');
    CLUE_SCHEDULE_EXTRA = { registration: 2, age: 3, engines: 4 };
  }
  for (const key of keys) {
    const unlockAt = (state.route.extraHard && CLUE_SCHEDULE_EXTRA[key]) || CLUE_SCHEDULE[key];
    if (unlockAt === undefined) continue;
    out.push({
      key,
      label: labels[key],
      value: n >= unlockAt ? clueValue(state.route, key) : null,
      unlockAt,
    });
  }
  const gameOver = state.status !== 'playing';
  out.push({
    key: 'route', label: CLUE_LABELS.route,
    value: (n >= CLUE_SCHEDULE.map || gameOver) ? { origin: state.origin, dest: state.dest } : null,
    unlockAt: CLUE_SCHEDULE.map, map: true,
  });
  return out;
}
let CLUE_SCHEDULE_EXTRA = {};

/* ---------- hints (monetization hook) ---------- */
function hintFor(state, side) {
  if (state.status !== 'playing') return { ok: false, error: 'Game over' };
  const target = side === 'origin' ? state.origin : state.dest;
  const already = state.guesses.some(g => (side === 'origin' ? g.originOk : g.destOk));
  if (already) return { ok: false, error: `You already have the ${side}` };
  state.hintsUsed++;
  state.usedHints[side]++;
  return { ok: true, side, code: target, cost: 1 };
}

/* ---------- sharing ---------- */
const EM = { win: '✈️', hit: '✅', miss: '❌', empty: '⬛', hint: '💡', sep: '·' };
function shareEmoji(state) {
  const n = Math.max(state.guesses.length, 1);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const g = state.guesses[i];
    if (!g) rows.push(EM.empty + EM.empty);
    else rows.push((g.originOk ? EM.hit : EM.miss) + (g.destOk ? EM.hit : EM.miss));
  }
  const hints = state.hintsUsed ? ` ${EM.hint}x${state.hintsUsed}` : '';
  const head = `SKYGUESSR ${todaySeedKey()} ${state.difficulty[0].toUpperCase()} ${state.status === 'won' ? state.guesses.length + '/5' : 'X/5'}${hints}`;
  return `${head}\n${rows.join('\n')}\n${EM.win} skyguessr.app`;
}

/* ---------- scoring ---------- */
function scoreFor(state) {
  if (state.status !== 'won') return 0;
  const base = [1000, 700, 500, 350, 200][state.guesses.length - 1] || 100;
  const hintPenalty = state.hintsUsed * 150;
  const mult = (state.route && state.route.niche) || 1;
  return Math.max(50, Math.round((base - hintPenalty) * mult));
}

/* ---------- stats ---------- */
function blankStats() {
  return { played: 0, wins: 0, streak: 0, maxStreak: 0, lastDay: null, lastDifficulty: null, distSum: 0, distN: 0 };
}
function updateStats(stats, state, dayKey) {
  if (stats.lastDay === dayKey && stats.lastDifficulty === state.difficulty) return stats;
  stats.played++;
  stats.distSum += state.km; stats.distN++;
  if (state.status === 'won') {
    stats.wins++;
    stats.streak = (stats.lastDay === yesterdayKey(dayKey)) ? stats.streak + 1 : 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
  } else {
    stats.streak = 0;
  }
  stats.lastDay = dayKey;
  stats.lastDifficulty = state.difficulty;
  return stats;
}
function yesterdayKey(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return todaySeedKey(new Date(Date.UTC(y, m - 1, d) - 86400000));
}

/* ---------- exports (node + browser) ---------- */
const SKYQ = {
  initData, makeRng, greatCircleKm, initialBearing, compass8, oppositeComp, distanceBand,
  fmtKm, fmtDuration, airportByCode, searchAirports, pickAircraft, makeRoute,
  todaySeedKey, asDate, daysSinceEpoch, dailySeed, CLUE_SCHEDULE, clueList, clueValue,
  newGame, applyGuess, maxGuesses, cluesRevealedCount, hintFor, shareEmoji, scoreFor,
  blankStats, updateStats, CLUE_LABELS, GROUPS, REGIONS, RANGE_BANDS, rangeBandById,
  nicheMultiplier,
};
if (typeof module !== 'undefined' && module.exports) module.exports = SKYQ;
if (typeof window !== 'undefined') window.SKYQ = SKYQ;
