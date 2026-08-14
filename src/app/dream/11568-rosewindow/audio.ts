// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the rose window's voice: an additive detuned-sine organ/celeste,
// one voice per held note, breathing through a cathedral convolution tail.
//
//   Per note: a fundamental sine, a +9-cent detuned sine (the celeste beat),
//   and a soft triangle an octave up at low level (the organ mixture's air).
//   Attack ~70ms, sustain while held, release ~1.4s exponential fade.
//
// The whole mix is summed into the shared cathedral-void convolution reverb
// (_shared/visionary/convolutionVoid) and THAT feeds the shared ear-safety
// master bus (_shared/visionary/safeMaster) — never straight to destination.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { createVoidReverb, type VoidReverb } from "../_shared/visionary/convolutionVoid";

const RELEASE_SECONDS = 1.4;

/** midi note number → frequency in Hz (A4 = 69 = 440Hz). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface Voice {
  oscs: OscillatorNode[];
  gain: GainNode;
  releasing: boolean;
}

export class RoseAudio {
  private ctx: AudioContext;
  private master: SafeMaster;
  private reverb: VoidReverb;
  private bus: GainNode;
  private voices = new Map<number, Voice>();
  private stopped = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = createSafeMaster(ctx, { gain: 0.82 });

    // A vast, stone-cistern reverb tail — the cathedral itself, ringing.
    this.reverb = createVoidReverb(ctx, { seconds: 4.2, decay: 2.1, wet: 0.36 });
    this.reverb.output.connect(this.master.input);

    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.reverb.input);
  }

  /** Hold a note. Retriggers cleanly if already sounding. Release fade ~1.4s. */
  noteOn(midi: number, velocity: number): void {
    if (this.stopped) return;
    this.noteOff(midi);

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = midiToFreq(midi);
    const vel = Math.max(0, Math.min(1, velocity));
    const level = 0.05 + vel * 0.1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.07);
    gain.connect(this.bus);

    const oscs: OscillatorNode[] = [];
    // fundamental, celeste-detuned twin, and a quiet octave-up mixture partial.
    const specs: { type: OscillatorType; mult: number; detune: number; amp: number }[] = [
      { type: "sine", mult: 1, detune: 0, amp: 0.62 },
      { type: "sine", mult: 1, detune: 9, amp: 0.5 },
      { type: "triangle", mult: 2, detune: -4, amp: 0.24 },
    ];
    for (const spec of specs) {
      const osc = ctx.createOscillator();
      osc.type = spec.type;
      osc.frequency.value = freq * spec.mult;
      osc.detune.value = spec.detune;
      const g = ctx.createGain();
      g.gain.value = spec.amp;
      osc.connect(g);
      g.connect(gain);
      osc.start(now);
      oscs.push(osc);
    }

    this.voices.set(midi, { oscs, gain, releasing: false });
  }

  /** Release a held note with a ~1.4s exponential fade, then tear its voice down. */
  noteOff(midi: number): void {
    const v = this.voices.get(midi);
    if (!v || v.releasing) return;
    v.releasing = true;
    const now = this.ctx.currentTime;
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, now + RELEASE_SECONDS);
    } catch {
      /* ctx closing */
    }
    const killAt = now + RELEASE_SECONDS + 0.1;
    for (const osc of v.oscs) {
      try {
        osc.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
    this.voices.delete(midi);
  }

  /** Fade + tear down every node, releasing any still-held voices first. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const midi of Array.from(this.voices.keys())) this.noteOff(midi);
    this.master.disconnect();
  }
}
