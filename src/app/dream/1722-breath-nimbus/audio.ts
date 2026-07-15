// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — a sparse, slightly INHARMONIC breath-swelled pad.
//
//   Deliberately NOT a clean just-intonation consonant chord: four oscillators
//   sit at non-integer ratios so they beat gently against one another — a soft,
//   unresolved shimmer that suits the boundless / oceanic pole. Amplitude
//   follows the same breath phase that drives the motes: it swells on inhale and
//   recedes on exhale. Routed through a DynamicsCompressor and a low master
//   gain, optionally into the shared convolution "void" reverb.
//
//   The mic NEVER reaches this graph or ctx.destination — this is output only.
//   Only ctx.currentTime is used for scheduling (permitted for audio).
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

// Non-integer ratios above the root — chosen to beat, not to lock into a chord.
const RATIOS = [1.0, 1.503, 2.017, 2.711];
const DETUNE_CENTS = [0, 6, -5, 8];
const ROOT_HZ = 96; // low, breathy fundamental

export interface NimbusAudio {
  /** Set the current breath amplitude (0..1) and coherence (0..1). */
  setBreath(amp: number, coherence: number): void;
  stop(): void;
}

export function startAudio(ctx: AudioContext): NimbusAudio {
  const master = ctx.createGain();
  master.gain.value = 0.12;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -22;
  comp.knee.value = 26;
  comp.ratio.value = 4;
  comp.attack.value = 0.02;
  comp.release.value = 0.4;

  // Gentle high cut so the beating pad stays soft and cavernous.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 1400;
  tone.Q.value = 0.5;

  const padGain = ctx.createGain();
  padGain.gain.value = 0.0001;

  let reverb: VoidReverb | null = null;
  try {
    reverb = createVoidReverb(ctx, { seconds: 5, decay: 2.4, wet: 0.6 });
  } catch {
    reverb = null;
  }

  // pad → tone → compressor → master → [reverb] → destination
  padGain.connect(tone);
  tone.connect(comp);
  comp.connect(master);
  if (reverb) {
    master.connect(reverb.input);
    reverb.output.connect(ctx.destination);
  } else {
    master.connect(ctx.destination);
  }

  const oscs: OscillatorNode[] = [];
  const voiceGains: GainNode[] = [];
  const now = ctx.currentTime;
  for (let i = 0; i < RATIOS.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.value = ROOT_HZ * RATIOS[i];
    osc.detune.value = DETUNE_CENTS[i];
    const vg = ctx.createGain();
    // Upper partials sit quieter so the root stays felt, not shrill.
    vg.gain.value = 1 / (1 + i * 0.9);
    osc.connect(vg);
    vg.connect(padGain);
    osc.start(now);
    oscs.push(osc);
    voiceGains.push(vg);
  }

  // A slow sub-audio LFO adds a barely-there tremor to the shimmer.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.06;
  lfo.connect(lfoGain);
  lfoGain.connect(padGain.gain);
  lfo.start(now);

  let stopped = false;

  return {
    setBreath(amp: number, coherence: number) {
      if (stopped) return;
      const t = ctx.currentTime;
      // Swell with the breath; coherent breathing lifts the floor into a
      // steadier, sustained drone.
      const target = 0.06 + amp * 0.5 + coherence * 0.12;
      padGain.gain.setTargetAtTime(target, t, 0.12);
      // Open the tone a touch on the inhale swell.
      tone.frequency.setTargetAtTime(900 + amp * 1600, t, 0.2);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      master.gain.setTargetAtTime(0.0001, t, 0.25);
      for (const osc of oscs) {
        try {
          osc.stop(t + 1.2);
        } catch {
          /* already stopped */
        }
      }
      try {
        lfo.stop(t + 1.2);
      } catch {
        /* already stopped */
      }
      void voiceGains; // retained for the lifetime of the oscillators
    },
  };
}
