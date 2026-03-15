import { generateObject } from "ai";
import { defaultModel } from "@/lib/ai/providers";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    const { mood, key_signature, tempo, summary, count = 5, avoid = [], phase } = await request.json();

    if (!mood) {
      return Response.json({ error: "Missing mood" }, { status: 400 });
    }

    const lineCount = Math.min(Math.max(count, 1), 10);

    const poetrySchema = z.object({
      lines: z
        .array(z.string())
        .describe(`Exactly ${lineCount} short poetic fragments, 3-10 words each. Evocative, sensory, free verse. No rhyming.`),
    });

    const avoidList = Array.isArray(avoid) && avoid.length > 0
      ? `\n\n## Do NOT repeat or closely paraphrase any of these previously used fragments:\n${avoid.map((l: string) => `- "${l}"`).join("\n")}`
      : "";

    // Phase-specific poetry direction (emotional tone only, no imagery)
    const phaseContextMap: Record<string, string> = {
      threshold: "Quiet, tentative. Something is about to begin.",
      expansion: "Intensifying. Shorter, sharper. Building.",
      transcendence: "Peak. Fragmented. Single words allowed. Raw.",
      illumination: "Clarity. Longer thoughts. Calm seeing.",
      return: "Gentle descent. Grounding. Tenderness.",
      integration: "Peace. Simple. Complete.",
    };

    const phaseContext = phase && phaseContextMap[phase]
      ? `\n## Emotional direction: ${phaseContextMap[phase]}`
      : "";

    const prompt = `Generate exactly ${lineCount} short poetic text fragments for a music visualizer overlay. These are ambient text art — like Jenny Holzer projections or Brian Eno's Oblique Strategies.

## Rules
- Each fragment: 3-10 words
- No rhyming, no meter — pure free verse
- Evocative and sensory, never literal or didactic
- No music jargon
- Each fragment is a self-contained image or sensation
- Every fragment must be completely original — never repeat imagery, structure, or vocabulary across calls
- Draw ALL imagery from the character of the music itself — its tempo, key, mood, and texture
- Do NOT fall back on stock poetic images. No honey, amber, golden light, cathedral, dissolving boundaries, whispered anything, dancing shadows, gentle breeze, fading light, silk, fabric, curtains, or any other cliché
- Reach for images that feel like they have never been written before — strange, specific, physical, surprising
- Mix concrete sensory details with abstract sensation
- Pull from the full range of human experience — architecture, weather, geology, the body, machinery, animals, food, mathematics, memory, cities, water, fire, pressure, texture, temperature, speed, weight

## The music
- Mood: ${mood}
- Key: ${key_signature ?? "unknown"}
${tempo ? `- Tempo: ~${tempo} BPM` : ""}
${summary ? `- Character: ${summary}` : ""}
${phaseContext}
${avoidList}

Improvise. Every batch should feel like it was written by a different poet hearing this music for the first time.`;

    const { object } = await generateObject({
      model: defaultModel,
      schema: poetrySchema,
      prompt,
      temperature: 1.0,
    });

    return Response.json(object);
  } catch (error) {
    console.error("Poetry API error:", error);
    return Response.json(
      { error: "Failed to generate poetry" },
      { status: 500 }
    );
  }
}
