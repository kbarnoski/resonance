// Welcome Home album → 13 journeys + 1 path.
//
// Reads the 13 analyses, computes vibe per track, prompts Claude to
// generate theme + 6 phases per track, inserts journey rows, then
// creates the Welcome Home path row with a share_token.
//
// Run: node scripts/build-welcome-home-path.mjs

import { createClient } from "@supabase/supabase-js";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// ─── Env loading ───
const env = readFileSync(".env.local", "utf-8");
const getEnv = (name) => {
  const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : undefined;
};

const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANTHROPIC_API_KEY = getEnv("ANTHROPIC_API_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
  console.error("Missing required env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anthropic = createAnthropic({ apiKey: ANTHROPIC_API_KEY });
const model = anthropic("claude-sonnet-4-5-20250929");

const USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";
const ALBUM_NAME = "Welcome Home";

// ─── Vibe detection (inlined from src/lib/audio/vibe-detection.ts) ───

function isMinorKey(key) {
  if (!key) return false;
  return /minor|min|\bm\b/i.test(key);
}
function isMajorKey(key) {
  if (!key) return false;
  return /major|maj/i.test(key) || (!isMinorKey(key) && /^[A-G][#b]?$/.test(key.trim()));
}
function countExtensions(chords) {
  return chords.filter((c) => /7|9|11|13|sus|add|maj7|min7|dim|aug/i.test(c.chord)).length;
}
function uniqueChordCount(chords) {
  return new Set(chords.map((c) => c.chord)).size;
}
function averageChordDuration(chords) {
  if (!chords.length) return 0;
  return chords.reduce((s, c) => s + c.duration, 0) / chords.length;
}

function detectVibe(analysis) {
  const tempo = analysis.tempo ?? 100;
  const key = analysis.key_signature;
  const chords = analysis.chords ?? [];
  const unique = uniqueChordCount(chords);
  const extensions = countExtensions(chords);
  const avgDuration = averageChordDuration(chords);
  const minor = isMinorKey(key);
  const major = isMajorKey(key);
  const scores = {
    melancholic: 0, intense: 0, dreamy: 0, mystical: 0,
    chaotic: 0, hypnotic: 0, flowing: 0, transcendent: 0,
  };
  if (minor) scores.melancholic += 3;
  if (tempo < 90) scores.melancholic += 2;
  if (tempo < 70) scores.melancholic += 1;
  if (avgDuration > 2) scores.melancholic += 1;
  if (tempo > 130) scores.intense += 3;
  if (tempo > 150) scores.intense += 1;
  if (extensions > chords.length * 0.3) scores.intense += 1;
  const chromaticChords = chords.filter((c) => /dim|aug|alt|\+|#|b/.test(c.chord)).length;
  if (chromaticChords > 3) scores.intense += 2;
  if (major) scores.dreamy += 2;
  if (tempo >= 80 && tempo <= 120) scores.dreamy += 2;
  if (extensions > chords.length * 0.4) scores.dreamy += 2;
  const unusualChords = chords.filter((c) => /dim|aug|alt|sus|#|b5/.test(c.chord)).length;
  if (unusualChords > 2) scores.mystical += 2;
  if (unusualChords > 5) scores.mystical += 1;
  if (unique > 8) scores.mystical += 1;
  if (minor) scores.mystical += 1;
  if (unique > 10) scores.chaotic += 2;
  if (unique > 15) scores.chaotic += 1;
  if (avgDuration < 1.5 && chords.length > 10) scores.chaotic += 2;
  if (tempo > 120) scores.chaotic += 1;
  if (unique <= 4 && chords.length > 6) scores.hypnotic += 3;
  if (unique <= 6 && chords.length > 10) scores.hypnotic += 1;
  if (avgDuration > 1.5) scores.hypnotic += 1;
  if (tempo >= 80 && tempo <= 120) scores.hypnotic += 1;
  if (tempo >= 85 && tempo <= 115) scores.flowing += 2;
  if (avgDuration >= 1.5 && avgDuration <= 3) scores.flowing += 2;
  if (unique >= 4 && unique <= 10) scores.flowing += 1;
  if (major) scores.transcendent += 2;
  if (tempo < 90) scores.transcendent += 2;
  if (extensions > chords.length * 0.3) scores.transcendent += 1;
  if (avgDuration > 2) scores.transcendent += 1;

  let topMood = "flowing";
  let topScore = -1;
  for (const [m, s] of Object.entries(scores)) {
    if (s > topScore) { topScore = s; topMood = m; }
  }
  return { mood: topMood, scores };
}

// ─── Schemas for AI output ───

const themeSchema = z.object({
  visualVocabulary: z.object({
    environments: z.array(z.string()).min(6).max(8),
    entities: z.array(z.string()).min(6).max(8),
    textures: z.array(z.string()).min(6).max(8),
    atmospheres: z.array(z.string()).min(6).max(8),
  }),
  shaderCategories: z.array(z.enum(["Cosmic", "Elemental", "Organic", "Visionary", "Geometry", "Dark", "3D Worlds"])).min(2).max(3),
  palette: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    glow: z.string(),
  }),
  voice: z.enum(["shimmer", "nova", "fable", "alloy", "echo", "onyx", "ash", "ballad", "coral", "sage", "verse", "marin", "cedar"]),
  poetryImagery: z.string(),
  poetryMood: z.enum(["melancholic", "intense", "dreamy", "mystical", "chaotic", "hypnotic", "flowing", "transcendent"]),
  ambientTheme: z.enum(["default", "abyss", "ocean", "forest", "sacred", "machine", "pain", "heaven", "desert", "storm"]),
});

const phaseSchema = z.object({
  aiPrompt: z.string(),
  poetryMood: z.string(),
  guidancePhrases: z.array(z.string()).max(3),
});

const journeySchema = z.object({
  name: z.string(),
  subtitle: z.string(),
  description: z.string(),
  phases: z.array(phaseSchema).length(6),
});

// ─── Template phase numeric values (copied from src/lib/journeys/journeys.ts defaultPhases) ───

const TEMPLATE_PHASES = [
  { id: "threshold", start: 0.00, end: 0.10, shaderOpacity: 0.60, denoisingRange: [0.3, 0.5], targetFps: 0.5, bloomIntensity: 0.1, chromaticAberration: 0.0, colorTemperature: 0, vignette: 0.35, poetryIntervalSeconds: 10, intensityMultiplier: 0.4, ambientLayers: { wind: 0.2, rain: 0, drone: 0.3, chime: 0, fire: 0 }, filmGrain: 0.03, particleDensity: 0.02, halation: 0.02 },
  { id: "expansion", start: 0.10, end: 0.26, shaderOpacity: 0.60, denoisingRange: [0.4, 0.65], targetFps: 1, bloomIntensity: 0.3, chromaticAberration: 0.03, colorTemperature: 0.1, vignette: 0.25, poetryIntervalSeconds: 7, intensityMultiplier: 0.7, ambientLayers: { wind: 0.4, rain: 0.2, drone: 0.6, chime: 0.3, fire: 0 }, filmGrain: 0.06, particleDensity: 0.05, halation: 0.04 },
  { id: "transcendence", start: 0.26, end: 0.48, shaderOpacity: 0.60, denoisingRange: [0.6, 0.85], targetFps: 2, bloomIntensity: 0.7, chromaticAberration: 0.08, colorTemperature: 0.3, vignette: 0.15, poetryIntervalSeconds: 5, intensityMultiplier: 1.0, ambientLayers: { wind: 0.7, rain: 0.5, drone: 1.0, chime: 0.6, fire: 0.2 }, filmGrain: 0.1, particleDensity: 0.08, halation: 0.08 },
  { id: "illumination", start: 0.48, end: 0.65, shaderOpacity: 0.60, denoisingRange: [0.4, 0.6], targetFps: 1, bloomIntensity: 0.4, chromaticAberration: 0.04, colorTemperature: 0.1, vignette: 0.3, poetryIntervalSeconds: 8, intensityMultiplier: 0.75, ambientLayers: { wind: 0.35, rain: 0.15, drone: 0.5, chime: 0.4, fire: 0 }, filmGrain: 0.05, particleDensity: 0.04, halation: 0.05 },
  { id: "return", start: 0.65, end: 0.82, shaderOpacity: 0.60, denoisingRange: [0.25, 0.45], targetFps: 0.5, bloomIntensity: 0.2, chromaticAberration: 0.05, colorTemperature: -0.1, vignette: 0.3, poetryIntervalSeconds: 10, intensityMultiplier: 0.5, ambientLayers: { wind: 0.2, rain: 0.05, drone: 0.25, chime: 0.15, fire: 0 }, filmGrain: 0.03, particleDensity: 0.02, halation: 0.03 },
  { id: "integration", start: 0.82, end: 1.0, shaderOpacity: 0.60, denoisingRange: [0.2, 0.35], targetFps: 0.5, bloomIntensity: 0.1, chromaticAberration: 0.0, colorTemperature: -0.2, vignette: 0.4, poetryIntervalSeconds: 15, intensityMultiplier: 0.3, ambientLayers: { wind: 0.1, rain: 0, drone: 0.15, chime: 0.1, fire: 0 }, filmGrain: 0.02, particleDensity: 0.01, halation: 0.01 },
];

// ─── Main pipeline ───

async function getTrackAnalyses() {
  const { data: tracks } = await supabase
    .from("recordings")
    .select("id, title, duration")
    .eq("user_id", USER_ID)
    .order("title", { ascending: true });
  const welcomeHome = (tracks ?? []).filter((t) => /^(0?[1-9]|1[0-3])[_\-\s.]/.test(t.title));

  const results = [];
  for (const t of welcomeHome) {
    const { data: analysis } = await supabase
      .from("analyses")
      .select("*")
      .eq("recording_id", t.id)
      .maybeSingle();
    if (!analysis) {
      console.warn(`  ⚠ no analysis for ${t.title} — skipping`);
      continue;
    }
    const vibe = detectVibe(analysis);
    const cleanTitle = t.title.replace(/^(0?[1-9]|1[0-3])[_\-\s.]+/, "").replace(/\.[a-z0-9]+$/i, "").trim();
    const parts = [];
    if (analysis.key_signature) parts.push(`Key: ${analysis.key_signature}`);
    if (analysis.tempo) parts.push(`Tempo: ${Math.round(analysis.tempo)} BPM`);
    const uniqueChords = [...new Set((analysis.chords ?? []).map((c) => c.chord))].slice(0, 8);
    if (uniqueChords.length) parts.push(`Chords: ${uniqueChords.join(", ")}`);
    parts.push(`Detected mood: ${vibe.mood}`);
    const musicalContext = parts.join(". ");

    results.push({
      recordingId: t.id,
      rawTitle: t.title,
      cleanTitle,
      duration: t.duration,
      vibe,
      musicalContext,
    });
  }
  return results;
}

async function generateTheme(storyText, musicalContext) {
  const { object } = await generateObject({
    model,
    schema: themeSchema,
    mode: "tool",
    maxTokens: 3000,
    prompt: `You are designing the visual and sonic theme for an immersive audio-visual journey based on this story:

"${storyText}"

Musical context for this song:
${musicalContext}

Let the music's character influence your visual choices — a minor-key piece might favor cooler palettes and darker atmospheres, while an upbeat major-key piece might lean warmer and brighter.

Generate a complete theme. All output goes through the tool call — return every field as its proper type (arrays as arrays, not strings).`,
    temperature: 0.8,
  });
  return object;
}

async function generateJourneyPhases(storyText, theme, musicalContext) {
  const vocabContext = `Visual world: ${theme.visualVocabulary.environments.slice(0, 3).join(", ")}, ${theme.visualVocabulary.textures.slice(0, 3).join(", ")}. Mood: ${theme.poetryMood}.`;
  const { object } = await generateObject({
    model,
    schema: journeySchema,
    mode: "tool",
    maxTokens: 4000,
    prompt: `Design a musical journey for: "${storyText}"

${vocabContext}

The song being played: ${musicalContext}. Let the music's qualities shape each phase — reference the key, tempo, or mood where it enriches the imagery.

Generate exactly 6 phases in order:
1. Threshold — quiet entry
2. Expansion — building
3. Transcendence — peak intensity
4. Illumination — clarity after peak
5. Return — gentle descent
6. Integration — peaceful resolution

Each phase needs a visual scene prompt (10-20 words), mood word, and 2-3 whispered guidance phrases. Make it personal to the story.

IMPORTANT: Return every field as its proper type. \`phases\` must be an array of 6 objects, not a string.`,
    temperature: 0.7,
  });
  return object;
}

function buildStoryText(cleanTitle, vibe, musicalContext) {
  return `A journey through "${cleanTitle}", a piece from the album "${ALBUM_NAME}" by Karel Barnoski. The music feels ${vibe.mood}. This is one chapter of an album about coming home — to a place, a self, a state of being that was always waiting. Sit inside the music and let the title, the mood, and the harmony guide the visual world. The track's emotional center is: ${musicalContext}.`;
}

function assemblePhases(aiPhases, palette, voice) {
  return TEMPLATE_PHASES.map((tpl, i) => ({
    ...tpl,
    shaderModes: [], // regenerated at playback time
    aiPrompt: aiPhases[i].aiPrompt + ", no text no signatures no watermarks no letters no writing",
    aiPromptModifiers: {},
    poetryMood: aiPhases[i].poetryMood,
    guidancePhrases: aiPhases[i].guidancePhrases,
    voice,
    palette,
  }));
}

function shareTokenFor() {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

async function buildOneJourney(track) {
  console.log(`→ ${track.cleanTitle}  (mood: ${track.vibe.mood})`);
  const story = buildStoryText(track.cleanTitle, track.vibe, track.musicalContext);

  console.log("    theme…");
  const theme = await generateTheme(story, track.musicalContext);

  console.log("    phases…");
  const journeyAi = await generateJourneyPhases(story, theme, track.musicalContext);

  const phases = assemblePhases(journeyAi.phases, theme.palette, theme.voice);

  const row = {
    user_id: USER_ID,
    recording_id: track.recordingId,
    name: journeyAi.name,
    subtitle: journeyAi.subtitle,
    description: journeyAi.description,
    story_text: story,
    realm_id: "custom",
    phases,
    theme,
    share_token: shareTokenFor(),
    creator_name: "Karel Barnoski",
    audio_reactive: false,
    is_public: false,
  };

  const { data, error } = await supabase.from("journeys").insert(row).select("id").single();
  if (error) {
    console.error(`    insert failed:`, error.message);
    throw error;
  }
  console.log(`    ✓ journey ${data.id}  name: ${journeyAi.name}`);
  return { journeyId: data.id, name: journeyAi.name, recordingId: track.recordingId, cleanTitle: track.cleanTitle };
}

async function main() {
  console.log("Fetching 13 Welcome Home tracks + analyses…\n");
  const tracks = await getTrackAnalyses();
  console.log(`Found ${tracks.length} tracks with analysis.\n`);
  if (tracks.length !== 13) {
    console.error(`Expected 13, got ${tracks.length}. Aborting.`);
    process.exit(1);
  }

  console.log("Building journeys (Claude + insert)…\n");
  const results = [];
  for (const t of tracks) {
    const r = await buildOneJourney(t);
    results.push(r);
  }

  console.log("\n13 journeys inserted. Building path…\n");

  const pathToken = shareTokenFor();
  const pathRow = {
    user_id: USER_ID,
    name: "Welcome Home",
    subtitle: "the album as a journey",
    description: "Thirteen tracks from Welcome Home, each one a journey. Walk through the record as an experience — from the first note of Interplay to the last breath of All Together.",
    journey_ids: results.map((r) => r.journeyId),
    share_token: pathToken,
    accent_color: "#d0a070",
    glow_color: "#e0b080",
  };
  const { data: pathData, error: pathErr } = await supabase.from("journey_paths").insert(pathRow).select("id").single();
  if (pathErr) {
    console.error("path insert failed:", pathErr);
    process.exit(1);
  }

  writeFileSync("scripts/welcome-home-output.json", JSON.stringify({
    pathId: pathData.id,
    pathShareToken: pathToken,
    journeys: results,
  }, null, 2));

  console.log("─".repeat(60));
  console.log(`✓ Welcome Home path created`);
  console.log(`  path id: ${pathData.id}`);
  console.log(`  share token: ${pathToken}`);
  console.log(`  share URL: https://<your-domain>/path/${pathToken}`);
  console.log(`  13 journeys: ${results.map((r) => r.cleanTitle).join(", ")}`);
  console.log(`\nFull output saved to scripts/welcome-home-output.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
