// audio.ts — Web Audio realisation of the planned chords.
//
// A look-ahead scheduler voices each chord with FM-ish oscillator voices
// + ADSR, a bass root, and a sparse melodic line that traces tension.
// Signal path: voice gain -> master lowpass -> compressor -> destination.
// Timbre reflects tension: higher tension => brighter (lowpass opens) and
// slightly detuned/rougher; resolution => warm and narrow.

import { PlacedChord } from "./engine";

const A4 = 440;
function midiToFreq(m: number): number {
  return A4 * Math.pow(2, (m - 69) / 12);
}

// pick a midi note for a pitch class near a target octave
function pcToMidi(pc: number, octave: number): number {
  return 12 * octave + (((pc % 12) + 12) % 12);
}

export interface AudioConfig {
  secondsPerChord: number;
}

export class TensionAudio {
  ctx: AudioContext;
  private master: GainNode;
  private lowpass: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private maxVoices = 14;
  private liveVoices = 0;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 1400;
    this.lowpass.Q.value = 0.6;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.2;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32; // peak well below clipping

    this.lowpass.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  get currentTime(): number {
    return this.ctx.currentTime;
  }

  // A single ADSR voice (two oscillators: carrier + a quiet detuned/FM
  // partial whose depth scales with tension for roughness).
  private voice(
    freq: number,
    when: number,
    dur: number,
    gain: number,
    tension: number,
    type: OscillatorType,
  ): void {
    if (this.liveVoices >= this.maxVoices) return;
    this.liveVoices++;

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    // brightness: higher tension => slightly sharper detune (roughness)
    const partial = this.ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = freq * 2.0;
    const partialGain = this.ctx.createGain();
    partialGain.gain.value = 0.04 + 0.16 * tension; // more upper partial when tense

    const env = this.ctx.createGain();
    const peak = gain;
    const a = 0.02;
    const d = 0.18;
    const s = peak * 0.55;
    const rel = Math.min(0.6, dur * 0.5);

    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(peak, when + a);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, s), when + a + d);
    env.gain.setValueAtTime(Math.max(0.0002, s), when + dur - rel);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    // small per-voice detune that grows with tension
    osc.detune.value = (Math.random() - 0.5) * (4 + 26 * tension);

    osc.connect(env);
    partial.connect(partialGain);
    partialGain.connect(env);
    env.connect(this.lowpass);

    osc.start(when);
    partial.start(when);
    osc.stop(when + dur + 0.05);
    partial.stop(when + dur + 0.05);
    osc.onended = () => {
      this.liveVoices = Math.max(0, this.liveVoices - 1);
      osc.disconnect();
      partial.disconnect();
      env.disconnect();
      partialGain.disconnect();
    };
  }

  // Schedule one chord at AudioContext time `when` lasting `dur` seconds.
  scheduleChord(chord: PlacedChord, when: number, dur: number): void {
    const tension = chord.achieved.tension;

    // open the global lowpass with tension so the whole field brightens
    const cutoff = 700 + 3200 * tension;
    this.lowpass.frequency.setTargetAtTime(cutoff, when, 0.15);

    // bass root, low octave
    const bassMidi = pcToMidi(chord.bassPc, 3);
    this.voice(
      midiToFreq(bassMidi),
      when,
      dur * 1.02,
      0.16,
      tension * 0.4,
      "sine",
    );

    // chord tones in a comfortable mid octave, slightly arpeggiated so
    // dense chords don't pile up
    const baseOct = 4;
    chord.pcs.forEach((pc, i) => {
      const midi = pcToMidi(pc, baseOct + (i >= 3 ? 1 : 0));
      const stagger = i * 0.012;
      const wave: OscillatorType = tension > 0.6 ? "triangle" : "sine";
      this.voice(
        midiToFreq(midi),
        when + stagger,
        dur * 0.95,
        0.085,
        tension,
        wave,
      );
    });

    // sparse melodic line: trace tension with a top note that climbs as
    // tension rises. Sounds on roughly every other chord.
    if (chord.index % 2 === 0) {
      const scaleDeg = Math.floor(tension * (chord.pcs.length - 1));
      const topPc = chord.pcs[Math.min(scaleDeg, chord.pcs.length - 1)];
      const topMidi = pcToMidi(topPc, 5);
      this.voice(
        midiToFreq(topMidi),
        when + dur * 0.12,
        dur * 0.6,
        0.07,
        tension,
        "triangle",
      );
    }
  }

  async close(): Promise<void> {
    try {
      this.master.disconnect();
    } catch {
      /* ignore */
    }
    if (this.ctx.state !== "closed") {
      try {
        await this.ctx.close();
      } catch {
        /* ignore */
      }
    }
  }
}
