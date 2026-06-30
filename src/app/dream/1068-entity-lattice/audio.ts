// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the DMT-ascent: a composition of the three SHARED psych engines.
//
//   • startShepard  → an endless RISING Shepard–Risset glissando. drive scales
//     the ascent rate + brightness — the felt "rising toward breakthrough".
//   • startDroneBank→ a just-intonation detuned bed whose lowpass + saturation
//     open with drive, so it grows teeth as you approach breakthrough.
//   • createVoidReverb → a vast cistern tail; both Shepard and drone route
//     through it, and its wet mix blooms with drive.
//
//   A single `drive` 0..1 (from body motion + arm-lift + arm-spread) is mapped
//   to every engine. A sudden surge in drive triggers a brief bell/pluck accent.
//   Everything passes through a DynamicsCompressor limiter into the destination.
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

export interface LatticeAudio {
  setDrive(d: number): void;
  /** 0..1 breakthrough amount from the scene — blooms a held high shimmer chord. */
  setBreakthrough(b: number): void;
  step(dt: number): void;
  stop(): void;
}

export function startAudio(ctx: AudioContext): LatticeAudio {
  // Master limiter so the saturated wall at breakthrough never clips harshly.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(limiter);

  // Reverb bus: Shepard + drone route through the void, blooming with drive.
  const verb: VoidReverb = createVoidReverb(ctx, {
    seconds: 4,
    decay: 3,
    wet: 0.4,
  });
  verb.output.connect(master);

  const sh: ShepardEngine = startShepard(ctx, verb.input, { dir: 1 });
  const drone: DroneBank = startDroneBank(ctx, verb.input, { root: 55 });

  // ── Breakthrough shimmer (cycle-2): a high just-intonation chord that stays
  // silent until the lattice latches the held mandala, then blooms in as the
  // "more real than real" ceiling tone. Routed through the void so it shimmers. ─
  const shimmer = ctx.createGain();
  shimmer.gain.value = 0.0001;
  shimmer.connect(verb.input);
  const shimmerOscs: OscillatorNode[] = [];
  const shimmerRatios = [1, 5 / 4, 3 / 2, 2, 5 / 2];
  for (let i = 0; i < shimmerRatios.length; i++) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 660 * shimmerRatios[i];
    o.detune.value = (i % 2 === 0 ? -3 : 3); // faint chorus beat
    const g = ctx.createGain();
    g.gain.value = 0.5 / (i + 1);
    o.connect(g);
    g.connect(shimmer);
    o.start();
    shimmerOscs.push(o);
  }

  // ── Accent voice: a metallic bell/pluck on sudden motion surges. ───────────
  let lastDrive = 0;
  let accentCooldown = 0;
  const accent = (intensity: number) => {
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(verb.input);
    // Inharmonic FM-ish bell from a couple of detuned partials.
    const partials = [1, 2.76, 5.4];
    const base = 660 + Math.random() * 220;
    for (let i = 0; i < partials.length; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = base * partials[i];
      const pg = ctx.createGain();
      pg.gain.value = (0.16 / (i + 1)) * intensity;
      o.connect(pg);
      pg.connect(g);
      o.start(now);
      o.stop(now + 1.6);
    }
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.6 * intensity + 0.05, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
  };

  let drive = 0;
  let brk = 0;

  // Drive + breakthrough both feed the core engines (breakthrough nudges the
  // ascent + drone a little brighter/faster) and the reverb wet mix.
  const applyAll = () => {
    const eff = Math.min(1, drive + brk * 0.25);
    sh.setDrive(eff);
    drone.setDrive(eff);
    // Reverb opens from cavernous-dry to fully wet immersion; breakthrough floods it.
    verb.setWet(Math.min(0.95, 0.35 + drive * 0.4 + brk * 0.2));
  };

  return {
    setDrive(d: number) {
      drive = Math.min(1, Math.max(0, d));
      applyAll();
    },
    setBreakthrough(b: number) {
      brk = Math.min(1, Math.max(0, b));
      // Shimmer chord blooms in above the threshold (brk > 0.5 = latched mandala).
      const lvl = Math.max(0.0001, Math.pow(Math.max(0, (brk - 0.45) / 0.55), 1.4) * 0.22);
      shimmer.gain.setTargetAtTime(lvl, ctx.currentTime, 0.25);
      applyAll();
    },
    step(dt: number) {
      sh.step(dt);
      if (accentCooldown > 0) accentCooldown -= dt;
      // A sudden jump in drive = a big body burst → bell accent.
      const surge = drive - lastDrive;
      if (surge > 0.16 && accentCooldown <= 0) {
        accent(Math.min(1, surge * 3));
        accentCooldown = 0.4;
      }
      lastDrive = drive;
    },
    stop() {
      sh.stop();
      drone.stop();
      const now = ctx.currentTime;
      try {
        shimmer.gain.cancelScheduledValues(now);
        shimmer.gain.setValueAtTime(Math.max(0.0001, shimmer.gain.value), now);
        shimmer.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      } catch {
        /* ctx closing */
      }
      for (const o of shimmerOscs) {
        try {
          o.stop(now + 0.7);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}
