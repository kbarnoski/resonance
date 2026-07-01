// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the living field sings.
//
//   The Lenia field is read each frame into cheap global summaries (mass,
//   centroid, motion, activity) and mapped to a just-intonation additive/FM
//   choir:
//     • total mass   → drone fullness (a stacked JI chord swells with more life)
//     • growth/birth → soft plucked JI bells, pitch quantized to a JI scale by
//                       the creature centroid height (higher creatures = higher)
//     • turbulence   → a shimmer band (bright partials that fade as motion falls)
//   Everything routes through a master DynamicsCompressor; bell polyphony is
//   capped with voice-stealing. It stays consonant and evolving, never a loop.
//
//   Self-contained (no _shared dependency) so the piece owns its whole sound.
// ─────────────────────────────────────────────────────────────────────────────

import type { FieldStats } from "./lenia";

// A 7-tone just-intonation scale (ratios over the root), ascending.
const JI_SCALE = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];
const ROOT = 98; // G2-ish, Hz

const MAX_BELLS = 8;

interface Bell {
  osc: OscillatorNode;
  mod: OscillatorNode;
  modGain: GainNode;
  gain: GainNode;
  endsAt: number;
}

export interface AudioEngine {
  /** feed the latest field summary; call every frame */
  update(stats: FieldStats, dt: number): void;
  /** ring a bell explicitly (e.g. on a tap that seeds a creature) */
  pluck(centroidY: number, strength: number): void;
  setMuted(m: boolean): void;
  resume(): Promise<void>;
  dispose(): void;
  readonly context: AudioContext;
}

export function createAudio(): AudioEngine {
  const AC: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();

  // ── master chain ──
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 3.2;
  comp.attack.value = 0.008;
  comp.release.value = 0.28;
  master.connect(comp);
  comp.connect(ctx.destination);

  const muteGain = ctx.createGain();
  muteGain.gain.value = 1;
  muteGain.connect(master);

  // ── drone: a stacked JI chord, each partial its own gain we drive by mass ──
  const droneBus = ctx.createGain();
  droneBus.gain.value = 0.0001;
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 500;
  droneFilter.Q.value = 0.6;
  droneBus.connect(droneFilter);
  droneFilter.connect(muteGain);

  const droneRatios = [1, 3 / 2, 2, 5 / 2];
  const droneVoices = droneRatios.map((ratio, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sawtooth" : "triangle";
    osc.frequency.value = ROOT * ratio;
    // gentle detune shimmer between partials keeps the drone alive
    osc.detune.value = (i - 1.5) * 4;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.5 : 0.25 / i;
    osc.connect(g);
    g.connect(droneBus);
    osc.start();
    return { osc, g };
  });

  // ── shimmer: a bright, narrow band driven by turbulence ──
  const shimmerBus = ctx.createGain();
  shimmerBus.gain.value = 0.0001;
  const shimmerHP = ctx.createBiquadFilter();
  shimmerHP.type = "highpass";
  shimmerHP.frequency.value = 1400;
  shimmerBus.connect(shimmerHP);
  shimmerHP.connect(muteGain);
  const shimmerOscs = [3, 4, 5].map((mult, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = ROOT * mult * (i % 2 === 0 ? 2 : 3);
    osc.detune.value = (i - 1) * 7;
    const g = ctx.createGain();
    g.gain.value = 0.2;
    osc.connect(g);
    g.connect(shimmerBus);
    osc.start();
    return osc;
  });

  // ── bells (plucked JI, FM) with voice-stealing ──
  const bellBus = ctx.createGain();
  bellBus.gain.value = 0.5;
  bellBus.connect(muteGain);
  const bells: Bell[] = [];

  function ringBell(freq: number, strength: number) {
    const now = ctx.currentTime;
    // voice-steal: if full, retire the voice ending soonest
    if (bells.length >= MAX_BELLS) {
      let idx = 0;
      for (let i = 1; i < bells.length; i++) if (bells[i].endsAt < bells[idx].endsAt) idx = i;
      const victim = bells[idx];
      try {
        victim.gain.gain.cancelScheduledValues(now);
        victim.gain.gain.setTargetAtTime(0, now, 0.03);
        victim.osc.stop(now + 0.2);
        victim.mod.stop(now + 0.2);
      } catch {
        /* already stopped */
      }
      bells.splice(idx, 1);
    }
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    // FM: a modulator a fifth up gives a bell-like inharmonic ping that decays
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 2.005;
    const modGain = ctx.createGain();
    const modDepth = 90 + strength * 220;
    modGain.gain.setValueAtTime(modDepth, now);
    modGain.gain.exponentialRampToValueAtTime(1, now + 0.9);
    mod.connect(modGain);
    modGain.connect(osc.frequency);

    const gain = ctx.createGain();
    const peak = 0.16 + strength * 0.18;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    const dur = 1.4 + strength * 1.6;
    gain.gain.exponentialRampToValueAtTime(0.0006, now + dur);

    osc.connect(gain);
    gain.connect(bellBus);
    osc.start(now);
    mod.start(now);
    osc.stop(now + dur + 0.1);
    mod.stop(now + dur + 0.1);
    bells.push({ osc, mod, modGain, gain, endsAt: now + dur });
    // prune finished
    for (let i = bells.length - 1; i >= 0; i--) if (bells[i].endsAt < now - 0.1) bells.splice(i, 1);
  }

  function quantize(centroidY: number): number {
    // higher creatures (smaller y) → higher pitch. Map y∈[0,1] → scale degree.
    const up = 1 - Math.min(1, Math.max(0, centroidY));
    const octaves = 2;
    const pos = up * (JI_SCALE.length - 1 + octaves * (JI_SCALE.length - 1));
    const deg = Math.round(pos);
    const octave = Math.floor(deg / (JI_SCALE.length - 1));
    const idx = deg % (JI_SCALE.length - 1);
    return ROOT * JI_SCALE[idx] * Math.pow(2, octave);
  }

  // birth-event detection: mass rising sharply → new life → bells
  let prevMass = 0;
  let bellCooldown = 0;
  let started = false;

  const engine: AudioEngine = {
    context: ctx,
    update(stats, dt) {
      const now = ctx.currentTime;
      // drone fullness from mass (soft compression of mass into 0..1)
      const drive = Math.min(1, stats.mass * 3.2);
      const target = 0.0001 + drive * 0.5;
      droneBus.gain.setTargetAtTime(target, now, 0.25);
      droneFilter.frequency.setTargetAtTime(420 + drive * 1600, now, 0.3);
      // give each drone partial a slow living wobble by activity
      droneVoices.forEach((v, i) => {
        v.g.gain.setTargetAtTime((i === 0 ? 0.5 : 0.25 / i) * (0.6 + drive * 0.6), now, 0.4);
      });

      // shimmer from motion/turbulence
      const turb = Math.min(1, stats.motion * 42);
      shimmerBus.gain.setTargetAtTime(0.0001 + turb * 0.12, now, 0.15);
      shimmerHP.frequency.setTargetAtTime(1200 + turb * 2200, now, 0.2);
      shimmerOscs.forEach((o, i) => o.detune.setTargetAtTime((i - 1) * 7 + turb * 20, now, 0.3));

      // birth bells: mass rising fast, gated by a cooldown
      bellCooldown -= dt;
      const rise = stats.mass - prevMass;
      prevMass = stats.mass;
      if (started && bellCooldown <= 0 && rise > 0.0007 && stats.mass > 0.01) {
        const strength = Math.min(1, rise * 400 + stats.activity * 2);
        ringBell(quantize(stats.centroidY), strength);
        bellCooldown = 0.16 + (1 - strength) * 0.4;
      }
    },
    pluck(centroidY, strength) {
      ringBell(quantize(centroidY), Math.min(1, Math.max(0.2, strength)));
    },
    setMuted(m) {
      muteGain.gain.setTargetAtTime(m ? 0.0001 : 1, ctx.currentTime, 0.05);
    },
    async resume() {
      if (ctx.state !== "running") await ctx.resume();
      started = true;
    },
    dispose() {
      try {
        droneVoices.forEach((v) => v.osc.stop());
        shimmerOscs.forEach((o) => o.stop());
        bells.forEach((b) => {
          b.osc.stop();
          b.mod.stop();
        });
      } catch {
        /* ignore */
      }
      void ctx.close();
    },
  };
  return engine;
}
