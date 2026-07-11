// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the sound of the cathedral BUILDING itself.
//
// Two subsystems on one limited, slowly-swelling master bus:
//   • a low just-intonation DRONE BED (shared droneBank) whose filter OPENS as
//     the structure grows — the long-form "ascending" bloom (Éliane Radigue's
//     hour-long ARP drones; Terry Riley's In C accretion).
//   • BELLS: every branch that reaches a growth node rings a soft inharmonic
//     bell, pitched by the HEIGHT of that event (low struts → low bells, the
//     spire → high glass). What you SEE growing is what you HEAR.
//
// Safety: AudioContext only after a user gesture; master RAMPS from silence to
// ≤0.22; a DynamicsCompressor limiter caps the bus; concurrent bell voices ≤ 14.
// Deterministic — no Math.random / Date; pitch comes from event geometry.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

const MASTER_TARGET = 0.2; // ≤ 0.22, ramped, never an instant blast
const MAX_VOICES = 14;

// A just-intonation pentatonic ladder spanning ~3 octaves, low → high. Height
// maps into this so the audible pitch ASCENDS exactly as the structure does.
function makeScale(): number[] {
  const root = 130.81; // C3
  const ratios = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
  const out: number[] = [];
  for (let oct = 0; oct < 3; oct++) {
    for (let i = 0; i < ratios.length; i++) {
      out.push(root * ratios[i] * Math.pow(2, oct));
    }
  }
  return out;
}

export interface AudioEngine {
  resume(): Promise<void>;
  setMuted(muted: boolean): void;
  /** ring a bell for a growth event. h,pan in [0,1] / [-1,1]; intensity 0..1 */
  bell(h: number, pan: number, intensity: number): void;
  /** open the drone bed as the cathedral fills in (progress 0..1) */
  setDrive(progress: number): void;
  dispose(): void;
}

export function createAudio(): AudioEngine {
  const Ctx: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();

  // master bus: gain → limiter → destination
  const master = ctx.createGain();
  master.gain.value = 0.0001;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 12;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.25;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  const drone: DroneBank = startDroneBank(ctx, master, {
    root: 65.41, // C2
    ratios: [1, 3 / 2, 2, 5 / 2, 3],
    cutoffLow: 180,
    cutoffHigh: 2200,
    peakGain: 0.15,
  });

  const scale = makeScale();
  let voices = 0;
  let muted = false;

  const bell = (h: number, pan: number, intensity: number) => {
    if (muted || voices >= MAX_VOICES) return;
    const hh = Math.min(1, Math.max(0, h));
    const idx = Math.min(scale.length - 1, Math.floor(hh * (scale.length - 1)));
    const freq = scale[idx];
    const now = ctx.currentTime;
    const amp = 0.06 + 0.05 * Math.min(1, Math.max(0, intensity));
    const decay = 2.4 + hh * 2.2; // higher glass rings longer

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    const vGain = ctx.createGain();
    vGain.gain.value = 0.0001;
    vGain.connect(panner);
    panner.connect(master);

    // soft inharmonic bell: fundamental + a quiet metallic partial
    const partials: { mul: number; g: number }[] = [
      { mul: 1, g: 1 },
      { mul: 2.01, g: 0.4 },
      { mul: 2.76, g: 0.18 },
    ];
    const oscs: OscillatorNode[] = [];
    for (const p of partials) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * p.mul;
      const og = ctx.createGain();
      og.gain.value = p.g;
      o.connect(og);
      og.connect(vGain);
      o.start(now);
      o.stop(now + decay + 0.1);
      oscs.push(o);
    }

    vGain.gain.setValueAtTime(0.0001, now);
    vGain.gain.exponentialRampToValueAtTime(amp, now + 0.012);
    vGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    voices++;
    oscs[0].onended = () => {
      voices = Math.max(0, voices - 1);
      try {
        vGain.disconnect();
        panner.disconnect();
      } catch {
        /* already torn down */
      }
    };
  };

  return {
    async resume() {
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* ignore */
        }
      }
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(MASTER_TARGET, now + 3.5);
    },
    setMuted(m: boolean) {
      muted = m;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(m ? 0.0001 : MASTER_TARGET, now + 0.5);
    },
    bell,
    setDrive(progress: number) {
      drone.setDrive(0.12 + 0.78 * Math.min(1, Math.max(0, progress)));
    },
    dispose() {
      try {
        drone.stop();
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          ctx.close();
        } catch {
          /* already closed */
        }
      }, 300);
    },
  };
}
