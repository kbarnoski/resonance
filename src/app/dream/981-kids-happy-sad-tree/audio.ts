/**
 * audio.ts — Web Audio engine for the Happy/Sad Tree.
 *
 * CORE TECHNIQUE: parallel C major <-> C natural minor mode flip with
 * voice-led chord re-voicing.
 *
 *   - An always-on 3-voice warm pad holds the current chord of a
 *     I–vi–IV–V progression (in minor: i–VI–iv–v). Same roman-numeral
 *     functions, same bass roots — only the chord *quality* (the 3rd / 6th /
 *     7th scale degrees) changes between modes. That lowered 3rd/6th is exactly
 *     where the major/minor feeling lives (Hevner 1935–37).
 *   - Flipping mode does NOT restart the pad. Each held pad voice glides
 *     (exponential frequency ramp, ~400ms) to its nearest chord tone in the new
 *     mode — true voice leading, so the world melts from happy to tender rather
 *     than cutting.
 *   - Tapping fruit plucks a diatonic melody note, quantized to the *current*
 *     mode's scale, so every tap is musically valid (no "wrong" notes) yet still
 *     real tonal harmony — NOT a pentatonic safety scale.
 *
 * Safety chain (kids rules): master gain (<=0.3) -> lowpass(~6500) ->
 * DynamicsCompressor -> destination. No sudden loud transients, no high ring.
 *
 * Self-contained, no external imports.
 */

export type Mode = "major" | "minor";

// MIDI note -> frequency
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Scale degrees (semitone offsets from tonic) for C as tonic.
// Major:  W W H W W W H  -> 0 2 4 5 7 9 11
// Natural minor: W H W W H W W -> 0 2 3 5 7 8 10
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

const TONIC_MIDI = 60; // C4

// The seven big fruit map to scale degrees 1..7 of the current mode, voiced
// from C4 up so a 4-year-old's left->right / low->high taps feel like a ladder.
export const FRUIT_COUNT = 7;

function scaleFor(mode: Mode): number[] {
  return mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
}

/** Frequency for fruit index (0..6) in the given mode. */
export function fruitFreq(idx: number, mode: Mode): number {
  const scale = scaleFor(mode);
  const deg = idx % 7;
  return mtof(TONIC_MIDI + scale[deg]);
}

// ---- Chord progression -------------------------------------------------------
// Roman numerals as scale-degree roots (0-based degree index into the scale)
// plus the chord-tone degrees relative to the chord root.
// Progression: I – vi – IV – V  (degrees 0, 5, 3, 4 as roots).
// A diatonic triad on degree d uses degrees d, d+2, d+4 of the scale.
const PROGRESSION_ROOTS = [0, 5, 3, 4]; // I, vi, IV, V

/** Build the 3 chord-tone frequencies (root/3rd/5th) for a progression step. */
function chordFreqs(step: number, mode: Mode): number[] {
  const scale = scaleFor(mode);
  const rootDeg = PROGRESSION_ROOTS[step % PROGRESSION_ROOTS.length];
  const tones = [0, 2, 4].map((off) => {
    const d = rootDeg + off;
    const octave = Math.floor(d / 7);
    const semis = scale[((d % 7) + 7) % 7] + 12 * octave;
    return semis;
  });
  // Voice the pad in a warm low register: tonic around C3.
  return tones.map((s) => mtof(TONIC_MIDI - 12 + s));
}

interface PadVoice {
  osc: OscillatorNode;
  osc2: OscillatorNode; // detuned partner for warmth
  gain: GainNode;
}

export class TreeAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private lp: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private padBus: GainNode;
  private voices: PadVoice[] = [];
  private step = 0;
  private mode: Mode = "major";
  private chordTimer: number | null = null;
  private startedAt = 0;
  private stopped = false;

  // ~3.0s per chord step -> a calm I-vi-IV-V loop
  private readonly STEP_SEC = 3.0;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.25;

    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 6500;
    this.lp.Q.value = 0.4;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // fade in on start

    this.padBus = this.ctx.createGain();
    this.padBus.gain.value = 0.55;

    // pad -> master ; (plucks connect straight to master too)
    this.padBus.connect(this.master);
    this.master.connect(this.lp);
    this.lp.connect(this.comp);
    this.comp.connect(this.ctx.destination);
  }

  /** Must be called from a user gesture. Starts pad + progression loop. */
  async start() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.startedAt = this.ctx.currentTime;

    const freqs = chordFreqs(this.step, this.mode);
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc2.type = "sawtooth";
      osc.frequency.value = freqs[i];
      osc2.frequency.value = freqs[i];
      osc2.detune.value = 7; // gentle chorus
      gain.gain.value = i === 0 ? 0.14 : 0.1; // root a touch louder
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(this.padBus);
      osc.start();
      osc2.start();
      this.voices.push({ osc, osc2, gain });
    }

    // master fade-in (no transient)
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(0.3, t + 1.2);

    this.scheduleNextStep();
  }

  private scheduleNextStep() {
    if (this.stopped) return;
    this.chordTimer = window.setTimeout(() => {
      this.step = (this.step + 1) % PROGRESSION_ROOTS.length;
      this.applyChord(0.6);
      this.scheduleNextStep();
    }, this.STEP_SEC * 1000);
  }

  /** Glide pad voices to the current step's chord in the current mode. */
  private applyChord(glideSec: number) {
    const freqs = chordFreqs(this.step, this.mode);
    const t = this.ctx.currentTime;
    this.voices.forEach((v, i) => {
      const f = freqs[i];
      v.osc.frequency.cancelScheduledValues(t);
      v.osc.frequency.setValueAtTime(Math.max(20, v.osc.frequency.value), t);
      v.osc.frequency.exponentialRampToValueAtTime(f, t + glideSec);
      v.osc2.frequency.cancelScheduledValues(t);
      v.osc2.frequency.setValueAtTime(Math.max(20, v.osc2.frequency.value), t);
      v.osc2.frequency.exponentialRampToValueAtTime(f, t + glideSec);
    });
  }

  /**
   * Flip parallel mode. The held chord re-voices via voice leading over ~400ms
   * (no restart) so the SAME progression step melts to the other quality.
   */
  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyChord(0.4); // ~400ms voice-led re-voicing
  }

  getMode(): Mode {
    return this.mode;
  }

  /** Pluck a diatonic melody note for fruit `idx`, quantized to current mode. */
  pluck(idx: number) {
    if (this.stopped) return;
    const f = fruitFreq(idx, this.mode);
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = "triangle";
    osc2.type = "sine";
    osc.frequency.value = f;
    osc2.frequency.value = f * 2; // soft octave shimmer
    osc2.detune.value = 4;

    const peak = 0.22;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.012); // fast but not clicky
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.1); // bell-like decay

    const o2g = this.ctx.createGain();
    o2g.gain.value = 0.35;
    osc.connect(env);
    osc2.connect(o2g);
    o2g.connect(env);
    env.connect(this.master);

    osc.start(t);
    osc2.start(t);
    osc.stop(t + 1.25);
    osc2.stop(t + 1.25);
  }

  /** Seconds since start — used to enforce the ~15min session cap. */
  elapsed(): number {
    return this.ctx.currentTime - this.startedAt;
  }

  /** Gentle global fade (session cap reached). */
  fadeOut(sec = 4) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
    this.master.gain.exponentialRampToValueAtTime(0.0001, t + sec);
  }

  dispose() {
    this.stopped = true;
    if (this.chordTimer !== null) clearTimeout(this.chordTimer);
    try {
      this.voices.forEach((v) => {
        try {
          v.osc.stop();
          v.osc2.stop();
        } catch {
          /* already stopped */
        }
      });
    } catch {
      /* ignore */
    }
    this.voices = [];
    if (this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
  }
}
