// ── 4808-effigy · continuous resonant CHORD synth, body-driven ──────────────
//
// The whole moving body is the resonator. A stack of 6 FM partials in a composed
// voicing (root · 3rd · 5th · octave · 10th · 12th) sings continuously. Nothing
// is quantised to a scale — every control is a smooth map from the PoseFrame:
//
//   posture (0..1)    → root frequency, continuous glide          [PROTECTED]
//   verticality       → chord QUALITY (arms down = minor 3rd → arms up = major),
//                        + lowpass brightness
//   spread (0..1)     → voicing: how many upper extensions bloom in
//   motion (0..1)     → MASTER intensity: FM index climbs, whole mix swells,
//                        an ecstatic "breath" band opens, sub reinforces
//   tilt (-1..1)      → stereo pan
//
// This is the inverse of DiscoForcing (audio→body); here the body writes the
// audio. See README.md.

import type { PoseFrame } from "./pose";
import { mulberry32, SEED } from "./rng";
import { n1 } from "./noise";

// composed voicing: root · 3rd · 5th · 8ve · 10th(3+8ve) · 12th(5+8ve).
// the 3rd (index 1) morphs minor→major with verticality at runtime.
const RATIOS = [1, 1.25, 1.5, 2, 2.5, 3];
const CORE_GAIN = [0.34, 0.22, 0.22]; // root/3rd/5th — always present
const EXT_GAIN = [0.16, 0.12, 0.09]; // 8ve/10th/12th — voiced by spread
const N_PARTIALS = RATIOS.length;

interface Partial {
  carrier: OscillatorNode;
  modulator: OscillatorNode;
  modGain: GainNode;
  gain: GainNode;
}

export interface EffigySynth {
  setFrame(frame: PoseFrame, nowMs: number): void;
  dispose(): void;
}

export function makeEffigySynth(ctx: AudioContext, master = 0.2): EffigySynth {
  const now0 = ctx.currentTime;
  const rand = mulberry32(SEED ^ 0x51ed);

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.0001;
  masterGain.gain.setTargetAtTime(master * 0.75, now0, 1.2); // gentle wake-in

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
  brightFilter.frequency.value = 1000;
  brightFilter.Q.value = 0.5;
  chordBus.connect(brightFilter);
  brightFilter.connect(masterGain);

  // ── FM partials (sine carrier + sine modulator) per chord tone ──
  const partials: Partial[] = [];
  for (let i = 0; i < N_PARTIALS; i++) {
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = 110 * RATIOS[i];

    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = 110 * RATIOS[i] * 2;
    const modGain = ctx.createGain();
    modGain.gain.value = 0;
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

  // ── sub reinforcement (body/chest) — swells with motion ──
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 55;
  const subGain = ctx.createGain();
  subGain.gain.value = 0;
  sub.connect(subGain);
  subGain.connect(masterGain);
  sub.start(now0);

  // ── ecstatic "breath": a bandpassed noise that opens with motion energy ──
  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
  {
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const breath = ctx.createBiquadFilter();
  breath.type = "bandpass";
  breath.frequency.value = 900;
  breath.Q.value = 0.9;
  const breathGain = ctx.createGain();
  breathGain.gain.value = 0;
  noise.connect(breath);
  breath.connect(breathGain);
  breathGain.connect(masterGain);
  noise.start(now0);

  let stopped = false;

  function setFrame(frame: PoseFrame, nowMs: number): void {
    if (stopped) return;
    const t = ctx.currentTime;
    const tc = 0.05;

    // CONTINUOUS root from whole-body posture — plain exponential, never snapped.
    const rootHz = 55 * Math.pow(2, 2.7 * frame.posture); // ~55 → ~360 Hz
    const motion = frame.motion;
    const voicing = Math.min(1, frame.spread * 1.15);
    const present = frame.present ? 1 : 0.4;

    // arms-up brightens the chord: 3rd slides minor(1.2)→major(1.26).
    const thirdRatio = 1.2 + frame.verticality * 0.06;

    for (let i = 0; i < N_PARTIALS; i++) {
      const p = partials[i];
      const ratio = i === 1 ? thirdRatio : RATIOS[i];
      const targetHz = rootHz * ratio;

      // motion adds a little living detune shimmer (deterministic wander).
      const detuneCents = motion * 22 * n1(nowMs, i * 17.3 + 4.1, 0.004 + i * 0.0006);
      const glideHz = targetHz * Math.pow(2, detuneCents / 1200);
      p.carrier.frequency.setTargetAtTime(glideHz, t, 0.08);
      p.modulator.frequency.setTargetAtTime(targetHz * 2, t, 0.08);

      // FM index climbs with openness (arms/spread) AND motion → timbre ignites.
      const idx = 4 + frame.openness * 45 + motion * 55;
      p.modGain.gain.setTargetAtTime(Math.max(0, idx), t, tc);

      const isCore = i < 3;
      const base = isCore ? CORE_GAIN[i] : EXT_GAIN[i - 3];
      // extensions require spread to bloom; core always sings (never silent).
      const bloom = isCore ? 1 : voicing;
      p.gain.gain.setTargetAtTime(base * bloom * present, t, tc);
    }

    // sub reinforces the root, swelling with motion for the ecstatic body.
    sub.frequency.setTargetAtTime(rootHz, t, 0.1);
    subGain.gain.setTargetAtTime((0.05 + motion * 0.22) * present, t, tc);

    // brightness lowpass ← verticality/openness
    brightFilter.frequency.setTargetAtTime(500 + frame.openness * 5200 + motion * 1400, t, tc);
    brightFilter.Q.setTargetAtTime(0.4 + motion * 1.6, t, tc);

    // stereo pan ← lateral lean
    panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, frame.tilt)), t, 0.09);

    // ecstatic breath opens with motion, tracking the chord register.
    breath.frequency.setTargetAtTime(rootHz * 4 + motion * 1200, t, 0.12);
    breathGain.gain.setTargetAtTime(motion * motion * 0.09 * present, t, tc);

    // whole mix swells with motion — the swell of the body.
    masterGain.gain.setTargetAtTime(master * (0.62 + motion * 0.5) * (0.55 + present * 0.45), t, 0.18);
  }

  function dispose(): void {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setTargetAtTime(0, t, 0.06);
    const srcs: AudioScheduledSourceNode[] = [
      ...partials.flatMap((p) => [p.carrier, p.modulator]),
      sub,
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
