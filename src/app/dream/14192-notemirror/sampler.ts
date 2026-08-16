// ─────────────────────────────────────────────────────────────────────────────
// 14192-notemirror · sampler.ts
//
// The instrument: an analysis-driven note-slice sampler cut from Karel's OWN
// decoded recording. Given the track's note roll (each note = MIDI pitch + onset
// time + duration), we build a per-pitch index of real recorded notes. Playing a
// MIDI/QWERTY key looks up the recording's OWN nearest-pitch note, slices exactly
// that region out of the AudioBuffer, tunes it to the exact pitch, and plays it —
// so the performer re-arranges their real struck notes in a new order, in their
// own piano sound, with NO synth / oscillator anywhere.
//
// When analysis is missing/sparse, we fall back to a region slice (cut a short
// window, pitch-shift from a reference) so the instrument still plays.
// ─────────────────────────────────────────────────────────────────────────────

import type { TrackNote } from "../_shared/trackAnalysis";

/** One recorded note region, ready to be re-struck. */
export interface Slice {
  midi: number;
  /** onset in the buffer, seconds. */
  time: number;
  /** recorded note length, seconds. */
  duration: number;
  /** 0..1. */
  velocity: number;
}

const MAX_LEN = 3.5; // hard cap on how much recorded audio one key can sound
const REGION_WIN = 0.55; // fallback window length, seconds
const REGION_REF_MIDI = 60; // fallback: treat the window as ~middle C
const FADE_IN = 0.005;
const RELEASE = 0.35;

/**
 * Build the 128-slot per-pitch index. index[p] = every recorded note at MIDI p,
 * in onset order. Empty slots stay empty arrays.
 */
export function buildSliceIndex(notes: TrackNote[]): Slice[][] {
  const index: Slice[][] = Array.from({ length: 128 }, () => []);
  for (const n of notes) {
    const p = Math.round(n.midi);
    if (p < 0 || p > 127) continue;
    if (!(n.duration > 0)) continue;
    index[p].push({
      midi: p,
      time: n.time,
      duration: n.duration,
      velocity: Math.max(0, Math.min(1, n.velocity / 127)),
    });
  }
  return index;
}

/** How many real notes the index holds in total (for the UI readout). */
export function countSlices(index: Slice[][]): number {
  let n = 0;
  for (const list of index) n += list.length;
  return n;
}

/**
 * Nearest pitch (within `span` semitones) that actually has recorded slices, or
 * -1 if none. Searches outward: p, p-1, p+1, p-2, p+2, … so ties prefer down.
 */
export function nearestSlicePitch(
  index: Slice[][],
  p: number,
  span = 12,
): number {
  if (p >= 0 && p <= 127 && index[p].length > 0) return p;
  for (let d = 1; d <= span; d++) {
    const lo = p - d;
    const hi = p + d;
    if (lo >= 0 && lo <= 127 && index[lo].length > 0) return lo;
    if (hi >= 0 && hi <= 127 && index[hi].length > 0) return hi;
  }
  return -1;
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  peak: number;
  stopAt: number;
  released: boolean;
}

export interface Sampler {
  /** true when playing real analysis slices, false when in region fallback. */
  readonly usingRealSlices: boolean;
  /** Strike MIDI pitch `p` at velocity 0..1. Returns the source slice pitch. */
  noteOn(p: number, vel: number): number;
  /** Gentle release of any voices still held for pitch `p`. */
  noteOff(p: number): void;
  /** Kill every voice immediately (unmount / stop). */
  stopAll(): void;
}

/**
 * Make the sampler. `index` null → region-fallback mode. Every voice connects to
 * `dest` (which must already route through the ear-safety master).
 */
export function makeSampler(
  ctx: AudioContext,
  buffer: AudioBuffer,
  dest: AudioNode,
  index: Slice[][] | null,
): Sampler {
  const usingReal = !!index && countSlices(index) > 0;
  const active = new Map<number, Voice[]>();
  const rr = new Int32Array(128); // per-pitch round-robin counter
  let regionHop = 0; // deterministic golden-ratio walk for fallback windows
  const bufDur = buffer.duration;

  function spawn(
    sliceMidi: number,
    targetMidi: number,
    offset: number,
    len: number,
    vel: number,
  ): Voice {
    const now = ctx.currentTime;
    const rate = Math.pow(2, (targetMidi - sliceMidi) / 12);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    const gain = ctx.createGain();
    const peak = 0.18 + 0.62 * Math.max(0, Math.min(1, vel));
    const heardLen = len / rate; // real seconds this region takes at this rate

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + FADE_IN);
    // let the recorded decay ring; feather the very end so the region never clicks
    const tailStart = now + Math.max(FADE_IN + 0.02, heardLen - 0.18);
    gain.gain.setTargetAtTime(0.0001, tailStart, 0.06);

    src.connect(gain);
    gain.connect(dest);
    src.start(now, offset, len + 0.05);
    const stopAt = now + heardLen + 0.3;
    src.stop(stopAt);

    return { src, gain, peak, stopAt, released: false };
  }

  function push(p: number, v: Voice) {
    const list = active.get(p);
    if (list) list.push(v);
    else active.set(p, [v]);
    v.src.onended = () => {
      const l = active.get(p);
      if (!l) return;
      const i = l.indexOf(v);
      if (i >= 0) l.splice(i, 1);
      if (l.length === 0) active.delete(p);
    };
  }

  return {
    usingRealSlices: usingReal,

    noteOn(p, vel) {
      if (usingReal && index) {
        const sliceMidi = nearestSlicePitch(index, p, 12);
        if (sliceMidi >= 0) {
          const list = index[sliceMidi];
          const pick = list[rr[sliceMidi]++ % list.length];
          const len = Math.min(pick.duration + 0.6, MAX_LEN);
          push(p, spawn(sliceMidi, p, pick.time, len, vel));
          return sliceMidi;
        }
      }
      // region fallback: deterministic golden-ratio hop across the take
      const usable = Math.max(0, bufDur - REGION_WIN);
      const offset = usable > 0 ? (regionHop * 0.61803398875 * bufDur) % usable : 0;
      regionHop++;
      push(p, spawn(REGION_REF_MIDI, p, offset, REGION_WIN, vel));
      return REGION_REF_MIDI;
    },

    noteOff(p) {
      const list = active.get(p);
      if (!list) return;
      const now = ctx.currentTime;
      for (const v of list) {
        if (v.released) continue;
        v.released = true;
        try {
          v.gain.gain.cancelScheduledValues(now);
          v.gain.gain.setValueAtTime(v.gain.gain.value, now);
          v.gain.gain.setTargetAtTime(0.0001, now, RELEASE / 3);
          const newStop = Math.min(v.stopAt, now + RELEASE + 0.05);
          v.src.stop(newStop);
        } catch {
          /* already stopped */
        }
      }
    },

    stopAll() {
      for (const list of active.values()) {
        for (const v of list) {
          try {
            v.src.onended = null;
            v.src.stop();
          } catch {
            /* already stopped */
          }
          try {
            v.gain.disconnect();
          } catch {
            /* detached */
          }
        }
      }
      active.clear();
    },
  };
}
