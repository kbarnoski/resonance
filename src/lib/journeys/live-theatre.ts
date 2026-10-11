// LIVE THEATRE world picking (Karel 2026-10-11): while he plays the Nord the
// kiosk wanders the WHOLE catalogue, a new world every ~2.5 min, never
// repeating one it showed recently. Pure — tested in live-theatre.test.ts.
import type { InstallationProgram, SequenceEntry } from "@/components/audio/installation-loop-client";

/** One world's screen time before the next (ms). */
export const LIVE_SCENE_MS = 150_000;
/** The dip to / from black between worlds (ms) — slow, never abrupt. */
export const LIVE_VEIL_MS = 2_800;
/** Held black while the next world's handoff settles (ms). */
export const LIVE_DARK_HOLD_MS = 3_500;

/** Mastered EP worlds stay with their own tracks (Snowflake's arc, Ghost's
 *  angel flashes on bass cues) — never borrowed for a live collage. */
const EXCLUDED = new Set(["first-snow", "ghost"]);

/** Every distinct playable world across the programs (one per journey id). */
export function liveWorldPool(programs: InstallationProgram[]): SequenceEntry[] {
  const seen = new Set<string>();
  const out: SequenceEntry[] = [];
  for (const p of programs) {
    for (const e of p.sequence) {
      if (!e.track || EXCLUDED.has(e.journey.id) || seen.has(e.journey.id)) continue;
      seen.add(e.journey.id);
      out.push(e);
    }
  }
  return out;
}

/** The next world: random, avoiding the most recent ones (up to 12, or
 *  fewer when the pool is small). Null on an empty pool. */
export function pickLiveWorld(pool: SequenceEntry[], history: string[], rand: () => number): SequenceEntry | null {
  if (pool.length === 0) return null;
  const avoid = new Set(history.slice(-Math.min(12, Math.max(0, pool.length - 1))));
  const fresh = pool.filter((e) => !avoid.has(e.journey.id));
  const from = fresh.length > 0 ? fresh : pool;
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))];
}
