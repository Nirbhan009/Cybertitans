/* Small QR code maker (byte mode, medium error correction, versions 1-6), so the
   join code needs no outside library. CTV.qrSvg(text) returns an SVG string. */
(function () {
  const CTV = window.CTV = window.CTV || {};

  const TABLE = [null,
    { ec: 10, blocks: [16] }, { ec: 16, blocks: [28] }, { ec: 26, blocks: [44] },
    { ec: 18, blocks: [32, 32] }, { ec: 24, blocks: [43, 43] }, { ec: 16, blocks: [27, 27, 27, 27] }];
  const ALIGN = [null, null, 18, 22, 26, 30, 34];

  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1; if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  function rs(data, n) {
    let gen = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(gen.length + 1).fill(0);
      gen.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); });
      gen = next;
    }
    const out = new Array(n).fill(0);
    data.forEach(b => {
      const f = b ^ out.shift();
      out.push(0);
      for (let i = 0; i < n; i++) out[i] ^= mul(gen[i + 1], f);
    });
    return out;
  }

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 1;
    while (ver <= 6 && TABLE[ver].blocks.reduce((a, b) => a + b, 0) - 2 < bytes.length) ver++;
    if (ver > 6) throw new Error('text too long for QR');
    const { ec, blocks } = TABLE[ver];
    const capacity = blocks.reduce((a, b) => a + b, 0);

    const bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, 8);
    bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, capacity * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);

    const dataBlocks = [];
    let at = 0;
    blocks.forEach(len => { dataBlocks.push(data.slice(at, at + len)); at += len; });
    const ecBlocks = dataBlocks.map(b => rs(b, ec));
    const stream = [];
    for (let i = 0; i < Math.max(...blocks); i++) dataBlocks.forEach(b => { if (i < b.length) stream.push(b[i]); });
    for (let i = 0; i < ec; i++) ecBlocks.forEach(b => stream.push(b[i]));

    const size = ver * 4 + 17;
    const base = Array.from({ length: size }, () => new Array(size).fill(false));
    const func = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, v) => { base[y][x] = v; func[y][x] = true; };

    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (ALIGN[ver]) {
      const c = ALIGN[ver];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const format = (grid, mask) => {
      let rem = mask;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const f = ((mask << 10) | rem) ^ 0x5412;
      const b = i => ((f >>> i) & 1) === 1;
      const w = (x, y, v) => { grid[y][x] = v; func[y][x] = true; };
      for (let i = 0; i <= 5; i++) w(8, i, b(i));
      w(8, 7, b(6)); w(8, 8, b(7)); w(7, 8, b(8));
      for (let i = 9; i < 15; i++) w(14 - i, 8, b(i));
      for (let i = 0; i < 8; i++) w(size - 1 - i, 8, b(i));
      for (let i = 8; i < 15; i++) w(8, size - 15 + i, b(i));
      w(8, size - 8, true);
    };
    format(base, 0);

    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const up = ((right + 1) & 2) === 0;
          const y = up ? size - 1 - vert : vert;
          if (!func[y][x] && i < stream.length * 8) {
            base[y][x] = ((stream[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
      }
    }

    const MASK = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0
    ];
    function penalty(g) {
      let score = 0, dark = 0;
      for (let a = 0; a < size; a++) {
        let runH = 1, runV = 1;
        for (let b = 0; b < size; b++) {
          if (g[a][b]) dark++;
          if (b > 0) {
            if (g[a][b] === g[a][b - 1]) { if (++runH === 5) score += 3; else if (runH > 5) score++; } else runH = 1;
            if (g[b][a] === g[b - 1][a]) { if (++runV === 5) score += 3; else if (runV > 5) score++; } else runV = 1;
          }
          if (a > 0 && b > 0 && g[a][b] === g[a - 1][b] && g[a][b] === g[a][b - 1] && g[a][b] === g[a - 1][b - 1]) score += 3;
        }
      }
      return score + Math.floor(Math.abs(dark * 20 / (size * size) - 10)) * 10;
    }
    let best = null, bestScore = Infinity;
    MASK.forEach((fn, m) => {
      const g = base.map(r => r.slice());
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!func[y][x] && fn(x, y)) g[y][x] = !g[y][x];
      format(g, m);
      const s = penalty(g);
      if (s < bestScore) { bestScore = s; best = g; }
    });
    return best;
  }

  CTV.qrMatrix = encode;
  CTV.qrSvg = function (text) {
    const g = encode(text), size = g.length, q = 4;
    let d = '';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (g[y][x]) d += `M${x + q} ${y + q}h1v1h-1z`;
    return `<svg viewBox="0 0 ${size + q * 2} ${size + q * 2}" shape-rendering="crispEdges" role="img" aria-label="QR code to join the game"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  };
})();
