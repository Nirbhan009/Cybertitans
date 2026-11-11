/* The list staff use to take payment from phones, send hints and hand out prizes.
   Used by the laptop's staff panel and by the staff phone page. */
(function () {
  const CTV = window.CTV = window.CTV || {};

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const clock = ms => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  CTV.PhoneQueue = {
    mount(root, opts) {
      const options = opts || {};
      let armed = null, armTimer = null, last = '', data = null, stopped = false;

      async function call(route, pid, extra) {
        const r = await fetch('/api/admin/' + route, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(Object.assign({ pid }, extra))
        });
        armed = null;
        const j = await r.json().catch(() => ({}));
        if (j.rows) { data.rows = j.rows; draw(); } else refresh();
        if (options.onChange) options.onChange();
      }

      function button(label, cls, onClick, attrs) {
        const b = el('button', cls, label);
        b.type = 'button';
        b.onclick = onClick;
        Object.keys(attrs || {}).forEach(k => b.setAttribute(k, attrs[k]));
        return b;
      }

      function arm(key, fn) {
        if (armed === key) { fn(); return; }
        armed = key;
        clearTimeout(armTimer);
        armTimer = setTimeout(() => { armed = null; draw(); }, 3500);
        draw();
      }

      const tag = t => el('span', 'q-tag ' + t, { hard: 'HARD', scam: 'SCAM', duel: 'DUEL' }[t] || 'EASY');

      function row(r) {
        const out = el('div', 'q-row', undefined);
        out.dataset.pid = r.pid;
        const who = el('div', 'q-who');
        if (r.group === 'waiting') who.appendChild(el('b', 'q-code', r.code));
        who.appendChild(el('span', 'q-nick', r.nick));
        who.appendChild(tag(r.tier));
        out.appendChild(who);
        const acts = el('div', 'q-acts');
        const money = CTV.money;
        if (r.group === 'waiting') {
          acts.appendChild(button(`Paid ${money(r.price)}${r.duel ? ' (both)' : ''}`, 'q-go', () => call('approve', r.pid), { 'data-do': 'approve' }));
          if (r.tier === 'easy') acts.appendChild(button(`3 for ${money(r.packPrice)}`, 'q-go alt', () => call('approve', r.pid, { pack: true }), { 'data-do': 'pack' }));
          acts.appendChild(button('Remove', 'q-plain', () => call('remove', r.pid), { 'data-do': 'remove' }));
        } else if (r.group === 'playing') {
          out.appendChild(el('div', 'q-info', r.status === 'ready' ? r.progress : `${clock(r.leftMs)} left, ${r.progress}`));
          if (r.status === 'play' && r.kind !== 'scam' && r.tier !== 'duel') acts.appendChild(button(`Hint ${money(data.hintPrice)}`, 'q-plain', () => call('hint', r.pid), { 'data-do': 'hint' }));
          const key = 'void' + r.pid;
          acts.appendChild(button(armed === key ? 'Tap to confirm' : 'Void', 'q-danger', () => arm(key, () => call('void', r.pid)), { 'data-do': 'void' }));
        } else {
          out.appendChild(el('div', 'q-info', `Cracked in ${CTV.fmtTime(r.ms)}`));
          acts.appendChild(button('Prize given', 'q-go', () => call('prize', r.pid), { 'data-do': 'prize' }));
        }
        out.appendChild(acts);
        return out;
      }

      function draw() {
        if (!data) return;
        const snapshot = JSON.stringify([armed, data.rows.map(r => Object.assign({}, r, { leftMs: Math.ceil((r.leftMs || 0) / 1000) }))]);
        if (snapshot === last) return;
        last = snapshot;
        root.textContent = '';
        [['waiting', 'Waiting to pay'], ['winners', 'Prizes to hand out'], ['playing', 'Playing now']].forEach(([g, label]) => {
          const rows = data.rows.filter(r => r.group === g);
          root.appendChild(el('h4', 'q-head', `${label} (${rows.length})`));
          rows.forEach(r => root.appendChild(row(r)));
        });
      }

      async function refresh() {
        if (stopped) return;
        try {
          const r = await fetch('/api/admin/queue');
          if (r.status === 403) { if (options.onDenied) options.onDenied(); return; }
          data = await r.json();
          draw();
        } catch (e) { /* retry next tick */ }
      }

      refresh();
      const timer = setInterval(refresh, 1200);
      return { stop() { stopped = true; clearInterval(timer); } };
    }
  };
})();
