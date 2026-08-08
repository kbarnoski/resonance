// Nonlinear plate modal synthesis for the thunder sheet.
//
// This is a lightweight, real-time ANALOGUE of the qualitative behaviour of a
// thin metal plate driven at large amplitude — the regime the Foppl-von Karman
// equations describe (deflection couples to in-plane stress ~ deflection^2, and
// that quadratic term shuttles energy between modes). We do NOT solve the PDE.
// Instead:
//
//   * a bank of high-Q bandpass resonators, tuned to an INHARMONIC set, is fed a
//     constant seeded-noise excitation. Each resonator's audible level is set by
//     a per-mode ENERGY value we integrate on the JS side each frame.
//   * external "drive" injects energy almost entirely into the LOW modes.
//   * a NONLINEAR coupling term: once a mode's energy exceeds CRASH_THRESHOLD,
//     a fraction (growing quadratically with the excess) is shuttled UP to the
//     next modes — so gentle driving stays a low rumble, but hard driving pumps
//     the ladder until the top lights up and the spectrum "cracks" open.
//   * energy always decays, so when you stop shaking it rings down and settles
//     (a long tail, not a drone).
//
// A mild waveshaper on the master bus adds extra harmonics when it gets loud —
// the audible "crackle" of the crash — and a compressor keeps it safe.

import {
  buildModes,
  NM,
  HIGH_START,
  CRASH_THRESHOLD,
  mulberry32,
  SEED,
} from "./modes";

export type ThunderState = {
  storm: number; // 0..1 smoothed high-mode activity
  level: number; // 0..1 overall loudness proxy
  peakLow: number; // strongest low-mode energy (proximity to threshold)
};

export type ThunderAudio = {
  resume: () => Promise<void>;
  running: () => boolean;
  /** step the model by dt seconds under the given external drive (0..~1.3) */
  update: (drive: number, dt: number) => void;
  /** per-mode energy, shared live with the renderer (do not mutate) */
  energies: Float32Array;
  state: () => ThunderState;
  dispose: () => void;
};

const EMAX = 1.6;
const COUPLE = 5.2; // nonlinear transfer strength

export function makeThunderAudio(): ThunderAudio | null {
  const AC: typeof AudioContext | undefined =
    typeof window !== "undefined"
      ? window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!AC) return null;

  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return null;
  }

  const modes = buildModes();
  const energies = new Float32Array(NM);

  // ── master bus ────────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.9;

  // soft saturator: gentle crackle/harmonics when the crash gets loud
  const shaper = ctx.createWaveShaper();
  {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2) * 0.85;
    }
    shaper.curve = curve;
    shaper.oversample = "2x";
  }

  const tame = ctx.createBiquadFilter();
  tame.type = "lowpass";
  tame.frequency.value = 9200;
  tame.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 24;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;

  master.connect(shaper);
  shaper.connect(tame);
  tame.connect(comp);
  comp.connect(ctx.destination);

  // ── excitation: one looping seeded-noise buffer feeds every resonator ──────
  const rng = mulberry32(SEED ^ 0x1234);
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  {
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;

  const exc = ctx.createGain();
  exc.gain.value = 0.55;
  noise.connect(exc);

  // ── per-mode resonator chain ──────────────────────────────────────────────
  const modeGains: GainNode[] = [];
  for (let i = 0; i < NM; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = modes[i].f;
    bp.Q.value = modes[i].q;

    const g = ctx.createGain();
    g.gain.value = 0;

    exc.connect(bp);
    bp.connect(g);
    g.connect(master);
    modeGains.push(g);
  }

  let started = false;
  let disposed = false;

  // smoothed state readouts
  let stormS = 0;
  let levelS = 0;

  const resume = async () => {
    if (disposed) return;
    try {
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      /* ignore */
    }
    if (!started) {
      try {
        noise.start();
      } catch {
        /* already started */
      }
      started = true;
    }
  };

  const update = (drive: number, dt: number) => {
    if (disposed) return;
    const step = Math.min(dt, 0.05); // guard against tab-switch spikes
    const now = ctx.currentTime;

    // 1) decay every mode
    for (let i = 0; i < NM; i++) {
      energies[i] *= Math.exp(-modes[i].damp * step);
    }

    // 2) inject external drive (mostly into the low modes)
    const d = Math.max(0, drive);
    for (let i = 0; i < NM; i++) {
      energies[i] += d * modes[i].drive * 2.4 * step;
    }

    // 3) NONLINEAR upward cascade — the heart of the piece.
    //    Above threshold, energy shuttles up the ladder, quadratically in the
    //    excess. Below threshold nothing moves and it stays a low rumble.
    for (let i = 0; i < NM - 1; i++) {
      const excess = energies[i] - CRASH_THRESHOLD;
      if (excess > 0) {
        let t = COUPLE * excess * energies[i] * step;
        t = Math.min(t, energies[i] * 0.8);
        energies[i] -= t;
        energies[i + 1] += t * 0.62;
        if (i + 2 < NM) energies[i + 2] += t * 0.34;
      }
      if (energies[i] > EMAX) energies[i] = EMAX;
    }
    if (energies[NM - 1] > EMAX) energies[NM - 1] = EMAX;

    // 4) push energies to audible gains
    let level = 0;
    let storm = 0;
    for (let i = 0; i < NM; i++) {
      const e = energies[i];
      const gain = e * modes[i].out * 0.5;
      modeGains[i].gain.setTargetAtTime(gain, now, 0.02);
      level += e * modes[i].out;
      if (i >= HIGH_START) storm += e;
    }

    levelS += (Math.min(1, level * 0.55) - levelS) * 0.15;
    stormS += (Math.min(1, storm * 0.9) - stormS) * 0.08;
  };

  const state = (): ThunderState => {
    let peakLow = 0;
    for (let i = 0; i < HIGH_START; i++) {
      if (energies[i] > peakLow) peakLow = energies[i];
    }
    return { storm: stormS, level: levelS, peakLow };
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      noise.stop();
    } catch {
      /* not started */
    }
    try {
      noise.disconnect();
      exc.disconnect();
      modeGains.forEach((g) => g.disconnect());
      master.disconnect();
      shaper.disconnect();
      tame.disconnect();
      comp.disconnect();
    } catch {
      /* ignore */
    }
    try {
      void ctx.close();
    } catch {
      /* ignore */
    }
  };

  return {
    resume,
    running: () => started && !disposed,
    update,
    energies,
    state,
    dispose,
  };
}
