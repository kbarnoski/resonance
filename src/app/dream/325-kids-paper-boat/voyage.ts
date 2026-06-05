/**
 * Voyage state machine + persistence + path memory for the Paper Boat.
 *
 * The voyage is a long-form (target ~12 min, demoable much faster) journey
 * that advances on wall-clock elapsed time. It moves through the ACTS defined
 * in audio.ts (Campbell's departure → initiation → return). The child's path
 * (which gates / lanes were passed) is recorded so that at the river's mouth
 * the voyage can sing itself back. Progress + path persist to localStorage so
 * reopening resumes where it left off.
 */

import { ACTS } from "./audio";

const STORAGE_KEY = "resonance:dream:325-kids-paper-boat:v1";

// Total voyage length. Kept generous for the long-form ambition but the act
// boundaries are proportional, so even a short demo crosses real harmonic
// territory. (See README "what's unverified".)
export const VOYAGE_MS = 12 * 60 * 1000; // 12 minutes to dawn/home

// One memory entry = a gate the child passed.
export interface MemoryNote {
  t: number; // elapsed ms when played
  midi: number; // pitch played (already quantized to the act mode)
  lane: number; // which lane / register
  act: number; // act index at the time
}

export interface VoyageState {
  startedAt: number; // wall-clock ms (Date.now) of first start
  elapsedMs: number; // accumulated elapsed time across sessions
  path: MemoryNote[]; // remembered gates
  finished: boolean; // reached home/dawn
}

export function freshState(): VoyageState {
  return { startedAt: Date.now(), elapsedMs: 0, path: [], finished: false };
}

export function loadState(): VoyageState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VoyageState>;
    if (
      typeof parsed.elapsedMs !== "number" ||
      !Array.isArray(parsed.path)
    ) {
      return null;
    }
    return {
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : Date.now(),
      elapsedMs: Math.max(0, Math.min(VOYAGE_MS, parsed.elapsedMs)),
      path: parsed.path.slice(-400) as MemoryNote[], // cap memory length
      finished: Boolean(parsed.finished),
    };
  } catch {
    return null;
  }
}

export function saveState(s: VoyageState): void {
  if (typeof window === "undefined") return;
  try {
    // keep the most recent gates only, so storage stays small
    const trimmed: VoyageState = { ...s, path: s.path.slice(-400) };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* storage full / unavailable — degrade silently, keep playing */
  }
}

export function clearState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Voyage progress 0..1 from elapsed time. */
export function progress(elapsedMs: number): number {
  return Math.max(0, Math.min(1, elapsedMs / VOYAGE_MS));
}

/** Which act we are in (0..ACTS.length-1) for a given progress 0..1, plus the
 *  fractional position within the act (0..1) for smooth hue blending. */
export function actAtProgress(p: number): { index: number; frac: number } {
  const n = ACTS.length;
  const scaled = Math.max(0, Math.min(0.9999, p)) * n;
  const index = Math.floor(scaled);
  const frac = scaled - index;
  return { index: Math.min(n - 1, index), frac };
}

/** Blend two act hues for a smooth dusk → night → dawn sky. */
export function hueAtProgress(p: number): number {
  const { index, frac } = actAtProgress(p);
  const a = ACTS[index].hue;
  const b = ACTS[Math.min(ACTS.length - 1, index + 1)].hue;
  // shortest-path hue interpolation
  let diff = b - a;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (a + diff * frac + 360) % 360;
}

/** Sky darkness 0 (bright) .. 1 (deep night) over the arc — dips at midnight,
 *  rises toward dawn. */
export function darknessAtProgress(p: number): number {
  // dusk(0)=0.4 → deep night(~0.45)=1 → dawn(1)=0.15
  if (p < 0.45) return 0.4 + (p / 0.45) * 0.6;
  return 1 - ((p - 0.45) / 0.55) * 0.85;
}
