/* The vault: SVG door and interior, seven-segment display, keypad. */
(function () {
  const CTV = window.CTV = window.CTV || {};
  const A = () => CTV.Audio;

  const SEG = {
    a: '12,5 48,5 42,12 18,12', b: '52,9 45,15 45,43 52,48', c: '52,52 45,57 45,85 52,91',
    d: '18,88 42,88 48,95 12,95', e: '8,52 15,57 15,85 8,91', f: '8,9 15,15 15,43 8,48',
    g: '12,50 18,46 42,46 48,50 42,54 18,54'
  };
  const GLYPH = {
    0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcfgd',
    '-': 'g', ' ': '', O: 'abcdef', P: 'abefg', E: 'adefg', n: 'ceg', d: 'bcdeg', y: 'bcdfg'
  };

  function ledSVG() {
    return '<svg viewBox="0 0 60 100" class="led-digit" aria-hidden="true">' +
      Object.keys(SEG).map(k => `<polygon data-s="${k}" points="${SEG[k]}"/>`).join('') + '</svg>';
  }

  const pt = (r, deg) => {
    const a = (deg - 90) * Math.PI / 180;
    return [250 + r * Math.cos(a), 250 + r * Math.sin(a)];
  };
  const fix = n => n.toFixed(1);

  function rivets(r, count, size) {
    let out = '';
    for (let i = 0; i < count; i++) {
      const [x, y] = pt(r, (i + 0.5) * 360 / count);
      out += `<circle cx="${fix(x)}" cy="${fix(y)}" r="${size}" fill="url(#rivet)" stroke="#0a0d11" stroke-width="1"/>`;
    }
    return out;
  }

  function doorFace() {
    let bolts = '';
    for (let i = 0; i < 10; i++) {
      bolts += `<g transform="rotate(${i * 36} 250 250)"><rect class="bolt" x="237" y="0" width="26" height="46" rx="3" fill="url(#boltg)" stroke="#20262e"/></g>`;
    }
    let brush = '';
    for (let i = 0; i < 90; i++) {
      const [x1, y1] = pt(120, i * 4), [x2, y2] = pt(176, i * 4);
      brush += `<line x1="${fix(x1)}" y1="${fix(y1)}" x2="${fix(x2)}" y2="${fix(y2)}" stroke="${i % 2 ? '#fff' : '#000'}" stroke-opacity=".05"/>`;
    }
    let ticks = '';
    for (let i = 0; i < 60; i++) {
      const major = i % 6 === 0;
      const [x1, y1] = pt(major ? 88 : 95, i * 6), [x2, y2] = pt(104, i * 6);
      ticks += `<line x1="${fix(x1)}" y1="${fix(y1)}" x2="${fix(x2)}" y2="${fix(y2)}" stroke="#c9f7ff" stroke-width="${major ? 2.6 : 1.1}" stroke-opacity="${major ? .95 : .5}"/>`;
      if (major) {
        const [tx, ty] = pt(74, i * 6);
        ticks += `<text x="${fix(tx)}" y="${fix(ty + 5)}" text-anchor="middle" font-size="15" font-family="Consolas,monospace" font-weight="700" fill="#c9f7ff">${i / 6}</text>`;
      }
    }
    let spokes = '';
    for (let i = 0; i < 5; i++) {
      spokes += `<g transform="rotate(${i * 72} 250 250)">
        <rect x="243" y="172" width="14" height="66" fill="url(#boltg)" stroke="#1c2229"/>
        <circle cx="250" cy="168" r="13" fill="url(#knob)" stroke="#12161b"/>
      </g>`;
    }
    return `<svg viewBox="-8 -8 516 516" class="door-svg" aria-hidden="true">
      <defs>
        <radialGradient id="steel" cx=".36" cy=".3" r=".9">
          <stop offset="0" stop-color="#a7b4c0"/><stop offset=".45" stop-color="#66727f"/><stop offset="1" stop-color="#2d353e"/>
        </radialGradient>
        <linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#d0dae3"/><stop offset=".5" stop-color="#5c6773"/><stop offset="1" stop-color="#242b33"/>
        </linearGradient>
        <linearGradient id="boltg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#4f5a65"/><stop offset=".5" stop-color="#d7e0e8"/><stop offset="1" stop-color="#3c4550"/>
        </linearGradient>
        <radialGradient id="rivet" cx=".35" cy=".3" r=".8">
          <stop offset="0" stop-color="#eef3f7"/><stop offset=".55" stop-color="#7f8b97"/><stop offset="1" stop-color="#2b323a"/>
        </radialGradient>
        <radialGradient id="knob" cx=".35" cy=".3" r=".8">
          <stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#8d99a5"/><stop offset="1" stop-color="#20262d"/>
        </radialGradient>
        <radialGradient id="dialg" cx=".4" cy=".35" r=".85">
          <stop offset="0" stop-color="#26313b"/><stop offset="1" stop-color="#0a0f14"/>
        </radialGradient>
      </defs>
      <g class="bolts">${bolts}</g>
      <circle cx="250" cy="250" r="238" fill="url(#ringg)" stroke="#12161b" stroke-width="3"/>
      <circle cx="250" cy="250" r="214" fill="#20272f" stroke="#0d1115" stroke-width="3"/>
      <circle cx="250" cy="250" r="208" fill="url(#steel)"/>
      ${rivets(226, 36, 6)}
      <circle cx="250" cy="250" r="180" fill="none" stroke="#10151a" stroke-width="3"/>
      <circle cx="250" cy="250" r="176" fill="none" stroke="#ffffff" stroke-opacity=".2" stroke-width="1.5"/>
      ${rivets(193, 24, 4.5)}
      ${brush}
      <circle cx="250" cy="250" r="120" fill="#141a20" stroke="#0a0d11" stroke-width="3"/>
      <circle cx="250" cy="250" r="116" fill="none" stroke="#19e6ff" stroke-opacity=".55" stroke-width="2"/>
      <g class="dial-idle"><g class="dial">
        <circle cx="250" cy="250" r="110" fill="url(#dialg)"/>
        ${ticks}
      </g></g>
      <g class="wheel">
        ${spokes}
        <circle cx="250" cy="250" r="34" fill="url(#steel)" stroke="#0e1216" stroke-width="3"/>
        <circle cx="250" cy="250" r="18" fill="#0a0f14"/>
        <circle class="hub" cx="250" cy="250" r="10" fill="#ff2d4a"/>
      </g>
      <polygon points="250,126 241,110 259,110" fill="#ff2d4a" stroke="#320710"/>
    </svg>`;
  }

  function interior() {
    let bars = '';
    const rows = [[170, 3], [216, 4], [262, 5], [308, 5], [354, 4]];
    rows.forEach(([y, n]) => {
      const w = 62;
      const start = 250 - (n * w + (n - 1) * 6) / 2;
      for (let i = 0; i < n; i++) {
        const x = start + i * (w + 6);
        bars += `<polygon points="${x + 8},${y} ${x + w - 8},${y} ${x + w},${y + 34} ${x},${y + 34}" fill="url(#gold)" stroke="#7a5200"/>`;
      }
    });
    return `<svg viewBox="-8 -8 516 516" class="back-svg" aria-hidden="true">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".5" stop-color="#ffc940"/><stop offset="1" stop-color="#b87e0a"/></linearGradient>
        <radialGradient id="room" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".55" stop-color="#a06a10"/><stop offset="1" stop-color="#2b1b05"/></radialGradient>
        <linearGradient id="framing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#57626e"/><stop offset="1" stop-color="#191f26"/></linearGradient>
      </defs>
      <circle cx="250" cy="250" r="256" fill="url(#framing)" stroke="#0a0d11" stroke-width="3"/>
      <circle cx="250" cy="250" r="230" fill="url(#room)" stroke="#07090c" stroke-width="10"/>
      ${bars}
      <rect x="150" y="136" width="200" height="16" rx="3" fill="#19e6ff" opacity=".85"/>
    </svg>`;
  }

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'ENT'];

  let el = {}, cb = {}, entered = '', locked = false, angle = 0, tries = 3, timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function setLed(text) {
    el.leds.forEach((svg, i) => {
      const on = GLYPH[text[i] === undefined ? ' ' : text[i]] || '';
      svg.querySelectorAll('polygon').forEach(p => p.classList.toggle('on', on.includes(p.dataset.s)));
    });
  }
  const showEntered = () => setLed(entered.padEnd(4, ' '));

  function setStatus(text, cls) {
    el.status.textContent = text;
    el.status.className = 'vault-status ' + (cls || '');
  }

  function renderTries() {
    el.tries.textContent = '';
    for (let i = 0; i < el.total; i++) {
      const d = document.createElement('i');
      if (i >= tries) d.className = 'spent';
      el.tries.appendChild(d);
    }
    el.triesLabel.textContent = `${tries} ${tries === 1 ? 'TRY' : 'TRIES'} LEFT`;
  }

  function spin(by) {
    angle += by;
    el.dial.style.transform = `rotate(${angle}deg)`;
  }

  function press(k) {
    if (locked) return;
    if (k === 'CLR') { entered = ''; A().key(); showEntered(); setStatus('ENTER 4-DIGIT CODE'); spin(-60); return; }
    if (k === 'ENT') { cb.onEnter(entered); return; }
    if (entered.length >= 4) { A().bad(); return; }
    entered += k;
    A().key();
    spin(36 + Number(k) * 6);
    showEntered();
  }

  CTV.Vault = {
    mount(root, callbacks) {
      cb = callbacks;
      root.innerHTML = `
        <div class="door-area">
          <div class="door-wrap">
            <div class="hinge h1"></div><div class="hinge h2"></div>
            <div class="vault-back">${interior()}</div>
            <div class="vault-glow"><div class="vault-rays"></div></div>
            <div class="door" id="door">
              <div class="door-depth"></div>
              ${doorFace()}
            </div>
          </div>
        </div>
        <div class="control">
          <div class="beacons"><b></b><span>VAULT-07 SECURE</span><b></b></div>
          <div class="led-case"><div class="led-row">${ledSVG().repeat(4)}</div></div>
          <div class="vault-status" id="vault-status">ENTER 4-DIGIT CODE</div>
          <div class="tries"><div class="tries-dots" id="tries-dots"></div><span id="tries-label"></span></div>
          <div class="keypad" id="keypad">${KEYS.map(k =>
            `<button type="button" data-k="${k}" class="${k.length > 1 ? 'fn ' + k.toLowerCase() : ''}">${k}</button>`).join('')}</div>
        </div>
        <div class="denied" id="denied"><strong>ACCESS DENIED</strong><span id="denied-sub"></span></div>`;
      el = {
        root,
        door: root.querySelector('#door'),
        dial: root.querySelector('.dial'),
        wheel: root.querySelector('.wheel'),
        leds: [...root.querySelectorAll('.led-digit')],
        status: root.querySelector('#vault-status'),
        tries: root.querySelector('#tries-dots'),
        triesLabel: root.querySelector('#tries-label'),
        denied: root.querySelector('#denied'),
        deniedSub: root.querySelector('#denied-sub'),
        total: 3
      };
      const depth = root.querySelector('.door-depth');
      for (let i = 1; i <= 9; i++) {
        const disc = document.createElement('span');
        disc.style.transform = `translateZ(${-i * 3.4}px)`;
        depth.appendChild(disc);
      }
      root.querySelector('#keypad').addEventListener('click', e => {
        const b = e.target.closest('button[data-k]');
        if (b) { press(b.dataset.k); b.blur(); }
      });
    },

    reset(total, left) {
      timers.forEach(clearTimeout); timers = [];
      entered = ''; locked = false;
      el.total = total; tries = left;
      el.root.classList.remove('open', 'opening', 'alarm', 'lockdown', 'denying', 'unbolted', 'ready');
      el.door.classList.remove('instant');
      showEntered(); setStatus('ENTER 4-DIGIT CODE'); renderTries();
    },

    handleKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (/^[0-9]$/.test(e.key)) { press(e.key); return true; }
      if (e.key === 'Enter') { press('ENT'); return true; }
      if (e.key === 'Backspace') {
        if (!locked && entered) { entered = entered.slice(0, -1); A().key(); showEntered(); }
        return true;
      }
      if (e.key === 'Escape' || e.key === 'Delete') { press('CLR'); return true; }
      return false;
    },

    needDigits() { A().bad(); setStatus('NEED ALL 4 DIGITS', 'warn'); },

    ready() { el.root.classList.add('ready'); if (!locked) setStatus('ALL DIGITS FOUND!', 'good'); },

    deny(left, done) {
      locked = true; tries = left; entered = '';
      renderTries();
      setLed('dEny');
      setStatus('ACCESS DENIED', 'bad');
      el.deniedSub.textContent = left > 0 ? `${left} ${left === 1 ? 'TRY' : 'TRIES'} LEFT` : 'VAULT LOCKED DOWN';
      el.root.classList.add('denying', 'alarm');
      document.body.classList.remove('shake');
      void document.body.offsetWidth;
      document.body.classList.add('shake');
      A().alarm();
      later(() => {
        el.root.classList.remove('denying');
        document.body.classList.remove('shake');
        if (left > 0) el.root.classList.remove('alarm');
        locked = false;
        showEntered();
        if (left > 0) setStatus('ENTER 4-DIGIT CODE');
        if (done) done();
      }, 1400);
    },

    lockdown(code) {
      timers.forEach(clearTimeout); timers = [];
      locked = true;
      el.root.classList.remove('denying');
      document.body.classList.remove('shake');
      el.root.classList.add('alarm', 'lockdown');
      setStatus('LOCKED DOWN', 'bad');
      setLed(code || '----');
    },

    showOpen(code) {
      locked = true;
      el.root.classList.add('unbolted', 'open');
      el.door.classList.add('instant');
      setLed('OPEn');
      setStatus('VAULT OPEN', 'good');
    },

    open(code, done) {
      locked = true;
      setLed(code);
      setStatus('CODE ACCEPTED', 'good');
      A().door();
      el.dial.style.transition = 'transform 1.1s cubic-bezier(.3,.05,.2,1)';
      el.wheel.classList.add('spin');
      spin(1080);
      later(() => { el.root.classList.add('unbolted'); }, 800);
      later(() => { setLed('OPEn'); setStatus('VAULT OPEN', 'good'); el.root.classList.add('open'); }, 1250);
      later(() => { el.dial.style.transition = ''; el.wheel.classList.remove('spin'); if (done) done(); }, 3000);
    },

    cancelAnim() { timers.forEach(clearTimeout); timers = []; },
    isLocked: () => locked
  };
})();
