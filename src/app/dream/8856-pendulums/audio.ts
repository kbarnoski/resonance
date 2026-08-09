// audio.ts — the Web Audio Doppler engine.
//
// One AudioContext (created + resumed inside the "Begin" click handler for iOS
// unlock). Each bob owns a warm PeriodicWave oscillator whose pitch GLIDES via
// setTargetAtTime — never .value — so the Doppler shift sounds like a real
// vibrato, not a stair-step. Signal path per voice:
//   osc → gain (distance) → StereoPanner (L↔R sweep) → lowpass → master
// Master: allSources → master gain → DynamicsCompressor → destination.
// Starts silent; Begin fades the master up.

import type { Voice } from "./pendulum";

interface VoiceNodes {
  osc: OscillatorNode;
  gain: GainNode;
  panner: StereoPannerNode;
  filter: BiquadFilterNode;
}

export interface DopplerEngine {
  ctx: AudioContext;
  update: (i: number, v: Voice) => void;
  stop: () => void;
}

// Warm PeriodicWave: a fundamental plus a few decaying partials (a nod to
// John Chowning's spectral thinking, though this is additive, not FM).
function warmWave(ctx: AudioContext): PeriodicWave {
  const real = new Float32Array([0, 1, 0.5, 0.28, 0.14, 0.06]);
  const imag = new Float32Array(real.length);
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

// f0s + detunes come from the pendulum field so each voice starts on its base
// pitch and its stable per-bob detune.
export function createEngine(
  f0s: number[],
  detunes: number[],
): DopplerEngine {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-8, ctx.currentTime);
  comp.knee.setValueAtTime(20, ctx.currentTime);
  comp.ratio.setValueAtTime(12, ctx.currentTime);
  comp.attack.setValueAtTime(0.006, ctx.currentTime);
  comp.release.setValueAtTime(0.28, ctx.currentTime);

  master.connect(comp);
  comp.connect(ctx.destination);

  const wave = warmWave(ctx);
  const voices: VoiceNodes[] = f0s.map((f0, i) => {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.setValueAtTime(f0, ctx.currentTime);
    osc.detune.setValueAtTime(detunes[i], ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, ctx.currentTime);

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(0, ctx.currentTime);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, ctx.currentTime);
    filter.Q.setValueAtTime(0.7, ctx.currentTime);

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(filter);
    filter.connect(master);
    osc.start();
    return { osc, gain, panner, filter };
  });

  // Fade the ensemble up gently once the graph is running.
  master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.9);

  let stopped = false;

  function update(i: number, v: Voice): void {
    if (stopped) return;
    const vn = voices[i];
    if (!vn) return;
    const now = ctx.currentTime;
    // Pitch MUST glide — the Doppler vibrato lives here.
    vn.osc.frequency.setTargetAtTime(v.freq, now, 0.015);
    vn.panner.pan.setTargetAtTime(v.panX, now, 0.04);
    vn.gain.gain.setTargetAtTime(v.gain * 0.11, now, 0.05);
    vn.filter.frequency.setTargetAtTime(v.cutoff, now, 0.03);
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(0.0001, now, 0.12);
    window.setTimeout(() => {
      for (const vn of voices) {
        try {
          vn.osc.stop();
        } catch {
          // already stopped
        }
        vn.osc.disconnect();
        vn.gain.disconnect();
        vn.panner.disconnect();
        vn.filter.disconnect();
      }
      master.disconnect();
      comp.disconnect();
      void ctx.close();
    }, 320);
  }

  return { ctx, update, stop };
}
