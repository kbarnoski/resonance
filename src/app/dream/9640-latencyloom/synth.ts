// ─────────────────────────────────────────────────────────────────────────────
// synth.ts — local synthesis for 9640-latencyloom (the Cornelljam pattern).
//
// Receivers never stream audio: a note arrives as a control event and every
// client re-synthesizes it locally, which is why a room of any size costs zero
// bandwidth. Each lane owns a distinct timbre + stereo position so overlapping
// canon voices stay individually audible.
//
// Tuning is JUST INTONATION — 7-limit ratios over a ~196 Hz fundamental — not a
// pentatonic scale. The stacked ratios ring cleanly against each other, which
// is what makes a latency-offset canon read as harmony rather than mud.
// ─────────────────────────────────────────────────────────────────────────────

/** 7-limit just-intonation degrees over the fundamental (NOT pentatonic). */
export const JI_RATIOS = [1 / 1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 7 / 4, 2 / 1] as const;

/** Room fundamental in Hz (G3-ish). */
export const FUNDAMENTAL = 196;

/** Number of playable degrees (mapped to the a-s-d-f-g-h-j-k row). */
export const DEGREES = JI_RATIOS.length;

export interface LaneTimbre {
  wave: OscillatorType;
  detune: number; // cents, lane character
  pan: number; // -1..1 stereo seat
}

/** Deterministic timbre + stereo seat for a lane index. */
export function makeLaneTimbre(lane: number): LaneTimbre {
  const waves: OscillatorType[] = ["sine", "triangle", "sine", "triangle", "sawtooth"];
  const pans = [0, -0.62, 0.62, -0.32, 0.32, -0.85, 0.85];
  return {
    wave: waves[lane % waves.length],
    detune: ((lane * 7) % 24) - 12,
    pan: pans[lane % pans.length],
  };
}

/** Frequency for a scale degree (wraps + octaves up past the top degree). */
export function degreeToFreq(pitchIndex: number): number {
  const n = JI_RATIOS.length;
  const oct = Math.floor(pitchIndex / n);
  const r = JI_RATIOS[((pitchIndex % n) + n) % n];
  return FUNDAMENTAL * r * Math.pow(2, oct);
}

export interface VoiceOpts {
  freq: number;
  /** Absolute AudioContext time to begin, in seconds. */
  when: number;
  timbre: LaneTimbre;
  /** Peak gain before the safe-master bus, 0..1. */
  gain: number;
}

/** Schedule one gentle plucked-bell voice. Everything routes to `dest`
 *  (the safe-master input) — never straight to ctx.destination. */
export function scheduleVoice(ctx: AudioContext, dest: AudioNode, o: VoiceOpts): void {
  const t0 = Math.max(o.when, ctx.currentTime + 0.001);
  const { freq, timbre, gain } = o;

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = timbre.wave;
  osc2.type = timbre.wave;
  osc1.frequency.value = freq;
  osc2.frequency.value = freq;
  osc1.detune.value = timbre.detune + 5;
  osc2.detune.value = timbre.detune - 5;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.min(4200, freq * 5);
  lp.Q.value = 0.6;

  const g = ctx.createGain();
  const peak = Math.max(0.0002, gain);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(peak * 0.5, t0 + 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.25);

  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, timbre.pan));

  osc1.connect(lp);
  osc2.connect(lp);
  lp.connect(g);
  g.connect(pan);
  pan.connect(dest);

  osc1.start(t0);
  osc2.start(t0);
  osc1.stop(t0 + 1.45);
  osc2.stop(t0 + 1.45);
}
