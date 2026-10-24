// ─────────────────────────────────────────────────────────────────────────────
// 24680-chromafield — the Web-Audio DSP graph the chemical membrane conducts.
//
// ONE real Karel take is the only sound source (an AudioBufferSourceNode, looped).
// Nothing is synthesised. Four scalars reduced from the Gray-Scott field on the
// GPU (or the CPU fallback) steer the graph in real time:
//
//   coverage  (fraction in the B-state) → lowpass CUTOFF
//        a mature, filled-in membrane opens the piano up; an empty field muffles it.
//   edge      (boundary turbulence)     → resonance Q  +  feedforward-comb DEPTH
//        an ordered pattern plays clear; a churning, chaotic one smears & resonates.
//   balance   (left/right B)            → stereo PAN
//        where the chemistry pools decides which ear the take leans into.
//   centroidY (B-weighted height)       → gentle spectral TILT (high-shelf)
//        a pattern sitting high brightens the take; one pooling low warms it.
//
// Signal path:
//   source → lowpass → high-shelf tilt → [FIR feedforward comb] → panner → master
//                                           dry + g₁·z^-D + g₂·z^-2D (no feedback)
//
// Every parameter moves via setTargetAtTime(~0.12 s): immediate to the touch,
// never zippering on the ~1-frame-latency readback. The graph terminates at
// createSafeMaster().input — never ctx.destination.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

const SMOOTH = 0.12;

/** Normalised field scalars (already derived by the page) that steer the graph. */
export interface ChromaParams {
  /** B-state coverage 0…1 → lowpass cutoff. */
  coverage: number;
  /** Edge/turbulence 0…1 → resonance Q + FIR comb depth. */
  edge: number;
  /** L/R balance −1…1 → stereo pan. */
  balance: number;
  /** B-weighted vertical centroid 0…1 → high-shelf spectral tilt. */
  centroidY: number;
}

export interface ChromaGraph {
  /** Start playback (looped) of the decoded take. */
  start(buffer: AudioBuffer): void;
  /** Push the latest normalised field scalars onto the DSP params. */
  update(p: ChromaParams): void;
  /** Passive analyser tap on the tamed master (for visuals). */
  readonly analyser: AnalyserNode;
  readonly ctx: AudioContext;
  dispose(): void;
}

export async function createChromaGraph(): Promise<ChromaGraph> {
  const ctx = new AudioContext();
  const master: SafeMaster = createSafeMaster(ctx);

  // ── lowpass (coverage → cutoff, edge → resonance Q) ─────────────────────────
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 600;
  lp.Q.value = 0.7;

  // ── high-shelf spectral tilt (centroid) ─────────────────────────────────────
  const tilt = ctx.createBiquadFilter();
  tilt.type = "highshelf";
  tilt.frequency.value = 1800;
  tilt.gain.value = 0;

  // ── FIR feedforward comb (edge → depth) ─────────────────────────────────────
  // H(z) = 1 + g₁·z^-D + g₂·z^-2D. Two feedforward taps, no feedback → a genuine
  // finite impulse response. At rest (tap gains 0) it is pass-through.
  const firIn = ctx.createGain();
  const firSum = ctx.createGain();
  const firDry = ctx.createGain();
  firDry.gain.value = 1.0;
  const firDelay1 = ctx.createDelay(0.05);
  firDelay1.delayTime.value = 0.007;
  const firTap1 = ctx.createGain();
  firTap1.gain.value = 0;
  const firDelay2 = ctx.createDelay(0.05);
  firDelay2.delayTime.value = 0.014;
  const firTap2 = ctx.createGain();
  firTap2.gain.value = 0;

  const panner = ctx.createStereoPanner();

  // Wiring.
  lp.connect(tilt);
  tilt.connect(firIn);
  firIn.connect(firDry);
  firDry.connect(firSum);
  firIn.connect(firDelay1);
  firDelay1.connect(firTap1);
  firTap1.connect(firSum);
  firIn.connect(firDelay2);
  firDelay2.connect(firTap2);
  firTap2.connect(firSum);
  firSum.connect(panner);
  panner.connect(master.input);

  let source: AudioBufferSourceNode | null = null;

  const start = (buffer: AudioBuffer) => {
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(lp);
    source.start();
  };

  const update = (p: ChromaParams) => {
    const t = ctx.currentTime;

    // coverage → lowpass cutoff (muffled → open). Perceptual curve.
    const cov = Math.max(0, Math.min(1, p.coverage));
    // coverage tends to sit low (sparse B); expand it so the sweep is audible.
    const covShaped = Math.min(1, Math.pow(cov * 2.4, 0.7));
    const cutoff = 320 + covShaped * covShaped * 6400;
    lp.frequency.setTargetAtTime(cutoff, t, SMOOTH);

    // edge → resonance Q (ordered = clear; chaotic = resonant).
    const edge = Math.max(0, Math.min(1, p.edge));
    lp.Q.setTargetAtTime(0.7 + edge * 7.5, t, SMOOTH);

    // edge → FIR feedforward-comb depth (chaos smears the take).
    firTap1.gain.setTargetAtTime(edge * 0.72, t, SMOOTH);
    firTap2.gain.setTargetAtTime(edge * 0.36, t, SMOOTH);

    // centroidY → gentle high-shelf tilt (high pattern brightens, low warms).
    const shelfDb = (0.5 - p.centroidY) * 12; // −6 … +6 dB
    tilt.gain.setTargetAtTime(Math.max(-9, Math.min(9, shelfDb)), t, SMOOTH);

    // balance → stereo pan.
    panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, p.balance)), t, SMOOTH);
  };

  const dispose = () => {
    try {
      source?.stop();
    } catch {
      /* already stopped */
    }
    try {
      source?.disconnect();
      firSum.disconnect();
      panner.disconnect();
      master.disconnect();
    } catch {
      /* ctx closing */
    }
    if (ctx.state !== "closed") ctx.close().catch(() => {});
  };

  return { start, update, analyser: master.analyser, ctx, dispose };
}
