// ════════════════════════════════════════════════════════════════════════════
// 2672 — SOMNUS · sleep-architecture memory-consolidation engine
//
// A long-form generative organism structured as a night's sleep. A hypnogram
// walker descends Wake → N1 → N2 → N3 → REM in a realistic descending-then-
// REM-lengthening architecture (early cycles N3-heavy, late cycles REM-heavy),
// a ~90-minute cycle compressed to ~90 seconds so ~8 min ≈ 5 cycles. A memory
// bank of pitch/rhythm motifs is consolidated across the night:
//
//   WAKE / N1  — admit new motifs (the "day's experiences")
//   N2         — sleep spindles: tag recent motifs, brief shimmer bursts
//   N3 (SWS)   — REPLAY the strongest motifs (varied), STRENGTHEN them,
//                DECAY all, and FORGET the weakest (consolidation core)
//   REM        — SPLICE two motifs into a wild "dream" recombination
//
// A motif born in the first wake returns near dawn, recognisably-but-
// transformed by a night of replay-driven drift (a real recapitulation).
//
// This module is PURE (no browser APIs) so it can be run headlessly. All
// randomness flows from a single mulberry32 stream seeded from 0x2672 — two
// loads produce the same night. See README.md.
// ════════════════════════════════════════════════════════════════════════════

export const SEED = 0x2672;
export const TICK = 0.25; // engine pump interval, seconds (night time)

export type Stage = "WAKE" | "N1" | "N2" | "N3" | "REM";
export type Timbre = "wake" | "spindle" | "delta" | "dream";

/** Deterministic PRNG. Seed once; never touch Math.random/Date. */
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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface MemEvent {
  kind: "birth" | "replay" | "forget" | "recap" | "spindle" | "splice";
  t: number;
}

export interface Memory {
  id: number;
  label: string;
  origin: "wake" | "dream";
  bornAt: number;
  bornStage: Stage;
  parents: [number, number] | null;
  pitches: number[]; // current contour (Hz, free-chromatic; drifts over night)
  birthPitches: number[]; // immutable snapshot at birth
  rhythm: number[]; // durations in beats
  strength: number; // salience
  birthStrength: number;
  replays: number;
  lastReplay: number;
  forgotten: boolean;
  forgottenAt: number | null;
  events: MemEvent[];
}

export interface Note {
  at: number; // absolute night-time seconds
  freq: number;
  dur: number;
  gain: number;
  timbre: Timbre;
  detune: number; // cents
  pan: number; // -1..1
}

export type SegKind = "day" | "cycle" | "micro" | "dawn";

export interface Segment {
  stage: Stage;
  start: number;
  end: number;
  cycle: number;
  kind: SegKind;
}

interface Op {
  at: number;
  kind: "admit" | "spindle" | "consolidate" | "splice" | "recap";
  origin?: "wake";
}

// ── night architecture ──────────────────────────────────────────────────────
// Descending-then-REM-lengthening: N3 shrinks and REM grows across 5 cycles.
function buildSchedule(): { segments: Segment[]; total: number } {
  const N3 = [46, 36, 24, 14, 6];
  const REM = [8, 16, 28, 40, 52];
  const N1 = [8, 5, 5, 5, 5];
  const N2a = [22, 20, 18, 16, 14];
  const N2b = [12, 10, 10, 8, 8];
  const DAY = 20;
  const MICRO = 4;
  const DAWN = 24;

  const segs: Segment[] = [];
  let t = 0;
  const push = (stage: Stage, dur: number, cycle: number, kind: SegKind) => {
    segs.push({ stage, start: t, end: t + dur, cycle, kind });
    t += dur;
  };

  push("WAKE", DAY, -1, "day");
  for (let i = 0; i < 5; i++) {
    push("N1", N1[i], i, "cycle");
    push("N2", N2a[i], i, "cycle");
    push("N3", N3[i], i, "cycle");
    push("N2", N2b[i], i, "cycle");
    push("REM", REM[i], i, "cycle");
    if (i < 4) push("WAKE", MICRO, i, "micro");
  }
  push("WAKE", DAWN, 5, "dawn");
  return { segments: segs, total: t };
}

const STATEMENT_BEAT = 0.5; // seconds per rhythm-beat for clear statements
const DELTA_BEAT = 0.95; // slow deep replay

function timbreGain(tb: Timbre): number {
  switch (tb) {
    case "wake":
      return 0.26;
    case "delta":
      return 0.3;
    case "dream":
      return 0.2;
    case "spindle":
      return 0.13;
  }
}

export interface PullResult {
  t: number;
  stage: Stage;
  notes: Note[];
}

export class SomnusEngine {
  readonly segments: Segment[];
  readonly total: number;
  readonly memories: Memory[] = [];
  recapId: number | null = null;

  private rng: () => number;
  private pending: Note[] = [];
  private opQueue: Op[] = [];
  private tickT = 0;
  private lastSegIdx = -1;
  private memCount = 0;

  constructor(seed = SEED) {
    this.rng = mulberry32(seed);
    const { segments, total } = buildSchedule();
    this.segments = segments;
    this.total = total;
  }

  get time(): number {
    return this.tickT;
  }

  stageAt(t: number): Stage {
    const seg = this.segAt(t);
    return seg ? seg.stage : "WAKE";
  }

  segAt(t: number): Segment | null {
    if (t < 0) return this.segments[0];
    for (let i = 0; i < this.segments.length; i++) {
      if (t < this.segments[i].end) return this.segments[i];
    }
    return this.segments[this.segments.length - 1];
  }

  private segIdx(t: number): number {
    for (let i = 0; i < this.segments.length; i++) {
      if (t < this.segments[i].end) return i;
    }
    return this.segments.length - 1;
  }

  /** Advance one TICK, returning notes whose onset falls in this window. */
  pull(): PullResult {
    const t = this.tickT;
    this.enterSegments(t);

    const due: Op[] = [];
    const keep: Op[] = [];
    for (const o of this.opQueue) (o.at <= t ? due : keep).push(o);
    this.opQueue = keep;
    due.sort((a, b) => a.at - b.at);
    for (const o of due) this.fire(o, t);

    const emit: Note[] = [];
    const rem: Note[] = [];
    for (const n of this.pending) (n.at < t + TICK ? emit : rem).push(n);
    this.pending = rem;

    const stage = this.stageAt(t);
    this.tickT += TICK;
    return { t, stage, notes: emit };
  }

  /** Silently advance the whole engine to `target` (for Jump-ahead). */
  fastForwardTo(target: number): void {
    let guard = 0;
    while (this.tickT < target && guard++ < 200000) this.pull();
    this.pending = this.pending.filter((n) => n.at >= this.tickT);
  }

  // ── segment entry: schedule this segment's operations ─────────────────────
  private enterSegments(t: number): void {
    const idx = this.segIdx(t);
    if (idx <= this.lastSegIdx) return;
    for (let i = this.lastSegIdx + 1; i <= idx; i++) this.onEnter(this.segments[i]);
    this.lastSegIdx = idx;
  }

  private onEnter(seg: Segment): void {
    const dur = seg.end - seg.start;
    const at = (dt: number): number => seg.start + dt;
    switch (seg.stage) {
      case "WAKE": {
        if (seg.kind === "day") {
          const spots = [2, 5.5, 9, 12.5, 16];
          for (const s of spots) this.opQueue.push({ at: at(s), kind: "admit", origin: "wake" });
        } else if (seg.kind === "dawn") {
          this.opQueue.push({ at: at(2), kind: "recap" });
          this.opQueue.push({ at: at(12), kind: "recap" });
        } else if (this.rng() < 0.55) {
          this.opQueue.push({ at: at(1.5), kind: "admit", origin: "wake" });
        }
        break;
      }
      case "N2": {
        for (let s = 1; s < dur; s += 3) this.opQueue.push({ at: at(s), kind: "spindle" });
        break;
      }
      case "N3": {
        for (let s = 1; s < dur; s += 4) this.opQueue.push({ at: at(s), kind: "consolidate" });
        break;
      }
      case "REM": {
        for (let s = 2; s < dur; s += 13) this.opQueue.push({ at: at(s), kind: "splice" });
        break;
      }
      case "N1":
        break;
    }
  }

  private fire(op: Op, t: number): void {
    switch (op.kind) {
      case "admit":
        this.admit(t, this.stageAt(t));
        break;
      case "spindle":
        this.spindle(t);
        break;
      case "consolidate":
        this.consolidate(t);
        break;
      case "splice":
        this.splice(t);
        break;
      case "recap":
        this.recap(t);
        break;
    }
  }

  // ── WAKE / N1: admit a fresh motif (a day's experience) ───────────────────
  private admit(t: number, stage: Stage): Memory {
    const r = this.rng;
    const n = 4 + Math.floor(r() * 4); // 4..7 notes
    let p = 200 * Math.pow(2, r() * 1.2); // ~200..460 Hz start (free-chromatic)
    const pitches: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const leap = r() < 0.2 ? (r() * 2 - 1) * 0.9 : (r() * 2 - 1) * 0.32;
        p = clamp(p * Math.pow(2, leap), 130, 680);
      }
      pitches.push(p);
    }
    const rhythm = pitches.map(() => [0.5, 0.75, 1, 1, 1.5][Math.floor(r() * 5)]);
    const strength = 0.55 + r() * 0.2;
    const m: Memory = {
      id: this.memCount,
      label: `M${this.memCount + 1}`,
      origin: "wake",
      bornAt: t,
      bornStage: stage,
      parents: null,
      pitches: [...pitches],
      birthPitches: [...pitches],
      rhythm,
      strength,
      birthStrength: strength,
      replays: 0,
      lastReplay: t,
      forgotten: false,
      forgottenAt: null,
      events: [{ kind: "birth", t }],
    };
    this.memCount++;
    this.memories.push(m);
    this.enqueueContour(m, t, "wake", 0);
    return m;
  }

  // ── N2: sleep spindles — tag recent motifs, brief shimmer burst ───────────
  private spindle(t: number): void {
    const active = this.memories
      .filter((m) => !m.forgotten)
      .sort((a, b) => b.bornAt - a.bornAt);
    const tagged = active.slice(0, 3);
    for (const m of tagged) {
      m.strength = Math.min(2.2, m.strength + 0.04);
      m.events.push({ kind: "spindle", t });
    }
    if (tagged.length) {
      const m = tagged[0];
      m.pitches.forEach((p, i) => {
        this.pending.push({
          at: t + i * 0.06,
          freq: clamp(p * 4, 200, 3200),
          dur: 0.12,
          gain: timbreGain("spindle"),
          timbre: "spindle",
          detune: 0,
          pan: (this.rng() * 2 - 1) * 0.6,
        });
      });
    }
  }

  // ── N3 (slow-wave): the consolidation core ────────────────────────────────
  private consolidate(t: number): void {
    const active = this.memories.filter((m) => !m.forgotten);
    if (!active.length) return;
    for (const m of active) m.strength *= 0.90; // global decay
    const sorted = [...active].sort((a, b) => b.strength - a.strength);
    const topK = sorted.slice(0, 3);
    let delay = 0;
    for (const m of topK) {
      this.driftPitches(m); // reconsolidation: replayed slightly varied
      m.strength = Math.min(2.2, m.strength + 0.18);
      m.replays++;
      m.lastReplay = t;
      m.events.push({ kind: "replay", t });
      this.enqueueContour(m, t + delay, "delta", -1); // deep, an octave down
      delay += m.pitches.length * DELTA_BEAT * 0.6 + 0.5;
    }
    // forget the weakest — but never a top-K motif or the strongest wake motif,
    // and always keep at least 3 alive so the night has something to replay.
    const protectedId = this.strongestWakeId();
    const forgettable = sorted
      .filter((m) => m.id !== protectedId && !topK.includes(m))
      .reverse(); // weakest first
    let aliveCount = active.length;
    for (const m of forgettable) {
      if (aliveCount <= 3) break;
      if (m.strength >= 0.26) break; // ascending — the rest are stronger
      m.forgotten = true;
      m.forgottenAt = t;
      m.events.push({ kind: "forget", t });
      aliveCount--;
    }
  }

  private driftPitches(m: Memory): void {
    const r = this.rng;
    const g = Math.pow(2, (r() * 2 - 1) * 0.03); // coherent contour drift ±~3%
    m.pitches = m.pitches.map((p) => {
      let np = p * g * Math.pow(2, (r() * 2 - 1) * 0.02);
      if (r() < 0.15) np *= Math.pow(2, (r() * 2 - 1) * 0.08); // occasional distortion
      return clamp(np, 120, 700);
    });
  }

  // ── REM: splice two motifs into a wild dream recombination ────────────────
  private splice(t: number): void {
    const active = this.memories.filter((m) => !m.forgotten && m.strength > 0.2);
    if (active.length < 2) return;
    const A = this.pickWeighted(active);
    let B = this.pickWeighted(active);
    let guard = 0;
    while (B === A && guard++ < 8) B = this.pickWeighted(active);
    if (B === A) return;

    const r = this.rng;
    const half = Math.ceil(A.pitches.length / 2);
    const child = [
      ...A.pitches.slice(0, half),
      ...B.pitches.slice(Math.floor(B.pitches.length / 2)),
    ];
    // wild bending — non-integer ratios; clashing intervals allowed.
    const bent = child.map((p) => {
      if (r() < 0.5) p *= [1.03, 0.965, 1.5, 0.75, 1.335][Math.floor(r() * 5)];
      return clamp(p, 120, 760);
    });
    const rhythm = bent.map(() => [0.5, 0.75, 1][Math.floor(r() * 3)]);
    const strength = 0.5; // dreams start faint — most fade before morning
    const m: Memory = {
      id: this.memCount,
      label: `D${this.memCount + 1}`,
      origin: "dream",
      bornAt: t,
      bornStage: "REM",
      parents: [A.id, B.id],
      pitches: [...bent],
      birthPitches: [...bent],
      rhythm,
      strength,
      birthStrength: strength,
      replays: 0,
      lastReplay: t,
      forgotten: false,
      forgottenAt: null,
      events: [
        { kind: "birth", t },
        { kind: "splice", t },
      ],
    };
    this.memCount++;
    this.memories.push(m);
    this.enqueueContour(m, t, "dream", 0);
  }

  // ── dawn: recapitulate the strongest surviving wake motif (transformed) ────
  private recap(t: number): void {
    const wake = this.memories
      .filter((m) => m.origin === "wake" && !m.forgotten)
      .sort((a, b) => b.strength - a.strength);
    if (!wake.length) return;
    const m = wake[0];
    m.strength = Math.min(2.5, m.strength + 0.15);
    m.events.push({ kind: "recap", t });
    this.recapId = m.id;
    this.enqueueContour(m, t, "wake", 0);
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  private enqueueContour(m: Memory, startT: number, timbre: Timbre, oct: number): void {
    const beat = timbre === "delta" ? DELTA_BEAT : STATEMENT_BEAT;
    let d = 0;
    m.pitches.forEach((p, i) => {
      const rb = m.rhythm[i] ?? 1;
      const dur = rb * beat * (timbre === "delta" ? 1.6 : 0.9);
      this.pending.push({
        at: startT + d,
        freq: clamp(p * Math.pow(2, oct), 30, 3200),
        dur,
        gain: timbreGain(timbre),
        timbre,
        detune: timbre === "dream" ? (this.rng() * 2 - 1) * 35 : 0,
        pan: (this.rng() * 2 - 1) * 0.4,
      });
      d += rb * beat + (timbre === "delta" ? 0.35 : 0.06);
    });
  }

  private pickWeighted(list: Memory[]): Memory {
    let total = 0;
    for (const m of list) total += m.strength;
    let x = this.rng() * total;
    for (const m of list) {
      x -= m.strength;
      if (x <= 0) return m;
    }
    return list[list.length - 1];
  }

  private strongestWakeId(): number {
    let best: Memory | null = null;
    for (const m of this.memories) {
      if (m.origin !== "wake" || m.forgotten) continue;
      if (!best || m.strength > best.strength) best = m;
    }
    return best ? best.id : -1;
  }
}

// ── night-clock label: t in [0,total] → 23:00 .. 07:00 ────────────────────────
export function nightClock(t: number, total: number): string {
  const frac = clamp(t / total, 0, 1);
  const mins = 23 * 60 + frac * 8 * 60; // 23:00 + 8h
  const hh = Math.floor(mins / 60) % 24;
  const mm = Math.floor(mins % 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
