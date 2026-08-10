// Counterpoint — "the answering voice".
//
// Cycle 2 of 9080-mnemonic. Where mnemonic quoted ONE motif back as a single
// transformed echo, this engine answers a captured *subject* with real
// imitative counterpoint: a canon at a consonant interval, the subject inverted
// underneath itself, and — as a recurring idea's THEME STRENGTH grows over
// minutes — stretto: entries crowd closer and MORE voices enter (2 → 3 → 4),
// so a small fugue-exposition assembles on stacked staves.
//
// Determinism rule for this dream: the ONLY randomness is mulberry32 (seed
// 0x9624 in the page). Never Math.random, never Date.now / argless new Date().
// Timing comes from performance.now() / AudioContext.currentTime; this file is
// pure and dependency-free.
//
// Research chain (cited in README.md): the long-horizon theme-strength memory
// is the "distributed memory horizon" of DSMR — "Depth-Structured Music
// Recurrence", arXiv:2602.19816 (Feb 2026): a LONG history window carries motif
// repetition and developmental variation while short windows stay local. Here
// that long window is bolted onto mnemonic's existing fine (pitch/onset) and
// phrase (segmenter) scales, and it drives how many contrapuntal voices enter.

/** mulberry32 — tiny deterministic PRNG. Returns a function in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Mode = "major" | "minor";

/** A single sounded note. `t` is seconds from the subject's start. */
export interface NoteEvent {
  midi: number;
  t: number;
  dur: number;
}

export const NOTE_NAMES = [
  "C", "C♯", "D", "D♯", "E", "F",
  "F♯", "G", "G♯", "A", "A♯", "B",
] as const;

export function pcName(pc: number): string {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}

// Krumhansl–Kessler tonal-hierarchy profiles (Krumhansl 1990, ch. 2).
// Correlating a chroma vector against the 24 rotations estimates key + mode.
const KS_MAJOR = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const KS_MINOR = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

export interface KeyEstimate {
  tonic: number;
  mode: Mode;
  strength: number;
}

/** Krumhansl–Schmuckler key-finding over a 12-bin chroma accumulator. */
export function estimateKey(chroma: number[]): KeyEstimate {
  let best: KeyEstimate = { tonic: 0, mode: "major", strength: -2 };
  const total = chroma.reduce((s, v) => s + v, 0);
  if (total <= 0) return { tonic: 9, mode: "minor", strength: 0 }; // A minor default
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = chroma.map((_, i) => chroma[(i + tonic) % 12]);
    const rMaj = pearson(rotated, KS_MAJOR);
    const rMin = pearson(rotated, KS_MINOR);
    if (rMaj > best.strength) best = { tonic, mode: "major", strength: rMaj };
    if (rMin > best.strength) best = { tonic, mode: "minor", strength: rMin };
  }
  return best;
}

const SCALE: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10], // natural minor
};

/** Snap a midi note onto the nearest scale degree of (tonic, mode). */
export function quantizeToKey(midi: number, tonic: number, mode: Mode): number {
  const scale = SCALE[mode];
  const rel = midi - tonic;
  const oct = Math.floor(rel / 12);
  const pc = ((rel % 12) + 12) % 12;
  let bestPc = scale[0];
  let bestD = 99;
  for (const s of scale) {
    const d = Math.min(Math.abs(s - pc), 12 - Math.abs(s - pc));
    if (d < bestD) {
      bestD = d;
      bestPc = s;
    }
  }
  return tonic + oct * 12 + bestPc;
}

/** Salience: how memorable a phrase is. Length + pitch variety + span. */
export function scoreSalience(events: NoteEvent[]): number {
  if (events.length === 0) return 0;
  const pcs = new Set(events.map((e) => ((e.midi % 12) + 12) % 12));
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of events) {
    lo = Math.min(lo, e.midi);
    hi = Math.max(hi, e.midi);
  }
  return events.length + pcs.size * 0.5 + Math.min(hi - lo, 24) / 12;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Tempo grid ──────────────────────────────────────────────────────────────
// Collect inter-onset intervals, take a robust central value (median) as the
// beat, then snap onsets/durations to an eighth-note grid so stacked voices
// line up to barlines — metered manuscript rather than free scrawl.

/** Robust beat length (seconds) from a phrase's inter-onset intervals. */
export function estimateBeat(events: NoteEvent[]): number {
  if (events.length < 2) return 0.4;
  const iois: number[] = [];
  for (let i = 1; i < events.length; i++) {
    const d = events[i].t - events[i - 1].t;
    if (d > 0.04) iois.push(d);
  }
  if (iois.length === 0) return 0.4;
  iois.sort((a, b) => a - b);
  const median = iois[Math.floor(iois.length / 2)];
  // Treat the median IOI as one grid step; a beat is two of them (eighths).
  const beat = median * 2;
  return Math.min(1.1, Math.max(0.22, beat));
}

/** Snap onsets and durations to a beat/`div` grid (default eighth notes). */
export function quantizeTime(
  events: NoteEvent[],
  beat: number,
  div = 2,
): NoteEvent[] {
  const step = beat / div;
  return events.map((e) => ({
    midi: e.midi,
    t: Math.round(e.t / step) * step,
    dur: Math.max(step, Math.round(e.dur / step) * step),
  }));
}

// ── Long-horizon theme memory (the DSMR "long window") ──────────────────────
// A theme is a recurring melodic shape, tracked by its interval contour. Each
// return to a shape reinforces it; strength decays slowly (half-life in
// minutes), so returning to an idea over time makes its theme stronger — and a
// stronger theme summons more contrapuntal voices.

export interface Theme {
  id: number;
  contour: number[]; // signed semitone intervals between consecutive notes
  strength: number; // reinforced on recurrence, decays over minutes
  count: number; // raw number of times seen
  lastT: number; // seconds (performance.now/1000) of last reinforcement
  key: number;
  mode: Mode;
}

/** Signed interval contour of a phrase — its shape, transposition-invariant. */
export function contourOf(events: NoteEvent[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < events.length; i++) {
    out.push(events[i].midi - events[i - 1].midi);
  }
  return out;
}

/** Mean per-step distance between two contours (0 = identical shape). */
export function contourDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  const m = Math.max(a.length, b.length);
  if (m === 0) return 0;
  if (n === 0) return 99;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  s += (m - n) * 3; // penalize length mismatch
  return s / m;
}

/** Half-life (seconds) of theme-strength decay — the "minutes" long horizon. */
export const THEME_HALF_LIFE = 120;
const THEME_MATCH = 1.6; // mean-interval distance under which shapes are "the same"

export interface Reinforcement {
  themes: Theme[];
  themeId: number;
  strength: number;
}

/**
 * Fold a freshly captured phrase into the long-horizon theme memory. Existing
 * strengths first decay toward `now`; the closest matching shape (if any) is
 * reinforced, otherwise a new theme is born. Returns the updated bank plus the
 * matched theme's id and its post-reinforcement strength.
 */
export function reinforceTheme(
  themes: Theme[],
  events: NoteEvent[],
  key: number,
  mode: Mode,
  now: number,
  nextId: number,
): Reinforcement {
  const contour = contourOf(events);
  const decayed = themes.map((th) => {
    const dt = Math.max(0, now - th.lastT);
    const f = Math.pow(0.5, dt / THEME_HALF_LIFE);
    return { ...th, strength: th.strength * f };
  });

  let best = -1;
  let bestD = THEME_MATCH;
  for (let i = 0; i < decayed.length; i++) {
    const d = contourDistance(decayed[i].contour, contour);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }

  if (best >= 0) {
    const th = decayed[best];
    // Reinforce: strength climbs (with mild saturation), contour eased toward
    // the fresh reading so the tracked shape stays current.
    const strength = th.strength + 1;
    const eased = th.contour.map((v, i) =>
      i < contour.length ? v * 0.6 + contour[i] * 0.4 : v,
    );
    decayed[best] = {
      ...th,
      strength,
      count: th.count + 1,
      lastT: now,
      contour: eased,
      key,
      mode,
    };
    return { themes: decayed, themeId: th.id, strength };
  }

  const fresh: Theme = {
    id: nextId,
    contour,
    strength: 1,
    count: 1,
    lastT: now,
    key,
    mode,
  };
  return { themes: [...decayed, fresh], themeId: nextId, strength: 1 };
}

// ── Contrapuntal voice generation ───────────────────────────────────────────
// Every answering voice is quantized back into the working key so consonance
// holds. Time offsets are expressed in beats and multiplied by the tracked beat
// so entries land on the metered grid.

export type VoiceKind = "subject" | "canon" | "inversion" | "octave";

export interface Voice {
  id: number;
  kind: VoiceKind;
  label: string; // e.g. "enters 1 beat later · up a 5th"
  entryBeats: number; // delay before this voice enters
  interval: number; // transposition in semitones
  inverted: boolean;
  axisMidi?: number; // reflection axis, for inverted voices
  events: NoteEvent[]; // t already offset by the entry delay, quantized to key
}

function intervalName(semi: number): string {
  const a = Math.abs(semi);
  const dir = semi > 0 ? "up" : semi < 0 ? "down" : "";
  let name = `${a} st`;
  if (a === 0) return "at pitch";
  if (a === 3 || a === 4) name = "a 3rd";
  else if (a === 5) name = "a 4th";
  else if (a === 7) name = "a 5th";
  else if (a === 12) name = "an octave";
  else if (a === 2) name = "a 2nd";
  return `${dir} ${name}`.trim();
}

function beatWord(beats: number): string {
  const rounded = Math.round(beats * 10) / 10;
  const unit = rounded === 1 ? "beat" : "beats";
  return `${rounded} ${unit}`;
}

/** A canon: the subject re-entering later, transposed a consonant interval. */
export function canonVoice(
  subject: NoteEvent[],
  delayBeats: number,
  intervalSemitones: number,
  key: number,
  mode: Mode,
  beat: number,
  id: number,
): Voice {
  const offset = delayBeats * beat;
  const events = subject.map((e) => ({
    midi: quantizeToKey(e.midi + intervalSemitones, key, mode),
    t: e.t + offset,
    dur: e.dur,
  }));
  const kind: VoiceKind = Math.abs(intervalSemitones) === 12 ? "octave" : "canon";
  return {
    id,
    kind,
    label: `enters ${beatWord(delayBeats)} later · ${intervalName(intervalSemitones)}`,
    entryBeats: delayBeats,
    interval: intervalSemitones,
    inverted: false,
    events,
  };
}

/** The subject inverted against itself — mirror each interval about an axis. */
export function inversionVoice(
  subject: NoteEvent[],
  axisMidi: number,
  key: number,
  mode: Mode,
  delayBeats: number,
  beat: number,
  id: number,
): Voice {
  const offset = delayBeats * beat;
  const events = subject.map((e) => ({
    midi: quantizeToKey(2 * axisMidi - e.midi, key, mode),
    t: e.t + offset,
    dur: e.dur,
  }));
  return {
    id,
    kind: "inversion",
    label: `enters ${beatWord(delayBeats)} later · inverted (mirror)`,
    entryBeats: delayBeats,
    interval: 0,
    inverted: true,
    axisMidi,
    events,
  };
}

/** Total voices (subject + answers) a given theme strength summons: 2 → 3 → 4. */
export function voiceCountForStrength(strength: number): number {
  if (strength < 1.5) return 2;
  if (strength < 3) return 3;
  return 4;
}

export interface Answer {
  voices: Voice[]; // voice 0 is always the subject; the rest are answers
  themeStrength: number;
  beat: number;
  spacing: number; // beats between successive entries (shrinks with strength)
  total: number; // total voices in this exposition
  seq: number; // bumps each re-development so the view can restart its draw
}

/**
 * The counterpoint engine — the answer to the one question.
 *
 * Given a captured subject and its theme strength, build a fugue-exposition:
 * the subject, then a dominant answer in canon a 5th up, then (as the theme
 * strengthens) the subject inverted underneath, then a further octave canon —
 * with entries crowding closer (stretto) as strength rises.
 */
export function developSubject(
  subject: NoteEvent[],
  key: number,
  mode: Mode,
  beat: number,
  strength: number,
  seq: number,
): Answer {
  const total = voiceCountForStrength(strength);
  const answering = total - 1;

  // Stretto: as the theme strengthens, successive entries crowd closer.
  const spacing = Math.max(0.5, 1.5 - (strength - 1) * 0.28);

  const voices: Voice[] = [
    {
      id: 0,
      kind: "subject",
      label: "subject",
      entryBeats: 0,
      interval: 0,
      inverted: false,
      events: subject.map((e) => ({ midi: e.midi, t: e.t, dur: e.dur })),
    },
  ];

  // Voice 1 — the classical dominant answer: canon a 5th up.
  voices.push(canonVoice(subject, spacing, 7, key, mode, beat, 1));

  // Voice 2 — the subject inverted underneath, reflected about its first note.
  if (answering >= 2) {
    voices.push(
      inversionVoice(subject, subject[0].midi, key, mode, spacing * 2, beat, 2),
    );
  }

  // Voice 3 — a further canon an octave below, completing a four-voice texture.
  if (answering >= 3) {
    voices.push(canonVoice(subject, spacing * 3, -12, key, mode, beat, 3));
  }

  return { voices, themeStrength: strength, beat, spacing, total, seq };
}
