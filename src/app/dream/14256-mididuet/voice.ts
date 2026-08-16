// ─────────────────────────────────────────────────────────────────────────────
// 14256 · mididuet / voice.ts — the CONCATENATIVE resynthesis voice.
//
// Every note Karel plays is voiced by a REAL slice of his OWN recorded piano:
// we index his catalog's analysed notes (each note = a { time, dur, midi } slice
// of that track's decoded buffer), then on a live note-on we grab the closest-
// pitch slice, nudge its playbackRate to the exact note, and window it with a
// short attack/release scaled by velocity. Zero oscillators — his timbre, live.
//
// References: CoSaRef (arXiv:2410.16785) — annotation-free MIDI→audio via
// concatenative synthesis; "The Concatenator" (arXiv:2411.04366) — real-time
// concatenative musaicing. This is a lightweight, browser-side cousin.
// ─────────────────────────────────────────────────────────────────────────────

import { loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis } from "../_shared/trackAnalysis";

/** One real slice of Karel's catalog: a pitched grain of decoded audio. */
export interface Grain {
  buffer: AudioBuffer;
  startSec: number;
  durSec: number;
  midi: number;
  velocity: number;
}

export interface GrainIndex {
  /** midi → real slices at (roughly) that pitch. */
  byMidi: Map<number, Grain[]>;
  /** sorted unique midi values that have at least one grain. */
  midis: number[];
  /** total grains indexed across all analysed tracks. */
  count: number;
  /** true when grains came from real note analysis (not a bed fallback). */
  fromAnalysis: boolean;
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

const PER_MIDI_CAP = 48; // keep memory modest; plenty of timbral variety
const MAX_GRAIN_SEC = 1.6; // longest slice we let a held note ring for
const MIN_GRAIN_SEC = 0.12;

function pushGrain(byMidi: Map<number, Grain[]>, g: Grain) {
  const list = byMidi.get(g.midi);
  if (list) {
    if (list.length < PER_MIDI_CAP) list.push(g);
  } else {
    byMidi.set(g.midi, [g]);
  }
}

/**
 * Build a grain index from a handful of Karel's tracks. Loads BOTH the decoded
 * buffer and the note analysis for each id, then turns every analysed note into
 * a real, pitched slice. Kept to ~3 tracks by the caller so it loads fast.
 */
export async function buildGrainIndex(
  ctx: BaseAudioContext,
  ids: readonly string[],
): Promise<GrainIndex> {
  const byMidi = new Map<number, Grain[]>();
  let count = 0;

  for (const id of ids) {
    let buffer: AudioBuffer;
    try {
      const loaded = await loadRealTrackBuffer(ctx, id);
      buffer = loaded.buffer;
    } catch {
      continue; // skip a track we couldn't decode
    }
    const analysis = await loadTrackAnalysis(id);
    if (!analysis || analysis.notes.length === 0) continue;

    for (const n of analysis.notes) {
      const durSec = clamp(n.duration, MIN_GRAIN_SEC, MAX_GRAIN_SEC);
      if (n.time < 0 || n.time + MIN_GRAIN_SEC > buffer.duration) continue;
      pushGrain(byMidi, {
        buffer,
        startSec: n.time,
        durSec,
        midi: Math.round(n.midi),
        velocity: n.velocity,
      });
      count++;
    }
  }

  const midis = [...byMidi.keys()].sort((a, b) => a - b);
  return { byMidi, midis, count, fromAnalysis: count > 0 };
}

/**
 * Merge one already-decoded track (buffer + its analysed notes) into an index.
 * Lets the caller fold in the bed track it loaded for playback without a second
 * fetch/decode. Recomputes the derived fields in place.
 */
export function addNotesToIndex(
  index: GrainIndex,
  buffer: AudioBuffer,
  notes: readonly { midi: number; time: number; duration: number; velocity: number }[],
): void {
  for (const n of notes) {
    if (n.time < 0 || n.time + MIN_GRAIN_SEC > buffer.duration) continue;
    pushGrain(index.byMidi, {
      buffer,
      startSec: n.time,
      durSec: clamp(n.duration, MIN_GRAIN_SEC, MAX_GRAIN_SEC),
      midi: Math.round(n.midi),
      velocity: n.velocity,
    });
    index.count++;
  }
  index.midis = [...index.byMidi.keys()].sort((a, b) => a - b);
  index.fromAnalysis = index.count > 0;
}

/**
 * Fallback index built straight from the BED buffer when no note analysis is
 * available: still REAL audio, just sliced by position instead of by detected
 * pitch. Pitch maps monotonically to a read position across the take.
 */
export function bedFallbackIndex(bedBuffer: AudioBuffer): GrainIndex {
  const byMidi = new Map<number, Grain[]>();
  const lo = 36;
  const hi = 84;
  const span = Math.max(0.5, bedBuffer.duration - 0.8);
  for (let m = lo; m <= hi; m++) {
    const pos = ((m - lo) / (hi - lo)) * span;
    pushGrain(byMidi, {
      buffer: bedBuffer,
      startSec: pos,
      durSec: 0.6,
      midi: m,
      velocity: 84,
    });
  }
  const midis = [...byMidi.keys()].sort((a, b) => a - b);
  return { byMidi, midis, count: midis.length, fromAnalysis: false };
}

/** Nearest indexed midi to p: exact, else closest, tie-broken to pitch class. */
function nearestMidi(index: GrainIndex, p: number): number | null {
  if (index.byMidi.has(p)) return p;
  const { midis } = index;
  if (midis.length === 0) return null;
  let best = midis[0];
  let bestScore = Infinity;
  for (const m of midis) {
    const semis = Math.abs(m - p);
    // prefer near in absolute pitch, gently reward matching pitch class
    const pcPenalty = (m - p) % 12 === 0 ? -0.25 : 0;
    const score = semis + pcPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

interface ActiveGrain {
  src: AudioBufferSourceNode;
  gain: GainNode;
  stopAt: number;
}

/**
 * The live voice: turns MIDI note-on/off into windowed catalog grains routed
 * into `dest` (the safeMaster input). One layer of true concatenative synthesis.
 */
export class ConcatVoice {
  private ctx: AudioContext;
  private dest: AudioNode;
  private index: GrainIndex;
  private active = new Map<number, ActiveGrain>();
  private rotate = new Map<number, number>();

  constructor(ctx: AudioContext, dest: AudioNode, index: GrainIndex) {
    this.ctx = ctx;
    this.dest = dest;
    this.index = index;
  }

  setIndex(index: GrainIndex) {
    this.index = index;
  }

  /** Play a real catalog slice for pitch p at velocity v (0..127). */
  noteOn(p: number, v: number): void {
    const srcMidi = nearestMidi(this.index, p);
    if (srcMidi == null) return;
    const list = this.index.byMidi.get(srcMidi);
    if (!list || list.length === 0) return;

    // rotate through the available slices for that pitch → timbral variety
    const r = (this.rotate.get(srcMidi) ?? 0) % list.length;
    this.rotate.set(srcMidi, r + 1);
    const grain = list[r];

    // retrigger: release any grain already sounding at this pitch
    this.noteOff(p);

    const rate = clamp(Math.pow(2, (p - grain.midi) / 12), 0.5, 2);
    const playDur = Math.min(grain.durSec, MAX_GRAIN_SEC);

    const src = this.ctx.createBufferSource();
    src.buffer = grain.buffer;
    src.playbackRate.value = rate;

    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    const peak = clamp(v / 127, 0, 1) * 0.9 + 0.05;
    const attack = 0.006;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    // let a held slice ring toward its natural tail
    gain.gain.setTargetAtTime(0.0001, now + attack, playDur * 0.6);

    src.connect(gain);
    gain.connect(this.dest);
    src.start(now, grain.startSec, playDur);
    const stopAt = now + playDur / rate + 0.05;
    src.stop(stopAt);
    src.onended = () => {
      try {
        gain.disconnect();
        src.disconnect();
      } catch {
        /* already torn down */
      }
      if (this.active.get(p)?.src === src) this.active.delete(p);
    };

    this.active.set(p, { src, gain, stopAt });
  }

  /** Release a held pitch with a short fade. */
  noteOff(p: number): void {
    const a = this.active.get(p);
    if (!a) return;
    this.active.delete(p);
    const now = this.ctx.currentTime;
    const rel = 0.14;
    try {
      a.gain.gain.cancelScheduledValues(now);
      a.gain.gain.setTargetAtTime(0.0001, now, rel * 0.4);
      a.src.stop(now + rel);
    } catch {
      /* source may have ended */
    }
  }

  /** Stop everything (teardown). */
  stopAll(): void {
    for (const [, a] of this.active) {
      try {
        a.src.stop();
        a.src.disconnect();
        a.gain.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.active.clear();
  }
}
