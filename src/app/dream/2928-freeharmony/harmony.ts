// ─────────────────────────────────────────────────────────────────────────────
// 2928 · FREE HARMONY — the harmony engine
// A decaying 12-bin pitch-class histogram + Krumhansl–Schmuckler key-finding +
// functional-harmony chord choice with voice-leading and hysteresis.
//
// The histogram forgets with a ~2.4 s half-life, so the detected key lags the
// singer by "a beat or two" — that lag is the whole point: the accompanist
// re-harmonizes a moment AFTER you modulate, like a real player catching up.
// ─────────────────────────────────────────────────────────────────────────────

// Krumhansl–Kessler tonal hierarchy profiles (Krumhansl 1990).
const KK_MAJOR = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const KK_MINOR = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

const PC_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]; // natural minor

export interface Key {
  tonic: number; // pitch class 0..11
  mode: "major" | "minor";
  correlation: number; // best Pearson r
  name: string; // e.g. "D major"
}

export interface Chord {
  root: number; // pitch class
  quality: string; // "maj7" | "m7" | "7" | "dim" | "m7b5" ...
  name: string; // e.g. "Bm7"
  notes: number[]; // voiced MIDI notes (3–4)
  bass: number; // bass MIDI note
  degree: number; // scale degree index 0..6
}

interface Candidate {
  degree: number;
  root: number;
  quality: string;
  name: string;
  tones: number[]; // pitch classes
}

/** Pearson correlation between two equal-length arrays. */
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
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

const TRIAD = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dim: [0, 3, 6],
};

// Functional preference per scale degree (tonic-function chords favoured).
const MAJOR_PREF = [1.0, 0.5, 0.4, 0.9, 0.95, 0.82, 0.32];
const MINOR_PREF = [1.0, 0.35, 0.62, 0.85, 0.9, 0.78, 0.55];

// Per-degree triad quality within each mode.
const MAJOR_QUAL = ["maj", "min", "min", "maj", "maj", "min", "dim"];
// Harmonic-minor flavour: major dominant (V) with a leading tone.
const MINOR_QUAL = ["min", "dim", "maj", "min", "maj", "maj", "maj"];

function buildCandidates(tonic: number, mode: "major" | "minor"): Candidate[] {
  const scale = mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  const quals = mode === "major" ? MAJOR_QUAL : MINOR_QUAL;
  const out: Candidate[] = [];
  for (let deg = 0; deg < 7; deg++) {
    const root = (tonic + scale[deg]) % 12;
    const q = quals[deg];
    // Raise the dominant's third in minor (harmonic minor) so V is truly major.
    const intervals =
      q === "maj" ? TRIAD.major : q === "min" ? TRIAD.minor : TRIAD.dim;
    const triad = intervals.map((iv) => (root + iv) % 12);
    // Diatonic seventh: two scale steps above the fifth.
    const seventhDeg = (deg + 6) % 7;
    const seventh = (tonic + scale[seventhDeg]) % 12;
    const tones = [...triad, seventh];
    const quality = seventhLabel(q, root, seventh);
    out.push({
      degree: deg,
      root,
      quality,
      name: PC_NAMES[root] + qualitySuffix(quality),
      tones,
    });
  }
  return out;
}

function seventhLabel(triadQ: string, root: number, seventh: number): string {
  const iv = ((seventh - root) % 12 + 12) % 12;
  if (triadQ === "maj") return iv === 11 ? "maj7" : iv === 10 ? "7" : "maj";
  if (triadQ === "min") return iv === 10 ? "m7" : "min";
  // diminished triad
  return iv === 10 ? "m7b5" : "dim";
}

function qualitySuffix(quality: string): string {
  switch (quality) {
    case "maj":
      return "";
    case "min":
      return "m";
    case "maj7":
      return "maj7";
    case "m7":
      return "m7";
    case "7":
      return "7";
    case "dim":
      return "dim";
    case "m7b5":
      return "m7b5";
    default:
      return "";
  }
}

/** Voice the chord tones near a target register, minimizing motion from prev. */
function voiceChord(tones: number[], prev: number[]): number[] {
  const center = 62; // ~D4
  const voiced: number[] = [];
  for (let i = 0; i < tones.length; i++) {
    const pc = tones[i];
    const anchor = prev.length > i ? prev[i] : center;
    // Place this pitch class in the octave whose note sits nearest the anchor.
    const note = pc + Math.round((anchor - pc) / 12) * 12;
    voiced.push(Math.max(48, Math.min(84, note)));
  }
  return voiced;
}

function voiceLeadCost(a: number[], b: number[]): number {
  if (b.length === 0) return 0;
  let cost = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) cost += Math.abs(a[i] - b[i]);
  return cost;
}

const HALF_LIFE = 2.4; // seconds — histogram memory
const KEY_EVAL_INTERVAL = 0.2; // seconds between key re-evaluations
const MIN_CHORD_HOLD = 1.5; // seconds — hysteresis floor
const STRONG_MARGIN = 0.9; // score margin that overrides the hold

export class HarmonyEngine {
  private hist = new Array<number>(12).fill(0.001);
  private lastSungPc = 0;
  private lastSungMidi = 62;
  private keyEvalAccum = 0;

  key: Key = { tonic: 0, mode: "major", correlation: 0, name: "C major" };
  chord: Chord | null = null;
  stability = 0;
  chordChangePulse = 0;

  private lastChordChange = 0;
  private now = 0;

  /** Feed a confident, continuous pitch into the decaying histogram. */
  feed(midi: number, weight: number, dt: number): void {
    const decay = Math.pow(0.5, dt / HALF_LIFE);
    for (let i = 0; i < 12; i++) this.hist[i] *= decay;
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    // Weight by confidence and duration — sustained notes count more.
    this.hist[pc] += weight * dt * 8;
    this.lastSungPc = pc;
    this.lastSungMidi = midi;
  }

  /** Decay only (called on unvoiced frames so the memory keeps fading). */
  decayOnly(dt: number): void {
    const decay = Math.pow(0.5, dt / HALF_LIFE);
    for (let i = 0; i < 12; i++) this.hist[i] *= decay;
  }

  tick(dt: number): void {
    this.now += dt;
    this.chordChangePulse *= Math.pow(0.5, dt / 0.5);

    this.keyEvalAccum += dt;
    if (this.keyEvalAccum < KEY_EVAL_INTERVAL) return;
    this.keyEvalAccum = 0;

    this.evaluateKey();
    this.evaluateChord();
  }

  private evaluateKey(): void {
    let bestR = -Infinity;
    let bestTonic = 0;
    let bestMode: "major" | "minor" = "major";
    for (let tonic = 0; tonic < 12; tonic++) {
      const majProfile = KK_MAJOR.map((_, i) => KK_MAJOR[(i - tonic + 12) % 12]);
      const minProfile = KK_MINOR.map((_, i) => KK_MINOR[(i - tonic + 12) % 12]);
      const rMaj = pearson(this.hist, majProfile);
      const rMin = pearson(this.hist, minProfile);
      if (rMaj > bestR) {
        bestR = rMaj;
        bestTonic = tonic;
        bestMode = "major";
      }
      if (rMin > bestR) {
        bestR = rMin;
        bestTonic = tonic;
        bestMode = "minor";
      }
    }
    this.key = {
      tonic: bestTonic,
      mode: bestMode,
      correlation: bestR,
      name: `${PC_NAMES[bestTonic]} ${bestMode}`,
    };
    // Stability = smoothed correlation strength (0..1-ish).
    const target = Math.max(0, Math.min(1, (bestR + 0.2) / 1.0));
    this.stability += (target - this.stability) * 0.3;
  }

  private evaluateChord(): void {
    const candidates = buildCandidates(this.key.tonic, this.key.mode);
    const pref = this.key.mode === "major" ? MAJOR_PREF : MINOR_PREF;
    const prevVoicing = this.chord ? this.chord.notes : [];

    const scoreOf = (c: Candidate): number => {
      let s = pref[c.degree];
      // Harmonize the sung note: strongly prefer chords containing it.
      if (c.tones.includes(this.lastSungPc)) s += 0.7;
      // Extra reward if the sung note is the chord root or third (consonant).
      if (this.lastSungPc === c.root) s += 0.15;
      // Leading-tone pull toward tonic: if the singer is on scale degree 7,
      // favour the dominant (degree 4) which contains and resolves it.
      const voiced = voiceChord(c.tones, prevVoicing);
      s -= 0.015 * voiceLeadCost(voiced, prevVoicing);
      return s;
    };

    let best: Candidate = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
      const sc = scoreOf(c);
      if (sc > bestScore) {
        bestScore = sc;
        best = c;
      }
    }

    if (this.chord === null) {
      this.commitChord(best, prevVoicing);
      return;
    }

    // Hysteresis: keep the current chord unless the hold has elapsed, or a new
    // choice is *strongly* better than continuing the current one.
    const currentAsCandidate = candidates.find(
      (c) => c.root === this.chord!.root && c.degree === this.chord!.degree,
    );
    const currentScore = currentAsCandidate
      ? scoreOf(currentAsCandidate)
      : -Infinity;

    const heldLongEnough = this.now - this.lastChordChange > MIN_CHORD_HOLD;
    const stronglyBetter = bestScore - currentScore > STRONG_MARGIN;
    const sameChord = best.root === this.chord.root && best.degree === this.chord.degree;

    if (!sameChord && (heldLongEnough || stronglyBetter)) {
      this.commitChord(best, prevVoicing);
    }
  }

  private commitChord(c: Candidate, prevVoicing: number[]): void {
    const notes = voiceChord(c.tones, prevVoicing);
    const bass = c.root + 36; // low register root
    this.chord = {
      root: c.root,
      quality: c.quality,
      name: c.name,
      notes,
      bass,
      degree: c.degree,
    };
    this.lastChordChange = this.now;
    this.chordChangePulse = 1;
  }

  /** Normalized sung pitch height 0..1 across the practical vocal range. */
  pitchHeight(): number {
    return Math.max(0, Math.min(1, (this.lastSungMidi - 48) / 36));
  }

  /** Tonic position around the circle of fifths, mapped to 0..1. */
  circleOfFifthsPosition(): number {
    // Index of the tonic in the circle of fifths (C, G, D, A, ...).
    const cof = (this.key.tonic * 7) % 12;
    return cof / 12;
  }
}

export { PC_NAMES };
