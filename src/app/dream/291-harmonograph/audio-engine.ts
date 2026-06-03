// ── Harmonograph audio engine ────────────────────────────────────────────────
// Warm polyphonic Web Audio synth: per-voice sine + detuned triangle → lowpass
// → ADSR gain → shared feedback delay → master → limiter → destination.
// All construction guarded; AudioContext created only on a user gesture.

export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/** MIDI note number → name with octave, e.g. 60 → "C4". */
export function noteName(midi: number): string {
  const n = NOTE_NAMES[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return `${n}${oct}`;
}

/** 12-TET frequency for a MIDI note. A4 (69) = 440Hz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Just-intonation ratio table within one octave (numerator/denominator).
const JI_RATIOS: Array<[number, number]> = [
  [1, 1],
  [16, 15],
  [9, 8],
  [6, 5],
  [5, 4],
  [4, 3],
  [45, 32],
  [3, 2],
  [8, 5],
  [5, 3],
  [9, 5],
  [15, 8],
  [2, 1],
];

/**
 * Snap a raw frequency ratio (vs the lowest held note) to the nearest small-
 * integer just ratio, octave-extended. Returns the snapped ratio.
 */
export function snapToJustRatio(ratio: number): number {
  if (ratio <= 0) return 1;
  // Fold into [1, 2) and remember the octave.
  let oct = 0;
  let r = ratio;
  while (r >= 2) {
    r /= 2;
    oct++;
  }
  while (r < 1) {
    r *= 2;
    oct--;
  }
  let best = 1;
  let bestErr = Infinity;
  for (const [num, den] of JI_RATIOS) {
    const v = num / den;
    // compare in cents for perceptual nearness
    const err = Math.abs(1200 * Math.log2(v / r));
    if (err < bestErr) {
      bestErr = err;
      best = v;
    }
  }
  return best * Math.pow(2, oct);
}

/** Pretty fraction label for a just ratio (best-effort small fraction). */
export function ratioLabel(ratio: number): string {
  let oct = 0;
  let r = ratio;
  while (r >= 2 - 1e-6) {
    r /= 2;
    oct++;
  }
  while (r < 1 - 1e-6) {
    r *= 2;
    oct--;
  }
  let label = "1/1";
  let bestErr = Infinity;
  for (const [num, den] of JI_RATIOS) {
    const err = Math.abs(num / den - r);
    if (err < bestErr) {
      bestErr = err;
      label = den === 1 ? `${num}` : `${num}/${den}`;
    }
  }
  if (oct > 0) return `${label}·${Math.pow(2, oct)}`;
  if (oct < 0) return `${label}/${Math.pow(2, -oct)}`;
  return label;
}

// ── Voice + engine ───────────────────────────────────────────────────────────

type Voice = {
  midi: number;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  releasing: boolean;
};

export type ActiveNote = {
  midi: number;
  velocity: number; // 0..1
};

export class HarmonographSynth {
  ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private wet: GainNode;
  private dry: GainNode;
  private drone: GainNode;
  private voices: Map<number, Voice> = new Map();
  private maxVoices = 12;
  justIntonation = false;
  // Sustain pedal: while down, key-up does not release the voice — it is parked
  // here and only released when the pedal lifts.
  private pedalDown = false;
  private sustained: Set<number> = new Set();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const now = ctx.currentTime;

    this.master = ctx.createGain();
    this.master.gain.value = 0.8;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.setValueAtTime(-10, now);
    this.comp.knee.setValueAtTime(6, now);
    this.comp.ratio.setValueAtTime(12, now);
    this.comp.attack.setValueAtTime(0.003, now);
    this.comp.release.setValueAtTime(0.18, now);

    // Feedback delay (wet/dry)
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.28;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.35;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.92;

    // master → dry → comp ; master → delay loop → wet → comp
    this.master.connect(this.dry);
    this.dry.connect(this.comp);
    this.master.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.wet);
    this.wet.connect(this.comp);
    this.comp.connect(ctx.destination);

    // Very soft always-on drone (low C2) so the room is never silent.
    this.drone = ctx.createGain();
    this.drone.gain.value = 0.0;
    const d1 = ctx.createOscillator();
    d1.type = "sine";
    d1.frequency.value = midiToFreq(36);
    const d2 = ctx.createOscillator();
    d2.type = "sine";
    d2.frequency.value = midiToFreq(48);
    const dFilt = ctx.createBiquadFilter();
    dFilt.type = "lowpass";
    dFilt.frequency.value = 320;
    d1.connect(dFilt);
    d2.connect(dFilt);
    dFilt.connect(this.drone);
    this.drone.connect(this.master);
    d1.start();
    d2.start();
    this.drone.gain.setTargetAtTime(0.018, now, 1.5);
  }

  setJustIntonation(on: boolean) {
    this.justIntonation = on;
  }

  /**
   * Compute the playback frequency for a note given the current set of held
   * notes and tuning mode. lowestMidi is the bass anchor.
   */
  private freqFor(midi: number, lowestMidi: number): number {
    if (!this.justIntonation || lowestMidi == null) {
      return midiToFreq(midi);
    }
    const baseFreq = midiToFreq(lowestMidi);
    const rawRatio = midiToFreq(midi) / baseFreq;
    const snapped = snapToJustRatio(rawRatio);
    return baseFreq * snapped;
  }

  noteOn(midi: number, velocity: number, lowestMidi: number) {
    // re-striking a note removes it from the sustained set
    this.sustained.delete(midi);
    if (this.voices.has(midi)) {
      this.noteOff(midi, true);
    }
    if (this.voices.size >= this.maxVoices) {
      // steal the oldest voice
      const oldest = this.voices.keys().next().value;
      if (oldest != null) this.noteOff(oldest, true);
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = this.freqFor(midi, lowestMidi);

    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = freq;

    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = freq;
    osc2.detune.value = 7; // ~+7 cents shimmer

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    // velocity → brighter
    const cutoff = 600 + velocity * 4200;
    filter.frequency.value = cutoff;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    // ADSR
    const peak = 0.16 + velocity * 0.34;
    const sustain = peak * 0.6;
    const attack = 0.012;
    const decay = 0.15;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.linearRampToValueAtTime(sustain, now + attack + decay);

    osc1.start(now);
    osc2.start(now);

    this.voices.set(midi, {
      midi,
      osc1,
      osc2,
      filter,
      gain,
      releasing: false,
    });
  }

  noteOff(midi: number, immediate = false) {
    // While the pedal is down, a key release parks the note rather than
    // silencing it; the voice keeps ringing until the pedal lifts.
    if (this.pedalDown && !immediate) {
      if (this.voices.has(midi)) this.sustained.add(midi);
      return;
    }
    this.sustained.delete(midi);
    const v = this.voices.get(midi);
    if (!v || v.releasing) return;
    v.releasing = true;
    const now = this.ctx.currentTime;
    const release = immediate ? 0.02 : 0.25;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(0, now + release);
    v.osc1.stop(now + release + 0.03);
    v.osc2.stop(now + release + 0.03);
    this.voices.delete(midi);
    window.setTimeout(() => {
      try {
        v.osc1.disconnect();
        v.osc2.disconnect();
        v.filter.disconnect();
        v.gain.disconnect();
      } catch {
        /* already gone */
      }
    }, (release + 0.1) * 1000);
  }

  /** Re-tune all currently sounding voices (e.g. when JI toggles). */
  retune(lowestMidi: number) {
    const now = this.ctx.currentTime;
    this.voices.forEach((v) => {
      if (v.releasing) return;
      const freq = this.freqFor(v.midi, lowestMidi);
      v.osc1.frequency.setTargetAtTime(freq, now, 0.04);
      v.osc2.frequency.setTargetAtTime(freq, now, 0.04);
    });
  }

  /**
   * Set the sustain pedal state. On release, every note that was parked
   * (sustained-but-key-released) is actually released. Returns the list of
   * midis that were dropped so the caller can update the drawn figure.
   */
  setPedal(down: boolean): number[] {
    if (down === this.pedalDown) return [];
    this.pedalDown = down;
    if (down) return [];
    const dropped = Array.from(this.sustained);
    this.sustained.clear();
    for (const midi of dropped) {
      this.noteOff(midi);
    }
    return dropped;
  }

  dispose() {
    this.voices.forEach((v) => {
      try {
        v.osc1.stop();
        v.osc2.stop();
        v.osc1.disconnect();
        v.osc2.disconnect();
        v.filter.disconnect();
        v.gain.disconnect();
      } catch {
        /* noop */
      }
    });
    this.voices.clear();
    try {
      this.master.disconnect();
      this.comp.disconnect();
      this.delay.disconnect();
      this.feedback.disconnect();
      this.wet.disconnect();
      this.dry.disconnect();
      this.drone.disconnect();
    } catch {
      /* noop */
    }
  }
}
