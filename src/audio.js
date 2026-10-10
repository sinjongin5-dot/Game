// ================= AUDIO · PATCH v4 : each chapter sounds like its own place =================
// The exploration music is one theme for the whole game. Every chapter now plays it in its own key and adds a small rhythm bed of its own
// (dripping pipes, a clock ticking, press stomps, a flywheel whoosh, static crackle, furnace rumble, a heartbeat). Boss music is untouched.
(() => {
  'use strict';
  const WA = window.GH_WORLD_AUDIO; if (!WA || typeof AudioEngine === 'undefined') return;
  const SHIFT = { blue: 0, pipes: -2, brass: 3, cam: -5, fly: 5, arc: 7, furnace: -7, heart: -12 };
  const _tone = AudioEngine.prototype.toneAt;
  AudioEngine.prototype.toneAt = function (t, f, dur, type, vol, f2, dest, lp) {
    if (this._ps && this._psr !== 1) { f *= this._psr; if (f2) f2 *= this._psr; if (lp) lp *= Math.min(1.6, this._psr); }
    return _tone.call(this, t, f, dur, type, vol, f2, dest, lp);
  };
  function bed(a, th, i, bar, t) {
    const M = a.music, tone = (f, d, ty, v, f2, lp) => a.toneAt(t, f, d, ty, v, f2, M, lp), noise = (d, ft, fr, v, q, f2) => a.noiseAt(t, d, ft, fr, v, q, f2, M);
    switch (th) {
      case 'blue': if (i === 8 && bar % 2 === 0) noise(.9, 'bandpass', 600, .012, .5, 280); break;
      case 'pipes': if (i % 4 === 2 && Math.random() < .5) tone(1700 + Math.random() * 1000, .07, 'sine', .014); if (i === 0 && bar % 2 === 0) noise(.5, 'highpass', 3000, .008, .7, 6000); break;
      case 'brass': if (i % 2 === 0) tone(i % 4 === 0 ? 2300 : 1850, .025, 'square', .009, null, 3200); break;
      case 'cam': if (i === 0 || i === 8) { tone(70, .15, 'sine', .08, 40); noise(.1, 'lowpass', 600, .05, 1); } if (i === 4 || i === 12) noise(.04, 'highpass', 5000, .014, 1); break;
      case 'fly': if (i % 8 === 0) noise(.5, 'bandpass', 700 + bar * 70, .014, .7, 2400); break;
      case 'arc': if (i === 0) tone(60, .5, 'sawtooth', .01, null, 300); if (i % 2 === 1 && Math.random() < .35) tone(2400 + Math.random() * 2200, .04, 'square', .009, null, 5200); break;
      case 'furnace': if (i === 0) noise(.7, 'lowpass', 170, .07, 1); if (i === 10 && Math.random() < .5) noise(.12, 'highpass', 4000, .02, 1); break;
      case 'heart': if (i === 0 || i === 3) tone(55, .2, 'sine', .11, 38); break;
    }
  }
  const _ps = WA.playStep;
  WA.playStep = function (a, s, t) {
    const g = window.game, th = g && g.state === 'play' && g.level && g.level.def && g.level.def.theme, sh = th && !g.bossActive ? (SHIFT[th] || 0) : 0;
    a._ps = true; a._psr = Math.pow(2, sh / 12);
    try { _ps.call(this, a, s, t); } finally { a._ps = false; }
    if (th && !g.bossActive && a.ctx && a.music) { try { bed(a, th, s % 16, Math.floor(s / 16) % 8, t); } catch (e) { /* audio decoration only */ } }
  };
})();
