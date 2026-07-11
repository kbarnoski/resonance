// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the DARK CHOIR. The room sings your note back as an endlessly,
// ecstatically rising choir of your own voice.
//
//   Graph:
//                 orbiting choir voices (PannerNode / HRTF, circling the head) ─┐
//     shared Shepard endless-rise bed (loudness → drive) ────────────────────── ┤
//     shared JI drone bank (grounds the space as boundless, not a siren) ────── ┼→ bus
//                                                                                │
//     bus → createVoidReverb (cathedral / cistern tail) → limiter → master → out
//
//   CORE TECHNIQUE — a Shepard/Risset endless glissando choir:
//   • The shared Shepard bank (octave-spaced sine partials under a fixed Gaussian
//     spectral window) is always gliding upward; your LOUDNESS sets its drive, so
//     the room brightens and climbs faster the more you give it.
//   • Each note you sing SPAWNS an orbiting choir voice pitched to your detected
//     fundamental. That voice glides up ~2.6 octaves over its life while a Gaussian
//     amplitude window fades it in at the bottom and out at the top — so there is
//     never an audible ceiling. New voices fade in below as old ones fade out
//     above: the choir climbs FOREVER. Each is spatialised on a slow orbit around
//     the head, so voices circle you.
//
//   ASCENT, NOT DISSOLUTION: the JI drone stays a firm ground and the voices keep
//   LIFTING (rising glissandi, brightening) rather than thinning into a void — the
//   felt sense is being carried endlessly upward, boundless but buoyant.
//
//   Voice budget (≤14): Shepard bed 5 · drone (root+fifth ×2 detuned) 4 ·
//   orbiting choir ≤4 = ≤13 concurrent oscillators. Per-voice vibrato is scheduled
//   in step() rather than spent as extra oscillators.
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

/** Deterministic PRNG (mulberry32) — seeds orbit phases without Math.random. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ChoirAudio {
  /** Feed the voice controller: loudness in [0,1] and pitch in Hz (or null). */
  setVoice(loudness: number, pitch: number | null): void;
  /** Advance time-based elements. dt in seconds. */
  step(dt: number): void;
  /** 0..1 luminance the visual should track (bed brightness + live choir). */
  glow(): number;
  stop(): void;
}

const MAX_CHOIR = 4; // concurrent orbiting voices
const VOICE_LIFE = 11; // seconds — a long, unhurried rise
const RISE_OCTAVES = 2.6; // how far each voice climbs across its life

interface OrbitVoice {
  osc: OscillatorNode;
  gain: GainNode;
  panner: PannerNode;
  startFreq: number; // base of this voice's glide, Hz
  born: number; // ctx time of birth
  orbitPhase: number; // initial angle around the head
  orbitRate: number; // rad/s of the orbit
  vibPhase: number; // vibrato phase offset
  peakAmp?: number; // peak gain, set at spawn from note energy
  alive: boolean;
}

/** Fold a detected pitch into a warm choir register (~110–440 Hz). */
function foldPitch(hz: number): number {
  let f = hz;
  while (f > 440) f /= 2;
  while (f < 110) f *= 2;
  return f;
}

export function startAudio(ctx: AudioContext): ChoirAudio {
  const rng = mulberry32(0x0da4c401);

  // ── Master limiter → master gain → destination ────────────────────────────
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.3;

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  // Ramp up from silence to a gentle peak (≤0.22).
  master.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 3.0);
  limiter.connect(master);
  master.connect(ctx.destination);

  // ── Cathedral reverb (code-synthesised IR; no file) → limiter ─────────────
  const reverb: VoidReverb = createVoidReverb(ctx, {
    seconds: 5.5,
    decay: 2.0,
    wet: 0.6,
  });
  reverb.output.connect(limiter);

  // Everything sings into this bus, then into the great space.
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(reverb.input);

  // A HRTF listener at the origin; voices orbit around it.
  const listener = ctx.listener;
  if (typeof listener.forwardX !== "undefined") {
    listener.forwardX.value = 0;
    listener.forwardY.value = 0;
    listener.forwardZ.value = -1;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  }

  // ── Shared Shepard endless-rise bed (5 partials; loudness → drive) ────────
  const shepard: ShepardEngine = startShepard(ctx, bus, {
    partials: 5,
    centerOct: 4.2,
    sigmaOct: 1.5,
    baseRate: 0.02,
    driveRate: 0.14,
    peakGain: 0.34,
  });

  // ── Shared JI drone bank (root + fifth): the firm ground of the ascent ────
  const drone: DroneBank = startDroneBank(ctx, bus, {
    root: 55, // A1
    ratios: [1, 3 / 2], // → 4 oscillators after the ±4-cent detune pairs
    cutoffLow: 180,
    cutoffHigh: 1400,
    peakGain: 0.2,
  });

  // ── Orbiting choir voices ─────────────────────────────────────────────────
  const voices: OrbitVoice[] = [];
  let lastSpawn = -Infinity;

  const spawn = (freqHz: number, energy: number) => {
    // Recycle the oldest if we are at the budget.
    if (voices.filter((v) => v.alive).length >= MAX_CHOIR) {
      let oldest: OrbitVoice | null = null;
      for (const v of voices) if (v.alive && (!oldest || v.born < oldest.born)) oldest = v;
      if (oldest) releaseVoice(oldest, 0.4);
    }

    const now = ctx.currentTime;
    const startFreq = foldPitch(freqHz);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = startFreq;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.rolloffFactor = 0.6;

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(bus);
    osc.start();

    const v: OrbitVoice = {
      osc,
      gain,
      panner,
      startFreq,
      born: now,
      orbitPhase: rng() * Math.PI * 2,
      orbitRate: 0.18 + rng() * 0.22, // slow circle, well under any flicker
      vibPhase: rng() * Math.PI * 2,
      alive: true,
    };
    // Peak amplitude scales gently with how much you gave the note.
    v.peakAmp = 0.12 + 0.16 * Math.min(1, energy);
    voices.push(v);
  };

  const releaseVoice = (v: OrbitVoice, fade: number) => {
    if (!v.alive) return;
    v.alive = false;
    const now = ctx.currentTime;
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
    } catch {
      /* ctx closing */
    }
    try {
      v.osc.stop(now + fade + 0.05);
    } catch {
      /* already stopped */
    }
  };

  let loudness = 0;
  let liveGlow = 0;

  const setVoice = (l: number, pitch: number | null) => {
    loudness = Math.min(1, Math.max(0, l));
    shepard.setDrive(loudness);
    const now = ctx.currentTime;
    // Give the note back more of the great space as you sing louder.
    reverb.setWet(0.5 + 0.25 * loudness);
    drone.setDrive(0.3 + 0.5 * loudness);

    // Spawn a choir voice on a sung note: needs a pitch, enough energy, and a
    // short refractory so one held note becomes a slow procession, not a swarm.
    if (pitch !== null && loudness > 0.28 && now - lastSpawn > 1.4) {
      lastSpawn = now;
      spawn(pitch, loudness);
    }
  };

  const step = (dt: number) => {
    shepard.step(dt);
    const now = ctx.currentTime;
    let glowAcc = 0;

    for (const v of voices) {
      if (!v.alive) continue;
      const age = now - v.born;
      const u = age / VOICE_LIFE; // 0..1 across life
      if (u >= 1) {
        releaseVoice(v, 0.6);
        continue;
      }
      // Endless rise: glide up RISE_OCTAVES across the life, with gentle vibrato.
      const vib = Math.sin(now * 5.2 + v.vibPhase) * 0.006; // ±0.6% — a vocal shimmer
      const freq = v.startFreq * Math.pow(2, RISE_OCTAVES * u + vib);
      v.osc.frequency.setTargetAtTime(freq, now, 0.03);

      // Gaussian amplitude window → fade in at the bottom, out at the top, so the
      // climb has no audible edge (the Shepard illusion, per voice).
      const g = Math.exp(-Math.pow((u - 0.5) / 0.28, 2));
      const amp = (v.peakAmp ?? 0.16) * g;
      v.gain.gain.setTargetAtTime(Math.max(0.0001, amp), now, 0.08);
      glowAcc += g;

      // Slow orbit around the head.
      const theta = v.orbitPhase + age * v.orbitRate;
      v.panner.positionX.setTargetAtTime(Math.sin(theta) * 1.6, now, 0.05);
      v.panner.positionY.setTargetAtTime(0.3 * Math.sin(theta * 0.5), now, 0.05);
      v.panner.positionZ.setTargetAtTime(Math.cos(theta) * 1.6 - 0.2, now, 0.05);
    }

    // Prune dead voices occasionally to keep the array small.
    if (voices.length > 24) {
      for (let i = voices.length - 1; i >= 0; i--) {
        if (!voices[i].alive) voices.splice(i, 1);
      }
    }

    // Luminance target: the always-present bed brightness plus the live choir.
    const target = Math.min(1, 0.18 + 0.5 * loudness + 0.28 * Math.min(1, glowAcc));
    const a = 1 - Math.exp(-dt / 0.35);
    liveGlow += (target - liveGlow) * a;
  };

  const glow = () => liveGlow;

  let stopped = false;
  return {
    setVoice,
    step,
    glow,
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      } catch {
        /* closing */
      }
      shepard.stop();
      drone.stop();
      for (const v of voices) releaseVoice(v, 0.5);
    },
  };
}
