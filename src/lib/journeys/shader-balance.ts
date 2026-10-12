// SHADER BALANCE — loop-wide diversity laws for every shader cast
// (Karel 2026-10-12, watching the kiosk loop):
//  - "you also seem to use that amber web shader [magma] and that amber 3d
//    moving plane shader [parsec] a lot" / "there ya go using that amber web
//    shader yet again" — amber hues were ~36 % of every cast appearance;
//  - dharma (the big solid spinning wheel): "not a favorite shader. once in a
//    great while ok" — and not in First Light (Aureole there instead);
//  - the light-ray shaders (zenith; seraph is kin): "dope … more so than that
//    wheel" — favoured, above all in the light-themed journeys;
//  - "overall i never mind seeing use of cosmos and infinite space" — the
//    amber share is cooled by leaning COSMIC, not by banning anything;
//  - Grasshopper: "you use that moving plane shader on repeat and ends up too
//    long" — a long phase-owned phase needs a bigger cast.
// Enforced by scripts/rebalance-shader-casts.mjs (writes the casts) and
// src/lib/journeys/shader-balance.test.ts (guards them); the journey engine's
// kindred borrow (journey-engine.ts kinBorrow) honours the same leanings.
//
// CAP ARITHMETIC: the kiosk loop holds ~97 cast journeys x ~12 shaders
// (~1,170 appearances) over a 95-shader vetted pool, i.e. ~12.3 journeys per
// shader on average — a uniform cap near 5 is unreachable without a ~2.5x
// larger vetted pool. The general cap therefore flattens the top of the
// distribution (was 16) while the named over-seen shaders get the tight caps.
import { SHADER_HUES } from "@/lib/shaders/shader-hues.generated";

/** Max loop journeys (mastered takes included) any one shader may appear in. */
export const SHADER_LOOP_CAP = 15;

/** Tighter caps for the shaders Karel called out as over-seen. */
export const SHADER_NAMED_CAPS: Readonly<Record<string, number>> = {
  dharma: 2, // "once in a great while ok"
  magma: 5, // "that amber web shader"
  parsec: 5, // "that amber 3d moving plane shader"
  ember: 5, // the third amber regular (~13 journeys before the recast)
};

export const shaderLoopCap = (mode: string): number => SHADER_NAMED_CAPS[mode] ?? SHADER_LOOP_CAP;

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

/** Shaders a specific journey must never cast. */
export const SHADER_JOURNEY_BANS: Readonly<Record<string, readonly string[]>> = {
  [FIRST_LIGHT_ID]: ["dharma"],
  [GRASSHOPPER_ID]: ["parsec"],
};

/** Shaders a specific journey must cast (Karel: Aureole in First Light). */
export const SHADER_JOURNEY_MUSTS: Readonly<Record<string, readonly string[]>> = {
  [FIRST_LIGHT_ID]: ["aureole"],
};

/** The light-ray shaders Karel favours ("dope"). */
export const LIGHT_FAVOURED: readonly string[] = ["zenith", "seraph"];

/** Light-themed journeys in the loop — each casts at least one light-ray shader. */
export const LIGHT_JOURNEY_IDS: readonly string[] = [
  FIRST_LIGHT_ID,
  "69ac68d7-30c9-4c1e-bb0e-1727fb5643f3", // Surrounded By Light (Surrounded by Light album)
  "f7b01537-af1b-4ade-b788-f21c6565b057", // Surrounded By Light (March Light album)
  "fb56b19e-ee23-43c6-ad41-5714e7969aad", // Afterglow
  "6251d682-b5e4-46b6-98cf-ceb6b609a7bc", // Surrounded by Light 6 (Expansion)
];

/** Never drawn by the engine's kindred borrow (they reach the screen only
 *  where a cast places them on purpose). */
export const KIN_BORROW_AVOID: ReadonlySet<string> = new Set(Object.keys(SHADER_NAMED_CAPS));

/** A long phase-owned phase needs one voice per this many seconds (Grasshopper). */
export const SECONDS_PER_VOICE = 12;
