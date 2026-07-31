// ─────────────────────────────────────────────────────────────────────────────
// store.ts — the finite reserve, persisted across sessions.
//
// The scarcity mechanic lives here: ONE number, the count of strikes the whole
// instrument has left, ever. It is written to localStorage so it survives
// reloads and revisits — the persistence IS the stake. If localStorage is
// blocked (private mode, etc.) we fall back to an in-memory count for the
// session and the caller surfaces a note.
// ─────────────────────────────────────────────────────────────────────────────

export const RESERVE_KEY = "resonance-4440-vow";
export const RESERVE_TOTAL = 108; // a mala's worth of strikes — never more at once

export interface ReserveHandle {
  /** Strikes remaining. */
  count: number;
  /** True when we could NOT persist and are running in-memory only. */
  ephemeral: boolean;
}

function readRaw(): number | null {
  try {
    const v = window.localStorage.getItem(RESERVE_KEY);
    if (v === null) return null;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.min(n, RESERVE_TOTAL);
  } catch {
    return null;
  }
}

function writeRaw(n: number): boolean {
  try {
    window.localStorage.setItem(RESERVE_KEY, String(n));
    return true;
  } catch {
    return false;
  }
}

/** Load the reserve. Fresh visitors start with a full mala (108). */
export function loadReserve(): ReserveHandle {
  const existing = readRaw();
  if (existing === null) {
    const ok = writeRaw(RESERVE_TOTAL);
    return { count: RESERVE_TOTAL, ephemeral: !ok };
  }
  // Confirm we can still write (detects blocked storage even when a value exists).
  const ok = writeRaw(existing);
  return { count: existing, ephemeral: !ok };
}

/** Persist a new count. Returns false if storage is unavailable. */
export function saveReserve(n: number): boolean {
  return writeRaw(Math.max(0, Math.min(n, RESERVE_TOTAL)));
}
