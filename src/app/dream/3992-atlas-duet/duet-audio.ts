// ════════════════════════════════════════════════════════════════════════════
// ATLAS·DUET (3992) — TWO-VOICE k-nearest granular playback engine.
//
// Deepened from 3608-atlas' single GranularEngine into a DUET: two independent
// k-nearest playheads forage the SAME corpus at once — the HUMAN voice (panned
// slightly left) driven by your cursor, and a self-listening AGENT voice (panned
// slightly right) driven by its own path through the cloud. Each voice
// continuously finds the grains nearest its cursor (k-nearest within a radius)
// and triggers them, overlapping short raised-cosine (Hann) windows into smooth
// granular texture. The two voices are mixed under one soft-clip.
//
// Corpus-based concatenative synthesis after Diemo Schwarz's CataRT (IRCAM); the
// self-listening co-creative agent after MACataRT (arXiv 2502.00023, 2025).
// ════════════════════════════════════════════════════════════════════════════

import { mulberry32, type Corpus } from "./duet-corpus";

const K = 8; // neighbours considered
const GRAIN_INTERVAL = 0.023; // s between grain onsets → dense overlap
const LOOKAHEAD = 0.12; // s scheduling horizon
const WINDOW_LEN = 256; // samples in the pre-baked Hann envelope curve
const RADIUS = 0.42; // atlas-space reach; beyond this the voice fades out

function hannCurve(): Float32Array {
  const w = new Float32Array(WINDOW_LEN);
  for (let i = 0; i < WINDOW_LEN; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (WINDOW_LEN - 1)));
  }
  return w;
}

export interface VoiceHud {
  nearestIndex: number;
  active: number; // 0..1 how strongly the voice is sounding (cursor near data)
  centroidHz: number;
  pitchHz: number; // pitch under the cursor (nearest grain)
  /** pitch of the grain THIS voice is currently sounding — what the agent self-listens to. */
  voicedPitchHz: number;
}

// ── One granular playhead: its own k-nearest state, pan, and output level. ────
class GranularVoice {
  private ctx: AudioContext;
  private bus: GainNode; // grains connect here
  private level: GainNode; // per-voice output level (agent presence rides this)
  private panner: StereoPannerNode;
  private window: Float32Array;
  private rng: () => number;

  private corpus: Corpus | null = null;
  private neigh: number[] = [];
  private neighW: number[] = [];
  private active = 0;
  private nearestIndex = -1;
  private voicedIndex = -1;
  private nextTime = 0;
  private levelScale = 1;

  constructor(
    ctx: AudioContext,
    output: AudioNode,
    window: Float32Array,
    pan: number,
    seed: number,
  ) {
    this.ctx = ctx;
    this.window = window;
    this.rng = mulberry32(seed);

    this.panner = ctx.createStereoPanner();
    this.panner.pan.value = pan;
    this.level = ctx.createGain();
    this.level.gain.value = 1;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;

    this.bus.connect(this.panner);
    this.panner.connect(this.level);
    this.level.connect(output);
  }

  setCorpus(corpus: Corpus): void {
    this.corpus = corpus;
    this.nextTime = 0;
    this.neigh = [];
    this.neighW = [];
    this.nearestIndex = -1;
    this.voicedIndex = -1;
  }

  /** Overall output level for this voice (agent presence). */
  setLevel(v: number): void {
    this.levelScale = Math.max(0, v);
    this.level.gain.setTargetAtTime(this.levelScale, this.ctx.currentTime, 0.05);
  }

  /** Cursor in atlas space (components in [-1, 1]). Recomputes k-nearest. */
  setCursor(x: number, y: number): void {
    const c = this.corpus;
    if (!c) return;
    const pos = c.positions;
    const n = c.n;

    const idx: number[] = [];
    const dist: number[] = [];
    for (let i = 0; i < n; i++) {
      const dx = pos[i * 2] - x;
      const dy = pos[i * 2 + 1] - y;
      const d2 = dx * dx + dy * dy;
      if (idx.length < K) {
        idx.push(i);
        dist.push(d2);
        for (let j = idx.length - 1; j > 0 && dist[j] < dist[j - 1]; j--) {
          [dist[j], dist[j - 1]] = [dist[j - 1], dist[j]];
          [idx[j], idx[j - 1]] = [idx[j - 1], idx[j]];
        }
      } else if (d2 < dist[K - 1]) {
        dist[K - 1] = d2;
        idx[K - 1] = i;
        for (let j = K - 1; j > 0 && dist[j] < dist[j - 1]; j--) {
          [dist[j], dist[j - 1]] = [dist[j - 1], dist[j]];
          [idx[j], idx[j - 1]] = [idx[j - 1], idx[j]];
        }
      }
    }

    this.neigh = idx;
    this.neighW = dist.map((d2) => 1 / (Math.sqrt(d2) + 0.03));
    this.nearestIndex = idx.length ? idx[0] : -1;
    const dMin = idx.length ? Math.sqrt(dist[0]) : Infinity;
    this.active = Math.max(0, Math.min(1, 1 - dMin / RADIUS));
  }

  tick(): void {
    const c = this.corpus;
    if (!c || this.neigh.length === 0) return;
    const now = this.ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now + 0.01;
    while (this.nextTime < now + LOOKAHEAD) {
      if (this.active > 0.02) this.scheduleGrain(this.nextTime);
      this.nextTime += GRAIN_INTERVAL;
    }
  }

  private pickNeighbour(): number {
    let total = 0;
    for (const w of this.neighW) total += w;
    let r = this.rng() * total;
    for (let i = 0; i < this.neigh.length; i++) {
      r -= this.neighW[i];
      if (r <= 0) return this.neigh[i];
    }
    return this.neigh[0];
  }

  private scheduleGrain(when: number): void {
    const c = this.corpus;
    if (!c) return;
    const gi = this.pickNeighbour();
    this.voicedIndex = gi;
    const offset = c.startSec[gi];
    const dur = c.durSec;

    const src = this.ctx.createBufferSource();
    src.buffer = c.buffer;

    const g = this.ctx.createGain();
    const scale = 0.5 * this.active * (0.35 + 0.65 * c.loud[gi]);
    const curve = new Float32Array(WINDOW_LEN);
    for (let i = 0; i < WINDOW_LEN; i++) curve[i] = this.window[i] * scale;
    g.gain.setValueCurveAtTime(curve, when, dur);

    src.connect(g);
    g.connect(this.bus);
    src.start(when, offset, dur);
    src.stop(when + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }

  hud(): VoiceHud {
    const c = this.corpus;
    const i = this.nearestIndex;
    const v = this.voicedIndex;
    return {
      nearestIndex: i,
      active: this.active,
      centroidHz: c && i >= 0 ? c.grains[i].centroidHz : 0,
      pitchHz: c && i >= 0 ? c.grains[i].pitchHz : 0,
      voicedPitchHz: c && v >= 0 ? c.grains[v].pitchHz : 0,
    };
  }

  dispose(): void {
    try {
      this.bus.disconnect();
      this.panner.disconnect();
      this.level.disconnect();
    } catch {
      /* already gone */
    }
  }
}

// ── The duet: two voices mixed under one soft-clip + master. ──────────────────
export class DuetEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private shaper: WaveShaperNode;
  private window = hannCurve();
  private human: GranularVoice;
  private agent: GranularVoice;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // Soft tanh clip → conservative output. The two overlapping voices stay bounded.
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(2.5 * x) / Math.tanh(2.5);
    }
    this.shaper.curve = curve;

    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.shaper.connect(this.master);
    this.master.connect(ctx.destination);

    // Human panned slightly left, agent slightly right — legibility of the duet.
    this.human = new GranularVoice(ctx, this.shaper, this.window, -0.35, 0x3992 ^ 0x1111);
    this.agent = new GranularVoice(ctx, this.shaper, this.window, 0.35, 0x3992 ^ 0x7777);
  }

  setCorpus(corpus: Corpus): void {
    this.human.setCorpus(corpus);
    this.agent.setCorpus(corpus);
  }

  setHumanCursor(x: number, y: number): void {
    this.human.setCursor(x, y);
  }

  setAgentCursor(x: number, y: number): void {
    this.agent.setCursor(x, y);
  }

  /** How present the agent is (its overall output level). */
  setAgentPresence(v: number): void {
    this.agent.setLevel(v);
  }

  tick(): void {
    this.human.tick();
    this.agent.tick();
  }

  humanHud(): VoiceHud {
    return this.human.hud();
  }

  agentHud(): VoiceHud {
    return this.agent.hud();
  }

  dispose(): void {
    this.human.dispose();
    this.agent.dispose();
    try {
      this.master.disconnect();
      this.shaper.disconnect();
    } catch {
      /* already gone */
    }
  }
}
