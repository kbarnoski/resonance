import { generateObject } from "ai";
import { defaultModel } from "@/lib/ai/providers";
import { LANGUAGE_NAMES } from "@/lib/audio/languages";
import { z } from "zod";

const storySchema = z.object({
  title: z.string().describe("A short, evocative title for the story (3-8 words)"),
  paragraphs: z
    .array(
      z.object({
        phaseId: z.string().describe("The journey phase ID this paragraph corresponds to"),
        text: z.string().describe("A 2-4 sentence narrative paragraph for this phase"),
        imagePrompt: z.string().describe("A visual description for AI image generation, 10-20 words"),
        mood: z.string().describe("The emotional tone: flowing, dreamy, intense, mystical, transcendent, melancholic, chaotic, hypnotic"),
      })
    )
    .describe("Exactly 6 paragraphs, one for each journey phase"),
});

export async function POST(request: Request) {
  try {
    const { journeyName, realmId, mood, language, phases, poetryImagery } = await request.json();

    if (!journeyName || !phases) {
      return Response.json({ error: "Missing journeyName or phases" }, { status: 400 });
    }

    const langName = language && language !== "en" ? LANGUAGE_NAMES[language] ?? language : null;
    const languageInstruction = langName
      ? `\n## Language: Write the entire story in ${langName}. Do not use any English.`
      : "";

    const phaseDescriptions = phases
      .map((p: { id: string; guidancePhrases: string[] }) =>
        `- ${p.id}: ${p.guidancePhrases?.[0] ?? ""}`)
      .join("\n");

    const prompt = `Generate a short, coherent narrative story for an immersive audio-visual journey called "${journeyName}".

## Structure
The story has exactly 6 paragraphs, one for each phase of the journey:
${phaseDescriptions}

## Phase IDs (in order)
threshold, expansion, transcendence, illumination, return, integration

## Rules
- Each paragraph is 2-4 sentences — evocative, sensory, and poetic
- The story should feel like a single continuous narrative arc
- Move from quiet anticipation (threshold) through building intensity (expansion) to peak experience (transcendence), then clarity (illumination), gentle descent (return), and peaceful resolution (integration)
- Use second person ("you") to immerse the listener
- No clichés, no rhyming — literary quality, like a prose poem
- Draw imagery from ${poetryImagery ? `this visual world: "${poetryImagery}"` : realmId ? `the "${realmId}" realm` : "the journey's visual themes"} and the "${mood ?? "flowing"}" mood
- Each paragraph's imagePrompt should be a concise visual scene description suitable for AI image generation
- The imagePrompt should NOT describe text or typography — only visual scenes
${languageInstruction}

Write a story that transforms the listener.`;

    const { object } = await generateObject({
      model: defaultModel,
      schema: storySchema,
      prompt,
      temperature: 0.9,
    });

    return Response.json(object);
  } catch (error) {
    console.error("Story API error:", error);
    return Response.json(
      { error: "Failed to generate story" },
      { status: 500 }
    );
  }
}
