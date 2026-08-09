// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the sound of being met.
//
//   • A low just-intonation drone bed (shared startDroneBank) whose setDrive
//     tracks the coherence scalar — it swells as a gaze-figure forms.
//   • Per "met" event: a short JUST-INTONATION CHOIR swell — a handful of
//     detuned oscillators on a pure-ratio chord with a ~1.3 s attack/release —
//     routed heavily through the shared void reverb. This is the "being met"
//     voice; the swell and the visual figure are the same coherence event.
//   • Oscillator count is bounded: at most one choir voice sounds at a time.
//
//   Determinism: no unseeded randomness / wall-clock; timing comes from the
//   AudioContext currentTime.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/visionary/convolutionVoid";

export interface AudioEngine {
  setCoherence(c: number): void;
  /** Fire one choir voice-swell; intensity 0..1 scales level + brightness. */
  triggerMet(intensity: number): void;
  suspend(): void;
  resume(): void;
  stop(): void;
}

// A just-intonation "choir" chord: root, major third, fifth, octave, major tenth.
const CHOIR_ROOT = 174; // ~F3
const CHOIR_RATIOS = [1, 5 / 4, 3 / 2, 2, 5 / 2];

export function createAudioEngine(): AudioEngine | null {
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!Ctor) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const reverb: VoidReverb = createVoidReverb(ctx, {
    seconds: 5,
    decay: 2.4,
    wet: 0.55,
  });
  reverb.output.connect(master);

  // Low JI drone bed → master (dry) and a send into the void.
  const drone: DroneBank = startDroneBank(ctx, master, {
    root: 55,
    ratios: [1, 3 / 2, 2, 5 / 2, 3],
    cutoffLow: 180,
    cutoffHigh: 2400,
    peakGain: 0.26,
  });
  drone.output.connect(reverb.input);

  let voiceActive = false;

  function triggerMet(intensity: number): void {
    if (voiceActive) return;
    if (ctx.state !== "running") return;
    voiceActive = true;
    const now = ctx.currentTime;
    const attack = 0.28;
    const hold = 0.35;
    const release = 0.95;
    const peak = 0.14 * (0.5 + 0.5 * Math.min(1, Math.max(0, intensity)));

    // one envelope for the whole voice (bounds the shared gain automation)
    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(peak, now + attack);
    voiceGain.gain.setValueAtTime(peak, now + attack + hold);
    voiceGain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + attack + hold + release,
    );

    // soft bandpass gives the stack a vocal formant colour
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.value = 900;
    formant.Q.value = 0.6;

    voiceGain.connect(formant);
    formant.connect(reverb.input); // mostly wet — a distant choir
    formant.connect(master); // a touch dry for presence

    const oscs: OscillatorNode[] = [];
    // 5 partials × 1 detune pair = 10 oscillators — bounded.
    for (let i = 0; i < CHOIR_RATIOS.length; i++) {
      const f = CHOIR_ROOT * CHOIR_RATIOS[i];
      for (const cents of [-5, 5]) {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? "sine" : "triangle";
        osc.frequency.value = f;
        osc.detune.value = cents;
        const g = ctx.createGain();
        g.gain.value = (0.6 / CHOIR_RATIOS[i]) * 0.5;
        osc.connect(g);
        g.connect(voiceGain);
        osc.start(now);
        oscs.push(osc);
      }
    }

    const end = now + attack + hold + release + 0.1;
    for (const osc of oscs) {
      try {
        osc.stop(end);
      } catch {
        /* noop */
      }
    }
    const ms = (end - now) * 1000 + 60;
    window.setTimeout(() => {
      voiceActive = false;
      try {
        voiceGain.disconnect();
        formant.disconnect();
      } catch {
        /* noop */
      }
    }, ms);
  }

  return {
    setCoherence(c: number) {
      const v = Math.min(1, Math.max(0, c));
      drone.setDrive(v);
      reverb.setWet(0.45 + 0.25 * v);
    },
    triggerMet,
    suspend() {
      if (ctx.state === "running") void ctx.suspend();
    },
    resume() {
      if (ctx.state === "suspended") void ctx.resume();
    },
    stop() {
      try {
        drone.stop();
      } catch {
        /* noop */
      }
      window.setTimeout(() => {
        if (ctx.state !== "closed") void ctx.close();
      }, 800);
    },
  };
}
