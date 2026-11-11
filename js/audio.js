/* All sound is synthesized. Chrome only allows audio after a click or key press,
   so the context is created on the first gesture and earlier sounds are skipped. */
(function () {
  const CTV = window.CTV = window.CTV || {};
  let ctx = null, master = null;
  let muted = false;
  try { muted = localStorage.getItem('ctv.mute') === '1'; } catch (e) { /* default to sound on */ }

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  function tone(freq, dur, type, vol, delay, slideTo) {
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, cutoff, delay) {
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff || 800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  CTV.Audio = {
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('ctv.mute', muted ? '1' : '0'); } catch (e) { /* session only */ }
      if (master) master.gain.value = muted ? 0 : 0.55;
      return muted;
    },
    click() { tone(1050, 0.03, 'square', 0.07); },
    jam() { tone(240, 0.28, 'sawtooth', 0.22, 0, 110); tone(240, 0.28, 'sawtooth', 0.22, 0.3, 110); },
    key() { tone(1250, 0.05, 'square', 0.1); noise(0.03, 0.06, 2500); },
    bad() { tone(170, 0.2, 'sawtooth', 0.16); },
    solve() { [660, 880, 1175, 1568].forEach((f, i) => tone(f, 0.16, 'square', 0.13, i * 0.07)); },
    hint() { tone(740, 0.12, 'triangle', 0.2); tone(1110, 0.2, 'triangle', 0.2, 0.1); },
    tick(urgent) { tone(urgent ? 1500 : 1000, 0.05, 'square', urgent ? 0.14 : 0.09); },
    alarm() {
      for (let i = 0; i < 3; i++) {
        tone(520, 0.2, 'sawtooth', 0.26, i * 0.4, 960);
        tone(960, 0.2, 'sawtooth', 0.26, i * 0.4 + 0.2, 520);
      }
    },
    start() { tone(180, 0.35, 'sawtooth', 0.16, 0, 880); tone(1320, 0.2, 'square', 0.1, 0.32); },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.38, 'sawtooth', 0.2, i * 0.3));
      noise(1.5, 0.15, 300, 1.1);
    },
    door() {
      for (let i = 0; i < 9; i++) tone(1500 - i * 80, 0.04, 'square', 0.1, i * 0.12);
      noise(0.28, 0.5, 900, 1.15);
      tone(70, 0.3, 'sine', 0.5, 1.15);
      noise(2, 0.32, 240, 1.5);
      tone(48, 2, 'sawtooth', 0.14, 1.5, 96);
    },
    win() {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
        tone(f, 0.24, 'square', 0.13, 2.8 + i * 0.14);
        tone(f / 2, 0.24, 'triangle', 0.17, 2.8 + i * 0.14);
      });
    }
  };
})();
