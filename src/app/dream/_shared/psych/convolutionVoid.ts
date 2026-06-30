// ─────────────────────────────────────────────────────────────────────────────
// _shared/psych/convolutionVoid.ts — a code-generated convolution reverb for the
// altered-states pieces: a vast, cistern-like void tail with no external IR file.
//
//   The impulse response is synthesised directly into an AudioBuffer — stereo
//   decorrelated noise under an exponential decay envelope, with an early-time
//   low-shelf so the onset is dark and the tail blooms. This is the same noise-
//   decay IR re-built by hand across 1052/1053/1054/1056/1058/1066/1067; this is
//   the canonical copy.  EXTRACTED 2026-06-30 (cycle 611).
//
//   Returns a wet/dry-mixable node pair so a caller can route a bus through it:
//     const verb = createVoidReverb(ctx, { seconds: 4, decay: 3 });
//     source.connect(verb.input); verb.output.connect(master);
//     verb.setWet(0.6);
// ─────────────────────────────────────────────────────────────────────────────

export interface VoidReverbOptions {
  /** Tail length in seconds. Default 4. */
  seconds?: number;
  /** Decay steepness (higher = shorter tail). Default 3. */
  decay?: number;
  /** Initial wet mix 0..1. Default 0.5. */
  wet?: number;
}

export interface VoidReverb {
  input: GainNode;
  output: GainNode;
  /** Set the 0..1 wet/dry balance (equal-ish power). */
  setWet(w: number): void;
}

/** Build a stereo noise-decay impulse response buffer. */
function buildImpulse(
  ctx: BaseAudioContext,
  seconds: number,
  decay: number,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    // A simple LCG keeps the IR deterministic (no Math.random dependence) so the
    // void sounds identical every build/run.
    let seed = ch === 0 ? 0x9e3779b1 : 0x85ebca77;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, decay);
      // Fade the very first few ms in so the onset is soft, not a click.
      const onset = Math.min(1, (i / rate) / 0.01);
      data[i] = (rnd() * 2 - 1) * env * onset;
    }
  }
  return buf;
}

export function createVoidReverb(
  ctx: AudioContext,
  opts: VoidReverbOptions = {},
): VoidReverb {
  const seconds = opts.seconds ?? 4;
  const decay = opts.decay ?? 3;

  const input = ctx.createGain();
  const output = ctx.createGain();

  const convolver = ctx.createConvolver();
  convolver.normalize = true;
  convolver.buffer = buildImpulse(ctx, seconds, decay);

  // Darken the tail onset a touch so the void feels cavernous, not hissy.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 4200;

  const wetGain = ctx.createGain();
  const dryGain = ctx.createGain();

  input.connect(convolver);
  convolver.connect(tone);
  tone.connect(wetGain);
  wetGain.connect(output);

  input.connect(dryGain);
  dryGain.connect(output);

  const setWet = (w: number) => {
    const wet = Math.min(1, Math.max(0, w));
    const now = ctx.currentTime;
    wetGain.gain.setTargetAtTime(wet, now, 0.1);
    dryGain.gain.setTargetAtTime(1 - wet, now, 0.1);
  };
  setWet(opts.wet ?? 0.5);

  return { input, output, setWet };
}
