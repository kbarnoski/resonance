import { generateObject } from "ai";
import { defaultModel } from "@/lib/ai/providers";
import { z } from "zod";
import type { Journey, JourneyPhase, JourneyPhaseId } from "./types";
import { getRealm } from "./realms";
import { JOURNEYS } from "./journeys";
import { detectVibe, MOOD_REALM_MAP } from "@/lib/audio/vibe-detection";
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

/**
 * Build a custom journey from story text using AI.
 * Returns a Journey object ready to be stored and played.
 */
export async function buildJourneyFromStory(
  storyText: string,
  realmId: string,
): Promise<Journey> {
  const realm = getRealm(realmId);
  if (!realm) throw new Error(`Unknown realm: ${realmId}`);

  // Use a default journey as base template for numeric values
  const templateJourney = JOURNEYS[0];
  if (!templateJourney) throw new Error("No template journey available");

  const { object } = await generateObject({
    model: defaultModel,
    schema: journeySchema,
    prompt: `Design a musical journey for: "${storyText}"

Realm: ${realm.name} (${realm.subtitle}). Visual vocabulary: ${realm.visualVocabulary.environments.slice(0, 3).join(", ")}, ${realm.visualVocabulary.textures.slice(0, 3).join(", ")}.

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

  // Build phases using template numeric values + AI-generated content
  const phases: JourneyPhase[] = PHASE_IDS.map((id, i) => {
    const templatePhase = templateJourney.phases[i];
    const aiPhase = object.phases[i];

    // Import shuffleArray from journeys.ts pattern
    const shuffled = [...realm.shaderModes].sort(() => Math.random() - 0.5);
    const shaderBudget = [6, 8, 10, 8, 6, 4][i];

    return {
      ...templatePhase,
      id,
      shaderModes: shuffled.slice(0, shaderBudget),
      aiPrompt: aiPhase.aiPrompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      poetryMood: aiPhase.poetryMood as any,
      guidancePhrases: aiPhase.guidancePhrases,
      voice: realm.defaultVoice,
      palette: realm.palette,
    };
  });

  return {
    id: `custom-${Date.now()}`,
    name: object.name,
    subtitle: object.subtitle,
    description: object.description,
    realmId,
    phases,
    aiEnabled: true,
  };
}

/**
 * Build a journey from audio analysis data.
 * Detects the mood/vibe, maps to a realm, builds context, and generates via AI.
 */
export async function buildJourneyFromAnalysis(
  analysis: AnalysisResult,
  overrideRealmId?: string,
): Promise<Journey> {
  // Detect mood from analysis
  const vibe = detectVibe(analysis);

  // Pick realm: use override if provided, otherwise map from mood
  let realmId: string;
  if (overrideRealmId && getRealm(overrideRealmId)) {
    realmId = overrideRealmId;
  } else {
    const realmCandidates = MOOD_REALM_MAP[vibe.mood];
    // 70% primary realm, 30% secondary for variety
    realmId = Math.random() < 0.7
      ? realmCandidates[0]
      : realmCandidates[Math.floor(Math.random() * realmCandidates.length)];
    // Validate the realm exists, fallback to first candidate
    if (!getRealm(realmId)) realmId = realmCandidates[0];
  }

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

  return buildJourneyFromStory(contextString, realmId);
}
