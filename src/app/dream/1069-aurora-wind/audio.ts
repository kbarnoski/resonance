// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the cosmic-ambient aurora voice for 1069-aurora-wind.
//
// Composes the shared psych engines:
//   • startShepard   — endless rising glissando; its drive (and so the speed of
//                      the eternal ascent) tracks the solar-wind SPEED.
//   • startDroneBank — low just-intonation bed; its drive tracks a blend of
//                      southward-Bz coupling + Kp geomagnetic activity (the drone
//                      SWELLS when the wind couples to the magnetosphere).
//   • createVoidReverb — a ~6 s vast tail both buses route through.
//   • a sparse high shimmer "ping" fired on strong southward-Bz events.
//
// All mapping math lives in applyWind(); the React layer just hands us samples.
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import type { SolarWind } from "./data";

export interface AuroraAudio {
  /** Advance the Shepard glissando. Call once per animation frame. */
  step(dt: number): void;
  /** Push the latest (live or synthetic) sample into the sound. */
  applyWind(w: SolarWind): void;
  /** Tear everything down. */
  stop(): void;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Map km/s in ~[280,750] to 0..1. */
function speedDrive(speed: number): number {
  return clamp01((speed - 280) / (750 - 280));
}

/** Southward Bz (more negative = stronger) folded to 0..1 over ~0..-20 nT. */
function southDrive(bz: number): number {
  return clamp01(-bz / 20);
}

export function startAuroraAudio(
  ctx: AudioContext,
  master: GainNode,
): AuroraAudio {
  const verb: VoidReverb = createVoidReverb(ctx, {
    seconds: 6,
    decay: 2.5,
    wet: 0.62,
  });
  verb.output.connect(master);

  const shepard: ShepardEngine = startShepard(ctx, verb.input, {
    dir: 1,
    partials: 9,
    centerOct: 4.2,
    sigmaOct: 1.7,
    baseRate: 0.02,
    driveRate: 0.18,
    peakGain: 0.34,
  });

  const drone: DroneBank = startDroneBank(ctx, verb.input, {
    root: 49, // ~G1 — a low cosmic floor
    ratios: [1, 3 / 2, 2, 9 / 4, 3, 4],
    cutoffLow: 180,
    cutoffHigh: 2400,
    peakGain: 0.3,
  });

  // ── sparse high shimmer ping ───────────────────────────────────────────────
  // A short bell-ish tone routed through the same void; fired only when Bz
  // swings strongly southward and not too often.
  let lastPing = -999;
  const firePing = (intensity: number) => {
    const now = ctx.currentTime;
    if (now - lastPing < 4) return; // keep it sparse
    lastPing = now;
    // Pick a high pentatonic-ish note so successive pings feel related.
    const notes = [1568, 1760, 2093, 2349, 2637]; // G6 A6 C7 D7 E7
    const f = notes[Math.floor(Math.random() * notes.length)];
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    const peak = 0.05 + 0.06 * clamp01(intensity);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    osc.connect(g);
    g.connect(verb.input);
    osc.start(now);
    osc.stop(now + 2.6);
  };

  let prevSouth = 0;

  return {
    step(dt: number) {
      shepard.step(dt);
    },
    applyWind(w: SolarWind) {
      const sp = speedDrive(w.speed);
      const south = southDrive(w.bz);
      const kp = clamp01(w.kp / 9);

      // Speed drives the endless ascent.
      shepard.setDrive(0.18 + 0.82 * sp);

      // Drone swells with magnetospheric coupling: southward Bz + Kp.
      const couple = clamp01(0.6 * south + 0.55 * kp);
      drone.setDrive(0.2 + 0.8 * couple);

      // Wetter void as the sky gets more energetic.
      verb.setWet(0.5 + 0.25 * clamp01(0.5 * sp + 0.5 * couple));

      // Fire a shimmer when southward coupling jumps to a strong level.
      if (south > 0.55 && south > prevSouth + 0.08) {
        firePing(south);
      }
      prevSouth = south;
    },
    stop() {
      shepard.stop();
      drone.stop();
    },
  };
}
