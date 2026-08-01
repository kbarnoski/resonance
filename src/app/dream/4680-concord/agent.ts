// ─────────────────────────────────────────────────────────────────────────────
// 4680 · concord — agent.ts
//
// THE QUESTION: What if your duet partner WANTED something different than you —
// and the music were the negotiation between two wills, where you might never
// agree?
//
// This module is the hand-rolled SYMBOLIC negotiation agent (NO machine
// learning). The partner holds its OWN musical intention — a home pitch-center
// and a preferred melodic contour a real interval away from yours — and each
// turn DECIDES, legibly, whether to CONCEDE toward you or HOLD its ground.
//
// Determinism: a single inlined mulberry32 stream (seed 0x4680). No Math.random,
// no Date. Per-turn variation comes from successive rng() draws, so the whole
// negotiation replays identically. Timing lives in the React layer (rAF only).
//
// See "Co-policy" (arXiv:2606.19914): human–AI musical control as iterative
// negotiation. GAP vs. that work: Co-policy's agent SERVES the human's intent;
// this partner holds a COMPETING intention and can refuse.
// ─────────────────────────────────────────────────────────────────────────────

/** Inlined mulberry32 — deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Musical space ────────────────────────────────────────────────────────────
// Everything lives in diatonic scale-DEGREE space, so pitches stay consonant-
// enough; the TENSION is the two different centers, not atonality.
const ROOT_MIDI = 55; // G3 — degree 0 of the shared major scale
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** Diatonic degree (any int, may span octaves) → MIDI note. */
export function degreeToMidi(d: number): number {
  const oct = Math.floor(d / 7);
  const idx = ((d % 7) + 7) % 7;
  return ROOT_MIDI + 12 * oct + MAJOR[idx];
}

/** MIDI → frequency (Hz). */
export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// ── Intentions ───────────────────────────────────────────────────────────────
const YOU_HOME = 0; // your line sits low
const PARTNER_HOME = 4; // partner wants to live a fifth up — a real distance
const MAX_GAP = 5;

/** Your gentle rising arch; center is what you (or the script) steer. */
export const YOU_CONTOUR = [0, 1, 2, 1];
/** The partner's OWN, distinct line — the shape it restates when it holds. */
const PARTNER_OWN = [0, 2, 1, 3];

// ── Agent temperament ────────────────────────────────────────────────────────
const STUBBORN = 0.62; // how hard the partner digs in
const BASE = 0.34; // baseline willingness to meet you
const RECIP = 0.4; // tit-for-tat: it softens when YOU just moved toward it
const PATIENCE = 0.55; // pressure to resolve grows across a cycle
const VAR = 0.55; // seeded temperamental variation

const RESOLVE_TURNS = 6;
const MAX_TURNS = 8;
const AGREE = 0.86;
export const WINDOW = 9; // turns kept in the visible score

export type Glyph = "↑" | "↓" | "—" | "↕";
export type Outcome = "ongoing" | "agreed" | "standoff";
export type DuetEvent = "turn" | "cadence" | "standoff";

export interface TurnRecord {
  turn: number;
  cycle: number;
  youCenter: number;
  partnerCenter: number;
  youNotes: number[]; // MIDI
  partnerNotes: number[]; // MIDI
  decision: "concede" | "hold";
  glyph: Glyph;
  agreement: number;
  live: boolean;
}

export interface Snapshot {
  history: TurnRecord[]; // most recent WINDOW turns, oldest→newest
  latest: TurnRecord;
  agreement: number;
  outcome: Outcome;
  event: DuetEvent;
  cycle: number;
  turnInCycle: number;
  live: boolean;
  holdMs: number; // how long the caller should wait before the next turn
  cadenceMidi: number; // shared center to ring on agreement
  youCenterMidi: number; // for standoff beating
  partnerCenterMidi: number;
}

function phraseNotes(center: number, contour: number[]): number[] {
  return contour.map((o) => degreeToMidi(center + o));
}

function blendContour(a: number[], b: number[], alpha: number): number[] {
  return a.map((v, i) => Math.round(v + (b[i] - v) * alpha));
}

function ornament(base: number[], r: number): number[] {
  // Restate own line with a tiny seeded flourish on one note.
  const out = base.slice();
  const k = Math.floor(r * out.length) % out.length;
  out[k] += r > 0.5 ? 1 : -1;
  return out;
}

function contourDist(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);
}

/**
 * ConcordDuet — the turn-by-turn negotiation. Call step() once per turn; pass a
 * `liveCenter` (a scale degree) when a real human is steering, or null to let
 * the deterministic scripted "human" play both parts for the self-demo.
 */
export class ConcordDuet {
  private rng: () => number;
  private cycle = 0;
  private turnInCycle = 0;
  private prevYou = YOU_HOME;
  private partnerCenter = PARTNER_HOME;
  private partnerContour = PARTNER_OWN.slice();
  private cycleWill = 0.5; // scripted human's willingness this cycle
  private pendingReset = false;
  private history: TurnRecord[] = [];
  private turnCounter = 0;

  constructor(seed = 0x4680) {
    this.rng = mulberry32(seed);
    this.cycleWill = this.rng();
  }

  /** Scripted "human": climbs from home toward the partner by cycleWill. */
  private scriptedCenter(): number {
    const progress = Math.min(1, (this.turnInCycle / RESOLVE_TURNS) * 1.4);
    const target = YOU_HOME + this.cycleWill * (PARTNER_HOME - YOU_HOME);
    return Math.round(YOU_HOME + (target - YOU_HOME) * progress);
  }

  private reset(): void {
    this.cycle += 1;
    this.turnInCycle = 0;
    this.prevYou = YOU_HOME;
    this.partnerCenter = PARTNER_HOME;
    this.partnerContour = PARTNER_OWN.slice();
    this.cycleWill = this.rng();
  }

  step(liveCenter: number | null): Snapshot {
    if (this.pendingReset) {
      this.reset();
      this.pendingReset = false;
    }
    this.turnInCycle += 1;
    this.turnCounter += 1;

    const live = liveCenter !== null;
    const youCenter = live
      ? Math.max(-1, Math.min(PARTNER_HOME + 2, Math.round(liveCenter)))
      : this.scriptedCenter();

    // Did YOU move toward the partner (upward) since last turn?
    const youMoved = youCenter > this.prevYou;

    // ── The DECISION — concede toward you, or hold your ground? ──────────────
    const gap = this.partnerCenter - youCenter;
    const progress = this.turnInCycle / RESOLVE_TURNS;
    const r = this.rng();
    const concedeScore =
      BASE +
      (youMoved ? RECIP : 0) +
      progress * PATIENCE -
      STUBBORN +
      (r - 0.5) * VAR;

    let decision: "concede" | "hold";
    if (gap !== 0 && concedeScore > 0) {
      // CONCEDE: step its center toward yours, bend its line toward yours.
      this.partnerCenter -= Math.sign(gap);
      this.partnerContour = blendContour(this.partnerContour, YOU_CONTOUR, 0.45);
      decision = "concede";
    } else {
      // HOLD: restate its OWN line (with a small seeded flourish). Dig in.
      this.partnerContour = ornament(PARTNER_OWN, r);
      decision = "hold";
    }

    // Who gave ground this turn?
    let glyph: Glyph;
    if (decision === "concede") glyph = youMoved ? "↕" : "↓";
    else glyph = youMoved ? "↑" : "—";

    // ── Agreement meter (0..1): shared center + shared shape ─────────────────
    const centerAgree = 1 - Math.min(1, Math.abs(this.partnerCenter - youCenter) / MAX_GAP);
    const contourAgree = 1 - Math.min(1, contourDist(this.partnerContour, YOU_CONTOUR) / 8);
    const agreement = 0.72 * centerAgree + 0.28 * contourAgree;

    const youNotes = phraseNotes(youCenter, YOU_CONTOUR);
    const partnerNotes = phraseNotes(this.partnerCenter, this.partnerContour);

    const record: TurnRecord = {
      turn: this.turnCounter,
      cycle: this.cycle,
      youCenter,
      partnerCenter: this.partnerCenter,
      youNotes,
      partnerNotes,
      decision,
      glyph,
      agreement,
      live,
    };
    this.history.push(record);
    if (this.history.length > WINDOW) this.history.shift();
    this.prevYou = youCenter;

    // ── Resolve the cycle? Agreement is NOT guaranteed and NOT always the goal;
    //    a sustained standoff is a valid, even beautiful, end state. ──────────
    let outcome: Outcome = "ongoing";
    let event: DuetEvent = "turn";
    let holdMs = 380;
    if (agreement >= AGREE) {
      outcome = "agreed";
      event = "cadence";
      holdMs = 1000;
      this.pendingReset = true;
    } else if (this.turnInCycle >= MAX_TURNS) {
      outcome = "standoff";
      event = "standoff";
      holdMs = 1000;
      this.pendingReset = true;
    }

    // Shared center to ring at a cadence = meet-in-the-middle pitch.
    const midDegree = Math.round((youCenter + this.partnerCenter) / 2);

    return {
      history: this.history.slice(),
      latest: record,
      agreement,
      outcome,
      event,
      cycle: this.cycle,
      turnInCycle: this.turnInCycle,
      live,
      holdMs,
      cadenceMidi: degreeToMidi(midDegree),
      youCenterMidi: degreeToMidi(youCenter),
      partnerCenterMidi: degreeToMidi(this.partnerCenter),
    };
  }
}

/** Keyboard degree map (a s d f g h j k) → your line's center, low→high. */
export const KEY_DEGREES: { key: string; degree: number }[] = [
  { key: "a", degree: -1 },
  { key: "s", degree: 0 },
  { key: "d", degree: 1 },
  { key: "f", degree: 2 },
  { key: "g", degree: 3 },
  { key: "h", degree: 4 },
  { key: "j", degree: 5 },
  { key: "k", degree: 6 },
];
