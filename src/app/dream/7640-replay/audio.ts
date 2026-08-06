// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the sound of a memory replaying itself.
//
//   Each ignition (the wavefront crossing a remembered event) triggers one voice
//   on a just-intonation 7-note modal scale (see memory.ts). Pitch = event
//   degree; REGISTER tracks the event's radius (its position in the tunnel
//   sweep, 0..1), so as the front rushes outward the notes climb ~2 octaves —
//   the tunnel rush is audible, not just visible. Underneath sits a Shepard–
//   Risset endless DESCENT (the NDE plunge), and every voice feeds a feedback
//   delay for an LSD-tracer tail. All gain moves go through setTargetAtTime.
// ─────────────────────────────────────────────────────────────────────────────

import { SCALE_RATIOS } from "./memory";
import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";

const TONIC = 174.61; // F3 — a low, warm tonic for the tunnel

export interface ReplayAudio {
  /** Fire one note. `pe` is the event's normalized radius (0 = core, 1 = rim). */
  ignite(degree: number, pe: number): void;
  /** 0..1 dose — opens the tone and drives the descent drone. */
  setDose(d: number): void;
  /** Advance the endless descent. Call once per frame with dt seconds. */
  step(dt: number): void;
  /** Fade + tear the whole graph down. */
  stop(): void;
}

export function makeReplayAudio(ctx: AudioContext, dose = 0.2): ReplayAudio {
  const now0 = ctx.currentTime;

  // master bus: gentle low-pass, then out
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setTargetAtTime(0.9, now0, 0.4);

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 3200;
  tone.Q.value = 0.5;
  tone.connect(master);
  master.connect(ctx.destination);

  // dry + feedback-delay "reverb" tail
  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  dry.connect(tone);

  const wetIn = ctx.createGain();
  wetIn.gain.value = 0.5;
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.34;
  const fb = ctx.createGain();
  fb.gain.value = 0.46;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2200;
  const wetOut = ctx.createGain();
  wetOut.gain.value = 0.5;

  wetIn.connect(delay);
  delay.connect(damp);
  damp.connect(fb);
  fb.connect(delay); // feedback loop
  damp.connect(wetOut);
  wetOut.connect(tone);

  // Shepard–Risset endless descent — the tunnel plunge drone
  const drone: ShepardEngine = startShepard(ctx, master, {
    dir: -1,
    peakGain: 0.16,
    centerOct: 3.4,
    sigmaOct: 1.5,
    driveRate: 0.1,
  });
  drone.setDrive(dose * 0.85);

  let curDose = dose;

  const setDose = (d: number) => {
    curDose = Math.min(1, Math.max(0, d));
    const now = ctx.currentTime;
    // brighter, more open as dose rises
    tone.frequency.setTargetAtTime(2600 + curDose * 4200, now, 0.3);
    fb.gain.setTargetAtTime(0.4 + curDose * 0.18, now, 0.3);
    drone.setDrive(curDose * 0.85);
  };

  const ignite = (degree: number, pe: number) => {
    const now = ctx.currentTime;
    const ratio = SCALE_RATIOS[Math.min(6, Math.max(0, degree | 0))];
    const oct = Math.min(2.2, Math.max(0, pe * 2)); // register climbs with radius
    const freq = TONIC * ratio * Math.pow(2, oct);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    // a faint sine an octave up gives the phosphor "sparkle" at the rim
    const shine = ctx.createOscillator();
    shine.type = "sine";
    shine.frequency.value = freq * 2;

    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const shineG = ctx.createGain();
    shineG.gain.value = 0.0001;

    osc.connect(g);
    shine.connect(shineG);
    shineG.connect(g);
    g.connect(dry);
    g.connect(wetIn);

    // amplitude: softer up high so the rush doesn't get shrill
    const amp = 0.16 * (1 - 0.4 * pe);
    g.gain.setTargetAtTime(amp, now, 0.008); // attack
    g.gain.setTargetAtTime(0.0001, now + 0.04, 0.26 + 0.2 * (1 - pe)); // decay
    shineG.gain.setTargetAtTime(0.35 * pe, now, 0.01);
    shineG.gain.setTargetAtTime(0.0001, now + 0.03, 0.12);

    osc.start(now);
    shine.start(now);
    const end = now + 2.4;
    osc.stop(end);
    shine.stop(end);
    const cleanup = () => {
      try {
        osc.disconnect();
        shine.disconnect();
        g.disconnect();
        shineG.disconnect();
      } catch {
        /* already torn down */
      }
    };
    osc.onended = cleanup;
  };

  const step = (dt: number) => {
    drone.step(dt);
  };

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    const now = ctx.currentTime;
    try {
      drone.stop();
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.setTargetAtTime(0.0001, now, 0.35);
    } catch {
      /* ctx closing */
    }
  };

  return { ignite, setDose, step, stop };
}
