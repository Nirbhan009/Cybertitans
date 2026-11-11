/* The phone player: vault rounds, Scam Spotter, duels and the free demo.
   All judging happens on the server; this only draws what it is sent. */
(function () {
  const C = window.CTV, Audio = C.Audio;
  const $ = id => document.getElementById(id);
  const confetti = C.FX.Confetti($('confetti'));
  const params = new URLSearchParams(location.search);
  const STATION = params.has('station');
  const INVITE = (params.get('duel') || '').toUpperCase();

  let token = null;
  try { token = localStorage.getItem('ctv.phoneToken'); } catch (e) { /* this page load only */ }

  let st = null, offset = 0, eng = null, view = null, rid = null, hintSeen = 0, animating = false, celebrated = null, lastSec = null;
  let demo = null, scam = null, countdownShown = -1;

  const now = () => Date.now() + offset;
  const fmtClock = ms => {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  const priceText = n => (n === 0 ? 'free' : C.money(n));

  function setToken(t) {
    token = t;
    try { if (t) localStorage.setItem('ctv.phoneToken', t); else localStorage.removeItem('ctv.phoneToken'); } catch (e) { /* ignore */ }
  }

  async function api(route, body, query) {
    const r = await fetch('/api/phone/' + route + (query || ''), {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-phone': token || '' },
      body: body ? JSON.stringify(body) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'failed'), { status: r.status, data: j });
    return j;
  }

  function show(name) {
    document.querySelectorAll('.screen').forEach(el => el.classList.toggle('on', el.id === 'p-' + name));
  }
  function setView(name) {
    $('p-views').dataset.view = name;
    document.querySelectorAll('.p-nav button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  }
  function paintDigit(i, value, animate) {
    const box = $('digits').children[i];
    box.textContent = value === null || value === undefined ? '?' : value;
    box.classList.toggle('got', value !== null && value !== undefined);
    if (animate) { box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); }
  }
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  };

  /* ---------------- Vault rounds ---------------- */

  /* Looks like the local Engine to the console, but asks the server. */
  class RemoteEngine extends C.Engine {
    constructor(s) {
      super({ puzzles: s.puzzles }, { now });
      this.solved = s.solved.slice();
      this.jamUntil = s.jamUntil; this.wrongs = s.wrongs;
      this.hintLog = s.hintLog.slice();
      this.current = s.current || 0;
    }
    async attempt(slot, value) {
      const r = await api('attempt', { slot, value });
      if (r.status === 'solved') {
        const p = this.round.puzzles[slot];
        p.digit = r.digit; p.explain = r.explain;
        this.solved[slot] = true;
        paintDigit(slot, r.digit, true);
        Audio.solve();
      }
      if (r.status === 'wrong') { this.jamUntil = r.jamUntil; this.wrongs = r.wrongs; Audio.jam(); }
      return r;
    }
  }

  function makeView(engine, opts) {
    if (view) view.destroy();
    view = new C.ConsoleView({
      tabs: $('lock-tabs'), stage: $('puzzle-stage'), feed: $('feed'),
      jam: $('jam'), jamTime: $('jam-time'), hintBtn: $('hint-btn')
    }, engine, Object.assign({ onClick: () => Audio.click() }, opts));
    return view;
  }

  function setupRound(s) {
    rid = s.rid;
    hintSeen = s.hintLog.length;
    eng = new RemoteEngine(s);
    let lastCurrent = eng.current;
    makeView(eng, {
      onChange() {
        if (eng.current !== lastCurrent) { lastCurrent = eng.current; api('select', { slot: eng.current }).catch(() => {}); }
      },
      onAllSolved() { C.Vault.ready(); setTimeout(() => setView('vault'), 900); },
      hintPrice: () => C.money(s.hintPrice)
    });
    s.puzzles.forEach((p, i) => paintDigit(i, s.solved[i] ? p.digit : null));
    $('tier-tag').textContent = s.duel ? 'DUEL' : s.tier === 'hard' ? 'HARD MODE' : 'EASY MODE';
    $('hint-btn').hidden = !!s.duel;
    $('vs-tag').hidden = !s.duel;
    if (s.duel) $('vs-tag').textContent = 'vs ' + s.duel.opponent;
    $('clock').classList.remove('warn', 'crit', 'stopped');
    $('clock').textContent = fmtClock(Math.min(s.duration, s.endsAt - now()));
    C.Vault.reset(s.maxWrong, Math.max(0, s.maxWrong - s.wrong));
    if (eng.firstUnsolved() < 0) C.Vault.ready();
    setView('hack');
    view.log([{ t: s.duel ? `DUEL vs ${s.duel.opponent.toUpperCase()}. First to the vault wins.` : `WELCOME, AGENT ${s.nick.toUpperCase()}. Crack each lock.`, c: 'cyan' }]);
    lastSec = null;
    countdownShown = -1;
  }

  /* ---------------- Scam Spotter ---------------- */

  function markText(text, flags, good) {
    const frag = document.createDocumentFragment();
    const ranges = [];
    (flags || []).forEach(f => {
      const at = text.indexOf(f);
      if (at >= 0) ranges.push([at, at + f.length]);
    });
    ranges.sort((a, b) => a[0] - b[0]);
    let pos = 0;
    ranges.forEach(([a, b]) => {
      if (a < pos) return;
      frag.appendChild(document.createTextNode(text.slice(pos, a)));
      frag.appendChild(el('mark', good ? 'good' : 'bad', text.slice(a, b)));
      pos = b;
    });
    frag.appendChild(document.createTextNode(text.slice(pos)));
    return frag;
  }

  function messageCard(item, answer) {
    const card = el('div', 'msg ' + item.kind);
    const head = el('div', 'msg-head');
    const kindLabel = { sms: 'TEXT MESSAGE', email: 'EMAIL', call: 'PHONE CALL', popup: 'POP-UP' }[item.kind];
    const from = el('b', 'msg-from');
    from.appendChild(answer ? markText(item.from, answer.flags, !answer.scam) : document.createTextNode(item.from));
    head.append(el('span', 'msg-kind', kindLabel), from);
    card.appendChild(head);
    if (item.subject) card.appendChild(el('div', 'msg-subj', item.subject));
    const body = el('div', 'msg-body');
    if (item.kind === 'call') body.appendChild(el('span', 'msg-quote', '“'));
    body.appendChild(answer ? markText(item.text, answer.flags, !answer.scam) : document.createTextNode(item.text));
    card.appendChild(body);
    if (item.kind === 'popup') card.appendChild(el('div', 'msg-popbar', 'OK'));
    return card;
  }

  function drawScam() {
    const v = scam.v.scam;
    const i = scam.index;
    const answer = scam.revealing ? v.answers[i] : null;
    const stage = $('s-stage');
    stage.textContent = '';
    if (i < v.items.length) stage.appendChild(messageCard(v.items[i], answer));
    $('s-prog').textContent = `${Math.min(i + 1, v.items.length)} / ${v.items.length}`;
    $('s-score').textContent = `${v.score} pts`;
    $('s-buttons').hidden = !!answer;
    $('s-next').hidden = !answer;
    const verdict = $('s-verdict');
    verdict.hidden = !answer;
    if (answer) {
      verdict.className = 's-verdict ' + (answer.correct ? 'right' : 'wrong');
      verdict.textContent = '';
      verdict.append(
        el('b', '', `${answer.correct ? 'CORRECT' : 'NOPE'}: it was ${answer.scam ? 'a SCAM' : 'LEGIT'}${answer.correct ? `  +${answer.points}` : ''}`),
        el('span', '', answer.why)
      );
    }
  }

  function startScam(v) {
    scam = { v, rid: v.rid, index: v.scam.answers.length, revealing: false, busy: false, timer: null };
    show('scam');
    drawScam();
  }

  async function answerScam(verdict) {
    if (!scam || scam.busy || scam.revealing) return;
    scam.busy = true;
    try {
      const r = await api('scam', { i: scam.index, verdict });
      scam.v = r.view;
      scam.revealing = true;
      Audio[r.answer.correct ? 'solve' : 'bad']();
      drawScam();
      clearTimeout(scam.timer);
      scam.timer = setTimeout(nextScam, 2500);
    } catch (e) {
      if (e.data && e.data.view) { scam = null; apply(e.data.view); }
    }
    if (scam) scam.busy = false;
  }

  function nextScam() {
    if (!scam || !scam.revealing) return;
    clearTimeout(scam.timer);
    scam.revealing = false;
    scam.index++;
    if (scam.v.status === 'done') { const v = scam.v; scam = null; apply(v); return; }
    drawScam();
  }

  /* ---------------- Free demo ---------------- */

  function startDemo() {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const p = C.Puzzles.generateRound(seed).puzzles[0];
    const engine = new C.Engine({ code: '', puzzles: [p] });
    demo = { engine, endsAt: Date.now() + 30000, startedAt: Date.now() };
    document.body.classList.add('demo');
    makeView(engine, { onAllSolved: () => setTimeout(() => endDemo(true), 1400) });
    $('tier-tag').textContent = 'FREE DEMO';
    $('vs-tag').hidden = true;
    $('clock').classList.remove('warn', 'crit', 'stopped');
    setView('hack');
    view.log([{ t: 'FREE DEMO: crack this one lock in 30 seconds.', c: 'cyan' }]);
    show('game');
  }

  function endDemo(won) {
    if (!demo) return;
    const ms = Date.now() - demo.startedAt;
    demo = null;
    if (view) { view.destroy(); view = null; }
    document.body.classList.remove('demo');
    $('demo-title').textContent = won ? `Cracked in ${fmtClock(ms)}!` : 'Out of time!';
    $('demo-sub').textContent = won
      ? 'That was one lock. The real game has four, a vault, and a prize.'
      : 'Tricky, right? The real game has hints, four locks and a prize.';
    if (won) Audio.win();
    show('demodone');
  }

  /* ---------------- Screens ---------------- */

  function renderDuelOpen(v) {
    const link = `${location.origin}/play?duel=${v.duel.room}`;
    const box = $('duel-qr');
    if (box.dataset.link !== link) { box.dataset.link = link; box.innerHTML = C.qrSvg(link); }
    $('duel-room').textContent = v.duel.room;
    show('duelopen');
  }

  function renderWait(v) {
    const tierName = v.duel ? 'DUEL' : v.tier === 'hard' ? 'HARD MODE' : v.tier === 'scam' ? 'SCAM SPOTTER' : 'EASY MODE';
    $('wait-tier').textContent = tierName;
    $('wait-duel').hidden = !v.duel;
    if (v.duel) $('wait-duel').textContent = `${v.nick} vs ${v.duel.opponent}`;
    $('wait-code').textContent = v.code;
    $('wait-price').textContent = v.duel ? `${C.money(v.price)} for both players`
      : v.tier === 'easy' ? `${C.money(v.offer.easyPrice)}, or 3 tries for ${C.money(v.offer.packPrice)}` : C.money(v.price);
    show('wait');
  }

  function renderBrief(v) {
    const list = $('brief-list');
    list.textContent = '';
    let items, stakes, button;
    if (v.tier === 'scam') {
      items = ['You will see 10 real-looking texts, emails, calls and pop-ups.', 'Tap SCAM or LEGIT for each one.', 'Faster right answers score more points.'];
      stakes = `${fmtClock(v.duration)} on the clock.`;
      button = 'START SPOTTING';
    } else if (v.duel) {
      items = [`You and ${v.duel.opponent} get the exact same locks and code.`, 'Crack 4 locks, then open the vault.', 'First to open it wins. It is live on the big screen!'];
      stakes = `${fmtClock(v.duration)} on the clock, ${v.maxWrong} tries at the code.`;
      button = "I'M READY";
    } else {
      items = ['Crack 4 locks to get the 4 digits.', 'A wrong answer locks the console, longer each time.', 'Tap VAULT at the bottom to enter the code.'];
      stakes = `${fmtClock(v.duration)} on the clock, ${v.maxWrong} tries at the code.`;
      button = 'START THE HACK';
    }
    items.forEach(t => list.appendChild(el('li', '', t)));
    $('brief-tier').textContent = v.tier === 'scam' ? 'SCAM SPOTTER' : v.duel ? 'DUEL' : v.tier === 'hard' ? 'HARD MODE' : 'PAYMENT CONFIRMED';
    $('brief-name').textContent = v.nick;
    $('brief-stakes').textContent = stakes;
    const waiting = v.duel && v.duel.iAmReady;
    $('brief-go').hidden = waiting;
    $('brief-go').textContent = button;
    $('brief-wait').hidden = !waiting;
    if (waiting) $('brief-wait').textContent = `Waiting for ${v.duel.opponent} to tap ready...`;
    show('brief');
  }

  function action(label, cls, fn) {
    const b = el('button', cls, label);
    b.type = 'button';
    b.onclick = () => { b.disabled = true; fn().catch(() => {}).finally(() => { b.disabled = false; }); };
    return b;
  }

  function badgeFor(r) {
    if (r.correct >= 9) return 'SCAM PROOF';
    if (r.correct >= 7) return 'SHARP EYE';
    return 'KEEP PRACTISING';
  }

  function renderResult(v) {
    const r = v.result;
    const card = document.querySelector('.result-card');
    const isScam = r.kind === 'scam';
    const cancelled = r.reason === 'cancelled';
    const duel = r.duel;
    card.classList.toggle('win', !!r.won || (isScam && r.correct >= 7));
    card.classList.toggle('lose', !isScam && !r.won && !cancelled);
    $('res-badge').hidden = !isScam;
    if (isScam) {
      $('res-badge').textContent = badgeFor(r);
      $('res-title').textContent = `${r.correct} / ${r.total} SPOTTED`;
      $('res-big').textContent = `${r.score} pts`;
      $('res-sub').textContent = `#${r.rank} on the Scam Spotter board`;
    } else if (cancelled) {
      $('res-title').textContent = 'WHAT NEXT?';
      $('res-big').textContent = '';
      $('res-sub').textContent = '';
    } else if (duel && r.won) {
      $('res-title').textContent = 'YOU WON THE DUEL';
      $('res-big').textContent = C.fmtTime(r.ms);
      $('res-sub').textContent = `You beat ${duel.opponent}. #${r.rank} on the Easy board!`;
    } else if (duel && r.reason === 'beaten') {
      $('res-title').textContent = 'BEATEN!';
      $('res-big').textContent = duel.winner || '';
      $('res-sub').textContent = `${duel.winner} opened the vault first (${C.fmtTime(duel.winMs)}). You had ${r.found} of 4 digits, #${r.rank} on the Easy board.`;
    } else {
      $('res-title').textContent = r.won ? 'VAULT CRACKED' : r.reason === 'time' ? 'TIME EXPIRED' : 'LOCKED DOWN';
      $('res-big').textContent = r.won ? C.fmtTime(r.ms) : r.code;
      $('res-sub').textContent = r.won
        ? (r.rank <= 10 ? `#${r.rank} on the ${r.tier === 'hard' ? 'Hard' : 'Easy'} leaderboard!` : `Rank #${r.rank}`)
        : `The code was ${r.code}. You found ${r.found} of 4 digits.${r.rank ? ` #${r.rank} on the ${r.tier === 'hard' ? 'Hard' : 'Easy'} board.` : ''}`;
    }
    $('res-big').hidden = !$('res-big').textContent;

    const prize = $('res-prize');
    prize.hidden = !v.prize;
    prize.classList.toggle('claimed', v.prize === 'given');
    prize.textContent = v.prize === 'given' ? 'Prize claimed' : 'Claim your prize from staff!';

    $('res-card').hidden = !(r.won || isScam);

    const review = $('res-review');
    review.hidden = !isScam || !v.scam;
    if (isScam && v.scam && review.dataset.rid !== v.rid) {
      review.dataset.rid = v.rid;
      review.textContent = '';
      review.appendChild(el('h3', '', 'What gave them away'));
      v.scam.items.forEach((item, i) => {
        const a = v.scam.answers[i];
        const row = el('div', 'rv ' + (a ? (a.correct ? 'ok' : 'no') : 'skip'));
        row.append(el('b', '', `${a ? (a.correct ? '✓' : '✗') : '-'} ${item.from}`), el('span', '', a ? `${a.scam ? 'SCAM' : 'LEGIT'}: ${a.why}` : 'Not answered in time.'));
        review.appendChild(row);
      });
    }

    const box = $('res-actions');
    const key = JSON.stringify([v.credits, v.offer, r.tier, r.kind, v.rid, v.status]);
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      box.textContent = '';
      const go = body => api('request', body).then(apply);
      if (v.credits > 0) box.appendChild(action(`NEXT ATTEMPT (${v.credits} LEFT)`, 'go', () => api('next', {}).then(apply)));
      if (isScam) {
        box.appendChild(action(`PLAY CRACK THE VAULT (${priceText(v.offer.easyPrice)})`, 'go', () => go({ tier: 'easy' })));
        box.appendChild(action(`SCAM SPOTTER AGAIN (${priceText(v.offer.scamPrice)})`, 'ghost', () => go({ tier: 'scam' })));
      } else {
        if (v.offer.available) {
          if (r.tier === 'easy' && !cancelled && !duel) {
            box.appendChild(el('p', 'offer-note', v.offer.fast
              ? `You beat ${fmtClock(v.offer.thresholdSec * 1000)}, so Hard Mode is only ${C.money(v.offer.price)}!`
              : `Hard Mode is unlocked for ${C.money(v.offer.price)}.`));
          }
          box.appendChild(action(`PLAY HARD MODE (${C.money(v.offer.price)})`, 'go hard', () => go({ tier: 'hard' })));
        }
        box.appendChild(action(duel ? 'REMATCH: NEW DUEL' : `DUEL SOMEONE (${C.money(v.offer.easyPrice)} EACH)`, 'ghost duel-btn', () => go({ tier: 'duel' })));
        box.appendChild(action(`PLAY EASY AGAIN (${C.money(v.offer.easyPrice)})`, 'ghost', () => go({ tier: 'easy' })));
        box.appendChild(action(`TRY SCAM SPOTTER (${priceText(v.offer.scamPrice)})`, 'ghost', () => go({ tier: 'scam' })));
      }
    }
    const tier = isScam ? 'scam' : r.tier || 'easy';
    C.drawRows($('res-board'), (v.board && v.board[tier]) || [], 5);
    C.paintRecruit($('res-recruit'), v.signupUrl);
    $('res-station').hidden = !STATION;
    show('result');
    const celebrateKey = v.rid + ':' + (r.ms || 0);
    if ((r.won || (isScam && r.correct >= 7)) && celebrated !== celebrateKey) {
      celebrated = celebrateKey;
      confetti.start(5000);
    }
  }

  function cardInfo(v) {
    const r = v.result;
    const date = new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
    if (r.kind === 'scam') {
      return { mode: 'SCAM SPOTTER', name: v.nick, statLabel: `${r.correct} OF ${r.total} SCAMS SPOTTED`, stat: `${r.score} PTS`, line: `${badgeFor(r)}  /  #${r.rank} on the board`, date, accent: '#ffb020' };
    }
    if (r.duel) {
      return { mode: 'DUEL CHAMPION', name: v.nick, statLabel: `BEAT ${r.duel.opponent.toUpperCase()} TO THE VAULT`, stat: C.fmtTime(r.ms), line: `#${r.rank} on the Easy board`, date, accent: '#39ff7a' };
    }
    return {
      mode: r.tier === 'hard' ? 'HARD MODE CRACKED' : 'VAULT CRACKED', name: v.nick, statLabel: 'CRACK TIME', stat: C.fmtTime(r.ms),
      line: `#${r.rank} on the ${r.tier === 'hard' ? 'Hard' : 'Easy'} board`, date, accent: r.tier === 'hard' ? '#ff2d4a' : '#19e6ff'
    };
  }

  async function openCard() {
    if (!st || !st.result) return;
    const url = C.hackerCard(cardInfo(st));
    $('card-img').src = url;
    $('card-overlay').hidden = false;
    let file = null;
    try {
      const blob = await (await fetch(url)).blob();
      file = new File([blob], 'hacker-card.png', { type: 'image/png' });
    } catch (e) { file = null; }
    const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
    $('card-share').hidden = !canShare;
    $('card-share').onclick = () => navigator.share({ files: [file], title: 'My Hacker Card' }).catch(() => {});
  }

  /* ---------------- State ---------------- */

  function apply(v) {
    if (!v || !v.status) return;
    st = v;
    offset = v.now - Date.now();
    if (animating || demo) return;
    if (scam && (v.status !== 'play' || v.rid !== scam.rid)) {
      if (scam.revealing) { scam.v = v; return; }
      scam = null;
    }
    if (v.status === 'duel-open') renderDuelOpen(v);
    else if (v.status === 'waiting') renderWait(v);
    else if (v.status === 'ready') renderBrief(v);
    else if (v.status === 'done') {
      if (view) { view.destroy(); view = null; }
      rid = null;
      $('countdown').hidden = true;
      renderResult(v);
    } else if (v.status === 'play' && v.scam) {
      if (!scam) startScam(v);
      else if (!scam.revealing) { scam.v = v; drawScam(); }
    } else if (v.status === 'play') {
      if (v.rid !== rid) setupRound(v);
      if (v.jamUntil > eng.jamUntil) eng.jamUntil = v.jamUntil;
      if (v.hintLog.length > hintSeen) {
        hintSeen = v.hintLog.length;
        eng.hintLog = v.hintLog.slice();
        view.hintUnlocked(v.hintLog[v.hintLog.length - 1]);
        setView('hack');
        Audio.hint();
      }
      show('game');
    }
  }

  let polling = false;
  async function poll() {
    if (!token || polling || demo) return;
    polling = true;
    try {
      apply(await api('state'));
      $('net').hidden = true;
    } catch (e) {
      if (e.status === 404) { setToken(null); st = null; showJoin(); }
      else $('net').hidden = false;
    }
    polling = false;
  }

  setInterval(() => {
    if (demo) {
      const left = demo.endsAt - Date.now();
      $('clock').textContent = fmtClock(left);
      $('clock').classList.toggle('crit', left <= 10000);
      if (view) view.tick();
      if (left <= 0) endDemo(false);
      return;
    }
    if (!st || st.status !== 'play' || animating) return;
    if (st.scam) {
      const left = st.endsAt - now();
      $('s-clock').textContent = fmtClock(left);
      $('s-clock').classList.toggle('crit', left <= 15000);
      if (left <= 0 && !(scam && scam.revealing)) poll();
      return;
    }
    const toStart = (st.startAt || 0) - now();
    const cd = $('countdown');
    if (toStart > -700 && st.duel) {
      cd.hidden = false;
      const n = Math.ceil(toStart / 1000);
      $('countdown-n').textContent = n > 0 ? n : 'GO!';
      $('countdown-vs').textContent = `${st.nick} vs ${st.duel.opponent}`;
      if (n !== countdownShown) { countdownShown = n; if (n > 0) Audio.tick(true); else Audio.start(); }
    } else if (!cd.hidden) cd.hidden = true;
    const left = Math.min(st.duration, st.endsAt - now());
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
    if (left <= 0) poll();
  }, 100);

  let submitting = false;
  async function onEnter(code) {
    if (submitting || !st || st.status !== 'play' || demo) return;
    if (code.length < 4) { C.Vault.needDigits(); return; }
    submitting = true;
    try {
      const r = await api('code', { code });
      if (r.status === 'won') {
        animating = true;
        $('clock').classList.remove('warn', 'crit');
        $('clock').classList.add('stopped');
        C.Vault.open(code, () => { animating = false; apply(r.view); });
      } else if (r.status === 'lost') {
        animating = true;
        C.Vault.deny(0, () => { animating = false; Audio.lose(); apply(r.view); });
      } else if (r.status === 'wrong') {
        C.Vault.deny(r.left);
      }
    } catch (e) {
      if (e.data && e.data.view) apply(e.data.view);
    }
    submitting = false;
  }

  C.Vault.mount($('vault-panel').querySelector('.vault-body'), { onEnter });

  /* ---------------- Join ---------------- */

  async function showJoin() {
    show('join');
    if (!INVITE) return;
    try {
      const info = await api('duelinfo', null, '?room=' + encodeURIComponent(INVITE));
      $('invite').hidden = false;
      $('invite').textContent = `${info.host} challenged you to a duel!`;
      $('modes').hidden = true;
      $('accept-duel').hidden = false;
      $('try-demo').hidden = true;
    } catch (e) {
      $('invite').hidden = false;
      $('invite').textContent = 'That duel has already started or ended. Pick a game below.';
    }
  }

  async function join(body) {
    try {
      const r = await api('join', Object.assign({ nick: $('name-input').value }, body));
      setToken(r.token);
      $('name-input').blur();
      if (INVITE) history.replaceState(null, '', location.pathname + (STATION ? '?station' : ''));
      apply(r.view);
    } catch (err) {
      $('name-error').textContent = err.status === 400 ? err.message : 'Could not connect. Try again.';
      Audio.bad();
    }
  }

  $('name-input').addEventListener('input', e => {
    const clean = e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
    if (clean !== e.target.value) e.target.value = clean;
    $('name-error').textContent = '';
  });
  $('join-form').addEventListener('submit', e => { e.preventDefault(); join({ tier: 'easy' }); });
  document.querySelectorAll('.mode').forEach(b => { b.onclick = () => join({ tier: b.dataset.mode }); });
  $('accept-duel').onclick = () => join({ duel: INVITE });
  $('try-demo').onclick = () => startDemo();
  $('demo-back').onclick = () => showJoin();

  const cancel = async () => {
    const r = await api('cancel', {}).catch(() => null);
    if (!r) return;
    if (r.status) apply(r);
    else { setToken(null); st = null; showJoin(); }
  };
  $('wait-cancel').onclick = cancel;
  $('duelopen-cancel').onclick = cancel;
  $('brief-go').onclick = async () => { apply(await api('start', {})); if (!(st && st.duel)) Audio.start(); };
  document.querySelectorAll('.p-nav button').forEach(b => { b.onclick = () => { Audio.click(); setView(b.dataset.view); }; });
  $('s-scam').onclick = () => answerScam('scam');
  $('s-legit').onclick = () => answerScam('legit');
  $('s-next').onclick = () => nextScam();
  $('res-card').onclick = () => openCard();
  $('card-close').onclick = () => { $('card-overlay').hidden = true; };
  $('res-station').onclick = () => {
    setToken(null); st = null;
    $('name-input').value = '';
    confetti.stop();
    showJoin();
  };

  function paintMute() {
    const m = Audio.isMuted();
    $('mute').classList.toggle('muted', m);
    $('mute').setAttribute('aria-label', m ? 'Sound off, tap to turn on' : 'Sound on, tap to mute');
  }
  $('mute').onclick = () => { Audio.toggleMute(); paintMute(); };
  paintMute();

  /* A returning player who scans a duel invite joins it with the same identity. */
  async function boot() {
    if (token && INVITE) {
      try {
        const v = await api('request', { duel: INVITE });
        history.replaceState(null, '', location.pathname + (STATION ? '?station' : ''));
        apply(v);
        return;
      } catch (e) { /* busy or invalid: fall through to their current screen */ }
    }
    if (token) poll(); else showJoin();
  }
  boot();
  setInterval(poll, 1500);
})();
