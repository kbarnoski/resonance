// ─────────────────────────────────────────────────────────────────────────────
// 23440-fluxmesh — the Fluxion-style DSP graph (CPU / Web-Audio side).
//
// Fluxion (Spanio & Rodà, arXiv:2610.24622) frames a real-time DSP runtime as a
// single graph algebra: cascaded second-order sections (a biquad SOS cascade)
// plus delay-line effects. Here that graph processes ONE real Karel take, and
// every coefficient is driven, in real time, by scalars reduced from the GPU
// mass-spring field:
//
//   source → [ 4× lowpass SOS | 2× peaking SOS ] → [ FIR feedforward comb ] → dry ┐
//              (LEFT region)                         (RIGHT region)               │→ pan → master
//                                                        └→ delay → feedback ┐    │
//                                                                    ↘ wet ──┴────┘
//
// Cycle 2 — the membrane is split into two independently-conducted regions, and
// each shapes a DIFFERENT part of the Fluxion graph (Fluxion's algebra is
// cascaded SOS + FIR + delay-line effects — all three are now present):
//
//   LEFT  region energy   → cascade cutoff   (your left hand opens the piano up)
//   LEFT  region stretch  → cascade resonance Q + peaking gain
//   RIGHT region energy   → FIR comb DEPTH   (your right hand carves the comb)
//   RIGHT region centroid → FIR comb DELAY   (where the right energy sits → notch spacing)
//   global vertical tilt  → delay feedback depth + wet amount
//   global L/R balance    → stereo pan
//
// The FIR stage is a two-tap FEEDFORWARD comb (H(z) = 1 + g₁z^-D + g₂z^-2D, no
// feedback → a genuine finite impulse response), distinct from the feedback
// delay line after it. Conceptually this answers MiCLA's mixture→constituent
// idea (arXiv:2610.27491) with the body: two regions = two constituents, each
// reshaped on its own graph branch.
//
// Every param is smoothed with setTargetAtTime(~0.12) so a ~1-frame-latency
// readback never zippers. Nothing synthesises audio — the only source is the
// decoded take.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

const SMOOTH = 0.12;

/** The two-region scalars (already normalised by the page) that steer the graph. */
export interface FluxParams {
  /** LEFT region energy 0…1 → cascade cutoff. */
  leftEnergy01: number;
  /** LEFT region stretch 0…1 → cascade resonance Q + peaking gain. */
  leftStretch01: number;
  /** RIGHT region energy 0…1 → FIR feedforward-comb depth. */
  rightEnergy01: number;
  /** RIGHT region vertical centroid 0…1 → FIR comb delay (notch spacing). */
  rightCentroidY: number;
  /** Global vertical tilt 0…1 → delay feedback depth + wet amount. */
  tilt: number;
  /** Global L/R balance −1…1 → stereo pan. */
  balance: number;
}

export interface FluxGraph {
  /** Start playback (looped) of the decoded take. */
  start(buffer: AudioBuffer): void;
  /** Push the latest normalised two-region scalars onto the DSP params. */
  update(p: FluxParams): void;
  /** Passive analyser tap (for any extra visuals). */
  readonly analyser: AnalyserNode;
  readonly ctx: AudioContext;
  dispose(): void;
}

export async function createFluxGraph(): Promise<FluxGraph> {
  const ctx = new AudioContext();
  const master: SafeMaster = createSafeMaster(ctx);

  // ── biquad SOS cascade ───────────────────────────────────────────────────────
  // Four lowpass sections (a steep, musical 24 dB/oct roll-off whose corner the
  // field sweeps) then two peaking sections that add the field's resonance.
  const lp: BiquadFilterNode[] = [];
  for (let i = 0; i < 4; i++) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    f.Q.value = i === 3 ? 1.0 : 0.6;
    lp.push(f);
  }
  const pk: BiquadFilterNode[] = [];
  for (let i = 0; i < 2; i++) {
    const f = ctx.createBiquadFilter();
    f.type = "peaking";
    f.frequency.value = i === 0 ? 420 : 1200;
    f.Q.value = 1.0;
    f.gain.value = 0;
    pk.push(f);
  }
  const cascade = [...lp, ...pk];
  for (let i = 0; i < cascade.length - 1; i++) cascade[i].connect(cascade[i + 1]);
  const cascadeIn = cascade[0];
  const cascadeOut = cascade[cascade.length - 1];

  // ── FIR feedforward comb (RIGHT region) ─────────────────────────────────────
  // H(z) = 1 + g₁·z^-D + g₂·z^-2D. Two feedforward taps, no feedback → a genuine
  // short FIR whose notch spacing is the comb delay and whose depth is the tap
  // gains. The right region drives both; at rest (gains 0) it is pass-through.
  const firIn = ctx.createGain();
  const firSum = ctx.createGain();
  const firDry = ctx.createGain();
  firDry.gain.value = 1.0;
  const firDelay1 = ctx.createDelay(0.05);
  firDelay1.delayTime.value = 0.006;
  const firTap1 = ctx.createGain();
  firTap1.gain.value = 0;
  const firDelay2 = ctx.createDelay(0.05);
  firDelay2.delayTime.value = 0.012;
  const firTap2 = ctx.createGain();
  firTap2.gain.value = 0;

  cascadeOut.connect(firIn);
  firIn.connect(firDry);
  firDry.connect(firSum);
  firIn.connect(firDelay1);
  firDelay1.connect(firTap1);
  firTap1.connect(firSum);
  firIn.connect(firDelay2);
  firDelay2.connect(firTap2);
  firTap2.connect(firSum);

  // ── stereo pan + dry/wet delay feedback line ────────────────────────────────
  const panner = ctx.createStereoPanner();

  const dry = ctx.createGain();
  dry.gain.value = 0.82;

  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.28;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.3;
  const wet = ctx.createGain();
  wet.gain.value = 0.38;

  firSum.connect(dry);
  dry.connect(panner);
  firSum.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(panner);
  panner.connect(master.input);

  let source: AudioBufferSourceNode | null = null;

  const start = (buffer: AudioBuffer) => {
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(cascadeIn);
    source.start();
  };

  const update = (p: FluxParams) => {
    const t = ctx.currentTime;

    // LEFT region energy → cascade cutoff (muffled → open piano).
    const cutoff = 280 + p.leftEnergy01 * p.leftEnergy01 * 6200;
    for (const f of lp) f.frequency.setTargetAtTime(cutoff, t, SMOOTH);
    // LEFT region stretch → resonance Q (final LP + both peaking sections ring).
    const q = 0.7 + p.leftStretch01 * 7.0;
    lp[3].Q.setTargetAtTime(0.7 + p.leftStretch01 * 4.0, t, SMOOTH);
    for (const f of pk) {
      f.Q.setTargetAtTime(q, t, SMOOTH);
      f.gain.setTargetAtTime(p.leftStretch01 * 9.0, t, SMOOTH);
    }

    // RIGHT region → FIR feedforward comb. Centroid sets the delay (notch
    // spacing), energy sets the tap depth. At rest the taps are 0 → pass-through.
    const d1 = 0.0016 + p.rightCentroidY * 0.0144; // 1.6 … 16 ms
    firDelay1.delayTime.setTargetAtTime(d1, t, SMOOTH);
    firDelay2.delayTime.setTargetAtTime(d1 * 2, t, SMOOTH);
    firTap1.gain.setTargetAtTime(p.rightEnergy01 * 0.7, t, SMOOTH);
    firTap2.gain.setTargetAtTime(p.rightEnergy01 * 0.35, t, SMOOTH);

    // Global vertical tilt → delay feedback depth and wet amount.
    const fb = 0.12 + p.tilt * 0.5;
    feedback.gain.setTargetAtTime(Math.min(0.62, fb), t, SMOOTH);
    wet.gain.setTargetAtTime(0.22 + p.tilt * 0.3, t, SMOOTH);
    // Global L/R energy balance → stereo pan.
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
      cascadeOut.disconnect();
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
