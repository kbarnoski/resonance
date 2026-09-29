// Expansion set → 6 journeys + path, March Light pattern with every law:
// one unique domain per track, occupied skies (no orbs can spawn),
// positively asserted emptiness (no humans), per-track palettes + shader
// spread, analysis-aligned phase bounds, name-only titles, film grain 0.
// NOTE: ice/frost/aurora belong to Snowflake ALONE — Northern Plane is
// cold without a single crystal.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";
const tracks = JSON.parse(readFileSync("scripts/expansion-import.json", "utf8"));

const TAIL = ", asymmetric off-center composition with strong diagonal weight, completely uninhabited, no text no signatures no watermarks no letters no writing";

const TEMPLATE = [
  { id: "threshold", shaderOpacity: 0.60, denoisingRange: [0.3, 0.5], targetFps: 0.5, bloomIntensity: 0.1, chromaticAberration: 0.0, colorTemperature: 0, vignette: 0.35, poetryIntervalSeconds: 10, intensityMultiplier: 0.4, ambientLayers: { wind: 0.2, rain: 0, drone: 0.3, chime: 0, fire: 0 }, filmGrain: 0, particleDensity: 0.02, halation: 0.02 },
  { id: "expansion", shaderOpacity: 0.60, denoisingRange: [0.4, 0.65], targetFps: 1, bloomIntensity: 0.3, chromaticAberration: 0.03, colorTemperature: 0.1, vignette: 0.25, poetryIntervalSeconds: 7, intensityMultiplier: 0.7, ambientLayers: { wind: 0.4, rain: 0.2, drone: 0.6, chime: 0.3, fire: 0 }, filmGrain: 0, particleDensity: 0.05, halation: 0.04 },
  { id: "transcendence", shaderOpacity: 0.60, denoisingRange: [0.6, 0.85], targetFps: 2, bloomIntensity: 0.7, chromaticAberration: 0.08, colorTemperature: 0.3, vignette: 0.15, poetryIntervalSeconds: 5, intensityMultiplier: 1.0, ambientLayers: { wind: 0.7, rain: 0.5, drone: 1.0, chime: 0.6, fire: 0.2 }, filmGrain: 0, particleDensity: 0.08, halation: 0.08 },
  { id: "illumination", shaderOpacity: 0.60, denoisingRange: [0.4, 0.6], targetFps: 1, bloomIntensity: 0.4, chromaticAberration: 0.04, colorTemperature: 0.1, vignette: 0.3, poetryIntervalSeconds: 8, intensityMultiplier: 0.75, ambientLayers: { wind: 0.35, rain: 0.15, drone: 0.5, chime: 0.4, fire: 0 }, filmGrain: 0, particleDensity: 0.04, halation: 0.05 },
  { id: "return", shaderOpacity: 0.60, denoisingRange: [0.25, 0.45], targetFps: 0.5, bloomIntensity: 0.2, chromaticAberration: 0.05, colorTemperature: -0.1, vignette: 0.3, poetryIntervalSeconds: 10, intensityMultiplier: 0.5, ambientLayers: { wind: 0.2, rain: 0.05, drone: 0.25, chime: 0.15, fire: 0 }, filmGrain: 0, particleDensity: 0.02, halation: 0.03 },
  { id: "integration", shaderOpacity: 0.60, denoisingRange: [0.2, 0.35], targetFps: 0.5, bloomIntensity: 0.1, chromaticAberration: 0.0, colorTemperature: -0.2, vignette: 0.4, poetryIntervalSeconds: 15, intensityMultiplier: 0.3, ambientLayers: { wind: 0.1, rain: 0, drone: 0.15, chime: 0.1, fire: 0 }, filmGrain: 0, particleDensity: 0.01, halation: 0.01 },
];

const WORLDS = {
  // A THIRD Surrounded By Light — the SBL album owns the abstract
  // radiance, March Light owns the forest-clearing corona; this take
  // goes UNDERWATER: a ring of god-rays around a still point in open sea.
  "Surrounded by Light 6": {
    palette: { primary: "#7fd4c9", secondary: "#04141c", accent: "#ffe9a8", glow: "#d0fff4" },
    cats: ["Elemental", "Cosmic"], ambient: "sacred", voice: "fable", mood: "transcendent",
    phases: [
      "DARK BACKGROUND — deep open water before the light arrives, blue-black volume in every direction, marine snow drifting as sparse pale motes, one thin blade of early sun entering the upper right and dissolving into teal haze before it can reach the depth, the sea holding its breath",
      "rays multiplying — shafts of white-gold sunlight lancing down through the surface from several angles as the day climbs, each beam a soft-edged column alive with lit particles, the blue between them deepening by contrast, the water becoming an architecture of slanted light",
      "encircled completely — a full ring of converging god-rays surrounding one still point of open water, beams pouring in from every direction of the surface and crossing far below in a knot of drowned radiance, billows of tiny lit particles wheeling slowly through the columns, the sea turned cathedral, the brightest convergence hanging just left of center",
      "the ring loosening into broad daylight water, beams widening and softening, particle fields glinting in slow currents, the deep blue gentled to luminous teal",
      "afternoon light lying long and low through the water, a few last wide rays leaning at steep angles, the particle snow settling toward dimness",
      "DARK BACKGROUND — the sea at dusk from below, the surface a faint sheet of mercury far above, one last pale ray standing in the lower left like a candle in blue darkness, the envelopment remembered",
    ],
  },
  // Nothing — emptiness itself as the subject: a vast dark void where
  // negative space is the architecture and one mote is the whole story.
  "Nothing 30": {
    palette: { primary: "#b8c4d8", secondary: "#07080c", accent: "#8fa0c9", glow: "#dde6f4" },
    cats: ["Visionary", "Cosmic"], ambient: "abyss", voice: "sage", mood: "mystical",
    phases: [
      "DARK BACKGROUND — an immense empty dark filled only with the faintest horizontal veils of grey-blue fog at different depths, no floor and no ceiling, and one single mote of pale silver dust adrift in the lower right, lit by nothing visible, the whole frame an inhabited silence",
      "the veils breathing — the fog planes drifting slowly past one another, their edges catching a sourceless pearl light, thin currents of finer mist threading between them, the lone mote joined by a scattered few others, emptiness revealing that it moves",
      "the void luminous — the fog banks parted into a vast slow vortex of pale silver veils turning around a deep open center of pure darkness, stray dust motes orbiting the emptiness like reverent satellites, sourceless light breathing along every curved edge, nothing itself become radiant and enormous, the open center held just right of middle",
      "the vortex easing, veils flattening back to long quiet strata, the light dimming to a suffused grey-pearl, motes drifting free of orbit",
      "the strata thinning until only two faint planes remain with wide darkness between, one mote descending slowly through the gap",
      "DARK BACKGROUND — near-total dark, a single fog wisp low in the frame and the one silver mote at rest upon the black, nothing, complete",
    ],
  },
  // Night Wind — the invisible made visible: moving air itself over a
  // dark grass sea, drawn in streaks, seeds, and streaming cloud.
  "Night Wind 2": {
    palette: { primary: "#9fb8a8", secondary: "#0a1010", accent: "#d8cfa0", glow: "#cfe8d8" },
    cats: ["Elemental", "Organic"], ambient: "forest", voice: "echo", mood: "flowing",
    phases: [
      "DARK BACKGROUND — a dark plain of tall grass at night under a sky of fast low cloud, everything nearly still, one first gust drawn as a faint silver streak bending a narrow ribbon of grass across the lower left, windborne seeds lifting from it like sparks going the same direction, the air arriving",
      "the wind finding its voice — long luminous wakes combing through the grass sea in curved parallel strokes, seed-fluff and small leaves streaming through the dark in lit trajectories, cloud shadows racing the ground swells, the invisible current becoming legible everywhere",
      "full night wind — the entire plain surging in great silver-green waves under a torrent of streaming cloud, ribbons of airborne seeds and grass-chaff drawing the gale's shape in glowing lines across the sky's lower half, the current bending everything one way in colossal soft unison, the strongest river of air crossing the frame's right diagonal",
      "the gale easing to a strong steady breath, the grass swells longer and slower, airborne seeds descending in drifting slants, cloud cover breaking into streaming bands",
      "gentle end-of-wind, isolated gusts wandering the plain like afterthoughts, single seeds spiraling down to the dark grass",
      "DARK BACKGROUND — the plain still again under slowed cloud, grass upright and quiet, one last seed drifting alone across the lower right in a straight calm line, the wind gone home",
    ],
  },
  // The Other Side — a threshold world: the boundary surface itself,
  // and the radiant inverted world beyond it.
  "The Other Side 10": {
    palette: { primary: "#c9a8e8", secondary: "#0e0a14", accent: "#8fd8d0", glow: "#ecdcff" },
    cats: ["Visionary", "Geometry"], ambient: "sacred", voice: "shimmer", mood: "mystical",
    phases: [
      "DARK BACKGROUND — a perfectly still black water surface seen at a low grazing angle in a dark place, and within its mirror an inverted world faintly glowing violet-teal that does not match the darkness above, one slow ripple ring spreading in the lower right where something unseen touched through, the boundary announced",
      "the mirror waking — soft light rising FROM the reflection upward, the inverted world beneath the surface brightening into drifting luminous forms while the world above stays dark, ripple rings crossing and lensing the glow, the surface thinning from mirror toward membrane",
      "the crossing — the surface risen to a standing veil of light-bent water in mid-frame, both worlds visible at once through it, the far side pouring violet and aqua radiance through every distortion, streams of lit droplets suspended mid-passage between the two, geometry folding where they meet, the veil's brightest breach opening off-center left",
      "arrival in the inverted calm — the far world's soft glow now ambient everywhere, gentle upside-down echoes of the dark world drifting as luminous after-images, gravity of light rather than weight",
      "the veil re-forming behind, its light settling back below a smoothing surface, ripples widening apart and slowing",
      "DARK BACKGROUND — the black mirror restored and still, the inverted glow faint and deep within it now like a kept secret, one last ripple ring fading at the frame's edge, the other side closed and known",
    ],
  },
  // Northern Plane — vast boreal flatness at night: low horizon, wind
  // rivers of cloud, slate-blue immensity. Cold WITHOUT ice or aurora
  // (those belong to Snowflake alone).
  "Northern Plane 5": {
    palette: { primary: "#8fa8c4", secondary: "#0a0e14", accent: "#d8c9a8", glow: "#c9dcf0" },
    cats: ["Cosmic", "Elemental"], ambient: "desert", voice: "sage", mood: "dreamy",
    phases: [
      "DARK BACKGROUND — an immense flat northern plain at night, the horizon a single long low line dividing dark land from a sky filled edge to edge with slow rivers of banded cloud, sparse hardy shrubs as small black marks on the emptiness, one distant fold of ground catching a thin band of pale light in the lower left, the scale quiet and enormous",
      "the plain breathing — ground mist gathering in long slate-blue drifts that slide over the flatness, the cloud rivers overhead gaining pale moonless backlight along their seams, the land's few features surfacing and sinking in the moving mist, horizontals everywhere in slow migration",
      "the plane at full magnitude — the great flat dark sweeping to a horizon lit by a broad band of cold silver-gold sky between heavy cloud shelves, mist rivers streaming across the whole land in luminous parallel bands, the emptiness itself monumental, all lines running to one far vanishing point set low and left of center, immensity as stillness in motion",
      "the sky band warming faintly toward amber at the horizon seam, mist thinning to long threads, the plain's textures — stone, lichen dark, low scrub — emerging in low relief light",
      "the light band narrowing, cloud shelves closing slowly, the mist settling to ankle height across the darkening flat",
      "DARK BACKGROUND — the plain given back to night, horizon barely legible, one low seam of dim silver remaining between land and cloud like a held thought, the north at rest",
    ],
  },
  // No question — certainty: one unwavering line of light across dark
  // still water, steady from first note to last.
  "No question 8": {
    palette: { primary: "#e8c98f", secondary: "#100d0a", accent: "#8fb8d8", glow: "#ffe8c0" },
    cats: ["Geometry", "Visionary"], ambient: "sacred", voice: "ballad", mood: "transcendent",
    phases: [
      "DARK BACKGROUND — a vast dark water plain at night under a sky of long charcoal cloud bands, and upon the water one perfectly straight narrow path of warm golden light running from the lower right toward the far horizon, edges clean, origin unseen, the line simply and completely there",
      "the line strengthening — the golden path widening by degrees and beginning to glow into the air above it as a low warm haze, small standing ripples crossing it and bending nothing, the cloud bands above aligning slowly parallel to its bearing, the world organizing around one certainty",
      "the certainty at full voice — the light-path a broad radiant causeway crossing the entire dark sea to a horizon burning with a long low band of gold beneath the cloud shelf, the water either side alive with soft answering glints, the line unbroken, unbent, unmistakable, its vanishing point set left of center, arrival guaranteed by geometry alone",
      "the causeway gentled — its gold softened to honey, the horizon band broadened and calm, slow water swells passing beneath the light without disturbing its line",
      "the path narrowing back toward its first slender clarity, the horizon band dimming to ember, cloud bands loosening from their parallel order",
      "DARK BACKGROUND — night water and quiet sky once more, the path thinned to a single bright thread still running true from the lower right into the far dark, never gone, never in question",
    ],
  },
};

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

const results = [];
for (const t of tracks) {
  const world = WORLDS[t.title];
  if (!world) { console.log(`!! no world for ${t.title}`); continue; }
  const { data: an } = await supabase.from("analyses").select("notes").eq("recording_id", t.id).single();
  const bounds = computeBounds(an?.notes, t.duration);
  const phases = TEMPLATE.map((tpl, i) => ({
    ...tpl,
    start: bounds[i], end: bounds[i + 1],
    shaderModes: [],
    aiPrompt: world.phases[i] + TAIL,
    aiPromptModifiers: {},
    poetryMood: world.mood,
    guidancePhrases: [],
    voice: world.voice,
    palette: world.palette,
  }));
  const theme = {
    visualVocabulary: { environments: [], entities: [], textures: [], atmospheres: [] },
    shaderCategories: world.cats,
    palette: world.palette,
    voice: world.voice,
    poetryImagery: world.phases[2].slice(0, 120),
    poetryMood: world.mood,
    ambientTheme: world.ambient,
  };
  const row = {
    user_id: USER_ID, recording_id: t.id,
    name: t.title, subtitle: "", description: `"${t.title}" from the Expansion set by Karel Barnoski.`,
    story_text: null, realm_id: "custom", phases, theme,
    share_token: randomUUID().replace(/-/g, "").slice(0, 16),
    creator_name: "Karel Barnoski", audio_reactive: false, is_public: false,
  };
  const { data, error } = await supabase.from("journeys").insert(row).select("id").single();
  console.log(`${error ? "x " + error.message : "+"} ${t.title.padEnd(24)} bounds ${bounds.slice(1, 6).map((b) => b.toFixed(2)).join(" ")}`);
  if (!error) results.push({ order: t.order, journeyId: data.id, recordingId: t.id, title: t.title });
}

const pathToken = randomUUID().replace(/-/g, "").slice(0, 16);
const { data: pathData, error: pathErr } = await supabase.from("journey_paths").insert({
  user_id: USER_ID, name: "Expansion", subtitle: "six new pieces",
  description: "The Expansion set — six pieces, six worlds: drowned light, luminous nothing, the visible wind, the mirrored threshold, the northern immensity, and one line that was never in question.",
  journey_ids: results.sort((a, b) => a.order - b.order).map((r) => r.journeyId),
  share_token: pathToken, accent_color: "#a8c4e0", glow_color: "#e0ecff",
}).select("id").single();
if (pathErr) { console.error("path failed:", pathErr.message); process.exit(1); }
writeFileSync("scripts/expansion-output.json", JSON.stringify({ pathId: pathData.id, pathShareToken: pathToken, journeys: results }, null, 2));
console.log(`\n+ Expansion path: ${pathData.id} · token ${pathToken}`);
