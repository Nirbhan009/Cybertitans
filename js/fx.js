/* Matrix rain background and confetti. */
(function () {
  const CTV = window.CTV = window.CTV || {};

  const GLYPHS = '0123456789ABCDEF<>/\\{}[]#$%&*';

  function Matrix(canvas) {
    const g = canvas.getContext('2d');
    let drops = [], size = 18, timer = null;
    function resize() {
      canvas.width = innerWidth; canvas.height = innerHeight;
      size = Math.max(14, Math.round(innerHeight / 46));
      const cols = Math.ceil(innerWidth / size);
      drops = Array.from({ length: cols }, () => Math.random() * -innerHeight / size);
      g.fillStyle = '#03070a'; g.fillRect(0, 0, canvas.width, canvas.height);
    }
    function draw() {
      g.fillStyle = 'rgba(3,7,10,0.11)';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.font = `${size}px Consolas, "Courier New", monospace`;
      drops.forEach((y, i) => {
        const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        g.fillStyle = Math.random() < 0.06 ? '#c8fbff' : (i % 5 === 0 ? '#0fa6bd' : '#0f7f4d');
        g.fillText(ch, i * size, y * size);
        drops[i] = y * size > canvas.height && Math.random() > 0.97 ? 0 : y + 1;
      });
    }
    window.addEventListener('resize', resize);
    resize();
    return {
      on() { if (!timer) { canvas.style.display = 'block'; timer = setInterval(draw, 55); } },
      off() { clearInterval(timer); timer = null; canvas.style.display = 'none'; }
    };
  }

  function Confetti(canvas) {
    const g = canvas.getContext('2d');
    const COLORS = ['#19e6ff', '#ff2d4a', '#ffd166', '#39ff7a', '#ffffff'];
    let parts = [], raf = null, until = 0;

    function spawn(n) {
      for (let i = 0; i < n; i++) {
        parts.push({
          x: Math.random() * canvas.width, y: -20 - Math.random() * 120,
          vx: -2.5 + Math.random() * 5, vy: 3 + Math.random() * 5,
          s: 6 + Math.random() * 9, r: Math.random() * 6, vr: -0.25 + Math.random() * 0.5,
          c: COLORS[Math.floor(Math.random() * COLORS.length)]
        });
      }
    }
    function frame() {
      g.clearRect(0, 0, canvas.width, canvas.height);
      if (performance.now() < until && parts.length < 420) spawn(7);
      parts = parts.filter(p => p.y < canvas.height + 30);
      parts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save();
        g.translate(p.x, p.y); g.rotate(p.r);
        g.fillStyle = p.c;
        g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        g.restore();
      });
      if (parts.length || performance.now() < until) raf = requestAnimationFrame(frame);
      else { raf = null; canvas.style.display = 'none'; }
    }
    return {
      start(ms) {
        canvas.width = innerWidth; canvas.height = innerHeight;
        canvas.style.display = 'block';
        until = performance.now() + ms;
        if (!raf) raf = requestAnimationFrame(frame);
      },
      stop() {
        until = 0; parts = [];
        if (raf) cancelAnimationFrame(raf);
        raf = null;
        g.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = 'none';
      }
    };
  }

  CTV.FX = { Matrix, Confetti };
})();
