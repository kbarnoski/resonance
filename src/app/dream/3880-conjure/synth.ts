// ── 3880-conjure · additive/FM chord synth, gated by coherence ─────────────
//
// A stack of 6 partials in FIXED ratios (a composed chord voicing — root,
// major 3rd, 5th, octave, 10th, 12th) each realized as a 2-operator FM pair
// (sine carrier + sine modulator). The chord's ROOT frequency is driven by
// hand height CONTINUOUSLY — plain exponential mapping, never quantized to a
// scale or ladder. Everything else (voicing width, detune scatter, a
// decoherence noise band, filter brightness, pan) responds to the live
// GestureFrame every frame.
//
//   height    (0..1) → root frequency, continuous glide            [PROTECTED]
//   spread/pinch      → voicing: how many upper extensions sound
//   coherence (0..1)  → HIGH: partials lock in tune, extensions bloom in
//                        LOW:  partials detune + scatter, a noise band swells
//   openness          → lowpass brightness (+ FM modulation index)
//   tilt              → stereo pan

import type { GestureFrame } from "./gesture";
import { mulberry32, SEED } from "./rng";
import { n1 } from "./noise";

// composed voicing ratios: root · maj3 · 5th · 8ve · 10th(3+8ve) · 12th(5+8ve)
const RATIOS = [1, 1.25, 1.5, 2, 2.5, 3];
const CORE_GAIN = [0.36, 0.24, 0.24]; // root/3rd/5th — always present
const EXT_GAIN = [0.17, 0.13, 0.1]; // octave/10th/12th — voiced by spread+pinch
const N_PARTIALS = RATIOS.length;

interface Partial {
  carrier: OscillatorNode;
  modulator: OscillatorNode;
  modGain: GainNode; // FM index
  gain: GainNode; // partial output level
}

export interface ConjureSynth {
  setFrame(frame: GestureFrame, nowMs: number): void;
  dispose(): void;
}

export function makeConjureSynth(ctx: AudioContext, master = 0.19): ConjureSynth {
  const now0 = ctx.currentTime;
  const rand = mulberry32(SEED ^ 0x51ed);

  const masterGain = ctx.createGain();
  masterGain.gain.value = master;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 10;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.16;
  const panner = ctx.createStereoPanner();
  masterGain.connect(limiter);
  limiter.connect(panner);
  panner.connect(ctx.destination);

  const chordBus = ctx.createGain();
  chordBus.gain.value = 1;
  const brightFilter = ctx.createBiquadFilter();
  brightFilter.type = "lowpass";
  brightFilter.frequency.value = 1200;
  brightFilter.Q.value = 0.4;
  chordBus.connect(brightFilter);
  brightFilter.connect(masterGain);

  // ── partials: 2-op FM (sine carrier + sine modulator) per chord tone ──
  const partials: Partial[] = [];
  for (let i = 0; i < N_PARTIALS; i++) {
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = 110 * RATIOS[i];

    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = 110 * RATIOS[i] * 2;
    const modGain = ctx.createGain();
    modGain.gain.value = 0; // modulation index, driven per-frame
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    carrier.connect(gain);
    gain.connect(chordBus);

    carrier.start(now0);
    modulator.start(now0);
    partials.push({ carrier, modulator, modGain, gain });
  }

  // ── decoherence noise band: swells as the shape falls apart ──
  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
  {
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const noiseBand = ctx.createBiquadFilter();
  noiseBand.type = "bandpass";
  noiseBand.frequency.value = 500;
  noiseBand.Q.value = 1.1;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0;
  noise.connect(noiseBand);
  noiseBand.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(now0);

  let stopped = false;

  function setFrame(frame: GestureFrame, nowMs: number): void {
    if (stopped) return;
    const t = ctx.currentTime;
    const tc = 0.045;

    // ── CONTINUOUS root pitch from hand height — plain exponential map,
    //    never snapped to a scale/pentatonic/JI ladder. ──
    const rootHz = 65 * Math.pow(2, 3.2 * frame.height);

    const coherence = frame.coherence;
    const voicing = Math.min(1, frame.spread * 1.1 + frame.pinch * 0.35);
    const scatter = 1 - coherence;

    for (let i = 0; i < N_PARTIALS; i++) {
      const p = partials[i];
      const targetHz = rootHz * RATIOS[i];

      // decoherence detunes each partial independently (deterministic
      // wandering noise, phase-seeded — not audio-thread randomness)
      const detuneCents = scatter * scatter * 55 * n1(nowMs, i * 17.3 + 4.1, 0.006 + i * 0.0007);
      const glideHz = targetHz * Math.pow(2, detuneCents / 1200);
      p.carrier.frequency.setTargetAtTime(glideHz, t, 0.07);
      p.modulator.frequency.setTargetAtTime(targetHz * 2, t, 0.07);

      // FM index: openness brightens the timbre; decoherence adds jitter
      const idx =
        6 + frame.openness * 60 + scatter * 40 * n1(nowMs, i * 9.7 + 1.3, 0.01);
      p.modGain.gain.setTargetAtTime(Math.max(0, idx), t, tc);

      const isCore = i < 3;
      const base = isCore ? CORE_GAIN[i] : EXT_GAIN[i - 3];
      // core tones stay present even when sloppy (so it never goes silent);
      // extensions require both voicing (spread/pinch) AND coherence to
      // bloom in — a sloppy hand can't hold the rich chord.
      const bloom = isCore ? 1 : voicing * coherence;
      const presentGain = frame.present ? 1 : 0.35; // hand-absent: fade, don't cut
      p.gain.gain.setTargetAtTime(base * bloom * presentGain, t, tc);
    }

    // filter brightness ← palm openness
    brightFilter.frequency.setTargetAtTime(500 + frame.openness * 5200, t, tc);
    brightFilter.Q.setTargetAtTime(0.3 + scatter * 2.2, t, tc);

    // stereo pan ← hand tilt
    panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, frame.tilt)), t, 0.08);

    // decoherence noise band swells with scatter, centered near the chord
    noiseBand.frequency.setTargetAtTime(rootHz * 3.2, t, 0.1);
    const noiseAmt = frame.present ? scatter * scatter : 0.5;
    noiseGain.gain.setTargetAtTime(noiseAmt * 0.16, t, tc);

    // overall presence swells slightly with coherence (the "bloom")
    masterGain.gain.setTargetAtTime(master * (0.72 + coherence * 0.4), t, 0.15);
  }

  function dispose(): void {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setTargetAtTime(0, t, 0.06);
    const srcs: AudioScheduledSourceNode[] = [
      ...partials.flatMap((p) => [p.carrier, p.modulator]),
      noise,
    ];
    for (const s of srcs) {
      try {
        s.stop(t + 0.25);
      } catch {
        /* already stopped */
      }
    }
  }

  return { setFrame, dispose };
}
