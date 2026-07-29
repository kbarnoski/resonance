// ════════════════════════════════════════════════════════════════════════════
// SONGLINES (3648) — k-nearest granular playback engine, copied from 3608-atlas.
//
// You PLAY the recording by MOVING through its timbre-space. As the cursor moves
// the engine continuously finds the grains NEAREST the cursor (k-nearest within
// a radius) and triggers them, overlapping short raised-cosine (Hann) windows
// for smooth granular texture. Slow over a bright region → shimmer; dive into
// the low dense region → a warm drone. Corpus-based concatenative synthesis
// after Diemo Schwarz's CataRT (IRCAM).
//
// Songlines drives the cursor with discrete keyboard/MIDI "notes" instead of a
// pointer, so this copy adds one thing: a `noteGain` stage + `setVelocity()`,
// letting a MIDI note's velocity (or a keyboard press) shape loudness on top of
// the engine's existing distance-based `active` envelope.
// ════════════════════════════════════════════════════════════════════════════

import { mulberry32, type Corpus } from "./atlas-corpus";

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

export interface AtlasHud {
  nearestIndex: number;
  active: number; // 0..1 how strongly the voice is sounding (cursor near data)
  centroidHz: number;
  pitchHz: number;
}

export class GranularEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private noteGain: GainNode;
  private shaper: WaveShaperNode;
  private corpus: Corpus | null = null;
  private window = hannCurve();
  private rng = mulberry32(0x3608 ^ 0x9e37);

  private cursorX = 0;
  private cursorY = 0;
  private neigh: number[] = [];
  private neighW: number[] = [];
  private active = 0;
  private nearestIndex = -1;
  private nextTime = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // Soft tanh clip → conservative output. Overlapping grains stay bounded.
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(2.5 * x) / Math.tanh(2.5);
    }
    this.shaper.curve = curve;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.noteGain = ctx.createGain();
    this.noteGain.gain.value = 1;
    this.shaper.connect(this.master);
    this.master.connect(this.noteGain);
    this.noteGain.connect(ctx.destination);
  }

  /** Shape overall loudness by the current note's velocity (0..1), smoothed so
   *  it reads as a note dynamic rather than a click. */
  setVelocity(v: number): void {
    const now = this.ctx.currentTime;
    const target = Math.max(0.15, Math.min(1, v));
    this.noteGain.gain.setTargetAtTime(target, now, 0.02);
  }

  setCorpus(corpus: Corpus): void {
    this.corpus = corpus;
    this.nextTime = 0;
    this.neigh = [];
    this.neighW = [];
    this.nearestIndex = -1;
  }

  /** Cursor in atlas space (components in [-1, 1]). Recomputes k-nearest. */
  setCursor(x: number, y: number): void {
    this.cursorX = x;
    this.cursorY = y;
    const c = this.corpus;
    if (!c) return;
    const pos = c.positions;
    const n = c.n;

    // Brute-force k-nearest (n up to a few thousand; called once per frame).
    const idx: number[] = [];
    const dist: number[] = [];
    for (let i = 0; i < n; i++) {
      const dx = pos[i * 2] - x;
      const dy = pos[i * 2 + 1] - y;
      const d2 = dx * dx + dy * dy;
      // Insertion into a small top-K sorted list.
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
    this.neighW = dist.map((d2) => {
      const d = Math.sqrt(d2);
      return 1 / (d + 0.03);
    });
    this.nearestIndex = idx.length ? idx[0] : -1;

    // The voice fades out when the cursor drifts off the data.
    const dMin = idx.length ? Math.sqrt(dist[0]) : Infinity;
    this.active = Math.max(0, Math.min(1, 1 - dMin / RADIUS));
  }

  /** Advance the look-ahead scheduler. Call every animation frame. */
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
    // Distance-weighted random choice among the k-nearest.
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
    const offset = c.startSec[gi];
    const dur = c.durSec;

    const src = this.ctx.createBufferSource();
    src.buffer = c.buffer;

    const g = this.ctx.createGain();
    // Bake the Hann window scaled by this grain's loudness and the cursor's
    // proximity, then hand it to the param as a value curve over the grain.
    const scale = 0.5 * this.active * (0.35 + 0.65 * c.loud[gi]);
    // The Hann curve already starts + ends at 0, so scheduling only the value
    // curve avoids a same-timestamp overlap with a setValueAtTime event (which
    // throws in some browsers).
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

  hud(): AtlasHud {
    const c = this.corpus;
    const i = this.nearestIndex;
    return {
      nearestIndex: i,
      active: this.active,
      centroidHz: c && i >= 0 ? c.grains[i].centroidHz : 0,
      pitchHz: c && i >= 0 ? c.grains[i].pitchHz : 0,
    };
  }

  dispose(): void {
    try {
      this.master.disconnect();
      this.noteGain.disconnect();
      this.shaper.disconnect();
    } catch {
      /* already gone */
    }
  }
}
