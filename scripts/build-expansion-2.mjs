// Expansion set 2 → 43 journeys appended to the Expansion path, and the
// whole Expansion (set 1's six + these) converted to KINETIC WITH IMAGING
// (Karel 2026-10-01: "just make all in expansion and these batches
// kinetic with the imaging as well").
//
// - Worlds: scripts/expansion2-worlds.mjs (theme law: analysis + mood +
//   name + lyrics; one domain per take, families per piece).
// - Each phase = 3-shot aiPromptSequence (spec law 1: music video, not
//   a photo series): the world line + a micro study + an abstract study.
// - Kinetic: audio_reactive=true (real FFT) + an explicit shaderModes
//   cast per phase (the engine does NOT regenerate shaders for kinetic
//   journeys — empty shaderModes would collapse to one shader). One
//   exclusive lead per PIECE (PIECE_LEADS), shared support collage.
// - Name-based species flag lives in src/lib/journeys/kinetic.ts
//   (EXPANSION_KINETIC_NAMES) — keep the two lists in sync.
//
// Idempotent: re-running updates journeys found by recording_id.
// Usage: node --env-file=.env.local scripts/build-expansion-2.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { WORLDS, PIECE_LEADS, SUPPORT_POOL, pieceOf } from "./expansion2-worlds.mjs";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";
const tracks = JSON.parse(readFileSync("scripts/expansion2-import.json", "utf8"));
const set1 = JSON.parse(readFileSync("scripts/expansion-output.json", "utf8"));

// Concert order (Karel: "after set 1's six, sensible musical order"):
// five ~30-min sets, no two takes of a piece adjacent, the Tranquility
// takes spread across sets, each set closing on an ascent or a release.
export const ORDER = [
  // Expansion I (continues set 1's six)
  "Loire 2", "Chenin 5", "Tranquility 3", "Bells 1", "Rise 1",
  // Expansion II
  "Surrounded by Light 3", "Amboise 1", "Night Wind 9", "Tranquility 8", "Never Forget 4",
  "Torraine 5", "Tranquility 30", "Yellow Bird 3", "Roll Away 8", "Singular 4",
  // Expansion III
  "The Other Side 9", "Chenin 3", "Tranquility 11", "Night Wind 5", "Cabin Soul 6",
  "Torraine 6", "Tranquility 17", "Redwoods Sway 2", "Horses 1", "Northern Plane 3",
  // Expansion IV
  "Chemiluminescence", "Tranquility 33", "Amboise 2", "Night Wind 11", "Velvet Tears 1",
  "Tranquility 34", "Yellow Bird 6", "Rattler 2", "Tranquility 21",
  // Expansion V
  "Loire 5A", "Night Wind 4", "Tranquility 35", "No question 7", "Sancerre Cry 4",
  "Tranquility 36", "Torraine 7", "Surrounded by Light 19", "Tranquility 38",
];

// SEAL RETIRED (harvest QA 2026-10-04: even under AERIAL the sealed
// deck rendered cloud seas with a sunrise on the seam). Kept for history.
// SEAL once rode with AERIAL (harvest QA 2026-10-04: on sky-facing
// worlds the sealed cloud deck became a cloud-sea horizon WITH a sunrise).
// Sun/orb guard (sample review 2026-10-01: dawn/dusk/horizon worlds
// summoned sun discs). Occupy the sky positively — never name the disc.
const SEAL = ", every source of light hidden behind a sealed deck of layered cloud, the glow arriving only as long soft horizontal seams and reflections";
// Second pass: the seal alone lost to dawn/dusk wording — horizon-led
// worlds now look DOWN so no horizon (and no disc) can enter the frame.
const AERIAL = ", seen from high above looking steeply down so the land or water fills the entire frame edge to edge, the light arriving only as soft reflections and glow across the surface";
const TAIL = ", asymmetric off-center composition with strong diagonal weight, completely uninhabited, no text no signatures no watermarks no letters no writing";

const TEMPLATE = [
  { id: "threshold", shaderOpacity: 0.60, denoisingRange: [0.3, 0.5], targetFps: 0.5, bloomIntensity: 0.1, chromaticAberration: 0.0, colorTemperature: 0, vignette: 0.35, poetryIntervalSeconds: 10, intensityMultiplier: 0.4, ambientLayers: { wind: 0.2, rain: 0, drone: 0.3, chime: 0, fire: 0 }, filmGrain: 0, particleDensity: 0.02, halation: 0.02 },
  { id: "expansion", shaderOpacity: 0.60, denoisingRange: [0.4, 0.65], targetFps: 1, bloomIntensity: 0.3, chromaticAberration: 0.03, colorTemperature: 0.1, vignette: 0.25, poetryIntervalSeconds: 7, intensityMultiplier: 0.7, ambientLayers: { wind: 0.4, rain: 0.2, drone: 0.6, chime: 0.3, fire: 0 }, filmGrain: 0, particleDensity: 0.05, halation: 0.04 },
  { id: "transcendence", shaderOpacity: 0.60, denoisingRange: [0.6, 0.85], targetFps: 2, bloomIntensity: 0.7, chromaticAberration: 0.08, colorTemperature: 0.3, vignette: 0.15, poetryIntervalSeconds: 5, intensityMultiplier: 1.0, ambientLayers: { wind: 0.7, rain: 0.5, drone: 1.0, chime: 0.6, fire: 0.2 }, filmGrain: 0, particleDensity: 0.08, halation: 0.08 },
  { id: "illumination", shaderOpacity: 0.60, denoisingRange: [0.4, 0.6], targetFps: 1, bloomIntensity: 0.4, chromaticAberration: 0.04, colorTemperature: 0.1, vignette: 0.3, poetryIntervalSeconds: 8, intensityMultiplier: 0.75, ambientLayers: { wind: 0.35, rain: 0.15, drone: 0.5, chime: 0.4, fire: 0 }, filmGrain: 0, particleDensity: 0.04, halation: 0.05 },
  { id: "return", shaderOpacity: 0.60, denoisingRange: [0.25, 0.45], targetFps: 0.5, bloomIntensity: 0.2, chromaticAberration: 0.05, colorTemperature: -0.1, vignette: 0.3, poetryIntervalSeconds: 10, intensityMultiplier: 0.5, ambientLayers: { wind: 0.2, rain: 0.05, drone: 0.25, chime: 0.15, fire: 0 }, filmGrain: 0, particleDensity: 0.02, halation: 0.03 },
  { id: "integration", shaderOpacity: 0.60, denoisingRange: [0.2, 0.35], targetFps: 0.5, bloomIntensity: 0.1, chromaticAberration: 0.0, colorTemperature: -0.2, vignette: 0.4, poetryIntervalSeconds: 15, intensityMultiplier: 0.3, ambientLayers: { wind: 0.1, rain: 0, drone: 0.15, chime: 0.1, fire: 0 }, filmGrain: 0, particleDensity: 0.01, halation: 0.01 },
];

// Shots 2 + 3 per phase: the world's micro subject and its abstract
// study, lit for the phase's place in the arc (micro → cosmic → back).
const SHOT_LIGHT = {
  threshold: ["DARK BACKGROUND — extreme close detail: %M, barely lit, deep darkness all around it", "DARK BACKGROUND — abstract: %A, only the faintest light, wide negative space"],
  expansion: ["close study: %M, the light gathering, more of the world glimpsed beyond", "%A, the light gathering and spreading outward"],
  transcendence: ["macro at the height of the light: %M, blazing, the vast world glowing beyond it", "abstract at the largest scale: %A, at full radiance, filling the frame with asymmetric weight"],
  illumination: ["close: %M, in broad steady calm light", "%A, the light broad, steady and calm"],
  return: ["close: %M, the light lowering and thinning", "%A, dimming, darkness returning between the forms"],
  integration: ["DARK BACKGROUND — close: %M, the last glow in near darkness", "DARK BACKGROUND — %A, almost entirely dark, one last trace of light"],
};
function sequenceFor(world, phaseIdx) {
  const id = TEMPLATE[phaseIdx].id;
  const [m, a] = SHOT_LIGHT[id];
  const line = world.phases[phaseIdx];
  const micro = m.replace("%M", world.micro);
  const abs = a.replace("%A", world.abstract);
  // threshold opens micro-first (archetype arc: micro -> cosmic)
  const shots = id === "threshold" ? [micro, line, abs] : id === "transcendence" ? [line, abs, micro] : [line, micro, abs];
  return shots.map((s) => s + (world.aerial ? AERIAL : "") + TAIL);
}

// Deterministic per-title PRNG so re-runs give identical casts.
function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
/** Kinetic Lab cast shape (the "Chemi template"): threshold = collage
 *  only; expansion → return = LEAD + two support; integration = two
 *  support (lead returns there on ~half the takes). */
export function castFor(title) {
  const lead = PIECE_LEADS[pieceOf(title)];
  if (!lead) throw new Error(`no lead for ${title}`);
  const rnd = seeded(title);
  const pick = (n) => {
    const pool = [...SUPPORT_POOL];
    const out = [];
    while (out.length < n) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  };
  const leadInIntegration = rnd() < 0.5;
  return {
    threshold: pick(3),
    expansion: [lead, ...pick(2)],
    transcendence: [lead, ...pick(2)],
    illumination: [lead, ...pick(2)],
    return: [lead, ...pick(2)],
    integration: leadInIntegration ? [lead, ...pick(1)] : pick(2),
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function computeBounds(notes, duration) {
  if (!Array.isArray(notes) || notes.length < 40 || !duration) return [0, 0.10, 0.26, 0.48, 0.65, 0.82, 1];
  const BIN = 0.5, n = Math.ceil(duration / BIN), e = new Array(n).fill(0);
  for (const nt of notes) { const i = Math.floor(nt.time / BIN); if (i >= 0 && i < n) e[i] += (nt.velocity ?? 64) / 127; }
  const W = Math.max(2, Math.round(6 / BIN));
  const sm = e.map((_, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - W); k <= Math.min(n - 1, i + W); k++) { s += e[k]; c++; } return s / c; });
  const max = Math.max(...sm); if (max <= 0) return [0, 0.10, 0.26, 0.48, 0.65, 0.82, 1];
  const norm = sm.map((v) => v / max), frac = (i) => (i * BIN) / duration;
  let tp = 0, best = -1; for (let i = Math.floor(0.15 * n); i < Math.floor(0.88 * n); i++) if (norm[i] > best) { best = norm[i]; tp = i; }
  let a = tp, b = tp; while (a > 0 && norm[a - 1] >= 0.72) a--; while (b < n - 1 && norm[b + 1] >= 0.72) b++;
  let t2 = clamp(frac(a), 0.16, 0.55), t3 = clamp(frac(b + 1), t2 + 0.12, 0.72);
  let r = 0; while (r < n && norm[r] < 0.28) r++;
  let t1 = clamp(frac(r), 0.05, Math.min(0.16, t2 - 0.06));
  let f = b; while (f < n - 1 && norm[f] >= 0.5) f++;
  let t4 = clamp(frac(f), t3 + 0.06, 0.84);
  let t5 = clamp(t4 + (1 - t4) * 0.55, t4 + 0.05, 0.92);
  const bounds = [0, t1, t2, t3, t4, t5, 1];
  for (let i = 1; i < 6; i++) if (bounds[i] < bounds[i - 1] + 0.05) bounds[i] = bounds[i - 1] + 0.05;
  if (bounds[5] > 0.95) bounds[5] = 0.95;
  return bounds.map((x) => Number(x.toFixed(3)));
}

if (process.argv[1]?.endsWith("build-expansion-2.mjs")) {
  if (new Set(ORDER).size !== tracks.length || tracks.some((t) => !ORDER.includes(t.title))) {
    throw new Error("ORDER must list every imported title exactly once");
  }
  const byTitle = new Map(tracks.map((t) => [t.title, t]));
  const results = [];
  for (const title of ORDER) {
    const t = byTitle.get(title);
    const world = WORLDS[title];
    if (!world) throw new Error(`no world for ${title}`);
    const { data: an } = await supabase.from("analyses").select("notes").eq("recording_id", t.id).single();
    const bounds = computeBounds(an?.notes, t.duration);
    const cast = castFor(title);
    const phases = TEMPLATE.map((tpl, i) => {
      const seq = sequenceFor(world, i);
      return {
        ...tpl,
        start: bounds[i], end: bounds[i + 1],
        shaderModes: cast[tpl.id],
        aiPrompt: seq[0],
        aiPromptSequence: seq,
        aiPromptModifiers: {},
        poetryMood: world.mood,
        guidancePhrases: [],
        voice: world.voice,
        palette: world.palette,
      };
    });
    const theme = {
      visualVocabulary: { environments: [], entities: [], textures: [], atmospheres: [] },
      shaderCategories: world.cats,
      palette: world.palette,
      voice: world.voice,
      poetryImagery: world.phases[2].slice(0, 120),
      poetryMood: world.mood,
      ambientTheme: world.ambient,
      worldRationale: world.why,
      leadActor: PIECE_LEADS[pieceOf(title)],
    };
    const fields = {
      name: title, subtitle: "", description: `"${title}" from the Expansion set by Karel Barnoski.`,
      story_text: null, realm_id: "custom", phases, theme,
      creator_name: "Karel Barnoski", audio_reactive: true, is_public: false,
    };
    const { data: existing } = await supabase.from("journeys").select("id").eq("recording_id", t.id).eq("user_id", USER_ID).maybeSingle();
    let id = existing?.id, error;
    if (id) ({ error } = await supabase.from("journeys").update(fields).eq("id", id));
    else {
      const ins = await supabase.from("journeys").insert({ ...fields, user_id: USER_ID, recording_id: t.id, share_token: randomUUID().replace(/-/g, "").slice(0, 16) }).select("id").single();
      error = ins.error; id = ins.data?.id;
    }
    console.log(`${error ? "x " + error.message : existing ? "~" : "+"} ${title.padEnd(24)} lead ${cast.expansion[0].padEnd(16)} bounds ${bounds.slice(1, 6).map((b) => b.toFixed(2)).join(" ")}`);
    if (!error) results.push({ order: results.length + 7, journeyId: id, recordingId: t.id, title, lead: cast.expansion[0] });
  }

  // ── Set 1 → kinetic with imaging: audio_reactive + explicit casts.
  for (const j of set1.journeys) {
    const cast = castFor(j.title);
    const { data: row, error } = await supabase.from("journeys").select("phases").eq("id", j.journeyId).single();
    if (error) throw error;
    const phases = row.phases.map((ph) => ({ ...ph, shaderModes: cast[ph.id] ?? ph.shaderModes }));
    const { error: e2 } = await supabase.from("journeys").update({ phases, audio_reactive: true }).eq("id", j.journeyId);
    console.log(`${e2 ? "x " + e2.message : "k"} ${j.title.padEnd(24)} lead ${cast.expansion[0]} (set 1 → kinetic)`);
  }

  // ── Expansion path: set 1's six, then the new 43 in concert order.
  const journeyIds = [...set1.journeys.map((j) => j.journeyId), ...results.map((r) => r.journeyId)];
  const { error: pErr } = await supabase.from("journey_paths").update({
    journey_ids: journeyIds,
    subtitle: `${journeyIds.length} pieces`,
    description: "The Expansion set — new pieces, each its own world, where the light listens: bass, mids and highs each move a layer while the imagery travels.",
  }).eq("id", set1.pathId);
  if (pErr) throw pErr;
  writeFileSync("scripts/expansion2-output.json", JSON.stringify({ pathId: set1.pathId, pathShareToken: set1.pathShareToken, journeys: results }, null, 2));
  console.log(`\nExpansion path now ${journeyIds.length} journeys → scripts/expansion2-output.json`);
}
