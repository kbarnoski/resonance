// ─────────────────────────────────────────────────────────────────────────────
// 1752-dissolve — the ego-dissolution engine (audio ONLY).
//
//   "What if Resonance could dissolve your sense of self with sound ALONE —
//    no screen?"
//
// A drug-free dissociative / ego-dissolution descent-and-return rendered
// entirely in spatialized audio. The scene begins as a SINGLE coherent,
// clearly-localized point of tone directly in front of the head, then over the
// arc progressively DE-LOCALIZES — decorrelates between the ears, smears via
// short randomized granular delays, splits into orbiting HRTF copies, and lets
// the direct-to-reverb ratio collapse toward a pure diffuse field — until
// "front / back / self / not-self" is no longer distinguishable (the k-hole
// peak). Then it slowly RE-COHERES back to the single front point (the return).
//
//   INVERTS the usual spatial-audio goal: instead of PLACING sounds precisely
//   in space, it UN-places them until the listener's spatial self dissolves.
//
//   master graph:
//     [pad + orbiting voices(localized) + decorrelated stereo smear]
//        → ConvolverNode diffuse-field reverb (createVoidReverb)
//        → master gain (≤0.18) → DynamicsCompressor → destination
//
//   Every dissolution mechanism is driven from a single normalized `depth`
//   0→1→0 envelope owned by page.tsx:
//     depth → orbit spread · interaural decorrelation · granular smear time ·
//             wet/dry (diffuse-field) ratio · inharmonic detune-beating.
//
// Determinism: a fixed-seed mulberry32 PRNG supplies all smear jitter, so the
// dissolution is identical every run (no Math.random in any decision path).
// ctx.currentTime is used only for Web-Audio scheduling/ramps, which is allowed.
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

function makeMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = 6.28318530718;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Inharmonic, slightly-stretched pad partials — deliberately NOT a clean
// just-intonation chord (the consonant-JI-drone reflex is banned). These beat
// against each other, and the beating WIDENS with depth.
const PAD_BASE = 98.0; // ~G2
const PAD_PARTIALS = [1.0, 2.02, 3.05, 4.17, 5.43];

// The "point of tone": four near-unison voices that fuse into ONE localized
// source when clustered + correlated (early), and beat into an inharmonic smear
// when spread + decorrelated (peak). Rest detune is tiny; peak detune is wide.
const VOICE_BASE = 196.0; // ~G3
const VOICE_REST_CENTS = [-2.5, 2.5, -1.5, 1.5];
const VOICE_PEAK_CENTS = [-44, 57, -71, 83];

// Per-voice Lissajous orbit parameters (radius, angular speeds, phases). Each
// voice rides a different radius/speed so at peak they envelop the listener.
interface Orbit {
  radius: number;
  wx: number; // horizontal (azimuth) rate, rad/s
  wy: number; // vertical (elevation) rate, rad/s
  wz: number;
  px: number;
  py: number;
  pz: number;
}
const ORBITS: Orbit[] = [
  { radius: 1.35, wx: 0.061, wy: 0.037, wz: 0.061, px: 0.0, py: 1.1, pz: 0.4 },
  { radius: 1.75, wx: -0.043, wy: 0.052, wz: -0.043, px: 2.3, py: 0.2, pz: 1.9 },
  { radius: 1.1, wx: 0.078, wy: -0.029, wz: 0.078, px: 4.1, py: 2.7, pz: 3.3 },
  { radius: 2.0, wx: -0.034, wy: 0.045, wz: -0.034, px: 5.6, py: 4.0, pz: 0.9 },
];

const NV = ORBITS.length;

interface Voice {
  osc: OscillatorNode;
  locGain: GainNode; // localized (HRTF) crossfade path
  decorrGain: GainNode; // decorrelated stereo-smear crossfade path
  panner: PannerNode;
  delayL: DelayNode;
  delayR: DelayNode;
  merger: ChannelMergerNode;
}

/** Set a PannerNode position robustly across the AudioParam / legacy APIs. */
function applyPannerPos(p: PannerNode, x: number, y: number, z: number, now: number) {
  if (p.positionX) {
    p.positionX.setTargetAtTime(x, now, 0.08);
    p.positionY.setTargetAtTime(y, now, 0.08);
    p.positionZ.setTargetAtTime(z, now, 0.08);
  } else {
    p.setPosition(x, y, z);
  }
}

/** Set the AudioListener yaw (head-turn) robustly. yaw in radians, 0 = front. */
function applyListenerYaw(l: AudioListener, yaw: number, now: number) {
  const fx = Math.sin(yaw);
  const fz = -Math.cos(yaw);
  if (l.forwardX) {
    l.forwardX.setTargetAtTime(fx, now, 0.1);
    l.forwardY.setTargetAtTime(0, now, 0.1);
    l.forwardZ.setTargetAtTime(fz, now, 0.1);
    l.upX.setTargetAtTime(0, now, 0.1);
    l.upY.setTargetAtTime(1, now, 0.1);
    l.upZ.setTargetAtTime(0, now, 0.1);
  } else {
    l.setOrientation(fx, 0, fz, 0, 1, 0);
  }
}

export class DissolveAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private verb: VoidReverb;
  private spatialBus: GainNode; // localized voices sum here
  private decorrBus: GainNode; // decorrelated smear sum here
  private padBus: GainNode;
  private padFilter: BiquadFilterNode;

  private padOscs: OscillatorNode[] = [];
  private padDetuneLfos: OscillatorNode[] = [];
  private voices: Voice[] = [];

  private prng = makeMulberry32(0x1752d155);
  private started = false;
  private muted = false;
  private yaw = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // ── master out ────────────────────────────────────────────────────────────
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.03;
    this.comp.release.value = 0.35;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    // ── ConvolverNode diffuse-field reverb (dry at rest, diffuse at peak) ──────
    this.verb = createVoidReverb(ctx, { seconds: 4.5, decay: 2.4, wet: 0.12 });
    this.verb.output.connect(this.master);

    // Everything routes THROUGH the reverb so the wet/dry knob is the literal
    // direct-to-reverb ratio that collapses toward a pure diffuse field.
    this.spatialBus = ctx.createGain();
    this.spatialBus.gain.value = 1.0;
    this.spatialBus.connect(this.verb.input);

    this.decorrBus = ctx.createGain();
    this.decorrBus.gain.value = 1.0;
    this.decorrBus.connect(this.verb.input);

    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0.0;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 620;
    this.padFilter.Q.value = 0.4;
    this.padFilter.connect(this.padBus);
    this.padBus.connect(this.verb.input);

    // ── AudioListener at origin, facing front (0,0,-1) ────────────────────────
    applyListenerYaw(ctx.listener, 0, ctx.currentTime);
    if (ctx.listener.positionX) {
      ctx.listener.positionX.value = 0;
      ctx.listener.positionY.value = 0;
      ctx.listener.positionZ.value = 0;
    }

    // ── inharmonic pad bed ────────────────────────────────────────────────────
    for (let i = 0; i < PAD_PARTIALS.length; i++) {
      const freq = PAD_BASE * PAD_PARTIALS[i];
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = freq;
      osc.detune.value = i % 2 === 0 ? -3 : 3; // slow beating at rest
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.021 + i * 0.013;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 2 + i; // detune depth (widened later with depth)
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      const pg = ctx.createGain();
      pg.gain.value = 0.5 / (i + 1.2);
      osc.connect(pg);
      pg.connect(this.padFilter);
      this.padOscs.push(osc);
      this.padDetuneLfos.push(lfo);
    }

    // ── the point of tone: NV orbiting HRTF voices ────────────────────────────
    for (let i = 0; i < NV; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = VOICE_BASE;
      osc.detune.value = VOICE_REST_CENTS[i];

      // localized path → HRTF panner → spatial bus
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.rolloffFactor = 0.35;
      panner.coneInnerAngle = 360;
      const locGain = ctx.createGain();
      locGain.gain.value = 0.22; // per-voice base level (localized, strong early)
      osc.connect(locGain);
      locGain.connect(panner);
      panner.connect(this.spatialBus);

      // decorrelated path → two independent short delays → L/R merger → bus.
      // Independent per-ear delays destroy interaural correlation → the source
      // stops having a place and becomes an "everywhere" diffuse voice.
      const delayL = ctx.createDelay(0.05);
      const delayR = ctx.createDelay(0.05);
      delayL.delayTime.value = 0.006 + i * 0.001;
      delayR.delayTime.value = 0.009 + i * 0.001;
      const merger = ctx.createChannelMerger(2);
      osc.connect(delayL);
      osc.connect(delayR);
      delayL.connect(merger, 0, 0);
      delayR.connect(merger, 0, 1);
      const decorrGain = ctx.createGain();
      decorrGain.gain.value = 0.0001; // silent early (crossed in with depth)
      merger.connect(decorrGain);
      decorrGain.connect(this.decorrBus);

      // start clustered at the front point (0,0,-1)
      applyPannerPos(panner, 0, 0, -1, ctx.currentTime);

      this.voices.push({ osc, locGain, decorrGain, panner, delayL, delayR, merger });
    }
  }

  /** Start the bed and fade the master in. Call ONLY from the Begin gesture. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;

    for (const osc of this.padOscs) osc.start();
    for (const lfo of this.padDetuneLfos) lfo.start();
    for (const v of this.voices) v.osc.start();

    this.padBus.gain.setValueAtTime(0.0001, now);
    this.padBus.gain.linearRampToValueAtTime(0.42, now + 4.0);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(this.muted ? 0.0001 : 0.18, now + 3.5);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (!this.started) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(m ? 0.0001 : 0.18, now, 0.25);
  }

  /** Head-turn steer (radians). Silently ignored if no sensor drives it. */
  setYaw(yawRad: number): void {
    this.yaw = yawRad;
    if (!this.started) return;
    applyListenerYaw(this.ctx.listener, yawRad, this.ctx.currentTime);
  }

  /**
   * Per-frame update. `t` is elapsed seconds (for orbit phase); `depth` 0..1 is
   * the dissolution envelope. depth maps to spread, decorrelation, smear time,
   * wet/dry ratio and inharmonic beating — the whole descent-and-return.
   */
  step(t: number, depth: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const d = clamp01(depth);

    // spread eases in a touch faster than linear so the point holds, then blooms
    const spread = d * d * (3 - 2 * d); // smoothstep

    // ── orbits: lerp each voice from the front point onto its wide orbit ──────
    for (let i = 0; i < NV; i++) {
      const o = ORBITS[i];
      const ox = o.radius * Math.sin(o.wx * TAU * t + o.px);
      const oy = 0.6 * o.radius * Math.sin(o.wy * TAU * t + o.py);
      const oz = o.radius * Math.cos(o.wz * TAU * t + o.pz);
      // front point is (0,0,-1); blend toward the orbit as spread rises
      const x = spread * ox;
      const y = spread * oy;
      const z = (1 - spread) * -1 + spread * oz;
      applyPannerPos(this.voices[i].panner, x, y, z, now);

      // crossfade localized → decorrelated. Keep a little localized residue so
      // the return can re-cohere; decorrelation dominates at peak.
      const loc = 0.22 * (1 - 0.82 * d);
      const dec = 0.19 * d;
      this.voices[i].locGain.gain.setTargetAtTime(loc, now, 0.2);
      this.voices[i].decorrGain.gain.setTargetAtTime(Math.max(0.0001, dec), now, 0.2);

      // granular smear: randomized per-ear delay 5–25 ms, re-jittered each frame
      const base = 0.005 + 0.02 * d;
      const jL = base + (this.prng() - 0.5) * 0.02 * d;
      const jR = base + (this.prng() - 0.5) * 0.02 * d;
      this.voices[i].delayL.delayTime.setTargetAtTime(Math.max(0.001, jL), now, 0.06);
      this.voices[i].delayR.delayTime.setTargetAtTime(Math.max(0.001, jR), now, 0.06);

      // inharmonic beating: voices fan out in detune at peak (NOT clean unison)
      const cents = VOICE_REST_CENTS[i] + (VOICE_PEAK_CENTS[i] - VOICE_REST_CENTS[i]) * d;
      this.voices[i].osc.detune.setTargetAtTime(cents, now, 0.3);
    }

    // ── pad: darker + beating harder as depth rises ──────────────────────────
    const padCut = 620 - d * 250;
    this.padFilter.frequency.setTargetAtTime(padCut, now, 0.5);
    for (let i = 0; i < this.padOscs.length; i++) {
      // fan the pad partials' detune wide at peak → stronger inharmonic beating
      // (the connected detune LFO keeps summing on top of this intrinsic value)
      const beat = (i % 2 === 0 ? -3 : 3) + (i % 2 === 0 ? -1 : 1) * 16 * d;
      this.padOscs[i].detune.setTargetAtTime(beat, now, 0.5);
    }

    // ── direct-to-reverb ratio collapses toward a pure diffuse field ─────────
    this.verb.setWet(0.12 + 0.82 * d);
  }

  stop(): void {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.15);
    } catch {
      /* ctx may be closing */
    }
    const stopAt = now + 0.4;
    const kill = (o: OscillatorNode) => {
      try {
        o.stop(stopAt);
      } catch {
        /* already stopped */
      }
    };
    for (const o of this.padOscs) kill(o);
    for (const l of this.padDetuneLfos) kill(l);
    for (const v of this.voices) kill(v.osc);
  }
}
