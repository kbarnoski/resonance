// VoxGlyph — generative ensemble + vocal-contour pitch detection.
//
// The vocal stroke's *kinematics* (Calliphony, arXiv 2608.03040) drive a
// rule-based, seeded, stateful Web-Audio engine. Nothing here uses
// Math.random / Date.now / new Date — all stochastic choice flows from a
// single mulberry32(0x7096) stream; all time is the AudioContext clock.

export const VOX_SEED = 0x7096;

/** Deterministic PRNG — the only source of "randomness" in this prototype. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Pitch geometry ──────────────────────────────────────────────────────────
export const FMIN_Y = 80; // Hz — bottom of the visual pitch axis
export const FMAX_Y = 1000; // Hz — top of the visual pitch axis
const LOG_MIN = Math.log2(FMIN_Y);
const LOG_SPAN = Math.log2(FMAX_Y) - LOG_MIN;

/** Map a frequency (Hz) to a normalized 0..1 vertical position (log scale). */
export function freqToNorm(freq: number): number {
  if (freq <= 0) return 0;
  const n = (Math.log2(freq) - LOG_MIN) / LOG_SPAN;
  return Math.min(1, Math.max(0, n));
}

const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const freqToMidi = (f: number): number => 69 + 12 * Math.log2(f / 440);

// ── Autocorrelation pitch detection ─────────────────────────────────────────
export interface PitchResult {
  freq: number; // Hz, 0 when unvoiced/silent
  clarity: number; // 0..1 confidence of periodicity
  rms: number; // 0..1 loudness
  voiced: boolean;
}

const DET_MIN_HZ = 70;
const DET_MAX_HZ = 1000;

/**
 * Hand-rolled normalized autocorrelation over a time-domain buffer.
 * Silent frames (low RMS) and aperiodic frames (low clarity) return unvoiced,
 * which the pipeline reads as breath / phrase boundary.
 */
export function detectPitch(buf: Float32Array, sampleRate: number): PitchResult {
  const size = buf.length;
  let energy = 0;
  for (let i = 0; i < size; i++) energy += buf[i] * buf[i];
  const rms = Math.sqrt(energy / size);
  if (rms < 0.012 || energy <= 0) {
    return { freq: 0, clarity: 0, rms, voiced: false };
  }

  const minLag = Math.max(2, Math.floor(sampleRate / DET_MAX_HZ));
  const maxLag = Math.min(Math.floor(size / 2), Math.floor(sampleRate / DET_MIN_HZ));

  let bestLag = -1;
  let bestNorm = 0;
  // Normalized correlation per lag; track the strongest low-lag local peak to
  // curb octave-halving errors common in raw autocorrelation.
  let prevNorm = 0;
  let rising = false;
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let e2 = 0;
    for (let i = 0; i < size - lag; i++) {
      sum += buf[i] * buf[i + lag];
      e2 += buf[i + lag] * buf[i + lag];
    }
    const norm = e2 > 0 ? sum / Math.sqrt(energy * e2) : 0;
    corr[lag] = norm;
    if (norm > prevNorm) {
      rising = true;
    } else if (rising) {
      // Local maximum just passed at lag-1.
      if (prevNorm > bestNorm) {
        bestNorm = prevNorm;
        bestLag = lag - 1;
      }
      rising = false;
    }
    prevNorm = norm;
  }

  if (bestLag < 0 || bestNorm < 0.55) {
    return { freq: 0, clarity: bestNorm, rms, voiced: false };
  }

  // Parabolic interpolation around the peak for sub-sample accuracy.
  const y0 = corr[bestLag - 1] || bestNorm;
  const y1 = bestNorm;
  const y2 = corr[bestLag + 1] || bestNorm;
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  const trueLag = bestLag + Math.max(-1, Math.min(1, shift));
  const freq = sampleRate / trueLag;
  if (freq < DET_MIN_HZ || freq > DET_MAX_HZ) {
    return { freq: 0, clarity: bestNorm, rms, voiced: false };
  }
  return { freq, clarity: bestNorm, rms, voiced: true };
}

// ── Scale: D Dorian ─────────────────────────────────────────────────────────
const ROOT_MIDI = 50; // D3
const DORIAN = [0, 2, 3, 5, 7, 9, 10]; // warm, always-consonant modal set
const PROGRESSION = [0, 3, 4, 6]; // i(D) IV(G) v(A) ♭VII(C) — scale-step roots
const MIN_STEP = -3;
const MAX_STEP = 20;
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

function scaleStepToMidi(step: number): number {
  const oct = Math.floor(step / 7);
  const idx = ((step % 7) + 7) % 7;
  return ROOT_MIDI + 12 * oct + DORIAN[idx];
}

function midiToScaleStep(midi: number): number {
  let best = 0;
  let bestErr = Infinity;
  for (let s = MIN_STEP; s <= MAX_STEP; s++) {
    const err = Math.abs(scaleStepToMidi(s) - midi);
    if (err < bestErr) {
      bestErr = err;
      best = s;
    }
  }
  return best;
}

function noteName(midi: number): string {
  const m = Math.round(midi);
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ── Live control layer fed each frame from the vocal contour ────────────────
export interface Control {
  pitchHz: number; // sung f0, 0 when unvoiced
  voiced: boolean;
  rms: number; // 0..1
  density: number; // 0..1, from contour slope (rate of pitch change)
}

export interface EmittedNote {
  freq: number;
  layer: "lead" | "pad" | "bass";
  vel: number;
}

export interface EngineReadout {
  note: string;
  chord: string;
  density: number;
  energy: number;
}

interface ToneOpts {
  freq: number;
  when: number;
  dur: number;
  type: OscillatorType;
  cutoff: number;
  vel: number;
  attack: number;
  release: number;
  detune?: number;
}

/**
 * Rule-based generative ensemble. Three seeded, stateful layers bloom around
 * the singer's line: a stepwise lead whose rate tracks contour density, a pad
 * that shifts on contour turns, and a bass pulse anchoring the chord root.
 */
export class VoxEngine {
  private ctx: AudioContext;
  private onNote: (n: EmittedNote) => void;
  private rng: () => number;

  private bus: GainNode;
  private master: GainNode;
  private tone: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private wet: GainNode;

  // State
  private lastNow = 0;
  private nextLead = 0;
  private nextBass = 0;
  private nextPad = 0;
  private lastLeadStep = 7; // one octave above root
  private chordIndex = 0;
  private chordRootStep = 0;
  private centerStep = 4; // A — resting center of gravity
  private energy = 0;
  private lastReadoutNote = "—";

  constructor(ctx: AudioContext, onNote: (n: EmittedNote) => void) {
    this.ctx = ctx;
    this.onNote = onNote;
    this.rng = makeRng(VOX_SEED);

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = 5200;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 3;

    this.bus = ctx.createGain();
    this.bus.gain.value = 1;

    // Shimmer send — a short feedback delay for spatial bloom.
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.33;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.32;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.28;

    this.bus.connect(this.tone);
    this.bus.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.wet);
    this.wet.connect(this.tone);
    this.tone.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // Gentle fade-in so nothing clicks on start.
    const t = ctx.currentTime;
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(0.7, t + 1.2);
  }

  private playTone(o: ToneOpts): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, o.when);
    if (o.detune) osc.detune.setValueAtTime(o.detune, o.when);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(o.cutoff, o.when);
    filter.Q.value = 0.7;

    const g = ctx.createGain();
    const peak = Math.max(0.0001, o.vel);
    g.gain.setValueAtTime(0.0001, o.when);
    g.gain.linearRampToValueAtTime(peak, o.when + o.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, o.when + o.dur + o.release);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.bus);
    osc.start(o.when);
    osc.stop(o.when + o.dur + o.release + 0.05);
    osc.onended = () => {
      try {
        osc.disconnect();
        filter.disconnect();
        g.disconnect();
      } catch {
        // context may already be closing
      }
    };
  }

  private brightness(): number {
    return clamp(this.energy * 2.6, 0, 1);
  }

  private emitLead(when: number, ctrl: Control): void {
    const center = ctrl.voiced ? freqToMidi(ctrl.pitchHz) : scaleStepToMidi(this.centerStep);
    const centerStep = midiToScaleStep(center);
    const r = this.rng;
    // Bias toward small, stepwise intervals; drift toward the sung window.
    const toward = Math.sign(centerStep - this.lastLeadStep);
    const dir = toward !== 0 ? toward : r() < 0.5 ? -1 : 1;
    const jump = r() < 0.72 ? dir * (1 + Math.floor(r() * 2)) : r() < 0.5 ? 2 : -2;
    let target = clamp(this.lastLeadStep + jump, MIN_STEP, MAX_STEP);
    if (Math.abs(target - centerStep) > 3) target = clamp(centerStep + (r() < 0.5 ? 0 : 1), MIN_STEP, MAX_STEP);
    this.lastLeadStep = target;

    const midi = scaleStepToMidi(target);
    const freq = midiToFreq(midi);
    const b = this.brightness();
    const vel = 0.1 + 0.16 * clamp(ctrl.rms * 2.2, 0, 1) + 0.05 * b;
    const cutoff = 900 + 4200 * b;
    const dur = lerp(0.5, 0.14, ctrl.density) + 0.05 * r();
    this.playTone({ freq, when, dur, type: "triangle", cutoff, vel, attack: 0.012, release: 0.22 });
    this.lastReadoutNote = noteName(midi);
    this.onNote({ freq, layer: "lead", vel });
  }

  private emitBass(when: number): void {
    const midi = scaleStepToMidi(this.chordRootStep) - 12;
    const freq = midiToFreq(midi);
    const vel = 0.16 + 0.08 * this.brightness();
    this.playTone({ freq, when, dur: 0.5, type: "sine", cutoff: 520, vel, attack: 0.02, release: 0.3 });
    this.onNote({ freq, layer: "bass", vel });
  }

  private playPad(when: number): void {
    const steps = [this.chordRootStep, this.chordRootStep + 2, this.chordRootStep + 4];
    const b = this.brightness();
    const cutoff = 1100 + 2600 * b;
    for (const s of steps) {
      const midi = scaleStepToMidi(s + 7); // voiced up an octave for air
      const freq = midiToFreq(midi);
      this.playTone({ freq, when, dur: 4.4, type: "sawtooth", cutoff, vel: 0.05, attack: 1.3, release: 2.6, detune: -6 });
      this.playTone({ freq, when, dur: 4.4, type: "sawtooth", cutoff, vel: 0.05, attack: 1.3, release: 2.6, detune: 7 });
    }
    const rootFreq = midiToFreq(scaleStepToMidi(this.chordRootStep + 7));
    this.onNote({ freq: rootFreq, layer: "pad", vel: 0.3 });
  }

  /** Advance called each animation frame with the live control layer. */
  step(now: number, ctrl: Control): void {
    this.lastNow = now;
    this.energy = lerp(this.energy, ctrl.rms, 0.08);

    if (this.nextLead === 0) {
      this.nextLead = now + 0.1;
      this.nextBass = now + 0.1;
      this.nextPad = now + 0.05;
    }

    // Pad sustains; retrigger on a slow cadence to keep the bed alive.
    while (this.nextPad <= now + 0.1) {
      this.playPad(this.nextPad);
      this.nextPad += 4.0;
    }

    const leadInt = lerp(0.82, 0.12, ctrl.density);
    while (this.nextLead <= now + 0.12) {
      this.emitLead(this.nextLead, ctrl);
      this.nextLead += leadInt * (0.85 + 0.3 * this.rng());
    }

    const bassInt = lerp(1.5, 0.4, ctrl.density);
    while (this.nextBass <= now + 0.12) {
      this.emitBass(this.nextBass);
      this.nextBass += bassInt;
    }
  }

  /** Contour turn / leap → shift the accompaniment (new chord + fresh pad). */
  turn(): void {
    this.chordIndex = (this.chordIndex + (this.rng() < 0.7 ? 1 : 2)) % PROGRESSION.length;
    this.chordRootStep = PROGRESSION[this.chordIndex];
    this.playPad(this.lastNow + 0.03);
  }

  /** Breath / silence → resolve toward home (i) and rest the lead briefly. */
  cadence(): void {
    this.chordIndex = 0;
    this.chordRootStep = PROGRESSION[0];
    this.playPad(this.lastNow + 0.03);
    this.lastLeadStep = this.centerStep + 3;
    this.nextLead = this.lastNow + 0.7;
  }

  getReadout(density: number): EngineReadout {
    return {
      note: this.lastReadoutNote,
      chord: noteName(scaleStepToMidi(this.chordRootStep)),
      density,
      energy: this.energy,
    };
  }

  dispose(): void {
    try {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(0.0001, t);
    } catch {
      // ignore
    }
    for (const n of [this.bus, this.master, this.tone, this.comp, this.delay, this.feedback, this.wet]) {
      try {
        n.disconnect();
      } catch {
        // ignore
      }
    }
  }
}
