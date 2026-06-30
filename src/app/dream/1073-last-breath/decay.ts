// ─────────────────────────────────────────────────────────────────────────────
// decay.ts — the irreversible audio engine for "last breath".
//
//   The sound is a finite, exhaustible MATERIAL: a fixed pool of additive
//   partials tuned to a calm just-intonation chord, each with its own private
//   "integrity" 0..1. The material only sounds while you HOLD a point of
//   contact. The instant you release, every voice fades and the sound vanishes.
//
//   The cost is real and permanent. Every second of LISTENING (holding)
//   erodes the material: partials lose integrity, the brightest ones crumble
//   first, the cohort detunes a little further from true, and the global
//   low-pass slowly closes. This erosion state PERSISTS for the whole session
//   — it is never restored by releasing or by holding again. The only way back
//   is a deliberate full reset, which destroys the version you made.
//
//   Reference: William Basinski, *The Disintegration Loops* (2002) — tape that
//   physically crumbled as it was played back, the music documenting its own
//   decay. Here the "tape" is a pool of partials and the "playhead" is your
//   willingness to keep holding.
//
//   This module owns its AudioContext and exposes a tiny imperative surface:
//     const engine = makeDecayEngine();
//     await engine.begin();         // creates ctx + graph (call inside a gesture)
//     engine.hold();                // the sound lives + slowly clarifies
//     engine.release();             // the sound begins to vanish
//     engine.reset();               // erase + restore the material (destroys it)
//     const s = engine.sample();    // { remaining, held, alive, partials }
//     await engine.dispose();       // full teardown
//
//   It composes the shared psych modules for the bed + tail:
//     _shared/psych/droneBank.ts      — a sub-drone foundation (kept very low)
//     _shared/psych/convolutionVoid.ts — a cavernous valedictory reverb tail
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

/** How many partials the finite material is made of. */
const PARTIAL_COUNT = 9;

/** Root frequency of the material (A2-ish, calm + low). */
const ROOT_HZ = 110;

/**
 * Just-intonation ratios for the material — a spacious, valedictory stack
 * (octave / fifth / octave+fifth / two octaves / +major third …). The higher
 * partials are the "brightness" and are deliberately the first to crumble.
 */
const RATIOS = [1, 3 / 2, 2, 5 / 2, 3, 4, 9 / 2, 5, 6];

/**
 * Erosion rate while HOLDING, in integrity-units lost per second across the
 * whole pool. Tuned so erosion is perceptible within a few seconds yet a full
 * "session" trends toward silence over a couple of minutes. Higher partials
 * erode faster (see crumbleWeight), so brightness goes first.
 */
const ERODE_PER_SEC = 0.018;

/** Extra erosion applied the instant a hold STARTS — re-engaging the playhead
 *  always costs a little, so you can never listen "for free". */
const ERODE_PER_HOLD = 0.006;

/** Brightness-first weighting: partial i erodes at this multiple of the base
 *  rate. The top of the spectrum disintegrates well before the fundamental. */
function crumbleWeight(i: number): number {
  // 1.0 for the fundamental, climbing toward ~3.2 for the brightest partial.
  return 1 + (i / (PARTIAL_COUNT - 1)) * 2.2;
}

export interface DecaySample {
  /** Remaining material, 0..1 (mean integrity across the pool). */
  remaining: number;
  /** Is a hold currently active? */
  held: boolean;
  /** Is any material left to hear? (remaining above the silence floor.) */
  alive: boolean;
  /** Per-partial integrity 0..1, for the visual readout. */
  partials: number[];
  /** Whole-session cumulative seconds of listening (held time). */
  listened: number;
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  ratio: number;
  /** Integrity 0..1 — permanently erodes; never restored except by reset(). */
  integrity: number;
  /** Accumulated detune drift in cents (the material slips out of true). */
  detune: number;
}

export interface DecayEngine {
  begin(): Promise<void>;
  hold(): void;
  release(): void;
  /** Erase + restore the finite material. Destroys the eroded version. */
  reset(): void;
  /** Read the current state (cheap; safe to call every animation frame). */
  sample(): DecaySample;
  dispose(): Promise<void>;
  readonly ready: boolean;
}

/** Below this mean integrity we treat the material as effectively gone. */
const SILENCE_FLOOR = 0.012;

export function makeDecayEngine(): DecayEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let limiter: DynamicsCompressorNode | null = null;
  let voiceBus: GainNode | null = null;
  let reverb: VoidReverb | null = null;
  let drone: DroneBank | null = null;
  let voices: Voice[] = [];

  let held = false;
  let listened = 0;
  let lastTick = 0;
  let presence = 0; // 0..1 audible envelope of the material as a whole
  let rafId = 0;
  let ready = false;
  let disposed = false;

  const meanIntegrity = () =>
    voices.length === 0
      ? 0
      : voices.reduce((s, v) => s + v.integrity, 0) / voices.length;

  function buildVoices(c: AudioContext, bus: GainNode) {
    voices = [];
    for (let i = 0; i < PARTIAL_COUNT; i++) {
      const ratio = RATIOS[i] ?? RATIOS[RATIOS.length - 1];
      const osc = c.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = ROOT_HZ * ratio;
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(bus);
      osc.start();
      voices.push({ osc, gain, ratio, integrity: 1, detune: 0 });
    }
  }

  /** The audio loop: advance erosion + presence, then write node params.
   *  Runs on rAF so it self-throttles when the tab is hidden. */
  function step() {
    if (!ctx || disposed) return;
    const now = ctx.currentTime;
    const dt = Math.min(0.1, Math.max(0, now - lastTick));
    lastTick = now;

    // 1. Presence: rise toward 1 while held, fall toward 0 on release.
    //    The release fall is the "vanishing" — slow enough to feel like loss.
    const target = held ? 1 : 0;
    const rate = held ? 1.6 : 0.5; // clarify faster than it vanishes
    presence += (target - presence) * Math.min(1, dt * rate);

    // 2. Erosion: holding spends the material, permanently.
    if (held && dt > 0) {
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        const loss = ERODE_PER_SEC * crumbleWeight(i) * dt;
        v.integrity = Math.max(0, v.integrity - loss);
        // The material slips out of true as it crumbles — a slow detune drift.
        v.detune += dt * (4 + i * 1.5) * (1 - v.integrity);
      }
    }

    // 3. Write per-voice params. A voice's audible gain is integrity × presence,
    //    shaped so higher partials sit quieter (the sub stays the foundation).
    const mean = meanIntegrity();
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      const spectralTilt = 0.5 / v.ratio; // quieter up high
      const g = v.integrity * presence * spectralTilt * 0.42;
      v.gain.gain.setTargetAtTime(Math.max(0.0001, g), now, 0.05);
      v.osc.detune.setTargetAtTime(v.detune, now, 0.2);
    }

    // 4. The whole material darkens as it erodes — the global tail closes and
    //    the sub-drone sinks. Brightness leaving the spectrum is audible loss.
    if (drone) drone.setDrive(0.05 + mean * 0.35 * presence);
    if (reverb) reverb.setWet(0.45 + (1 - mean) * 0.4);
    if (voiceBus)
      voiceBus.gain.setTargetAtTime(
        mean > SILENCE_FLOOR ? 0.9 : 0.0001,
        now,
        0.3,
      );

    if (held) listened += dt;

    rafId = requestAnimationFrame(step);
  }

  return {
    get ready() {
      return ready;
    },

    async begin() {
      if (ready || disposed) return;
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AC();
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* will resume on next gesture via shared cleanup */
        }
      }

      master = ctx.createGain();
      master.gain.value = 0.85;

      limiter = ctx.createDynamicsCompressor();
      // A gentle brickwall-ish limiter so peaks never bite.
      limiter.threshold.value = -10;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.25;

      voiceBus = ctx.createGain();
      voiceBus.gain.value = 0.0001;

      reverb = createVoidReverb(ctx, { seconds: 6, decay: 2.6, wet: 0.45 });

      // Material voices → reverb → master. The reverb carries the vanishing.
      buildVoices(ctx, voiceBus);
      voiceBus.connect(reverb.input);
      reverb.output.connect(master);

      // A very low sub-drone foundation, deliberately quiet — felt, not heard.
      drone = startDroneBank(ctx, master, {
        root: ROOT_HZ / 2,
        ratios: [1, 3 / 2, 2],
        cutoffLow: 90,
        cutoffHigh: 700,
        peakGain: 0.08,
      });
      drone.setDrive(0.05);

      master.connect(limiter);
      limiter.connect(ctx.destination);

      lastTick = ctx.currentTime;
      ready = true;
      rafId = requestAnimationFrame(step);
    },

    hold() {
      if (!ready || disposed) return;
      if (!held) {
        held = true;
        // Re-engaging the playhead always costs a little, immediately.
        for (let i = 0; i < voices.length; i++) {
          const v = voices[i];
          v.integrity = Math.max(
            0,
            v.integrity - ERODE_PER_HOLD * crumbleWeight(i),
          );
        }
      }
    },

    release() {
      held = false;
    },

    reset() {
      if (!ready || disposed) return;
      // Erase + restore the finite material. This destroys the eroded version
      // you made — there is no undo, only a fresh, full pool.
      for (const v of voices) {
        v.integrity = 1;
        v.detune = 0;
      }
      listened = 0;
      held = false;
      presence = 0;
    },

    sample() {
      return {
        remaining: meanIntegrity(),
        held,
        alive: meanIntegrity() > SILENCE_FLOOR,
        partials: voices.map((v) => v.integrity),
        listened,
      };
    },

    async dispose() {
      if (disposed) return;
      disposed = true;
      ready = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      const c = ctx;
      try {
        drone?.stop();
      } catch {
        /* ctx closing */
      }
      if (c) {
        const now = c.currentTime;
        // Fade the bus + master before tearing nodes down to avoid clicks.
        try {
          master?.gain.setTargetAtTime(0.0001, now, 0.2);
          voiceBus?.gain.setTargetAtTime(0.0001, now, 0.2);
        } catch {
          /* ignore */
        }
        for (const v of voices) {
          try {
            v.osc.stop(now + 0.8);
          } catch {
            /* already stopped */
          }
        }
        // Let tails ring, then close the context.
        await new Promise((r) => setTimeout(r, 900));
        try {
          if (c.state !== "closed") await c.close();
        } catch {
          /* ignore */
        }
      }
      voices = [];
      ctx = null;
      master = null;
      limiter = null;
      voiceBus = null;
      reverb = null;
      drone = null;
    },
  };
}
