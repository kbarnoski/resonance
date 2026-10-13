/**
 * MORPH SHADER ARRIVAL (Karel 2026-10-13: "all morphs there should be shaders
 * over them as they approach their end frame so the screen is never a full
 * page static image. snowflake does a good job at this btw").
 *
 * The morph quiet window (video-activity.ts) blocks shader rotation for the
 * whole life of a travel morph, so a clip could reach its end frame under a
 * dim shader that had been on for a while — the end frame read as a static
 * full-screen image, and only ~0.8 s AFTER the clip ended did a fresh shader
 * get nudged in (compiling then). Snowflake's scripted take does it right:
 * its lines arrive before the last morph and carry through the end frame.
 *
 * The design, for every non-scripted journey:
 *  1. When a travel morph is pushed (before it is even visible), the engine
 *     PLANS the arriving shader (pickMorphShader) and exposes it as the
 *     frame's `stagedShaderMode`. The visualizer loads it onto the parked
 *     primary A/B layer — compile, the single sync frame and one warm draw
 *     all happen at opacity 0 while the clip is still loading/fading in.
 *  2. While the clip plays, when `duration - currentTime <= leadSec` the
 *     engine LANDS the plan as the primary. The visualizer finds it already
 *     resident and starts the normal crossfade immediately — no compile under
 *     the playing morph. leadSec is sized from the exact fade the visualizer
 *     will run, so the shader is fully in ~0.5-1 s before the end frame and
 *     carries through the end-frame dwell.
 *  3. The clip-end nudge (and the finale's forceShaderSwitch) do NOT fire a
 *     second switch when the arrival landed — one big change, not two.
 *
 * Flag: OFF by default, `?morphshader=1` / `=0` kept in sessionStorage (same
 * pattern as phraseConductorEnabled) until Karel films it on the kiosk GPU.
 */
import { SHADER_MEAN_LUMA } from "@/lib/shaders/shader-brightness.generated";
import { fadeMsFor } from "@/lib/shaders/shader-fade";

export const MORPH_SHADER_DEFAULT = true; // Karel 2026-10-13: "all morphs there should be shaders over them as they approach their end frame"
const MORPH_SHADER_SESSION_KEY = "resonance.morphshader";

/** Is the morph-shader arrival on for this tab? `?morphshader=1` / `=0` (kept
 *  in sessionStorage across the kiosk loop's navigations), else the default. */
export function morphShaderEnabled(search?: string, store?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null): boolean {
  let q: string | null = null;
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    q = new URLSearchParams(s).get("morphshader");
  } catch { q = null; }
  try {
    if (q === "1" || q === "0") store?.setItem(MORPH_SHADER_SESSION_KEY, q);
  } catch { /* storage blocked */ }
  if (q === "1") return true;
  if (q === "0") return false;
  try {
    const kept = store?.getItem(MORPH_SHADER_SESSION_KEY);
    if (kept === "1") return true;
    if (kept === "0") return false;
  } catch { /* storage blocked */ }
  return MORPH_SHADER_DEFAULT;
}

/** Browser convenience — reads location + sessionStorage, never throws. */
export function morphShaderOn(): boolean {
  try {
    return morphShaderEnabled(undefined, typeof window !== "undefined" ? window.sessionStorage : null);
  } catch { return false; }
}

export const MORPH_SHADER_LAWS = {
  /** Mean luma (0-255, vetting) at/above which a shader reads clearly over
   *  imagery. The dim/sparse ones (drift 3.4, dark-* 2-12, coral 9.7) don't. */
  CLEAR_MIN_LUMA: 14,
  /** Crossfades the arrival prefers (brightness-aware fade stretches with
   *  the luma rise from the current primary). */
  PREFERRED_FADE_MS: 2600,
  MAX_FADE_MS: 3400,
  /** Lead = fade + this margin: the crossfade completes ~0.5-1 s before the
   *  end frame (the frame→visualizer hop + timeupdate granularity eat the
   *  rest of the margin). */
  END_MARGIN_SEC: 0.6,
  /** Spec: start ~3 s before the end … */
  MIN_LEAD_SEC: 3.0,
  /** … never so early it stacks on the clip's own fade-in. */
  MAX_LEAD_SEC: 4.0,
  /** Never schedule before this much of the clip has played. */
  MIN_PLAYED_SEC: 1.0,
  /** An arrival this recent makes the finale's forced switch redundant. */
  FINALE_SKIP_WINDOW_MS: 12_000,
} as const;

export interface MorphShaderPickInput {
  /** The phase the morph travels INTO (travel morphs arm on phase entry). */
  phaseModes: readonly string[];
  /** The following phase's cast (empty for the last phase / owned phases). */
  nextPhaseModes: readonly string[];
  /** Phase-owned choreography: only the phase's own shaders may play. */
  owned: boolean;
  current: string;
  dual: string | null;
  tertiary: string | null;
  seen: ReadonlySet<string>;
  /** Every ban/blocklist (isShaderAllowed + 3D + global + lab). */
  allowed: (mode: string) => boolean;
  /** Primaries that force the dual off — avoided while a dual is live
   *  (dropping it would be a second change at the same moment). */
  soloPrimaries?: ReadonlySet<string>;
  random: () => number;
  luma?: Readonly<Record<string, number>>;
  fadeMs?: (from: string, to: string) => number;
}

export interface MorphShaderPick {
  mode: string;
  /** The crossfade the visualizer will run (current → mode). */
  fadeMs: number;
}

/** Choose the shader that arrives over a morph's end frame, or null.
 *  Gates, in order: reads clearly with a fade ≤ MAX_FADE_MS → reads clearly →
 *  anything allowed (any fresh motion beats a static frame). Within a gate,
 *  tiers: unseen-in-phase → unseen-next-phase → seen phase → seen next phase;
 *  within a tier the gentlest fades (≤ PREFERRED_FADE_MS) win when present.
 *  Pure; draws from `random` only when there is a choice. */
export function pickMorphShader(input: MorphShaderPickInput): MorphShaderPick | null {
  const luma = input.luma ?? SHADER_MEAN_LUMA;
  const fade = input.fadeMs ?? ((a: string, b: string) => fadeMsFor(a, b));
  const live = new Set([input.current, input.dual, input.tertiary].filter(Boolean) as string[]);
  const usable = (m: string) => !live.has(m) && input.allowed(m)
    && !(input.dual && input.soloPrimaries?.has(m));
  const uniq = (xs: readonly string[]) => xs.filter((m, i) => xs.indexOf(m) === i);
  const phase = uniq(input.phaseModes).filter(usable);
  const next = input.owned ? [] : uniq(input.nextPhaseModes).filter((m) => usable(m) && !phase.includes(m));
  const tiers: string[][] = [
    phase.filter((m) => !input.seen.has(m)),
    next.filter((m) => !input.seen.has(m)),
    phase.filter((m) => input.seen.has(m)),
    next.filter((m) => input.seen.has(m)),
  ];
  const clear = (m: string) => (luma[m] ?? 20) >= MORPH_SHADER_LAWS.CLEAR_MIN_LUMA;
  const gates: Array<(m: string) => boolean> = [
    (m) => clear(m) && fade(input.current, m) <= MORPH_SHADER_LAWS.MAX_FADE_MS,
    (m) => clear(m),
    () => true,
  ];
  for (const gate of gates) {
    for (const tier of tiers) {
      const c = tier.filter(gate);
      if (c.length === 0) continue;
      const gentle = c.filter((m) => fade(input.current, m) <= MORPH_SHADER_LAWS.PREFERRED_FADE_MS);
      const pool = gentle.length ? gentle : c;
      const mode = pool.length === 1 ? pool[0] : pool[Math.floor(input.random() * pool.length) % pool.length];
      return { mode, fadeMs: fade(input.current, mode) };
    }
  }
  return null;
}

/** Seconds before the clip's end at which the arrival lands: long enough for
 *  the crossfade to complete before the end frame, clamped to the 3-4 s
 *  window, and never before MIN_PLAYED_SEC of the clip has played. */
export function morphShaderLeadSec(fadeMs: number, clipDurationSec: number): number {
  const L = MORPH_SHADER_LAWS;
  const want = Math.min(L.MAX_LEAD_SEC, Math.max(L.MIN_LEAD_SEC, fadeMs / 1000 + L.END_MARGIN_SEC));
  const dur = Number.isFinite(clipDurationSec) && clipDurationSec > 0 ? clipDurationSec : 5;
  return Math.max(0, Math.min(want, dur - L.MIN_PLAYED_SEC));
}

/** Should the arrival land now? `remainingSec` = duration - currentTime. */
export function morphShaderDue(remainingSec: number, leadSec: number): boolean {
  return Number.isFinite(remainingSec) && remainingSec <= leadSec;
}

/** The finale's forced switch is redundant when an arrival just landed. */
export function finaleSwitchRedundant(msSinceArrival: number): boolean {
  return msSinceArrival < MORPH_SHADER_LAWS.FINALE_SKIP_WINDOW_MS;
}
