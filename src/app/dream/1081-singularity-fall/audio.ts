// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the sound of the fall (Web Audio).
//
//   Orbital motion → sound. A small stack of partials RED-SHIFTS (glides down in
//   pitch) as you approach the horizon — your own light/sound stretched by the
//   gravity well. A sub-bass "swallow" rises as the shadow fills the view. The
//   photon-ring crossing rings a bright bell/impact.
//
//   The drone bed reuses _shared/psych/droneBank.ts (canonical detuned just
//   drone + drive-opening filter). We wrap it and add: (1) a red-shifting
//   partial pair driven by arc progress, (2) a swallow sub whose gain+cutoff
//   grow with progress, (3) a one-shot photon-ring bell.
//
//   Start from a user gesture (AudioContext resume in the click handler).
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "@/app/dream/_shared/psych/droneBank";

export interface FallAudio {
  /** progress 0..1 (arc position) → red-shift glide + swallow swell + drive. */
  setProgress(p: number): void;
  /** ring a bright bell at the photon-ring crossing. */
  ringBell(): void;
  /** master fade + full teardown. */
  stop(): void;
}

export function startAudio(ctx: AudioContext): FallAudio {
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.85, ctx.currentTime + 2.0);

  // gentle limiter so bell + swallow can't clip the sum
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(master);
  master.connect(ctx.destination);

  // ── Canonical drone bed (dark root; opens with drive) ──
  const drone: DroneBank = startDroneBank(ctx, limiter, {
    root: 41.2, // E1 — a deep floor to fall into
    ratios: [1, 3 / 2, 2, 5 / 2],
    cutoffLow: 160,
    cutoffHigh: 2200,
    peakGain: 0.26,
  });

  // ── Red-shifting partial pair ──
  // Two detuned oscillators start bright and glide DOWN as progress rises
  // (gravitational red-shift of your own tone). f = base * (1 - 0.6*p).
  const shiftGain = ctx.createGain();
  shiftGain.gain.value = 0.0001;
  shiftGain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 3.0);
  const shiftFilter = ctx.createBiquadFilter();
  shiftFilter.type = "lowpass";
  shiftFilter.frequency.value = 1800;
  shiftFilter.connect(shiftGain);
  shiftGain.connect(limiter);

  const shiftBase = [330, 440]; // E4-ish + A4-ish
  const shiftOscs: OscillatorNode[] = shiftBase.map((f, i) => {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    o.detune.value = i === 0 ? -6 : 6;
    o.connect(shiftFilter);
    o.start();
    return o;
  });

  // ── Swallow sub — a rising sub-bass rumble as the shadow fills the view ──
  const swallow = ctx.createOscillator();
  swallow.type = "sine";
  swallow.frequency.value = 30;
  const swallowGain = ctx.createGain();
  swallowGain.gain.value = 0.0001;
  const swallowLP = ctx.createBiquadFilter();
  swallowLP.type = "lowpass";
  swallowLP.frequency.value = 90;
  swallow.connect(swallowGain);
  swallowGain.connect(swallowLP);
  swallowLP.connect(limiter);
  swallow.start();

  // slight noise-driven shimmer feeding the swallow's amplitude for a living rumble
  let stopped = false;

  function setProgress(p: number): void {
    const q = Math.min(1, Math.max(0, p));
    const now = ctx.currentTime;
    drone.setDrive(q);
    // red-shift glide: pitch bends down toward the horizon.
    for (let i = 0; i < shiftOscs.length; i++) {
      const f = shiftBase[i] * (1 - 0.62 * q);
      shiftOscs[i].frequency.setTargetAtTime(f, now, 0.25);
    }
    // as the tone red-shifts, close its filter so highs are lost too.
    shiftFilter.frequency.setTargetAtTime(1800 * (1 - 0.7 * q) + 120, now, 0.3);
    // swallow sub swells + drops slightly in pitch (a deepening well).
    swallowGain.gain.setTargetAtTime(0.0001 + q * q * 0.4, now, 0.3);
    swallow.frequency.setTargetAtTime(30 - q * 8, now, 0.4);
    swallowLP.frequency.setTargetAtTime(90 + q * 60, now, 0.3);
  }

  function ringBell(): void {
    if (stopped) return;
    const now = ctx.currentTime;
    // bright inharmonic bell — the photon ring crossing.
    const partials = [1, 2.76, 5.4, 8.9];
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);
    g.connect(limiter);
    for (const m of partials) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 660 * m;
      const pg = ctx.createGain();
      pg.gain.value = 1 / (m * m);
      o.connect(pg);
      pg.connect(g);
      o.start(now);
      o.stop(now + 3.3);
    }
  }

  function stop(): void {
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
    const killAt = now + 0.7;
    for (const o of shiftOscs) {
      try {
        o.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
    try {
      swallow.stop(killAt);
    } catch {
      /* already stopped */
    }
  }

  return { setProgress, ringBell, stop };
}
