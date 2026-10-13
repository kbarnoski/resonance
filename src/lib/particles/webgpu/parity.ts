// ─────────────────────────────────────────────────────────────────────────────
// parity.ts — the WebGL2 → WebGPU parity ledger (docs/webgpu-engine-plan.md §4).
//
// Two tables, both enforced by tests:
//   METHOD_PARITY  — every method of the ParticleEngine interface (the surface
//                    particle-lead-layer.tsx drives) and what the WebGPU engine
//                    does with it today. The type below makes tsc fail if a
//                    method is added to ParticleEngine and not listed here.
//   UNIFORM_PARITY — every uniform of the WebGL simulation and draw programs
//                    (parsed from shaders.ts by the test) and where it lands in
//                    the WebGPU engine. A new WebGL force feature that is not
//                    mapped here fails the test — so the port can never
//                    silently fall behind the show engine.
// Status: "live" = on the GPU now · "state" = CPU state kept + glided exactly
// like WebGL, GPU effect lands in the named phase · "planned" = no-op stub.
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

export const METHOD_PARITY = {
  start: live(),
  stop: live(),
  dispose: live(),
  setSoul: state("A", "§A.2 souls", "palette, camera, trail, size, intensity live; force law = procedural stand-in until the soul library is ported"),
  setPalette: live("critically damped glide, as WebGL"),
  setCount: live("rebuilds storage + re-inits on the GPU (call while invisible, as WebGL)"),
  setAudio: live("128-bin spectrum → storage buffer; each mote hears its own band (motion only)"),
  setDensity: live(),
  dissolveTo: planned("A", "§A.4 image timeline"),
  dissolveTime: planned("A", "§A.4 image timeline"),
  startDissolve: planned("A", "§A.4 image timeline"),
  setImagePace: live(),
  setHue: live(),
  setForm: state("A", "§A.2 souls"),
  setShape: state("A", "§A.2 souls", "figure staging (crossesStep / figureHeld) ports with the souls"),
  setVariant: state("A", "§A.2 souls"),
  imageLevel: live(),
  imageShown: live(),
  setFire: state("A", "§A.5 draw features"),
  snapImage: live(),
  snapToImage: live(),
  imageState: live(),
  setCamScale: live(),
  setCine: state("B", "§B.3 cinematic look"),
  setScore: planned("A", "§A.3 force stack"),
  scoreCompiled: live("always false until the score force is ported"),
  setCurrents: state("A", "§A.3 force stack"),
  setBreath: state("A", "§A.3 force stack"),
  setGravity: state("A", "§A.3 force stack"),
  gravityState: live(),
  setHands: planned("A", "§A.3 force stack"),
  handsCompiled: live("always false until the hands force is ported"),
  setTrails: planned("B", "§B.4 velocity streaks"),
  trailsCompiled: live("always false until streaks are ported"),
  trailsShown: live(),
  setOffset: live(),
  setImageScale: live(),
  setSizeScale: live("energy-conserving: footprint only, never light"),
  setReact: live(),
  setUnfold: state("A", "§A.2 souls"),
  setInstances: state("A", "§A.2 souls"),
  setTripwire: state("A", "§A.6 probes", "async mapAsync probe, one in flight"),
  lastRetarget: live(),
  settledFor: live(),
  setImageVariant: live(),
  setImageTint: state("A", "§A.5 draw features"),
  loadBridgeStill: planned("A", "§A.5 draw features"),
  setBridge: state("A", "§A.5 draw features"),
  bridgeState: live(),
  setFollow: state("A", "§A.3 force stack"),
  loadFormImage: live("uv trickles in ≤1 MB/frame into the idle buffer, then swaps"),
  imageSampleCount: live(),
  setImageForm: live(),
  setImageLiteral: state("E", "§E optimal transport", "pairing softness"),
  setHover: state("A", "§A.3 force stack"),
  setMotion: live(),
  impulse: live(),
  regather: live(),
  setMelody: state("A", "§A.3 force stack"),
  enter: live("boot-cloud scatter + speed-cap ramp"),
  setHueSpread: state("A", "§A.5 draw features"),
  setGain: live(),
  prepare: live("pipelines are compiled async at creation; souls are not separate programs here"),
  warmBurst: live(),
  setWarmPace: live(),
  prewarm: live(),
  isWarm: live(),
  resize: live(),
  stats: live(),
} as const satisfies Record<keyof ParticleEngine, ParityEntry>;

// tsc guard: a method added to ParticleEngine and missing above fails the build
type MissingMethods = Exclude<keyof ParticleEngine, keyof typeof METHOD_PARITY>;
export const METHOD_PARITY_COMPLETE: [MissingMethods] extends [never] ? true : false = true;

export const PARITY_METHODS = Object.keys(METHOD_PARITY) as (keyof ParticleEngine)[];

// ── WebGL uniforms → WebGPU ─────────────────────────────────────────────────
export const UNIFORM_PARITY: Record<string, ParityEntry> = {
  // simulation core
  uPos: live("storage stream pos"),
  uVel: live("storage stream vel"),
  uSeed: live("storage stream seed"),
  uSpec: live("storage spec[128]"),
  uDt: live("SimU.dt"),
  uTime: live("SimU.time"),
  uClock: live("SimU.clock"),
  uBands: live("SimU.bands"),
  uBandLv: live("SimU.bandLv"),
  uSwell: live("SimU.swell"),
  uTexW: live("not needed — linear index"),
  uCount: live("SimU.count"),
  uMaxSpeed: live("SimU.maxSpeed"),
  uAccCap: live("SimU.accCap"),
  uImgForm: live("SimU.imgForm (image force)"),
  uImgShow: state("A", "§A.5 draw features", "wear the image colours"),
  uSnap: live("SimU.spring.w"),
  uPlaneC: live("SimU.planeC"),
  uPlaneR: live("SimU.planeR"),
  uPlaneU: live("SimU.planeU"),
  uImgAspect: live("SimU.imgAspect"),
  uScrAspect: live("SimU.scrAspect"),
  uImgUv: live("storage stream uv (double-buffered)"),
  uImgSampled: live("SimU.spring.z"),
  uScatter: live("SimU.react.y (impulse force)"),
  uBounce: live("SimU.react.z (impulse force)"),
  uDisperse: live("posInit pass (enter)"),
  // souls (one force law per soul in WebGL; a force-stack module each here)
  uSoulA: state("A", "§A.2 souls"),
  uSoulB: state("A", "§A.2 souls"),
  uMix: state("A", "§A.2 souls"),
  uPasses: state("A", "§A.2 souls"),
  uForm: state("A", "§A.2 souls"),
  uShape: state("A", "§A.2 souls"),
  uVarOn: state("A", "§A.2 souls"),
  uVarA: state("A", "§A.2 souls"),
  uVarB: state("A", "§A.2 souls"),
  uVarC: state("A", "§A.2 souls"),
  uCamAz: state("A", "§A.2 souls"),
  uPull: state("A", "§A.2 souls"),
  uInst: state("A", "§A.2 souls", "field mode"),
  uInstSeed: state("A", "§A.2 souls"),
  uUnfold: state("A", "§A.2 souls"),
  uUnfoldT: state("A", "§A.2 souls"),
  // respawn / wrap modes
  uSmokeW: planned("C", "§C fluid", "smoke becomes a real fluid soul"),
  uInkW: planned("C", "§C fluid", "ink becomes a real fluid soul"),
  uWrap: planned("A", "§A.2 souls", "wrap + respawn module"),
  uFountainW: planned("A", "§A.2 souls"),
  uRiseW: planned("A", "§A.2 souls"),
  uRiseTop: planned("A", "§A.2 souls"),
  // musical / scene forces
  uHover: state("A", "§A.3 force stack"),
  uMelody: state("A", "§A.3 force stack", "melody + follow"),
  uMelodyW: state("A", "§A.3 force stack"),
  uCur: state("A", "§A.3 force stack", "harmonic currents"),
  uCurEye: state("A", "§A.3 force stack"),
  uCurRight: state("A", "§A.3 force stack"),
  uBreath: state("A", "§A.3 force stack"),
  uGravA: state("A", "§A.3 force stack", "light gravity"),
  uGravB: state("A", "§A.3 force stack"),
  uGravG: state("A", "§A.3 force stack"),
  uGravE: state("A", "§A.3 force stack"),
  uHands: planned("A", "§A.3 force stack", "two hands"),
  uHandsEye: planned("A", "§A.3 force stack"),
  uHandsRight: planned("A", "§A.3 force stack"),
  uScoreN: planned("A", "§A.3 force stack", "living score"),
  uScoreA: planned("A", "§A.3 force stack"),
  uScoreB: planned("A", "§A.3 force stack"),
  uScoreAxis: planned("A", "§A.3 force stack"),
  uPairSoft: planned("E", "§E optimal transport", "spatial pairing → sliced OT"),
  // draw
  uVP: live("RenderU.viewProj (z ∈ [0, 1])"),
  uPointPx: live("RenderU.pointPx"),
  uFocal: live("RenderU.focal"),
  uAlpha: live("RenderU.alpha"),
  uPalLow: live("RenderU.palLow"),
  uPalMid: live("RenderU.palMid"),
  uPalHigh: live("RenderU.palHigh"),
  uSize: live("RenderU.sizeK"),
  uHue: live("RenderU.hue"),
  uSat: live("RenderU.sat"),
  uDensity: live("RenderU.density"),
  uTimeD: live("RenderU.time"),
  uViewPx: live("RenderU.viewport"),
  uStVp: live("energy-conserving sprites replace the stable-mote coverage path"),
  uHeightCol: planned("A", "§A.5 draw features"),
  uHueSpread: state("A", "§A.5 draw features"),
  uHueWave: state("A", "§A.5 draw features"),
  uWorldFade: state("A", "§A.4 image timeline"),
  uImgA: planned("A", "§A.5 draw features", "worn image colours"),
  uImgB: planned("A", "§A.5 draw features"),
  uColorMix: planned("A", "§A.4 image timeline"),
  uImgGain: planned("A", "§A.5 draw features"),
  uImgTint: state("A", "§A.5 draw features"),
  uFire: state("A", "§A.5 draw features", "living fire (statement piano)"),
  uFireLine: state("A", "§A.5 draw features"),
  uFireR: state("A", "§A.5 draw features"),
  uFireU: state("A", "§A.5 draw features"),
  uDof: planned("B", "§B.3 cinematic look", "binned DOF"),
  uFocusD: planned("B", "§B.3 cinematic look"),
  uDrift: planned("B", "§B.3 cinematic look"),
  uBridge: state("A", "§A.5 draw features", "the bridge"),
  uBridgeA: planned("A", "§A.5 draw features"),
  uBridgeB: planned("A", "§A.5 draw features"),
  uBridgeMix: state("A", "§A.5 draw features"),
  uBridgeDrift: state("A", "§A.5 draw features"),
  uBridgeFrac: state("A", "§A.5 draw features"),
  uBridgeAsp: state("A", "§A.5 draw features"),
  uBridgeR: state("A", "§A.5 draw features"),
  uBridgeU: state("A", "§A.5 draw features"),
  uTrail: planned("B", "§B.4 velocity streaks"),
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
  { journey: "first-snow", moment: "emblem variants (snowflake-1…7): gather, hold, release at the calm pace (setImagePace 0.6), spatially paired", surface: ["loadFormImage", "setImageForm", "setImagePace", "setImageLiteral", "setImageScale"], status: "state", phase: "A", plan: "§A.4/§A.5 (+ §E pairing)", labCase: "snowflake-emblems" },
  { journey: "first-snow", moment: "calm form holds (~25–32 s), slow breath, gentle dolly — never 'changing its mind'", surface: ["setSoul", "setShape", "settledFor", "setCamScale", "setBreath"], status: "state", phase: "A", plan: "§A.2/§A.3", labCase: "snowflake-calm" },
  { journey: "first-snow", moment: "murmuration opening; swell eases in (no brightness jump); Silk Threads", surface: ["setSoul", "enter", "setGain"], status: "state", phase: "A", plan: "§A.2", labCase: "snowflake-calm" },
  { journey: "ghost", moment: "opening: emblem → slow blob rising IN PLACE over the tunnel, fine motes (size 0.85, no offset)", surface: ["setSoul", "setSizeScale", "setOffset", "setImageForm"], status: "state", phase: "A", plan: "§A.2", labCase: "ghost-opening" },
  { journey: "ghost", moment: "the angel flash: approach ramp, the field meets the angel on the beat (flash pace, glide=false), wears it, dissipates; the outline treatment", surface: ["loadFormImage", "setImageForm", "impulse", "imageLevel"], status: "live", phase: "A", plan: "§A.4 (colours §A.5)", labCase: "ghost-angel" },
  { journey: "ghost", moment: "blossom → wings hover hand-off (no back-and-forth); no stall on the final wings", surface: ["loadFormImage", "setHover", "setImageForm", "imageState"], status: "state", phase: "A", plan: "§A.3 hover", labCase: "ghost-blossom-wings" },
  { journey: "ghost", moment: "spirit soul, no ribbons, never green; recycled motes fade in by age, staggered (no bunching at the top after the flash)", surface: ["setSoul", "setPalette"], status: "state", phase: "A", plan: "§A.2 respawn module", labCase: "ghost-angel" },
  { journey: "ghost", moment: "quiet imaging: further, sparser, beside the imagery", surface: ["setOffset", "setDensity", "setCamScale"], status: "live", phase: "A", plan: "§A", labCase: "ghost-opening" },
];

export function paritySummary(table: Record<string, ParityEntry>): Record<ParityStatus, number> {
  const out: Record<ParityStatus, number> = { live: 0, state: 0, planned: 0 };
  for (const e of Object.values(table)) out[e.status]++;
  return out;
}
