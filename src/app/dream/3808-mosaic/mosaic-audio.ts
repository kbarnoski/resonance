// ════════════════════════════════════════════════════════════════════════════
// MOSAIC (3808) — the audio-guided concatenative MUSAICING engine.
//
// This is the load-bearing new subsystem over 3608-atlas. Instead of a cursor
// choosing grains by timbre alone (texture), a TARGET signal drives the choice,
// and a tunable TRANSITION PRIOR biases each pick toward the grain that
// sequentially follows the last one played — so the corpus rebuilds the target's
// *phrase*, not just a nearest-timbre dust cloud.
//
// For each grain step the matcher scores every corpus grain s:
//     score(s) = timbreDist(targetFeat, feats[s])
//              + coherence · WEIGHT · transitionCost(s , lastIndex + 1)
// and plays argmin. With coherence = 0 it is pure nearest-timbre (Atlas-style
// texture); as coherence → 1 the transition term dominates and playback marches
// sequentially through the corpus, reconstructing the phrase. Corpus indices are
// the hidden states, the target frame is the observation, the prior is the
// transition model — a greedy reduction of:
//   • Tralie, Kitchen, Tralie — "The Concatenator: A Bayesian Approach to Real
//     Time Concatenative Musaicing" (arXiv:2411.04366, 2024).
//   • Zils & Pachet — "Musical Mosaicing" (DAFx 2001), origin of audio mosaicing.
//
// The MATCHER is wall-clock driven so the reconstruction path animates even with
// NO audio unlocked (headless). Audio nodes attach lazily on a user gesture;
// when running, the same grain picks are scheduled through overlapping Hann
// windows so you HEAR the corpus singing the target.
// ════════════════════════════════════════════════════════════════════════════

import { type Corpus, FDIM, FEATURE_WEIGHTS } from "./mosaic-corpus";
import { type TargetFrame } from "./mosaic-target";

const WINDOW_LEN = 512; // samples in the pre-baked Hann envelope curve
const TRANSITION_WEIGHT = 3.2; // how hard full coherence pushes toward sequence
const JUMP_SCALE = 6; // grains: how far a jump can be before it costs "1"
const ENERGY_GATE = 0.06; // target below this = silence, don't trigger

function hannCurve(): Float32Array {
  const w = new Float32Array(WINDOW_LEN);
  for (let i = 0; i < WINDOW_LEN; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (WINDOW_LEN - 1)));
  }
  return w;
}

export interface MosaicHud {
  chosenIndex: number;
  targetPos: [number, number];
  active: number; // 0..1 output level
  centroidHz: number;
  pitchHz: number;
  jump: number; // |chosen − expected| for the last pick (0 = perfectly sequential)
}

export class MosaicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private shaper: WaveShaperNode | null = null;
  private corpus: Corpus | null = null;
  private window = hannCurve();

  private coherence = 0.6;
  private target: TargetFrame | null = null;
  private lastIndex = -1;
  private chosenIndex = -1;
  private lastJump = 0;
  private active = 0;

  private lastStepMs = 0;
  private nextAudioTime = 0;
  private pending: number[] = []; // chosen indices awaiting a trail push

  setCorpus(corpus: Corpus): void {
    this.corpus = corpus;
    this.lastIndex = -1;
    this.chosenIndex = -1;
    this.nextAudioTime = 0;
    this.pending.length = 0;
  }

  /** Attach live audio output — call once inside a user gesture. */
  attachAudio(ctx: AudioContext): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(2.5 * x) / Math.tanh(2.5);
    }
    this.shaper.curve = curve;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.shaper.connect(this.master);
    this.master.connect(ctx.destination);
  }

  setCoherence(v: number): void {
    this.coherence = Math.max(0, Math.min(1, v));
  }

  getCoherence(): number {
    return this.coherence;
  }

  setTarget(frame: TargetFrame | null): void {
    this.target = frame;
  }

  /**
   * The matcher — argmin over all corpus grains of weighted timbre distance plus
   * the coherence-scaled transition cost. Returns the chosen grain index.
   */
  private matchGrain(feat: Float32Array): number {
    const c = this.corpus!;
    const feats = c.feats;
    const n = c.n;
    const expected = this.lastIndex + 1; // the sequential continuation
    const coh = this.coherence;
    let best = -1;
    let bestScore = Infinity;

    for (let s = 0; s < n; s++) {
      let d = 0;
      const base = s * FDIM;
      for (let k = 0; k < FDIM; k++) {
        const diff = feat[k] - feats[base + k];
        d += FEATURE_WEIGHTS[k] * diff * diff;
      }
      let score = Math.sqrt(d);
      if (coh > 0 && this.lastIndex >= 0) {
        const jump = Math.abs(s - expected);
        const transitionCost = Math.min(1, jump / JUMP_SCALE);
        score += coh * TRANSITION_WEIGHT * transitionCost;
      }
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (best < 0) best = 0;
    this.lastJump = this.lastIndex >= 0 ? Math.abs(best - expected) : 0;
    return best;
  }

  /**
   * Advance the wall-clock matcher. `nowMs` is performance.now(). Runs one match
   * per corpus-hop of real time so the path traces at ~1× the source tempo; when
   * audio is attached + running, schedules the chosen grains for playback.
   */
  tick(nowMs: number): void {
    const c = this.corpus;
    if (!c) return;
    if (this.lastStepMs === 0) this.lastStepMs = nowMs;

    const frame = this.target;
    const energy = frame ? frame.energy : 0;
    const targetActive = frame && energy > ENERGY_GATE ? Math.min(1, energy * 1.3) : 0;
    this.active += (targetActive - this.active) * 0.2;

    const stepMs = c.hopSec * 1000;
    let steps = 0;
    while (nowMs - this.lastStepMs >= stepMs && steps < 4) {
      this.lastStepMs += stepMs;
      steps++;
      if (frame && energy > ENERGY_GATE) {
        const gi = this.matchGrain(frame.feat);
        this.chosenIndex = gi;
        this.lastIndex = gi;
        this.pending.push(gi);
        this.scheduleGrain(gi, energy);
      }
    }
  }

  private scheduleGrain(gi: number, energy: number): void {
    const ctx = this.ctx;
    const c = this.corpus;
    if (!ctx || !this.shaper || !c || ctx.state !== "running") return;
    const now = ctx.currentTime;
    if (this.nextAudioTime < now + 0.02) this.nextAudioTime = now + 0.02;
    const when = this.nextAudioTime;
    this.nextAudioTime += c.hopSec;

    const offset = c.startSec[gi];
    const dur = c.durSec;
    const src = ctx.createBufferSource();
    src.buffer = c.buffer;

    const g = ctx.createGain();
    const scale = 0.62 * Math.min(1, energy * 1.2) * (0.45 + 0.55 * c.loud[gi]);
    const curve = new Float32Array(WINDOW_LEN);
    for (let i = 0; i < WINDOW_LEN; i++) curve[i] = this.window[i] * scale;
    g.gain.setValueCurveAtTime(curve, when, dur);

    src.connect(g);
    g.connect(this.shaper);
    src.start(when, offset, dur);
    src.stop(when + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }

  /** Chosen-grain indices since the last call (for the visual trail). */
  drainPending(): number[] {
    if (this.pending.length === 0) return this.pending;
    const out = this.pending.slice();
    this.pending.length = 0;
    return out;
  }

  hud(): MosaicHud {
    const c = this.corpus;
    const i = this.chosenIndex;
    return {
      chosenIndex: i,
      targetPos: this.target ? this.target.pos : [0, 0],
      active: this.active,
      centroidHz: c && i >= 0 ? c.grains[i].centroidHz : 0,
      pitchHz: c && i >= 0 ? c.grains[i].pitchHz : 0,
      jump: this.lastJump,
    };
  }

  /** Atlas position of the currently-chosen grain (the playhead). */
  chosenPos(): [number, number] {
    const c = this.corpus;
    const i = this.chosenIndex;
    if (!c || i < 0) return [0, 0];
    return [c.positions[i * 2], c.positions[i * 2 + 1]];
  }

  dispose(): void {
    try {
      this.master?.disconnect();
      this.shaper?.disconnect();
    } catch {
      /* already gone */
    }
  }
}
