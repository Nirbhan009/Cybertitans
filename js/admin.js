/* Staff panel. Talks to the game only through CTV.Game. */
(function () {
  const CTV = window.CTV = window.CTV || {};
  const S = CTV.Store;
  const $ = id => document.getElementById(id);
  const G = () => CTV.Game;

  let open = false, unlocked = false, fails = 0, lockedUntil = 0, statusTimer = null, revealed = false;

  function confirmBox(message, buttons) {
    return new Promise(resolve => {
      const box = $('confirm');
      $('confirm-msg').textContent = message;
      const row = $('confirm-btns');
      row.textContent = '';
      const finish = v => { box.hidden = true; resolve(v); };
      buttons.forEach(b => {
        const el = document.createElement('button');
        el.type = 'button';
        el.textContent = b.label;
        if (b.cls) el.className = b.cls;
        el.onclick = () => finish(b.value);
        row.appendChild(el);
      });
      const cancel = document.createElement('button');
      cancel.type = 'button'; cancel.textContent = 'Cancel';
      cancel.onclick = () => finish(null);
      row.appendChild(cancel);
      box.hidden = false;
    });
  }

  function flash(msg, bad) {
    const el = $('admin-msg');
    el.textContent = msg;
    el.className = 'admin-msg' + (bad ? ' bad' : '');
  }

  function renderPrices() {
    const s = S.settings();
    $('btn-start').textContent = `Start Round (${CTV.money(s.priceRound)})`;
    $('btn-pack').textContent = `Start 3-Pack (${CTV.money(s.pricePack)}, 3 rounds)`;
    $('btn-hint').textContent = `Unlock Hint (${CTV.money(s.priceHint)})`;
  }

  function renderStats() {
    const st = S.stats();
    $('s-attempts').textContent = st.attempts;
    $('s-hints').textContent = st.hints;
    $('s-money').textContent = CTV.money(st.money);
    $('s-cracked').textContent = st.cracked;
    const list = $('sales');
    list.textContent = '';
    S.ledger().slice(-6).reverse().forEach(sale => {
      const row = document.createElement('div');
      const label = { round: 'Round', pack: '3-Pack', hard: 'Hard', hint: 'Hint', scam: 'Scam Spotter', duel: 'Duel', void: 'VOID' }[sale.type] || sale.type;
      const time = new Date(sale.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      row.textContent = `${time}  ${label}${sale.voided ? ' (voided)' : ''}`;
      const amt = document.createElement('b');
      amt.textContent = (sale.amount < 0 ? '-' : '') + CTV.money(Math.abs(sale.amount));
      row.appendChild(amt);
      list.appendChild(row);
    });
    if (!list.childElementCount) list.textContent = 'No sales yet.';
  }

  function renderBoard() {
    const el = $('admin-board');
    el.textContent = '';
    const rows = S.board('hard').slice(0, 10).concat(S.board('easy').slice(0, 10), S.board('scam').slice(0, 10));
    rows.forEach(e => {
      const row = document.createElement('div');
      row.className = 'ab-row';
      const label = document.createElement('span');
      label.textContent = `${{ hard: 'HARD', scam: 'SCAM' }[e.tier] || 'EASY'} ${e.nick}${e.hints ? ' (hint)' : ''}`;
      const time = document.createElement('b');
      time.textContent = CTV.boardStat(e);
      const del = document.createElement('button');
      del.type = 'button'; del.textContent = 'Remove'; del.className = 'tiny';
      del.onclick = async () => {
        if (await confirmBox(`Remove "${e.nick}" from the leaderboard?`, [{ label: 'Remove', value: true, cls: 'danger' }])) {
          S.removeWin(e.id);
          renderBoard();
        }
      };
      row.append(label, time, del);
      el.appendChild(row);
    });
    if (!rows.length) el.textContent = 'No cracks yet.';
  }

  function renderHard() {
    const el = $('hard-list');
    el.textContent = '';
    const rows = S.recentEasy();
    rows.forEach(e => {
      const row = document.createElement('div');
      row.className = 'hard-row';
      const who = document.createElement('span');
      who.textContent = e.nick;
      const detail = document.createElement('small');
      detail.textContent = e.cracked ? `Cracked Easy in ${CTV.fmtTime(e.ms)}` : 'Did not crack Easy';
      who.appendChild(detail);
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `Start Hard (${CTV.money(S.hardPriceFor(e))})`;
      b.className = S.isFast(e) ? 'primary' : '';
      b.onclick = () => {
        const idle = G().sellHard(e.id);
        renderAll();
        if (idle) hide(); else flash('Added to the queue. It starts when this round ends.');
      };
      row.append(who, b);
      el.appendChild(row);
    });
    if (!rows.length) el.textContent = 'Nobody has finished Easy yet.';
  }

  function renderStatus() {
    const st = G().status();
    const line = $('round-status');
    const canReset = !!st.phase;
    let text = 'Idle, attract screen showing.';
    if (st.phase === 'name') text = 'Waiting for nickname.';
    if (st.phase === 'brief') text = `${st.nick} is reading the briefing.`;
    if (st.phase === 'play') {
      text = `${st.nick}: ${st.leftText} left, ${st.solved}/4 digits, ${st.wrong}/${st.maxWrong} wrong codes, ${st.hints} hints.`;
    }
    if (st.phase === 'won') text = `${st.nick} cracked the vault.`;
    if (st.phase === 'lost') text = `${st.nick}'s round is over.`;
    if (st.test) text += ' [FREE TEST]';
    if (st.dq) text += ' [CODE REVEALED, not on leaderboard]';
    line.textContent = text;
    $('queue-status').textContent = st.queued ? `${st.queued} paid attempt${st.queued > 1 ? 's' : ''} queued next.` : '';
    $('btn-hint').disabled = !st.canHint;
    $('btn-reset').disabled = !canReset;
    $('btn-reveal').disabled = !st.hasCode;
    if (!st.hasCode) { $('reveal-out').textContent = ''; revealed = false; }
  }

  function renderAll() {
    renderPrices(); renderStats(); renderBoard(); renderHard(); renderStatus();
    const s = S.settings();
    $('set-threshold').value = s.thresholdSec;
    $('set-hard-fast').value = s.hardPriceFast;
    $('set-hard-full').value = s.hardPriceFull;
    $('set-hard-timer').value = s.hardTimerSec;
    $('set-hard-tries').value = s.hardWrongTries;
    $('set-scam-price').value = s.scamPrice;
    $('set-scam-timer').value = s.scamTimerSec;
    $('set-signup').value = s.signupUrl || '';
    $('set-timer').value = s.timerSec;
    $('set-round').value = s.priceRound;
    $('set-pack').value = s.pricePack;
    $('set-hint').value = s.priceHint;
    $('set-tries').value = s.wrongTries;
    $('pin-warn').hidden = !S.pinIsDefault();
  }

  function show() {
    open = true; unlocked = false; revealed = false;
    $('admin').hidden = false;
    $('admin-lock').hidden = false;
    $('admin-main').hidden = true;
    $('confirm').hidden = true;
    $('pin').value = '';
    $('pin-msg').textContent = '';
    $('pin').focus();
  }

  function hide() {
    open = false; unlocked = false;
    $('admin').hidden = true;
    $('reveal-out').textContent = '';
    clearInterval(statusTimer);
  }

  function tryPin() {
    const now = Date.now();
    if (now < lockedUntil) {
      $('pin-msg').textContent = `Locked. Try again in ${Math.ceil((lockedUntil - now) / 1000)} seconds.`;
      return;
    }
    if (S.checkPin($('pin').value)) {
      fails = 0; unlocked = true;
      $('admin-lock').hidden = true;
      $('admin-main').hidden = false;
      flash('');
      renderAll();
      statusTimer = setInterval(renderStatus, 400);
      return;
    }
    fails++;
    $('pin').value = '';
    if (fails >= 5) { lockedUntil = now + 30000; fails = 0; $('pin-msg').textContent = 'Too many tries. Locked for 30 seconds.'; }
    else $('pin-msg').textContent = 'Wrong PIN.';
  }

  function num(id, min, max) {
    const v = Number($(id).value);
    return Number.isFinite(v) && v >= min && v <= max ? v : null;
  }

  function saveSettings() {
    const timerSec = num('set-timer', 30, 1800), priceRound = num('set-round', 0, 100),
      pricePack = num('set-pack', 0, 100), priceHint = num('set-hint', 0, 100), wrongTries = num('set-tries', 1, 9);
    const thresholdSec = num('set-threshold', 10, 1800), hardPriceFast = num('set-hard-fast', 0, 100),
      hardPriceFull = num('set-hard-full', 0, 100), hardTimerSec = num('set-hard-timer', 30, 1800), hardWrongTries = num('set-hard-tries', 1, 9);
    if ([timerSec, priceRound, pricePack, priceHint, wrongTries, thresholdSec, hardPriceFast, hardPriceFull, hardTimerSec, hardWrongTries].includes(null) ||
      !Number.isInteger(wrongTries) || !Number.isInteger(hardWrongTries)) {
      flash('Check settings: times 30 to 1800 seconds, fast finish from 10, prices 0 to 100, tries 1 to 9.', true);
      return;
    }
    const scamPrice = num('set-scam-price', 0, 100), scamTimerSec = num('set-scam-timer', 30, 600);
    const signupUrl = $('set-signup').value.trim();
    if (scamPrice === null || scamTimerSec === null) { flash('Check Scam Spotter settings: price 0 to 100, timer 30 to 600 seconds.', true); return; }
    if (signupUrl && !/^https?:\/\/\S+$/i.test(signupUrl)) { flash('The join link must start with https://', true); return; }
    if (signupUrl.length > 100) { flash('That link is too long for a QR code. Use a short link (under 100 characters).', true); return; }
    S.saveSettings({
      timerSec: Math.round(timerSec), priceRound, pricePack, priceHint, wrongTries,
      thresholdSec: Math.round(thresholdSec), hardPriceFast, hardPriceFull, hardTimerSec: Math.round(hardTimerSec), hardWrongTries,
      scamPrice, scamTimerSec: Math.round(scamTimerSec), signupUrl
    });
    renderPrices();
    renderHard();
    if (G().refreshPrices) G().refreshPrices();
    flash('Settings saved. Timer and tries apply from the next round.');
  }

  function changePin() {
    const v = $('new-pin').value.trim();
    if (!/^\d{4,8}$/.test(v)) { flash('PIN must be 4 to 8 digits.', true); return; }
    S.saveSettings({ pinHash: S.hashPin(v) });
    $('new-pin').value = '';
    $('pin-warn').hidden = true;
    flash('PIN changed.');
  }

  function exportCSV() {
    const blob = new Blob(['﻿' + S.toCSV()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    a.href = url;
    a.download = `crack-the-vault-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    flash('CSV saved to your Downloads folder.');
  }

  async function resetRound() {
    const st = G().status();
    if (!st.phase) return;
    if (st.phase === 'won' || st.phase === 'lost') { G().continueOn(); hide(); return; }
    if (st.test) {
      if (await confirmBox('End this free test round?', [{ label: 'End test', value: 'end', cls: 'danger' }])) { G().reset('end'); hide(); }
      return;
    }
    const sale = S.getSale(st.saleId);
    const isPack = sale && sale.type === 'pack';
    const amount = sale ? CTV.money(sale.amount) : '';
    const choice = await confirmBox(
      'Free replay: same player gets a fresh attempt, money unchanged (use for a glitch). ' +
      `Void sale: cancels the sale and takes off ${amount}${isPack ? ' for the whole 3-pack' : ''} (use for a mis-click or refund).`,
      [{ label: 'Free replay', value: 'replay', cls: 'primary' }, { label: `Void sale (-${amount})`, value: 'void', cls: 'danger' }]
    );
    if (!choice) return;
    G().reset(choice);
    hide();
  }

  async function reveal() {
    if (revealed) return;
    const ok = await confirmBox('Show the code? This round will not count on the leaderboard or as a crack.',
      [{ label: 'Reveal code', value: true, cls: 'danger' }]);
    if (!ok) return;
    const code = G().reveal();
    if (code) { revealed = true; $('reveal-out').textContent = `CODE: ${code}`; renderStatus(); }
  }

  function bind() {
    $('pin-go').onclick = tryPin;
    $('pin').addEventListener('keydown', e => { if (e.key === 'Enter') tryPin(); });
    $('admin-close').onclick = hide;
    $('pin-cancel').onclick = hide;

    const sell = fn => () => { const idle = fn(); renderAll(); if (idle) hide(); else flash('Added to the queue. It starts when this round ends.'); };
    $('btn-start').onclick = sell(() => G().sellRound());
    $('btn-pack').onclick = sell(() => G().sellPack());
    $('btn-test').onclick = sell(() => G().startTest('easy'));
    $('btn-test-hard').onclick = sell(() => G().startTest('hard'));
    document.querySelectorAll('.admin-tabs button').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('.admin-tabs button').forEach(x => x.classList.toggle('on', x === b));
        document.querySelectorAll('[data-tab-body]').forEach(s => { s.hidden = s.dataset.tabBody !== b.dataset.tab; });
      };
    });
    if (S.isServer()) CTV.PhoneQueue.mount($('phones'), { onChange: () => { if (unlocked) renderStats(); } });
    else $('phones').textContent = 'Phones need the server. Close this and start the game with START.bat.';
    $('btn-hint').onclick = () => {
      const r = G().unlockHint();
      flash(r ? 'Hint sent to the terminal and recorded as a sale.' : 'No hint available right now.', !r);
      renderStats();
    };
    $('btn-reset').onclick = resetRound;
    $('btn-reveal').onclick = reveal;
    $('btn-save').onclick = saveSettings;
    $('btn-pin').onclick = changePin;
    $('btn-export').onclick = exportCSV;
    $('btn-reset-board').onclick = async () => {
      if (await confirmBox('Erase the whole leaderboard? This cannot be undone. Export a CSV first if you want a copy.',
        [{ label: 'Erase leaderboard', value: true, cls: 'danger' }])) { S.resetBoard(); renderBoard(); flash('Leaderboard erased.'); }
    };
    $('btn-reset-sales').onclick = async () => {
      if (await confirmBox('Erase all sales and round history? Use this after testing, before the event. This cannot be undone.',
        [{ label: 'Erase sales', value: true, cls: 'danger' }])) { S.resetSales(); renderStats(); flash('Sales erased.'); }
    };
    S.onChange(() => { if (open && unlocked) { renderStats(); renderBoard(); renderHard(); } });
  }

  CTV.Admin = {
    init: bind,
    isOpen: () => open,
    toggle() { if (open) hide(); else show(); },
    close: hide
  };
})();
