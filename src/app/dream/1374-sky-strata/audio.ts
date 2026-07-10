// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the sky's voice for 1374-sky-strata.
//
// Two layers, one key:
//   • THE SKY COMPOSES — a cosmic pad (shared startDroneBank, its drive fed by
//     the mapping `energy`) under a self-scheduling generative pentatonic arp at
//     the mapping tempo, sent through the shared createVoidReverb. The scale goes
//     major→minor pentatonic as Bz turns southward. Always consonant.
//   • YOU PLAY OVER IT — pluck() sounds a brighter FOREGROUND voice in the same
//     key, a whole octave up, so tapping a band or a key duets with the sky.
//
// Master ≤ 0.22, exp fade-in ~2s, DynamicsCompressor limiter before the
// destination. AudioContext is created only after the Begin gesture (page.tsx).
// stop() tears the whole graph down; the page closes the context.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import { scaleFreq, type Drivers } from "./mapping";

export interface SkyAudio {
  /** Apply a fresh set of drivers; ramps the pad + retunes the arp. */
  applyDrivers(d: Drivers): void;
  /** Pluck a foreground voice (band index / key index → scale degree). */
  pluck(index: number): void;
  /** Drag emphasis 0..1 shifts the arp register up a few pentatonic steps. */
  setEmphasis(e: number): void;
  /** Full teardown: stop arp, drone, cancel timers. */
  stop(): void;
}

// A wandering pentatonic figure (scale degrees), mid-register base of 5.
const ARP_PATTERN = [0, 2, 4, 3, 5, 2, 4, 6, 4, 2];

export function startSky(ctx: AudioContext, initial: Drivers): SkyAudio {
  const now = ctx.currentTime;

  // ── Master chain: (pad + reverb) → limiter → master → destination ───────────
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.22, now + 2);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.25;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  // Cosmic pad bed.
  const drone: DroneBank = startDroneBank(ctx, master, {
    root: 55,
    peakGain: 0.16,
    cutoffLow: 200,
    cutoffHigh: 2400,
  });
  drone.setDrive(initial.energy);

  // Shared void reverb for the arp + played voices.
  const reverb: VoidReverb = createVoidReverb(ctx, { seconds: 4.5, decay: 3, wet: 0.6 });
  reverb.output.connect(master);

  let drivers = initial;
  let stopped = false;
  let arpStep = 0;
  let emphasis = 0;
  let arpTimer: ReturnType<typeof setTimeout> | null = null;

  // ── One generative arp note through the reverb ──────────────────────────────
  function playArpNote(): void {
    if (stopped) return;
    const degree = 3 + ARP_PATTERN[arpStep % ARP_PATTERN.length] + Math.round(emphasis * 3);
    arpStep++;
    const freq = scaleFreq(drivers, degree);
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);

    const g = ctx.createGain();
    const peak = 0.06 + drivers.energy * 0.05;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);

    osc.connect(g);
    g.connect(reverb.input);
    osc.start(t);
    osc.stop(t + 1.0);
  }

  function scheduleArp(): void {
    if (stopped) return;
    playArpNote();
    arpTimer = setTimeout(scheduleArp, Math.max(90, drivers.tempo * 1000));
  }
  scheduleArp();

  return {
    applyDrivers(d: Drivers) {
      drivers = d;
      drone.setDrive(d.energy);
      reverb.setWet(0.5 + d.energy * 0.2);
    },

    pluck(index: number) {
      if (stopped) return;
      // Foreground voice: an octave above the arp (pentatonic has 5 degrees) so
      // it reads as "played" over the sky.
      const degree = 5 + Math.max(0, index) + Math.round(emphasis * 2);
      const freq = scaleFreq(drivers, degree);
      const t = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      const shimmer = ctx.createOscillator();
      shimmer.type = "triangle";
      shimmer.frequency.setValueAtTime(freq * 2, t);
      const shimmerGain = ctx.createGain();
      shimmerGain.gain.setValueAtTime(0.25, t);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);

      osc.connect(g);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(g);
      // A little dry + a lot wet so the played voice sits in front of the sky.
      g.connect(master);
      g.connect(reverb.input);
      osc.start(t);
      shimmer.start(t);
      osc.stop(t + 1.5);
      shimmer.stop(t + 1.5);
    },

    setEmphasis(e: number) {
      emphasis = Math.min(1, Math.max(0, e));
    },

    stop() {
      if (stopped) return;
      stopped = true;
      if (arpTimer !== null) {
        clearTimeout(arpTimer);
        arpTimer = null;
      }
      drone.stop();
      const t = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      } catch {
        /* ctx closing */
      }
    },
  };
}
