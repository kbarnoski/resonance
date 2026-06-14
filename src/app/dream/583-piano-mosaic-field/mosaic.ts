// mosaic.ts — 583-piano-mosaic-field
//
// The concatenative-musaicing engine. Given Karel's grain corpus and a moving
// 2-D cursor (x = brightness target, y = pitch target), it continuously SELECTS
// the best-matching grains near that target and concatenates/overlaps them into
// a warm continuous cloud of his own piano sound.
//
// This is target-driven grain selection (CataRT-style), not random scatter:
//   - cost = weighted distance in (brightness, pitch) feature space, with a
//     small bonus for louder grains and a small repeat penalty so we don't
//     re-trigger the same grain every voice.
//   - a fresh grain is launched on a steady tick; each plays through a Hann
//     gain envelope and overlaps its neighbours (~4-8 voices live at once),
//     so the stream glides and never clicks.
//   - everything runs through a DynamicsCompressor limiter → never clips.
//
// Web Audio API only.

import type { Corpus, Grain } from "./audio";

/** A grain currently sounding — surfaced to the renderer so it can flare. */
export interface ActiveVoice {
  grainIndex: number;
  /** 0..1 envelope amplitude this frame (for visual flare intensity). */
  amp: number;
}

export interface MosaicEngine {
  /** Set the timbre-field target the matcher chases (both 0..1). */
  setTarget: (brightness: number, pitch: number) => void;
  /** Master gain 0..1 (e.g. fade in on start). */
  setGain: (g: number) => void;
  /** Snapshot of grains currently sounding, for the visual flare. */
  active: () => ActiveVoice[];
  stop: () => void;
}

interface Scheduled {
  grainIndex: number;
  startTime: number;
  endTime: number;
  peak: number;
}

const GRAIN_TRIGGER_MS = 55; // launch a new grain ~18x/sec → dense overlap
const MAX_LIVE = 8;
const PLAYBACK_GRAIN_S = 0.16; // each scheduled grain ~160ms, Hann-enveloped

/**
 * Build the mosaicing engine over a corpus. Drives an internal scheduler that
 * keeps ~4-8 grains overlapping toward the current target coordinate.
 */
export function makeMosaicEngine(ctx: AudioContext, corpus: Corpus): MosaicEngine {
  const grains = corpus.grains;

  // Master chain: bus → limiter → out.
  const master = ctx.createGain();
  master.gain.value = 0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 24;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;
  // Gentle low-shelf warmth.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 7200;
  tone.Q.value = 0.4;
  master.connect(tone);
  tone.connect(limiter);
  limiter.connect(ctx.destination);

  let targetB = 0.5;
  let targetP = 0.5;
  let stopped = false;

  // Recently played grains get a temporary cost penalty (avoid machine-gun).
  const recent = new Map<number, number>(); // grainIndex → expiry time

  const scheduled: Scheduled[] = [];
  let recentPick = -1;

  /**
   * Pick the best grain for the current target. Cost combines feature distance,
   * a loudness preference, a repeat penalty, and a little noise so a static
   * cursor still gently varies its grain choice (organic, not a stuck loop).
   */
  function pickGrain(): number {
    let best = -1;
    let bestCost = Infinity;
    const now = ctx.currentTime;
    // Sample a subset for speed when corpus is large; full scan when small.
    const n = grains.length;
    for (let i = 0; i < n; i++) {
      const g = grains[i];
      const db = g.brightness - targetB;
      const dp = g.pitch - targetP;
      let cost = db * db * 1.0 + dp * dp * 1.3;
      cost -= g.loudness * 0.04; // prefer present, voiced grains
      const exp = recent.get(i);
      if (exp !== undefined && exp > now) cost += 0.25;
      cost += Math.random() * 0.012; // tiny jitter → organic selection
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    return best;
  }

  function launchGrain(when: number): void {
    if (stopped) return;
    const idx = pickGrain();
    if (idx < 0) return;
    const g: Grain = grains[idx];

    const src = ctx.createBufferSource();
    src.buffer = corpus.buffer;

    // Hann envelope so each grain fades in/out → seamless overlap, no clicks.
    const env = ctx.createGain();
    const dur = PLAYBACK_GRAIN_S;
    const peak = 0.5 + g.loudness * 0.5;
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(peak, when + dur * 0.5);
    env.gain.linearRampToValueAtTime(0.0001, when + dur);

    src.connect(env);
    env.connect(master);

    const offset = g.start / corpus.buffer.sampleRate;
    // Slight per-grain detune drift for warmth (±1.5%).
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.03;
    try {
      src.start(when, Math.max(0, offset), dur + 0.02);
    } catch {
      return;
    }
    src.stop(when + dur + 0.05);

    scheduled.push({ grainIndex: idx, startTime: when, endTime: when + dur, peak });
    recent.set(idx, ctx.currentTime + 0.35);
    recentPick = idx;

    // Trim bookkeeping.
    if (scheduled.length > 64) scheduled.splice(0, scheduled.length - 64);
  }

  // Scheduler: look ahead and queue grains on a steady grid.
  let nextGrainTime = ctx.currentTime + 0.05;
  const lookahead = 0.12;
  const timer = setInterval(() => {
    if (stopped) return;
    const now = ctx.currentTime;
    while (nextGrainTime < now + lookahead) {
      launchGrain(nextGrainTime);
      nextGrainTime += GRAIN_TRIGGER_MS / 1000;
    }
    // Prune recent map.
    for (const [k, exp] of recent) if (exp < now) recent.delete(k);
  }, 25);

  return {
    setTarget(b, p) {
      targetB = Math.min(1, Math.max(0, b));
      targetP = Math.min(1, Math.max(0, p));
    },
    setGain(v) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(Math.min(1, Math.max(0, v)) * 0.9, t, 0.15);
    },
    active(): ActiveVoice[] {
      const now = ctx.currentTime;
      const out: ActiveVoice[] = [];
      for (const s of scheduled) {
        if (s.endTime < now || s.startTime > now) continue;
        // Triangular envelope amplitude estimate for flare intensity.
        const mid = (s.startTime + s.endTime) / 2;
        const half = (s.endTime - s.startTime) / 2;
        const amp = Math.max(0, 1 - Math.abs(now - mid) / half) * s.peak;
        out.push({ grainIndex: s.grainIndex, amp });
      }
      if (out.length === 0 && recentPick >= 0) {
        out.push({ grainIndex: recentPick, amp: 0.2 });
      }
      return out.slice(-MAX_LIVE);
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(0, t, 0.1);
      setTimeout(() => {
        try { master.disconnect(); tone.disconnect(); limiter.disconnect(); } catch { /* noop */ }
      }, 400);
    },
  };
}
