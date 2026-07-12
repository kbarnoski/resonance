// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — Web Audio for the theta-tide.
//
// Everything routes through a DynamicsCompressor limiter into a master gain that
// ramps from silence to <= 0.22. Under the piece sits a slow evolving pedal
// (shared startDroneBank) plus a Shepard glissando (shared startShepard) tied to
// the REBUS drive. Over that, each wavefront-crossing event from the WaveEngine
// strikes a short INHARMONIC partial cluster (a struck bell), panned by the
// crossed zone's screen angle — so the visible sweep and the audible sweep share
// a location. Continuous / inharmonic pitch only: no scale index, no phasing.
// ≤ 14 concurrent voices; full teardown on dispose().
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import type { StrikeEvent } from "./sim";

const MASTER_MAX = 0.2;
const MAX_VOICES = 14;
// Struck-bell inharmonic partial ratios (Risset-flavoured, not a musical scale).
const PARTIALS = [1, 2.76, 5.4, 8.93];

export interface ThetaAudio {
  resume(): Promise<void>;
  running(): boolean;
  strike(ev: StrikeEvent): void;
  setDrive(drive: number, dir: number): void;
  step(dt: number): void;
  dispose(): void;
}

export function makeThetaAudio(): ThetaAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let limiter: DynamicsCompressorNode | null = null;
  let drone: DroneBank | null = null;
  let shepard: ShepardEngine | null = null;
  let started = false;
  let disposed = false;
  const voiceStops: number[] = []; // currentTime values when each active voice ends

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

    drone = startDroneBank(context, limiter, { root: 46, peakGain: 0.14 });
    shepard = startShepard(context, limiter, { dir: 1, peakGain: 0.12, driveRate: 0.12 });
  };

  return {
    async resume() {
      if (disposed) return;
      if (!ctx) {
        const Ctor: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      if (!started || disposed) return;
      drone?.setDrive(drive);
      // dir folds into brightness only — the shared Shepard direction is fixed at
      // construction (an endless ascent as entropy rises); a real direction flip
      // is a cycle-2 feature. Bias drive slightly by |dir| to keep it engaged.
      shepard?.setDrive(Math.min(1, drive * (0.7 + 0.3 * Math.abs(dir))));
    },
    step(dt: number) {
      if (!started || disposed) return;
      shepard?.step(dt);
    },
    strike(ev: StrikeEvent) {
      if (!started || disposed || !ctx || !limiter) return;
      const now = ctx.currentTime;
      // prune finished voices, then respect the polyphony cap.
      for (let i = voiceStops.length - 1; i >= 0; i--) {
        if (voiceStops[i] <= now) voiceStops.splice(i, 1);
      }
      if (voiceStops.length >= MAX_VOICES) return;

      const g = ctx.createGain();
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, ev.pan * 0.85));
      g.connect(pan);
      pan.connect(limiter);

      const peak = Math.min(0.5, 0.12 + 0.18 * ev.amp * ev.bright);
      const dur = 0.5 + 1.2 * ev.bright;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(peak, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      for (let pi = 0; pi < PARTIALS.length; pi++) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = ev.freq * PARTIALS[pi] * (1 + 0.004 * pi);
        const pg = ctx.createGain();
        pg.gain.value = 1 / (pi + 1.6);
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
