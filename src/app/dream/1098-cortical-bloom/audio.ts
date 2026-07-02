// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — a just-intonation drone/pad driven by the neural field's own
// statistics, so the sound IS the pattern, not a soundtrack over it.
//
//   mean activity  → overall drive (level + filter opening)
//   pattern energy → pad body / higher-partial weight
//   gradient density → brightness (denser/finer pattern → brighter timbre)
//   a slow rotating stereo pan gives the "spiral shimmer" (spiralness rises with
//     the balance / density), meditative but never harsh — everything runs into
//     a soft tanh limiter on the bus.
//
// A tap seeds a new nucleus visually and blooms an audible swell here.
// ─────────────────────────────────────────────────────────────────────────────

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

const PARTIALS: { ratio: number; type: OscillatorType; level: number }[] = [
  { ratio: 1, type: "sine", level: 0.9 },
  { ratio: 3 / 2, type: "sine", level: 0.5 },
  { ratio: 2, type: "triangle", level: 0.4 },
  { ratio: 5 / 2, type: "triangle", level: 0.26 },
  { ratio: 3, type: "triangle", level: 0.2 },
  { ratio: 15 / 4, type: "sine", level: 0.14 },
];

function tanhCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

export interface FieldAudio {
  resume(): Promise<void>;
  running(): boolean;
  setStats(mean: number, energy: number, density: number, spiral: number): void;
  bloom(intensity: number): void;
  dispose(): void;
}

export function makeFieldAudio(root = 65.41): FieldAudio {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();

  // master bus → soft limiter → destination
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  const limiter = ctx.createWaveShaper();
  limiter.curve = tanhCurve(1.8);
  limiter.oversample = "2x";
  const outGain = ctx.createGain();
  outGain.gain.value = 0.9;
  master.connect(limiter);
  limiter.connect(outGain);
  outGain.connect(ctx.destination);

  // pad: partials → lowpass → master
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 320;
  lp.Q.value = 0.8;
  lp.connect(master);

  const voices: Voice[] = [];
  for (const p of PARTIALS) {
    for (const cents of [-4, 4]) {
      const osc = ctx.createOscillator();
      osc.type = p.type;
      osc.frequency.value = root * p.ratio;
      osc.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = p.level * 0.5;
      osc.connect(g);
      g.connect(lp);
      osc.start();
      voices.push({ osc, gain: g });
    }
  }

  // shimmer: a high partial pair panned by a slow LFO → the spiral rotation
  const shimmer = ctx.createGain();
  shimmer.gain.value = 0.0001;
  const panner = ctx.createStereoPanner();
  shimmer.connect(panner);
  panner.connect(master);
  const shOsc = ctx.createOscillator();
  shOsc.type = "sine";
  shOsc.frequency.value = root * 4;
  const shOsc2 = ctx.createOscillator();
  shOsc2.type = "sine";
  shOsc2.frequency.value = root * 6;
  shOsc2.detune.value = 6;
  shOsc.connect(shimmer);
  shOsc2.connect(shimmer);
  shOsc.start();
  shOsc2.start();
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.08;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.7;
  lfo.connect(lfoGain);
  lfoGain.connect(panner.pan);
  lfo.start();

  let started = false;
  let disposed = false;

  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

  return {
    async resume() {
      if (disposed) return;
      if (ctx.state === "suspended") await ctx.resume();
      if (!started) {
        started = true;
        master.gain.setTargetAtTime(0.5, ctx.currentTime, 2.0);
      }
    },
    running() {
      return started && !disposed && ctx.state === "running";
    },
    setStats(mean, energy, density, spiral) {
      if (disposed || !started) return;
      const now = ctx.currentTime;
      // normalise the raw field stats into musical ranges
      const drive = clamp01(mean * 3.2);
      const body = clamp01(energy * 6.0);
      const bright = clamp01(density * 9.0);
      const cutoff = 260 * Math.pow(3600 / 260, 0.35 * drive + 0.65 * bright);
      lp.frequency.setTargetAtTime(cutoff, now, 0.3);
      lp.Q.setTargetAtTime(0.8 + bright * 3.0, now, 0.4);
      master.gain.setTargetAtTime(0.34 + 0.28 * body, now, 0.4);
      shimmer.gain.setTargetAtTime(0.02 + 0.09 * clamp01(spiral) * (0.4 + 0.6 * bright), now, 0.5);
      lfo.frequency.setTargetAtTime(0.05 + 0.28 * clamp01(spiral), now, 0.6);
    },
    bloom(intensity) {
      if (disposed || !started) return;
      const now = ctx.currentTime;
      const amp = 0.12 + 0.16 * clamp01(intensity);
      // a brief filtered swell — a soft "bloom" that opens then settles
      lp.frequency.cancelScheduledValues(now);
      const base = lp.frequency.value;
      lp.frequency.setValueAtTime(base, now);
      lp.frequency.linearRampToValueAtTime(Math.min(5200, base + 2400), now + 0.18);
      lp.frequency.setTargetAtTime(base, now + 0.2, 0.9);
      shimmer.gain.cancelScheduledValues(now);
      shimmer.gain.setValueAtTime(shimmer.gain.value, now);
      shimmer.gain.linearRampToValueAtTime(amp, now + 0.12);
      shimmer.gain.setTargetAtTime(0.03, now + 0.15, 0.7);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      } catch {
        /* closing */
      }
      const stopAt = now + 0.6;
      for (const v of voices) {
        try {
          v.osc.stop(stopAt);
        } catch {
          /* already stopped */
        }
      }
      for (const o of [shOsc, shOsc2, lfo]) {
        try {
          o.stop(stopAt);
        } catch {
          /* already stopped */
        }
      }
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 700);
    },
  };
}
