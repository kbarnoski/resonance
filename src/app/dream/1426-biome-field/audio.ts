// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — sonifying the live seismic field of Biome Field (Web Audio).
//
//   The dataset composes the sound. Two intertwined layers, both derived from
//   the DATA (never a consonant scale index):
//
//   1. DRONE CLUSTER — the few largest, most recent quakes each seed a low
//      sustained voice. Fundamental falls as magnitude rises (a great quake is a
//      deep, massive tone); depth stretches an INHARMONIC upper partial, so the
//      cluster is a spectral, faintly uneasy chord rather than a tonal one.
//
//   2. GRANULAR SHIMMER — the running texture of many small events. A scheduler
//      fires short high grains whose pitch is a continuous function of each
//      quake's magnitude + depth (inharmonic, jittered), panned by longitude —
//      a restless glitter over the drone. Grain density tracks how busy the
//      planet is right now.
//
//   The visitor's HOVER ("listen in") biases which quakes the grains are drawn
//   from toward the pointed-at region, and lifts the grain rate there.
//
//   HYGIENE: the AudioContext is created + resumed only from the Begin gesture
//   (page.tsx). Master ramps from silence to a peak of 0.18 through a
//   DynamicsCompressor limiter. stop() fades out and lets tails ring; the page
//   closes the context after.
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb } from "../_shared/psych/convolutionVoid";
import type { Quake } from "./data";

const MASTER_PEAK = 0.18;
const VOICE_COUNT = 6;

interface FieldPoint {
  ux: number;
  uy: number;
  uz: number;
  pan: number; // -1..1 from longitude
  magNorm: number; // 0..1
  depthNorm: number; // 0..1
  rec: number; // 0..1 recency
}

interface Voice {
  fund: OscillatorNode;
  partial: OscillatorNode;
  gain: GainNode;
  lp: BiquadFilterNode;
}

export interface BiomeAudio {
  setQuakes(quakes: Quake[]): void;
  setFocus(f: { lon: number; lat: number } | null): void;
  stop(): void;
}

export interface AudioOptions {
  reduced?: boolean;
}

function geoToUnit(lonDeg: number, latDeg: number): [number, number, number] {
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  return [
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.cos(lon),
  ];
}

export function startAudio(ctx: AudioContext, opts: AudioOptions = {}): BiomeAudio {
  const reduced = opts.reduced ?? false;

  // ── Master chain: buses → limiter → destination ────────────────────────────
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(MASTER_PEAK, ctx.currentTime + 3.2);
  master.connect(limiter);

  const reverb = createVoidReverb(ctx, { seconds: 5.5, decay: 2.4, wet: 0.62 });
  reverb.output.connect(master);

  const droneBus = ctx.createGain();
  droneBus.gain.value = 0.55;
  droneBus.connect(reverb.input);
  droneBus.connect(master); // a little dry so the sub stays present

  const grainBus = ctx.createGain();
  grainBus.gain.value = 0.5;
  grainBus.connect(reverb.input);

  // ── Drone voices (fixed pool, retuned as the data changes) ─────────────────
  const voices: Voice[] = [];
  for (let i = 0; i < VOICE_COUNT; i++) {
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    lp.Q.value = 0.9;
    gain.connect(lp);
    lp.connect(droneBus);

    const fund = ctx.createOscillator();
    fund.type = "sine";
    fund.frequency.value = 44 + i * 3;
    const partial = ctx.createOscillator();
    partial.type = "triangle";
    partial.frequency.value = (44 + i * 3) * 2.3;
    const pGain = ctx.createGain();
    pGain.gain.value = 0.3;
    fund.connect(gain);
    partial.connect(pGain);
    pGain.connect(gain);
    fund.start();
    partial.start();

    voices.push({ fund, partial, gain, lp });
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let field: FieldPoint[] = [];
  let focus: { x: number; y: number; z: number } | null = null;
  let stopped = false;

  function setQuakes(quakes: Quake[]): void {
    if (stopped || quakes.length === 0) return;

    let minTime = Infinity;
    let maxTime = -Infinity;
    for (const q of quakes) {
      if (q.time < minTime) minTime = q.time;
      if (q.time > maxTime) maxTime = q.time;
    }
    const span = Math.max(1, maxTime - minTime);

    field = quakes.map((q) => {
      const [ux, uy, uz] = geoToUnit(q.lon, q.lat);
      return {
        ux,
        uy,
        uz,
        pan: Math.max(-1, Math.min(1, q.lon / 180)),
        magNorm: Math.min(1, Math.max(0, (q.mag + 1) / 8.5)),
        depthNorm: Math.min(1, Math.max(0, q.depthKm / 660)),
        rec: Math.min(1, Math.max(0, (q.time - minTime) / span)),
      };
    });

    // Retune the drone cluster to the strongest, freshest quakes.
    const ranked = [...field].sort(
      (a, b) => b.magNorm * 0.75 + b.rec * 0.25 - (a.magNorm * 0.75 + a.rec * 0.25),
    );
    const now = ctx.currentTime;
    for (let i = 0; i < VOICE_COUNT; i++) {
      const v = voices[i];
      const q = ranked[i];
      if (!q) {
        v.gain.gain.setTargetAtTime(0.0001, now, 1.2);
        continue;
      }
      // Bigger magnitude → deeper fundamental (30..82 Hz).
      const f0 = 30 + (1 - q.magNorm) * 52;
      // Depth stretches an INHARMONIC partial (non-integer ratio).
      const ratio = 2.0 + q.depthNorm * 1.7;
      v.fund.frequency.setTargetAtTime(f0, now, 0.9);
      v.partial.frequency.setTargetAtTime(f0 * ratio, now, 0.9);
      v.fund.detune.setTargetAtTime((i - 2.5) * 4, now, 0.5);
      // Deeper quakes open the voice's filter a touch (more upper spectrum).
      v.lp.frequency.setTargetAtTime(240 + q.depthNorm * 900, now, 1.0);
      const g = (0.05 + q.magNorm * 0.13) * (0.5 + q.rec * 0.5);
      v.gain.gain.setTargetAtTime(g, now, 1.4);
    }
  }

  function setFocus(f: { lon: number; lat: number } | null): void {
    if (!f) {
      focus = null;
      return;
    }
    const [x, y, z] = geoToUnit(f.lon, f.lat);
    focus = { x, y, z };
  }

  // ── Grain scheduler ────────────────────────────────────────────────────────
  function pickQuake(): FieldPoint | null {
    if (field.length === 0) return null;
    let total = 0;
    const weights = new Array<number>(field.length);
    for (let i = 0; i < field.length; i++) {
      const q = field[i];
      let w = 0.12 + q.rec * q.rec; // fresh events glitter most
      if (focus) {
        const dot = q.ux * focus.x + q.uy * focus.y + q.uz * focus.z;
        const near = Math.max(0, dot);
        w *= 0.12 + Math.pow(near, 6) * 5.0; // bias hard toward the region
      }
      weights[i] = w;
      total += w;
    }
    if (total <= 0) return field[(Math.random() * field.length) | 0];
    let r = Math.random() * total;
    for (let i = 0; i < field.length; i++) {
      r -= weights[i];
      if (r <= 0) return field[i];
    }
    return field[field.length - 1];
  }

  function fireGrain(q: FieldPoint): void {
    const t = ctx.currentTime + 0.01;
    // Continuous, inharmonic pitch from magnitude + depth (NOT a scale index).
    // Small/shallow → bright high glints; big/deep → lower shimmer.
    const octave = (1 - q.magNorm) * 2.2 - q.depthNorm * 1.1;
    let freq = 300 * Math.pow(2, octave);
    freq *= 1 + (Math.random() - 0.5) * 0.05; // detune jitter
    // Occasional inharmonic overtone for extra shimmer.
    if (Math.random() < 0.4) freq *= 1.5 + q.depthNorm * 0.6;
    freq = Math.max(120, Math.min(2400, freq));

    const osc = ctx.createOscillator();
    osc.type = Math.random() < 0.5 ? "sine" : "triangle";
    osc.frequency.value = freq;

    const g = ctx.createGain();
    const dur = 0.12 + Math.random() * 0.28;
    const peak = (0.02 + q.magNorm * 0.05) * (0.6 + q.rec * 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0005, peak), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const pan = ctx.createStereoPanner();
    pan.pan.value = q.pan;

    osc.connect(g);
    g.connect(pan);
    pan.connect(grainBus);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  const TICK_MS = 70;
  const scheduler = window.setInterval(() => {
    if (stopped || field.length === 0) return;
    // Flux: how busy the planet is, gently bounded. Hover lifts it in-region.
    const flux = Math.min(1.4, 0.2 + field.length / 130);
    const focusBoost = focus ? 0.7 : 0;
    let expected = (flux + focusBoost) * (reduced ? 0.6 : 1);
    // Fire whole grains plus a fractional-probability extra.
    let n = Math.floor(expected);
    if (Math.random() < expected - n) n += 1;
    expected = Math.min(4, n);
    for (let i = 0; i < expected; i++) {
      const q = pickQuake();
      if (q) fireGrain(q);
    }
  }, TICK_MS);

  function stop(): void {
    if (stopped) return;
    stopped = true;
    window.clearInterval(scheduler);
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    } catch {
      /* ctx closing */
    }
    const killAt = now + 0.85;
    for (const v of voices) {
      try {
        v.fund.stop(killAt);
        v.partial.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
  }

  return { setQuakes, setFocus, stop };
}
