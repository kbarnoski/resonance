// Core logic for the 5528-follow "chamber partner" prototype.
//
// A transparent, browser-native, no-training score follower: an online
// DTW / cost-grid forward tracker that estimates a live performer's
// position in a KNOWN reference score from detected pitch onsets — and
// stays with them through rubato, wrong notes, skips, and repeats.
//
// Framed as the small, legible cousin of:
//   • Matchmaker — Real-Time Piano Score Following (arXiv:2510.10087, ISMIR 2025)
//   • The ACCompanion — reactive + expressive automatic accompanist (arXiv:2304.12939)
//   • the Dannenberg (1984) / Raphael score-following lineage.
//
// No Canvas / WebGL here — pure numbers; the page renders them as SVG.

// ── deterministic PRNG ──────────────────────────────────────────────────────

/** Seeded, reproducible RNG so the synthetic performer + any jitter are
 *  identical on every load (headless review stays deterministic). */
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

// ── reference score ─────────────────────────────────────────────────────────

export type ScoreNote = {
  pitchMidi: number;
  beatStart: number;
  beatDur: number;
};

export const REFERENCE_TITLE = "Beethoven — Ode to Joy (theme)";

// pitch/duration pairs (C major; C4 = 60). Two 16-beat phrases.
const _PD: Array<[number, number]> = [
  [64, 1], [64, 1], [65, 1], [67, 1], // E E F G
  [67, 1], [65, 1], [64, 1], [62, 1], // G F E D
  [60, 1], [60, 1], [62, 1], [64, 1], // C C D E
  [64, 1.5], [62, 0.5], [62, 2], // E. D  D
  [64, 1], [64, 1], [65, 1], [67, 1], // E E F G
  [67, 1], [65, 1], [64, 1], [62, 1], // G F E D
  [60, 1], [60, 1], [62, 1], [64, 1], // C C D E
  [62, 1.5], [60, 0.5], [60, 2], // D. C  C
];

function buildScore(): ScoreNote[] {
  const out: ScoreNote[] = [];
  let beat = 0;
  for (const [pitchMidi, beatDur] of _PD) {
    out.push({ pitchMidi, beatStart: beat, beatDur });
    beat += beatDur;
  }
  return out;
}

export const REFERENCE_SCORE: ScoreNote[] = buildScore();
export const TOTAL_BEATS =
  REFERENCE_SCORE[REFERENCE_SCORE.length - 1].beatStart +
  REFERENCE_SCORE[REFERENCE_SCORE.length - 1].beatDur;

// Diatonic pad chord per bar (4 beats). Roots are MIDI; the accompanist
// voices them warmly in a low register and locks them to the follower.
export const BAR_CHORDS: Array<{ root: number; quality: "maj" | "min" }> = [
  { root: 48, quality: "maj" }, // C
  { root: 55, quality: "maj" }, // G
  { root: 48, quality: "maj" }, // C
  { root: 55, quality: "maj" }, // G
  { root: 48, quality: "maj" }, // C
  { root: 55, quality: "maj" }, // G
  { root: 53, quality: "maj" }, // F
  { root: 48, quality: "maj" }, // C
];

export function chordTones(root: number, quality: "maj" | "min"): number[] {
  const third = quality === "maj" ? 4 : 3;
  return [root, root + third, root + 7];
}

// ── pitch / note helpers ─────────────────────────────────────────────────────

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export function midiToName(midi: number): string {
  const m = Math.round(midi);
  const n = NOTE_NAMES[((m % 12) + 12) % 12];
  return `${n}${Math.floor(m / 12) - 1}`;
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Monophonic autocorrelation pitch detector (McLeod-style peak pick with
 *  parabolic refinement). Returns Hz, or 0 when the frame is too quiet /
 *  unpitched. Transparent and dependency-free. */
export function detectPitchHz(buf: Float32Array, sampleRate: number): number {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return 0;

  let d0 = 0;
  for (let i = 0; i < n; i++) d0 += buf[i] * buf[i];
  if (d0 === 0) return 0;

  const ac = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += buf[i] * buf[i + lag];
    ac[lag] = s / d0;
  }

  let minBin = 0;
  while (minBin < n - 1 && ac[minBin + 1] < ac[minBin]) minBin++;

  let maxVal = 0;
  let maxBin = -1;
  for (let i = minBin; i < n; i++) {
    if (ac[i] > maxVal) {
      maxVal = ac[i];
      maxBin = i;
    }
  }
  if (maxBin < 1 || maxVal < 0.8) return 0;

  const y0 = ac[maxBin - 1];
  const y1 = ac[maxBin];
  const y2 = ac[Math.min(n - 1, maxBin + 1)];
  const denom = 2 * (2 * y1 - y0 - y2);
  const refined = denom !== 0 ? maxBin + (y0 - y2) / denom : maxBin;

  const freq = sampleRate / refined;
  if (freq < 60 || freq > 2000) return 0;
  return freq;
}

// ── the follower engine ──────────────────────────────────────────────────────

export type FollowEventKind =
  | "match"
  | "advance"
  | "skip"
  | "repeat"
  | "wrong";

export type FollowResult = {
  est: number; // estimated current score index
  confidence: number; // 0..1
  spb: number; // seconds per beat (live tempo estimate)
  belief: number[]; // normalized belief 0..1 per score index
  kind: FollowEventKind;
  detail: string; // human-readable log line
  detectedMidi: number;
  emission: number; // emission cost at the chosen index (mismatch magnitude)
};

/**
 * Online cost-grid position tracker.
 *
 * Belief over positions is held as an accumulated `cost[j]` array (lower =
 * more likely). Each detected onset runs one DTW-style relaxation:
 *
 *   cost'[j] = emission(pitch, score[j]) + min_i( cost[i] + transition(i, j) )
 *
 * `transition` prefers advancing by one note, tolerates staying put (a
 * repeated note / held wrong note), permits forward jumps (skips) and
 * backward jumps (repeats) at higher cost. `emission` rewards an exact
 * pitch, forgives an octave, mildly forgives a near-neighbour (a fumble),
 * and strongly penalises a far miss — but never blocks, so a wrong note
 * costs a little and the tracker keeps its place instead of derailing.
 */
export class FollowerEngine {
  private score: ScoreNote[];
  private cost: number[];
  est = 0;
  confidence = 0;
  spb = 0.55; // ~109 BPM prior
  belief: number[]; // normalized belief 0..1 per score index (for display)
  private lastMatchT = -1;
  private lastMatchBeat = 0;
  private started = false;
  ribbon: Array<{ t: number; beat: number }> = [];

  constructor(score: ScoreNote[]) {
    this.score = score;
    this.cost = score.map((_, i) => (i === 0 ? 0 : 0.4 * i));
    this.belief = score.map((_, i) => (i === 0 ? 1 : 0));
  }

  reset() {
    this.cost = this.score.map((_, i) => (i === 0 ? 0 : 0.4 * i));
    this.belief = this.score.map((_, i) => (i === 0 ? 1 : 0));
    this.est = 0;
    this.confidence = 0;
    this.spb = 0.55;
    this.lastMatchT = -1;
    this.lastMatchBeat = 0;
    this.started = false;
    this.ribbon = [];
  }

  private emission(detMidi: number, target: number): number {
    const diff = Math.abs(Math.round(detMidi) - target);
    if (diff === 0) return 0;
    if (diff % 12 === 0) return 0.35; // octave error (common in autocorrelation)
    if (diff <= 2) return 0.85; // neighbour fumble / wrong note nearby
    return 1.7; // far miss
  }

  private transition(i: number, j: number): number {
    const d = j - i;
    if (d === 1) return 0; // expected advance
    if (d === 0) return 0.55; // stay (trill / held / repeated note)
    if (d === 2) return 0.5; // small skip (grace/ornament)
    if (d > 2) return 0.4 * (d - 1); // skip ahead
    // backward jump (repeat) — allowed; tuned so an EXACT backward match
    // (emission 0) beats a forward fumble (emission ≥0.85), while a forward
    // EXACT match still always wins in clean playing.
    return 0.4 + 0.35 * -d;
  }

  observe(detMidi: number, tSec: number): FollowResult {
    const N = this.score.length;
    const prevEst = this.est;
    const next = new Array<number>(N);

    if (!this.started) {
      // Cold start: anchor the first note to the front of the score with a
      // soft position prior instead of the transition DP — otherwise two
      // identical opening notes (E E) let the frontier read one ahead.
      for (let j = 0; j < N; j++)
        next[j] = this.emission(detMidi, this.score[j].pitchMidi) + 0.3 * j;
      this.started = true;
    } else {
      for (let j = 0; j < N; j++) {
        const em = this.emission(detMidi, this.score[j].pitchMidi);
        let best = Infinity;
        for (let i = 0; i < N; i++) {
          const c = this.cost[i] + this.transition(i, j);
          if (c < best) best = c;
        }
        next[j] = em + best;
      }
    }

    // normalise (subtract min) so costs never blow up and repeats stay reachable
    let mn = Infinity;
    for (let j = 0; j < N; j++) if (next[j] < mn) mn = next[j];
    for (let j = 0; j < N; j++) next[j] -= mn;
    this.cost = next;

    // estimate = argmin
    let est = 0;
    let bestC = Infinity;
    let secondC = Infinity;
    for (let j = 0; j < N; j++) {
      if (next[j] < bestC) {
        secondC = bestC;
        bestC = next[j];
        est = j;
      } else if (next[j] < secondC) {
        secondC = next[j];
      }
    }
    this.est = est;
    this.confidence = Math.max(0, Math.min(1, (secondC - bestC) / 1.2));

    // belief = softmax(-cost)
    const belief = new Array<number>(N);
    let z = 0;
    for (let j = 0; j < N; j++) {
      belief[j] = Math.exp(-next[j] * 1.6);
      z += belief[j];
    }
    if (z > 0) for (let j = 0; j < N; j++) belief[j] /= z;
    this.belief = belief;

    const emissionChosen = this.emission(detMidi, this.score[est].pitchMidi);
    const d = est - prevEst;

    // live tempo estimate — only on a confident forward advance
    if (d > 0 && emissionChosen < 0.5) {
      const dScoreBeat =
        this.score[est].beatStart - this.score[prevEst].beatStart;
      if (this.lastMatchT >= 0 && dScoreBeat > 0) {
        const dReal = tSec - this.lastMatchT;
        if (dReal > 0.03) {
          const inst = dReal / dScoreBeat;
          this.spb = Math.max(0.2, Math.min(1.5, this.spb * 0.55 + inst * 0.45));
        }
      }
      this.lastMatchT = tSec;
      this.lastMatchBeat = this.score[est].beatStart;
    } else if (this.lastMatchT < 0) {
      this.lastMatchT = tSec;
      this.lastMatchBeat = this.score[est].beatStart;
    }

    this.ribbon.push({ t: tSec, beat: this.score[est].beatStart });
    if (this.ribbon.length > 120) this.ribbon.shift();

    // classify the event for the log
    let kind: FollowEventKind = "match";
    let detail = "match";
    if (emissionChosen >= 0.8) {
      kind = "wrong";
      detail = `wrong note ignored (${midiToName(detMidi)}≠${midiToName(
        this.score[est].pitchMidi
      )})`;
    } else if (d >= 3) {
      kind = "skip";
      detail = `skip detected +${d}`;
    } else if (d <= -2) {
      kind = "repeat";
      detail = `repeat matched −${-d}`;
    } else if (d === 1) {
      kind = "advance";
      detail = `advance → bar ${Math.floor(this.score[est].beatStart / 4) + 1}`;
    }

    return {
      est,
      confidence: this.confidence,
      spb: this.spb,
      belief,
      kind,
      detail,
      detectedMidi: Math.round(detMidi),
      emission: emissionChosen,
    };
  }
}

// ── seeded synthetic performer ───────────────────────────────────────────────

export type PerfEvent = {
  t: number; // onset time in seconds (at base tempo, with rubato baked in)
  midi: number; // pitch actually played
  scoreIdx: number; // the note the soloist *intends* (ground truth, unseen)
  label?: string; // hint for the demo ("rushes", "wrong", "skip", "repeat")
};

/**
 * "Plays" the reference score with deliberate, visible expressive
 * deviations so the piece self-demos hands-free through all four hard
 * cases: rubato, one wrong note, one skip-ahead, one repeated phrase.
 */
export function buildSyntheticPerformance(seed = 0x5528): {
  events: PerfEvent[];
  duration: number;
} {
  const rand = mulberry32(seed);
  const S = REFERENCE_SCORE;

  // visit list of score indices with optional pitch override + label
  type Visit = { idx: number; midi?: number; label?: string };
  const visits: Visit[] = [];
  for (let i = 0; i < S.length; i++) {
    // skip-ahead: soloist jumps over notes 6 & 7
    if (i === 6 || i === 7) continue;
    if (i === 8) visits.push({ idx: 8, label: "skip" });
    else if (i === 10)
      // wrong note: fumbles a semitone below the written pitch (a genuine
      // off-key note, not another score pitch) — the follower should ignore
      // it and hold its place.
      visits.push({ idx: 10, midi: S[10].pitchMidi - 1, label: "wrong" });
    else visits.push({ idx: i });

    // repeat: after playing the third-phrase cadence (indices 20..23),
    // the soloist repeats those four notes before moving on.
    if (i === 23) {
      for (const r of [20, 21, 22, 23])
        visits.push({ idx: r, label: r === 20 ? "repeat" : undefined });
    }
  }

  const spbBase = 0.5; // ~120 BPM baseline
  const events: PerfEvent[] = [];
  let t = 0.6; // small lead-in
  for (let k = 0; k < visits.length; k++) {
    const v = visits[k];
    const note = S[v.idx];
    // rubato: smooth phrase-level push/pull + phrase-final ritardando + jitter
    const phrasePos = (note.beatStart % 16) / 16;
    let factor = 1 + 0.16 * Math.sin(phrasePos * Math.PI * 2);
    if (phrasePos > 0.8) factor *= 1.18; // breathe at phrase ends
    factor *= 0.94 + rand() * 0.12; // seeded human jitter
    if (v.label === "repeat" || (k > 0 && visits[k - 1].label === "repeat"))
      factor *= 1.12; // linger through the repeat
    events.push({
      t,
      midi: v.midi ?? note.pitchMidi,
      scoreIdx: v.idx,
      label: v.label,
    });
    t += note.beatDur * spbBase * factor;
  }
  return { events, duration: t + 0.8 };
}

// ── the accompanist (Web Audio) ──────────────────────────────────────────────

/**
 * A restrained chamber accompanist: warm triangle/sine pad chords + a soft
 * bass pulse, through a compressor/limiter, master gain ≤ 0.22. It is
 * driven entirely by the follower's estimated beat + tempo, so it audibly
 * speeds up, slows down, and waits with the soloist.
 */
export class Accompanist {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  muted = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.18;
    this.master = ctx.createGain();
    this.master.gain.value = 0.2;
    this.comp.connect(this.master).connect(ctx.destination);
  }

  private voice(
    midi: number,
    dur: number,
    type: OscillatorType,
    peak: number
  ) {
    if (this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = midiToFreq(midi);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(this.comp);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  /** Warm pad chord — one bar long, relative to current tempo. */
  chord(root: number, quality: "maj" | "min", spb: number) {
    const dur = Math.max(0.6, Math.min(2.4, spb * 4 * 0.9));
    const tones = chordTones(root, quality);
    tones.forEach((m, i) => this.voice(m + 12, dur, "triangle", 0.05 - i * 0.006));
  }

  /** Soft bass pulse on the beat. */
  bass(root: number, spb: number) {
    this.voice(root - 12, Math.max(0.25, spb * 0.9), "sine", 0.09);
  }

  /** A gentle bell to mark the soloist's detected onset (feedback). */
  ping(midi: number) {
    this.voice(midi + 12, 0.18, "sine", 0.035);
  }

  setMuted(m: boolean) {
    this.muted = m;
  }

  dispose() {
    try {
      this.master.disconnect();
      this.comp.disconnect();
    } catch {
      /* already torn down */
    }
  }
}
