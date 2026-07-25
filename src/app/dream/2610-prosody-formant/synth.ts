// ─────────────────────────────────────────────────────────────────────────────
// synth.ts — formant-preserving source-filter resynthesis for 2610.
//
//   The classic Fant source-filter model:
//     • SOURCE — a glottal-ish buzz (a custom PeriodicWave with a 1/n harmonic
//       falloff) oscillating at the continuously tracked f0, glided with
//       setTargetAtTime for natural portamento; plus a white-noise breath
//       source for unvoiced frames.
//     • FILTER — a bank of parallel BiquadFilter band-passes acting as formant
//       resonators. Their centre frequencies (F1/F2) and per-band gains are set
//       LIVE from the analysed spectral envelope, so vowel COLOUR (/a/,/i/,/u/)
//       survives even though the words are gone.
//
//   Result: a wordless, humming human — the melody, rhythm, intensity and
//   vowel-colour of speech with none of its content.
// ─────────────────────────────────────────────────────────────────────────────

import { BAND_COUNT, type Frame } from "./prosody";

/** Nominal formant resonator count. F1 & F2 track the envelope; F3 is fixed. */
const FORMANTS = 3;
const F3_FIXED = 2750;

export interface Synth {
  ctx: AudioContext;
  /** Push one analysed frame → drives pitch, loudness, breath and vowel. */
  push: (f: Frame) => void;
  /** Fade the voice out (release) without tearing down the graph. */
  silence: () => void;
  dispose: () => void;
}

/** Build a glottal-ish periodic wave: harmonics with ~1/n amplitude falloff. */
function makeGlottalWave(ctx: AudioContext): PeriodicWave {
  const n = 20;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    // 1/k falloff, slightly steepened up top for a softer, breathier buzz.
    imag[k] = (1 / k) * Math.exp(-k / 14);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/** Create the resynth engine on an existing AudioContext. */
export function makeSynth(ctx: AudioContext): Synth {
  const now = ctx.currentTime;

  // ── source: glottal oscillator ────────────────────────────────────────────
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(makeGlottalWave(ctx));
  osc.frequency.setValueAtTime(140, now);

  const voiceGain = ctx.createGain(); // voiced source level
  voiceGain.gain.setValueAtTime(0, now);
  osc.connect(voiceGain);

  // ── source: breath noise (unvoiced) ────────────────────────────────────────
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  // deterministic-ish pink-ish noise (value not security-sensitive; seeded feel)
  let s = 12345;
  for (let i = 0; i < nd.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    nd[i] = (s / 0x3fffffff - 1) * 0.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const breathGain = ctx.createGain();
  breathGain.gain.setValueAtTime(0, now);
  noise.connect(breathGain);

  // ── filter: parallel formant band-passes ───────────────────────────────────
  const formants: BiquadFilterNode[] = [];
  const formantGains: GainNode[] = [];
  const sumGain = ctx.createGain();
  sumGain.gain.setValueAtTime(1, now);

  const defaultCentres = [650, 1200, F3_FIXED];
  for (let i = 0; i < FORMANTS; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(defaultCentres[i], now);
    bp.Q.setValueAtTime(i === 0 ? 6 : 8, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, now);

    // both voiced buzz and breath noise excite every resonator
    voiceGain.connect(bp);
    breathGain.connect(bp);
    bp.connect(g);
    g.connect(sumGain);

    formants.push(bp);
    formantGains.push(g);
  }

  // A little direct source bleed keeps low fundamentals audible.
  const bleed = ctx.createGain();
  bleed.gain.setValueAtTime(0.12, now);
  voiceGain.connect(bleed);
  bleed.connect(sumGain);

  // ── master: gentle limiter → destination ───────────────────────────────────
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.9, now);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-14, now);
  comp.knee.setValueAtTime(20, now);
  comp.ratio.setValueAtTime(4, now);
  comp.attack.setValueAtTime(0.005, now);
  comp.release.setValueAtTime(0.14, now);

  sumGain.connect(master);
  master.connect(comp);
  comp.connect(ctx.destination);

  osc.start();
  noise.start();

  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));

  const push = (f: Frame) => {
    const t = ctx.currentTime;
    const glide = 0.045; // portamento time-constant

    if (f.voiced && f.hz > 0) {
      // continuous, microtonal pitch — glided, never quantized
      osc.frequency.setTargetAtTime(f.hz, t, glide);
      const lvl = clamp(f.rms * 1.5, 0, 1);
      voiceGain.gain.setTargetAtTime(0.9 * lvl, t, 0.03);
      breathGain.gain.setTargetAtTime(0.05 * lvl, t, 0.03);
    } else {
      voiceGain.gain.setTargetAtTime(0.0, t, 0.04);
      breathGain.gain.setTargetAtTime(clamp(f.rms * 0.9, 0, 0.5), t, 0.03);
    }

    // Move F1/F2 resonators to the analysed peaks (vowel colour), F3 fixed.
    formants[0].frequency.setTargetAtTime(clamp(f.f1, 250, 1100), t, 0.05);
    formants[1].frequency.setTargetAtTime(clamp(f.f2, 700, 2800), t, 0.05);
    formants[2].frequency.setTargetAtTime(F3_FIXED, t, 0.05);

    // Per-resonator gains from the coarse band envelope → timbre / colour.
    const b = f.bands;
    const gLo = b[0] ?? 0.5;
    const gMid = (b[Math.min(2, BAND_COUNT - 1)] ?? 0.5);
    const gHi = b[BAND_COUNT - 1] ?? 0.5;
    formantGains[0].gain.setTargetAtTime(0.25 + 0.9 * gLo, t, 0.05);
    formantGains[1].gain.setTargetAtTime(0.2 + 0.9 * gMid, t, 0.05);
    formantGains[2].gain.setTargetAtTime(0.1 + 0.6 * gHi, t, 0.05);
  };

  const silence = () => {
    const t = ctx.currentTime;
    voiceGain.gain.setTargetAtTime(0, t, 0.05);
    breathGain.gain.setTargetAtTime(0, t, 0.05);
  };

  const dispose = () => {
    try {
      osc.stop();
      noise.stop();
    } catch {
      /* already stopped */
    }
    try {
      master.disconnect();
      comp.disconnect();
    } catch {
      /* noop */
    }
  };

  return { ctx, push, silence, dispose };
}
