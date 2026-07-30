// ─────────────────────────────────────────────────────────────────────────────
// sequencer.ts — the contact-aware metric grid (pure logic, no DOM / no audio).
//
// The core idea borrowed from MotionBeat (ICASSP 2026): a bodily *contact* is
// the natural carrier of a beat, distinct from continuous motion. Here every
// detected strike is a contact; we quantise its instant onto a fixed bar grid.
// Land inside the tolerance window and the contact LOCKS into the looping
// pattern; land outside and it is rejected as a flam/ghost. This module owns the
// grid maths and the loop store; page.tsx wires it to camera + audio + WebGL.
// ─────────────────────────────────────────────────────────────────────────────

export const SLOTS_PER_BAR = 8; // eighth-note grid over a 4/4 bar
export const BEATS_PER_BAR = 4;
export const LIMBS = 4; // L-hand, R-hand, L-foot, R-foot

export interface Grid {
  bpm: number;
  beatPeriod: number; // seconds per quarter note
  barPeriod: number; // seconds per bar
  slotPeriod: number; // seconds per eighth-note slot
}

export function makeGrid(bpm: number): Grid {
  const beatPeriod = 60 / bpm;
  const barPeriod = beatPeriod * BEATS_PER_BAR;
  const slotPeriod = barPeriod / SLOTS_PER_BAR;
  return { bpm, beatPeriod, barPeriod, slotPeriod };
}

export interface QuantizeResult {
  slot: number; // nearest slot index 0..SLOTS_PER_BAR-1
  errorSec: number; // signed timing error (contact - slot centre), seconds
  errorFrac: number; // errorSec / slotPeriod, in [-0.5, 0.5]
  onGrid: boolean; // within the tolerance window?
  barFrac: number; // where in the bar the contact actually landed, 0..1
}

/**
 * Quantise a contact time to the grid.
 * @param barTime elapsed-time-modulo-barPeriod, in seconds, in [0, barPeriod).
 * @param grid    the active grid.
 * @param tolSec  half-width of the "on grid" window, in seconds.
 */
export function quantize(
  barTime: number,
  grid: Grid,
  tolSec: number,
): QuantizeResult {
  const slotFloat = barTime / grid.slotPeriod;
  const nearestRaw = Math.round(slotFloat);
  const errorSec = (slotFloat - nearestRaw) * grid.slotPeriod;
  const slot = ((nearestRaw % SLOTS_PER_BAR) + SLOTS_PER_BAR) % SLOTS_PER_BAR;
  const errorFrac = errorSec / grid.slotPeriod;
  return {
    slot,
    errorSec,
    errorFrac,
    onGrid: Math.abs(errorSec) <= tolSec,
    barFrac: barTime / grid.barPeriod,
  };
}

export interface LoopCell {
  strength: number; // 0..1 hit velocity captured at lock time
  age: number; // bars since last reinforced (for gentle decay/legibility)
}

/**
 * The looping pattern store. A sparse SLOTS_PER_BAR × LIMBS grid of locked
 * contacts, plus a monotonic slot cursor so playback triggers each locked cell
 * exactly once per pass.
 */
export class Loop {
  // index = slot * LIMBS + limb  → cell | null
  private cells: (LoopCell | null)[] = new Array(SLOTS_PER_BAR * LIMBS).fill(
    null,
  );
  private lastSlotCursor = -1;

  private idx(slot: number, limb: number): number {
    return slot * LIMBS + limb;
  }

  /** Lock a contact into the pattern. Returns the cell that now lives there. */
  lock(slot: number, limb: number, strength: number): LoopCell {
    const cell: LoopCell = { strength: Math.max(0.15, strength), age: 0 };
    this.cells[this.idx(slot, limb)] = cell;
    return cell;
  }

  cell(slot: number, limb: number): LoopCell | null {
    return this.cells[this.idx(slot, limb)];
  }

  /** Clear the whole pattern. */
  clear(): void {
    this.cells.fill(null);
  }

  /** Remove the most-recently-passed slot's contacts for a given limb, if any. */
  clearLimb(limb: number): void {
    for (let s = 0; s < SLOTS_PER_BAR; s++) {
      this.cells[this.idx(s, limb)] = null;
    }
  }

  count(): number {
    let n = 0;
    for (const c of this.cells) if (c) n++;
    return n;
  }

  /**
   * Advance the playback cursor to `elapsed` and return every locked cell whose
   * slot boundary was crossed since the last call. Also reports slot metadata so
   * the caller can click the metronome. Drives both audio playback and the
   * visual pulse — one authoritative place, so sound and light never drift.
   */
  advance(
    elapsed: number,
    grid: Grid,
  ): {
    slot: number;
    isBeat: boolean;
    isDownbeat: boolean;
    hits: { limb: number; strength: number }[];
  }[] {
    const target = Math.floor(elapsed / grid.slotPeriod);
    const out: {
      slot: number;
      isBeat: boolean;
      isDownbeat: boolean;
      hits: { limb: number; strength: number }[];
    }[] = [];
    // Guard against huge catch-ups after a tab was backgrounded.
    if (this.lastSlotCursor < 0) this.lastSlotCursor = target - 1;
    if (target - this.lastSlotCursor > SLOTS_PER_BAR * 4) {
      this.lastSlotCursor = target - 1;
    }
    while (this.lastSlotCursor < target) {
      this.lastSlotCursor++;
      const slot =
        ((this.lastSlotCursor % SLOTS_PER_BAR) + SLOTS_PER_BAR) %
        SLOTS_PER_BAR;
      const hits: { limb: number; strength: number }[] = [];
      for (let limb = 0; limb < LIMBS; limb++) {
        const c = this.cells[this.idx(slot, limb)];
        if (c) {
          hits.push({ limb, strength: c.strength });
          c.age = 0;
        }
      }
      out.push({
        slot,
        isBeat: slot % 2 === 0,
        isDownbeat: slot === 0,
        hits,
      });
    }
    return out;
  }

  /** Snapshot for the renderer: which (slot,limb) cells are live + strength. */
  snapshot(): { slot: number; limb: number; strength: number }[] {
    const out: { slot: number; limb: number; strength: number }[] = [];
    for (let s = 0; s < SLOTS_PER_BAR; s++) {
      for (let l = 0; l < LIMBS; l++) {
        const c = this.cells[this.idx(s, l)];
        if (c) out.push({ slot: s, limb: l, strength: c.strength });
      }
    }
    return out;
  }
}

/**
 * A rolling "groove lock" score in 0..1. Rises as strikes land on-grid, falls
 * on flams and idle time. This is the stakes readout: a tight groove is earned
 * by good timing and lost by sloppy timing.
 */
export class GrooveMeter {
  private value = 0;

  get score(): number {
    return this.value;
  }

  onHit(onGrid: boolean, errorFrac: number): void {
    if (onGrid) {
      // Reward is sharper the closer to the slot centre.
      const acc = 1 - Math.min(1, Math.abs(errorFrac) / 0.5);
      this.value = Math.min(1, this.value + 0.14 + acc * 0.16);
    } else {
      this.value = Math.max(0, this.value - 0.22);
    }
  }

  /** Passive decay per second when nothing is being played tightly. */
  decay(dt: number): void {
    this.value = Math.max(0, this.value - dt * 0.045);
  }
}
