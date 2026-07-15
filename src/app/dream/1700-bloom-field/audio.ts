// ─────────────────────────────────────────────────────────────────────────────
// 1700-bloom-field / audio.ts — additive shimmer whose partials GRIT UP with
// motion.
//
//   Deliberately NOT a clean just-intonation consonant drone (the lab has
//   banned the JI-consonant-drone-bed reflex). The 7 partials sit on a
//   stretched, mildly-inharmonic series; as motion energy rises the partials
//   detune and spread APART so the tone reorganizes and grits — the sonic
//   analogue of the chrysanthemum blooming and re-forming.
//
//   Signal path: 7 osc → per-partial gain → sum bus → DynamicsCompressor →
//   master GainNode (0.12) → destination.
//
//   All scheduling uses AudioContext.currentTime (the audio clock). No
//   Date.now / performance.now / Math.random anywhere in the audio path.
// ─────────────────────────────────────────────────────────────────────────────

// Stretched / mildly inharmonic partial ratios — NOT small-integer JI.
const RATIOS = [1.0, 2.03, 3.17, 4.41, 5.62, 6.95, 8.34];
const BASE_HZ = 138.6; // ~C#3
const MASTER = 0.12;

export interface BloomAudio {
  start(): Promise<void>;
  update(motion: number, bloom: number): void;
  dispose(): void;
}

export function makeAudio(): BloomAudio {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.0001;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.006;
  comp.release.value = 0.28;

  comp.connect(master);
  master.connect(ctx.destination);

  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];

  for (let i = 0; i < RATIOS.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = i % 2 === 0 ? "sine" : "triangle"; // triangles add gentle grit
    osc.frequency.value = BASE_HZ * RATIOS[i];
    const g = ctx.createGain();
    // higher partials start quieter; they come forward as motion spreads.
    g.gain.value = 0.9 / (i + 1.4);
    osc.connect(g);
    g.connect(comp);
    oscs.push(osc);
    gains.push(g);
  }

  // A slow inharmonic tremolo LFO on the bus for a breathing shimmer.
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.13;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.35;
  const trem = ctx.createGain();
  trem.gain.value = 0.65;
  lfo.connect(lfoGain);
  lfoGain.connect(trem.gain);
  // route master through trem: comp -> master -> trem -> destination
  master.disconnect();
  master.connect(trem);
  trem.connect(ctx.destination);

  let started = false;

  const start = async () => {
    if (started) return;
    if (ctx.state === "suspended") await ctx.resume();
    const t = ctx.currentTime;
    oscs.forEach((o) => o.start(t));
    lfo.start(t);
    master.gain.setTargetAtTime(MASTER, t, 0.6); // gentle fade-in
    started = true;
  };

  const update = (motion: number, bloom: number) => {
    const t = ctx.currentTime;
    const m = Math.max(0, Math.min(1, motion));
    const b = Math.max(0, Math.min(1, bloom));
    // partials spread APART with motion → beating / gritting.
    for (let i = 0; i < oscs.length; i++) {
      const spread = 1 + m * 0.045 * i; // outer partials detune more
      const cents = m * (i - 3) * 9; // asymmetric fan → inharmonic drift
      oscs[i].frequency.setTargetAtTime(
        BASE_HZ * RATIOS[i] * spread * Math.pow(2, cents / 1200),
        t,
        0.12,
      );
      // upper partials swell in with motion (the "reorganizing" edge).
      const lift = i >= 3 ? 1 + m * 1.6 : 1;
      gains[i].gain.setTargetAtTime((0.9 / (i + 1.4)) * lift * 0.7, t, 0.15);
    }
    // master amplitude follows bloom intensity, gently.
    if (started) {
      master.gain.setTargetAtTime(MASTER * (0.55 + 0.45 * b), t, 0.2);
    }
  };

  const dispose = () => {
    try {
      const t = ctx.currentTime;
      oscs.forEach((o) => {
        try {
          o.stop(t + 0.05);
        } catch {
          /* already stopped */
        }
      });
      try {
        lfo.stop(t + 0.05);
      } catch {
        /* already stopped */
      }
    } finally {
      void ctx.close();
    }
  };

  return { start, update, dispose };
}
