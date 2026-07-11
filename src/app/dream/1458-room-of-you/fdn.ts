// ─────────────────────────────────────────────────────────────────────────────
// fdn.ts — the "room of you". A hand-built Feedback-Delay-Network reverb whose
// delay-line lengths, feedback (decay) and damping are continuously re-tuned by
// the body's geometry, plus a soft bell/mallet excitation that rings THROUGH the
// space when you move.
//
//   The FDN is 4 delay lines cross-coupled by a normalised 4×4 Hadamard matrix.
//   0.5·H is orthogonal (all singular values = 1), so the loop's spectral radius
//   equals the scalar feedback gain — which we clamp strictly < 1. Combined with
//   a DynamicsCompressor limiter before the destination, the network can never
//   run away. Damping is a lowpass inside each loop.
//
//   Nothing here uses Math.random / Date — all excitation timing comes from the
//   caller via ctx.currentTime, and partial ratios are fixed constants.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

/** Body geometry → acoustic parameters, all normalised 0..1. */
export interface BodyParams {
  /** Overall presence size (height/spread) → delay length + decay. */
  size: number;
  /** Vertical position of the presence (0 low .. 1 high) → brightness/pitch. */
  bright: number;
  /** How much of the frame the body fills → drone-bed richness + wet. */
  fill: number;
  /** Horizontal extent → partial detune spread. */
  width: number;
}

export interface StrikeParams {
  intensity: number; // 0..1
  size: number; // 0..1 (tail length)
  bright: number; // 0..1 (pitch selection)
  width: number; // 0..1 (detune)
}

export interface Room {
  /** Excitation + reverb summed; connect to the master chain. */
  output: GainNode;
  /** Continuously re-tune the space from body geometry. */
  setBody(p: BodyParams): void;
  /** Ring the room with a soft mallet/bell hit. */
  strike(now: number, p: StrikeParams): void;
  /** Full teardown of every node + the drone bed. */
  stop(): void;
}

// Normalised 4×4 Hadamard — 0.5·H is orthogonal → lossless mixing.
const HADAMARD = [
  [1, 1, 1, 1],
  [1, -1, 1, -1],
  [1, 1, -1, -1],
  [1, -1, -1, 1],
];
// Mutually-prime base delay times (seconds) — an irregular, cathedral-like set.
const BASE_DELAYS = [0.0431, 0.0537, 0.0672, 0.0783];
// A low pentatonic the bells are quantised into (contemplative, no dissonance).
const SCALE = [130.81, 146.83, 174.61, 196.0, 220.0, 261.63, 293.66];
// Gentle inharmonic bell partials with falling weights.
const PARTIALS: Array<{ ratio: number; gain: number }> = [
  { ratio: 1.0, gain: 1.0 },
  { ratio: 2.01, gain: 0.5 },
  { ratio: 2.79, gain: 0.28 },
  { ratio: 3.94, gain: 0.16 },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createRoom(ctx: AudioContext, reduced: boolean): Room {
  const N = 4;

  const output = ctx.createGain();
  output.gain.value = 1;

  // Excitation bus: strikes feed the FDN (wet) and a little dry.
  const excInput = ctx.createGain();
  excInput.gain.value = 1;
  const excDry = ctx.createGain();
  excDry.gain.value = 0.42;
  excInput.connect(excDry);
  excDry.connect(output);

  // Wet path out of the network.
  const roomWet = ctx.createGain();
  roomWet.gain.value = 0.9;
  const roomHP = ctx.createBiquadFilter();
  roomHP.type = "highpass";
  roomHP.frequency.value = 90; // keep the tail from muddying into rumble
  roomHP.connect(roomWet);
  roomWet.connect(output);

  const sumIn: GainNode[] = [];
  const delays: DelayNode[] = [];
  const damps: BiquadFilterNode[] = [];
  const fb: GainNode[] = [];
  const inject: GainNode[] = [];
  const matrix: GainNode[][] = [];

  for (let i = 0; i < N; i++) {
    const s = ctx.createGain();
    s.gain.value = 1;
    const d = ctx.createDelay(1.0);
    d.delayTime.value = BASE_DELAYS[i];
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2600;
    damp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.8; // decay scalar, always < 1
    const inj = ctx.createGain();
    inj.gain.value = 0.35;

    s.connect(d);
    d.connect(damp);
    damp.connect(g);
    // tap the damped signal to the wet output
    damp.connect(roomHP);
    // excitation injected into each line
    excInput.connect(inj);
    inj.connect(s);

    sumIn.push(s);
    delays.push(d);
    damps.push(damp);
    fb.push(g);
    inject.push(inj);
  }

  // Feedback matrix: fb[j] → (0.5·H[k][j]) → sumIn[k].
  for (let k = 0; k < N; k++) {
    matrix[k] = [];
    for (let j = 0; j < N; j++) {
      const m = ctx.createGain();
      m.gain.value = 0.5 * HADAMARD[k][j];
      fb[j].connect(m);
      m.connect(sumIn[k]);
      matrix[k][j] = m;
    }
  }

  // A faint cathedral bed — a drone whose richness tracks how much space the
  // body fills. Routed dry (not through the FDN) so it can never feed back.
  let drone: DroneBank | null = null;
  try {
    drone = startDroneBank(ctx, output, {
      root: 65.41, // C2
      ratios: [1, 3 / 2, 2, 5 / 2],
      cutoffLow: 180,
      cutoffHigh: 1400,
      peakGain: reduced ? 0.04 : 0.06,
    });
    drone.setDrive(0.12);
  } catch {
    drone = null;
  }

  const setBody = (p: BodyParams) => {
    const now = ctx.currentTime;
    const size = clamp(p.size, 0, 1);
    const bright = clamp(p.bright, 0, 1);
    const fill = clamp(p.fill, 0, 1);

    // Bigger presence → longer delay lines (a larger room).
    const sizeFactor = 0.6 + size * 1.3; // 0.6 .. 1.9
    for (let i = 0; i < N; i++) {
      delays[i].delayTime.setTargetAtTime(BASE_DELAYS[i] * sizeFactor, now, 0.25);
    }
    // Bigger presence → longer decay (feedback toward, but never at, 1).
    const decay = clamp(0.58 + size * 0.32, 0, 0.9);
    for (let i = 0; i < N; i++) {
      fb[i].gain.setTargetAtTime(decay, now, 0.3);
    }
    // Higher presence → brighter space (damping opens).
    const cutoff = 800 + bright * 4200;
    for (let i = 0; i < N; i++) {
      damps[i].frequency.setTargetAtTime(cutoff, now, 0.3);
    }
    // How much you fill the frame → bed richness + wet level.
    if (drone) drone.setDrive(clamp(0.1 + fill * 0.6, 0, 0.8));
    roomWet.gain.setTargetAtTime(0.65 + fill * 0.4, now, 0.4);
  };

  const strike = (now: number, p: StrikeParams) => {
    const intensity = clamp(p.intensity, 0, 1);
    if (intensity <= 0.001) return;
    const idx = Math.min(SCALE.length - 1, Math.floor(clamp(p.bright, 0, 1) * SCALE.length));
    const fund = SCALE[idx];
    const dur = (2.0 + clamp(p.size, 0, 1) * 3.8) * (reduced ? 0.8 : 1);
    const detune = clamp(p.width, 0, 1) * 6; // cents of spread across partials

    const strikeGain = ctx.createGain();
    strikeGain.gain.value = 1;
    strikeGain.connect(excInput);

    for (let k = 0; k < PARTIALS.length; k++) {
      const { ratio, gain } = PARTIALS[k];
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = fund * ratio;
      osc.detune.value = (k - PARTIALS.length / 2) * detune;
      const env = ctx.createGain();
      const peak = intensity * gain * 0.5;
      const pd = dur * (1 - k * 0.15); // higher partials decay a touch faster
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.2, pd));
      osc.connect(env);
      env.connect(strikeGain);
      osc.start(now);
      osc.stop(now + pd + 0.1);
      osc.onended = () => {
        try {
          osc.disconnect();
          env.disconnect();
        } catch {
          /* already gone */
        }
      };
    }
    // release the wrapper node a little after the longest partial
    window.setTimeout(() => {
      try {
        strikeGain.disconnect();
      } catch {
        /* already gone */
      }
    }, (dur + 0.5) * 1000);
  };

  const stop = () => {
    try {
      drone?.stop();
    } catch {
      /* ignore */
    }
    const all: AudioNode[] = [output, excInput, excDry, roomWet, roomHP, ...sumIn, ...delays, ...damps, ...fb, ...inject];
    for (const row of matrix) all.push(...row);
    for (const n of all) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  };

  return { output, setBody, strike, stop };
}
