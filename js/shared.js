/* Small display helpers used by the booth, projector, phone and staff pages. */
(function () {
  const CTV = window.CTV = window.CTV || {};

  CTV.fmtTime = function (ms) {
    const total = Math.max(0, Math.round(ms / 10));
    const m = Math.floor(total / 6000);
    const s = Math.floor(total / 100) % 60;
    const c = total % 100;
    return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
  };
  CTV.money = n => '$' + (Number.isInteger(n) ? n : Number(n).toFixed(2));

  CTV.drawRows = function (el, rows, count, freshId) {
    el.textContent = '';
    for (let i = 0; i < count; i++) {
      const e = rows[i];
      const row = document.createElement('div');
      row.className = 'lb-row' + (e ? '' : ' empty') + (e && e.cracked === false ? ' dnf' : '') + (e && e.id === freshId ? ' fresh' : '');
      const rank = document.createElement('span'); rank.className = 'lb-rank'; rank.textContent = i + 1;
      const name = document.createElement('span'); name.className = 'lb-name'; name.textContent = e ? e.nick : '- - -';
      if (e && e.hints > 0) {
        const b = document.createElement('span'); b.className = 'lb-hint'; b.textContent = 'HINT'; name.appendChild(b);
      }
      const time = document.createElement('span'); time.className = 'lb-time';
      time.textContent = e ? CTV.boardStat(e) : '';
      row.append(rank, name, time);
      el.appendChild(row);
    }
  };

  /* "Want to do this for real?" block shown after every round. The QR code only
     appears once staff paste a sign-up link into the settings. */
  CTV.paintRecruit = function (el, url) {
    if (!el) return;
    const key = url || '-';
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    el.textContent = '';
    const txt = document.createElement('div');
    txt.className = 'recruit-txt';
    const b = document.createElement('b');
    b.textContent = 'Want to do this for real?';
    const s = document.createElement('span');
    s.textContent = url
      ? 'Our SATEC program and CyberPatriot team defend real computers from attackers. Scan to find out how to join.'
      : 'Our SATEC program and CyberPatriot team defend real computers from attackers. Ask anyone at the booth how to join!';
    txt.append(b, s);
    el.appendChild(txt);
    if (url && CTV.qrSvg) {
      const q = document.createElement('div');
      q.className = 'recruit-qr';
      try { q.innerHTML = CTV.qrSvg(url); el.appendChild(q); } catch (e) { /* link too long for the QR size */ }
    }
  };

  CTV.renderBoard = function (el, count, freshId, tier) {
    CTV.drawRows(el, CTV.Store.board(tier).slice(0, count), count, freshId);
  };
})();
