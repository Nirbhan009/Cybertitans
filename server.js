/* CRACK THE VAULT server. Lets phones join the game and keeps one shared set of
   money and leaderboards. No npm packages needed: run with `node server.js`.
   Vault codes, puzzle answers and Scam Spotter answers stay here; phones only
   ever get what is on their screen. */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { exec } = require('child_process');

for (const f of ['ops', 'puzzles', 'console', 'filter']) require(path.join(__dirname, 'js', f + '.js'));
const SCAMS = require(path.join(__dirname, 'scam-pool.js'));
const { DEFAULTS, COLLECTIONS, applyOp, emptyDb, hashPin, hardPrice, Puzzles, Engine, Filter } = globalThis.CTV;

const DATA_FILE = process.env.CTV_DATA || path.join(__dirname, 'data.json');
const START_PORT = Number(process.env.PORT) || 8080;
const SCAM_COUNT = 10, DUEL_LEAD_MS = 4000, REVEAL_MS = 2500;

let db = emptyDb();
db.phones = {};
db.duels = {};
db.events = [];
db.hostKey = crypto.randomBytes(16).toString('hex');
try { Object.assign(db, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); } catch (e) { /* first run */ }
db.duels = db.duels || {};
db.events = db.events || [];

let version = 1, saveTimer = null, joinUrl = '';
const staffTokens = new Set();
let pinFails = 0, pinLockUntil = 0;

function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}
function bump() {
  version++;
  if (!saveTimer) saveTimer = setTimeout(saveNow, 200);
}

const settings = () => Object.assign({}, DEFAULTS, db.settings);
const uid = () => crypto.randomBytes(6).toString('hex');
const phones = () => Object.values(db.phones);
const randInt = () => crypto.randomBytes(4).readUInt32LE(0);
const tokenOf = p => Object.keys(db.phones).find(k => db.phones[k] === p);
const findPid = pid => phones().find(p => p.pid === pid);

function fmt(ms) {
  const c = Math.round(ms / 10);
  return `${Math.floor(c / 6000)}:${String(Math.floor(c / 100) % 60).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`;
}

/* The projector's live ticker. */
function event(text) {
  db.events.push({ id: uid(), t: Date.now(), text });
  if (db.events.length > 40) db.events.splice(0, db.events.length - 40);
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[crypto.randomInt(A.length)];
    const taken = phones().some(p => p.code === c && (p.status === 'waiting' || p.status === 'duel-open'));
    if (!taken) return c;
  }
}

const roundOf = p => Puzzles.generateRound(p.round.seed, undefined, p.tier);
function engineOf(p, round) {
  const e = new Engine(round);
  e.restore(p.round.engine);
  return e;
}

function addSale(type, attempts, amount, note) {
  const sale = { id: uid(), t: Date.now(), type, attempts, amount, note };
  db.ledger.push(sale);
  return sale.id;
}
function voidSale(id) {
  const sale = db.ledger.find(s => s.id === id);
  if (!sale || sale.voided) return;
  sale.voided = true;
  db.ledger.push({ id: uid(), t: Date.now(), type: 'void', attempts: -sale.attempts, amount: -sale.amount, note: 'void of ' + sale.type });
}

const tierBoard = tier => globalThis.CTV.sortBoard(db.board.filter(e => (e.tier || 'easy') === tier), tier);

function priceFor(p) {
  const s = settings();
  if (p.duelId) return 2 * s.priceRound;
  if (p.tier === 'scam') return s.scamPrice;
  if (p.tier === 'hard') return hardPrice(s, !!p.fast);
  return s.priceRound;
}

/* ---- Duels ---- */
const duelOf = p => (p && p.duelId ? db.duels[p.duelId] : null);
const duelPlayers = d => [db.phones[d.a] || null, d.b ? db.phones[d.b] || null : null];
function opponentOf(p) {
  const d = duelOf(p);
  if (!d) return null;
  const t = tokenOf(p);
  return db.phones[t === d.a ? d.b : d.a] || null;
}

function openDuel(p) {
  const d = { id: uid(), room: newCode(), a: tokenOf(p), b: null, status: 'open', seed: randInt(), created: Date.now() };
  db.duels[d.id] = d;
  Object.assign(p, { tier: 'easy', duelId: d.id, status: 'duel-open', code: d.room, result: null, round: null, credits: 0, ready: false });
  bump();
}

function joinDuel(p, d) {
  d.b = tokenOf(p);
  d.status = 'waiting';
  const a = db.phones[d.a];
  [a, p].forEach(x => Object.assign(x, { tier: 'easy', duelId: d.id, code: d.room, status: 'waiting', waitingSince: Date.now(), result: null, round: null, credits: 0, ready: false }));
  event(`${a.nick} challenged ${p.nick} to a DUEL`);
  bump();
}

function cancelDuel(d) {
  duelPlayers(d).forEach(x => { if (x) { x.duelId = null; backOut(x, tokenOf(x)); } });
  delete db.duels[d.id];
  bump();
}

/* Leaving the payment line must not cost a returning player their Hard discount. */
function backOut(p, token) {
  if (p.played || p.easyDone) {
    p.status = 'done';
    p.result = { won: false, reason: 'cancelled', ms: 0, rank: 0, tier: p.tier, found: 0 };
  } else {
    delete db.phones[token];
  }
  bump();
}

function finish(p, won, reason, ms) {
  const round = roundOf(p);
  const e = engineOf(p, round);
  p.status = 'done';
  p.played = true;
  /* Everyone gets a board entry; a non-crack ranks below every crack, by locks broken. */
  const used = won ? ms : Math.max(0, Math.min(Date.now(), p.round.endsAt) - p.round.startedAt);
  const entry = { id: uid(), t: Date.now(), nick: p.nick, ms: used, hints: p.round.hints, tier: p.tier };
  if (!won) Object.assign(entry, { cracked: false, found: e.count() });
  db.board.push(entry);
  const rank = tierBoard(p.tier).findIndex(x => x.id === entry.id) + 1;
  if (won) event(`${p.nick} CRACKED ${p.tier === 'hard' ? 'HARD MODE' : 'the vault'} in ${fmt(ms)}`);
  const d = duelOf(p);
  db.rounds.push({
    id: uid(), t: Date.now(), nick: p.nick, tier: d ? 'duel' : p.tier, device: 'phone',
    result: won ? 'cracked' : reason === 'time' ? 'time up' : reason === 'beaten' ? 'beaten in duel' : 'locked out',
    ms: ms || 0, hints: p.round.hints, wrong: p.round.wrong, counted: true
  });
  if (p.tier === 'easy') {
    p.easyDone = true;
    if (won && ms <= settings().thresholdSec * 1000) p.fast = true;
  }
  p.prize = won ? 'pending' : null;
  p.result = { won, reason, ms: ms || 0, rank, tier: p.tier, code: round.code, found: e.count() };
  if (d) {
    const other = opponentOf(p);
    p.result.duel = { opponent: other ? other.nick : '' };
    if (won && d.status !== 'done') {
      d.status = 'done'; d.endedAt = Date.now(); d.winnerTok = tokenOf(p); d.winner = p.nick; d.winMs = ms;
      event(`${p.nick} WON THE DUEL against ${other ? other.nick : 'their rival'}!`);
      if (other && other.status === 'play') finish(other, false, 'beaten');
      else if (other && other.result && other.result.duel) Object.assign(other.result.duel, { winner: p.nick, winMs: ms });
    } else if (!won && (!other || other.status !== 'play') && d.status !== 'done') {
      d.status = 'done'; d.endedAt = Date.now();
      event('Duel over: the vault beat them both');
    }
    p.result.duel.winner = d.winner || null;
    p.result.duel.winMs = d.winMs || 0;
  }
  bump();
}

/* ---- Scam Spotter ---- */
const scamById = id => SCAMS.find(s => s.id === id);
function scamPick(seed) {
  const r = rng(seed);
  const scams = shuffle(r, SCAMS.filter(s => s.scam)).slice(0, SCAM_COUNT / 2);
  const legit = shuffle(r, SCAMS.filter(s => !s.scam)).slice(0, SCAM_COUNT / 2);
  return shuffle(r, scams.concat(legit)).map(s => s.id);
}

function finishScam(p, reason) {
  const R = p.round;
  const correct = R.answers.filter(a => a.correct).length;
  const ms = Math.max(0, Math.min(Date.now(), R.endsAt) - R.startedAt);
  p.status = 'done';
  p.played = true;
  const entry = { id: uid(), t: Date.now(), nick: p.nick, ms, score: R.score, correct, hints: 0, tier: 'scam' };
  db.board.push(entry);
  const rank = tierBoard('scam').findIndex(x => x.id === entry.id) + 1;
  db.rounds.push({ id: uid(), t: Date.now(), nick: p.nick, tier: 'scam', device: 'phone', result: `${correct}/${R.items.length} spotted`, ms, hints: 0, wrong: R.items.length - correct, counted: true });
  p.prize = null;
  p.result = { kind: 'scam', tier: 'scam', score: R.score, correct, total: R.items.length, ms, rank, reason };
  event(`${p.nick} spotted ${correct}/${R.items.length} scams: ${R.score} pts`);
  bump();
}

function expire(p) {
  if (p.status !== 'play' || Date.now() < p.round.endsAt) return;
  if (p.round.kind === 'scam') finishScam(p, 'time');
  else finish(p, false, 'time');
}

function publicPuzzles(p, round, e) {
  return round.puzzles.map((orig, i) => {
    const q = JSON.parse(JSON.stringify(orig));
    for (const k of ['digit', 'explain', 'hints', 'plain', 'value', 'secret', 'shift']) delete q[k];
    if (q.folders) q.folders.forEach(f => f.files.forEach(file => { if (p.tier === 'hard') delete file.secret; }));
    if (e.solved[i]) { q.digit = orig.digit; q.explain = orig.explain; }
    return q;
  });
}

function offer(p) {
  const s = settings();
  return {
    available: !!p.easyDone, fast: !!p.fast, price: hardPrice(s, !!p.fast),
    thresholdSec: s.thresholdSec, easyPrice: s.priceRound, packPrice: s.pricePack, scamPrice: s.scamPrice
  };
}

function scamView(R) {
  return {
    items: R.items.map(id => { const s = scamById(id); return { kind: s.kind, from: s.from, subject: s.subject || '', text: s.text }; }),
    answers: R.answers, score: R.score
  };
}

function view(p) {
  expire(p);
  const s = settings();
  const d = duelOf(p);
  const other = opponentOf(p);
  const v = {
    now: Date.now(), status: p.status, nick: p.nick, code: p.code, tier: p.tier,
    credits: p.credits || 0, offer: offer(p), prize: p.prize || null, result: p.result || null,
    hintPrice: s.priceHint, signupUrl: s.signupUrl || '',
    board: { easy: tierBoard('easy').slice(0, 5), hard: tierBoard('hard').slice(0, 5), scam: tierBoard('scam').slice(0, 5) },
    duel: d ? { room: d.room, status: d.status, opponent: other ? other.nick : null, iAmReady: !!p.ready, startAt: d.startAt || 0 } : null
  };
  if (p.status === 'waiting') v.price = priceFor(p);
  if (p.round) {
    v.duration = p.round.duration;
    v.maxWrong = p.round.maxWrong;
    v.rid = p.round.rid;
    if (p.round.kind === 'scam') {
      Object.assign(v, { scam: scamView(p.round), startedAt: p.round.startedAt || 0, endsAt: p.round.endsAt || 0 });
    } else if (p.status === 'play') {
      const round = roundOf(p), e = engineOf(p, round);
      Object.assign(v, {
        startAt: p.round.startedAt, endsAt: p.round.endsAt, wrong: p.round.wrong, puzzles: publicPuzzles(p, round, e),
        solved: e.solved, jamUntil: e.jamUntil, wrongs: e.wrongs, hintLog: e.hintLog, current: e.current
      });
    }
  }
  return v;
}

function assignRound(p, saleId, seed) {
  const s = settings();
  if (p.tier === 'scam') {
    const sd = seed === undefined ? randInt() : seed;
    p.round = { rid: uid(), kind: 'scam', seed: sd, saleId, items: scamPick(sd), answers: [], score: 0, hints: 0, wrong: 0, duration: s.scamTimerSec * 1000, maxWrong: 0 };
  } else {
    const hard = p.tier === 'hard';
    p.round = {
      rid: uid(), seed: seed === undefined ? randInt() : seed, saleId, hints: 0, wrong: 0, engine: null,
      duration: (hard ? s.hardTimerSec : s.timerSec) * 1000, maxWrong: hard ? s.hardWrongTries : s.wrongTries
    };
  }
  p.status = 'ready';
  p.ready = false;
}

function request(p, tier) {
  Object.assign(p, { tier, credits: 0, code: newCode(), result: null, round: null, duelId: null, ready: false });
  if (tier === 'scam' && settings().scamPrice === 0) {
    assignRound(p, null);
    bump();
    return;
  }
  p.status = 'waiting';
  p.waitingSince = Date.now();
  bump();
}

/* Staff queue: what the laptop panel and the staff phone page draw. */
function queue() {
  const s = settings();
  const rows = [];
  phones().forEach(p => {
    expire(p);
    const d = duelOf(p);
    if (p.status === 'waiting') {
      if (d) {
        if (tokenOf(p) !== d.a) return;
        const other = opponentOf(p);
        rows.push({ group: 'waiting', pid: p.pid, code: p.code, nick: `${p.nick} vs ${other ? other.nick : '?'}`, tier: 'duel', duel: true, since: p.waitingSince, price: 2 * s.priceRound });
        return;
      }
      rows.push({
        group: 'waiting', pid: p.pid, code: p.code, nick: p.nick, tier: p.tier, since: p.waitingSince,
        price: priceFor(p), packPrice: s.pricePack, fast: !!p.fast
      });
    } else if (p.status === 'play' || p.status === 'ready') {
      let progress = 'Reading briefing';
      if (p.status === 'play') {
        progress = p.round.kind === 'scam'
          ? `${p.round.answers.length}/${p.round.items.length} answered`
          : `${engineOf(p, roundOf(p)).count()}/4 digits`;
      } else if (d) progress = p.ready ? 'Ready, waiting for rival' : 'Reading briefing';
      rows.push({
        group: 'playing', pid: p.pid, nick: p.nick, tier: d ? 'duel' : p.tier, kind: p.round.kind || 'vault', status: p.status, progress,
        leftMs: p.status === 'play' ? p.round.endsAt - Date.now() : p.round.duration, wrong: p.round.wrong, hints: p.round.hints
      });
    } else if (p.status === 'done' && p.prize === 'pending') {
      rows.push({ group: 'winners', pid: p.pid, nick: p.nick, tier: p.result && p.result.duel ? 'duel' : p.tier, ms: p.result.ms });
    }
  });
  return rows.sort((a, b) => (a.since || 0) - (b.since || 0));
}

/* What the projector needs for the live duel and the ticker. */
function live() {
  const now = Date.now();
  const lane = t => {
    const p = db.phones[t];
    if (!p) return null;
    let solved = 0;
    if (p.round && p.round.engine && p.round.engine.solved) solved = p.round.engine.solved.filter(Boolean).length;
    return { nick: p.nick, solved, wrong: p.round ? p.round.wrong : 0, done: p.status === 'done', ready: !!p.ready, reason: p.result ? p.result.reason : null };
  };
  const duels = Object.values(db.duels)
    .filter(d => d.status === 'ready' || d.status === 'play' || (d.status === 'done' && d.startAt && now - d.endedAt < 25000))
    .sort((a, b) => (a.startAt || Infinity) - (b.startAt || Infinity))
    .map(d => {
      const a = db.phones[d.a];
      const dur = a && a.round ? a.round.duration : 0;
      return {
        id: d.id, status: d.status, a: lane(d.a), b: lane(d.b), startAt: d.startAt || 0,
        endsAt: d.startAt ? d.startAt + dur : 0, winner: d.winner || null, winnerSide: d.winnerTok ? (d.winnerTok === d.a ? 'a' : 'b') : null, winMs: d.winMs || 0
      };
    });
  return { now, duels, events: db.events.slice(-12) };
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = c.slice(i + 1).trim();
  });
  return out;
}
const isHost = req => parseCookies(req).ctv_host === db.hostKey;
const isStaff = req => isHost(req) || staffTokens.has(parseCookies(req).ctv_staff);

function send(res, code, obj, headers) {
  res.writeHead(code, Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, headers));
  res.end(obj === undefined ? '' : JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > 65536) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
function serveFile(res, rel) {
  fs.readFile(path.join(__dirname, rel), (err, data) => {
    if (err) { send(res, 404, { error: 'not found' }); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(rel)], 'cache-control': 'no-store' });
    res.end(data);
  });
}

function hostState() {
  return { v: version, settings: db.settings, ledger: db.ledger, board: db.board, rounds: db.rounds, easyLog: db.easyLog, joinUrl, live: live() };
}

const notStarted = p => p.round && p.round.startedAt && Date.now() < p.round.startedAt;

async function phoneApi(req, res, route, url) {
  const token = req.headers['x-phone'];
  if (route === 'duelinfo') {
    const room = String(url.searchParams.get('room') || '').toUpperCase();
    const d = Object.values(db.duels).find(x => x.room === room && x.status === 'open');
    if (!d) return send(res, 404, { error: 'That duel has already started or ended.' });
    return send(res, 200, { host: db.phones[d.a] ? db.phones[d.a].nick : '?', price: settings().priceRound });
  }
  if (route === 'join') {
    const body = await readBody(req);
    const v = Filter.validateName(body.nick);
    if (!v.ok) return send(res, 400, { error: v.msg });
    let d = null;
    if (body.duel) {
      d = Object.values(db.duels).find(x => x.room === String(body.duel).toUpperCase() && x.status === 'open');
      if (!d) return send(res, 400, { error: 'That duel has already started or ended.' });
    }
    const t = crypto.randomBytes(16).toString('hex');
    const p = db.phones[t] = { pid: uid(), nick: v.name, tier: 'easy', credits: 0 };
    if (d) joinDuel(p, d);
    else if (body.tier === 'duel') openDuel(p);
    else request(p, body.tier === 'scam' ? 'scam' : 'easy');
    return send(res, 200, { token: t, view: view(p) });
  }
  const p = db.phones[token];
  if (!p) return send(res, 404, { error: 'unknown phone' });
  if (route === 'state') return send(res, 200, view(p));

  const body = await readBody(req);
  expire(p);
  if (route === 'start') {
    if (p.status !== 'ready') return send(res, 409, { error: 'not approved yet' });
    const d = duelOf(p);
    if (d) {
      p.ready = true;
      const [a, b] = duelPlayers(d);
      if (a && b && a.ready && b.ready && a.status === 'ready' && b.status === 'ready') {
        const startAt = Date.now() + DUEL_LEAD_MS;
        [a, b].forEach(x => { x.status = 'play'; x.round.startedAt = startAt; x.round.endsAt = startAt + x.round.duration; });
        d.status = 'play';
        d.startAt = startAt;
        event(`DUEL: ${a.nick} vs ${b.nick} is ON!`);
      }
      bump();
      return send(res, 200, view(p));
    }
    p.status = 'play';
    p.round.startedAt = Date.now();
    p.round.endsAt = p.round.startedAt + p.round.duration;
    bump();
    return send(res, 200, view(p));
  }
  if (route === 'scam') {
    if (p.status !== 'play' || p.round.kind !== 'scam') return send(res, 409, { error: 'round is over', view: view(p) });
    const R = p.round;
    const i = Number(body.i);
    if (i !== R.answers.length) return send(res, 409, { error: 'out of order', view: view(p) });
    const item = scamById(R.items[i]);
    const now = Date.now();
    const correct = (body.verdict === 'scam') === item.scam;
    const shownAt = (R.lastAt || R.startedAt) + (R.answers.length ? REVEAL_MS : 0);
    const bonus = correct ? Math.max(0, Math.round(50 - Math.max(0, now - shownAt) / 200)) : 0;
    const answer = { verdict: body.verdict === 'scam' ? 'scam' : 'legit', correct, scam: item.scam, flags: item.flags, why: item.why, points: correct ? 100 + bonus : 0 };
    R.answers.push(answer);
    R.score += answer.points;
    R.lastAt = now;
    if (R.answers.length >= R.items.length) finishScam(p, 'done');
    else bump();
    return send(res, 200, { answer, score: R.score, view: view(p) });
  }
  if (route === 'attempt' || route === 'select') {
    if (p.status !== 'play' || p.round.kind === 'scam') return send(res, 409, { error: 'round is over', view: view(p) });
    if (notStarted(p)) return send(res, 409, { error: 'not started yet' });
    const round = roundOf(p), e = engineOf(p, round);
    const slot = Number(body.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot > 3) return send(res, 400, { error: 'bad lock' });
    if (route === 'select') { e.current = slot; p.round.engine = e.state(); return send(res, 200, {}); }
    const r = e.attempt(slot, body.value);
    p.round.engine = e.state();
    if (r.status === 'solved') event(`${p.nick} cracked the ${round.puzzles[slot].title}`);
    if (r.status === 'wrong') event(`${p.nick} tripped the firewall`);
    bump();
    const out = { status: r.status, ms: r.ms, jamUntil: e.jamUntil, wrongs: e.wrongs, now: Date.now() };
    if (r.status === 'solved') { out.digit = round.puzzles[slot].digit; out.explain = round.puzzles[slot].explain; }
    return send(res, 200, out);
  }
  if (route === 'code') {
    if (p.status !== 'play' || p.round.kind === 'scam') return send(res, 409, { error: 'round is over', view: view(p) });
    if (notStarted(p)) return send(res, 409, { error: 'not started yet' });
    const round = roundOf(p);
    if (String(body.code) === round.code) {
      finish(p, true, null, Date.now() - p.round.startedAt);
      return send(res, 200, { status: 'won', view: view(p) });
    }
    p.round.wrong++;
    const left = p.round.maxWrong - p.round.wrong;
    event(`${p.nick} set off the vault alarm`);
    if (left <= 0) {
      finish(p, false, 'tries');
      return send(res, 200, { status: 'lost', left: 0, view: view(p) });
    }
    bump();
    return send(res, 200, { status: 'wrong', left });
  }
  if (route === 'next') {
    if (p.status !== 'done' || !(p.credits > 0)) return send(res, 409, { error: 'no attempts left' });
    p.credits--;
    assignRound(p, p.saleId);
    bump();
    return send(res, 200, view(p));
  }
  if (route === 'request') {
    if (p.status !== 'done') return send(res, 409, { error: 'finish your round first' });
    if (body.tier === 'hard' && !p.easyDone) return send(res, 403, { error: 'play Easy first' });
    if (body.duel) {
      const d = Object.values(db.duels).find(x => x.room === String(body.duel).toUpperCase() && x.status === 'open');
      if (!d || d.a === token) return send(res, 400, { error: 'That duel has already started or ended.' });
      joinDuel(p, d);
    } else if (body.tier === 'duel') openDuel(p);
    else request(p, ['hard', 'scam'].includes(body.tier) ? body.tier : 'easy');
    return send(res, 200, view(p));
  }
  if (route === 'cancel') {
    if (p.status !== 'waiting' && p.status !== 'duel-open') return send(res, 409, { error: 'too late' });
    const d = duelOf(p);
    if (d) cancelDuel(d); else backOut(p, token);
    return send(res, 200, db.phones[token] ? view(p) : {});
  }
  return send(res, 404, { error: 'unknown' });
}

async function adminApi(req, res, route) {
  if (route === 'login') {
    const body = await readBody(req);
    if (Date.now() < pinLockUntil) return send(res, 429, { error: 'Locked. Try again soon.' });
    const s = settings();
    if ((s.pinHash || hashPin('2580')) !== hashPin(String(body.pin))) {
      if (++pinFails >= 5) { pinFails = 0; pinLockUntil = Date.now() + 30000; }
      return send(res, 403, { error: 'Wrong PIN.' });
    }
    pinFails = 0;
    const t = crypto.randomBytes(16).toString('hex');
    staffTokens.add(t);
    return send(res, 200, {}, { 'set-cookie': `ctv_staff=${t}; HttpOnly; SameSite=Lax; Path=/` });
  }
  if (!isStaff(req)) return send(res, 403, { error: 'staff only' });
  if (route === 'queue') return send(res, 200, { rows: queue(), joinUrl, hintPrice: settings().priceHint });

  const body = await readBody(req);
  const p = findPid(body.pid);
  if (!p) return send(res, 404, { error: 'player has gone' });
  const s = settings();
  const d = duelOf(p);
  if (route === 'approve') {
    if (p.status !== 'waiting') return send(res, 409, { error: 'already handled' });
    if (d) {
      const [a, b] = duelPlayers(d);
      if (!a || !b) return send(res, 409, { error: 'duel is missing a player' });
      d.saleId = addSale('duel', 2, 2 * s.priceRound, `duel ${a.nick} vs ${b.nick}`);
      [a, b].forEach(x => { x.credits = 0; x.saleId = d.saleId; assignRound(x, d.saleId, d.seed); });
      d.status = 'ready';
    } else if (p.tier === 'hard') {
      p.saleId = addSale('hard', 1, hardPrice(s, !!p.fast), 'phone ' + p.nick);
      p.credits = 0;
      assignRound(p, p.saleId);
    } else if (p.tier === 'scam') {
      p.saleId = addSale('scam', 1, s.scamPrice, 'phone ' + p.nick);
      p.credits = 0;
      assignRound(p, p.saleId);
    } else if (body.pack) {
      p.saleId = addSale('pack', 3, s.pricePack, 'phone ' + p.nick);
      p.credits = 2;
      assignRound(p, p.saleId);
    } else {
      p.saleId = addSale('round', 1, s.priceRound, 'phone ' + p.nick);
      p.credits = 0;
      assignRound(p, p.saleId);
    }
    bump();
    return send(res, 200, { rows: queue() });
  }
  if (route === 'remove') {
    if (p.status !== 'waiting') return send(res, 409, { error: 'already handled' });
    if (d) cancelDuel(d); else backOut(p, tokenOf(p));
    return send(res, 200, { rows: queue() });
  }
  if (route === 'hint') {
    if (p.status !== 'play' || p.round.kind === 'scam') return send(res, 409, { error: 'not playing a vault' });
    const e = engineOf(p, roundOf(p));
    const h = e.giveHint(e.current);
    if (!h) return send(res, 409, { error: 'all solved' });
    p.round.engine = e.state();
    p.round.hints++;
    addSale('hint', 0, s.priceHint, 'phone ' + p.nick);
    bump();
    return send(res, 200, { rows: queue() });
  }
  if (route === 'void') {
    if (p.status !== 'play' && p.status !== 'ready') return send(res, 409, { error: 'not playing' });
    if (d) {
      voidSale(d.saleId);
      duelPlayers(d).forEach(x => {
        if (!x) return;
        x.status = 'done';
        x.duelId = null;
        x.result = { won: false, reason: 'cancelled', ms: 0, rank: 0, tier: 'easy', found: 0 };
      });
      d.status = 'done'; d.endedAt = Date.now();
      db.rounds.push({ id: uid(), t: Date.now(), nick: p.nick, tier: 'duel', device: 'phone', result: 'voided', ms: 0, hints: 0, wrong: 0, counted: false });
      bump();
      return send(res, 200, { rows: queue() });
    }
    voidSale(p.saleId);
    db.rounds.push({ id: uid(), t: Date.now(), nick: p.nick, tier: p.tier, device: 'phone', result: 'voided', ms: 0, hints: p.round.hints, wrong: p.round.wrong, counted: false });
    request(p, p.tier);
    return send(res, 200, { rows: queue() });
  }
  if (route === 'prize') {
    p.prize = 'given';
    bump();
    return send(res, 200, { rows: queue() });
  }
  return send(res, 404, { error: 'unknown' });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p === '/') {
    const key = url.searchParams.get('key');
    if (key && key === db.hostKey) {
      res.writeHead(302, { location: '/', 'set-cookie': `ctv_host=${key}; HttpOnly; SameSite=Lax; Path=/`, 'cache-control': 'no-store' });
      return res.end();
    }
    if (!isHost(req)) { res.writeHead(302, { location: '/play', 'cache-control': 'no-store' }); return res.end(); }
    return serveFile(res, 'index.html');
  }
  if (p === '/play') return serveFile(res, 'phone.html');
  if (p === '/staff') return serveFile(res, 'staff.html');
  if (/^\/(css|js)\/[a-z0-9_-]+\.(css|js)$/.test(p)) return serveFile(res, p.slice(1));

  if (p === '/api/state') {
    if (!isHost(req)) return send(res, 403, { error: 'host only' });
    if (Number(url.searchParams.get('v')) === version) return send(res, 204);
    return send(res, 200, hostState());
  }
  if (p === '/api/op') {
    if (!isHost(req)) return send(res, 403, { error: 'host only' });
    const op = await readBody(req);
    if (op.c !== 'settings' && !COLLECTIONS.includes(op.c)) return send(res, 400, { error: 'bad op' });
    applyOp(db, op);
    if (op.c === 'board' && op.a === 'add' && op.item && op.item.cracked !== false) {
      event(`${op.item.nick} CRACKED ${op.item.tier === 'hard' ? 'HARD MODE' : 'the vault'} at the booth in ${fmt(op.item.ms)}`);
    }
    bump();
    return send(res, 200, { v: version });
  }
  const m = p.match(/^\/api\/(phone|admin)\/([a-z]+)$/);
  if (m) return m[1] === 'phone' ? phoneApi(req, res, m[2], url) : adminApi(req, res, m[2]);
  return send(res, 404, { error: 'not found' });
}

function lanAddress() {
  const found = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(name => {
    if (/vEthernet|VMware|VirtualBox|WSL|Loopback|Bluetooth|Hyper-V/i.test(name)) return;
    nets[name].forEach(n => { if (n.family === 'IPv4' && !n.internal) found.push(n.address); });
  });
  return found.find(a => a === '192.168.137.1') || found.find(a => a.startsWith('192.168.')) ||
    found.find(a => /^(10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a)) || found[0] || '127.0.0.1';
}

setInterval(() => {
  phones().forEach(expire);
  const now = Date.now();
  Object.keys(db.phones).forEach(k => {
    const p = db.phones[k];
    if (p && p.status === 'waiting' && !p.played && !p.easyDone && !p.duelId && p.waitingSince < now - 45 * 60000) { delete db.phones[k]; bump(); }
  });
  Object.values(db.duels).forEach(d => {
    if (d.status === 'open' && now - d.created > 15 * 60000) cancelDuel(d);
    else if (d.status === 'done' && now - (d.endedAt || 0) > 10 * 60000) { delete db.duels[d.id]; bump(); }
  });
}, 1000).unref();

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => {
    if (!res.headersSent) send(res, 400, { error: 'bad request' });
    else res.end();
    if (process.env.CTV_DEBUG) console.error(e);
  });
});

function listen(port) {
  server.once('error', err => {
    if (err.code === 'EADDRINUSE' && port < START_PORT + 10) listen(port + 1);
    else { console.error(err.message); process.exit(1); }
  });
  server.listen(port, '0.0.0.0', () => {
    saveNow();
    joinUrl = process.env.PUBLIC_URL || `http://${lanAddress()}:${port}/play`;
    const hostUrl = `http://localhost:${port}/?key=${db.hostKey}`;
    console.log('\n  CRACK THE VAULT is running.\n');
    console.log('  Game screen (this laptop only):  ' + hostUrl);
    console.log('  Players join on phones at:       ' + joinUrl);
    console.log('  Scam Spotter station (tablet):   ' + joinUrl + '?station');
    console.log('  Staff phone page:                ' + joinUrl.replace(/\/play$/, '/staff'));
    console.log('\n  Keep this window open during the event. Close it to stop.\n');
    if (process.argv.includes('--open')) exec(`start "" "${hostUrl}"`);
  });
}
process.on('SIGINT', () => { saveNow(); process.exit(0); });
listen(START_PORT);
