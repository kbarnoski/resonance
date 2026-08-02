// ─────────────────────────────────────────────────────────────────────────────
// 5096 — Theurgy · audio.ts
// A self-contained Web Audio instrument the hands conduct in real time.
//
//   • An additive drone: 6 partials over a low root. Finger OPENNESS widens the
//     partial spread (harmonic -> stretched/inharmonic shimmer) and opens a
//     resonant lowpass — closed fist = dark sub, open spread hands = bright wall.
//   • ENERGY (hands present + pinch) raises the master level and filter Q.
//   • A PINCH fires a shimmer/bloom: a bell-like high partial burst sent through
//     a long convolution reverb tail.
//
// Everything ramps with setTargetAtTime so gestures glide, and dispose() tears
// the whole graph down cleanly.
// ─────────────────────────────────────────────────────────────────────────────

export interface TheurgyAudio {
  ctx: AudioContext;
  /** Finger openness 0..1 -> partial spread + filter cutoff. */
  setOpenness: (o: number) => void;
  /** Overall energy 0..1 -> master level + resonance. */
  setEnergy: (e: number) => void;
  /** Fire a shimmer bloom (edge-triggered by a pinch). */
  shimmer: (bright: number) => void;
  dispose: () => void;
}

const ROOT = 55; // A1
const RATIOS = [1, 2, 3, 4, 5, 6];

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function makeTheurgyAudio(ctx: AudioContext): TheurgyAudio {
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 1.5);
  master.connect(ctx.destination);

  // shared reverb bloom
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 3.8, 2.6);
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  conv.connect(wet).connect(master);

  // resonant lowpass the whole drone runs through
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 300;
  lp.Q.value = 2;
  const dry = ctx.createGain();
  dry.gain.value = 0.8;
  lp.connect(dry).connect(master);
  lp.connect(conv);

  // additive partials — two detuned voices each for a slow chorus
  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  for (let i = 0; i < RATIOS.length; i++) {
    for (const cents of [-5, 5]) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = ROOT * RATIOS[i];
      osc.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = (0.4 / RATIOS[i]) * 0.6;
      osc.connect(g).connect(lp);
      osc.start();
      oscs.push(osc);
      gains.push(g);
    }
  }

  let disposed = false;

  const setOpenness = (o: number) => {
    if (disposed) return;
    const open = Math.min(1, Math.max(0, o));
    const now = ctx.currentTime;
    // cutoff opens with openness
    const cutoff = 220 * Math.pow(18, open); // ~220 Hz -> ~4 kHz
    lp.frequency.setTargetAtTime(cutoff, now, 0.12);
    // partial spread: stretch the series apart as hands open
    for (let i = 0; i < RATIOS.length; i++) {
      const stretch = 1 + open * 0.04 * i; // inharmonic drift on higher partials
      const f = ROOT * RATIOS[i] * stretch;
      oscs[i * 2].frequency.setTargetAtTime(f, now, 0.1);
      oscs[i * 2 + 1].frequency.setTargetAtTime(f, now, 0.1);
      // higher partials swell as hands open
      const lvl = (0.4 / RATIOS[i]) * (0.35 + open * 0.65);
      gains[i * 2].gain.setTargetAtTime(lvl, now, 0.12);
      gains[i * 2 + 1].gain.setTargetAtTime(lvl, now, 0.12);
    }
  };

  const setEnergy = (e: number) => {
    if (disposed) return;
    const en = Math.min(1, Math.max(0, e));
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(0.16 + en * 0.34, now, 0.2);
    lp.Q.setTargetAtTime(2 + en * 9, now, 0.2);
  };

  const shimmer = (bright: number) => {
    if (disposed) return;
    const now = ctx.currentTime;
    const b = Math.min(1, Math.max(0, bright));
    // a short bell cluster high above the root, sent mostly to reverb
    const bloom = ctx.createGain();
    bloom.gain.value = 0.0001;
    bloom.connect(conv);
    bloom.connect(master);
    const partials = [8, 10, 12, 15];
    const oscsB: OscillatorNode[] = [];
    for (const p of partials) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = ROOT * p * (1 + b * 0.02);
      const g = ctx.createGain();
      g.gain.value = 0.25 / p;
      o.connect(g).connect(bloom);
      o.start(now);
      oscsB.push(o);
    }
    bloom.gain.setValueAtTime(0.0001, now);
    bloom.gain.exponentialRampToValueAtTime(0.22 + b * 0.2, now + 0.015);
    bloom.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    oscsB.forEach((o) => o.stop(now + 1.7));
  };

  return {
    ctx,
    setOpenness,
    setEnergy,
    shimmer,
    dispose() {
      if (disposed) return;
      disposed = true;
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      } catch {
        /* ctx closing */
      }
      setTimeout(() => {
        oscs.forEach((o) => {
          try {
            o.stop();
          } catch {
            /* noop */
          }
        });
        try {
          ctx.close();
        } catch {
          /* noop */
        }
      }, 500);
    },
  };
}
