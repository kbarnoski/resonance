// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — "Many Returns" phase-choir ensemble.
//
// ONE of Karel's real piano takes, grown into a Steve-Reich / Brian-Eno phase
// choir: many copies of the SAME ~7s loop window, each playing on its OWN
// AudioBufferSourceNode at a slightly DIFFERENT, incommensurate loop LENGTH, so
// no two ghosts ever re-sync — they drift through phase forever. This is the
// Eno *Music for Airports* seven-tape-loop mechanism (whole-buffer decoupled
// loops — NO granular grain-triggering).
//
// Each ghost ages like a Basinski *Disintegration Loop*: its own lowpass slowly
// closes and its gain dims over minutes, so the oldest ghosts recede into a dark
// wash while new ones enter bright. Live ghosts are capped; the oldest retires.
//
// Every ghost's gain terminates in the shared safeMaster bus — never
// ctx.destination directly.
// ─────────────────────────────────────────────────────────────────────────────

import type { SafeMaster } from "../_shared/visionary/safeMaster";

// Coprime-ish ratios so no two loop lengths ever land back in sync. The drift
// between them IS the composition.
const RATIOS = [1.0, 1.037, 1.081, 1.129, 1.181, 1.237];

const MAX_LIVE = 7; // hard cap on simultaneously sounding ghosts
const AUTO_TARGET = 5; // no-input self-build fills the choir to this many
const AGE_FULL = 240; // seconds for a ghost to fully disintegrate
const CUTOFF_NEW = 6500; // Hz — a fresh ghost is bright
const CUTOFF_OLD = 470; // Hz — an aged ghost is a dark wash
const GAIN_NEW = 1.0;
const GAIN_OLD = 0.3;
const PER_GHOST_GAIN = 0.17; // base level before aging; limiter tames the sum
const FADE_IN = 1.3; // seconds
const RETIRE_FADE = 1.6; // seconds
const ENTER_OFFSET = 0.12; // where in the buffer the loop window opens (fraction)

export interface GhostView {
  id: number;
  ratioIndex: number;
  ratio: number;
  loopLen: number; // seconds (this ghost's incommensurate loop length)
  phase01: number; // current loop phase, 0..1
  age: number; // seconds alive
  ageNorm: number; // 0 = new … 1 = fully disintegrated
  level: number; // audible level 0..1 (muted → 0)
  cutoff: number; // current lowpass cutoff (Hz)
  muted: boolean;
  retiring: boolean;
  pan: number; // -1..1
}

interface Ghost {
  id: number;
  ratioIndex: number;
  ratio: number;
  loopLen: number;
  startedAt: number;
  bornAt: number;
  rate: number;
  pan: number;
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  muted: boolean;
  retiring: boolean;
  retireAt: number;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
// deterministic tiny hash → small detune spread per ratio index
function detuneCents(i: number): number {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 44; // ±22 cents
}

export class Ensemble {
  private ctx: AudioContext;
  private buffer: AudioBuffer;
  private master: SafeMaster;
  private ghosts: Ghost[] = [];
  private nextId = 1;
  private spawnCount = 0;
  private nextAutoAt = 0;
  private freq: Uint8Array<ArrayBuffer>;

  /** Base loop-window length (s). Shapes the drift for NEWLY added ghosts. */
  baseLoopLen = 7.0;
  /** Multiplies each ratio's deviation from 1 for new ghosts (drift width). */
  driftSpread = 1.0;

  constructor(ctx: AudioContext, buffer: AudioBuffer, master: SafeMaster) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.master = master;
    this.freq = new Uint8Array(new ArrayBuffer(master.analyser.frequencyBinCount));
  }

  /** Start the self-building choir: one ghost now, more auto-committed later. */
  start(): void {
    this.addGhost();
    this.nextAutoAt = this.ctx.currentTime + 4.5;
  }

  get liveCount(): number {
    return this.ghosts.filter((g) => !g.retiring).length;
  }

  /** Commit one new ghost at the next incommensurate loop length. */
  addGhost(): void {
    // enforce the cap by retiring the oldest still-live ghost first
    const live = this.ghosts.filter((g) => !g.retiring);
    if (live.length >= MAX_LIVE) this.retireOldest();

    const i = this.spawnCount++;
    const baseRatio = RATIOS[i % RATIOS.length];
    // keep uniqueness once we wrap past the base list
    const wrap = Math.floor(i / RATIOS.length);
    const ratio = (1 + (baseRatio - 1) * this.driftSpread) * (1 + 0.017 * wrap);

    const maxWindow = this.baseLoopLen * 1.3 + 0.5;
    const offset = Math.max(
      0,
      Math.min(this.buffer.duration * ENTER_OFFSET, this.buffer.duration - maxWindow - 0.2),
    );
    const window = Math.min(this.baseLoopLen * ratio, this.buffer.duration - offset - 0.05);

    const now = this.ctx.currentTime;
    const rate = Math.pow(2, detuneCents(i) / 1200);
    const pan = (((i % MAX_LIVE) / (MAX_LIVE - 1)) * 2 - 1) * 0.72;

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.loopStart = offset;
    src.loopEnd = offset + window;
    src.playbackRate.value = rate;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = CUTOFF_NEW;
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.master.input);

    src.start(now, offset);

    this.ghosts.push({
      id: this.nextId++,
      ratioIndex: i,
      ratio,
      loopLen: window,
      startedAt: now,
      bornAt: now,
      rate,
      pan,
      src,
      gain,
      filter,
      panner,
      muted: false,
      retiring: false,
      retireAt: 0,
    });
  }

  /** Retire-oldest ("thin the choir"). */
  thin(): void {
    this.retireOldest();
  }

  private retireOldest(): void {
    const live = this.ghosts.filter((g) => !g.retiring);
    if (live.length === 0) return;
    let oldest = live[0];
    for (const g of live) if (g.bornAt < oldest.bornAt) oldest = g;
    this.retire(oldest);
  }

  private retire(g: Ghost): void {
    if (g.retiring) return;
    g.retiring = true;
    g.retireAt = this.ctx.currentTime + RETIRE_FADE;
    g.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, RETIRE_FADE / 4);
  }

  toggleMute(id: number): void {
    const g = this.ghosts.find((x) => x.id === id);
    if (g && !g.retiring) g.muted = !g.muted;
  }

  /** Per-frame: apply aging automation, run the no-input self-build, reap. */
  step(): void {
    const now = this.ctx.currentTime;

    // reap fully-faded retirees
    for (const g of this.ghosts) {
      if (g.retiring && now >= g.retireAt) {
        try {
          g.src.stop();
        } catch {
          /* already stopped */
        }
        try {
          g.src.disconnect();
          g.filter.disconnect();
          g.gain.disconnect();
          g.panner.disconnect();
        } catch {
          /* closing */
        }
      }
    }
    this.ghosts = this.ghosts.filter((g) => !(g.retiring && now >= g.retireAt));

    // aging: close the filter, dim the gain over minutes (Basinski decay)
    for (const g of this.ghosts) {
      if (g.retiring) continue;
      const age = now - g.bornAt;
      const an = clamp01(age / AGE_FULL);
      const enter = clamp01((now - g.startedAt) / FADE_IN);
      const cutoff = lerp(CUTOFF_NEW, CUTOFF_OLD, an * an);
      const gm = lerp(GAIN_NEW, GAIN_OLD, an);
      const target = g.muted ? 0.0001 : PER_GHOST_GAIN * gm * enter + 0.0001;
      g.gain.gain.setTargetAtTime(target, now, 0.3);
      g.filter.frequency.setTargetAtTime(cutoff, now, 0.4);
    }

    // no-input self-build toward AUTO_TARGET
    if (this.liveCount < AUTO_TARGET && now >= this.nextAutoAt) {
      this.addGhost();
      this.nextAutoAt = now + 4 + Math.random() * 2; // 4–6s
    }
  }

  getViews(): GhostView[] {
    const now = this.ctx.currentTime;
    return this.ghosts.map((g) => {
      const elapsed = (now - g.startedAt) * g.rate;
      const phase01 = mod(elapsed, g.loopLen) / g.loopLen;
      const age = now - g.bornAt;
      const an = clamp01(age / AGE_FULL);
      const enter = clamp01((now - g.startedAt) / FADE_IN);
      const retFade = g.retiring
        ? clamp01((g.retireAt - now) / RETIRE_FADE)
        : 1;
      const level = g.muted ? 0 : lerp(GAIN_NEW, GAIN_OLD, an) * enter * retFade;
      return {
        id: g.id,
        ratioIndex: g.ratioIndex,
        ratio: g.ratio,
        loopLen: g.loopLen,
        phase01,
        age,
        ageNorm: an,
        level,
        cutoff: g.filter.frequency.value,
        muted: g.muted,
        retiring: g.retiring,
        pan: g.pan,
      };
    });
  }

  /** Overall tamed level 0..1 from the safeMaster analyser tap. */
  level(): number {
    this.master.analyser.getByteFrequencyData(this.freq);
    let s = 0;
    for (let i = 0; i < this.freq.length; i++) s += this.freq[i];
    return s / (this.freq.length * 255);
  }

  dispose(): void {
    for (const g of this.ghosts) {
      try {
        g.src.stop();
      } catch {
        /* noop */
      }
      try {
        g.src.disconnect();
        g.filter.disconnect();
        g.gain.disconnect();
        g.panner.disconnect();
      } catch {
        /* noop */
      }
    }
    this.ghosts = [];
  }
}
