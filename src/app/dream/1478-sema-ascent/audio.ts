// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — Web-Audio synth for 1478 "Sema Ascent". No files, all synthesis.
//
// Two coupled layers:
//   • a continuous inharmonic DRONE ground (detuned oscillators + a shimmer that
//     brightens toward the peak), gliding continuously — never snapped to a scale.
//   • an inharmonic BELL/percussion layer whose every hit is fired by a ring
//     rotation crossing a phase gate (from the shared Conductor). What you see
//     spin is what you hear pulse.
//
// Master chain: sources → DynamicsCompressor (limiter) → master gain (ramps up
// from silence, peak ≤ 0.22) → destination. Concurrent voices capped at 14.
// ─────────────────────────────────────────────────────────────────────────────

import { RING_COUNT, PITCH, type ArcDrivers } from "./arc";

const PEAK_MASTER = 0.2; // ≤ 0.22
const VOICE_CAP = 14;
const HIT_COOLDOWN = 0.05; // s, per ring, anti-machine-gun

export interface SemaAudio {
  step(dt: number, d: ArcDrivers): void;
  trigger(crossings: Int16Array, d: ArcDrivers): void;
  stop(): void;
}

export function startSemaAudio(ctx: AudioContext, reduced: boolean): SemaAudio {
  const now = ctx.currentTime;

  // ── master bus ──
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(PEAK_MASTER, now + 3.0); // no click

  limiter.connect(master);
  master.connect(ctx.destination);

  // ── drone ground ──
  const droneLP = ctx.createBiquadFilter();
  droneLP.type = "lowpass";
  droneLP.frequency.value = 320;
  droneLP.Q.value = 0.7;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  droneLP.connect(droneGain);
  droneGain.connect(limiter);

  const mkOsc = (type: OscillatorType, mult: number, detune: number) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = 58 * mult;
    o.detune.value = detune;
    o.connect(droneLP);
    o.start();
    return o;
  };
  const oscA = mkOsc("sawtooth", 1.0, -4);
  const oscB = mkOsc("sawtooth", 1.008, 5);
  const oscC = mkOsc("triangle", 2.01, 0);

  // shimmer — brightens toward the peak, bypasses the drone lowpass
  const shimmer = ctx.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.value = 58 * 5.05;
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.0;
  shimmer.connect(shimmerGain);
  shimmerGain.connect(limiter);
  shimmer.start();

  // ── bell layer state ──
  const lastHit = new Float64Array(RING_COUNT);
  let voices = 0;
  let bellBase = 170; // glides up with warmth
  const supportsPan = typeof ctx.createStereoPanner === "function";

  function fireBell(i: number, d: ArcDrivers) {
    const t = ctx.currentTime;
    if (t - lastHit[i] < HIT_COOLDOWN) return;
    if (voices >= VOICE_CAP) return;
    lastHit[i] = t;
    voices++;

    const freq = bellBase * PITCH[i];
    const dur = 0.22 + (i / RING_COUNT) * 0.7; // larger shells ring longer
    const vol = (0.05 + d.density * 0.16) * (0.6 + d.flare * 0.5);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const out: AudioNode = g;
    if (supportsPan) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = ((i / (RING_COUNT - 1)) * 2 - 1) * 0.7;
      g.connect(pan);
      pan.connect(limiter);
    } else {
      g.connect(limiter);
    }

    // two INHARMONIC partials (bell/modal-bar), each with a small downward glide
    const partials = [
      { m: 1.0, a: 0.6 },
      { m: 2.76, a: 0.35 }, // classic inharmonic bell ratio
    ];
    let last: OscillatorNode | null = null;
    for (const p of partials) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(freq * p.m * 1.01, t);
      o.frequency.exponentialRampToValueAtTime(freq * p.m, t + dur * 0.8);
      const pg = ctx.createGain();
      pg.gain.value = p.a;
      o.connect(pg);
      pg.connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
      last = o;
    }
    if (last) {
      last.onended = () => {
        voices = Math.max(0, voices - 1);
      };
    } else {
      voices = Math.max(0, voices - 1);
    }
  }

  function step(dt: number, d: ArcDrivers) {
    void dt;
    const t = ctx.currentTime;
    // continuous glide of the drone base — never a fixed scale index
    const baseF = 54 + d.warmth * 16 + d.intensity * 4;
    oscA.frequency.setTargetAtTime(baseF, t, 0.4);
    oscB.frequency.setTargetAtTime(baseF * 1.008, t, 0.4);
    oscC.frequency.setTargetAtTime(baseF * 2.01, t, 0.4);
    shimmer.frequency.setTargetAtTime(baseF * 5.05, t, 0.4);

    droneLP.frequency.setTargetAtTime(220 + d.intensity * 1600, t, 0.3);
    const dg = reduced ? 0.14 : 0.1 + d.intensity * 0.22;
    droneGain.gain.setTargetAtTime(dg, t, 0.5);
    shimmerGain.gain.setTargetAtTime(d.flare * 0.05 + d.intensity * 0.015, t, 0.4);

    bellBase = 165 + d.warmth * 150 + d.intensity * 20;
  }

  function trigger(crossings: Int16Array, d: ArcDrivers) {
    for (let i = 0; i < RING_COUNT; i++) {
      if (crossings[i] > 0 && d.ringsLit > i) fireBell(i, d);
    }
  }

  function stop() {
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    const olist = [oscA, oscB, oscC, shimmer];
    for (const o of olist) {
      o.onended = null;
      try {
        o.stop(t + 0.35);
      } catch {
        /* already stopped */
      }
    }
  }

  return { step, trigger, stop };
}
