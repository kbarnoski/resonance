// LIVE THEATRE world picking (Karel 2026-10-11): while he plays the Nord the
// kiosk wanders the WHOLE catalogue, a new world every ~2.5 min, never
// repeating one it showed recently. Pure — tested in live-theatre.test.ts.
import type { InstallationProgram, SequenceEntry } from "@/components/audio/installation-loop-client";
import { isExcludedWorld } from "./live-set";

/** One world's screen time before the next (ms). */
export const LIVE_SCENE_MS = 150_000;
/** The dip to / from black between worlds (ms) — slow, never abrupt. */
export const LIVE_VEIL_MS = 2_800;
/** Held black while the next world's handoff settles (ms). */
export const LIVE_DARK_HOLD_MS = 3_500;
/** The song title card between a set's songs (journeyIntroAnim, ms). */
export const LIVE_SONG_TITLE_MS = 8_500;

/** Mastered EP worlds stay with their own tracks (Snowflake's arc, Ghost's
 *  angel flashes on bass cues) — never borrowed for a live collage. QA
 *  2026-10-15: the id check alone let their DB copies (and any world built on
 *  their pack stills) and Horses through — the live set's full exclusion
 *  (isExcludedWorld) applies here too. One world per NAME as well: a builtin
 *  and its DB copy are the same world and must never play back to back. */
/** Every distinct playable world across the programs (one per journey id / name). */
export function liveWorldPool(programs: InstallationProgram[]): SequenceEntry[] {
  const seen = new Set<string>();
  const out: SequenceEntry[] = [];
  for (const p of programs) {
    for (const e of p.sequence) {
      const name = `name:${(e.journey.name ?? "").trim().toLowerCase()}`;
      if (!e.track || isExcludedWorld(e.journey) || seen.has(e.journey.id) || (name !== "name:" && seen.has(name))) continue;
      seen.add(e.journey.id);
      seen.add(name);
      out.push(e);
    }
  }
  return out;
}

/** The next world: random, avoiding the most recent ones (up to 12, or
 *  fewer when the pool is small). Null on an empty pool. */
export function pickLiveWorld(pool: SequenceEntry[], history: string[], rand: () => number): SequenceEntry | null {
  if (pool.length === 0) return null;
  // WIDE OPEN (Karel 2026-10-16: "joseph's and the live mode are the massive
  // wide open diverse ones. so i shouldnt see the same thing over ever"): no
  // world — nor another copy of it under the same name — returns until every
  // other world has had its turn
  const recent = history.slice(-Math.max(0, pool.length - 1));
  const avoid = new Set(recent);
  const avoidNames = new Set(pool.filter((e) => avoid.has(e.journey.id)).map((e) => (e.journey.name ?? "").toLowerCase()));
  const fresh = pool.filter((e) => !avoid.has(e.journey.id) && !avoidNames.has((e.journey.name ?? "").toLowerCase()));
  const from = fresh.length > 0 ? fresh : pool;
  return from[Math.min(from.length - 1, Math.floor(rand() * from.length))];
}
/** A live set's end → the Resonance Theatre title card this long → the set again (ms). */
export const SET_TITLE_CARD_MS = 12_000;
