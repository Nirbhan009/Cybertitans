/* Money, leaderboards and settings. Opened as a file, everything lives in this
   browser. Opened through the server, the server is the shared copy, so laptop
   and phones add up to one total. The rest of the game cannot tell which it is. */
(function () {
  const CTV = window.CTV = window.CTV || {};
  const SERVER = location.protocol !== 'file:';
  const KEY = {
    settings: 'ctv.settings', ledger: 'ctv.ledger', board: 'ctv.board', rounds: 'ctv.rounds',
    easyLog: 'ctv.easyLog', queue: 'ctv.queue', active: 'ctv.active'
  };

  function read(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.error('save failed', e); }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const hashPin = CTV.hashPin;

  let db = null, version = 0, pending = 0, chain = Promise.resolve(), joinUrl = '', live = null;

  function adopt(s) {
    db = { settings: s.settings, ledger: s.ledger, board: s.board, rounds: s.rounds, easyLog: s.easyLog };
    version = s.v;
    joinUrl = s.joinUrl || '';
    live = s.live || null;
  }
  if (SERVER) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/state', false);
    xhr.send();
    if (xhr.status !== 200) { location.replace('/play'); throw new Error('host only'); }
    adopt(JSON.parse(xhr.responseText));
  }

  const data = c => (SERVER ? db[c] : read(KEY[c], c === 'settings' ? {} : []));

  let channel = null;
  try { channel = new BroadcastChannel('crack-the-vault'); } catch (e) { channel = null; }
  const listeners = [];
  const fire = () => listeners.forEach(fn => fn());
  function notify() {
    fire();
    if (channel) { try { channel.postMessage('update'); } catch (e) { /* other layers still fire */ } }
  }
  if (channel) channel.onmessage = fire;
  window.addEventListener('storage', e => { if (!e.key || e.key.startsWith('ctv.')) fire(); });

  async function post(op) {
    for (;;) {
      try {
        const r = await fetch('/api/op', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(op) });
        if (r.ok) return;
      } catch (e) { /* server briefly away: keep trying so no sale is lost */ }
      await new Promise(res => setTimeout(res, 2000));
    }
  }

  function commit(op) {
    if (SERVER) {
      CTV.applyOp(db, op);
      pending++;
      chain = chain.then(() => post(op)).then(() => { pending--; });
    } else {
      const copy = { [op.c]: data(op.c) };
      CTV.applyOp(copy, op);
      write(KEY[op.c], copy[op.c]);
    }
    notify();
  }

  let pollStarted = false, lastBoardRaw = null;
  async function pollServer() {
    if (pending) return;
    try {
      const r = await fetch('/api/state?v=' + version);
      if (r.status === 200 && !pending) { adopt(await r.json()); fire(); }
    } catch (e) { /* retry next tick */ }
  }
  function onChange(fn) {
    listeners.push(fn);
    if (pollStarted) return;
    pollStarted = true;
    if (SERVER) { setInterval(pollServer, 800); return; }
    lastBoardRaw = localStorage.getItem(KEY.board);
    setInterval(() => {
      const raw = localStorage.getItem(KEY.board);
      if (raw !== lastBoardRaw) { lastBoardRaw = raw; fire(); }
    }, 2000);
  }

  const Store = {
    uid, hashPin, onChange,
    isServer: () => SERVER,
    joinUrl: () => joinUrl,
    live: () => live,

    settings() { return Object.assign({}, CTV.DEFAULTS, data('settings')); },
    saveSettings(fields) { commit({ c: 'settings', a: 'merge', fields }); },
    checkPin(pin) { return (Store.settings().pinHash || hashPin('2580')) === hashPin(pin); },
    pinIsDefault() { const s = Store.settings(); return !s.pinHash || s.pinHash === hashPin('2580'); },

    ledger() { return data('ledger'); },
    addSale(type, attempts, amount, note) {
      const id = uid();
      commit({ c: 'ledger', a: 'add', item: { id, t: Date.now(), type, attempts, amount, note: note || '' } });
      return id;
    },
    getSale(id) { return Store.ledger().find(s => s.id === id) || null; },
    voidSale(id) {
      const sale = Store.getSale(id);
      if (!sale || sale.voided) return false;
      commit({ c: 'ledger', a: 'patch', id, fields: { voided: true } });
      commit({ c: 'ledger', a: 'add', item: { id: uid(), t: Date.now(), type: 'void', attempts: -sale.attempts, amount: -sale.amount, note: 'void of ' + sale.type } });
      return true;
    },

    rounds() { return data('rounds'); },
    logRound(entry) { commit({ c: 'rounds', a: 'add', item: Object.assign({ id: uid(), t: Date.now() }, entry) }); },

    stats() {
      const led = Store.ledger();
      return {
        attempts: led.reduce((n, s) => n + s.attempts, 0),
        hints: led.filter(s => s.type === 'hint').length,
        money: led.reduce((n, s) => n + s.amount, 0),
        cracked: Store.rounds().filter(r => r.result === 'cracked' && r.counted).length
      };
    },

    board(tier) {
      const t = tier || 'easy';
      return CTV.sortBoard(data('board').filter(e => (e.tier || 'easy') === t), t);
    },
    addWin(nick, ms, hints, tier, extra) {
      const entry = Object.assign({ id: uid(), t: Date.now(), nick, ms, hints, tier: tier || 'easy' }, extra);
      commit({ c: 'board', a: 'add', item: entry });
      return Store.board(entry.tier).findIndex(e => e.id === entry.id) + 1;
    },
    removeWin(id) { commit({ c: 'board', a: 'del', id }); },
    resetBoard() { commit({ c: 'board', a: 'clear' }); },
    resetSales() { commit({ c: 'ledger', a: 'clear' }); commit({ c: 'rounds', a: 'clear' }); commit({ c: 'easyLog', a: 'clear' }); },

    /* Booth Easy results, which decide who can buy Hard and at what price. */
    addEasy(nick, ms, cracked) {
      commit({ c: 'easyLog', a: 'add', item: { id: uid(), t: Date.now(), nick, ms, cracked } });
    },
    easyEntry(id) { return data('easyLog').find(e => e.id === id) || null; },
    isFast(e) { return !!e.cracked && e.ms <= Store.settings().thresholdSec * 1000; },
    hardPriceFor(e) { return CTV.hardPrice(Store.settings(), Store.isFast(e)); },
    recentEasy() { return data('easyLog').slice(-14).reverse(); },

    /* The booth's own attempt queue and live round belong to this one laptop. */
    queue() { return read(KEY.queue, []); },
    setQueue(q) { write(KEY.queue, q); },
    active() { return read(KEY.active, null); },
    setActive(a) { write(KEY.active, a); },

    toCSV() {
      const cell = c => {
        const s = String(c === undefined || c === null ? '' : c);
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const iso = t => new Date(t).toLocaleString('en-CA');
      const st = Store.stats();
      const top = tier => Store.board(tier).slice(0, 10).map((e, i) => [tier, i + 1, e.nick, e.score !== undefined ? `${e.score} pts (${e.correct}/10)` : CTV.boardStat(e), e.hints, iso(e.t)]);
      const rows = [
        ['SUMMARY'],
        ['Attempts sold', st.attempts], ['Hints sold', st.hints], ['Total money', st.money], ['Vaults cracked', st.cracked],
        [],
        ['SALES'], ['Time', 'Type', 'Attempts', 'Amount', 'Note'],
        ...Store.ledger().map(s => [iso(s.t), s.type, s.attempts, s.amount, s.note + (s.voided ? ' (voided)' : '')]),
        [],
        ['LEADERBOARD'], ['Tier', 'Rank', 'Nickname', 'Time', 'Hints used', 'When'],
        ...top('easy'), ...top('hard'), ...top('scam'),
        [],
        ['ALL ROUNDS'], ['Time', 'Nickname', 'Tier', 'Device', 'Result', 'Crack time', 'Hints', 'Wrong codes', 'Counted'],
        ...Store.rounds().map(r => [iso(r.t), r.nick, r.tier || 'easy', r.device || 'booth', r.result, r.ms ? CTV.fmtTime(r.ms) : '', r.hints, r.wrong, r.counted ? 'yes' : 'no'])
      ];
      return rows.map(r => r.map(cell).join(',')).join('\r\n');
    }
  };

  CTV.Store = Store;
})();
