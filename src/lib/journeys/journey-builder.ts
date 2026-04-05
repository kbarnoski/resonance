import { generateObject } from "ai";
import { defaultModel } from "@/lib/ai/providers";
import { z } from "zod";
import type { Journey, JourneyPhase, JourneyPhaseId, JourneyTheme } from "./types";
import { getRealm } from "./realms";
import { JOURNEYS } from "./journeys";
import { detectVibe } from "@/lib/audio/vibe-detection";
import type { AnalysisResult } from "@/lib/audio/types";

const PHASE_IDS: JourneyPhaseId[] = [
  "threshold", "expansion", "transcendence",
  "illumination", "return", "integration",
];

const phaseSchema = z.object({
  aiPrompt: z.string().describe("Visual scene prompt for this phase, 10-20 words"),
  poetryMood: z.string().describe("One-word mood (e.g. contemplative, ecstatic, melancholic)"),
  guidancePhrases: z.array(z.string()).max(3).describe("2-3 short whispered guidance phrases"),
});

const journeySchema = z.object({
  name: z.string().describe("Short, evocative journey name (2-5 words)"),
  subtitle: z.string().describe("One-line subtitle describing the journey's theme"),
  description: z.string().describe("2-3 sentence description of the journey experience"),
  phases: z.array(phaseSchema).length(6).describe("Exactly 6 phases: threshold, expansion, transcendence, illumination, return, integration"),
});

// ─── Theme generation ───

const SHADER_CATEGORIES = ["Cosmic", "Elemental", "Organic", "Visionary", "Geometry", "Dark", "3D Worlds"] as const;

const VOICE_IDS = ["shimmer", "nova", "fable", "alloy", "echo", "onyx", "ash", "ballad", "coral", "sage", "verse", "marin", "cedar"] as const;

const AMBIENT_THEMES = ["default", "abyss", "ocean", "forest", "sacred", "machine", "pain", "heaven", "desert", "storm"] as const;

const themeSchema = z.object({
  visualVocabulary: z.object({
    environments: z.array(z.string()).min(6).max(8).describe("6-8 evocative environment descriptions (e.g. 'cathedral of frozen light', 'submerged ruins')"),
    entities: z.array(z.string()).min(6).max(8).describe("6-8 entities/objects (e.g. 'prismatic jellyfish', 'shattered hourglasses')"),
    textures: z.array(z.string()).min(6).max(8).describe("6-8 texture/surface descriptions (e.g. 'iridescent membrane', 'volcanic glass')"),
    atmospheres: z.array(z.string()).min(6).max(8).describe("6-8 atmospheric conditions (e.g. 'golden hour haze', 'bioluminescent fog')"),
  }),
  shaderCategories: z.array(z.enum(SHADER_CATEGORIES)).min(2).max(3).describe("2-3 shader categories that match the story's visual feel"),
  palette: z.object({
    primary: z.string().describe("Primary hex color (dark, grounding)"),
    secondary: z.string().describe("Secondary hex color (mid-tone)"),
    accent: z.string().describe("Accent hex color (vibrant, distinctive)"),
    glow: z.string().describe("Glow hex color (luminous, atmospheric)"),
  }),
  voice: z.enum(VOICE_IDS).describe("TTS voice that matches the story's tone"),
  poetryImagery: z.string().describe("A sentence describing the poetic imagery style for this journey"),
  poetryMood: z.string().describe("One word: melancholic, intense, dreamy, mystical, chaotic, hypnotic, flowing, or transcendent"),
  ambientTheme: z.enum(AMBIENT_THEMES).describe("Ambient soundscape theme that fits the story"),
});

/**
 * Generate a JourneyTheme from story text using AI.
 * The theme carries everything a realm used to provide: visual vocabulary,
 * shader categories, palette, voice, poetry imagery.
 */
export async function generateTheme(storyText: string): Promise<JourneyTheme> {
  const { object } = await generateObject({
    model: defaultModel,
    schema: themeSchema,
    prompt: `You are designing the visual and sonic theme for an immersive audio-visual journey based on this story:

"${storyText}"

Generate a complete theme with:
1. Visual vocabulary — 4 arrays of 6-8 evocative phrases each (environments, entities, textures, atmospheres). Be cinematic and specific, not generic.
2. 2-3 shader categories from: Cosmic, Elemental, Organic, Visionary, Geometry, Dark, 3D Worlds
3. A color palette of 4 hex values — primary (dark), secondary (mid), accent (vibrant), glow (luminous)
4. A TTS voice that matches the story tone
5. A poetry imagery description and mood word
6. An ambient soundscape theme

Make every choice deeply personal to the story. The visual vocabulary should feel like it could only belong to this specific story.`,
    temperature: 0.8,
  });

  return {
    visualVocabulary: object.visualVocabulary,
    shaderCategories: object.shaderCategories as string[],
    palette: object.palette,
    voice: object.voice,
    poetryImagery: object.poetryImagery,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    poetryMood: object.poetryMood as any,
    ambientTheme: object.ambientTheme,
  };
}

/**
 * Build a custom journey from story text using AI.
 * If realmId is provided (built-in path), uses existing realm logic.
 * If omitted, generates a JourneyTheme from the story.
 */
export async function buildJourneyFromStory(
  storyText: string,
  realmId?: string,
): Promise<Journey> {
  // Use a default journey as base template for numeric values
  const templateJourney = JOURNEYS[0];
  if (!templateJourney) throw new Error("No template journey available");

  // Realm path (built-in journeys) vs theme path (custom journeys)
  const realm = realmId ? getRealm(realmId) : null;
  const theme = realm ? null : await generateTheme(storyText);

  const vocabContext = realm
    ? `Realm: ${realm.name} (${realm.subtitle}). Visual vocabulary: ${realm.visualVocabulary.environments.slice(0, 3).join(", ")}, ${realm.visualVocabulary.textures.slice(0, 3).join(", ")}.`
    : theme
      ? `Visual world: ${theme.visualVocabulary.environments.slice(0, 3).join(", ")}, ${theme.visualVocabulary.textures.slice(0, 3).join(", ")}. Mood: ${theme.poetryMood}.`
      : "";

  const { object } = await generateObject({
    model: defaultModel,
    schema: journeySchema,
    prompt: `Design a musical journey for: "${storyText}"

${vocabContext}

Generate exactly 6 phases in order:
1. Threshold — quiet entry
2. Expansion — building
3. Transcendence — peak intensity
4. Illumination — clarity after peak
5. Return — gentle descent
6. Integration — peaceful resolution

Each phase needs a visual scene prompt, mood word, and 2-3 whispered guidance phrases. Make it personal to the user's story.`,
    temperature: 0.7,
  });

  // Validate AI output
  if (!object.phases || object.phases.length < 6) {
    throw new Error("AI generated insufficient phases — expected 6");
  }

  // Determine voice and palette from theme or realm
  const voice = theme?.voice ?? realm?.defaultVoice ?? "shimmer";
  const palette = theme?.palette ?? realm?.palette ?? { primary: "#0a0a0a", secondary: "#1a1a1a", accent: "#666", glow: "#888" };

  // Build phases using template numeric values + AI-generated content
  const phases: JourneyPhase[] = PHASE_IDS.map((id, i) => {
    const templatePhase = templateJourney.phases[i];
    const aiPhase = object.phases[i];

    // Shader modes are populated later by regenerateJourneyShaders at playback time.
    // Use placeholder — the engine always regenerates before first frame.
    const shaderBudget = [6, 8, 10, 8, 6, 4][i];
    const shaderSource = realm?.shaderModes ?? [];
    const shuffled = [...shaderSource].sort(() => Math.random() - 0.5);

    return {
      ...templatePhase,
      id,
      shaderModes: shuffled.slice(0, shaderBudget),
      aiPrompt: aiPhase.aiPrompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      poetryMood: aiPhase.poetryMood as any,
      guidancePhrases: aiPhase.guidancePhrases,
      voice,
      palette,
    };
  });

  return {
    id: `custom-${Date.now()}`,
    name: object.name,
    subtitle: object.subtitle,
    description: object.description,
    realmId: realmId ?? "custom",
    phases,
    aiEnabled: true,
    ...(theme ? { theme } : {}),
  };
}

/**
 * Build a journey from audio analysis data.
 * Generates a theme from the musical context — no realm mapping needed.
 */
export async function buildJourneyFromAnalysis(
  analysis: AnalysisResult,
  overrideRealmId?: string,
): Promise<Journey> {
  // Detect mood from analysis
  const vibe = detectVibe(analysis);

  // Build musical context string from analysis fields
  const parts: string[] = [];
  if (analysis.key_signature) parts.push(`Key: ${analysis.key_signature}`);
  if (analysis.tempo) parts.push(`Tempo: ${Math.round(analysis.tempo)} BPM`);
  if (analysis.time_signature) parts.push(`Time: ${analysis.time_signature}`);
  if (analysis.chords?.length) {
    const uniqueChords = [...new Set(analysis.chords.map((c) => c.chord))];
    parts.push(`Chords: ${uniqueChords.slice(0, 8).join(", ")}`);
  }
  parts.push(`Mood: ${vibe.mood}`);

  const contextString = `A ${vibe.mood} musical piece. ${parts.join(". ")}.`;

  // If explicit realm override, use the realm path
  if (overrideRealmId && getRealm(overrideRealmId)) {
    return buildJourneyFromStory(contextString, overrideRealmId);
  }

  // Otherwise, generate theme from the musical context (no realm)
  return buildJourneyFromStory(contextString);
}
