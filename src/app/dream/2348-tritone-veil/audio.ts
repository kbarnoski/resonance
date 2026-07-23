// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — Shepard-tone synthesis + a live-reversible spatial choir for
// 2348-tritone-veil.
//
// Two things live here:
//   1. playShepardPair() — the OBJECTIVE stimulus. A tritone pair: pitch-class P
//      then P+6 semitones, each rendered as an octave-AMBIGUOUS Shepard tone
//      (a stack of octave-spaced sines under a fixed Gaussian spectral envelope
//      over log-frequency, so no single octave register dominates). This is what
//      makes the rise/fall direction objectively undecidable.
//   2. Choir — the SUBJECTIVE payoff. A bank of detuned Shepard-Risset voices
//      panned across a stereo field whose glissando direction follows the
//      listener's reported percept. Direction is a live, smoothly-slewed signed
//      scalar so it can flip when the listener's bias flips.
//
// Diana Deutsch, "The Tritone Paradox" (1991); Roger Shepard, circular pitch
// (1964); Jean-Claude Risset, continuous glissando.
// ─────────────────────────────────────────────────────────────────────────────

// Comb spanning ~32 Hz → ~2 kHz: base 32.7 Hz (C1) × 2^k for k = 0..5.
const PAIR_BASE_HZ = 32.7;
const PAIR_PARTIALS = 6;
// Gaussian envelope over octave index, centred mid-comb so register is ambiguous.
const PAIR_CENTER_OCT = 2.5; // ~185 Hz centre
const PAIR_SIGMA_OCT = 1.4;

function bell(oct: number, center: number, sigma: number): number {
  const d = (oct - center) / sigma;
  return Math.exp(-0.5 * d * d);
}

/**
 * Play a single octave-ambiguous Shepard tone for pitch-class `pc` (0..11).
 * Sums PAIR_PARTIALS octave-spaced sines under a fixed bell envelope. Returns
 * when scheduled; the oscillators self-stop after `dur`.
 */
function playShepardTone(
  ctx: AudioContext,
  dest: AudioNode,
  pc: number,
  startAt: number,
  dur: number,
  peak: number,
): OscillatorNode[] {
  const oscs: OscillatorNode[] = [];
  const semis = pc / 12; // fractional-octave offset for the pitch-class
  for (let k = 0; k < PAIR_PARTIALS; k++) {
    const oct = semis + k;
    const freq = PAIR_BASE_HZ * Math.pow(2, oct);
    const w = bell(oct, PAIR_CENTER_OCT, PAIR_SIGMA_OCT);
    if (w < 0.02) continue;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const g = ctx.createGain();
    const a = 0.02; // attack
    const r = 0.08; // release
    const level = w * peak;
    g.gain.setValueAtTime(0.0001, startAt);
    g.gain.linearRampToValueAtTime(level, startAt + a);
    g.gain.setValueAtTime(level, startAt + dur - r);
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);

    osc.connect(g);
    g.connect(dest);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.02);
    oscs.push(osc);
  }
  return oscs;
}

/**
 * Schedule a tritone pair: pitch-class `pc`, then `pc + 6`. Calls `onFirst`,
 * `onSecond`, and `onDone` at the right wall-clock moments (via setTimeout, so
 * the UI can highlight which tone is sounding). Returns a cancel function.
 */
export function playShepardPair(
  ctx: AudioContext,
  dest: AudioNode,
  pc: number,
  opts: {
    toneDur?: number;
    gap?: number;
    peak?: number;
    onFirst?: () => void;
    onSecond?: () => void;
    onDone?: () => void;
  } = {},
): () => void {
  const toneDur = opts.toneDur ?? 0.5;
  const gap = opts.gap ?? 0.12;
  const peak = opts.peak ?? 0.16;
  const t0 = ctx.currentTime + 0.06;

  const a = playShepardTone(ctx, dest, pc % 12, t0, toneDur, peak);
  const b = playShepardTone(
    ctx,
    dest,
    (pc + 6) % 12,
    t0 + toneDur + gap,
    toneDur,
    peak,
  );

  const timers: number[] = [];
  timers.push(window.setTimeout(() => opts.onFirst?.(), 60));
  timers.push(
    window.setTimeout(() => opts.onSecond?.(), (toneDur + gap) * 1000 + 60),
  );
  timers.push(
    window.setTimeout(
      () => opts.onDone?.(),
      (toneDur * 2 + gap) * 1000 + 120,
    ),
  );

  return () => {
    for (const t of timers) window.clearTimeout(t);
    const now = ctx.currentTime;
    for (const osc of [...a, ...b]) {
      try {
        osc.stop(now);
      } catch {
        /* already stopped */
      }
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Choir — the world that sings in your perceptual direction.
// ─────────────────────────────────────────────────────────────────────────────

const CHOIR_PARTIALS = 8;
const CHOIR_FLOW = 27.5; // A0
const CHOIR_CENTER_OCT = 4.2;
const CHOIR_SIGMA_OCT = 1.7;

interface ChoirVoice {
  oscs: OscillatorNode[];
  gains: GainNode[];
  panner: StereoPannerNode;
  phase: number; // octaves, wraps at 1
  detune: number; // fractional-octave detune of the whole comb
  rateJitter: number; // per-voice speed variation
}

/**
 * A bank of detuned Shepard-Risset voices spread across the stereo field. The
 * whole cloud glides in a signed `direction` ([-1..+1], smoothly slewed) so it
 * ascends when the listener hears "rising" and descends when they hear
 * "falling" — and reverses live if their bias flips. `level` fades the cloud in
 * once enough answers exist. Drive `step(dt)` once per animation frame.
 */
export class Choir {
  private ctx: AudioContext;
  private master: GainNode;
  private voices: ChoirVoice[] = [];
  private dir = 0; // smoothed signed direction
  private dirTarget = 0;
  private level = 0; // smoothed 0..1 loudness envelope
  private levelTarget = 0;
  private stopped = false;

  constructor(ctx: AudioContext, dest: AudioNode, count = 6) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(dest);

    for (let v = 0; v < count; v++) {
      const panner = ctx.createStereoPanner();
      // spread voices evenly across the field, slightly randomised
      panner.pan.value = (v / (count - 1)) * 1.6 - 0.8;
      panner.connect(this.master);

      const oscs: OscillatorNode[] = [];
      const gains: GainNode[] = [];
      const detune = (v - (count - 1) / 2) * 0.012; // gentle chorus spread
      for (let k = 0; k < CHOIR_PARTIALS; k++) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        const g = ctx.createGain();
        g.gain.value = 0;
        osc.connect(g);
        g.connect(panner);
        osc.start();
        oscs.push(osc);
        gains.push(g);
      }
      this.voices.push({
        oscs,
        gains,
        panner,
        phase: v / count, // stagger starting phases so voices don't align
        detune,
        rateJitter: 0.85 + 0.3 * (v / Math.max(1, count - 1)),
      });
    }
  }

  /** Signed target direction: +1 rising, -1 falling, 0 neutral. */
  setDirection(d: number) {
    this.dirTarget = Math.max(-1, Math.min(1, d));
  }

  /** Target loudness envelope, 0..1. */
  setLevel(l: number) {
    this.levelTarget = Math.max(0, Math.min(1, l));
  }

  step(dt: number) {
    if (this.stopped) return;
    const now = this.ctx.currentTime;
    const cdt = Math.min(0.1, Math.max(0, dt));

    // slew direction & level so flips feel like the room turning, not a cut
    const sd = 1 - Math.exp(-cdt / 2.5);
    this.dir += (this.dirTarget - this.dir) * sd;
    const sl = 1 - Math.exp(-cdt / 3.0);
    this.level += (this.levelTarget - this.level) * sl;

    this.master.gain.setTargetAtTime(this.level * 0.5, now, 0.1);

    const baseRate = 0.05; // octaves/sec magnitude of the endless glide
    for (const voice of this.voices) {
      voice.phase += this.dir * baseRate * voice.rateJitter * cdt;
      voice.phase -= Math.floor(voice.phase);
      for (let k = 0; k < CHOIR_PARTIALS; k++) {
        const oct = k + voice.phase + voice.detune;
        const freq = CHOIR_FLOW * Math.pow(2, oct);
        voice.oscs[k].frequency.setTargetAtTime(freq, now, 0.05);
        const w = bell(oct, CHOIR_CENTER_OCT, CHOIR_SIGMA_OCT);
        voice.gains[k].gain.setTargetAtTime(w * 0.5, now, 0.08);
      }
    }
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    } catch {
      /* ctx closing */
    }
    const killAt = now + 0.7;
    for (const voice of this.voices) {
      for (const osc of voice.oscs) {
        try {
          osc.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
    }
  }
}

export const PITCH_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
] as const;
