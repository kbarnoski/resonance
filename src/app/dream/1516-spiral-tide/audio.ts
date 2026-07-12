// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — Web Audio for Spiral Tide.
//
// Gesture-gated: the AudioContext is created only inside the Begin handler. A
// master gain ramps from silence to ≤ 0.2 through a DynamicsCompressor limiter
// before ctx.destination. Under the piece sit the shared pedal drone
// (startDroneBank) and a Shepard–Risset glissando bed (startShepard) whose
// DIRECTION reverses with the ← / → attentional flip. Over that, each
// wavefront-crossing StrikeEvent from the field rings a short INHARMONIC struck-
// bell cluster (partials [1, 2.13, 3.71, 5.94]), panned to the front's on-screen
// angle — so in the SPIRAL state you hear the spiral turn. Continuous /
// inharmonic pitch only: no scale index, no just-intonation lookup, no phasing.
// ≤ 14 concurrent voices; full teardown on dispose().
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import type { StrikeEvent } from "./field";

const MASTER_MAX = 0.2;
const MAX_VOICES = 14;
// Struck-bell inharmonic partial cluster (a bell, not a musical chord).
const PARTIALS = [1, 2.13, 3.71, 5.94];

export interface SpiralAudio {
  resume(): Promise<void>;
  running(): boolean;
  strike(ev: StrikeEvent): void;
  setDrive(drive: number, dir: number): void;
  step(dt: number): void;
  dispose(): void;
}

export function makeSpiralAudio(): SpiralAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let limiter: DynamicsCompressorNode | null = null;
  let drone: DroneBank | null = null;
  let shepard: ShepardEngine | null = null;
  let shepardDir: 1 | -1 = 1;
  let started = false;
  let disposed = false;
  const voiceStops: number[] = [];

  const buildShepard = (context: AudioContext, dir: 1 | -1) => {
    if (!limiter) return;
    shepard = startShepard(context, limiter, {
      dir,
      peakGain: 0.11,
      driveRate: 0.13,
    });
  };

  const build = (context: AudioContext) => {
    limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    master = context.createGain();
    master.gain.value = 0.0001;
    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(MASTER_MAX, context.currentTime + 3.0);

    limiter.connect(master);
    master.connect(context.destination);

    drone = startDroneBank(context, limiter, { root: 48, peakGain: 0.13 });
    buildShepard(context, shepardDir);
  };

  return {
    async resume() {
      if (disposed) return;
      if (!ctx) {
        const Ctor: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new Ctor();
        build(ctx);
      }
      await ctx.resume();
      started = true;
    },
    running() {
      return started && !disposed;
    },
    setDrive(drive: number, dir: number) {
      if (!started || disposed || !ctx) return;
      drone?.setDrive(drive);
      // A genuine Shepard direction reversal (cycle-2 feature): rebuild the
      // glissando bed pointing the other way when the wave direction flips.
      const want: 1 | -1 = dir >= 0 ? 1 : -1;
      if (want !== shepardDir) {
        shepardDir = want;
        try {
          shepard?.stop();
        } catch {
          /* closing */
        }
        buildShepard(ctx, want);
      }
      shepard?.setDrive(Math.min(1, drive));
    },
    step(dt: number) {
      if (!started || disposed) return;
      shepard?.step(dt);
    },
    strike(ev: StrikeEvent) {
      if (!started || disposed || !ctx || !limiter) return;
      const now = ctx.currentTime;
      for (let i = voiceStops.length - 1; i >= 0; i--) {
        if (voiceStops[i] <= now) voiceStops.splice(i, 1);
      }
      if (voiceStops.length >= MAX_VOICES) return;

      const g = ctx.createGain();
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, ev.pan * 0.9));
      g.connect(pan);
      pan.connect(limiter);

      const peak = Math.min(0.5, 0.1 + 0.2 * ev.amp * ev.bright);
      const dur = 0.55 + 1.4 * ev.bright;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(peak, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      for (let pi = 0; pi < PARTIALS.length; pi++) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = ev.freq * PARTIALS[pi] * (1 + 0.003 * pi);
        const pg = ctx.createGain();
        pg.gain.value = 1 / (pi + 1.7);
        o.connect(pg);
        pg.connect(g);
        o.start(now);
        o.stop(now + dur + 0.05);
      }
      voiceStops.push(now + dur);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      started = false;
      try {
        drone?.stop();
        shepard?.stop();
      } catch {
        /* closing */
      }
      const c = ctx;
      if (c) {
        setTimeout(() => {
          try {
            c.close();
          } catch {
            /* already closed */
          }
        }, 900);
      }
      ctx = null;
      master = null;
      limiter = null;
      drone = null;
      shepard = null;
    },
  };
}
