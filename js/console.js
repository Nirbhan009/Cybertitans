/* Engine = puzzle state and penalties, no DOM (the solver bot drives it directly).
   ConsoleView = the click-only hacking console: lock tabs, puzzle tools, activity feed. */
(function (root) {
  const CTV = root.CTV = root.CTV || {};
  const JAM_BASE = 10000, JAM_STEP = 5000;

  class Engine {
    constructor(round, hooks) {
      this.round = round;
      this.h = hooks || {};
      this.solved = round.puzzles.map(() => false);
      this.wrongs = 0;
      this.jamUntil = 0;
      this.hintIdx = {};
      this.hintLog = [];
      this.current = 0;
    }
    _now() { return this.h.now ? this.h.now() : Date.now(); }
    state() {
      return { solved: this.solved, wrongs: this.wrongs, jamUntil: this.jamUntil, hintIdx: this.hintIdx, hintLog: this.hintLog, current: this.current };
    }
    restore(s) { if (s) Object.assign(this, s); }
    jamLeft() { return Math.max(0, this.jamUntil - this._now()); }
    firstUnsolved() { return this.solved.indexOf(false); }
    count() { return this.solved.filter(Boolean).length; }

    attempt(slot, value) {
      if (this.solved[slot]) return { status: 'already' };
      if (this.jamLeft() > 0) return { status: 'jammed' };
      const p = this.round.puzzles[slot];
      if (p.check(value)) {
        this.solved[slot] = true;
        if (this.h.onSolve) this.h.onSolve(slot, p.digit);
        return { status: 'solved' };
      }
      /* The lockout grows with every mistake, so clicking at random costs more than thinking. */
      const ms = p.hard ? 20000 + 10000 * this.wrongs : JAM_BASE + JAM_STEP * this.wrongs;
      this.wrongs++;
      this.jamUntil = this._now() + ms;
      if (this.h.onWrong) this.h.onWrong();
      return { status: 'wrong', ms };
    }

    /* Staff unlocked a paid hint: prefer the puzzle on screen. */
    giveHint(prefer) {
      const slot = prefer !== undefined && prefer >= 0 && !this.solved[prefer] ? prefer : this.firstUnsolved();
      if (slot < 0) return null;
      const p = this.round.puzzles[slot];
      const i = Math.min(this.hintIdx[slot] || 0, p.hints.length - 1);
      this.hintIdx[slot] = i + 1;
      this.hintLog.push({ slot, text: p.hints[i] });
      return { slot, text: p.hints[i] };
    }
    latestHint(slot) {
      for (let i = this.hintLog.length - 1; i >= 0; i--) if (this.hintLog[i].slot === slot) return this.hintLog[i].text;
      return null;
    }
  }

  CTV.Engine = Engine;
  if (typeof document === 'undefined') return;

  const ICONS = {
    caesar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 3v4.5M12 16.5V21"/>',
    base64: '<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M7 7V4M12 7V4M17 7V4M7 20v-3M12 20v-3M17 20v-3"/>',
    hidden: '<path d="M3 6h6l2 2.5h10V19H3z"/>',
    phishing: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 7 9-7"/>',
    binary: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    log: '<rect x="3" y="4" width="18" height="7" rx="1"/><rect x="3" y="13" width="18" height="7" rx="1"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    password: '<circle cx="8" cy="15" r="4.5"/><path d="M11.5 12L20 3.5M16 7.5l3 3"/>'
  };
  const icon = t => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[t]}</svg>`;

  function el(tag, cls, text, attrs) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    if (attrs) Object.keys(attrs).forEach(k => n.setAttribute(k, attrs[k]));
    return n;
  }
  function btn(cls, text, onClick, attrs) {
    const b = el('button', cls, text, Object.assign({ type: 'button' }, attrs));
    b.addEventListener('click', onClick);
    return b;
  }

  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function ring(radius, size, cls) {
    let out = `<g class="${cls}">`;
    for (let i = 0; i < 26; i++) {
      const a = (i * 360 / 26 - 90) * Math.PI / 180;
      out += `<text x="${(100 + radius * Math.cos(a)).toFixed(1)}" y="${(100 + radius * Math.sin(a) + size / 2.8).toFixed(1)}" text-anchor="middle" font-size="${size}">${ALPHA[i]}</text>`;
    }
    return out + '</g>';
  }

  class ConsoleView {
    constructor(els, engine, opts) {
      this.els = els; this.eng = engine; this.opts = opts || {};
      this.ui = engine.round.puzzles.map(p => (p.type === 'caesar' ? { turns: p.start } : {}));
      this.queue = []; this.current = null; this.timer = null; this.advance = null; this.hintTimer = null;
      els.feed.textContent = '';
      els.jam.hidden = true;
      this._resetHintBtn();
      els.hintBtn.onclick = () => this._askHint();
      this.renderTabs();
      this.renderStage();
    }

    destroy() {
      clearInterval(this.timer); this.timer = null; this.queue = []; this.current = null;
      clearTimeout(this.advance); clearTimeout(this.hintTimer);
    }

    /* Activity feed with the typing animation. */
    log(lines) {
      this.queue.push(...lines);
      if (!this.timer) this.timer = setInterval(() => this._type(4), 16);
    }
    _type(budget) {
      const feed = this.els.feed;
      while (budget > 0) {
        if (!this.current) {
          const next = this.queue.shift();
          if (!next) { clearInterval(this.timer); this.timer = null; break; }
          const line = el('div', 'tl ' + (next.c || ''));
          feed.insertBefore(line, feed.lastElementChild && feed.lastElementChild.classList.contains('cursor-line') ? feed.lastElementChild : null);
          this.current = { line, text: next.t, pos: 0 };
          this._cursor();
        }
        const take = Math.min(budget, this.current.text.length - this.current.pos);
        this.current.pos += take;
        this.current.line.textContent = this.current.text.slice(0, this.current.pos);
        budget -= take;
        if (this.current.pos >= this.current.text.length) this.current = null;
      }
      while (feed.childElementCount > 40) feed.removeChild(feed.firstChild);
      feed.scrollTop = feed.scrollHeight;
    }
    _cursor() {
      const feed = this.els.feed;
      let c = feed.querySelector('.cursor-line');
      if (!c) { c = el('div', 'cursor-line'); c.appendChild(el('span', 'cursor')); }
      feed.appendChild(c);
    }
    flush() { if (this.timer || this.current) this._type(1e9); }

    tick() {
      const left = this.eng.jamLeft();
      const on = left > 0;
      if (this.els.jam.hidden === on) this.els.jam.hidden = !on;
      if (on) this.els.jamTime.textContent = Math.ceil(left / 1000);
    }

    select(slot) {
      clearTimeout(this.advance);
      this.eng.current = slot;
      this.renderTabs();
      this.renderStage();
      if (this.opts.onChange) this.opts.onChange();
    }

    renderTabs() {
      const box = this.els.tabs;
      box.textContent = '';
      this.eng.round.puzzles.forEach((p, i) => {
        const solved = this.eng.solved[i];
        const b = btn('lock-tab' + (i === this.eng.current ? ' on' : '') + (solved ? ' solved' : ''), null, () => {
          if (this.opts.onClick) this.opts.onClick();
          this.select(i);
        }, { 'data-slot': i });
        b.innerHTML = `<span class="ico">${icon(p.type)}</span><span class="tab-txt"><b></b><small></small></span>`;
        b.querySelector('b').textContent = p.title;
        b.querySelector('small').textContent = solved ? `DIGIT ${i + 1}: ${p.digit}` : `DIGIT ${i + 1}: LOCKED`;
        box.appendChild(b);
      });
    }

    renderStage() {
      const slot = this.eng.current, p = this.eng.round.puzzles[slot], stage = this.els.stage;
      stage.textContent = '';
      const root = el('div', 'puzzle', null, { 'data-type': p.type, 'data-slot': slot });
      if (this.eng.solved[slot]) {
        root.classList.add('done');
        root.appendChild(el('div', 'stamp-label', 'LOCK BROKEN'));
        root.appendChild(el('div', 'stamp-digit', p.digit));
        root.appendChild(el('div', 'stamp-where', `This is digit ${slot + 1} of the vault code`));
        root.appendChild(el('p', 'stamp-why', p.explain));
        stage.appendChild(root);
        return;
      }
      root.appendChild(el('h3', 'p-title', p.title));
      root.appendChild(el('p', 'p-teach', p.teach));
      const hint = this.eng.latestHint(slot);
      if (hint) root.appendChild(el('div', 'p-hint', 'HINT: ' + hint));
      const body = el('div', 'p-body');
      this['_' + p.type](p, body, this.ui[slot]);
      root.appendChild(body);
      stage.appendChild(root);
    }

    /* The phone's engine answers over the network, so this accepts a promise too. */
    _try(slot, value) {
      if (this.busy) return;
      this.busy = true;
      Promise.resolve(this.eng.attempt(slot, value)).then(r => {
        this.busy = false;
        if (r.status === 'wrong') {
          this.log([{ t: `[x] WRONG. Firewall tripped. Console locked for ${r.ms / 1000} seconds.`, c: 'err' }]);
          this.tick();
        } else if (r.status === 'solved') {
          this._solved(slot);
        }
        if (this.opts.onChange) this.opts.onChange();
      }).catch(() => {
        this.busy = false;
        this.log([{ t: '[!] Connection problem. Try again.', c: 'warn' }]);
      });
    }

    _solved(slot) {
      if (this.ui[slot]) this.ui[slot].text = null;
      const p = this.eng.round.puzzles[slot];
      const n = this.eng.count();
      this.log([{ t: `[+] ${p.title} cracked. Digit ${slot + 1} is ${p.digit}. (${n} of 4)`, c: 'ok' }]);
      this.renderTabs();
      this.renderStage();
      if (this.eng.firstUnsolved() < 0) {
        this.log([{ t: '[+] ALL DIGITS FOUND. ENTER THE CODE ON THE VAULT KEYPAD!', c: 'cyan' }]);
        if (this.opts.onAllSolved) this.opts.onAllSolved();
        return;
      }
      clearTimeout(this.advance);
      this.advance = setTimeout(() => {
        if (this.eng.current === slot) this.select(this.eng.firstUnsolved());
      }, 2600);
    }

    _resetHintBtn() { this.els.hintBtn.textContent = 'NEED A HINT?'; this.els.hintBtn.classList.remove('asked'); }
    _askHint() {
      const msg = `Hint costs ${this.opts.hintPrice ? this.opts.hintPrice() : '$1'}, see staff`;
      this.els.hintBtn.textContent = msg;
      this.els.hintBtn.classList.add('asked');
      this.log([{ t: msg + '.', c: 'warn' }]);
      clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => this._resetHintBtn(), 6000);
    }
    hintUnlocked(h) {
      this._resetHintBtn();
      this.log([{ t: `[hint] Unlocked for digit ${h.slot + 1}.`, c: 'cyan' }]);
      this.select(h.slot);
    }

    /* Puzzle tools */
    _caesar(p, body, ui) {
      const msg = el('div', 'cipher-msg', null, { id: 'caesar-msg' });
      const svgBox = el('div', 'wheel-box');
      svgBox.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="98" class="w-outer"/><circle cx="100" cy="100" r="74" class="w-inner"/>
        ${ring(86, 13, 'w-fixed')}${ring(62, 12, 'w-move')}
        <polygon points="100,16 94,4 106,4" class="w-mark"/></svg>`;
      const label = el('div', 'shift-label');
      const paint = () => {
        const s = ((ui.turns % 26) + 26) % 26;
        msg.textContent = CTV.Puzzles.caesar(p.cipher, -s);
        label.textContent = `SHIFT ${s}`;
        label.dataset.shift = s;
        svgBox.querySelector('.w-move').style.transform = `rotate(${ui.turns * 360 / 26}deg)`;
      };
      const turn = by => { ui.turns += by; if (this.opts.onClick) this.opts.onClick(); paint(); };
      const row = el('div', 'wheel-row');
      row.append(btn('arrow', '◀', () => turn(-1), { 'aria-label': 'Turn wheel back', 'data-act': 'prev' }), svgBox,
        btn('arrow', '▶', () => turn(1), { 'aria-label': 'Turn wheel forward', 'data-act': 'next' }));
      const side = el('div', 'wheel-side');
      side.append(label, btn('lockin', 'LOCK IN', () => {
        this._try(p.slot, ((ui.turns % 26) + 26) % 26);
      }, { 'data-act': 'lock' }));
      const wrap = el('div', 'wheel-wrap');
      wrap.append(row, side);
      body.append(msg, wrap);
      paint();
    }

    /* Hard: real decoders on a layered packet. A decoder that cannot read the data trips the firewall. */
    _base64Hard(p, body, ui) {
      ui.text = ui.text || p.packet;
      body.appendChild(el('div', 'packet', ui.text, { id: 'packet' }));
      const grid = el('div', 'tool-grid four');
      ['Base64', 'Base32', 'Hex', 'Binary'].forEach(name => {
        grid.appendChild(btn('tool', name, () => {
          if (this.opts.onClick) this.opts.onClick();
          const out = CTV.Puzzles.decoders[name](ui.text);
          if (out === null) {
            ui.text = p.packet;
            this.renderStage();
            this._try(p.slot, '\u0000bad decode');
            return;
          }
          ui.text = out;
          this.renderStage();
        }, { 'data-tool': name }));
      });
      const foot = el('div', 'bit-foot');
      foot.append(
        btn('ghost-btn', 'START OVER', () => { ui.text = p.packet; this.renderStage(); }, { 'data-act': 'reset' }),
        btn('lockin', 'LOCK IN', () => {
          const v = ui.text;
          ui.text = p.packet;
          this._try(p.slot, v);
          this.renderStage();
        }, { 'data-act': 'lock' })
      );
      body.append(grid, foot);
    }

    _base64(p, body, ui) {
      if (p.hard) { this._base64Hard(p, body, ui); return; }
      body.appendChild(el('div', 'packet', p.packet, { id: 'packet' }));
      const grid = el('div', 'tool-grid');
      p.tools.forEach(t => {
        const b = btn('tool', null, () => this._try(p.slot, t.name), { 'data-tool': t.name });
        b.append(el('b', '', t.name + ' decoder'), el('span', '', t.looks));
        grid.appendChild(b);
      });
      body.appendChild(grid);
    }

    _hidden(p, body, ui) {
      ui.folder = ui.folder || 0;
      const win = el('div', 'explorer');
      const bar = el('div', 'ex-bar');
      bar.appendChild(el('span', '', 'File Explorer'));
      const toggle = btn('switch' + (ui.show ? ' on' : ''), null, () => {
        ui.show = !ui.show; ui.preview = null;
        if (this.opts.onClick) this.opts.onClick();
        this.renderStage();
      }, { id: 'hidden-toggle', role: 'switch', 'aria-checked': String(!!ui.show) });
      toggle.append(el('i'), el('span', '', 'Show hidden files'));
      bar.appendChild(toggle);
      win.appendChild(bar);
      const main = el('div', 'ex-main');
      const side = el('div', 'ex-side');
      p.folders.forEach((f, i) => {
        const b = btn('folder' + (i === ui.folder ? ' on' : ''), null, () => {
          ui.folder = i; ui.preview = null;
          if (this.opts.onClick) this.opts.onClick();
          this.renderStage();
        }, { 'data-folder': i });
        b.innerHTML = icon('hidden');
        b.appendChild(el('span', '', f.name));
        side.appendChild(b);
      });
      const files = el('div', 'ex-files');
      p.folders[ui.folder].files.forEach(f => {
        if (f.hidden && !ui.show) return;
        const b = btn('file' + (f.hidden ? ' ghost' : ''), null, () => {
          if (this.opts.onClick) this.opts.onClick();
          if (f.secret || (p.hard && f.hidden)) { this._try(p.slot, f.name); return; }
          ui.preview = f;
          this.renderStage();
        }, { 'data-name': f.name });
        b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
        b.appendChild(el('span', '', f.name));
        files.appendChild(b);
      });
      main.append(side, files);
      win.appendChild(main);
      win.appendChild(el('div', 'ex-preview', ui.preview ? `${ui.preview.name}: ${ui.preview.text}` : 'Click a file to open it.'));
      body.appendChild(win);
    }

    _phishing(p, body) {
      const mail = el('div', 'mail');
      const head = el('div', 'mail-head');
      head.append(el('div', '', 'From: ' + p.from), el('div', 'mail-subj', p.subject));
      mail.appendChild(head);
      mail.appendChild(el('p', 'mail-body', p.body));
      p.links.forEach(u => mail.appendChild(btn('mail-link', u, () => this._try(p.slot, u), { 'data-url': u })));
      if (p.domain) mail.appendChild(el('div', 'mail-note', 'Official website: ' + p.domain, { id: 'official', 'data-official': p.domain }));
      body.appendChild(mail);
    }

    /* Hard binary: no running total, the player works it out and enters it. */
    _binaryHard(p, body, ui) {
      ui.entry = ui.entry || '';
      const row = el('div', 'bits ten');
      p.bits.forEach(bit => {
        const col = el('div', 'bit-col');
        col.append(el('div', 'bulb' + (bit ? ' lit' : ''), null, { 'aria-hidden': 'true' }), el('div', 'bit-val', bit));
        row.appendChild(col);
      });
      const show = el('div', 'bit-total', ui.entry || '0', { id: 'bit-total' });
      const pad = el('div', 'mini-pad');
      const press = k => {
        if (this.opts.onClick) this.opts.onClick();
        if (k === 'CLR') ui.entry = '';
        else if (ui.entry.length < 4) ui.entry += k;
        show.textContent = ui.entry || '0';
      };
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'CLR'].forEach(k => pad.appendChild(btn('mini', k, () => press(k), { 'data-mini': k })));
      const foot = el('div', 'bit-foot');
      foot.append(el('span', 'bit-lbl', 'ANSWER'), show, btn('lockin', 'LOCK IN', () => {
        const value = ui.entry;
        ui.entry = '';
        show.textContent = '0';
        this._try(p.slot, value || '0');
      }, { 'data-act': 'lock' }));
      body.append(row, pad, foot);
    }

    _binary(p, body, ui) {
      if (p.hard) { this._binaryHard(p, body, ui); return; }
      ui.picked = ui.picked || p.places.map(() => false);
      const total = el('div', 'bit-total', null, { id: 'bit-total' });
      const paint = () => { total.textContent = p.places.reduce((n, v, i) => n + (ui.picked[i] ? v : 0), 0); };
      const row = el('div', 'bits');
      p.places.forEach((v, i) => {
        const col = el('div', 'bit-col');
        col.append(el('div', 'bulb' + (p.bits[i] ? ' lit' : ''), null, { 'aria-hidden': 'true' }), el('div', 'bit-val', p.bits[i]));
        const b = btn('place' + (ui.picked[i] ? ' on' : ''), v, () => {
          ui.picked[i] = !ui.picked[i];
          b.classList.toggle('on', ui.picked[i]);
          if (this.opts.onClick) this.opts.onClick();
          paint();
        }, { 'data-place': v, 'data-bit': p.bits[i] });
        col.appendChild(b);
        row.appendChild(col);
      });
      const foot = el('div', 'bit-foot');
      foot.append(el('span', 'bit-lbl', 'TOTAL'), total, btn('lockin', 'LOCK IN', () => this._try(p.slot, total.textContent), { 'data-act': 'lock' }));
      body.append(row, foot);
      paint();
    }

    _log(p, body) {
      const table = el('div', 'logt');
      const head = el('div', 'log-row log-head');
      ['TIME', 'IP ADDRESS', 'RESULT', 'USER'].forEach(h => head.appendChild(el('span', '', h)));
      table.appendChild(head);
      p.rows.forEach(row => {
        const b = btn('log-row' + (row.status === 'FAILED' ? ' failed' : ''), null, () => this._try(p.slot, row.ip), { 'data-ip': row.ip, 'data-status': row.status, 'data-user': row.user });
        [row.time, row.ip, row.status, row.user].forEach(v => b.appendChild(el('span', '', v)));
        table.appendChild(b);
      });
      body.appendChild(table);
    }

    /* Hard: rank all four. The fourth click submits the order. */
    _passwordRanked(p, body, ui) {
      ui.picked = ui.picked || [];
      const grid = el('div', 'pw-grid');
      p.options.forEach(o => {
        const at = ui.picked.indexOf(o);
        grid.appendChild(btn('pw' + (at >= 0 ? ' on' : ''), at >= 0 ? `${at + 1}.  ${o}` : o, () => {
          if (this.opts.onClick) this.opts.onClick();
          if (ui.picked.includes(o)) return;
          ui.picked.push(o);
          if (ui.picked.length === p.options.length) {
            const order = ui.picked.join('\n');
            ui.picked = [];
            this._try(p.slot, order);
          }
          this.renderStage();
        }, { 'data-pw': o }));
      });
      body.appendChild(grid);
      const foot = el('div', 'bit-foot');
      foot.appendChild(btn('ghost-btn', 'CLEAR ORDER', () => { ui.picked = []; this.renderStage(); }, { 'data-act': 'reset' }));
      body.appendChild(foot);
    }

    _password(p, body, ui) {
      if (p.ranked) { this._passwordRanked(p, body, ui); return; }
      const grid = el('div', 'pw-grid');
      p.options.forEach(o => grid.appendChild(btn('pw', o, () => this._try(p.slot, o), { 'data-pw': o })));
      body.appendChild(grid);
    }
  }

  CTV.ConsoleView = ConsoleView;
})(typeof window !== 'undefined' ? window : globalThis);
