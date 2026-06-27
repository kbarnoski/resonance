// engine.ts — the stateful, long-form counterpoint generator.
//
// The engine holds a piece-state object (current key, active voices, which
// transforms have fired, section, elapsed beats). Each call to step() may:
//   - advance the section arc (Exposition → Episode → Modulation → Stretto
//     → Coda → loop with key drift),
//   - choose & narrate a named contrapuntal operation (seeded, weighted by
//     section),
//   - and emit note events for 2–4 voices, where each voice's pitch is
//     chosen by the Fux scorer.
//
// It does NOT touch Web Audio or the DOM. It returns plain note events that
// the audio scheduler and the WebGL renderer both consume.

import {
  Key,
  Motif,
  OpName,
  applyAnswerReal,
  applyAnswerTonal,
  applyAugmentation,
  applyDiminution,
  applyInversion,
  applyRetrograde,
  applyTranspose,
  degreeToMidi,
  makeKey,
  makeRng,
  midiToDegree,
  pickWeighted,
  relatedKeys,
  Rng,
} from "./theory";
import { chooseBest, ScoreContext } from "./scorer";

export type Section =
  | "Exposition"
  | "Episode"
  | "Modulation"
  | "Stretto"
  | "Coda";

export interface NoteEvent {
  voice: number; // 0 = bass .. n-1 = soprano
  midi: number;
  startBeat: number;
  durBeats: number;
}

export interface TransformFlash {
  op: OpName;
  detail: string; // e.g. "→ G major" or "voice 3"
  atBeat: number;
}

interface Voice {
  octave: number; // register anchor
  lowBound: number;
  highBound: number;
  lastMidi: number | null;
  prevMidi: number | null;
}

export interface EngineState {
  key: Key;
  section: Section;
  sectionBeat: number; // beats elapsed within current section
  totalBeat: number;
  cycle: number; // how many full arcs completed (drives key drift)
  voiceCount: number;
  firedOps: OpName[]; // transform memory
  subject: Motif;
}

const SECTION_ORDER: Section[] = [
  "Exposition",
  "Episode",
  "Modulation",
  "Stretto",
  "Coda",
];

// Section length in beats. At ~110 BPM a beat is ~0.545s, so the whole
// cycle below is ~310s — a true long-form arc, not a short loop.
const SECTION_BEATS: Record<Section, number> = {
  Exposition: 96,
  Episode: 112,
  Modulation: 88,
  Stretto: 120,
  Coda: 80,
};

// Per-section operation weights — this is what makes minute 5 differ from
// minute 1: different sections favor different transforms, and the key
// drifts each cycle.
const OP_WEIGHTS: Record<Section, Partial<Record<OpName, number>>> = {
  Exposition: { "ANSWER (real)": 3, "ANSWER (tonal)": 3, TRANSPOSE: 2 },
  Episode: { TRANSPOSE: 3, INVERSION: 2, DIMINUTION: 2, RETROGRADE: 1 },
  Modulation: { MODULATE: 4, TRANSPOSE: 2, "ANSWER (tonal)": 1 },
  Stretto: { STRETTO: 4, AUGMENTATION: 2, INVERSION: 1 },
  Coda: { AUGMENTATION: 3, INVERSION: 1, TRANSPOSE: 1 },
};

export class CantusEngine {
  private rng: Rng;
  state: EngineState;
  private voices: Voice[];
  // a per-voice queue of pending degree/dur cells to sound
  private queues: { degree: number; dur: number }[][];
  private pendingFlash: TransformFlash | null = null;

  constructor(seed: number, subject: Motif, startKey?: Key) {
    this.rng = makeRng(seed);
    const key = startKey ?? makeKey(0, "minor"); // D-/C-minor feel by default
    const voiceCount = 3;
    this.voices = makeVoices(voiceCount);
    this.queues = Array.from({ length: voiceCount }, () => []);
    this.state = {
      key,
      section: "Exposition",
      sectionBeat: 0,
      totalBeat: 0,
      cycle: 0,
      voiceCount,
      firedOps: [],
      subject,
    };
    // Seed the exposition: subject in the lead voice, answer in the next.
    this.enqueueMotif(voiceCount - 1, subject);
    this.enqueueMotif(voiceCount - 2, applyAnswerTonal(subject), subject.length);
  }

  setSubject(subject: Motif) {
    this.state.subject = subject;
    // restart the exposition with the new subject
    this.state.section = "Exposition";
    this.state.sectionBeat = 0;
    this.queues = this.queues.map(() => []);
    this.voices.forEach((v) => {
      v.lastMidi = null;
      v.prevMidi = null;
    });
    this.enqueueMotif(this.state.voiceCount - 1, subject);
    this.enqueueMotif(
      this.state.voiceCount - 2,
      applyAnswerTonal(subject),
      subject.length,
    );
    this.pendingFlash = { op: "SUBJECT", detail: "new subject", atBeat: this.state.totalBeat };
  }

  takeFlash(): TransformFlash | null {
    const f = this.pendingFlash;
    this.pendingFlash = null;
    return f;
  }

  private enqueueMotif(voice: number, motif: Motif, offsetCells = 0) {
    // pad with rests (degree NaN) so a stretto/answer enters later
    const q = this.queues[voice];
    for (let i = 0; i < offsetCells; i++) q.push({ degree: NaN, dur: 1 });
    for (const n of motif) q.push({ degree: n.degree, dur: n.dur });
  }

  // Advance the arc by one beat-grid tick. Returns note events that START
  // at the given beat. The caller schedules these into the future.
  step(beatNow: number): NoteEvent[] {
    const st = this.state;
    const events: NoteEvent[] = [];

    // Section advance
    if (st.sectionBeat >= SECTION_BEATS[st.section]) {
      this.advanceSection();
    }

    // Occasionally fire a named operation that injects fresh material.
    // Frequency rises in busier sections.
    const fireChance =
      st.section === "Stretto" ? 0.5 : st.section === "Episode" ? 0.38 : 0.28;
    const allEmpty = this.queues.every((q) => q.length === 0);
    if (allEmpty || (this.rng() < fireChance && this.queueDepth() < 6)) {
      this.fireOperation(beatNow);
    }

    // Pull one cell from each voice's queue (if its previous note has ended).
    for (let vi = 0; vi < st.voiceCount; vi++) {
      const q = this.queues[vi];
      if (q.length === 0) continue;
      const cell = q[0];
      if (Number.isNaN(cell.degree)) {
        q.shift();
        continue; // a rest tick
      }
      const ev = this.realizeCell(vi, cell, beatNow);
      q.shift();
      if (ev) events.push(ev);
    }

    st.sectionBeat += 1;
    st.totalBeat += 1;
    return events;
  }

  private queueDepth(): number {
    return Math.max(...this.queues.map((q) => q.length), 0);
  }

  private advanceSection() {
    const st = this.state;
    const idx = SECTION_ORDER.indexOf(st.section);
    const next = SECTION_ORDER[(idx + 1) % SECTION_ORDER.length];
    st.section = next;
    st.sectionBeat = 0;
    if (next === "Exposition") {
      st.cycle += 1;
      // KEY DRIFT each cycle: move up a perfect fifth (circle of fifths),
      // alternating mode — guarantees minute 5 ≠ minute 1.
      const drift = (st.cycle * 7) % 12;
      const mode = st.cycle % 2 === 0 ? st.key.mode : flipMode(st.key.mode);
      st.key = makeKey(st.key.tonicPc + drift, mode);
      this.pendingFlash = {
        op: "MODULATE",
        detail: `cycle ${st.cycle + 1} · ${st.key.name}`,
        atBeat: st.totalBeat,
      };
      // re-seed exposition entries
      this.enqueueMotif(st.voiceCount - 1, st.subject);
      this.enqueueMotif(
        st.voiceCount - 2,
        applyAnswerTonal(st.subject),
        st.subject.length,
      );
    }
  }

  private fireOperation(beatNow: number) {
    const st = this.state;
    const weightMap = OP_WEIGHTS[st.section];
    const ops = Object.keys(weightMap) as OpName[];
    const weights = ops.map((o) => weightMap[o] ?? 1);
    const op = pickWeighted(this.rng, ops, weights);

    let material: Motif;
    let detail = "";
    const subj = st.subject;

    switch (op) {
      case "ANSWER (real)":
        material = applyAnswerReal(subj);
        detail = "at the fifth";
        break;
      case "ANSWER (tonal)":
        material = applyAnswerTonal(subj);
        detail = "tonal adjustment";
        break;
      case "INVERSION":
        material = applyInversion(subj);
        detail = "mirror";
        break;
      case "RETROGRADE":
        material = applyRetrograde(subj);
        detail = "backwards";
        break;
      case "AUGMENTATION":
        material = applyAugmentation(subj, 2);
        detail = "×2 slower";
        break;
      case "DIMINUTION":
        material = applyDiminution(subj, 0.5);
        detail = "×2 faster";
        break;
      case "TRANSPOSE": {
        const steps = [-2, 2, 3, -3, 4][Math.floor(this.rng() * 5)];
        material = applyTranspose(subj, steps);
        detail = `${steps > 0 ? "+" : ""}${steps} steps`;
        break;
      }
      case "STRETTO": {
        // Overlapping entries: enqueue subject in two voices a short
        // offset apart so they overlap.
        const vA = Math.floor(this.rng() * st.voiceCount);
        let vB = Math.floor(this.rng() * st.voiceCount);
        if (vB === vA) vB = (vB + 1) % st.voiceCount;
        this.enqueueMotif(vA, subj);
        this.enqueueMotif(vB, applyTranspose(subj, 4), 1);
        this.pendingFlash = { op, detail: "overlapping entries", atBeat: beatNow };
        st.firedOps.push(op);
        return;
      }
      case "MODULATE": {
        const cands = relatedKeys(st.key);
        const k = cands[Math.floor(this.rng() * cands.length)];
        st.key = k;
        this.pendingFlash = { op, detail: `→ ${k.name}`, atBeat: beatNow };
        st.firedOps.push(op);
        this.enqueueMotif(st.voiceCount - 1, subj);
        return;
      }
      case "SUBJECT":
      default:
        material = subj;
        break;
    }

    // Place the new material in the least-busy voice.
    const target = this.leastBusyVoice();
    this.enqueueMotif(target, material);
    this.pendingFlash = { op, detail, atBeat: beatNow };
    st.firedOps.push(op);
  }

  private leastBusyVoice(): number {
    let best = 0;
    let bestLen = Infinity;
    for (let i = 0; i < this.queues.length; i++) {
      if (this.queues[i].length < bestLen) {
        bestLen = this.queues[i].length;
        best = i;
      }
    }
    return best;
  }

  // Turn a degree/dur cell into a concrete pitch via the Fux scorer.
  private realizeCell(
    vi: number,
    cell: { degree: number; dur: number },
    beatNow: number,
  ): NoteEvent | null {
    const st = this.state;
    const v = this.voices[vi];
    const ideal = degreeToMidi(st.key, cell.degree, v.octave);

    // Build candidates: the ideal pitch plus diatonic neighbours, so the
    // scorer can nudge toward better voice-leading while staying on the
    // motif's contour.
    const idealDeg = midiToDegree(st.key, ideal, v.octave);
    const candDegrees = [idealDeg, idealDeg + 1, idealDeg - 1, idealDeg + 2, idealDeg - 2];
    const candidates = candDegrees.map((d) => degreeToMidi(st.key, d, v.octave));

    const others: number[] = [];
    const othersPrev: number[] = [];
    for (let oi = 0; oi < st.voiceCount; oi++) {
      if (oi === vi) continue;
      if (this.voices[oi].lastMidi !== null) {
        others.push(this.voices[oi].lastMidi as number);
        othersPrev.push(this.voices[oi].prevMidi ?? (this.voices[oi].lastMidi as number));
      }
    }

    const strongBeat = beatNow % 2 < 1;
    const base: Omit<ScoreContext, "candidate"> = {
      prev: v.lastMidi,
      prevPrev: v.prevMidi,
      others,
      othersPrev,
      strongBeat,
      lowBound: v.lowBound,
      highBound: v.highBound,
    };
    const chosen = chooseBest(candidates, base);

    v.prevMidi = v.lastMidi;
    v.lastMidi = chosen;

    return {
      voice: vi,
      midi: chosen,
      startBeat: beatNow,
      durBeats: cell.dur,
    };
  }
}

function makeVoices(n: number): Voice[] {
  // register layout: bass low → soprano high
  const layouts: { octave: number; low: number; high: number }[] = [
    { octave: 2, low: 36, high: 55 }, // bass
    { octave: 3, low: 48, high: 67 }, // tenor
    { octave: 4, low: 57, high: 76 }, // alto
    { octave: 5, low: 64, high: 84 }, // soprano
  ];
  return Array.from({ length: n }, (_, i) => {
    const l = layouts[Math.min(i, layouts.length - 1)];
    return {
      octave: l.octave,
      lowBound: l.low,
      highBound: l.high,
      lastMidi: null,
      prevMidi: null,
    };
  });
}

function flipMode(m: Key["mode"]): Key["mode"] {
  return m === "major" ? "minor" : "major";
}
