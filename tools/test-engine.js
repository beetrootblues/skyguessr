#!/usr/bin/env node
/* Node sanity tests for the SKYQ engine (no framework). */
'use strict';
const E = require('../js/engine.js');
const D = require('../js/data.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; console.log('FAIL', name, '-', e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'eq') + `: got ${a}, want ${b}`); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

E.initData(D.AIRPORTS, D.AIRLINES, D.AIRCRAFT);

t('deterministic daily seed', () => {
  const a = E.makeRoute(E.dailySeed(new Date(2026, 8, 27), 'hard'), { difficulty: 'hard', allowUS: false });
  const b = E.makeRoute(E.dailySeed(new Date(2026, 8, 27), 'hard'), { difficulty: 'hard', allowUS: false });
  eq(a.origin, b.origin); eq(a.dest, b.dest); eq(a.aircraft, b.aircraft); eq(a.airline, b.airline);
});

t('distance sanity (JFK->LHR ~5555km)', () => {
  const jfk = E.airportByCode('JFK'), lhr = E.airportByCode('LHR');
  const km = E.greatCircleKm(jfk, lhr);
  ok(km > 5400 && km < 5700, 'JFK-LHR km ' + km);
});

t('bearing sanity (LAX->JFK mostly east)', () => {
  const b = E.initialBearing(E.airportByCode('LAX'), E.airportByCode('JFK'));
  ok(b > 55 && b < 80, 'bearing ' + b);
});

t('win in one guess', () => {
  const r = E.makeRoute('test-seed-1', { difficulty: 'medium' });
  const s = E.newGame(r, 'medium');
  const res = E.applyGuess(s, r.origin, r.dest);
  ok(res.ok); eq(s.status, 'won'); eq(E.scoreFor(s), 1000);
});

t('loss after 5 wrong guesses', () => {
  const r = E.makeRoute('test-seed-2', { difficulty: 'medium' });
  const s = E.newGame(r, 'medium');
  const wrongO = r.origin === 'LHR' ? 'LGW' : 'LHR';
  const wrongD = r.dest === 'HND' ? 'NRT' : 'HND';
  for (let i = 0; i < 5; i++) {
    const res = E.applyGuess(s, wrongO, wrongD);
    ok(res.ok, 'guess ' + i + ' rejected: ' + res.error);
  }
  eq(s.status, 'lost');
  eq(E.applyGuess(s, r.origin, r.dest).ok, false);
});

t('clue schedule unlocks progressively', () => {
  const r = E.makeRoute('test-seed-3', { difficulty: 'hard' });
  const s = E.newGame(r, 'hard');
  const cl0 = E.clueList(s).filter(c => c.value !== null).length;
  eq(cl0, 0);
  E.applyGuess(s, 'AAA', 'BBB') /* invalid codes rejected */;
  // make a real wrong guess
  const wrongO = r.origin === 'LHR' ? 'LGW' : 'LHR';
  const wrongD = r.dest === 'CDG' ? 'ORY' : 'CDG';
  E.applyGuess(s, wrongO, wrongD);
  const cl1 = E.clueList(s).filter(c => c.value !== null).length;
  eq(cl1, 1, 'after 1 guess');
  for (let i = 0; i < 3; i++) E.applyGuess(s, wrongO, wrongD);
  const cl4 = E.clueList(s).filter(c => c.value !== null).length;
  eq(cl4, 4, 'after 4 guesses');
});

t('route/map clue gated to guess 6 (after game over)', () => {
  const r = E.makeRoute('test-seed-4', { difficulty: 'hard' });
  const s = E.newGame(r, 'hard');
  const wrongO = r.origin === 'IST' ? 'SAW' : 'IST';
  const wrongD = r.dest === 'DXB' ? 'AUH' : 'DXB';
  for (let i = 0; i < 5; i++) E.applyGuess(s, wrongO, wrongD);
  eq(s.status, 'lost');
  const mapClue = E.clueList(s).find(c => c.key === 'route');
  ok(mapClue.value !== null, 'map shown after game ends');
});

t('hint reveals correct side, penalizes score', () => {
  const r = E.makeRoute('test-seed-5', { difficulty: 'medium' });
  const s = E.newGame(r, 'medium');
  const h = E.hintFor(s, 'origin');
  ok(h.ok); eq(h.code, r.origin);
  E.applyGuess(s, r.origin, r.dest);
  eq(s.status, 'won');
  eq(E.scoreFor(s), 850);
});

t('share text shape', () => {
  const r = E.makeRoute('test-seed-6', { difficulty: 'easy' });
  const s = E.newGame(r, 'easy');
  E.applyGuess(s, r.origin, r.dest);
  const txt = E.shareEmoji(s);
  ok(txt.startsWith('SKYGUESSR '), 'starts with SKYGUESSR');
  ok(txt.includes('✅✅'), 'has win row');
  ok(txt.includes('skyguessr.app'), 'has url');
});

t('stats streak logic across days', () => {
  let st = E.blankStats();
  const r = E.makeRoute('s7', { difficulty: 'medium' });
  const s1 = E.newGame(r, 'medium'); s1.status = 'won';
  E.updateStats(st, s1, '2026-09-26');
  eq(st.streak, 1);
  const s2 = E.newGame(r, 'medium'); s2.status = 'won';
  E.updateStats(st, s2, '2026-09-27');
  eq(st.streak, 2);
  eq(st.played, 2);
});

t('searchAirports ranks code prefix first', () => {
  const res = E.searchAirports('lon', 8);
  ok(res.some(a => a[0] === 'LHR'), 'finds LHR for lon');
  const resCode = E.searchAirports('LH', 8);
  eq(resCode[0][0], 'LHR', 'code prefix first');
});

t('dataset: 500+ airlines, all groups present, all regions covered', () => {
  ok(D.AIRLINES.length >= 500, 'at least 500 airlines, got ' + D.AIRLINES.length);
  for (const g of ['FLAG', 'LCC', 'CARGO', 'MAJOR', 'REGIONAL', 'LEISURE', 'CHARTER']) {
    ok(D.AIRLINES.some(a => a[3] === g), 'has group ' + g);
  }
  for (const r of ['NA', 'CA', 'SA', 'EU', 'ME', 'AF', 'AS', 'OC']) {
    ok(D.AIRLINES.some(a => a[1] === r), 'has region ' + r);
  }
  ok(D.AIRLINES.some(a => a[2] === 'Singapore'), 'has Singapore carrier');
  ok(D.AIRLINES.some(a => a[2] === 'United Arab Emirates'), 'has UAE carrier');
  ok(D.AIRLINES.some(a => a[2] === 'France'), 'has France carrier');
});

t('country scope keeps both endpoints in-country', () => {
  for (let i = 0; i < 6; i++) {
    const r = E.makeRoute('cty' + i, { difficulty: 'medium', scope: { country: 'France' } });
    eq(E.airportByCode(r.origin).country, 'France', 'origin in FR');
    eq(E.airportByCode(r.dest).country, 'France', 'dest in FR');
  }
});

t('region scope keeps routes in-region', () => {
  for (let i = 0; i < 6; i++) {
    const r = E.makeRoute('rgn' + i, { difficulty: 'medium', scope: { region: 'EU' } });
    eq(E.airportByCode(r.origin).region, 'EU', 'origin in EU');
    eq(E.airportByCode(r.dest).region, 'EU', 'dest in EU');
  }
});

t('carrier-class scope: cargo routes always get freighters', () => {
  for (let i = 0; i < 20; i++) {
    const r = E.makeRoute('cgo' + i, { difficulty: 'hard', scope: { groups: ['CARGO'] } });
    eq(r.airlineGroup, 'CARGO', 'airline is cargo');
    ok(r.freighter, r.aircraft + ' should be a freighter');
  }
});

t('flag-carrier scope picks FLAG airlines', () => {
  for (let i = 0; i < 10; i++) {
    const r = E.makeRoute('flg' + i, { difficulty: 'medium', scope: { groups: ['FLAG'] } });
    eq(r.airlineGroup, 'FLAG', 'airline is flag');
  }
});

t('range bands: SHORT and ULTRA respect distance limits', () => {
  for (let i = 0; i < 8; i++) {
    const s = E.makeRoute('sb' + i, { difficulty: 'easy', rangeBand: 'SHORT' });
    ok(s.km <= 1600, 'short hop <= ~1500km, got ' + s.km);
    const u = E.makeRoute('ub' + i, { difficulty: 'medium', rangeBand: 'ULTRA' });
    ok(u.km >= 8000, 'ultra >= ~9000km, got ' + u.km);
  }
});

t('extra-hard intel: registration, year, engine, occasional incident', () => {
  let incidentSeen = false;
  for (let i = 0; i < 60 && !incidentSeen; i++) {
    const r = E.makeRoute('eh' + i, { difficulty: 'medium', extraHard: true });
    ok(r.extraHard && r.extraHard.registration.length >= 2, 'has registration');
    ok(r.extraHard.airframeAge >= 1, 'airframe age >= 1');
    ok(r.engines.length > 0, 'has engine options');
    if (r.extraHard.incident) incidentSeen = true;
  }
  ok(incidentSeen, 'incidents appear sometimes');
});

t('niche scoring: niche scopes score higher than world', () => {
  const world = E.makeRoute('nm1', { difficulty: 'medium' });
  const niche = E.makeRoute('nm2', { difficulty: 'medium', scope: { country: 'France', group: 'FLAG' } });
  ok(niche.niche > world.niche, 'niche multiplier bigger: ' + niche.niche + ' vs ' + world.niche);
  const cargoR = E.makeRoute('nm3', { difficulty: 'medium', scope: { group: 'CARGO' } });
  ok(cargoR.niche >= 1.8, 'cargo bonus: ' + cargoR.niche);
});

t('score applies niche multiplier', () => {
  const r = E.makeRoute('sc1', { difficulty: 'medium', scope: { country: 'Singapore', group: 'FLAG' } });
  const s = E.newGame(r, 'medium');
  E.applyGuess(s, r.origin, r.dest);
  const expected = Math.round(1000 * r.niche);
  eq(E.scoreFor(s), expected, 'first-guess score = 1000 x niche');
});

t('puzzle pool excludes US when allowUS=false (hard daily)', () => {
  for (let i = 0; i < 30; i++) {
    const r = E.makeRoute('hard-' + i, { difficulty: 'hard', allowUS: false });
    ok(E.airportByCode(r.origin).country !== 'United States', 'origin non-US ' + r.origin);
    ok(E.airportByCode(r.dest).country !== 'United States', 'dest non-US ' + r.dest);
  }
});

t('aircraft always feasible for route distance', () => {
  for (let i = 0; i < 50; i++) {
    const r = E.makeRoute('ac-' + i, { difficulty: 'medium' });
    const ac = D.AIRCRAFT.find(a => a[0] === r.aircraft);
    ok(ac && ac[1] >= r.km * 0.9, `${r.aircraft} range ${ac[1]} vs ${r.km}km`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
