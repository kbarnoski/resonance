/**
 * audio.ts — a tiny two-timbre pluck synth for "Redlines".
 *
 * The draft loop is played step-by-step. Every note carries an OWNER, and the
 * ear needs to tell the two composers apart, so each owner gets its own voice:
 *   - "you"   — a warm triangle pluck (soft, rounded, front-of-mind)
 *   - "agent" — a cooler two-oscillator FM blip (glassier, more detuned)
 *   - "seed"  — a neutral sine+triangle, quiet, the shared starting material
 *
 * House rules: every voice -> master compressor -> gain ceiling <= 0.14 ->
 * destination. Fully deterministic (no Math.random / Date). Degrades to a
 * silent no-op if the AudioContext can't be created or resumed (headless).
 */

import { midiToHz, type Owner } from "./model";

const MASTER_CEILING = 0.14;

export interface AudioEngine {
  resume(): Promise<void>;
  setMuted(muted: boolean): void;
  /** Sound one note now; `durSteps`*`stepDur` sets the note length in seconds. */
  play(midi: number, durSteps: number, stepDur: number, by: Owner): void;
  dispose(): void;
}

export function createAudio(): AudioEngine {
  let ctx: AudioContext | null = null;
  try {
    const AC =
      (typeof window !== "undefined" &&
        (window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext)) ||
      null;
    if (AC) ctx = new AC();
  } catch {
    ctx = null;
  }

  let muted = false;
  let bus: AudioNode | null = null; // compressor input for all voices

  if (ctx) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    const master = ctx.createGain();
    master.gain.value = MASTER_CEILING;
    comp.connect(master);
    master.connect(ctx.destination);
    bus = comp;
  }

  function playYou(freq: number, len: number, t0: number, target: AudioNode) {
    const osc = ctx!.createOscillator();
    const osc2 = ctx!.createOscillator();
    osc.type = "triangle";
    osc2.type = "triangle";
    osc.frequency.value = freq;
    osc2.frequency.value = freq * 1.006; // gentle warmth
    const filt = ctx!.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = Math.min(freq * 6, 5200);
    filt.Q.value = 0.7;
    const amp = ctx!.createGain();
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(0.9, t0 + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(len, 0.18));
    osc.connect(filt);
    osc2.connect(filt);
    filt.connect(amp);
    amp.connect(target);
    osc.start(t0);
    osc2.start(t0);
    const end = t0 + Math.max(len, 0.18) + 0.05;
    osc.stop(end);
    osc2.stop(end);
  }

  function playAgent(freq: number, len: number, t0: number, target: AudioNode) {
    // Two-oscillator FM: cooler, glassier, a touch metallic.
    const carrier = ctx!.createOscillator();
    const mod = ctx!.createOscillator();
    const modGain = ctx!.createGain();
    carrier.type = "sine";
    mod.type = "square";
    carrier.frequency.value = freq;
    mod.frequency.value = freq * 2.005;
    modGain.gain.value = freq * 1.1;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    const filt = ctx!.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = Math.min(freq * 2.2, 4200);
    filt.Q.value = 1.4;
    const amp = ctx!.createGain();
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(0.6, t0 + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(len * 0.8, 0.14));
    carrier.connect(filt);
    filt.connect(amp);
    amp.connect(target);
    carrier.start(t0);
    mod.start(t0);
    const end = t0 + Math.max(len, 0.18) + 0.05;
    carrier.stop(end);
    mod.stop(end);
  }

  function playSeed(freq: number, len: number, t0: number, target: AudioNode) {
    const osc = ctx!.createOscillator();
    const osc2 = ctx!.createOscillator();
    osc.type = "sine";
    osc2.type = "triangle";
    osc.frequency.value = freq;
    osc2.frequency.value = freq;
    const mix = ctx!.createGain();
    osc2.connect(mix);
    mix.gain.value = 0.25;
    const filt = ctx!.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = Math.min(freq * 4, 3200);
    const amp = ctx!.createGain();
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(0.55, t0 + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(len, 0.2));
    osc.connect(filt);
    mix.connect(filt);
    filt.connect(amp);
    amp.connect(target);
    osc.start(t0);
    osc2.start(t0);
    const end = t0 + Math.max(len, 0.2) + 0.05;
    osc.stop(end);
    osc2.stop(end);
  }

  return {
    async resume() {
      if (!ctx) return;
      try {
        if (ctx.state === "suspended") await ctx.resume();
      } catch {
        /* headless / blocked — stay silent */
      }
    },
    setMuted(m: boolean) {
      muted = m;
    },
    play(midi: number, durSteps: number, stepDur: number, by: Owner) {
      if (!ctx || muted || !bus) return;
      const t0 = ctx.currentTime + 0.02;
      const len = Math.max(durSteps * stepDur, 0.12);
      const freq = midiToHz(midi);
      if (by === "you") playYou(freq, len, t0, bus);
      else if (by === "agent") playAgent(freq, len, t0, bus);
      else playSeed(freq, len, t0, bus);
    },
    dispose() {
      try {
        ctx?.close();
      } catch {
        /* ignore */
      }
      ctx = null;
      bus = null;
    },
  };
}
