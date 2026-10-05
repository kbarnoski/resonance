#!/usr/bin/env node
// Oct 4 2026 studio session → 7 classic journeys + the path
// "Studio — Oct 4 2026" (not in the kiosk setlist yet).
//
// Everything structural comes from each track's v2 DEEP ANALYSIS
// (analyses.summary, src/lib/audio/deep-summary.ts), never a template:
//  - phase boundaries = the measured sections grouped into the 6 engine
//    phases (most homogeneous intensity per phase, transcendence/peak
//    imagery wherever the music's climax actually is);
//  - per-phase intensityMultiplier = the sections' measured intensity, so
//    the engine's sparse-shader passage lands in the music's real valley;
//  - post FX toned (Karel 2026-10-05): bloom ≤ 0.4, colorTemperature 0–0.1
//    (warmer on brighter valence), vignette 0.2–0.35, halation ≤ 0.1;
//  - worlds (scripts/oct4-worlds.mjs) = f(deep analysis + name), each
//    phase a 3-shot aiPromptSequence (music video, not photo series);
//  - shaders: vetted pool (scripts/shader-vetting.json, Karel-rejected /
//    blocklisted / geometry / 3D / Kinetic-Lab leads removed), 8–10 per
//    journey on contiguous runs, ≥ 3 per phase, NO shader shared between
//    the 7, palette-fit, calmer shaders on quieter phases, least-used
//    first across the library.
// Idempotent (updates journeys found by recording_id).
// Usage: node --env-file=.env.local scripts/build-oct4-studio.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WORLDS, ORDER } from "./oct4-worlds.mjs";

const DRY = process.argv.includes("--dry-run");
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
const J = await jiti.import("../src/lib/journeys/journeys.ts");
const REG = await jiti.import("../src/lib/shaders/index.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";
const tracks = JSON.parse(readFileSync("scripts/oct4-import.json", "utf8"));
const vet = JSON.parse(readFileSync("scripts/shader-vetting.json", "utf8"));
const V = vet.verdicts;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

// ── shader pool (same filter as recast-featured / recast-expansion) ──
const KAREL_REJECTED = ["chakra", "redshift", "gnosis", "biolume", "coral", "r3-balllightning", "sparkler"];
const KINETIC_LAB_LEADS = ["sparkler", "comet-swarm", "helix-stream", "ember-fountain", "galaxy-seed"];
const GEOMETRY = new Set(REG.MODE_META.filter((m) => m.category === "Geometry").map((m) => m.mode));
// moon-themed shaders are banned globally; rain family banned app-wide
const EXTRA_BANS = ["r-petals", "selene", "blood-moon", "eclipse-ring", "rain", "night-rain", "monsoon", "r3-monsoonveil", "torrent", "deluge"];
const REJ = new Set([...KAREL_REJECTED, ...KINETIC_LAB_LEADS, ...J.GLOBAL_SHADER_BLOCKLIST, ...J.PICKTIME_SHADER_BLOCKLIST, ...EXTRA_BANS]);
const POOL = vet.pool.filter((m) => !REJ.has(m) && !GEOMETRY.has(m) && !REG.MODES_3D.has(m) && REG.SHADERS[m] && !(V[m].reasons ?? []).some((x) => /karelRejected/.test(x)));
const effMean = (m) => V[m].mean * V[m].gain;

// palette fit (mirror of recast-featured)
const RING = ["ember", "gold", "green", "teal", "blue", "violet", "magenta"];
function hsv(hex) { const n = parseInt(hex.replace("#", ""), 16); const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d > 0) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); } return { h: ((h % 360) + 360) % 360, s: mx ? d / mx : 0, v: mx }; }
function fam(h) { return h >= 345 || h < 25 ? "ember" : h < 70 ? "gold" : h < 160 ? "green" : h < 200 ? "teal" : h < 250 ? "blue" : h < 305 ? "violet" : "magenta"; }
function paletteFamilies(p) { const core = new Set(), near = new Set(); for (const k of ["primary", "accent", "glow"]) { if (!p?.[k]) continue; const c = hsv(p[k]); if (c.s < 0.2 || c.v < 0.15) continue; const i = RING.indexOf(fam(c.h)); if (k === "primary") core.add(RING[i]); near.add(RING[i]); near.add(RING[(i + 1) % 7]); near.add(RING[(i + 6) % 7]); } return { core, near }; }
function fit(mode, pf) { const h = V[mode]?.hue ?? "neutral"; if (pf.core.has(h)) return 3; if (pf.near.has(h)) return 2; if (h === "prismatic" || h === "neutral") return 1; return 0; }

import { groupPhases, PHASE_IDS } from "./lib/phase-grouping.mjs";

// Shot lighting keyed by the phase's ROLE in this piece's measured arc.
const SHOT_LIGHT = {
  dark: ["DARK BACKGROUND — extreme close detail: %M, barely lit, deep darkness all around it", "DARK BACKGROUND — abstract: %A, only the faintest light, wide negative space"],
  gathering: ["close study: %M, the light gathering, more of the world glimpsed beyond", "%A, the light gathering and spreading outward"],
  peak: ["macro at the height of the light: %M, glowing at full strength, the vast world beyond it", "abstract at the largest scale: %A, at full radiance, filling the frame with asymmetric weight"],
  calm: ["close: %M, in broad steady calm light", "%A, the light broad, steady and calm"],
  lowering: ["close: %M, the light lowering and thinning", "%A, dimming, darkness returning between the forms"],
  last: ["DARK BACKGROUND — close: %M, the last glow in near darkness", "DARK BACKGROUND — %A, almost entirely dark, one last trace of light"],
};
const TAIL = ", asymmetric off-center composition with strong diagonal weight, completely uninhabited, no text no signatures no watermarks no letters no writing";
const ROLE_GRADE = { dark: "threshold", gathering: "expansion", peak: "transcendence", calm: "illumination", lowering: "return", last: "integration" };
function roleOf(ph, i, phases) {
  const peak = phases.reduce((b, p, k) => (p.intensity > phases[b].intensity ? k : b), 0);
  if (i === peak) return "peak";
  if (i === 0) return ph.intensity >= 0.6 ? "gathering" : "dark";
  if (i === 5) return ph.intensity >= 0.6 ? "calm" : "last"; // resurgent endings stay lit
  if (i < peak) return "gathering";
  return ph.intensity >= 0.55 ? "calm" : "lowering";
}
function sequenceFor(world, i, role) {
  const [m, a] = SHOT_LIGHT[role];
  const line = world.phases[i];
  const micro = m.replace("%M", world.micro);
  const abs = a.replace("%A", world.abstract);
  const shots = i === 0 ? [micro, line, abs] : role === "peak" ? [line, abs, micro] : [line, micro, abs];
  return shots.map((s) => s + TAIL);
}

// ── post FX from the music ──
function postFor(ph) {
  const I = Math.max(0, Math.min(1, ph.intensity));
  return {
    bloomIntensity: r2(0.08 + 0.32 * I),                                  // ≤ 0.40
    colorTemperature: r2(Math.max(0, Math.min(0.1, 0.05 + 0.08 * ph.valence))), // 0–0.10
    vignette: r2(0.35 - 0.15 * I),                                        // 0.20–0.35
    halation: r2(0.02 + 0.08 * I),                                        // ≤ 0.10
    chromaticAberration: 0,
    filmGrain: 0,
    intensityMultiplier: r2(0.3 + 0.7 * I),
    shaderOpacity: 0.6,
    particleDensity: r2(0.01 + 0.07 * I),
    targetFps: I > 0.75 ? 1.5 : I > 0.45 ? 1 : 0.5,
    denoisingRange: [r2(0.25 + 0.3 * I), r2(0.4 + 0.4 * I)],
    poetryIntervalSeconds: Math.round(14 - 8 * I),
    ambientLayers: { wind: r2(0.15 + 0.5 * I), rain: 0, drone: r2(0.2 + 0.7 * I), chime: r2(0.1 + 0.4 * I), fire: 0 },
  };
}

// ── shader casting ──
function seeded(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
const { data: allJ } = await sb.from("journeys").select("id,recording_id,phases");
const ourRecs = new Set(tracks.map((t) => t.id));
const libUse = new Map();
for (const j of allJ ?? []) {
  if (ourRecs.has(j.recording_id)) continue;
  for (const m of new Set((j.phases ?? []).flatMap((p) => p.shaderModes ?? []))) libUse.set(m, (libUse.get(m) ?? 0) + 1);
}
const usedBySet = new Set();
// Shader FAMILIES gated by the music: fire only where the world is
// literally ember/flame (world.fire), storm/void shaders only for pieces
// the analysis measures as dark (minor-weight ≥ 0.5 or negative valence).
const FIRE = new Set(["magma", "flame", "furnace", "volcanic", "iron-forge", "molten-vein", "shadow-fire", "r-embers", "ember", "maelstrom-dark"]);
const STORM = new Set(["typhoon", "torrent", "monsoon", "r3-plasmastorm", "r3-lightningveil", "supernova", "event-horizon", "r-blackhole", "singularity", "dark-nebula", "nadir", "dark-tide", "obsidian-flow"]);
const CAT = Object.fromEntries(REG.MODE_META.map((m) => [m.mode, m.category]));
function castFor(title, phases, world, S) {
  const rnd = seeded(title);
  const dur = phases[5].endSec;
  const K = dur > 280 ? 10 : dur > 160 ? 9 : 8;
  const pf = paletteFamilies(world.palette);
  const dark = (S.mode_balance?.minorWeight ?? 0) >= 0.5 || (S.mood?.valence ?? 0) < 0;
  const allowed = (m) => (!FIRE.has(m) || (world.fire ?? []).includes(m)) && (!STORM.has(m) || dark);
  const cands = POOL.filter((m) => !usedBySet.has(m) && allowed(m)).map((m) => ({ m, fit: fit(m, pf) + (world.cats.includes(CAT[m]) ? 1 : 0), use: libUse.get(m) ?? 0, bright: effMean(m), j: rnd() }));
  // score: palette + category fit first, then least-used in the library, jittered
  cands.sort((a, b) => (b.fit * 2 - b.use * 0.15 + b.j) - (a.fit * 2 - a.use * 0.15 + a.j));
  // at most 3 storm/void shaders even in the darkest piece (it still has clearings)
  const chosen = [];
  let storm = 0;
  for (const c of cands) {
    if (chosen.length >= K) break;
    if (STORM.has(c.m)) { if (storm >= 3) continue; storm++; }
    chosen.push(c);
  }
  // brightness order → calm shaders where the music is quiet, brighter at the peak
  chosen.sort((a, b) => a.bright - b.bright);
  chosen.forEach((c) => usedBySet.add(c.m));
  // Each shader owns a contiguous run of phases. Spread K shaders over 6
  // phases: shader k's centre follows the phase intensity rank.
  const rank = phases.map((p, i) => ({ i, I: p.intensity })).sort((a, b) => a.I - b.I);
  const phaseOrderByCalm = rank.map((r) => r.i);
  const runs = chosen.map((c, k) => {
    const centre = phaseOrderByCalm[Math.min(5, Math.floor((k / K) * 6))];
    const span = 1 + Math.floor(rnd() * 2); // 2–3 phases long
    const a = Math.max(0, Math.min(5 - span + 1, centre - Math.floor(rnd() * (span + 1))));
    return { m: c.m, a, b: Math.min(5, a + span) };
  });
  const cast = phases.map((_, i) => runs.filter((r) => i >= r.a && i <= r.b).map((r) => r.m));
  // guarantee ≥ 3 per phase by extending the nearest run (keeps contiguity)
  for (let i = 0; i < 6; i++) {
    while (cast[i].length < 3) {
      const r = runs.filter((x) => !cast[i].includes(x.m)).sort((x, y) => Math.min(Math.abs(x.a - i), Math.abs(x.b - i)) - Math.min(Math.abs(y.a - i), Math.abs(y.b - i)))[0];
      if (i < r.a) r.a = i; else r.b = i;
      for (let k = r.a; k <= r.b; k++) if (!cast[k].includes(r.m)) cast[k].push(r.m);
    }
  }
  // cap at 5 per phase (primary + dual + tertiary + rotation)
  return cast.map((c) => c.slice(0, 5));
}

// ── build ──
const results = [];
const report = [];
for (const title of ORDER) {
  const t = tracks.find((x) => x.title === title);
  const world = WORLDS[title];
  if (!t || !world) throw new Error(`missing track/world for ${title}`);
  const { data: an, error } = await sb.from("analyses").select("summary,tempo,key_signature").eq("recording_id", t.id).single();
  if (error) throw error;
  const S = an.summary;
  if (S?.version !== 2) throw new Error(`${title}: no v2 deep analysis — run the analysis first`);
  const dur = S.profile?.duration ?? t.duration;
  const phases0 = groupPhases(S.sections, dur);
  const cast = castFor(title, phases0, world, S);
  const phases = phases0.map((p, i) => {
    const role = roleOf(p, i, phases0);
    const seq = sequenceFor(world, i, role);
    const moodWords = p.sections.flatMap((k) => S.sections.find((s) => s.index === k)?.mood_words ?? []);
    return {
      id: p.id,
      start: p.start, end: p.end,
      ...postFor(p),
      shaderModes: cast[i],
      aiPrompt: seq[0],
      aiPromptSequence: seq,
      aiPromptModifiers: {},
      poetryMood: world.phaseMoods?.[i] ?? world.mood,
      guidancePhrases: [],
      voice: world.voice,
      palette: world.palette,
      analysisRole: role,
      // Tramokyo grade/POV keyed by the phase's ROLE in the measured arc
      // (the canonical ids are positional; the peak may sit in any phase).
      gradeAs: ROLE_GRADE[role],
      analysisSections: p.sections,
      analysisMoodWords: [...new Set(moodWords)].slice(0, 4),
    };
  });
  const theme = {
    visualVocabulary: { environments: [], entities: [], textures: [], atmospheres: [] },
    shaderCategories: world.cats,
    palette: world.palette,
    voice: world.voice,
    poetryImagery: world.phases[phases0.findIndex((_, i) => roleOf(phases0[i], i, phases0) === "peak")].slice(0, 160),
    poetryMood: world.mood,
    ambientTheme: world.ambient,
    worldRationale: world.why,
    analysisVersion: 2,
  };
  const fields = {
    name: title, subtitle: world.subtitle ?? "",
    description: `"${title}" — recorded in the studio, Oct 4 2026, by Karel Barnoski. ${world.why}`,
    story_text: S.emotional_narrative ?? null,
    realm_id: "custom", phases, theme,
    creator_name: "Karel Barnoski", audio_reactive: false, is_public: false,
  };
  report.push({ title, world: world.world, why: world.why, tempo: S.tempo, mode: S.mode_balance?.verdict, phases: phases.map((p) => ({ id: p.id, t: `${p.start}-${p.end}`, I: p.intensityMultiplier, role: p.analysisRole, shaders: p.shaderModes })) });
  if (DRY) { console.log(`· ${title}\n${phases.map((p) => `   ${p.id.padEnd(13)} ${p.start.toFixed(2)}-${p.end.toFixed(2)} I${p.intensityMultiplier} ${p.analysisRole.padEnd(9)} bloom ${p.bloomIntensity} vig ${p.vignette} temp ${p.colorTemperature} [${p.shaderModes.join(", ")}]`).join("\n")}`); continue; }
  const { data: existing } = await sb.from("journeys").select("id").eq("recording_id", t.id).eq("user_id", USER_ID).maybeSingle();
  let id = existing?.id, e2;
  if (id) ({ error: e2 } = await sb.from("journeys").update(fields).eq("id", id));
  else {
    const ins = await sb.from("journeys").insert({ ...fields, user_id: USER_ID, recording_id: t.id, share_token: randomUUID().replace(/-/g, "").slice(0, 16) }).select("id").single();
    e2 = ins.error; id = ins.data?.id;
  }
  if (e2) throw e2;
  console.log(`${existing ? "~" : "+"} ${title.padEnd(12)} ${id}`);
  results.push({ journeyId: id, recordingId: t.id, title });
}
writeFileSync("scripts/oct4-design-report.json", JSON.stringify(report, null, 1));
if (DRY) process.exit(0);

const PATH_NAME = "Studio — Oct 4 2026";
const { data: existingPath } = await sb.from("journey_paths").select("id,share_token").eq("name", PATH_NAME).eq("user_id", USER_ID).maybeSingle();
const pathFields = {
  name: PATH_NAME, subtitle: "seven pieces from the studio",
  description: "Seven solo piano pieces recorded in the studio on October 4, 2026 — each world drawn from the music's own tempo, harmony, mood and arc.",
  journey_ids: results.map((r) => r.journeyId), accent_color: "#d8b88f", glow_color: "#f4e6cc",
};
let pathId = existingPath?.id, token = existingPath?.share_token;
if (pathId) { const { error } = await sb.from("journey_paths").update(pathFields).eq("id", pathId); if (error) throw error; }
else {
  token = randomUUID().replace(/-/g, "").slice(0, 16);
  const { data, error } = await sb.from("journey_paths").insert({ ...pathFields, user_id: USER_ID, share_token: token }).select("id").single();
  if (error) throw error;
  pathId = data.id;
}
writeFileSync("scripts/oct4-output.json", JSON.stringify({ pathId, pathShareToken: token, journeys: results }, null, 2));
console.log(`\npath "${PATH_NAME}" ${pathId} · /path/${token}`);
