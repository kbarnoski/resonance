// ─────────────────────────────────────────────────────────────────────────────
// _shared/visionary/safeMaster.ts — the ear-safety master bus for every audible
// piece. Route a proto's whole mix INTO `input` and it comes out tamed: no
// screeching top end, no runaway peaks, a hard ceiling before the speakers.
//
// The chain (input → destination):
//   1. input gain           — the single node every source connects to.
//   2. high-shelf cut        — pulls down everything above ~5.5 kHz so bright
//                              synths / FM / noise can never turn into a hiss.
//   3. lowpass safety cap    — a gentle 12 dB/oct roof at ~14 kHz kills the
//                              piercing airband entirely (nothing musical lives
//                              up there; sibilant harshness does).
//   4. DynamicsCompressor    — configured as a brick-wall-ish limiter: high
//                              ratio, low threshold, fast attack, so no transient
//                              ever slams the output.
//   5. output gain           — a conservative final trim (0.85) as the last
//                              ceiling before ctx.destination.
//
// Design intent matches the house sound: cosmic / meditative / Richter-calm,
// never buzzy or harsh. Prefer this over each proto hand-rolling its own master.
// ─────────────────────────────────────────────────────────────────────────────

export interface SafeMasterOptions {
  /** Final output trim, 0..1. Default 0.85. */
  gain?: number;
  /** High-shelf corner (Hz) above which brightness is pulled down. Default 5500. */
  shelfHz?: number;
  /** High-shelf attenuation in dB (negative). Default -6. */
  shelfDb?: number;
  /** Lowpass safety-cap corner (Hz). Default 14000. */
  capHz?: number;
}

export interface SafeMaster {
  /** Connect every source in the piece to THIS node. */
  input: GainNode;
  /** Set the final output trim (0..1), smoothed. */
  setGain(v: number): void;
  /** Analyser tap fed by the tamed signal — handy for visuals. */
  analyser: AnalyserNode;
  /** Detach the whole chain from the destination. */
  disconnect(): void;
}

export function createSafeMaster(
  ctx: AudioContext,
  opts: SafeMasterOptions = {},
): SafeMaster {
  const gain = opts.gain ?? 0.85;
  const shelfHz = opts.shelfHz ?? 5500;
  const shelfDb = opts.shelfDb ?? -6;
  const capHz = opts.capHz ?? 14000;

  const input = ctx.createGain();
  input.gain.value = 1;

  const shelf = ctx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = shelfHz;
  shelf.gain.value = shelfDb;

  const cap = ctx.createBiquadFilter();
  cap.type = "lowpass";
  cap.frequency.value = capHz;
  cap.Q.value = 0.707;

  // Limiter: catch peaks before they reach the speakers. Fast attack, musical
  // release, high ratio + low threshold so it clamps rather than pumps.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const out = ctx.createGain();
  out.gain.value = gain;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.8;

  input.connect(shelf);
  shelf.connect(cap);
  cap.connect(limiter);
  limiter.connect(out);
  out.connect(analyser); // passive tap
  out.connect(ctx.destination);

  return {
    input,
    analyser,
    setGain(v: number) {
      const c = Math.min(1, Math.max(0, v));
      out.gain.setTargetAtTime(c, ctx.currentTime, 0.05);
    },
    disconnect() {
      try {
        out.disconnect();
        input.disconnect();
      } catch {
        /* ctx closing */
      }
    },
  };
}
