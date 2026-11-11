/* Shared by the browser and the server: default settings, PIN hashing, and the
   small set of data changes both of them apply in exactly the same way. */
(function (root) {
  const CTV = root.CTV = root.CTV || {};

  CTV.DEFAULTS = {
    timerSec: 240, priceRound: 2, pricePack: 5, priceHint: 1, wrongTries: 3, pinHash: null,
    hardTimerSec: 150, hardWrongTries: 2, hardPriceFast: 2, hardPriceFull: 4, thresholdSec: 120,
    scamPrice: 2, scamTimerSec: 90, signupUrl: ''
  };
  CTV.COLLECTIONS = ['ledger', 'board', 'rounds', 'easyLog'];
  CTV.emptyDb = () => ({ settings: {}, ledger: [], board: [], rounds: [], easyLog: [] });

  CTV.hashPin = function (pin) {
    const s = 'crack-the-vault:' + pin;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  };

  CTV.applyOp = function (db, op) {
    if (op.c === 'settings' && op.a === 'merge') { Object.assign(db.settings, op.fields); return; }
    if (!CTV.COLLECTIONS.includes(op.c)) return;
    if (op.a === 'add') db[op.c].push(op.item);
    else if (op.a === 'patch') { const it = db[op.c].find(x => x.id === op.id); if (it) Object.assign(it, op.fields); }
    else if (op.a === 'del') db[op.c] = db[op.c].filter(x => x.id !== op.id);
    else if (op.a === 'clear') db[op.c] = [];
  };

  /* One ranking for every screen and the server. Vault boards: everyone who cracked it,
     fastest first, then everyone who didn't, by locks broken and then by time.
     Scam Spotter: highest score first. */
  CTV.sortBoard = function (list, tier) {
    if (tier === 'scam') return list.sort((a, b) => b.score - a.score || a.ms - b.ms || a.t - b.t);
    const done = e => (e.cracked === false ? 0 : 1);
    return list.sort((a, b) => done(b) - done(a) ||
      (done(a) ? a.ms - b.ms : (b.found || 0) - (a.found || 0) || a.ms - b.ms) || a.t - b.t);
  };
  CTV.boardStat = function (e) {
    if (e.score !== undefined) return `${e.score} pts`;
    if (e.cracked === false) return `${e.found || 0}/4 locks`;
    return CTV.fmtTime ? CTV.fmtTime(e.ms) : String(e.ms);
  };

  CTV.hardPrice = function (settings, fast) {
    const s = Object.assign({}, CTV.DEFAULTS, settings);
    return fast ? s.hardPriceFast : s.hardPriceFull;
  };
})(typeof window !== 'undefined' ? window : globalThis);
