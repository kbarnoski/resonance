// ─────────────────────────────────────────────────────────────────────────────
// loom.ts — Multi-agent iterative caption refinement loom for "454 Piano
// Caption Loom"
//
// THE CORE IDEA (arXiv 2507.20536 "T2I-Copilot" + arXiv 2511.11483 "ImAgent"):
//   A training-free multi-agent loop proposes a caption from musical features,
//   a critic evaluates it against the emotion target (valence-arousal from
//   Russell 1980 circumplex / arXiv 2512.23320), and revisers tighten each
//   clause. You watch the prompt IMPROVE over 2-3 visible rounds.
//
// Architecture (deterministic, no LLM calls — runs in 1-2 seconds of animation):
//   Round 0 — Draft:
//     Four specialist proposers emit independent clauses:
//       • SceneProposer  → setting/subject from modality + dynamics
//       • PaletteProposer → hue/color from dominant pitch-class + valence
//       • MotionProposer  → movement/energy from arousal + onset density
//       • StyleProposer   → artistic style from consonance + phrase context
//   Round 1 — Critique:
//     CriticAgent checks each clause against the emotion target and produces
//     concrete, specific critiques ("palette too cool for warm valence",
//     "motion descriptor doesn't match high arousal").
//   Round 2 — Revision:
//     Each specialist revises its clause in response to the critique.
//   Final caption = revised clauses joined; the loom records all rounds for
//   the visible HUD.
// ─────────────────────────────────────────────────────────────────────────────

import type { MusicalFrame } from "./analysis";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClauseSet {
  scene: string;
  palette: string;
  motion: string;
  style: string;
}

export interface LoomRound {
  roundNum: number;          // 0 = draft, 1 = first revision, 2 = final
  label: string;             // "Draft" | "Revised" | "Final"
  clauses: ClauseSet;
  caption: string;           // joined caption
  critiques: string[];       // from the critic on THIS round (empty on final)
  confidence: number;        // 0-1 how well it matches the emotion target
  changedKeys: string[];     // which clauses changed vs prev round
}

export interface LoomResult {
  rounds: LoomRound[];
  finalCaption: string;
  valenceTarget: number;
  arousalTarget: number;
}

// ── Vocabulary tables ─────────────────────────────────────────────────────────

const PC_NAMES: readonly string[] = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

// Pitch-class → palette adjective (for PaletteProposer)
const PC_PALETTE: readonly string[] = [
  "verdant emerald",     // C
  "cerulean blue",       // C#
  "turquoise shimmer",   // D
  "indigo violet",       // D#
  "rose crimson",        // E
  "amber honey",         // F
  "burnt sienna",        // F#
  "warm golden",         // G
  "forest viridian",     // G#
  "cobalt sapphire",     // A
  "magenta blush",       // A#
  "silver moonlight",    // B
];

// ── Proposer helpers ──────────────────────────────────────────────────────────

function proposeScene(frame: MusicalFrame): string {
  const { rms, modality, consonance } = frame;

  if (modality === "major" && consonance > 0.55) {
    if (rms < 0.1) return "a sunlit interior room, dust motes drifting in shafts of morning light";
    if (rms < 0.3) return "an open meadow at golden hour, slow gentle wind across tall grass";
    return "a radiant cathedral nave, light flooding through stained glass";
  }
  if (modality === "major") {
    if (rms < 0.12) return "a quiet garden bench, late afternoon warmth";
    return "a living room fireplace, soft amber glow, book on armrest";
  }
  if (modality === "minor" && consonance > 0.5) {
    if (rms < 0.08) return "a deserted pier at dusk, mist on dark water";
    if (rms < 0.25) return "a forest clearing at twilight, blue hour shadows";
    return "a storm rolling over open ocean, dramatic dark sky";
  }
  if (modality === "minor") {
    if (rms < 0.1) return "a night city street in rain, neon reflections";
    return "a mountain pass in cloud, wind-swept grey cliffs";
  }
  // chromatic
  if (rms < 0.1) return "a liminal corridor, undefined geometry, soft haze";
  return "an abstract void, shifting iridescent planes";
}

function proposePalette(frame: MusicalFrame): string {
  const { dominantPc, valence, modality } = frame;
  const pcColor = PC_PALETTE[dominantPc] ?? "violet";
  const keyName = PC_NAMES[dominantPc] ?? "C";

  if (valence > 0.4) {
    return `warm ${pcColor} tones with luminous gold highlights, key of ${keyName}`;
  }
  if (valence > 0.0) {
    return `soft ${pcColor} with gentle amber accents, muted warmth, key of ${keyName}`;
  }
  if (valence > -0.4) {
    if (modality === "minor") {
      return `cool ${pcColor} with indigo shadows, dusky rose undertones, key of ${keyName}`;
    }
    return `neutral ${pcColor} tones, grey-silver highlights, key of ${keyName}`;
  }
  return `deep desaturated ${pcColor}, near-monochrome with dark indigo undertones, key of ${keyName}`;
}

function proposeMotion(frame: MusicalFrame): string {
  const { arousal, onsetsPerMin } = frame;

  if (arousal > 0.5) return `dynamic swirling turbulence, ${Math.round(onsetsPerMin)} impulses per minute, energetic cascade`;
  if (arousal > 0.1) return `slowly drifting volumetric tendrils, measured pulse, ${Math.round(onsetsPerMin)} beats per minute`;
  if (arousal > -0.2) return `gentle undulating mist, barely perceptible drift, quiet breath`;
  return `perfectly still, suspended crystalline moment, absolute stillness`;
}

function proposeStyle(frame: MusicalFrame): string {
  const { consonance, modality } = frame;
  const base = "abstract volumetric light responding to solo grand piano, latent dreamscape, cinematic";

  if (consonance > 0.6 && modality === "major") {
    return `${base}, Refik Anadol luminous data-painting, soft caustics, no text`;
  }
  if (consonance > 0.4) {
    return `${base}, Memo Akten contemplative learning-to-see aesthetic, painterly, no text`;
  }
  if (modality === "minor") {
    return `${base}, dark volumetric chiaroscuro, deep-shadow painterly, no text`;
  }
  return `${base}, chromatic iridescent data-pigment, prismatic, no text`;
}

function buildCaption(c: ClauseSet): string {
  return `${c.scene}, ${c.palette}, ${c.motion}, ${c.style}`;
}

// ── Critic ────────────────────────────────────────────────────────────────────

interface CritiqueResult {
  critiques: string[];
  confidence: number;
  fixes: Partial<ClauseSet>;
}

function runCritic(
  clauses: ClauseSet,
  frame: MusicalFrame,
  roundNum: number
): CritiqueResult {
  const { valence, arousal, modality, consonance, rms } = frame;
  const critiques: string[] = [];
  const fixes: Partial<ClauseSet> = {};

  // ── Palette check: does the warmth match valence? ─────────────────────────
  const paletteLower = clauses.palette.toLowerCase();
  const paletteCool = paletteLower.includes("cool") || paletteLower.includes("indigo") ||
    paletteLower.includes("cerulean") || paletteLower.includes("cobalt") ||
    paletteLower.includes("silver") || paletteLower.includes("grey");
  const paletteWarm = paletteLower.includes("warm") || paletteLower.includes("amber") ||
    paletteLower.includes("gold") || paletteLower.includes("rose") ||
    paletteLower.includes("sienna") || paletteLower.includes("honey");

  if (valence > 0.3 && paletteCool && !paletteWarm) {
    critiques.push("palette too cool for this warm/major phrase — needs golden warmth");
    fixes.palette = `warm golden amber with honey highlights, luminous brightness, valence +${valence.toFixed(2)}`;
  } else if (valence < -0.2 && paletteWarm && !paletteCool) {
    critiques.push("palette too warm for this dark/minor phrase — should be cooler");
    fixes.palette = `cool indigo-slate with dusky undertones, low luminance, valence ${valence.toFixed(2)}`;
  }

  // ── Motion check: does the energy match arousal? ──────────────────────────
  const motionLower = clauses.motion.toLowerCase();
  const motionCalm = motionLower.includes("still") || motionLower.includes("barely") ||
    motionLower.includes("crystalline") || motionLower.includes("quiet");
  const motionActive = motionLower.includes("dynamic") || motionLower.includes("turbulence") ||
    motionLower.includes("cascade") || motionLower.includes("energetic");

  if (arousal > 0.4 && motionCalm) {
    critiques.push("motion descriptor too calm for high arousal — needs more kinetic energy");
    const opm = Math.round(frame.onsetsPerMin);
    fixes.motion = `explosive kinetic turbulence, ${opm} rapid impulses per minute, surging cascade`;
  } else if (arousal < -0.2 && motionActive) {
    critiques.push("motion too energetic for this quiet/low-arousal moment — should breathe");
    fixes.motion = `suspended delicate stillness, barely-there wisp of vapor, no motion`;
  }

  // ── Scene check: is it too generic? ──────────────────────────────────────
  if (roundNum === 0) {
    const sceneLower = clauses.scene.toLowerCase();
    const tooGeneric = sceneLower.includes("abstract") && !sceneLower.includes("geometry");
    if (tooGeneric && consonance > 0.4) {
      critiques.push("scene is too abstract — modality is tonal, can use a more concrete setting");
      if (modality === "major") {
        fixes.scene = `a grand piano recital hall, warm candlelight, ${rms < 0.15 ? "softly lit intimate stage" : "full resonant performance space"}`;
      } else {
        fixes.scene = `a solitary piano in a dimly lit study, late night, single lamp casting long shadows`;
      }
    }
  }

  // ── Style check: does it match the overall consonance register? ───────────
  if (consonance < 0.3 && !clauses.style.toLowerCase().includes("chromatic")) {
    critiques.push("style underemphasizes the dissonance/chromatic quality of this phrase");
    fixes.style = `abstract volumetric light responding to solo grand piano, chromatic prismatic tension, fragmented iridescence, no text`;
  }

  // ── Confidence score ─────────────────────────────────────────────────────
  let conf = 0.4 + roundNum * 0.25;
  if (critiques.length === 0) conf = 0.6 + roundNum * 0.2;
  if (Object.keys(fixes).length === 0) conf = Math.min(1.0, conf + 0.15);
  conf = Math.min(1.0, conf);

  return { critiques, confidence: conf, fixes };
}

// ── Revise ────────────────────────────────────────────────────────────────────

function applyRevisions(
  prev: ClauseSet,
  fixes: Partial<ClauseSet>,
  frame: MusicalFrame,
  round: number
): ClauseSet {
  const revised: ClauseSet = { ...prev };

  if (fixes.scene) revised.scene = fixes.scene;
  if (fixes.palette) revised.palette = fixes.palette;
  if (fixes.motion) revised.motion = fixes.motion;
  if (fixes.style) revised.style = fixes.style;

  // Additional specificity pass on the final round even without critiques
  if (round >= 2) {
    const { valence, arousal, dynamicsLabel } = frame;
    const emotionTag = `${dynamicsLabel}, valence ${valence > 0 ? "+" : ""}${valence.toFixed(1)}, arousal ${arousal > 0 ? "+" : ""}${arousal.toFixed(1)}`;
    // Append emotion anchor to style for maximum image-emotion alignment
    if (!revised.style.includes("valence")) {
      revised.style = revised.style.replace(", no text", `, emotion: ${emotionTag}, no text`);
    }
  }

  return revised;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run the full multi-round loom synchronously.
 * Returns all rounds so the UI can animate them.
 */
export function runLoom(frame: MusicalFrame): LoomResult {
  const { valence, arousal } = frame;
  const rounds: LoomRound[] = [];

  // ── Round 0: Draft ────────────────────────────────────────────────────────
  const draft: ClauseSet = {
    scene: proposeScene(frame),
    palette: proposePalette(frame),
    motion: proposeMotion(frame),
    style: proposeStyle(frame),
  };

  const { critiques: c0, confidence: conf0, fixes: f0 } = runCritic(draft, frame, 0);

  rounds.push({
    roundNum: 0,
    label: "Draft",
    clauses: draft,
    caption: buildCaption(draft),
    critiques: c0,
    confidence: conf0,
    changedKeys: [],
  });

  // ── Round 1: Revision ─────────────────────────────────────────────────────
  const rev1 = applyRevisions(draft, f0, frame, 1);
  const changed1 = (Object.keys(f0) as Array<keyof ClauseSet>).filter(k => rev1[k] !== draft[k]);

  const { critiques: c1, confidence: conf1, fixes: f1 } = runCritic(rev1, frame, 1);

  rounds.push({
    roundNum: 1,
    label: "Revised",
    clauses: rev1,
    caption: buildCaption(rev1),
    critiques: c1,
    confidence: conf1,
    changedKeys: changed1,
  });

  // ── Round 2: Final ────────────────────────────────────────────────────────
  const rev2 = applyRevisions(rev1, f1, frame, 2);
  const changed2 = (Object.keys({ ...f0, ...f1 }) as Array<keyof ClauseSet>)
    .filter(k => rev2[k] !== rev1[k]);

  rounds.push({
    roundNum: 2,
    label: "Final",
    clauses: rev2,
    caption: buildCaption(rev2),
    critiques: [],   // no further critique
    confidence: Math.min(1.0, conf1 + 0.15),
    changedKeys: changed2,
  });

  return {
    rounds,
    finalCaption: rounds[rounds.length - 1].caption,
    valenceTarget: valence,
    arousalTarget: arousal,
  };
}
