// ─────────────────────────────────────────────────────────────────────────────
// 23440-fluxmesh — the Fluxion-style DSP graph (CPU / Web-Audio side).
//
// Fluxion (Spanio & Rodà, arXiv:2610.24622) frames a real-time DSP runtime as a
// single graph algebra: cascaded second-order sections (a biquad SOS cascade)
// plus delay-line effects. Here that graph processes ONE real Karel take, and
// every coefficient is driven, in real time, by scalars reduced from the GPU
// mass-spring field:
//
//   source → [ 4× lowpass SOS | 2× peaking SOS ] → dry ┐
//                                              └→ delay → feedback ┐  → pan → master
//                                                          ↘ wet ──┘
//
//   mesh energy    → cascade cutoff      (the field opening the piano up)
//   mean stretch   → section resonance Q
//   vertical tilt  → delay feedback depth
//   L/R balance    → stereo pan
//
// Every param is smoothed with setTargetAtTime(~0.12) so a ~1-frame-latency
// readback never zippers. Nothing synthesises audio — the only source is the
// decoded take.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

const SMOOTH = 0.12;

export interface FluxGraph {
  /** Start playback (looped) of the decoded take. */
  start(buffer: AudioBuffer): void;
  /** Push the latest GPU-reduced scalars onto the DSP params. */
  update(energy01: number, stretch01: number, tilt: number, balance: number): void;
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

  cascadeOut.connect(dry);
  dry.connect(panner);
  cascadeOut.connect(delay);
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

  const update = (
    energy01: number,
    stretch01: number,
    tilt: number,
    balance: number,
  ) => {
    const t = ctx.currentTime;
    // energy → cutoff (log-ish sweep between a muffled and an open piano)
    const cutoff = 280 + energy01 * energy01 * 6200;
    for (const f of lp) f.frequency.setTargetAtTime(cutoff, t, SMOOTH);
    // stretch → resonance Q (both the final LP and the peaking sections ring)
    const q = 0.7 + stretch01 * 7.0;
    lp[3].Q.setTargetAtTime(0.7 + stretch01 * 4.0, t, SMOOTH);
    for (const f of pk) {
      f.Q.setTargetAtTime(q, t, SMOOTH);
      f.gain.setTargetAtTime(stretch01 * 9.0, t, SMOOTH);
    }
    // vertical tilt → delay feedback depth and wet amount
    const fb = 0.12 + tilt * 0.5;
    feedback.gain.setTargetAtTime(Math.min(0.62, fb), t, SMOOTH);
    wet.gain.setTargetAtTime(0.22 + tilt * 0.3, t, SMOOTH);
    // L/R energy balance → stereo pan
    panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, balance)), t, SMOOTH);
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
      panner.disconnect();
      master.disconnect();
    } catch {
      /* ctx closing */
    }
    if (ctx.state !== "closed") ctx.close().catch(() => {});
  };

  return { start, update, analyser: master.analyser, ctx, dispose };
}
