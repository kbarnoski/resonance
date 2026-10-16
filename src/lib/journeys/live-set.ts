// LIVE SET planning (Tramokyo 2026-10-15, the Joseph set): a set of someone
// else's tracks plays AUDIBLY in order while Live Theatre wanders Karel's own
// local worlds, driven by that audio. Pure — tested in live-set.test.ts.
//
// Karel: "use imaging shaders and particles systems from what we already have
// local … youll ignore all ghost and snowflake imaging though."
import type { Journey } from "./types";
import { josephSet, type JosephTrack } from "./joseph-set";

/** A world as Live Theatre holds it (structurally a SequenceEntry). */
export interface SetWorld {
  journey: Journey;
  track: unknown;
}

/** Per-track analysis written by scripts/import-joseph-set.ts. */
export interface SetTrackAnalysis {
  id: string;
  duration: number;
  arc?: "calm" | "steady" | "building" | "intense";
  sections?: { start: number; end: number; energy?: "low" | "mid" | "high" }[];
}

export const LIVE_SETS: Record<string, () => JosephTrack[]> = { joseph: () => josephSet() };

/** Fade out → gap → next track (ms). Gentle, never a cut. */
export const SET_FADE_OUT_MS = 3_000;
export const SET_GAP_MS = 1_500;
export const SET_FADE_IN_MS = 1_200;
/** World-change spacing inside a track (s): never sooner, never later. */
export const SET_MIN_SCENE_S = 40;
export const SET_MAX_SCENE_S = 150;

// ─── Exclusions ───────────────────────────────────────────────────────────
// Snowflake + Ghost, by builtin id, by their DB copies' ids/names, and by any
// world whose imagery comes from their pack folders. Bird worlds (Yellow
// Bird's signature flight) only for a track that asks for birds; Horses out
// (Karel cut them from Rise Above, animals wait until after the event).
const MASTERED_IDS = new Set([
  "ghost", "first-snow",
  "9eb3df10-7835-4107-b995-4c9ad6f2edf1", // Ghost (DB)
  "1895014a-ce59-4640-aa23-b9421b588d70", // Snowflake (DB)
]);
const MASTERED_NAME = /^\s*(ghost|snowflake|first snow)\b/i;
const MASTERED_MEDIA = /\/(ghost|first-snow|9eb3df10-7835-4107-b995-4c9ad6f2edf1|1895014a-ce59-4640-aa23-b9421b588d70)\//;
const BIRD_NAME = /yellow\s*bird/i;
const NEVER_NAME = /^\s*horses\b/i;

export function isExcludedWorld(j: Pick<Journey, "id" | "name"> & { localImageUrls?: string[] }): boolean {
  if (MASTERED_IDS.has(j.id) || MASTERED_NAME.test(j.name ?? "") || NEVER_NAME.test(j.name ?? "")) return true;
  return (j.localImageUrls ?? []).some((u) => MASTERED_MEDIA.test(u));
}

/** The worlds a set may use: no Snowflake/Ghost, no birds unless asked. */
export function setWorldPool<W extends SetWorld>(pool: W[], track?: Pick<JosephTrack, "birds">): W[] {
  return pool.filter((w) => w.track && !isExcludedWorld(w.journey) && (track?.birds || !BIRD_NAME.test(w.journey.name ?? "")));
}

// ─── Matching ─────────────────────────────────────────────────────────────
/** A world's own words: its name, description and every imagery prompt. */
export function worldText(j: Journey): string {
  const parts: string[] = [j.name ?? "", j.description ?? ""];
  for (const p of j.phases ?? []) {
    parts.push(p.aiPrompt ?? "");
    for (const s of p.aiPromptSequence ?? []) parts.push(s);
  }
  return parts.join(" \n ").toLowerCase();
}

const INTENSE = ["fire", "flame", "storm", "lightning", "blaze", "surge", "erupt", "vortex", "inferno", "molten", "thunder", "burst", "explod", "torrent", "roar"];
const CALM = ["mist", "still", "quiet", "soft", "gentle", "haze", "hush", "calm", "sparse", "faint", "dew", "tranquil", "silence"];

function hits(text: string, word: string): number {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
  return Math.min(10, (text.match(re) ?? []).length);
}

/** + = fiery/stormy imagery, − = misty/still. */
export function worldIntensity(text: string): number {
  return INTENSE.reduce((a, w) => a + Math.sqrt(hits(text, w)), 0) - CALM.reduce((a, w) => a + Math.sqrt(hits(text, w)), 0);
}

export interface RankedWorld<W> { world: W; score: number; intensity: number }

/** The pool ranked for one track: its words in the worlds' prompts, tilted
 *  by the music's arc (intense/building music leans to fiercer imagery). */
export function rankWorlds<W extends SetWorld>(track: JosephTrack, arc: SetTrackAnalysis["arc"], pool: W[]): RankedWorld<W>[] {
  const tilt = arc === "intense" ? 0.25 : arc === "building" ? 0.1 : arc === "calm" ? -0.25 : 0;
  return setWorldPool(pool, track)
    .map((world) => {
      const text = worldText(world.journey);
      const intensity = worldIntensity(text);
      const score = track.words.reduce((a, w) => a + Math.sqrt(hits(text, w.toLowerCase())), 0) + tilt * intensity;
      return { world, score, intensity };
    })
    .sort((a, b) => b.score - a.score || a.world.journey.id.localeCompare(b.world.journey.id));
}

/** When the worlds change inside a track (s from its start): the analysed
 *  section boundaries, at least SET_MIN_SCENE_S apart, never a scene longer
 *  than SET_MAX_SCENE_S (split evenly), never in the last 30 s. Each with the
 *  energy of the music it opens on. The track start (0) is always first. */
export function worldChangeTimes(a: Pick<SetTrackAnalysis, "duration" | "sections">): { at: number; energy: "low" | "mid" | "high" }[] {
  const dur = Math.max(1, a.duration);
  const secs = (a.sections ?? []).filter((s) => s.end > s.start).sort((x, y) => x.start - y.start);
  const energyAt = (t: number) => secs.filter((s) => s.start <= t + 0.01).at(-1)?.energy ?? "mid";
  const marks = [0];
  for (const s of secs) {
    if (s.start - marks[marks.length - 1] >= SET_MIN_SCENE_S && dur - s.start >= 30) marks.push(s.start);
  }
  const out: number[] = [];
  const all = [...marks, dur];
  for (let i = 0; i < all.length - 1; i++) {
    const span = all[i + 1] - all[i];
    const parts = Math.max(1, Math.ceil(span / SET_MAX_SCENE_S));
    for (let k = 0; k < parts; k++) {
      const t = all[i] + (span * k) / parts;
      if (k === 0 || dur - t >= 30) out.push(Math.round(t * 10) / 10);
    }
  }
  return out.map((at) => ({ at, energy: energyAt(at) }));
}

export interface PlannedScene<W> { at: number; energy: "low" | "mid" | "high"; world: W }

/** How much a passage's energy tilts the pick toward fiercer (+) or stiller
 *  (−) imagery. A tilt, never a filter: the match to the track leads. */
const ENERGY_BIAS = { high: 0.35, mid: 0, low: -0.15 } as const;

/** The worlds for one track, decided at its start. It OPENS on its best
 *  match (unless that world is the one on screen right now); later passages
 *  take the best remaining match, tilted by the music's energy there. No
 *  world twice in a track; `recent` (the worlds just shown) are avoided after
 *  the opening. Lab 2026-10-15: a hard energy filter + long recency had The
 *  burning bush open on a redwood grove — matching must lead. */
export function planTrackWorlds<W extends SetWorld>(
  track: JosephTrack,
  analysis: SetTrackAnalysis | null,
  pool: W[],
  recent: string[],
): PlannedScene<W>[] {
  const times = worldChangeTimes(analysis ?? { duration: track.duration, sections: [] });
  const ranked = rankWorlds(track, analysis?.arc, pool);
  if (ranked.length === 0) return [];
  const top = ranked.slice(0, Math.min(ranked.length, Math.max(6, times.length + 3)));
  const onScreen = recent[recent.length - 1];
  const avoid = new Set(recent);
  const used = new Set<string>();
  const usedNames = new Set<string>(); // the builtin + DB copies of one world share a name
  const nm = (r: RankedWorld<W>) => (r.world.journey.name ?? "").toLowerCase();
  return times.map(({ at, energy }, i) => {
    const id = (r: RankedWorld<W>) => r.world.journey.id;
    const ok = (r: RankedWorld<W>) => !used.has(id(r)) && !usedNames.has(nm(r)) && (i === 0 ? id(r) !== onScreen : !avoid.has(id(r)));
    const value = (r: RankedWorld<W>) => (i === 0 ? r.score : r.score + ENERGY_BIAS[energy] * r.intensity);
    const best = (list: RankedWorld<W>[]) => list.reduce<RankedWorld<W> | null>((m, r) => (m && value(m) >= value(r) ? m : r), null);
    const pick =
      best(top.filter(ok)) ??
      best(ranked.filter(ok)) ??
      best(ranked.filter((r) => !used.has(id(r)))) ??
      top[0];
    used.add(id(pick));
    usedNames.add(nm(pick));
    return { at, energy, world: pick.world };
  });
}

// ─── Where a world is entered ───────────────────────────────────────────
/** WHERE in its journey a world opens (0-1 of its clock track). Karel
 *  2026-10-16: "as with other sets you keep the same definitions rules and
 *  diversity in all elements including particles changing color to imaging …
 *  shaders and imaging". Entering every world at 0 showed only openings — the
 *  sparse beat, the opening emblem, the first shader — never the body where the
 *  imaging, the particles' imaging colours and the evolving shaders live. A
 *  world now opens where its journey matches the music: quiet → its early
 *  sparse part, mid → its body, high → its build. Never the opening emblem
 *  (< 0.08) or the finale (> 0.8). Unknown energy (plain live, spare worlds):
 *  anywhere in the body. */
export const WORLD_ENTRY = {
  low: [0.08, 0.3],
  mid: [0.3, 0.55],
  high: [0.55, 0.78],
  any: [0.12, 0.7],
} as const;
export function worldEntryFraction(energy: "low" | "mid" | "high" | null | undefined, rand: () => number = Math.random): number {
  const [lo, hi] = WORLD_ENTRY[energy ?? "any"];
  return lo + (hi - lo) * Math.max(0, Math.min(1, rand()));
}

// ─── Commands (phone) ───────────────────────────────────────────────────
export type LiveSetCommand =
  | { type: "start"; set: string; at: number }
  | { type: "world" };

/** "liveset:joseph" (track 1) · "liveset:joseph@9" (track 9, 1-based) ·
 *  "liveset:world" (next world, same track). Null for anything else. */
export function parseLiveSetCommand(cmd: string): LiveSetCommand | null {
  if (cmd === "liveset:world") return { type: "world" };
  const m = /^liveset:([a-z0-9-]+)(?:@(\d{1,3}))?$/.exec(cmd);
  if (!m || !LIVE_SETS[m[1]]) return null;
  const n = m[2] ? Number(m[2]) : 1;
  const count = LIVE_SETS[m[1]]().length;
  return { type: "start", set: m[1], at: Math.min(Math.max(1, n), Math.max(1, count)) };
}
