// ─────────────────────────────────────────────────────────────────────────────
// parity.ts — the WebGL2 → WebGPU parity ledger (docs/webgpu-engine-plan.md §4).
//
// The PARITY engine (engine-port.ts) runs the show's own WebGL engine as its
// conductor and the naga-ported GLSL on the GPU, so by construction every
// method and every simulation / draw uniform is the show's. The ledger records
// the EXCEPTIONS — what the port does not carry yet — and tests enforce it:
//   METHOD_PARITY  — every ParticleEngine method (tsc fails on a new one).
//   UNIFORM_PARITY — every WebGL sim + draw uniform must be either in the
//                    generated port (port.generated.ts: live) or listed here.
//                    A new uniform with a stale port fails CI → regenerate
//                    (NAGA_BIN=… node scripts/gen-webgpu-port.mjs).
// Status: "live" = on the GPU now · "state" = the conductor keeps the state,
// the GPU effect lands in the named phase · "planned" = not carried yet.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParticleEngine } from "../particle-engine";

export type Phase = "A" | "B" | "C" | "D" | "E";
export type ParityStatus = "live" | "state" | "planned";

export interface ParityEntry {
  status: ParityStatus;
  phase: Phase;
  /** plan section (docs/webgpu-engine-plan.md) */
  plan: string;
  note?: string;
}

const live = (note?: string): ParityEntry => ({ status: "live", phase: "A", plan: "§A", note });
const state = (phase: Phase, plan: string, note?: string): ParityEntry => ({ status: "state", phase, plan, note });
const planned = (phase: Phase, plan: string, note?: string): ParityEntry => ({ status: "planned", phase, plan, note });

const C = live("the conductor (the show engine) + the ported passes");

export const METHOD_PARITY = {
  start: C, stop: C, dispose: C, setSoul: C, setPalette: C, setCount: C, setAudio: C, setDensity: C,
  dissolveTo: C, dissolveTime: C, startDissolve: C, setImagePace: C, setHue: C, setForm: C, setShape: C, setVariant: C,
  imageLevel: C, imageShown: C, setFire: C, snapImage: C, snapToImage: C, imageState: C, setCamScale: C,
  setCine: live("depth of field + colour drift via the draw port; bloom (glow) not ported — off in the show"),
  setScore: C, scoreCompiled: C, setCurrents: C, setBreath: C, setGravity: C, gravityState: C, setHands: C, handsCompiled: C,
  setTrails: C, trailsCompiled: C, trailsShown: C, setOffset: C, setImageScale: C, setImageFlight: C, releaseFlight: C,
  setSizeScale: C, setReact: C, setUnfold: C, setInstances: C,
  setTripwire: planned("A", "§A.6 probes", "the velocity read-back stays idle (async mapAsync probe planned)"),
  lastRetarget: C, settledFor: C, setImageVariant: C, setImageTint: C, loadBridgeStill: C, setBridge: C, bridgeState: C,
  setFollow: C, loadFormImage: C, imageSampleCount: C, setImageForm: C,
  setImageLiteral: state("E", "§E optimal transport", "spatial pairing is compiled out of the conductor (float-blend histograms → compute atomics); the literal level still applies"),
  setHover: C, setMotion: C, impulse: C, regather: C, setMelody: C, enter: C, setHueSpread: C, setGain: C,
  prepare: C, warmBurst: C, setWarmPace: C, prewarm: C, isWarm: C, resize: C,
  stats: live("the conductor's stats; exposure / meanLum are governed on the GPU and not read back"),
} as const satisfies Record<keyof ParticleEngine, ParityEntry>;

// tsc guard: a method added to ParticleEngine and missing above fails the build
type MissingMethods = Exclude<keyof ParticleEngine, keyof typeof METHOD_PARITY>;
export const METHOD_PARITY_COMPLETE: [MissingMethods] extends [never] ? true : false = true;

export const PARITY_METHODS = Object.keys(METHOD_PARITY) as (keyof ParticleEngine)[];

// ── WebGL uniforms NOT in the port's uniform blocks ─────────────────────────
// (everything else is live: packed by name from the conductor's own values)
export const UNIFORM_PARITY: Record<string, ParityEntry> = {
  uPos: live("storage buffer pos"),
  uVel: live("storage buffer vel"),
  uSeed: live("storage buffer seed"),
  uSpec: live("storage buffer, sampled with the texture's LINEAR clamp"),
  uImgUv: live("storage buffer uv"),
  uImgA: live("texture (copyExternalImageToTexture, flipY like the GL upload)"),
  uImgB: live("texture"),
  uBridgeA: live("texture (writeTexture)"),
  uBridgeB: live("texture"),
  uPairSoft: state("E", "§E optimal transport", "uniform ported; the paired uv is not (pairing compiled out)"),
};

// ── THE MASTERED JOURNEYS (Karel 2026-10-13: "i do want the new particle engine
// and all that in snowflake and ghost. just not new particle shaders in them").
// Snowflake ("first-snow") and Ghost ("ghost") run the NEW engine with every
// particle feature; only their SHADER casts stay locked (handled elsewhere).
// Each scripted particle moment below must look the same or better on WebGPU
// before the engine may drive them — judged by Karel on film, side by side
// with WebGL at the show count (lab case, default vs ?gpu=webgl2).

export type MasteredJourney = "first-snow" | "ghost";

export const LAB_CASES = ["forms", "snowflake-emblems", "snowflake-calm", "ghost-opening", "ghost-angel", "ghost-blossom-wings"] as const;
export type LabCaseId = (typeof LAB_CASES)[number];

export interface MasteredMoment {
  journey: MasteredJourney;
  moment: string;
  /** the ParticleEngine calls the journey layer makes for it */
  surface: readonly (keyof ParticleEngine)[];
  status: ParityStatus;
  phase: Phase;
  plan: string;
  /** /lab/webgpu?case=… reproduces it on both engines */
  labCase: LabCaseId;
}

export const MASTERED_PARITY: readonly MasteredMoment[] = [
  { journey: "first-snow", moment: "emblem variants (snowflake-1…7): gather, hold, release at the calm pace (setImagePace 0.6) — spatially paired in the show", surface: ["loadFormImage", "setImageForm", "setImagePace", "setImageLiteral", "setImageScale"], status: "state", phase: "E", plan: "§A port live; pairing §E (or a compute port of the five pairing passes)", labCase: "snowflake-emblems" },
  { journey: "first-snow", moment: "calm form holds (~25–32 s), slow breath, gentle dolly — never 'changing its mind'", surface: ["setSoul", "setShape", "settledFor", "setCamScale", "setBreath"], status: "live", phase: "A", plan: "§A (conductor + sim port)", labCase: "snowflake-calm" },
  { journey: "first-snow", moment: "murmuration opening; swell eases in (no brightness jump); Silk Threads", surface: ["setSoul", "enter", "setGain"], status: "live", phase: "A", plan: "§A (sim port: soul 3)", labCase: "snowflake-calm" },
  { journey: "ghost", moment: "opening: emblem → slow blob rising IN PLACE over the tunnel, fine motes (size 0.85, no offset)", surface: ["setSoul", "setSizeScale", "setOffset", "setImageForm"], status: "live", phase: "A", plan: "§A", labCase: "ghost-opening" },
  { journey: "ghost", moment: "the angel flash: approach ramp, the field meets the angel on the beat (flash pace, glide=false), wears its colours, dissipates; the outline treatment", surface: ["loadFormImage", "setImageForm", "impulse", "imageLevel"], status: "live", phase: "A", plan: "§A (image colours via the draw port)", labCase: "ghost-angel" },
  { journey: "ghost", moment: "blossom → wings hover hand-off (no back-and-forth); no stall on the final wings", surface: ["loadFormImage", "setHover", "setImageForm", "imageState"], status: "live", phase: "A", plan: "§A (hover in the sim port)", labCase: "ghost-blossom-wings" },
  { journey: "ghost", moment: "spirit soul, no ribbons, never green; recycled motes fade in by age, staggered (no bunching at the top after the flash)", surface: ["setSoul", "setPalette"], status: "live", phase: "A", plan: "§A (sim + draw port)", labCase: "ghost-angel" },
  { journey: "ghost", moment: "quiet imaging: further, sparser, beside the imagery", surface: ["setOffset", "setDensity", "setCamScale"], status: "live", phase: "A", plan: "§A", labCase: "ghost-opening" },
];

export function paritySummary(table: Record<string, ParityEntry>): Record<ParityStatus, number> {
  const out: Record<ParityStatus, number> = { live: 0, state: 0, planned: 0 };
  for (const e of Object.values(table)) out[e.status]++;
  return out;
}
