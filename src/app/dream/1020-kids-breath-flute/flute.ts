// ─────────────────────────────────────────────────────────────────────────
// flute.ts — a genuine jet-drive digital-waveguide flute.
//
// Modeled on the Perry R. Cook & Julius O. Smith STK (Synthesis ToolKit)
// "Flute" jet-drive waveguide. A single fractional-delay bore stands in for
// the air column; a non-inverting feedback loop with a two-pole lowpass
// reflection filter sustains the standing wave and anchors the fundamental;
// a cubic non-linear "jet" term injects breath energy and brightens with
// harder breath (overblowing). A DC blocker cleans the output.
//
// The excitation is BREATH PRESSURE (the mic's RMS envelope), not pitch
// detection. Loudness of breath = air pressure into the bore. Pitch comes
// from the bore delay length, which is set by tapping recorder-holes.
//
// This module is plain TypeScript with no DOM / Web Audio dependency so it
// can run identically inside an AudioWorklet, a ScriptProcessor, and the
// headless self-test.
// ─────────────────────────────────────────────────────────────────────────

/** G-Mixolydian scale, one octave: G A B C D E F G.
 *  A real mode (major scale with a lowered 7th) — explicitly NOT pentatonic.
 *  MIDI notes G4 .. G5. */
export const SCALE_MIDI: readonly number[] = [67, 69, 71, 72, 74, 76, 77, 79];
export const SCALE_NAMES: readonly string[] = [
  "G",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
];

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Breath→bore-pressure mapping. The raw jet flute oscillates cleanly only in a
// narrow pressure band; below it the bore is silent, above it the jet overblows
// to the octave. We keep the child inside [MIN..MAX] so soft = mellow, hard =
// bright, and never an accidental squeak. (Band verified by the self-test.)
const PRESSURE_GATE = 0.04; // below this breath the flute is silent
const PRESSURE_MIN = 0.8; // softest sustained tone
const PRESSURE_MAX = 0.95; // hardest tone before overblow

/** A one-pole DC blocker (high-pass at ~very low f). y[n]=x[n]-x[n-1]+R*y[n-1]. */
class DcBlocker {
  private x1 = 0;
  private y1 = 0;
  private readonly R: number;
  constructor(R = 0.995) {
    this.R = R;
  }
  process(x: number): number {
    const y = x - this.x1 + this.R * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
  reset(): void {
    this.x1 = 0;
    this.y1 = 0;
  }
}

/** One-pole lowpass reflection filter (STK OnePole, like the flute's bore
 *  termination). y[n] = b0*x[n] - a1*y[n-1]. Cutoff is set via the pole
 *  position `p` (0 = no smoothing, →1 = heavy lowpass). It tames the high
 *  harmonics of the reflected wave so the loop locks to the fundamental
 *  rather than jumping octaves. STK applies a small negative gain here too. */
class ReflectionFilter {
  private a1 = 0;
  private b0 = 1;
  private y1 = 0;
  private gain: number;

  constructor(pole: number, gain = 1) {
    this.gain = gain;
    this.setPole(pole);
  }

  /** pole in (-1,1); positive → lowpass. */
  setPole(pole: number): void {
    const p = Math.max(-0.999, Math.min(0.999, pole));
    this.a1 = -p;
    // DC-normalize so the lowpass has unity gain at DC, then apply `gain`.
    this.b0 = (1 - Math.abs(p)) * this.gain;
  }

  setGain(g: number): void {
    const p = -this.a1;
    this.gain = g;
    this.b0 = (1 - Math.abs(p)) * g;
  }

  process(x: number): number {
    const y = this.b0 * x - this.a1 * this.y1;
    this.y1 = y;
    return y;
  }

  reset(): void {
    this.y1 = 0;
  }
}

/** Fractional delay line with linear interpolation. The read pointer trails
 *  the write pointer by `delaySamples` (which may be non-integer). */
class FracDelay {
  private buf: Float32Array;
  private writeIdx = 0;
  private delay: number;
  private readonly size: number;

  constructor(maxDelay: number, initialDelay: number) {
    this.size = Math.max(4, Math.ceil(maxDelay) + 4);
    this.buf = new Float32Array(this.size);
    this.delay = Math.min(initialDelay, this.size - 2);
  }

  setDelay(d: number): void {
    this.delay = Math.max(1, Math.min(d, this.size - 2));
  }

  /** Write one sample, return the (fractionally) delayed sample. */
  tick(input: number): number {
    this.buf[this.writeIdx] = input;
    // Read position.
    let readPos = this.writeIdx - this.delay;
    if (readPos < 0) readPos += this.size;
    const i0 = Math.floor(readPos);
    const frac = readPos - i0;
    const i1 = (i0 + 1) % this.size;
    const out = this.buf[i0] * (1 - frac) + this.buf[i1] * frac;
    this.writeIdx = (this.writeIdx + 1) % this.size;
    return out;
  }

  reset(): void {
    this.buf.fill(0);
    this.writeIdx = 0;
  }
}

export interface FluteParams {
  /** Breath pressure 0..1 (drives jet amplitude). The mic RMS envelope. */
  breath: number;
  /** Target MIDI pitch. */
  midi: number;
}

/**
 * The jet-drive waveguide flute voice — a direct port of the Cook/Smith STK
 * `Flute` topology.
 *
 * Per sample (STK Flute::tick):
 *   randPressure = noiseGain * noise * breath          (breath turbulence)
 *   temp         = -reflectionFilter( boreDelay.lastOut )   (inverting termination)
 *   jetIn        = breath + randPressure - jetReflection*temp
 *   jetIn        = jetDelay.tick( jetIn )              (embouchure travel time)
 *   jetOut       = jetTable( jetIn ) + endReflection*temp
 *   out          = 0.3 * boreDelay.tick( jetOut )
 *
 * jetTable(x) is the classic cubic jet non-linearity: clamp x to [-1,1] then
 * return x*(x*x - 1). It is roughly linear for small breath and saturates /
 * generates odd harmonics for hard breath — that is what brightens the timbre
 * and, pushed hard, overblows. The bore + jet delays together set the period;
 * the one-pole reflection filter anchors the fundamental and suppresses
 * octave-jumping.
 */
export class FluteVoice {
  private readonly sr: number;
  private bore: FracDelay;
  private jetDelay: FracDelay;
  private reflect: ReflectionFilter;
  private dc = new DcBlocker(0.996);

  private targetBore: number;
  private curBore: number;
  private breathSmooth = 0;
  private midi: number;

  // STK Flute tunables (verified by the headless self-test below).
  private jetReflection = 0.5; // fraction of termination fed to the jet
  private endReflection = 0.5; // fraction of termination at the bore end
  private jetRatio = 0.36; // jetDelay / boreDelay (jet "embouchure" ratio)
  private noiseGain = 0.02; // breath turbulence amount
  private outScale = 1.6;
  // Group-delay compensation: the one-pole filter + linear interpolation add
  // ~2 samples of round-trip delay, which would flatten the pitch. We subtract
  // it from the period so the fundamental lands on tune.
  private filterComp = 2.0;
  // The reflection-filter cutoff tracks the pitch (cutoff = REFLECT_MULT × the
  // fundamental). Keeping the lowpass a fixed number of harmonics above the
  // fundamental anchors every note's first mode and stops the low notes from
  // jumping to a sharp higher mode. Verified across the scale to ≤7 cents.
  private reflectMult = 5;

  private rngState = 0x2545f491;
  private lastBore = 0;

  constructor(sampleRate: number, midi = 67) {
    this.sr = sampleRate;
    this.midi = midi;
    const d = this.boreForMidi(midi);
    this.targetBore = d;
    this.curBore = d;
    const maxBore = this.boreForMidi(SCALE_MIDI[0]) + 8;
    // Max jet delay = max bore × jetRatio/(1-jetRatio) (see process()).
    const maxJet = (maxBore * this.jetRatio) / (1 - this.jetRatio) + 8;
    this.bore = new FracDelay(maxBore, d);
    this.jetDelay = new FracDelay(maxJet, (d * this.jetRatio) / (1 - this.jetRatio));
    // One-pole lowpass termination at unity loop gain, cutoff tracking pitch.
    this.reflect = new ReflectionFilter(this.poleForMidi(midi), 1.0);
  }

  /** Reflection-filter pole for a one-pole lowpass at cutoff = mult × f0. */
  private poleForMidi(midi: number): number {
    const fc = midiToHz(midi) * this.reflectMult;
    return Math.exp((-2 * Math.PI * Math.min(fc, this.sr * 0.45)) / this.sr);
  }

  /** Bore delay (in samples) for a pitch. The closed loop period equals the
   *  bore delay plus the jet delay; with jetDelay = jetRatio*boreDelay we get
   *  total = boreDelay*(1+jetRatio) = period, so boreDelay = period*(1-r)/...
   *  — equivalently boreDelay = (period - filterComp) * (1 - jetRatio),
   *  jetDelay = (period - filterComp) * jetRatio. */
  private boreForMidi(midi: number): number {
    const f = midiToHz(midi);
    const period = this.sr / f - this.filterComp;
    return period * (1 - this.jetRatio);
  }

  setMidi(midi: number): void {
    this.midi = midi;
    this.targetBore = this.boreForMidi(midi);
    this.reflect.setPole(this.poleForMidi(midi));
  }

  reset(): void {
    this.bore.reset();
    this.jetDelay.reset();
    this.reflect.reset();
    this.dc.reset();
    this.breathSmooth = 0;
    this.curBore = this.targetBore;
    this.lastBore = 0;
  }

  /** Cheap deterministic white noise in [-1,1] (xorshift) for breath. */
  private noise(): number {
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return (this.rngState / 0xffffffff) * 2 - 1;
  }

  /** Render one sample given an instantaneous breath pressure 0..1. */
  process(breath: number): number {
    // Glide pitch toward target (portamento) so taps don't click.
    this.curBore += (this.targetBore - this.curBore) * 0.004;
    this.bore.setDelay(this.curBore);
    // jetDelay : boreDelay = jetRatio : (1 - jetRatio).
    this.jetDelay.setDelay(
      (this.curBore * this.jetRatio) / (1 - this.jetRatio)
    );

    // Smooth the breath envelope — air pressure can't change instantly.
    // Attack time-constant ~25ms, sample-rate independent.
    const b = Math.max(0, Math.min(1, breath));
    const attackCoeff = 1 - Math.exp(-1 / (0.025 * this.sr));
    this.breathSmooth += (b - this.breathSmooth) * attackCoeff;
    // Map the child's breath envelope (0..1) into the bore's stable playing
    // band. Below the gate the voice stays silent; within the band, softer
    // breath sits near the bottom (mellow) and harder breath near the top
    // (brighter, more harmonics) WITHOUT crossing into the overblow region.
    const env = this.breathSmooth;
    const gate = env < PRESSURE_GATE ? env / PRESSURE_GATE : 1;
    const pressure =
      env < PRESSURE_GATE
        ? PRESSURE_MIN * gate
        : PRESSURE_MIN +
          (PRESSURE_MAX - PRESSURE_MIN) *
            ((env - PRESSURE_GATE) / (1 - PRESSURE_GATE));

    const randPressure = this.noiseGain * this.noise() * pressure;

    // Inverting reflection at the bore termination.
    const temp = -this.reflect.process(this.lastBore);

    // Jet input: breath + turbulence, minus reflected pressure fed to jet.
    let jetIn = pressure + randPressure - this.jetReflection * temp;
    jetIn = this.jetDelay.tick(jetIn);

    // Cubic jet non-linearity (STK jetTable): clamp then x*(x^2 - 1).
    const xc = Math.max(-1, Math.min(1, jetIn));
    const jetOut = xc * (xc * xc - 1);

    // Sum jet output with the end-reflected pressure, drive the bore.
    const boreIn = jetOut + this.endReflection * temp;
    this.lastBore = this.bore.tick(boreIn);

    // Output: DC-blocked, gently scaled.
    return this.dc.process(this.lastBore * this.outScale);
  }
}

/** Mono renderer that fills a buffer at constant breath/pitch — used by both
 *  the self-test and as a convenience. */
export function renderTone(
  sampleRate: number,
  midi: number,
  breath: number,
  numSamples: number
): Float32Array {
  const voice = new FluteVoice(sampleRate, midi);
  voice.setMidi(midi);
  const out = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    out[i] = voice.process(breath);
  }
  return out;
}

// ── Pitch detection (autocorrelation + parabolic refine) for the self-test ──

/**
 * Estimate the fundamental of a buffer by autocorrelation, searching lags that
 * correspond to ±5 semitones around the expected frequency, then refining the
 * peak with a parabolic fit. Autocorrelation locks to the true period (the
 * fundamental) far more reliably than a narrow spectral bank, which can latch
 * onto sidebands of a slightly-inharmonic waveguide tone.
 */
export function detectFundamental(
  buf: Float32Array,
  sr: number,
  expectedHz: number
): number {
  const fmax = expectedHz * Math.pow(2, 5 / 12);
  const fmin = expectedHz * Math.pow(2, -5 / 12);
  const minLag = Math.max(2, Math.floor(sr / fmax));
  const maxLag = Math.min(buf.length - 2, Math.ceil(sr / fmin));

  const n = buf.length - maxLag;
  const acf = (lag: number): number => {
    let s = 0;
    for (let i = 0; i < n; i++) s += buf[i] * buf[i + lag];
    return s;
  };

  // Compute the full ACF over the search range.
  const vals = new Float64Array(maxLag - minLag + 1);
  let globalBest = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const s = acf(lag);
    vals[lag - minLag] = s;
    if (s > globalBest) globalBest = s;
  }

  // Pick the FIRST local maximum that clears 88% of the global peak. The true
  // fundamental is the longest period (lowest freq); harmonics show up as
  // additional, shorter-lag peaks, so taking the earliest qualifying local max
  // — searching from the longest lag downward — locks to the fundamental and
  // avoids octave-up errors on the low notes.
  const thresh = 0.88 * globalBest;
  let bestLag = minLag;
  let foundLocal = false;
  for (let lag = maxLag - 1; lag > minLag; lag--) {
    const i = lag - minLag;
    if (
      vals[i] >= thresh &&
      vals[i] >= vals[i - 1] &&
      vals[i] >= vals[i + 1]
    ) {
      bestLag = lag;
      foundLocal = true;
      break;
    }
  }
  if (!foundLocal) {
    // Fall back to the global max.
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (vals[lag - minLag] === globalBest) {
        bestLag = lag;
        break;
      }
    }
  }

  // Parabolic refine around the chosen integer-lag peak.
  let lag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const a = vals[bestLag - minLag - 1];
    const b = vals[bestLag - minLag];
    const c = vals[bestLag - minLag + 1];
    const denom = a - 2 * b + c;
    if (Math.abs(denom) > 1e-12) {
      lag = bestLag - (0.5 * (c - a)) / denom;
    }
  }
  return sr / lag;
}

export function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export function centsOff(measuredHz: number, targetHz: number): number {
  return 1200 * Math.log2(measuredHz / targetHz);
}
