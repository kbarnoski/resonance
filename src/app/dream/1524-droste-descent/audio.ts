// ─────────────────────────────────────────────────────────────────────────────
// 1524-droste-descent / audio.ts — the sound half of the played infinite descent.
//
//   The carrier is a Shepard–Risset endless glissando (Roger Shepard 1964 /
//   Jean-Claude Risset) taken from the shared psych bank. Two engines run: one
//   glides DOWN (dir -1, the plunge) and one glides UP (dir +1, the climb). We
//   crossfade between them by the sign of the player's descent velocity and set
//   each engine's `drive` so its glide RATE tracks the on-screen level rate — so
//   the ear falls exactly as fast as the eye descends. Each time the view crosses
//   one nesting level (one octave of zoom) we ring a just-intonation bell to mark
//   the boundary, over a JI drone bed and a convolution void.
//
//   Public surface is a single graph object; page.tsx drives it every frame.
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import {
  createVoidReverb,
  type VoidReverb,
} from "../_shared/psych/convolutionVoid";

/** Idle glide rate (octaves/levels per second) shared by visuals + audio. */
export const IDLE_RATE = 0.09;
/** Peak descent rate the player can reach (levels per second). */
export const MAX_RATE = 2.4;

// Just-intonation bell palette — pure-ratio chords, cycled by level index so
// successive boundaries chime through a small harmonic progression.
const BELL_PALETTE: number[][] = [
  [1, 5 / 4, 3 / 2, 15 / 8],
  [1, 6 / 5, 3 / 2, 9 / 5],
  [1, 5 / 4, 3 / 2, 2],
  [9 / 8, 27 / 20, 5 / 3, 9 / 4],
];

const MAX_BELL_VOICES = 5;

interface BellVoice {
  oscs: OscillatorNode[];
  gain: GainNode;
  endsAt: number;
}

export interface DescentAudio {
  /** Set the signed descent velocity in levels/sec (negative = climbing). */
  setVelocity(v: number): void;
  /** Overall bed intensity 0..1 (drives drone brightness + level). */
  setDrive(d: number): void;
  /** Extra reverb bloom + shimmer during a Space surge, 0..1. */
  setSurge(s: number): void;
  /** Ring a boundary bell. dir +1 descending, -1 climbing. */
  ringBell(levelIndex: number, dir: number, intensity: number): void;
  /** Advance the glissando engines. Call once per animation frame. */
  step(dt: number): void;
  /** Fade out and tear the whole graph down. */
  stop(): void;
}

export function buildDescentAudio(ctx: AudioContext): DescentAudio {
  // ── master chain: everything → void → master gain → limiter → out ──────────
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
  master.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 2.2);
  master.connect(limiter);

  const verb: VoidReverb = createVoidReverb(ctx, {
    seconds: 4.6,
    decay: 2.6,
    wet: 0.3,
  });
  verb.output.connect(master);
  const busIn = verb.input;

  // ── the two Shepard carriers ───────────────────────────────────────────────
  // Descend engine glides DOWN and its drive maps velocity → glide rate so the
  // fall of pitch is welded to the fall through levels.
  const descendBus = ctx.createGain();
  descendBus.gain.value = 1;
  descendBus.connect(busIn);
  const descend: ShepardEngine = startShepard(ctx, descendBus, {
    dir: -1,
    baseRate: IDLE_RATE,
    driveRate: MAX_RATE - IDLE_RATE,
    peakGain: 0.42,
    partials: 9,
    sigmaOct: 1.7,
  });

  const climbBus = ctx.createGain();
  climbBus.gain.value = 0;
  climbBus.connect(busIn);
  const climb: ShepardEngine = startShepard(ctx, climbBus, {
    dir: 1,
    baseRate: 0.0001,
    driveRate: MAX_RATE,
    peakGain: 0.42,
    partials: 9,
    sigmaOct: 1.7,
  });

  // ── the JI drone bed ───────────────────────────────────────────────────────
  const drone: DroneBank = startDroneBank(ctx, busIn, {
    root: 55,
    ratios: [1, 3 / 2, 2, 5 / 2, 3],
    cutoffLow: 180,
    cutoffHigh: 2200,
    peakGain: 0.26,
  });

  const bells: BellVoice[] = [];
  let surge = 0;

  const setVelocity = (v: number) => {
    const now = ctx.currentTime;
    const down = Math.max(0, v);
    const up = Math.max(0, -v);

    // drive so rate ≈ |velocity| (see engine construction), clamped 0..1.
    const dDrive = (down - IDLE_RATE) / (MAX_RATE - IDLE_RATE);
    const uDrive = up / MAX_RATE;
    descend.setDrive(Math.max(0, Math.min(1, dDrive)));
    climb.setDrive(Math.max(0, Math.min(1, uDrive)));

    // crossfade: descending you hear the fall; climbing swaps to the rise.
    const descendTarget = v >= 0 ? 1 : 0.12;
    const climbTarget = v < 0 ? 1 : 0;
    descendBus.gain.setTargetAtTime(descendTarget, now, 0.12);
    climbBus.gain.setTargetAtTime(climbTarget, now, 0.12);
  };

  const setDrive = (d: number) => {
    drone.setDrive(Math.max(0, Math.min(1, d)));
  };

  const setSurge = (s: number) => {
    surge = Math.max(0, Math.min(1, s));
    verb.setWet(0.3 + surge * 0.35);
  };

  const ringBell = (levelIndex: number, dir: number, intensity: number) => {
    const now = ctx.currentTime;
    const inten = Math.max(0.2, Math.min(1, intensity));
    const chord = BELL_PALETTE[((levelIndex % BELL_PALETTE.length) + BELL_PALETTE.length) % BELL_PALETTE.length];
    // Bell register nudges with travel direction to reinforce the octave motion.
    const base = 246.94 * Math.pow(2, dir < 0 ? 0.25 : -0.25);

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const peak = 0.16 * inten;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    const dur = 1.1 + inten * 0.9;
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    gain.connect(busIn);

    const oscs: OscillatorNode[] = [];
    for (let i = 0; i < chord.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.value = base * chord[i];
      const vg = ctx.createGain();
      vg.gain.value = 1 / (i + 1.4);
      osc.connect(vg);
      vg.connect(gain);
      osc.start(now);
      osc.stop(now + dur + 0.1);
      oscs.push(osc);
    }

    bells.push({ oscs, gain, endsAt: now + dur + 0.15 });

    // Polyphony cap — steal the oldest voice.
    while (bells.length > MAX_BELL_VOICES) {
      const old = bells.shift();
      if (!old) break;
      try {
        old.gain.gain.cancelScheduledValues(now);
        old.gain.gain.setValueAtTime(Math.max(0.0001, old.gain.gain.value), now);
        old.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
        for (const o of old.oscs) o.stop(now + 0.12);
      } catch {
        /* already ended */
      }
    }
  };

  const step = (dt: number) => {
    descend.step(dt);
    climb.step(dt);
    // reap finished bells
    const now = ctx.currentTime;
    for (let i = bells.length - 1; i >= 0; i--) {
      if (bells[i].endsAt < now) bells.splice(i, 1);
    }
  };

  const stop = () => {
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    } catch {
      /* ctx closing */
    }
    descend.stop();
    climb.stop();
    drone.stop();
    for (const b of bells) {
      try {
        for (const o of b.oscs) o.stop(now + 0.1);
      } catch {
        /* already stopped */
      }
    }
    bells.length = 0;
  };

  return { setVelocity, setDrive, setSurge, ringBell, step, stop };
}
