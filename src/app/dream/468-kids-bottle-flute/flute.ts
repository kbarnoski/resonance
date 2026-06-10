/**
 * Digital Waveguide Flute Physical Model — helper module
 *
 * References:
 *   - Julius O. Smith III, "Physical Audio Signal Processing" (CCRMA)
 *     https://ccrma.stanford.edu/~jos/pasp/
 *   - Perry R. Cook, "Real Sound Synthesis for Interactive Applications" (2002)
 *     and the STK (Synthesis ToolKit) Flute model
 *   - McIntyre, Schumacher & Woodhouse,
 *     "On the oscillations of musical instruments" (1983)
 */

// ── AudioWorklet processor source (loaded as Blob URL) ─────────────────────

export const WORKLET_NAME = "flute-processor";

/**
 * Returns the AudioWorklet processor JS source as a string so we can
 * load it via a Blob URL — no separate public/ file needed.
 *
 * The model:
 *   • Bore = circular delay line, length N = round(sampleRate / freq).
 *   • One-pole lowpass reflection filter at the open end.
 *   • Excitation = band-pass filtered breath noise * envelope + bore feedback,
 *     passed through soft-clip jet nonlinearity  x - x³/3.
 *   • Feedback gain < 0.9998 → unconditionally stable.
 *   • Overblow: at high pressure the cubic term shifts operating point →
 *     octave emerges naturally (same physics as a real flute).
 */
export function buildWorkletSource(): string {
  return `
class FluteProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'breath',  defaultValue: 0,   minValue: 0,   maxValue: 1,    automationRate: 'a-rate' },
      { name: 'freq',    defaultValue: 440, minValue: 50,  maxValue: 2000, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this._sr = sampleRate;
    this._bore = new Float32Array(256);
    this._boreLen = 0;
    this._borePtr = 0;
    this._rfilt = 0;
    this._nx = 0;
    this._nbp = 0;
    this._env = 0;
    this._vibratoPhase = 0;
    this._lastFreq = 0;
    this._initBore(440);
  }

  _initBore(freq) {
    const len = Math.max(8, Math.round(this._sr / Math.max(50, freq)));
    if (len !== this._boreLen) {
      this._bore = new Float32Array(len + 4);
      this._boreLen = len;
      this._borePtr = 0;
      this._rfilt = 0;
    }
    this._lastFreq = freq;
  }

  _noise() {
    return Math.random() * 2 - 1;
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0][0];
    if (!out) return true;

    const breaths = parameters.breath;
    const freq = parameters.freq[0];

    if (Math.abs(freq - this._lastFreq) > 0.5) {
      this._initBore(freq);
    }

    const N = this._boreLen;
    const reflCoeff = 0.945 + 0.03 * Math.min(1, Math.max(0, (freq - 200) / 800));

    for (let i = 0; i < out.length; i++) {
      const breath = breaths.length > 1 ? breaths[i] : breaths[0];

      // Smooth envelope to prevent clicks
      const eTarget = breath > 0.01 ? breath : 0;
      this._env += (eTarget - this._env) * (eTarget > this._env ? 0.003 : 0.001);
      const env = this._env;

      // Vibrato LFO — subtle, only when blowing
      this._vibratoPhase += (2 * Math.PI * 5.4) / this._sr;
      const vibDepth = Math.min(1, Math.max(0, (env - 0.1) * 5)) * 0.0025;
      const vib = Math.sin(this._vibratoPhase) * vibDepth;

      // Breath noise: two-stage lowpass → airy texture
      this._nx  += (this._noise() - this._nx)  * 0.12;
      this._nbp += (this._nx - this._nbp) * 0.20;
      const breathNoise = this._nbp;

      // Read bore output at current pointer
      const boreOut = this._bore[this._borePtr];

      // Jet excitation: DC pressure + noise + bore feedback
      const pressure = env * (0.52 + vib) + breathNoise * env * 0.30;
      const jetIn = pressure + boreOut * 0.40;

      // Soft-clip jet: x - x^3/3 (Taylor approx of tanh), then hard clamp
      let jet = jetIn - (jetIn * jetIn * jetIn) / 3.0;
      if (jet > 1.15) jet = 1.15;
      else if (jet < -1.15) jet = -1.15;
      if (jet !== jet) jet = 0; // NaN guard

      // One-pole reflection filter at open end
      const reflected = reflCoeff * this._rfilt + (1.0 - reflCoeff) * boreOut;
      this._rfilt = reflected;
      if (this._rfilt !== this._rfilt) this._rfilt = 0; // NaN guard

      // Write new bore sample and advance
      this._bore[this._borePtr] = jet - reflected;
      this._borePtr = (this._borePtr + 1) % N;

      out[i] = reflected * 0.62;
    }
    return true;
  }
}
registerProcessor('flute-processor', FluteProcessor);
`;
}

// ── Scale / bottle definitions ────────────────────────────────────────────────

/** Five-note pentatonic subset of C Lydian — all combinations consonant */
export interface BottleNote {
  midi: number;
  name: string;
  freq: number;
  color: string;   // warm glass body color
  glow: string;    // lighter glow ring
  relHeight: number; // 1.0 = tallest (lowest note)
}

export const BOTTLE_NOTES: BottleNote[] = (() => {
  const specs = [
    { midi: 60, name: "C4", color: "#c97c2a", glow: "#f4b64a" }, // amber-gold  (big)
    { midi: 62, name: "D4", color: "#a86820", glow: "#d4954e" }, // burnt sienna
    { midi: 64, name: "E4", color: "#5a9c42", glow: "#8adc60" }, // olive-green
    { midi: 67, name: "G4", color: "#2b6bbf", glow: "#5aa8f0" }, // sky-blue
    { midi: 69, name: "A4", color: "#7a46a8", glow: "#b079e0" }, // violet       (small)
  ];
  return specs.map((s) => {
    const freq = 440 * Math.pow(2, (s.midi - 69) / 12);
    // Bigger (lower) = taller: linear midi 60→1.0, 69→0.55
    const relHeight = 1.0 - ((s.midi - 60) / (69 - 60)) * 0.42;
    return { ...s, freq, relHeight };
  });
})();

// ── Touch-only preset envelope ────────────────────────────────────────────────

/** Returns breath envelope 0–1 for touch-only playback at time t (seconds). */
export function touchEnvelope(t: number, dur = 1.5): number {
  if (t <= 0 || t >= dur) return 0;
  const atk = 0.07;
  const rel = 0.20;
  if (t < atk) return (t / atk) * 0.68;
  if (t > dur - rel) return 0.68 * ((dur - t) / rel);
  return 0.68;
}

// ── Auto-demo melody ──────────────────────────────────────────────────────────

export interface DemoNote {
  bottleIdx: number;
  duration: number;
  gap: number;
}

/** A gentle rising-and-falling tune across the five bottles. */
export const AUTO_DEMO_MELODY: DemoNote[] = [
  { bottleIdx: 0, duration: 0.5, gap: 0.08 },
  { bottleIdx: 1, duration: 0.45, gap: 0.08 },
  { bottleIdx: 2, duration: 0.45, gap: 0.08 },
  { bottleIdx: 4, duration: 0.6, gap: 0.15 },
  { bottleIdx: 3, duration: 0.5, gap: 0.12 },
  { bottleIdx: 2, duration: 0.4, gap: 0.08 },
  { bottleIdx: 1, duration: 0.4, gap: 0.08 },
  { bottleIdx: 0, duration: 0.85, gap: 0.25 },
  { bottleIdx: 2, duration: 0.4, gap: 0.08 },
  { bottleIdx: 3, duration: 0.4, gap: 0.08 },
  { bottleIdx: 4, duration: 0.4, gap: 0.08 },
  { bottleIdx: 3, duration: 0.4, gap: 0.08 },
  { bottleIdx: 2, duration: 0.4, gap: 0.08 },
  { bottleIdx: 1, duration: 0.5, gap: 0.10 },
  { bottleIdx: 0, duration: 1.1, gap: 0.35 },
];
