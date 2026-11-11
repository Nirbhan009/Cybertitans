/* The Hacker Card: a 1080x1350 image players save and share. Drawn on a canvas,
   so it needs no internet and no image files. */
(function () {
  const CTV = window.CTV = window.CTV || {};
  const SANS = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  const MONO = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';

  function fit(g, text, weight, max, width, family) {
    let size = max;
    do { g.font = `${weight} ${size}px ${family}`; size -= 4; } while (g.measureText(text).width > width && size > 30);
  }

  /* info: { mode, name, stat, statLabel, line, date, accent } */
  CTV.hackerCard = function (info) {
    const W = 1080, H = 1350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const accent = info.accent || '#19e6ff';

    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#02070b'); bg.addColorStop(1, '#0a1c24');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    g.strokeStyle = 'rgba(25,230,255,0.07)'; g.lineWidth = 1;
    for (let x = 0; x <= W; x += 54) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y <= H; y += 54) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

    g.font = `28px ${MONO}`;
    g.fillStyle = 'rgba(57,255,122,0.18)';
    for (let i = 0; i < 46; i++) g.fillText(Math.random().toString(16).slice(2, 4).toUpperCase(), (i * 197) % W, 60 + (i * 131) % (H - 80));

    const cx = 885, cy = 250;
    [168, 142, 96, 66].forEach((r, i) => {
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
      g.strokeStyle = i % 2 ? 'rgba(25,230,255,0.35)' : accent; g.lineWidth = i === 0 ? 9 : 4; g.stroke();
    });
    for (let i = 0; i < 30; i++) {
      const a = i * Math.PI / 15;
      g.beginPath(); g.arc(cx + Math.cos(a) * 155, cy + Math.sin(a) * 155, 5, 0, Math.PI * 2);
      g.fillStyle = 'rgba(200,240,255,0.5)'; g.fill();
    }
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 - Math.PI / 2;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 64, cy + Math.sin(a) * 64);
      g.strokeStyle = '#c8d6e0'; g.lineWidth = 10; g.stroke();
    }
    g.beginPath(); g.arc(cx, cy, 16, 0, Math.PI * 2); g.fillStyle = '#ff2d4a'; g.fill();

    g.fillStyle = accent;
    g.font = `700 34px ${SANS}`;
    g.fillText('SATEC  x  CYBERPATRIOT', 80, 120);
    g.fillStyle = '#eaffff';
    g.font = `900 104px ${SANS}`;
    g.fillText('CRACK', 76, 250);
    g.fillText('THE VAULT', 76, 360);

    g.fillStyle = accent;
    g.fillRect(80, 470, 8, 300);
    g.font = `800 40px ${SANS}`;
    g.fillText(info.mode, 112, 520);
    g.fillStyle = '#ffffff';
    fit(g, info.name, 900, 150, W - 190, SANS);
    g.fillText(info.name, 108, 660);
    g.fillStyle = '#9fb8c2';
    g.font = `600 38px ${SANS}`;
    g.fillText('AGENT', 112, 740);

    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(80, 830, W - 160, 300);
    g.strokeStyle = accent; g.lineWidth = 3; g.strokeRect(80, 830, W - 160, 300);
    g.fillStyle = '#9fb8c2';
    g.font = `700 34px ${SANS}`;
    g.fillText(info.statLabel, 120, 895);
    g.fillStyle = accent;
    fit(g, info.stat, 800, 150, W - 240, MONO);
    g.fillText(info.stat, 116, 1040);
    g.fillStyle = '#ffd166';
    g.font = `700 38px ${SANS}`;
    g.fillText(info.line || '', 120, 1100);

    g.fillStyle = '#6f8b96';
    g.font = `600 30px ${SANS}`;
    g.fillText(`Grade 8 Night  /  ${info.date}`, 80, 1240);
    g.fillText('Cracked at the SATEC x CyberPatriot booth', 80, 1285);
    return c.toDataURL('image/png');
  };
})();
