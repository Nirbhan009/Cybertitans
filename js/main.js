/* Game flow: attract -> name -> brief -> play -> won/lost -> next attempt or attract. */
(function () {
  const C = window.CTV, S = C.Store, Audio = C.Audio;
  const $ = id => document.getElementById(id);
  const MASK = 0x5bd1e995;

  const matrix = C.FX.Matrix($('matrix'));
  const confetti = C.FX.Confetti($('confetti'));

  window.addEventListener('hashchange', () => location.reload());

  /* Mute works in both modes. */
  function paintMute() {
    const m = Audio.isMuted();
    $('mute').classList.toggle('muted', m);
    $('mute').setAttribute('aria-label', m ? 'Sound off, click to turn on' : 'Sound on, click to mute');
    $('mute').title = m ? 'Sound off' : 'Sound on';
  }
  $('mute').onclick = () => { Audio.toggleMute(); paintMute(); $('mute').blur(); };
  paintMute();

  if (location.hash === '#board') {
    document.body.classList.add('board-mode');
    $('screen-board').classList.add('on');
    matrix.on();
    C.Board.start($('board-list'), $('board-hard'), $('board-scam'));
    return;
  }

  let a = null, round = null, engine = null, view = null;
  let autoTimer = null, lastSec = null, seq = 0;

  function newSeed() {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return b[0];
  }

  function save() {
    if (a && engine) a.engine = engine.state();
    S.setActive(a);
  }

  function show(name) {
    document.querySelectorAll('.screen').forEach(el => el.classList.toggle('on', el.id === 'screen-' + name));
    if (name === 'game') matrix.off(); else matrix.on();
  }

  function refreshPrices() {
    const s = S.settings();
    $('price-line').textContent = `See staff to play: ${C.money(s.priceRound)} per attempt`;
    $('pack-line').textContent = `3 attempts for ${C.money(s.pricePack)}`;
  }

  function renderAttract() {
    C.renderBoard($('attract-hard'), 5, null, 'hard');
    C.renderBoard($('attract-board'), 5, null, 'easy');
    const url = S.isServer() ? S.joinUrl() : '';
    const box = $('join-box');
    box.hidden = !url;
    if (url && box.dataset.url !== url) {
      box.dataset.url = url;
      $('join-qr').innerHTML = C.qrSvg(url);
      $('join-url').textContent = url.replace(/^https?:\/\//, '');
    }
  }

  function goAttract() {
    a = null; round = null; engine = null;
    clearTimeout(autoTimer);
    confetti.stop();
    save();
    refreshPrices();
    renderAttract();
    show('attract');
  }

  function isIdle() { return !a; }

  function next() {
    if (view) { view.destroy(); view = null; }
    seq++;
    C.Vault.cancelAnim();
    const q = S.queue();
    if (!q.length) { goAttract(); return; }
    const credit = q.shift();
    S.setQueue(q);
    begin(credit);
  }

  function enqueue(items) {
    S.setQueue(S.queue().concat(items));
    if (isIdle()) { next(); return true; }
    return false;
  }

  function begin(c) {
    const s = S.settings();
    clearTimeout(autoTimer);
    confetti.stop();
    const hard = c.tier === 'hard';
    a = {
      phase: 'name', rid: S.uid(), k: (newSeed() ^ MASK) >>> 0, nick: c.nick || '',
      saleId: c.saleId || null, type: c.type, n: c.n, of: c.of, tier: hard ? 'hard' : 'easy',
      test: c.type === 'test', dq: false, hints: 0, wrong: 0,
      duration: (hard ? s.hardTimerSec : s.timerSec) * 1000,
      maxWrong: hard ? s.hardWrongTries : s.wrongTries, result: null, engine: null
    };
    round = null; engine = null;
    save();
    showName();
  }

  function showName() {
    $('name-input').value = a.nick;
    $('name-error').textContent = '';
    $('name-attempt').textContent = (a.tier === 'hard' ? 'HARD MODE: ' : '') +
      (a.test ? 'FREE TEST ROUND' : (a.of > 1 ? `ATTEMPT ${a.n} OF ${a.of}` : 'ONE ATTEMPT'));
    show('name');
    $('name-input').focus();
    $('name-input').select();
  }

  function submitName() {
    const v = C.Filter.validateName($('name-input').value);
    if (!v.ok) { $('name-error').textContent = v.msg; Audio.bad(); return; }
    a.nick = v.name;
    a.phase = 'brief';
    if (a.saleId) {
      S.setQueue(S.queue().map(c => (c.saleId === a.saleId ? Object.assign(c, { nick: a.nick }) : c)));
    }
    save();
    showBrief();
  }

  function showBrief() {
    $('brief-tier').textContent = a.tier === 'hard' ? 'HARD MODE BRIEFING' : 'MISSION BRIEFING';
    $('brief-name').textContent = a.nick;
    $('brief-time').textContent = fmtClock(a.duration);
    $('brief-tries').textContent = a.maxWrong;
    show('brief');
    $('name-input').blur();
  }

  function fmtClock(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  function paintDigit(i, value, animate) {
    const box = $('digits').children[i];
    box.textContent = value === null ? '?' : value;
    box.classList.toggle('got', value !== null);
    if (animate) { box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); }
  }

  function setupRound() {
    round = C.Puzzles.generateRound((a.k ^ MASK) >>> 0, undefined, a.tier);
    engine = new C.Engine(round, {
      onSolve(slot, digit) { paintDigit(slot, digit, true); Audio.solve(); save(); },
      onWrong() { Audio.jam(); }
    });
    if (a.engine) engine.restore(a.engine);
    if (view) view.destroy();
    view = new C.ConsoleView({
      tabs: $('lock-tabs'), stage: $('puzzle-stage'), feed: $('feed'),
      jam: $('jam'), jamTime: $('jam-time'), hintBtn: $('hint-btn')
    }, engine, {
      onChange: save,
      onClick: () => Audio.click(),
      onAllSolved: () => C.Vault.ready(),
      hintPrice: () => C.money(S.settings().priceHint)
    });
    for (let i = 0; i < 4; i++) paintDigit(i, engine.solved[i] ? round.puzzles[i].digit : null);
    $('agent-name').textContent = a.nick + (a.tier === 'hard' ? ' [HARD]' : '') + (a.test ? ' (TEST)' : '');
    $('clock').classList.remove('warn', 'crit', 'stopped');
    $('result').hidden = true;
    $('con-panel').classList.remove('hidden-by-result');
    C.Vault.reset(a.maxWrong, Math.max(0, a.maxWrong - a.wrong));
    if (engine.firstUnsolved() < 0) C.Vault.ready();
    show('game');
  }

  function startPlay() {
    a.phase = 'play';
    a.startedAt = Date.now();
    a.endsAt = a.startedAt + a.duration;
    a.engine = null;
    setupRound();
    view.log([
      { t: 'CONNECTING TO VAULT-NET...', c: 'dim' },
      { t: `ACCESS GRANTED. WELCOME, AGENT ${a.nick.toUpperCase()}.`, c: 'cyan' },
      { t: 'Crack each lock to find a digit of the code.' }
    ]);
    Audio.start();
    lastSec = null;
    tick();
    save();
  }

  function tick() {
    if (!a || a.phase !== 'play') return;
    const left = a.endsAt - Date.now();
    const clock = $('clock');
    clock.textContent = fmtClock(left);
    clock.classList.toggle('warn', left <= 60000 && left > 30000);
    clock.classList.toggle('crit', left <= 30000);
    if (view) view.tick();
    const sec = Math.ceil(left / 1000);
    if (sec !== lastSec) {
      lastSec = sec;
      if (sec <= 10 && sec > 0) Audio.tick(sec <= 5);
    }
    if (left <= 0) lose('time');
  }
  setInterval(tick, 100);

  function logRound(result, ms) {
    S.logRound({
      nick: a.nick, result, ms: ms || 0, hints: a.hints, wrong: a.wrong, tier: a.tier, device: 'booth',
      counted: !a.test && !a.dq
    });
    if (a.tier === 'easy' && !a.test && !a.dq && ['cracked', 'locked out', 'time up'].includes(result)) {
      S.addEasy(a.nick, ms || 0, result === 'cracked');
    }
  }

  function paintOffer(won) {
    const box = $('result-offer');
    box.hidden = a.tier !== 'easy' || a.test || a.dq;
    if (box.hidden) return;
    const s = S.settings();
    const fast = won && a.result.ms <= s.thresholdSec * 1000;
    const price = C.money(C.hardPrice(s, fast));
    box.textContent = fast
      ? `Under ${fmtClock(s.thresholdSec * 1000)}! Hard Mode is only ${price}. See staff.`
      : `Hard Mode unlocked for ${price}. See staff.`;
  }

  function onEnter(code) {
    if (!a || a.phase !== 'play') return;
    if (code.length < 4) { C.Vault.needDigits(); return; }
    if (code === round.code) { win(code); return; }
    a.wrong++;
    save();
    const left = a.maxWrong - a.wrong;
    const rid = a.rid;
    if (left <= 0) {
      a.phase = 'lost';
      a.result = { reason: 'tries' };
      recordLoss();
      logRound('locked out');
      save();
      C.Vault.deny(0, () => { if (a && a.rid === rid) finishLoss(); });
    } else {
      C.Vault.deny(left);
    }
  }

  function win(code) {
    const ms = Date.now() - a.startedAt;
    a.phase = 'won';
    a.result = { ms, rank: 0 };
    if (!a.test && !a.dq) a.result.rank = S.addWin(a.nick, ms, a.hints, a.tier);
    logRound('cracked', ms);
    save();
    $('clock').classList.remove('warn', 'crit');
    $('clock').classList.add('stopped');
    $('jam').hidden = true;
    const mine = ++seq;
    C.Vault.open(code, () => { if (mine === seq) showWin(true); });
  }

  /* Players who don't crack it still go on the board, below everyone who did. */
  function recordLoss() {
    if (a.test || a.dq) return;
    const used = Math.min(Date.now(), a.endsAt) - a.startedAt;
    a.result.rank = S.addWin(a.nick, used, a.hints, a.tier, { cracked: false, found: engine ? engine.count() : 0 });
  }

  function lose(reason) {
    a.phase = 'lost';
    a.result = { reason };
    recordLoss();
    $('clock').textContent = '0:00';
    logRound('time up');
    save();
    finishLoss();
  }

  function finishLoss() {
    if (view) view.flush();
    $('jam').hidden = true;
    C.Vault.lockdown(round.code);
    Audio.lose();
    showLoss();
  }

  function nextLabel() {
    const q = S.queue();
    return q.length ? `Next attempt ready (${q.length} left). Press ENTER to continue.` : '';
  }

  function openResult(cls) {
    $('result').hidden = false;
    $('result').className = 'panel result ' + cls;
    $('con-panel').classList.add('hidden-by-result');
    $('result-next').textContent = nextLabel();
    C.paintRecruit($('result-recruit'), S.settings().signupUrl);
    a.ready = false;
    const rid = a.rid;
    setTimeout(() => { if (a && a.rid === rid) a.ready = true; }, 1500);
  }

  function showWin(celebrate) {
    openResult('win');
    $('result-title').textContent = 'VAULT CRACKED';
    $('result-title').setAttribute('data-text', 'VAULT CRACKED');
    $('result-big').textContent = C.fmtTime(a.result.ms);
    let rankText;
    if (a.test || a.dq) rankText = 'Test round, not on the leaderboard.';
    else if (a.result.rank <= 10) rankText = `#${a.result.rank} on the leaderboard!`;
    else rankText = `Fastest cracks rank: #${a.result.rank}`;
    $('result-sub').textContent = `${a.nick}, ${rankText}`;
    $('result-prize').textContent = 'Claim your prize from staff!';
    $('result-prize').hidden = false;
    paintOffer(true);
    if (celebrate) { confetti.start(6000); Audio.win(); }
  }

  function showLoss() {
    openResult('lose');
    const byTime = a.result.reason === 'time';
    $('result-title').textContent = byTime ? 'TIME EXPIRED' : 'VAULT LOCKED DOWN';
    $('result-title').setAttribute('data-text', $('result-title').textContent);
    $('result-big').textContent = round.code;
    $('result-sub').textContent = `The code was ${round.code}. You recovered ${engine.count()} of 4 digits.` +
      (a.result.rank ? ` You're #${a.result.rank} on the ${a.tier === 'hard' ? 'Hard' : 'Easy'} board.` : '');
    $('result-prize').hidden = true;
    paintOffer(false);
    clearTimeout(autoTimer);
    if (!S.queue().length) autoTimer = setTimeout(() => { if (a && a.phase === 'lost') next(); }, 20000);
  }

  function resume() {
    a = S.active();
    if (!a) { next(); return; }
    if (a.phase === 'name') { showName(); return; }
    if (a.phase === 'brief') { showBrief(); return; }
    setupRound();
    if (a.phase === 'play') {
      if (Date.now() >= a.endsAt) { lose('time'); return; }
      view.log([{ t: '[connection restored, the clock kept running]', c: 'warn' }]);
      tick();
      return;
    }
    if (a.phase === 'won') {
      C.Vault.showOpen();
      $('clock').textContent = fmtClock(a.endsAt - a.startedAt - a.result.ms);
      $('clock').classList.add('stopped');
      showWin(false);
      return;
    }
    if (a.phase === 'lost') {
      C.Vault.lockdown(round.code);
      $('clock').textContent = '0:00';
      showLoss();
    }
  }

  /* Staff API */
  C.Game = {
    refreshPrices,
    sellRound() {
      const s = S.settings();
      const id = S.addSale('round', 1, s.priceRound, 'single attempt');
      return enqueue([{ saleId: id, type: 'round', n: 1, of: 1 }]);
    },
    sellPack() {
      const s = S.settings();
      const id = S.addSale('pack', 3, s.pricePack, '3-pack');
      return enqueue([1, 2, 3].map(n => ({ saleId: id, type: 'pack', n, of: 3 })));
    },
    sellHard(entryId) {
      const e = S.easyEntry(entryId);
      if (!e) return false;
      const id = S.addSale('hard', 1, S.hardPriceFor(e), e.nick);
      return enqueue([{ saleId: id, type: 'hard', tier: 'hard', n: 1, of: 1, nick: e.nick }]);
    },
    startTest(tier) { return enqueue([{ type: 'test', tier, n: 1, of: 1 }]); },
    unlockHint() {
      if (!a || a.phase !== 'play' || engine.firstUnsolved() < 0) return false;
      const h = engine.giveHint(engine.current);
      if (!h) return false;
      if (!a.test) S.addSale('hint', 0, S.settings().priceHint, a.nick);
      a.hints++;
      view.hintUnlocked(h);
      Audio.hint();
      save();
      return true;
    },
    reset(mode) {
      if (!a) return;
      const old = a;
      logRound(mode === 'void' ? 'voided' : mode === 'replay' ? 'free replay' : 'ended by staff');
      if (mode === 'void' && old.saleId) {
        S.voidSale(old.saleId);
        S.setQueue(S.queue().filter(c => c.saleId !== old.saleId));
      }
      if (mode === 'replay') {
        S.setQueue([{ saleId: old.saleId, type: old.type, tier: old.tier, n: old.n, of: old.of, nick: old.nick }].concat(S.queue()));
      }
      a = null;
      S.setActive(null);
      document.body.classList.remove('shake');
      next();
    },
    continueOn() { if (a && (a.phase === 'won' || a.phase === 'lost')) next(); },
    reveal() {
      if (!a) return null;
      if (!round) round = C.Puzzles.generateRound((a.k ^ MASK) >>> 0, undefined, a.tier);
      a.dq = true;
      save();
      return round.code;
    },
    status() {
      const q = S.queue().length;
      if (!a) return { queued: q };
      return {
        phase: a.phase, nick: a.nick, wrong: a.wrong, maxWrong: a.maxWrong, hints: a.hints,
        test: a.test, dq: a.dq, saleId: a.saleId, queued: q, hasCode: a.phase === 'name' || a.phase === 'brief' || a.phase === 'play',
        solved: engine ? engine.count() : 0,
        canHint: a.phase === 'play' && !!engine && engine.firstUnsolved() >= 0,
        leftText: a.phase === 'play' ? fmtClock(a.endsAt - Date.now()) : ''
      };
    }
  };

  /* Input routing. The only keyboard use in a round is the vault keypad. */
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyA') {
      e.preventDefault(); e.stopPropagation();
      C.Admin.toggle();
      return;
    }
    if (C.Admin.isOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); C.Admin.close(); }
      return;
    }
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (e.ctrlKey && k === 'u')) {
      e.preventDefault();
      return;
    }
    if (!a) return;
    if (a.phase === 'name') return;
    if (a.phase === 'brief') {
      if (e.key === 'Enter') { e.preventDefault(); startPlay(); }
      return;
    }
    if (a.phase === 'won' || a.phase === 'lost') {
      if (e.key === 'Enter' && a.ready && S.queue().length) { e.preventDefault(); next(); }
      return;
    }
    if (a.phase === 'play' && C.Vault.handleKey(e)) e.preventDefault();
  }, true);

  document.addEventListener('contextmenu', e => e.preventDefault());

  /* Backup way in if Ctrl+Shift+A is ever taken over by the browser: triple-click the brand tag. */
  document.addEventListener('click', e => {
    if (e.detail === 3 && e.target.closest('.brand')) C.Admin.toggle();
  });

  $('name-form').addEventListener('submit', e => { e.preventDefault(); submitName(); });
  $('name-input').addEventListener('input', e => {
    const clean = e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
    if (clean !== e.target.value) e.target.value = clean;
    $('name-error').textContent = '';
  });
  $('brief-go').onclick = startPlay;
  $('result-continue').onclick = () => { if (C.Admin.isOpen()) return; next(); };

  S.onChange(() => { if (!a) renderAttract(); });

  C.Vault.mount($('vault-panel').querySelector('.vault-body'), { onEnter });
  C.Admin.init();
  refreshPrices();
  renderAttract();
  resume();
})();
