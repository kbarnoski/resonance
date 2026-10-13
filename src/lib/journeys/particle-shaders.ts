// PARTICLE SHADERS — the background shaders made of drifting motes, sparkles,
// dust, fireflies and glitter on a dark floor (NOT the WebGL particle engine
// in src/lib/particles/). Karel 2026-10-13: "i like the particle shaders and
// hoping you use them in good portion across journeys. not that particle
// engine but those shader particles that we have once in a while. they are
// cute" — they "interplay with the images in a perfect dance" (his law: no
// full-screen intensity monsters), so they are favoured as the companion
// (dual / tertiary) layer over imagery and in the morph-end arrival.
//
// Membership was decided by reading each vetted shader's source:
//  IN  — discrete points / motes on black: the evolving-palette particle
//        batch (firefly-field, meteor-rain, murmuration, will-o-wisp,
//        pendulum-dust, orbit-weaver, rose-window, ribbon-of-light,
//        cascade-veil, binary-stars) and the review-pack sparkle fields
//        (r-stardust, r-embers, r2-pixie, r2-spore, r3-fairyglow).
//  OUT — r2-curlswarm (despite the name: an fbm flow-field wash, "no actual
//        particles"), r-droplets (metaballs), r-mercury (chrome surface),
//        pollen (big SEM grains on a warm void, mean 25 — an intensity
//        field), plankton (curl-flow trails), the parallax star fields
//        (drift / starfield / lightyear / hubble / parsec — space, not
//        motes), resonant-rings (rims); sparkler (Karel-banned),
//        comet-swarm / ember-fountain / galaxy-seed / helix-stream (the
//        retired Kinetic Lab, outside the cast pool); r-petals (Ghost only)
//        and anything in GLOBAL_SHADER_BLOCKLIST / KAREL_BANNED_SHADERS.
//
// Casting by character (the analysis decides — feedback_theme_from_analysis):
// GENTLE motes for quiet / sparse journeys and phases, LIVELY sparkle for
// energetic ones. Laws enforced by scripts/rebalance-shader-casts.mjs (7. the
// particle pass) and guarded by src/lib/journeys/particle-shaders.test.ts.
import { PARTICLE_VOICES, PARTICLE_VOICES_BY_NAME } from "./particle-voices.generated";

/** Slow, sparse, breathing — quiet journeys, sparse interludes, codas. */
export const GENTLE_PARTICLE_SHADERS: readonly string[] = [
  "pendulum-dust", // a glittering bob shedding dust at the bottom of each arc
  "r3-fairyglow", // 18 twinkling fairy lights, barely moving
  "firefly-field", // a deep meadow of lights blinking on the highs
  "will-o-wisp", // four wandering souls of light trailing glitter
  "rose-window", // particles tracing a slow five-petal rose
  "orbit-weaver", // particles on four concentric orbital shells
  "cascade-veil", // a narrow particle waterfall into a glowing basin
  "binary-stars", // two hearts exchanging a stream of particles
];

/** Streaming, swarming, rising — energetic journeys, builds and peaks. */
export const LIVELY_PARTICLE_SHADERS: readonly string[] = [
  "r-stardust", // a stardust river streaming across the frame
  "meteor-rain", // sparse meteors with glittering wakes
  "murmuration", // a flock of tiny lights swirling as one
  "r2-pixie", // pixie-dust sparkles trailing
  "ribbon-of-light", // a band of particles snaking through space
  "r-embers", // an ember storm swirling upward
  "r2-spore", // a spore cloud released upward
];

export const PARTICLE_SHADERS: readonly string[] = [...GENTLE_PARTICLE_SHADERS, ...LIVELY_PARTICLE_SHADERS];
export const PARTICLE_SHADER_SET: ReadonlySet<string> = new Set(PARTICLE_SHADERS);
export const GENTLE_PARTICLE_SET: ReadonlySet<string> = new Set(GENTLE_PARTICLE_SHADERS);

export function isParticleShader(mode?: string | null): boolean {
  return !!mode && PARTICLE_SHADER_SET.has(mode);
}

/** Target share of loop shader screen-time (all layers) for the family. */
export const PARTICLE_SHARE_MIN = 0.3;
export const PARTICLE_SHARE_MAX = 0.35;
/** Share of non-mastered loop journeys that cast at least one. */
export const PARTICLE_COVERAGE_MIN = 0.7;
/** No single particle shader may carry more than this share of the
 *  family's screen-time (spread across the whole family, no favourite). */
export const PARTICLE_FAVOURITE_MAX = 0.12;

// ── screen-time model (no GPU, no pack) ─────────────────────────────────
// The kiosk runs every non-mastered journey kinetic: the dual voice is
// always on and short tertiary windows cover ~75 % of the track (H5k ≈ 2.75
// live layers). A phase-owned cast plays only its own phase's shaders (a
// one-shader phase is one layer); a free cast borrows journey-wide. Each
// live layer-second is shared by the voices that can hold it.
export const KINETIC_LAYERS = 2.75;

/** Expected on-screen seconds per shader (all layers) for one cast.
 *  `bounds` = interior phase boundaries in seconds (PARTICLE_PROFILES). */
export function castScreenTime(
  cast: Readonly<Record<string, readonly (string | null)[]>>,
  bounds: readonly number[],
  duration: number,
  opts: { owned?: boolean; layers?: number } = {},
): Map<string, number> {
  const layers = opts.layers ?? KINETIC_LAYERS;
  const ids = Object.keys(cast);
  const edges = [0, ...bounds.slice(0, ids.length - 1), duration];
  const all = [...new Set(ids.flatMap((id) => cast[id]).filter((m): m is string => !!m))];
  const out = new Map<string, number>();
  const add = (m: string, s: number) => out.set(m, (out.get(m) ?? 0) + s);
  ids.forEach((id, i) => {
    const T = Math.max(0, (edges[i + 1] ?? duration) - (edges[i] ?? 0));
    const own = [...new Set(cast[id].filter((m): m is string => !!m))];
    if (!own.length || T <= 0) return;
    const live = Math.min(layers, own.length);
    for (const m of own) add(m, (T * live) / own.length);
    // a free cast fills the rest of the kinetic stack journey-wide
    if (!opts.owned && live < layers) for (const m of all) add(m, (T * (layers - live)) / all.length);
  });
  return out;
}

export interface ParticleShareReport {
  share: number;
  particleSec: number;
  totalSec: number;
  byShader: Map<string, number>;
}

/** Family share of the summed screen-time maps. */
export function particleShare(times: readonly Map<string, number>[]): ParticleShareReport {
  let p = 0, t = 0;
  const by = new Map<string, number>();
  for (const m of times) for (const [mode, s] of m) {
    t += s;
    if (isParticleShader(mode)) { p += s; by.set(mode, (by.get(mode) ?? 0) + s); }
  }
  return { share: t ? p / t : 0, particleSec: p, totalSec: t, byShader: by };
}

// ── the engine's PARTICLE VOICE (journey-engine.ts) ───────────────────────
// Karel 2026-10-13 (tightened): "dont mess with ghost or snowflake but all
// others def ensure particle shaders appear in them all and ensure they are
// present 33% of the time for a journey". Every non-mastered journey carries
// a small particle voice list (its cast's particle members + the voices
// scripts/rebalance-shader-casts.mjs (7. PARTICLE PASS) casts for it from the analysis), and the
// engine keeps ~33 % of the journey's live shader-layer time on them: when
// the running share falls under the band it lays a voice on the companion
// layer (the dual; the tertiary over a scripted take, whose primaries and
// dual stay as recorded), and above it the pickers pass particle shaders by.
export const PARTICLE_TARGET = 0.33;
/** Lay a voice when the running share is under this … */
export const PARTICLE_BAND_LO = 0.32;
/** … stop renewing one / pass cast particles by above this. */
export const PARTICLE_BAND_HI = 0.35;
/** Per-journey screen-time band the tests hold every non-mastered journey to. */
export const PARTICLE_JOURNEY_MIN = 0.3;
export const PARTICLE_JOURNEY_MAX = 0.4;

/** The journey's particle voices: generated list (by id, else by its unique
 *  name) ∪ its roster's particle members; a hash-picked trio of cool
 *  family members for a journey nobody cast (user-created). */
export function particleVoicesFor(journey: { id?: string | null; name?: string | null; phases?: readonly { shaderModes: readonly string[] }[] }): string[] {
  const roster = (journey.phases ?? []).flatMap((p) => p.shaderModes).filter(isParticleShader);
  const gen = (journey.id && PARTICLE_VOICES[journey.id]) || PARTICLE_VOICES_BY_NAME[(journey.name ?? "").trim().toLowerCase()];
  const out = [...new Set([...(gen ?? []), ...roster])];
  if (out.length) return out;
  const cool = PARTICLE_SHADERS.filter((m) => !["r2-pixie", "r3-fairyglow", "r-embers"].includes(m));
  let h = 2166136261;
  const key = journey.id ?? journey.name ?? "";
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  const start = (h >>> 0) % cool.length;
  return [0, 4, 8].map((k) => cool[(start + k) % cool.length]);
}

/** Max loop journeys whose cast OR particle voices hold any one family
 *  shader. Arithmetic: a third of EVERY journey's shader time needs >= 3
 *  rotating particle voices per journey (one voice alone breaks H2), and a
 *  phase-owned cast / pinned take needs 3 voices of its own (its cast
 *  particles may not leave their phases / the take's roster) — ~98 journeys
 *  × 3 + the casts' own particle members over a 15-shader family ≈ 33 each.
 *  The ~6 of the first brief cannot hold that (the casts alone already
 *  placed 12 of the 15 in 15 journeys before this pass). */
export const PARTICLE_LOOP_CAP = 36;
