// ─────────────────────────────────────────────────────────────────────────────
// 16896-strata · strataStore.ts
//
// The PERSISTENT MEDIUM. Every listening of one of Karel's tracks lays down a
// tiny SEDIMENT record, keyed per track id, that survives the browser session.
// Returning to a track re-forms the full accreted column from all past visits.
//
// Storage is IndexedDB (object store keyed by trackId, holding an array of
// session summaries), with a localStorage fallback when IndexedDB is missing or
// blocked (private windows, etc). Records are deliberately tiny (<1KB): a
// timestamp, listened seconds, a short sampled sequence of dominant chord
// pitch-classes, a minor-tension fraction, mean/peak RMS, and a 16-float
// spectral signature. NO raw audio is ever stored. The newest ~60 sessions per
// track are kept so the store can never bloat.
// ─────────────────────────────────────────────────────────────────────────────

/** One remembered listening — the atom of the sediment column. Kept <1KB. */
export interface StrataSession {
  /** Session start timestamp (ms). Stable id used for in-place checkpoint upsert. */
  id: number;
  /** Last-updated timestamp (ms) — when this record was last checkpointed. */
  t: number;
  /** Actual seconds of audio listened this session. */
  secs: number;
  /** Dominant chord pitch-classes (0..11) sampled across the session (≤24). */
  hues: number[];
  /** Fraction of sampled chords that read as minor/diminished (0..1). */
  minor: number;
  /** Mean analyser RMS over the session (0..1-ish). */
  meanRms: number;
  /** Peak analyser RMS over the session. */
  peakRms: number;
  /** Coarse 16-band spectral signature, averaged over the session (0..1). */
  sig: number[];
}

interface ColumnDoc {
  trackId: string;
  sessions: StrataSession[];
}

const DB_NAME = "resonance-strata";
const STORE = "columns";
const DB_VERSION = 1;
/** Keep only the newest N sessions per track so storage never bloats. */
export const SESSION_CAP = 60;

function hasIDB(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "trackId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

function lsKey(trackId: string): string {
  return `resonance-strata:${trackId}`;
}

function loadLs(trackId: string): StrataSession[] {
  try {
    const raw = localStorage.getItem(lsKey(trackId));
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as StrataSession[]) : [];
  } catch {
    return [];
  }
}

function saveLs(trackId: string, sessions: StrataSession[]): void {
  try {
    localStorage.setItem(lsKey(trackId), JSON.stringify(sessions));
  } catch {
    /* quota / disabled — nothing else we can do */
  }
}

function sortAsc(sessions: StrataSession[]): StrataSession[] {
  return sessions.slice().sort((a, b) => a.id - b.id);
}

/** Load every remembered session for a track, oldest → newest. */
export async function loadStrata(trackId: string): Promise<StrataSession[]> {
  if (hasIDB()) {
    try {
      const db = await openDb();
      const doc = await new Promise<ColumnDoc | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const rq = tx.objectStore(STORE).get(trackId);
        rq.onsuccess = () => resolve(rq.result as ColumnDoc | undefined);
        rq.onerror = () => reject(rq.error);
      });
      db.close();
      return sortAsc(doc?.sessions ?? []);
    } catch {
      /* fall through to localStorage */
    }
  }
  return sortAsc(loadLs(trackId));
}

/**
 * Insert or update one session (matched by `id`) and persist. Returns the full,
 * capped, sorted session list so the caller can re-form the column immediately.
 * A single record is checkpointed repeatedly during playback, so a hard reload
 * mid-listen still preserves the stratum laid down so far.
 */
export async function upsertSession(
  trackId: string,
  session: StrataSession,
): Promise<StrataSession[]> {
  const existing = await loadStrata(trackId);
  const idx = existing.findIndex((s) => s.id === session.id);
  if (idx >= 0) existing[idx] = session;
  else existing.push(session);
  const sorted = sortAsc(existing);
  const capped = sorted.slice(Math.max(0, sorted.length - SESSION_CAP));

  if (hasIDB()) {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({ trackId, sessions: capped } as ColumnDoc);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      return capped;
    } catch {
      /* fall through to localStorage */
    }
  }
  saveLs(trackId, capped);
  return capped;
}

/** Erase all remembered strata for one track (used by the "clear column" action). */
export async function clearStrata(trackId: string): Promise<void> {
  if (hasIDB()) {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(trackId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    localStorage.removeItem(lsKey(trackId));
  } catch {
    /* ignore */
  }
}

/** Round to keep records tiny before persisting. */
export function roundSig(v: number): number {
  return Math.round(v * 1000) / 1000;
}
