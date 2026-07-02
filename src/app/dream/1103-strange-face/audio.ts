// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the sound of a face coming apart in the mirror.
//
//   A single `dissolve` 0..1 (raised by holding still, snapped back by motion)
//   drives three layers, all through a DynamicsCompressor limiter:
//
//     • BED    — the shared just-intonation drone bank. As the face dissolves we
//       LOWER its drive so its lowpass closes: the upper partials THIN out, the
//       bed hollows toward a darker sub. (droneBank.setDrive opens with drive;
//       we invert it so dissolution = thinning.)
//     • DETUNE — a couple of hand-built high partials whose detune SPREADS wide
//       with dissolve, so the harmony sours and beats — the drone "detunes."
//     • BEAT   — a slow sub pulse (AM sine) whose carrier DEEPENS (44→30 Hz) and
//       whose pulse SLOWS (0.7→0.2 Hz) and swells as dissolution deepens — the
//       "low slow beat that deepens."
//
//   A soft inharmonic CHIME/shiver fires once when the strange-face threshold is
//   crossed. Everything is present in both the live and autonomous modes.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

export interface StrangeAudio {
  /** 0..1 dissolution amount. */
  setDissolve(d: number): void;
  /** Fire the strange-face threshold shiver. */
  chime(): void;
  stop(): void;
}

export function startStrangeAudio(ctx: AudioContext): StrangeAudio {
  // Master limiter so nothing clips as layers swell.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.3;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(limiter);

  // A short ambient delay for the detune shimmer + chime to smear into space.
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.33;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(master);

  // ── BED: shared drone, thinning as the face dissolves ──────────────────────
  const drone: DroneBank = startDroneBank(ctx, master, {
    root: 55,
    peakGain: 0.26,
  });

  // ── DETUNE: high partials that spread apart with dissolve ──────────────────
  const detuneBus = ctx.createGain();
  detuneBus.gain.value = 0.0001;
  detuneBus.connect(master);
  detuneBus.connect(delay);
  const detuneOscs: OscillatorNode[] = [];
  const detuneRatios = [3, 4, 5];
  for (let i = 0; i < detuneRatios.length; i++) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 110 * detuneRatios[i];
    const g = ctx.createGain();
    g.gain.value = 0.22 / (i + 1);
    o.connect(g);
    g.connect(detuneBus);
    o.start();
    detuneOscs.push(o);
  }

  // ── BEAT: slow sub pulse that deepens ──────────────────────────────────────
  const subOsc = ctx.createOscillator();
  subOsc.type = "sine";
  subOsc.frequency.value = 44;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.0001; // AM depth set by LFO + base
  subOsc.connect(subGain);
  subGain.connect(master);

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.6;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.08;
  lfo.connect(lfoDepth);
  lfoDepth.connect(subGain.gain);
  subOsc.start();
  lfo.start();

  let stopped = false;

  const setDissolve = (raw: number) => {
    const d = Math.min(1, Math.max(0, raw));
    const now = ctx.currentTime;

    // Bed thins: lower drive → lower cutoff → fewer upper partials.
    drone.setDrive(0.55 * (1 - d) + 0.05);

    // Detune spreads and swells with dissolve; sours the harmony.
    for (let i = 0; i < detuneOscs.length; i++) {
      const cents = (i % 2 === 0 ? 1 : -1) * d * 45 * (i + 1) * 0.4;
      detuneOscs[i].detune.setTargetAtTime(cents, now, 0.4);
    }
    detuneBus.gain.setTargetAtTime(0.0002 + d * 0.05, now, 0.4);

    // Beat deepens (carrier drops) and slows (LFO drops) as it swells.
    subOsc.frequency.setTargetAtTime(44 - d * 14, now, 0.5);
    lfo.frequency.setTargetAtTime(0.7 - d * 0.5, now, 0.5);
    lfoDepth.gain.setTargetAtTime(0.06 + d * 0.16, now, 0.4);
  };

  const chime = () => {
    if (stopped) return;
    const now = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(master);
    bus.connect(delay);
    // Inharmonic shiver — a few detuned partials, gentle attack, long decay.
    const partials = [1, 2.33, 3.16, 4.51];
    const base = 720 + Math.random() * 160;
    for (let i = 0; i < partials.length; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = base * partials[i];
      o.detune.value = (i % 2 === 0 ? -6 : 6);
      const g = ctx.createGain();
      g.gain.value = 0.12 / (i + 1);
      o.connect(g);
      g.connect(bus);
      o.start(now);
      o.stop(now + 3.0);
    }
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(0.22, now + 0.08);
    bus.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
  };

  return {
    setDissolve,
    chime,
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      drone.stop();
      try {
        detuneBus.gain.cancelScheduledValues(now);
        detuneBus.gain.setValueAtTime(Math.max(0.0001, detuneBus.gain.value), now);
        detuneBus.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        master.gain.setTargetAtTime(0.0001, now, 0.3);
      } catch {
        /* ctx closing */
      }
      const killAt = now + 0.7;
      for (const o of [...detuneOscs, subOsc, lfo]) {
        try {
          o.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}
