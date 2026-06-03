// meadow-audio.ts — the dusk-meadow generative ensemble (Web Audio API).
// All synthesized, no audio files. A warm Lydian scale (no wrong notes ever).
// Everything passes through a master DynamicsCompressor limiter + soft lowpass
// so the sound can NEVER get harsh, no matter how wildly the child dances.
//
// Driven entirely by the motion field, summarised each frame into:
//   energy   — total movement 0..1 → pad swell, filter opening, voice count
//   heightY  — centre-of-motion height 0..1 → note register (low=low, high=high)
//   spawn    — number of hot cells this frame → how many blooms ring out
//
// The loop is scheduled with audioCtx.currentTime look-ahead and is NEVER
// silent once started (a soft pad always breathes underneath).

// G Lydian across a few octaves (G A B C# D E F#), in Hz. Lydian's raised 4th
// gives that floaty, wondering, dusk-lit feeling — and every note is consonant.
const LYDIAN = [
  196.0, 220.0, 246.94, 277.18, 293.66, 329.63, 369.99, // G3..F#4
  392.0, 440.0, 493.88, 554.37, 587.33, 659.25, 739.99, // G4..F#5
  783.99, 880.0, 987.77, 1108.73, 1174.66, 1318.51, 1479.98, // G5..F#6
];

export interface MeadowFrame {
  energy: number; // 0..1 total motion
  heightY: number; // 0..1 average motion height (0 = bottom of frame)
  spawn: number; // 0..1 normalised count of hot cells
}

export interface MeadowAudioHandle {
  /** Push the latest summarised motion frame; controls glide toward it. */
  update: (f: MeadowFrame) => void;
  /** Stop everything and release nodes. */
  dispose: () => void;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function pick<T>(arr: T[], i: number): T {
  return arr[((i % arr.length) + arr.length) % arr.length];
}

export function startMeadowAudio(ctx: AudioContext): MeadowAudioHandle {
  // ── master chain: bus → soft lowpass → limiter → out ────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.0001;

  const softTop = ctx.createBiquadFilter();
  softTop.type = "lowpass";
  softTop.frequency.value = 8500; // tame any harsh highs
  softTop.Q.value = 0.4;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 26;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.25;

  master.connect(softTop);
  softTop.connect(limiter);
  limiter.connect(ctx.destination);

  // Gentle fade in so starting is never a jolt.
  const now = ctx.currentTime;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.85, now + 3);

  // ── breathing pad: two detuned sines an open fifth apart ────────────────
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 500;
  padFilter.Q.value = 0.7;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0001;
  padFilter.connect(padGain);
  padGain.connect(master);

  const padOscA = ctx.createOscillator();
  const padOscB = ctx.createOscillator();
  padOscA.type = "sine";
  padOscB.type = "sine";
  padOscA.frequency.value = LYDIAN[0]; // G3
  padOscB.frequency.value = LYDIAN[3]; // C#4 — Lydian colour in the pad itself
  padOscB.detune.value = 5;
  padOscA.connect(padFilter);
  padOscB.connect(padFilter);
  padOscA.start();
  padOscB.start();

  // ── a warm bloom voice: triangle + soft octave, lowpassed ───────────────
  const playBloom = (freq: number, when: number, vel: number) => {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "triangle";
    o2.type = "sine";
    o1.frequency.value = freq;
    o2.frequency.value = freq * 2;
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = lerp(1600, 4200, smoothed.energy);
    tone.Q.value = 0.5;
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(tone);
    tone.connect(master);
    const peak = clamp(vel, 0.02, 0.4);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 2.2);
    o1.start(when);
    o2.start(when);
    o1.stop(when + 2.4);
    o2.stop(when + 2.4);
  };

  // ── control smoothing ───────────────────────────────────────────────────
  let target: MeadowFrame = { energy: 0, heightY: 0.5, spawn: 0 };
  const smoothed: MeadowFrame = { energy: 0, heightY: 0.5, spawn: 0 };

  // ── look-ahead scheduler ────────────────────────────────────────────────
  let step = 0;
  let nextBloom = ctx.currentTime + 0.5;
  const LOOKAHEAD = 0.2;

  const tick = () => {
    const k = 0.12;
    smoothed.energy += (target.energy - smoothed.energy) * k;
    smoothed.heightY += (target.heightY - smoothed.heightY) * k;
    smoothed.spawn += (target.spawn - smoothed.spawn) * k;

    const t = ctx.currentTime;
    const horizon = t + LOOKAHEAD;

    // Pad swells + opens with total energy → the meadow "wakes up".
    const padLevel = lerp(0.05, 0.42, smoothed.energy);
    const padCut = lerp(380, 1800, smoothed.energy);
    padGain.gain.setTargetAtTime(padLevel, t, 0.4);
    padFilter.frequency.setTargetAtTime(padCut, t, 0.4);

    // Blooms ring out faster the more the child moves; never fully silent
    // (a sparse plink continues even when still).
    const gap = lerp(2.6, 0.12, clamp(smoothed.energy + smoothed.spawn, 0, 1));
    while (nextBloom < horizon) {
      // height of motion → register. Bottom of frame → low octave, top → high.
      // (motion field y is flipped: row 0 = top of camera, so invert.)
      const reg = clamp(smoothed.heightY, 0, 1);
      const base = Math.round(lerp(0, 14, reg)); // index into LYDIAN
      const idx = base + pick([0, 2, 4, 6, 3, 0], step);
      const vel = lerp(0.05, 0.34, clamp(smoothed.energy + smoothed.spawn * 0.6, 0, 1));
      playBloom(pick(LYDIAN, idx), nextBloom, vel);
      // when very energetic, occasionally stack a soft harmony a third up
      if (smoothed.energy > 0.55 && step % 2 === 0) {
        playBloom(pick(LYDIAN, idx + 2), nextBloom + 0.01, vel * 0.6);
      }
      nextBloom += gap * (0.7 + Math.random() * 0.6);
      step++;
    }
  };

  const timer = setInterval(tick, 50);
  tick();

  let disposed = false;
  return {
    update: (f: MeadowFrame) => {
      target = {
        energy: clamp(f.energy, 0, 1),
        heightY: clamp(f.heightY, 0, 1),
        spawn: clamp(f.spawn, 0, 1),
      };
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      const tt = ctx.currentTime;
      master.gain.cancelScheduledValues(tt);
      master.gain.setValueAtTime(master.gain.value, tt);
      master.gain.exponentialRampToValueAtTime(0.0001, tt + 0.6);
      setTimeout(() => {
        try {
          padOscA.stop();
          padOscB.stop();
        } catch {
          /* already stopped */
        }
      }, 800);
    },
  };
}
