// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the audio-first engine for 1090-threshold-descent.
//
//   This piece is SOUND FIRST: eyes closed, on headphones, the ears carry the
//   whole descent. The graph is built from the shared psych engines plus a
//   hand-rolled HRTF panner ring and a missing-fundamental "light".
//
//   depth (0..1, from the tap-pace state machine) drives everything:
//     • Shepard–Risset ENDLESS FALL — deeper = faster, more committed plunge.
//     • Void convolution reverb — deeper = more cavernous wet mix.
//     • A ring of HRTF-panned just-intonation voices around the head — deeper =
//       more voices audible and the ring contracts tightly IN toward the head.
//     • The luminous LIGHT: two upper voices sit a small interval apart; their
//       difference frequency is a warm low partial we synthesise directly and
//       fade IN only near depth≈1 (stillness). The "tunnel-to-light" reward for
//       letting go — a missing-fundamental / difference-tone that blooms.
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import {
  createVoidReverb,
  type VoidReverb,
} from "../_shared/psych/convolutionVoid";

export interface DescentAudio {
  /** Feed the current depth 0..1 (deepest = stillness). */
  setDepth(depth: number): void;
  /** A brief tap acknowledgement — a soft spatial ping. */
  tapPing(): void;
  /** Advance time-based engines. Call every animation frame with dt seconds. */
  step(dt: number): void;
  /** Fade out and release everything. */
  stop(): void;
  /** 0..1 bloom of the luminous light partial, for the visual to read. */
  readonly light: number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

// A field of just-intonation ratios placed around the head. Low ratios sit
// close; higher ones ring further out and fade in only as the descent deepens.
const RING_RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];

export function startDescentAudio(ctx: AudioContext): DescentAudio {
  const ROOT = 110; // A2 — the just-intonation field's root.

  // ── Master bus ──────────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 2.0);

  // A gentle limiter-ish saturation so peaks never clip harshly.
  const safety = ctx.createDynamicsCompressor();
  safety.threshold.value = -10;
  safety.knee.value = 24;
  safety.ratio.value = 6;
  safety.attack.value = 0.006;
  safety.release.value = 0.25;
  master.connect(safety);
  safety.connect(ctx.destination);

  // ── Void reverb: the cistern the whole descent falls through ─────────────────
  const verb: VoidReverb = createVoidReverb(ctx, {
    seconds: 6,
    decay: 2.4,
    wet: 0.35,
  });
  verb.output.connect(master);

  // ── Shared beds ──────────────────────────────────────────────────────────────
  // Endless FALL — the perpetual plunge. Routed through the void.
  const shepard: ShepardEngine = startShepard(ctx, verb.input, {
    dir: -1,
    partials: 9,
    fLow: 27.5,
    centerOct: 3.6,
    sigmaOct: 1.5,
    baseRate: 0.02,
    driveRate: 0.24,
    peakGain: 0.34,
  });

  // A low just-intonation drone bed for the void floor.
  const drone: DroneBank = startDroneBank(ctx, verb.input, {
    root: 55,
    ratios: [1, 3 / 2, 2, 5 / 2],
    cutoffLow: 140,
    cutoffHigh: 900,
    peakGain: 0.22,
  });

  // ── HRTF ring: spatial voices around the head ────────────────────────────────
  interface RingVoice {
    osc: OscillatorNode;
    gain: GainNode;
    panner: PannerNode;
    ratio: number;
    angle: number; // radians around the head
    baseAngle: number;
  }

  const ringVoices: RingVoice[] = [];
  const ringBus = ctx.createGain();
  ringBus.gain.value = 0.5;
  ringBus.connect(verb.input);
  ringBus.connect(master); // a little dry so the ring stays present

  const N = RING_RATIOS.length;
  for (let i = 0; i < N; i++) {
    const ratio = RING_RATIOS[i];
    const baseAngle = (i / N) * Math.PI * 2;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = ROOT * ratio;
    // A touch of detune per voice for a living, choral field.
    osc.detune.value = (i - N / 2) * 3;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 20;
    panner.rolloffFactor = 1;

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(ringBus);
    osc.start();

    ringVoices.push({ osc, gain, panner, ratio, angle: baseAngle, baseAngle });
  }

  // ── The luminous LIGHT: a synthesised difference-tone / missing fundamental ──
  //   Two shimmering upper partials sit a just major second apart; their beat /
  //   difference frequency lands near ROOT. We also synthesise that warm low
  //   partial directly, so as the ear fuses the pair the "light" seems to emerge
  //   from nowhere — audible only near stillness (depth≈1).
  const lightBus = ctx.createGain();
  lightBus.gain.value = 0.0001;
  lightBus.connect(master);
  lightBus.connect(verb.input);

  const lightPartials: OscillatorNode[] = [];
  // Upper shimmer pair (difference ≈ ROOT).
  const upperA = ctx.createOscillator();
  upperA.type = "sine";
  upperA.frequency.value = ROOT * 5; // 550
  const upperB = ctx.createOscillator();
  upperB.type = "sine";
  upperB.frequency.value = ROOT * 5 + ROOT; // 660 → difference = 110 = ROOT
  // The warm luminous low tone the pair implies.
  const warm = ctx.createOscillator();
  warm.type = "triangle";
  warm.frequency.value = ROOT; // the "missing fundamental" made real

  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.16;
  const warmGain = ctx.createGain();
  warmGain.gain.value = 0.5;

  upperA.connect(shimmerGain);
  upperB.connect(shimmerGain);
  warm.connect(warmGain);
  shimmerGain.connect(lightBus);
  warmGain.connect(lightBus);

  for (const o of [upperA, upperB, warm]) {
    o.start();
    lightPartials.push(o);
  }

  // ── State ────────────────────────────────────────────────────────────────────
  let depth = 0;
  let light = 0; // smoothed bloom, exposed to the visual
  let swirl = 0; // slow rotation of the ring

  const setDepth = (d: number) => {
    depth = clamp01(d);
  };

  const tapPing = () => {
    // A soft spatial acknowledgement: nudge the ring's swirl and give a quick
    // brightness lift, without any hard click.
    const now = ctx.currentTime;
    ringBus.gain.cancelScheduledValues(now);
    ringBus.gain.setTargetAtTime(0.7, now, 0.02);
    ringBus.gain.setTargetAtTime(0.5, now + 0.05, 0.25);
  };

  const step = (dt: number) => {
    const cdt = Math.min(0.1, Math.max(0, dt));
    const now = ctx.currentTime;

    // Shepard: deeper = faster, more committed fall.
    shepard.setDrive(depth);
    shepard.step(cdt);

    // Drone floor swells a little with depth.
    drone.setDrive(0.2 + 0.5 * depth);

    // Void: deeper = more cavernous.
    verb.setWet(0.3 + 0.55 * depth);

    // The ring contracts IN toward the head as depth rises, and more of the
    // higher voices fade in. Distance goes from far (surface) to intimate (deep).
    swirl += (0.05 + 0.12 * depth) * cdt; // slow drift, never dizzying
    const ringRadius = 6 - 5.2 * depth; // 6 (far) → 0.8 (close, at the head)

    for (let i = 0; i < ringVoices.length; i++) {
      const v = ringVoices[i];
      v.angle = v.baseAngle + swirl;
      const x = Math.sin(v.angle) * ringRadius;
      const z = Math.cos(v.angle) * ringRadius;
      // A little vertical spread so it isn't a flat circle.
      const y = Math.sin(v.angle * 1.5) * ringRadius * 0.25;
      v.panner.positionX.setTargetAtTime(x, now, 0.08);
      v.panner.positionY.setTargetAtTime(y, now, 0.08);
      v.panner.positionZ.setTargetAtTime(z, now, 0.08);

      // Higher ratios (further up the field) fade in only as we go deeper.
      const tier = i / (ringVoices.length - 1); // 0..1 up the field
      const audibleFrom = tier * 0.7; // top voices need depth ≳ 0.7
      const voiceOpen = clamp01((depth - audibleFrom) / 0.3);
      const target = 0.09 * voiceOpen;
      v.gain.gain.setTargetAtTime(Math.max(0.0001, target), now, 0.15);
    }

    // The LIGHT blooms only near stillness. Sharp threshold so it feels earned.
    const lightTarget = clamp01((depth - 0.78) / 0.22);
    const eased = lightTarget * lightTarget; // slow start, then blooms
    const la = 1 - Math.exp(-cdt / 1.4);
    light += (eased - light) * la;
    lightBus.gain.setTargetAtTime(Math.max(0.0001, light * 0.5), now, 0.2);
    // A slow luminance drift in the shimmer as it opens (never a flicker).
    warm.detune.setTargetAtTime(Math.sin(swirl * 0.5) * 4, now, 0.3);
  };

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    } catch {
      /* ctx closing */
    }
    shepard.stop();
    drone.stop();
    const killAt = now + 1.0;
    for (const v of ringVoices) {
      try {
        v.osc.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
    for (const o of lightPartials) {
      try {
        o.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
  };

  return {
    setDepth,
    tapPing,
    step,
    stop,
    get light() {
      return light;
    },
  };
}
