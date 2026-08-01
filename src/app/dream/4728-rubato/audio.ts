// ════════════════════════════════════════════════════════════════════════════
// 4728 — rubato · Web Audio ensemble (bass + chords + soft pad + melody bell)
//
// The ensemble lays notes IN TIME with the attending oscillator's predicted
// beats via a LOOK-AHEAD SCHEDULER: the RAF loop asks for beats a short window
// into the future and each is scheduled precisely on the AudioContext clock.
// Onsets are timed on `performance.now()`; a fixed perf→audio offset (captured
// when the context starts) maps a predicted beat time onto sample-accurate
// audio time. Nothing here uses Math.random / Date — timing is deterministic.
// ════════════════════════════════════════════════════════════════════════════

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// A short diatonic jazz turnaround in C. Each entry advances every 2 beats.
// root = MIDI of the bass root; tones = chord-tone MIDI notes (mid register).
interface Chord {
  name: string;
  root: number;
  tones: number[];
}

const PROGRESSION: Chord[] = [
  { name: "Dm7", root: 50, tones: [62, 65, 69, 72] }, // D F A C
  { name: "G7", root: 43, tones: [59, 62, 65, 67] }, //  B D F G
  { name: "Cmaj7", root: 48, tones: [60, 64, 67, 71] }, // C E G B
  { name: "A7", root: 45, tones: [61, 64, 67, 69] }, //  C# E G A
  { name: "Dm7", root: 50, tones: [62, 65, 69, 72] },
  { name: "G7", root: 43, tones: [59, 62, 65, 67] },
  { name: "Em7", root: 52, tones: [59, 62, 64, 67] }, // B D E G
  { name: "A7", root: 45, tones: [61, 64, 67, 69] },
];

export const PROGRESSION_LENGTH = PROGRESSION.length;

// Melody keyboard row → one octave of C major (C4..C5). Index by scale degree.
export const MELODY_MIDI = [60, 62, 64, 65, 67, 69, 71, 72];

export class Ensemble {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private t0Perf = 0;
  private t0Audio = 0;
  muted = false;

  /** Lazily create + resume the AudioContext (must be inside a user gesture). */
  ensureStarted(): boolean {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return true;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return false;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    // Gentle bus compression via a soft-clipping waveshaper feel is overkill;
    // a plain master gain keeps the trio intimate.
    this.ctx = ctx;
    this.master = master;
    this.t0Perf = performance.now() / 1000;
    this.t0Audio = ctx.currentTime;
    return true;
  }

  get started(): boolean {
    return this.ctx !== null;
  }

  /** Map a performance.now()-seconds instant onto the audio clock. */
  private perfToAudio(perfSec: number): number {
    if (!this.ctx) return 0;
    const at = this.t0Audio + (perfSec - this.t0Perf);
    return Math.max(at, this.ctx.currentTime + 0.005);
  }

  private voiceGain(): GainNode | null {
    if (!this.ctx || !this.master || this.muted) return null;
    const g = this.ctx.createGain();
    g.connect(this.master);
    return g;
  }

  /** One plucked/sustained tone with an ADSR-ish envelope. */
  private tone(
    at: number,
    freq: number,
    type: OscillatorType,
    peak: number,
    attack: number,
    dur: number,
    detune = 0
  ): void {
    if (!this.ctx) return;
    const g = this.voiceGain();
    if (!g) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(g);
    const gg = g.gain;
    gg.setValueAtTime(0.0001, at);
    gg.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
    gg.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.start(at);
    osc.stop(at + dur + 0.03);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /**
   * Schedule a beat: bass on every beat, chord stabs on chord-change beats,
   * a soft pad on the downbeat of each bar. `perfBeatTime` is in
   * performance.now seconds; `beatIndex` counts beats from the start.
   */
  scheduleBeat(perfBeatTime: number, beatIndex: number): void {
    if (!this.ctx || this.muted) return;
    const at = this.perfToAudio(perfBeatTime);
    const chord = PROGRESSION[Math.floor(beatIndex / 2) % PROGRESSION.length];
    const inBar = beatIndex % 4;
    const isChordChange = beatIndex % 2 === 0;
    const isDownbeat = inBar === 0;

    // Bass — root on strong beats, fifth on the off (a gentle two-feel).
    const bassMidi = inBar === 0 || inBar === 2 ? chord.root : chord.root + 7;
    this.tone(at, midiToFreq(bassMidi - 12), "triangle", 0.34, 0.012, 0.5);
    this.tone(at, midiToFreq(bassMidi - 12), "sine", 0.22, 0.02, 0.42, 4);

    // Chord — soft stab on each chord change beat.
    if (isChordChange) {
      chord.tones.forEach((m, i) => {
        this.tone(
          at + 0.006 * i,
          midiToFreq(m),
          "sine",
          0.11,
          0.05,
          0.62,
          i % 2 ? 5 : -5
        );
      });
    }

    // Pad — long sustained cushion under the whole bar on the downbeat.
    if (isDownbeat) {
      chord.tones.forEach((m, i) => {
        this.tone(at, midiToFreq(m - 12), "sine", 0.05, 0.28, 2.1, i * 3 - 4);
      });
    }
  }

  /** A bright melody bell, played immediately (at ~now on the audio clock). */
  playMelody(freq: number): void {
    if (!this.ctx || this.muted) return;
    const at = this.ctx.currentTime + 0.005;
    this.tone(at, freq, "triangle", 0.24, 0.006, 0.5);
    this.tone(at, freq * 2, "sine", 0.08, 0.006, 0.34);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        m ? 0 : 0.9,
        this.ctx.currentTime,
        0.02
      );
    }
  }

  chordName(beatIndex: number): string {
    return PROGRESSION[Math.floor(beatIndex / 2) % PROGRESSION.length].name;
  }

  async close(): Promise<void> {
    if (this.ctx && this.ctx.state !== "closed") {
      try {
        await this.ctx.close();
      } catch {
        /* already closing */
      }
    }
    this.ctx = null;
    this.master = null;
  }
}
