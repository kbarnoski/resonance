// Generate a 14th "culmination" journey for the Welcome Home path.
// Uses one of the 13 tracks' musical context as a seed (Claude picks
// the most fitting arc). The journey row has recording_id=null so the
// playback layer can swap in a random track at runtime.

import { createClient } from "@supabase/supabase-js";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { randomUUID, randomInt } from "node:crypto";

const env = readFileSync(".env.local", "utf-8");
const getEnv = (name) => {
  const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : undefined;
};

const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
const anthropic = createAnthropic({ apiKey: getEnv("ANTHROPIC_API_KEY") });
const model = anthropic("claude-sonnet-4-5-20250929");

const USER_ID = "8d9f4d41-88de-45ea-a3af-5b241d105256";
const output = JSON.parse(readFileSync("scripts/welcome-home-output.json", "utf-8"));

// ─── Schemas (same as main builder) ───
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

const TEMPLATE_PHASES = [
  { id: "threshold", start: 0.00, end: 0.10, shaderOpacity: 0.60, denoisingRange: [0.3, 0.5], targetFps: 0.5, bloomIntensity: 0.1, chromaticAberration: 0.0, colorTemperature: 0, vignette: 0.35, poetryIntervalSeconds: 10, intensityMultiplier: 0.4, ambientLayers: { wind: 0.2, rain: 0, drone: 0.3, chime: 0, fire: 0 }, filmGrain: 0.03, particleDensity: 0.02, halation: 0.02 },
  { id: "expansion", start: 0.10, end: 0.26, shaderOpacity: 0.60, denoisingRange: [0.4, 0.65], targetFps: 1, bloomIntensity: 0.3, chromaticAberration: 0.03, colorTemperature: 0.1, vignette: 0.25, poetryIntervalSeconds: 7, intensityMultiplier: 0.7, ambientLayers: { wind: 0.4, rain: 0.2, drone: 0.6, chime: 0.3, fire: 0 }, filmGrain: 0.06, particleDensity: 0.05, halation: 0.04 },
  { id: "transcendence", start: 0.26, end: 0.48, shaderOpacity: 0.60, denoisingRange: [0.6, 0.85], targetFps: 2, bloomIntensity: 0.7, chromaticAberration: 0.08, colorTemperature: 0.3, vignette: 0.15, poetryIntervalSeconds: 5, intensityMultiplier: 1.0, ambientLayers: { wind: 0.7, rain: 0.5, drone: 1.0, chime: 0.6, fire: 0.2 }, filmGrain: 0.1, particleDensity: 0.08, halation: 0.08 },
  { id: "illumination", start: 0.48, end: 0.65, shaderOpacity: 0.60, denoisingRange: [0.4, 0.6], targetFps: 1, bloomIntensity: 0.4, chromaticAberration: 0.04, colorTemperature: 0.1, vignette: 0.3, poetryIntervalSeconds: 8, intensityMultiplier: 0.75, ambientLayers: { wind: 0.35, rain: 0.15, drone: 0.5, chime: 0.4, fire: 0 }, filmGrain: 0.05, particleDensity: 0.04, halation: 0.05 },
  { id: "return", start: 0.65, end: 0.82, shaderOpacity: 0.60, denoisingRange: [0.25, 0.45], targetFps: 0.5, bloomIntensity: 0.2, chromaticAberration: 0.05, colorTemperature: -0.1, vignette: 0.3, poetryIntervalSeconds: 10, intensityMultiplier: 0.5, ambientLayers: { wind: 0.2, rain: 0.05, drone: 0.25, chime: 0.15, fire: 0 }, filmGrain: 0.03, particleDensity: 0.02, halation: 0.03 },
  { id: "integration", start: 0.82, end: 1.0, shaderOpacity: 0.60, denoisingRange: [0.2, 0.35], targetFps: 0.5, bloomIntensity: 0.1, chromaticAberration: 0.0, colorTemperature: -0.2, vignette: 0.4, poetryIntervalSeconds: 15, intensityMultiplier: 0.3, ambientLayers: { wind: 0.1, rain: 0, drone: 0.15, chime: 0.1, fire: 0 }, filmGrain: 0.02, particleDensity: 0.01, halation: 0.01 },
];

// ─── Culmination story ───
const trackNames = output.journeys.map((j) => j.cleanTitle).join(", ");
const story = `The culmination of Welcome Home by Karel Barnoski — a bonus journey revealed only after the listener has walked through all 13 tracks (${trackNames}). This is the whole album at once: every track's emotional center distilled into one final passage. A homecoming. A return to the self that was always waiting. Every replay plays a different random track from the album, so the visual arc is the same but the music always surprises. The feeling is reflection, gratitude, quiet wonder — the moment after a long journey when you stand at your own front door and realize you've arrived.`;

const musicalContext = `Album: Welcome Home — 13 tracks spanning multiple keys and moods. At playback, one of the tracks is selected at random. The journey arc is fixed; the music rotates. Treat this as "any track from the album" — the visual world should feel universal to the album, not tied to a specific song.`;

async function main() {
  console.log("Generating culmination theme…");
  const { object: theme } = await generateObject({
    model,
    schema: themeSchema,
    mode: "tool",
    maxTokens: 3000,
    prompt: `You are designing the visual and sonic theme for the culmination journey of the Welcome Home album.

"${story}"

${musicalContext}

This journey is the reward after walking through all 13 tracks. It should feel like the album's emotional climax held in suspension — warm, reflective, grateful, spacious. The visual vocabulary should evoke homecoming: thresholds crossed, doors opened, the long road behind you, the familiar light ahead. Think warm golden hours, soft reflective surfaces, the quiet beauty of return.

All output goes through the tool call — return every field as its proper type.`,
    temperature: 0.85,
  });

  console.log("Generating culmination phases…");
  const { object: journeyAi } = await generateObject({
    model,
    schema: journeySchema,
    mode: "tool",
    maxTokens: 4000,
    prompt: `Design the culmination journey for: "${story}"

${musicalContext}

Visual world: ${theme.visualVocabulary.environments.slice(0, 3).join(", ")}, ${theme.visualVocabulary.textures.slice(0, 3).join(", ")}. Mood: ${theme.poetryMood}.

Generate exactly 6 phases in order: Threshold, Expansion, Transcendence, Illumination, Return, Integration. Each phase needs a visual scene prompt (10-20 words), mood word, and 2-3 whispered guidance phrases.

The overall arc: arrival at the threshold of home, recognition of what you carried, the peak of gratitude, clarity of self, gentle release, and the quiet settling into being home. Make it feel like the whole album distilled into one journey.

IMPORTANT: phases must be an array of 6 objects.`,
    temperature: 0.75,
  });

  const phases = TEMPLATE_PHASES.map((tpl, i) => ({
    ...tpl,
    shaderModes: [],
    aiPrompt: journeyAi.phases[i].aiPrompt + ", no text no signatures no watermarks no letters no writing",
    aiPromptModifiers: {},
    poetryMood: journeyAi.phases[i].poetryMood,
    guidancePhrases: journeyAi.phases[i].guidancePhrases,
    voice: theme.voice,
    palette: theme.palette,
  }));

  // Flag the row so playback knows to pick a random recording from the
  // path at start. We piggyback on the theme jsonb since we don't have a
  // dedicated column.
  const augmentedTheme = {
    ...theme,
    isCulmination: true,
    randomTrackPool: output.journeys.map((j) => j.recordingId),
  };

  const row = {
    user_id: USER_ID,
    recording_id: null, // picked at playback from randomTrackPool
    name: journeyAi.name,
    subtitle: journeyAi.subtitle,
    description: journeyAi.description,
    story_text: story,
    realm_id: "custom",
    phases,
    theme: augmentedTheme,
    share_token: randomUUID().replace(/-/g, "").slice(0, 16),
    playback_seed: String(randomInt(0, 4294967296)),
    creator_name: "Karel Barnoski",
    audio_reactive: false,
    is_public: false,
  };

  const { data: journey, error } = await supabase
    .from("journeys")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("Insert failed:", error);
    process.exit(1);
  }

  console.log(`✓ Culmination journey ${journey.id} — "${journeyAi.name}"`);

  // Attach to the Welcome Home path
  const { error: updErr } = await supabase
    .from("journey_paths")
    .update({ culmination_journey_id: journey.id })
    .eq("id", output.pathId);

  if (updErr) {
    console.error("Path update failed:", updErr);
    process.exit(1);
  }

  console.log(`✓ Attached to Welcome Home path ${output.pathId}`);
  console.log(`\n  Name: ${journeyAi.name}`);
  console.log(`  Subtitle: ${journeyAi.subtitle}`);
  console.log(`  Share token: ${row.share_token}`);
  console.log(`  Will unveil once all 13 journeys are complete.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
