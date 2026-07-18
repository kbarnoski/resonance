// 1922-chladni-plate · 2D modal / physical-modeling synthesis
//
// The struck plate is voiced as a bank of damped sinusoidal modes — one
// persistent OscillatorNode per mode, each behind its own GainNode. We never
// spin up or tear down nodes per strike (so polyphony is bounded to exactly
// N voices and can never run away): instead a signed modal-amplitude state
// A[k] is integrated in JS every frame, and the audio gains simply follow it.
//
//   • A STRIKE at (x,y) adds an impulse to every mode weighted by its mode
//     shape at that point: modes with an antinode there ring loudly, modes
//     with a node stay silent. That spatial weighting is what makes the
//     Chladni figure and the timbre depend on WHERE you hit.
//   • A BOW (drag) feeds a small, slightly noisy, continuous excitation into
//     the modes under the pointer, so they sustain against their own decay —
//     the singing, shifting voice of a bowed plate edge.
//   • Between events each mode decays with its own time constant tau[k].
//
// The same signed A[k] state also drives the WebGL Chladni field, so what you
// see is literally the current modal energy of what you hear.

import { modeShape, type PlateMode } from "./modal";

const MASTER = 0.16; // master trim before the safety chain
const MODE_GAIN = 0.6; // per-mode gain scaling from |A| to audio
const CLAMP = 1.3; // max |A[k]| — hard ceiling against runaway
const STRIKE = 0.9; // strike impulse scale
const BOW_FEED = 0.42; // continuous bow inflow per second
const SMOOTH = 0.01; // gain follower time constant (s)

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

export interface ModalPlate {
  readonly modes: PlateMode[];
  strike(x: number, y: number, strength: number): void;
  bow(x: number, y: number): void;
  releaseBow(): void;
  /** Advance the modal state by dt seconds, push it to the audio gains, and
   *  return the signed per-mode amplitudes for the visual field. */
  tick(dt: number): Float32Array;
  energies(): Float32Array;
  resume(): Promise<void>;
  destroy(): void;
}

/** Build the modal plate on an (already gesture-unlocked) AudioContext.
 *  `modes` is shared with the renderer so both agree on mode order. */
export function createModalPlate(ctx: AudioContext, modes: PlateMode[]): ModalPlate {
  // ── master safety chain: sum → trim → lowpass → compressor → out ──
  const master = ctx.createGain();
  master.gain.value = MASTER;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 8500;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  master.connect(lp).connect(comp).connect(ctx.destination);

  const voices: Voice[] = modes.map((mode) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = mode.freq;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(master);
    osc.start();
    return { osc, gain };
  });

  const A = new Float32Array(modes.length); // signed modal amplitudes
  let bowActive = false;
  let bowX = 0.5;
  let bowY = 0.5;

  const clamp = (v: number) => (v > CLAMP ? CLAMP : v < -CLAMP ? -CLAMP : v);

  return {
    modes,

    strike(x, y, strength) {
      for (let k = 0; k < modes.length; k++) {
        const e = modeShape(modes[k], x, y); // signed, [-1,1]
        A[k] = clamp(A[k] + e * strength * STRIKE * modes[k].amp);
      }
    },

    bow(x, y) {
      bowActive = true;
      bowX = x;
      bowY = y;
    },

    releaseBow() {
      bowActive = false;
    },

    tick(dt) {
      const now = ctx.currentTime;
      const d = Math.min(dt, 0.05); // guard against tab-switch dt spikes
      for (let k = 0; k < modes.length; k++) {
        // per-mode exponential decay
        A[k] *= Math.exp(-d / modes[k].tau);
        // continuous, slightly rough bow inflow while dragging
        if (bowActive) {
          const e = modeShape(modes[k], bowX, bowY);
          const rough = 0.6 + 0.4 * Math.random();
          A[k] = clamp(A[k] + e * BOW_FEED * modes[k].amp * rough * d);
        }
        const mag = A[k] < 0 ? -A[k] : A[k];
        voices[k].gain.gain.setTargetAtTime(mag * MODE_GAIN, now, SMOOTH);
      }
      return A;
    },

    energies() {
      return A;
    },

    async resume() {
      if (ctx.state === "suspended") await ctx.resume();
    },

    destroy() {
      for (const v of voices) {
        try {
          v.osc.stop();
        } catch {
          /* already stopped */
        }
        try {
          v.osc.disconnect();
          v.gain.disconnect();
        } catch {
          /* ignore */
        }
      }
      try {
        master.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}
