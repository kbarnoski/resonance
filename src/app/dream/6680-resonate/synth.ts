// synth.ts — material-identity modal synthesis.
//
// A strike = a damped-sinusoid bank. For each mode we spin up one sine
// oscillator whose gain envelope decays exponentially over that mode's tau.
// The SAME strike also feeds a single shared "energy" model (modeEnergy[]) that
// the renderer reads every frame — so what you see on the lattice is literally
// the envelope of what you hear. A short filtered-noise burst gives the knock
// its body (wood thuds, ice cracks).
//
// No Math.random / Date.now anywhere: a mulberry32 PRNG seeded with 0x6680
// drives the auto-knock loop and the noise-burst waveform; time comes from the
// AudioContext clock.

import { MATERIALS, type Material, modeFreq, modeTau } from "./materials";

function makePrng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Engine = {
  ctx: AudioContext;
  material: Material;
  setMaterial: (m: Material) => void;
  // Strike the current material. velocity 0..1. audible=false updates visuals
  // only (used before the AudioContext is unlocked, so the piece rings on load).
  strike: (velocity: number, audible: boolean) => void;
  // Per-frame visual energies for the active material's modes (decayed to `now`).
  sampleEnergies: (nowMs: number) => Float32Array;
  totalEnergy: () => number;
  resume: () => Promise<void>;
  destroy: () => Promise<void>;
};

const MAX_MODES = 10;

export function makeEngine(): Engine {
  const AC: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AC();

  const master = ctx.createGain();
  master.gain.value = 0.85;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;
  master.connect(comp);
  comp.connect(ctx.destination);

  const rng = makePrng(0x6680);

  // Pre-baked noise buffer for strike transients (one second, deterministic).
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  {
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = rng() * 2 - 1;
  }

  const active = new Set<OscillatorNode>();

  let material: Material = MATERIALS[0];

  // Visual mode-energy model, decayed analytically between strikes.
  const energy = new Float32Array(MAX_MODES);
  let lastSample = performance.now();

  function decayTo(nowMs: number) {
    const dt = Math.max(0, (nowMs - lastSample) / 1000);
    lastSample = nowMs;
    if (dt <= 0) return;
    for (let n = 0; n < material.ratios.length; n++) {
      const tau = modeTau(material, n);
      energy[n] *= Math.exp(-dt / tau);
    }
  }

  function setMaterial(m: Material) {
    if (m.id === material.id) return;
    material = m;
    energy.fill(0);
    lastSample = performance.now();
  }

  function strike(velocity: number, audible: boolean) {
    const vel = Math.min(1, Math.max(0.05, velocity));
    const m = material;
    const now = ctx.currentTime;

    // brighter, harder hits push more energy into the upper modes.
    const bright = m.brightness * Math.pow(vel, 1.2);
    const M = m.ratios.length;

    // refresh visual energies to now so the strike stacks cleanly.
    decayTo(performance.now());

    for (let n = 0; n < M; n++) {
      const hi = M > 1 ? n / (M - 1) : 0;
      const amp = m.gains[n] * vel * (0.35 + 0.65 * (1 - hi) + bright * hi * 1.4);
      if (amp < 0.0006) {
        energy[n] += amp;
        continue;
      }
      energy[n] += amp;

      if (!audible || ctx.state !== "running") continue;

      const f = modeFreq(m, n);
      if (f > ctx.sampleRate * 0.48) continue;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;

      const g = ctx.createGain();
      const tau = modeTau(m, n);
      const peak = amp * 0.28;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.003);
      g.gain.exponentialRampToValueAtTime(0.00008, now + tau);

      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + tau + 0.05);
      active.add(osc);
      osc.onended = () => {
        try {
          osc.disconnect();
          g.disconnect();
        } catch {
          /* already gone */
        }
        active.delete(osc);
      };
    }

    // Knock transient: a very short band-limited noise burst for body.
    if (audible && ctx.state === "running") {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const off = Math.floor(rng() * (ctx.sampleRate - 2048));
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = m.fundamental * (1.5 + bright);
      bp.Q.value = 0.7;
      const ng = ctx.createGain();
      const nDur = 0.006 + m.noise * 0.05;
      const nPeak = (0.12 + m.noise * 0.5) * vel;
      ng.gain.setValueAtTime(nPeak, now);
      ng.gain.exponentialRampToValueAtTime(0.0002, now + nDur);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(master);
      src.start(now, off / ctx.sampleRate);
      src.stop(now + nDur + 0.02);
      src.onended = () => {
        try {
          src.disconnect();
          bp.disconnect();
          ng.disconnect();
        } catch {
          /* already gone */
        }
      };
    }
  }

  function sampleEnergies(nowMs: number): Float32Array {
    decayTo(nowMs);
    return energy;
  }

  function totalEnergy(): number {
    let s = 0;
    for (let n = 0; n < material.ratios.length; n++) s += energy[n];
    return s;
  }

  async function resume() {
    if (ctx.state !== "running") await ctx.resume();
  }

  async function destroy() {
    for (const osc of active) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        /* ignore */
      }
    }
    active.clear();
    try {
      master.disconnect();
      comp.disconnect();
    } catch {
      /* ignore */
    }
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
  }

  return {
    ctx,
    get material() {
      return material;
    },
    setMaterial,
    strike,
    sampleEnergies,
    totalEnergy,
    resume,
    destroy,
  } as Engine;
}
