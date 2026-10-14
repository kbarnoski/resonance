// SHADER BALANCE — loop-wide diversity laws for every shader cast
// (Karel 2026-10-12/13, watching the kiosk loop):
//  - "you also seem to use that amber web shader [magma] and that amber 3d
//    moving plane shader [parsec] a lot" / "there ya go using that amber web
//    shader yet again" — amber hues were ~37 % of every cast appearance;
//  - dharma (the big solid spinning wheel): "not a favorite shader. once in a
//    great while ok" -> 2026-10-13 "i cant stand dharma in resonance": none
//    (also in GLOBAL_SHADER_BLOCKLIST);
//  - the light-ray shaders (zenith; seraph is kin): "dope … more so than that
//    wheel" — favoured; seraph ALWAYS in First Light + every Surrounded by Light;
//  - "overall i never mind seeing use of cosmos and infinite space" — the
//    amber share is cooled by leaning COSMIC, not by banning anything;
//  - Grasshopper: "you use that moving plane shader on repeat and ends up too
//    long" — a long phase-owned phase needs a bigger cast;
//  - Bath: "no ember 3d plane moving shader in bath".
// Enforced by scripts/rebalance-shader-casts.mjs (writes the casts) and
// src/lib/journeys/shader-balance.test.ts (guards them); the journey engine
// honours the bans at pick time (isShaderAllowed, finale-forced included) and
// its kindred borrow (journey-engine.ts kinBorrow) the same leanings.
//
// CAP ARITHMETIC: the kiosk loop holds ~97 cast journeys x ~12 shaders
// (~1,170 appearances) over a ~95-shader vetted pool, i.e. ~12.3 journeys per
// shader on average — a uniform cap near 5 is unreachable without a ~2.5x
// larger vetted pool. The general cap therefore flattens the top of the
// distribution (was 16) while the named over-seen shaders get the tight caps.
import { SHADER_HUES } from "@/lib/shaders/shader-hues.generated";

/** Max loop journeys (mastered takes included) any one shader may appear in. */
export const SHADER_LOOP_CAP = 15;

/** Tighter caps for the shaders Karel called out as over-seen. */
export const SHADER_NAMED_CAPS: Readonly<Record<string, number>> = {
  dharma: 0, // Karel 2026-10-13: "i cant stand dharma in resonance"
  magma: 5, // "that amber web shader"
  parsec: 5, // "that amber 3d moving plane shader"
  ember: 5, // the third amber regular (~13 journeys before the recast)
};

export const shaderLoopCap = (mode: string): number => SHADER_NAMED_CAPS[mode] ?? SHADER_LOOP_CAP;

/** Shaders no journey may ever play (cap 0) — the engine refuses them at pick time. */
export const SHADER_BANNED_EVERYWHERE: ReadonlySet<string> = new Set(
  Object.entries(SHADER_NAMED_CAPS).filter(([, c]) => c === 0).map(([m]) => m),
);

/** Max share of all cast appearances (non-mastered loop journeys) that may be amber. */
export const AMBER_SHARE_MAX = 0.25;

/** parsec's static GLSL hue reads violet, but on screen Karel sees amber. */
export const PERCEIVED_AMBER: ReadonlySet<string> = new Set(["parsec"]);

export function isAmberShader(mode: string): boolean {
  if (PERCEIVED_AMBER.has(mode)) return true;
  const h = SHADER_HUES[mode];
  return h === "gold" || h === "ember";
}

export const FIRST_LIGHT_ID = "87e106f9-4d74-4886-b944-fd625a827b02";
export const GRASSHOPPER_ID = "fdc6470e-5c7e-43b4-968c-3e907f1fa88f";
export const BATH_ID = "a5b5f0cf-9a6b-451a-8293-3d98f3904342";

/** Every Surrounded by Light journey (Karel 2026-10-13: seraph ALWAYS there). */
export const SURROUNDED_BY_LIGHT_IDS: readonly string[] = [
  "f7b01537-af1b-4ade-b788-f21c6565b057", // Surrounded By Light (album)
  "69ac68d7-30c9-4c1e-bb0e-1727fb5643f3", // Surrounded By Light (March Light)
  "6251d682-b5e4-46b6-98cf-ceb6b609a7bc", // Surrounded by Light 6 (Expansion, in the loop)
  "21448504-ec00-48c3-8b0a-c92da2cf216a", // Surrounded by Light 19 (Expansion, parked — pack only)
  "06b07942-bf94-4513-8e71-ef00508ced3e", // Surrounded by Light 3 (Expansion, parked — pack only)
];

/** Shaders a specific journey must never cast. */
export const SHADER_JOURNEY_BANS: Readonly<Record<string, readonly string[]>> = {
  [GRASSHOPPER_ID]: ["parsec"], // "you use that moving plane shader on repeat and ends up too long"
  // "no ember 3d plane moving shader in bath" (2026-10-13; the kiosk log had
  // Bath's finale on ember, finale-forced) — ember and parsec both out
  [BATH_ID]: ["ember", "parsec"],
  // Redwoods Sway 2 — "amber web shader in this current journey not good so remoive" (2026-10-14)
  "99b7ad2c-a212-440e-85fa-0c670c1e4296": ["ember"],
};

export const AFTERGLOW_ID = "fb56b19e-ee23-43c6-ad41-5714e7969aad";

/** The SUN shaders (lab 2026-10-12, promoted 2026-10-13 — Karel kept all
 *  six; seraph is their bar). They belong to the light journeys only: no
 *  general recast or cap/amber repair may place one anywhere else. */
export const SUN_SHADERS: readonly string[] = ["sun-corona", "sun-veil", "sun-dawn", "sun-halo", "sun-wind", "sun-aster"];
export const SUN_SHADER_SET: ReadonlySet<string> = new Set(SUN_SHADERS);

/** Where each sun shader is cast — PINNED like seraph. Each sun shader in
 *  2-3 light journeys, at most 2 per journey; the March Light pair that sits
 *  two apart in the loop and on the album path (Surrounded By Light f7b01537
 *  / Afterglow) shares none. Order matters: the rebalancer places the first
 *  one first, and a dim one (halo / wind) may land in a dark sparse
 *  interlude where a brighter one (veil, mean 11.8) should not. */
export const SUN_SHADER_PINS: Readonly<Record<string, readonly string[]>> = {
  [FIRST_LIGHT_ID]: ["sun-dawn", "sun-aster"], // dawn fan + aster: first light
  "f7b01537-af1b-4ade-b788-f21c6565b057": ["sun-halo", "sun-wind"], // Surrounded By Light (loop 5, March Light set)
  [AFTERGLOW_ID]: ["sun-veil", "sun-corona"], // veiled sun, breathing corona (loop 7, March Light set)
  "69ac68d7-30c9-4c1e-bb0e-1727fb5643f3": ["sun-corona", "sun-halo"], // Surrounded By Light (loop 13)
  "6251d682-b5e4-46b6-98cf-ceb6b609a7bc": ["sun-wind", "sun-veil"], // Surrounded by Light 6
  "21448504-ec00-48c3-8b0a-c92da2cf216a": ["sun-dawn", "sun-corona"], // Surrounded by Light 19 (parked)
  "06b07942-bf94-4513-8e71-ef00508ced3e": ["sun-aster", "sun-veil"], // Surrounded by Light 3 (parked)
};

/** Shaders a specific journey must cast — PINNED, never swapped out.
 *  First Light: Aureole (2026-10-12) + seraph; seraph ALWAYS in First Light
 *  and every Surrounded by Light journey (Karel 2026-10-13); the sun
 *  shaders where SUN_SHADER_PINS places them. */
export const SHADER_JOURNEY_MUSTS: Readonly<Record<string, readonly string[]>> = (() => {
  const musts: Record<string, string[]> = {
    [FIRST_LIGHT_ID]: ["seraph", "aureole"],
    ...Object.fromEntries(SURROUNDED_BY_LIGHT_IDS.map((id) => [id, ["seraph"]])),
  };
  for (const [id, suns] of Object.entries(SUN_SHADER_PINS)) musts[id] = [...(musts[id] ?? []), ...suns];
  return musts;
})();

/** The light-ray shaders Karel favours ("dope"). */
export const LIGHT_FAVOURED: readonly string[] = ["zenith", "seraph"];

/** Light-themed journeys in the loop — each casts at least one light-ray shader. */
export const LIGHT_JOURNEY_IDS: readonly string[] = [
  FIRST_LIGHT_ID,
  "69ac68d7-30c9-4c1e-bb0e-1727fb5643f3", // Surrounded By Light (March Light)
  "f7b01537-af1b-4ade-b788-f21c6565b057", // Surrounded By Light (album)
  AFTERGLOW_ID, // Afterglow
  "6251d682-b5e4-46b6-98cf-ceb6b609a7bc", // Surrounded by Light 6 (Expansion)
];

/** Never drawn by the engine's kindred borrow (they reach the screen only
 *  where a cast places them on purpose). */
export const KIN_BORROW_AVOID: ReadonlySet<string> = new Set(Object.keys(SHADER_NAMED_CAPS));

/** Bans the engine applies at pick time (every picker, finale-forced included). */
export function isShaderBannedFor(journeyId: string | null | undefined, mode: string): boolean {
  return SHADER_BANNED_EVERYWHERE.has(mode) || (!!journeyId && (SHADER_JOURNEY_BANS[journeyId] ?? []).includes(mode));
}

/** A long phase-owned phase needs one voice per this many seconds (Grasshopper). */
export const SECONDS_PER_VOICE = 12;
