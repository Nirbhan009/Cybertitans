/* Projector mode (index.html#board): leaderboards, plus a live duel view and an
   event ticker when the game runs through the server. */
(function () {
  const CTV = window.CTV = window.CTV || {};
  const $ = id => document.getElementById(id);
  const clock = ms => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  function lane(el, p, side, d, now) {
    el.textContent = '';
    if (!p) return;
    const won = d.winnerSide === side;
    el.className = 'lane' + (won ? ' win' : '') + (p.done && !won ? ' out' : '');
    const name = document.createElement('div');
    name.className = 'ln';
    name.textContent = p.nick;
    const pips = document.createElement('div');
    pips.className = 'pips';
    for (let i = 0; i < 4; i++) {
      const pip = document.createElement('i');
      if (i < p.solved) pip.className = 'on';
      pips.appendChild(pip);
    }
    const status = document.createElement('div');
    status.className = 'ls';
    if (won) status.textContent = `WINNER  ${CTV.fmtTime(d.winMs)}`;
    else if (d.status === 'ready') status.textContent = p.ready ? 'READY' : 'GETTING READY...';
    else if (p.done) status.textContent = p.reason === 'beaten' ? 'BEATEN' : p.reason === 'time' ? 'OUT OF TIME' : 'LOCKED OUT';
    else if (d.startAt > now) status.textContent = 'GET SET...';
    else if (p.solved === 4) status.textContent = 'ENTERING THE CODE!';
    else status.textContent = `CRACKING LOCK ${p.solved + 1}`;
    el.append(name, pips, status);
  }

  CTV.Board = {
    start(easyEl, hardEl, scamEl) {
      const S = CTV.Store;
      const server = S.isServer();
      $('board-scam-col').hidden = !server;
      $('board-cols').classList.toggle('three', server);
      let last = null, known = null, tickerText = '', offset = 0, live = null;

      function renderBoards() {
        const easy = S.board('easy'), hard = S.board('hard'), scam = S.board('scam');
        const raw = JSON.stringify([easy, hard, scam]);
        if (raw === last) return;
        last = raw;
        const all = easy.concat(hard, scam);
        let fresh = null;
        if (known) {
          const add = all.find(e => !known.has(e.id));
          if (add) { fresh = add.id; if (CTV.Audio) CTV.Audio.solve(); }
        }
        known = new Set(all.map(e => e.id));
        CTV.renderBoard(easyEl, 10, fresh, 'easy');
        CTV.renderBoard(hardEl, 10, fresh, 'hard');
        if (server) CTV.renderBoard(scamEl, 10, fresh, 'scam');
      }

      function renderLive() {
        live = server ? S.live() : null;
        if (!live) return;
        offset = live.now - Date.now();
        const events = live.events.slice().reverse().map(e => e.text);
        const text = events.join('     ◆     ');
        $('ticker').hidden = !text;
        if (text !== tickerText) {
          tickerText = text;
          const span = $('ticker-text');
          span.textContent = text;
          span.style.setProperty('--dur', Math.max(18, text.length * 0.16) + 's');
          span.style.animation = 'none';
          void span.offsetWidth;
          span.style.animation = '';
        }
        drawDuel();
      }

      function drawDuel() {
        const d = live && live.duels[0];
        const box = $('duel-live');
        box.hidden = !d;
        document.body.classList.toggle('has-duel', !!d);
        if (!d) return;
        const now = Date.now() + offset;
        lane($('lane-a'), d.a, 'a', d, now);
        lane($('lane-b'), d.b, 'b', d, now);
        let mid;
        if (d.status === 'ready') mid = 'READY?';
        else if (d.startAt > now) mid = String(Math.ceil((d.startAt - now) / 1000));
        else if (d.status === 'done') mid = d.winner ? 'WIN!' : 'TIME';
        else mid = clock(d.endsAt - now);
        $('duel-clock').textContent = mid;
      }

      S.onChange(() => { renderBoards(); renderLive(); });
      renderBoards();
      renderLive();
      setInterval(drawDuel, 250);
    }
  };
})();
