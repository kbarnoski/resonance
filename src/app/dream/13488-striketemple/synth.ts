// ─────────────────────────────────────────────────────────────────────────────
// 13488-striketemple · synth.ts
//
// A tiny bank of physically-modeled MODAL resonators — bells, singing bowls and
// metal rods. Each strike fires N decaying sine partials at `fundamental ×
// modalRatio`, the ring being the modes' own exponential decay (bright high
// modes fade first, exactly like real struck metal). No samples, no canned
// bells. Everything is bounded (peak gain, partial count, a global voice budget)
// so it can never run away — safeMaster's limiter is the last line, not the
// first.
//
// The "context" these objects re-tune to is Karel's LIVE harmony: the page walks
// his recording's chord track against the playhead and hands each object a chord
// tone, so a strike always rings in his key, over his playing.
// ─────────────────────────────────────────────────────────────────────────────

export type StrikeKind = "bell" | "bowl" | "rod";

export interface KindSpec {
  label: string;
  blurb: string;
  /** Inharmonic / harmonic partial ratios relative to the fundamental. */
  ratios: number[];
  /** Fundamental decay in seconds. */
  baseDecay: number;
  /** How much faster higher partials decay (0 = uniform, larger = brighter→short). */
  decayCurve: number;
  /** Small per-partial detune spread (beating), in cents-ish fraction. */
  detune: number;
}

// Bell: strongly inharmonic (the brief's bell set — a hum tone below the strike
// tone, then the tierce / quint / nominal cluster of a real cast bell).
// Bowl / handpan: near-harmonic with a slight detune so it shimmers and beats.
// Rod: a free–free metal bar (marimba / glockenspiel lineage) — very metallic,
// wide-spaced inharmonic partials that die quickly.
export const KINDS: Record<StrikeKind, KindSpec> = {
  bell: {
    label: "Bell",
    blurb: "cast-bronze bell — inharmonic hum, tierce, quint, nominal",
    ratios: [0.5, 1, 1.19, 1.71, 2, 2.74, 3, 3.76, 4.07],
    baseDecay: 4.2,
    decayCurve: 0.5,
    detune: 0.0006,
  },
  bowl: {
    label: "Bowl",
    blurb: "singing bowl / handpan — near-harmonic, shimmering beats",
    ratios: [1, 2, 3, 4, 5, 6],
    baseDecay: 6.0,
    decayCurve: 0.35,
    detune: 0.0016,
  },
  rod: {
    label: "Rod",
    blurb: "struck metal rod — bright, wide inharmonic partials, short ring",
    ratios: [1, 2.76, 5.4, 8.93, 13.34],
    baseDecay: 1.4,
    decayCurve: 0.8,
    detune: 0.0004,
  },
};

export const KIND_ORDER: StrikeKind[] = ["bell", "bowl", "rod"];

// ── safety bounds ────────────────────────────────────────────────────────────
const MAX_OSC = 150; // global oscillator budget across all ringing strikes
const PEAK = 0.16; // per-strike fundamental peak gain before summing partials
const MIN_HZ = 22;
const MAX_HZ = 11000; // below safeMaster's air-band cap; nothing shrill escapes

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * The playable modal instrument. Owns nothing but a reference to the shared
 * AudioContext and the destination node (safeMaster.input). Every strike is
 * fire-and-forget: it schedules its own oscillators and tears them down.
 */
export class ModalEngine {
  private ctx: AudioContext;
  private dest: AudioNode;
  private oscCount = 0;

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.dest = dest;
  }

  get load(): number {
    return this.oscCount / MAX_OSC;
  }

  /**
   * Strike an object. `freq` is the fundamental (already tuned to a chord tone
   * of Karel's current harmony). `velocity` 0..1 sets loudness + brightness.
   */
  strike(freq: number, kind: StrikeKind, velocity: number): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const spec = KINDS[kind];
    if (this.oscCount + spec.ratios.length > MAX_OSC) return; // budget guard

    const vel = clamp(velocity, 0.05, 1);
    const strikeGain = ctx.createGain();
    strikeGain.gain.value = 1;
    strikeGain.connect(this.dest);

    let longest = 0;
    for (let k = 0; k < spec.ratios.length; k++) {
      const detune = 1 + (k > 0 ? (k % 2 === 0 ? spec.detune : -spec.detune) * k : 0);
      const f = freq * spec.ratios[k] * detune;
      if (f < MIN_HZ || f > MAX_HZ) continue;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;

      const g = ctx.createGain();
      // partial amplitude: lower partials carry the body; higher ones only
      // come up when the strike is hard (the classic bright-attack behaviour).
      const partialAmp = 1 / (1 + spec.ratios[k] * 0.8);
      const bright = 0.3 + 0.7 * vel;
      const kAmp = partialAmp * (k === 0 ? 1 : bright);
      const peak = clamp(kAmp * vel * PEAK, 0, PEAK);

      const decay = spec.baseDecay / (1 + (spec.ratios[k] - 1) * spec.decayCurve);
      longest = Math.max(longest, decay);

      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), now + 0.003);
      g.gain.exponentialRampToValueAtTime(0.00012, now + 0.004 + decay);

      osc.connect(g);
      g.connect(strikeGain);
      osc.start(now);
      osc.stop(now + 0.05 + decay);

      this.oscCount++;
      osc.onended = () => {
        this.oscCount = Math.max(0, this.oscCount - 1);
        try {
          osc.disconnect();
          g.disconnect();
        } catch {
          /* ctx closing */
        }
      };
    }

    // reclaim the summing node once the longest partial has died.
    window.setTimeout(
      () => {
        try {
          strikeGain.disconnect();
        } catch {
          /* already gone */
        }
      },
      (longest + 0.4) * 1000,
    );
  }
}

// ── chord → tuning ───────────────────────────────────────────────────────────

const PC: Record<string, number> = {
  C: 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, F: 5,
  "F#": 6, GB: 6, G: 7, "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11,
};

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Root pitch-class (0..11) of a chord symbol, or null. */
export function rootPc(symbol: string): number | null {
  const m = symbol.match(/^([A-Ga-g])([#b]?)/);
  if (!m) return null;
  const key = (m[1].toUpperCase() + (m[2] === "b" ? "B" : m[2])).toUpperCase();
  const pc = PC[key];
  return pc === undefined ? null : pc;
}

/**
 * Interval set (semitones from root) implied by a chord symbol. Deliberately
 * forgiving: handles triad quality, sus, 6/7/maj7 and 9/11/13 extensions. The
 * point is a usable set of chord tones to tune the objects to, not a rigorous
 * jazz parse.
 */
export function chordIntervals(symbol: string): number[] {
  const rest = symbol.replace(/^[A-Ga-g][#b]?/, "").split("/")[0];
  const s = rest.toLowerCase();
  const set = new Set<number>([0]);

  let third = 4;
  let fifth = 7;
  const minor = /^m(?!aj)/.test(s) || s.startsWith("min");
  if (minor) third = 3;
  if (/dim|°|o(?![a-z])/.test(s)) {
    third = 3;
    fifth = 6;
  }
  if (/aug|\+/.test(s)) fifth = 8;
  if (/sus2/.test(s)) third = 2;
  else if (/sus4|sus/.test(s)) third = 5;

  set.add(third);
  set.add(fifth);

  const isMaj7 = /maj7|maj9|maj11|maj13|ma7|\bm7\+|Δ/.test(rest);
  if (isMaj7) set.add(11);
  else if (/(^|[^a-z])(7|9|11|13)/.test(s)) set.add(10);

  if (/6/.test(s)) set.add(9);
  if (/9/.test(s)) set.add(2);
  if (/11/.test(s)) set.add(5);
  if (/13/.test(s)) set.add(9);

  return [...set].sort((a, b) => a - b);
}

/** Human-readable pitch name for a MIDI note, e.g. 60 → "C4". */
export function midiName(midi: number): string {
  const m = Math.round(midi);
  return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

/** Name of a pitch-class 0..11, e.g. 9 → "A". */
export function pcName(pc: number): string {
  return NAMES[((pc % 12) + 12) % 12];
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Spread a set of pitch-classes into `count` MIDI notes, low→high across a comfy
 * register, so the ring reads as an ascending voicing.
 */
export function midisFromPcs(pcs: number[], count: number): number[] {
  const uniq = [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))].sort(
    (a, b) => a - b,
  );
  if (uniq.length === 0) uniq.push(9, 0, 4); // A minor-ish safety

  const pool: number[] = [];
  for (let oct = 3; oct <= 6; oct++) {
    for (const pc of uniq) pool.push(12 * oct + pc); // midi
  }
  pool.sort((a, b) => a - b);
  const band = pool.filter((m) => m >= 45 && m <= 84);
  const src = band.length >= count ? band : pool;

  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const idx = Math.round(t * (src.length - 1));
    out.push(src[idx]);
  }
  return out;
}

/**
 * Turn a chord symbol into `count` MIDI notes. Falls back to a neutral A-minor
 * voicing on an unparseable / empty symbol so the temple always has a key.
 */
export function chordToMidis(symbol: string, count: number): number[] {
  const root = rootPc(symbol);
  if (root === null) return midisFromPcs([9, 0, 4, 7], count); // Am7-ish
  const pcs = chordIntervals(symbol).map((i) => (root + i) % 12);
  return midisFromPcs(pcs, count);
}
