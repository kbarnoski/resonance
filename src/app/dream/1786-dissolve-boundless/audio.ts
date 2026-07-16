// ─────────────────────────────────────────────────────────────────────────────
// 1786-dissolve-boundless — the sound of dissolution.
//
// Cosmic-ambient, not intense: a just-intonation drone bed (shared droneBank)
// under an endless Shepard–Risset drift (shared shepard). Both are wired to a
// single AudioContext created inside the "Begin" gesture.
//
// The audio tracks the visual state directly. As `cohesion` falls (the sphere
// unravels toward boundlessness) we RAISE the dissolution drive: the drone's
// filter opens and detunes wider, and the Shepard glide brightens/quickens — the
// felt "widening" of the boundary. As the swarm re-coheres (cohesion→1) both
// pull back to a calm, narrow sub.
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

export interface DissolveAudio {
  /** Feed the current cohesion (0..1) + dt each frame; sound follows. */
  update(cohesion: number, dtSec: number): void;
  stop(): void;
}

export function startDissolveAudio(
  ctx: AudioContext,
  destination: AudioNode,
): DissolveAudio {
  // Master bus — kept gentle for the calm/awe pole.
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 3.0);
  master.connect(destination);

  // Slow, wide, cool drone — the body of the boundless field.
  const drone: DroneBank = startDroneBank(ctx, master, {
    root: 48.999, // ~G1, low and calm
    ratios: [1, 3 / 2, 2, 9 / 4, 3],
    cutoffLow: 180,
    cutoffHigh: 2200,
    peakGain: 0.34,
  });

  // Endless upward drift — the sense of expansion with no edge.
  const shepard: ShepardEngine = startShepard(ctx, master, {
    baseRate: 0.012,
    driveRate: 0.11,
    sigmaOct: 1.7,
    peakGain: 0.32,
  });

  let stopped = false;

  const update = (cohesion: number, dtSec: number) => {
    if (stopped) return;
    const coh = Math.min(1, Math.max(0, cohesion));
    const dissolve = 1 - coh; // 0 = ego, 1 = boundless

    // Drone widens/opens as dissolution deepens.
    drone.setDrive(0.12 + 0.78 * dissolve);

    // Shepard stays a gentle floor drift when cohesive, brightens as it dissolves.
    shepard.setDrive(0.1 + 0.55 * dissolve);
    shepard.step(dtSec);
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    } catch {
      /* ctx closing */
    }
    drone.stop();
    shepard.stop();
  };

  return { update, stop };
}
