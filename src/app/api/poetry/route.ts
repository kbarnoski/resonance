import { generateObject } from "ai";
import { defaultModel } from "@/lib/ai/providers";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { mood, key_signature, tempo, summary, count = 5, avoid = [], avoidKeywords = [], phase, language, imagery, vizTheme, poetryType, storyContext } = await request.json();

    if (!mood) {
      return Response.json({ error: "Missing mood" }, { status: 400 });
    }

    const lineCount = Math.min(Math.max(count, 1), 10);

    // Determine fragment length rules based on poetryType
    const typeRules = poetryType === "word"
      ? "Each fragment: exactly 1-2 powerful, evocative single words. No phrases."
      : poetryType === "mixed"
        ? "Mix of fragments: ~40% should be single powerful words (1-2 words), ~60% should be short phrases (3-10 words)."
        : "Each fragment: 3-10 words";

    const poetrySchema = z.object({
      lines: z
        .array(z.string())
        .describe(`Exactly ${lineCount} short poetic fragments. ${typeRules}. Evocative, sensory, free verse. No rhyming.`),
    });

    const avoidList = Array.isArray(avoid) && avoid.length > 0
      ? `\n\n## Do NOT repeat or closely paraphrase any of these previously used fragments:\n${avoid.map((l: string) => `- "${l}"`).join("\n")}`
      : "";

    const avoidKeywordsList = Array.isArray(avoidKeywords) && avoidKeywords.length > 0
      ? `\n\n## BANNED KEYWORDS (never use these words or close synonyms): ${avoidKeywords.join(", ")}`
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

    // Visual world context — steer imagery toward the journey realm or viz theme
    const imageryContext = imagery
      ? `\n## Visual world: Draw imagery from this palette: ${imagery}`
      : vizTheme
        ? `\n## Visual atmosphere: The listener is immersed in a "${vizTheme}" visual environment. Let this atmosphere color your imagery.`
        : "";

    // Story context — when the listener has a personal narrative, let poetry resonate with it
    const storyContextSection = storyContext
      ? `\n## The listener's personal narrative: "${storyContext}". Let the poetry draw thematic resonance from this without retelling it.`
      : "";

    const { LANGUAGE_NAMES } = await import("@/lib/audio/languages");
    const langName = language && language !== "en" ? LANGUAGE_NAMES[language] ?? language : null;
    const languageInstruction = langName
      ? `\n## Language: Write all fragments in ${langName}. Do not use any English.`
      : "";

    // Random creative direction to force variety each batch — 35 unique angles
    const ANGLES = [
      "Write as if you are an architect describing a building that doesn't exist yet.",
      "Write as if you are a deep-sea creature sensing vibrations for the first time.",
      "Write as if each fragment is a telegram sent from a year that hasn't happened.",
      "Write as if you are a cartographer mapping emotions onto physical terrain.",
      "Write as if you are narrating the internal life of a machine learning to feel.",
      "Write as if you are translating the taste of sound into spatial directions.",
      "Write as if each line is graffiti left on the wall of an abandoned space station.",
      "Write as if you are a geologist describing layers of compressed time.",
      "Write as if you are a blind sculptor touching sound for the first time.",
      "Write as if each fragment is a weather forecast for a planet made of music.",
      "Write as if you are a botanist cataloguing plants that grow from frequencies.",
      "Write as if you are an archaeologist uncovering artifacts from a future civilization.",
      "Write as if each line is the last sentence of a novel nobody has written.",
      "Write as if you are describing the physics of a feeling to someone from another dimension.",
      "Write as if you are a chef deconstructing a dish made entirely of resonance.",
      "Write as if each fragment is instructions for assembling an emotion.",
      "Write as if you are an astronaut describing Earth sounds to aliens.",
      "Write as if you are a river explaining its own erosion patterns.",
      "Write as if you are a glass blower shaping molten silence into objects.",
      "Write as if each fragment is a street name in a city that only exists in dreams.",
      "Write as if you are a clockmaker describing the gears of a feeling.",
      "Write as if you are a lighthouse keeper logging phenomena no one else can see.",
      "Write as if each line is the title of a photograph taken by gravity.",
      "Write as if you are a perfumer composing a scent from overtones.",
      "Write as if you are a blacksmith forging a sensation out of raw frequency.",
      "Write as if each fragment is an ingredient list for a color.",
      "Write as if you are a meteorologist forecasting the weather inside a chord.",
      "Write as if you are a translator converting pressure into vocabulary.",
      "Write as if each line is directions to a place that only music can reach.",
      "Write as if you are a surgeon describing the anatomy of a shiver.",
      "Write as if you are a beekeeper observing a hive made of harmonics.",
      "Write as if each fragment is a measurement from an instrument that detects awe.",
      "Write as if you are a diver describing what you see in water made of sound.",
      "Write as if you are a stonemason carving a monument to a single vibration.",
      "Write as if each line is a label in a museum of extinct sensations.",
    ];
    const creativeAngle = ANGLES[Math.floor(Math.random() * ANGLES.length)];

    const prompt = `Generate exactly ${lineCount} short poetic text fragments for a music visualizer overlay. These are ambient text art — like Jenny Holzer projections or Brian Eno's Oblique Strategies.

## Rules
- ${typeRules}
- No rhyming, no meter — pure free verse
- Evocative and sensory, never literal or didactic
- No music jargon
- Each fragment is a self-contained image or sensation
- Every fragment must be completely original — never repeat imagery, structure, or vocabulary across calls
- Draw ALL imagery from the character of the music itself — its tempo, key, mood, and texture
- BANNED WORDS AND IMAGES — do NOT use any of these: ink, honey, amber, golden, cathedral, dissolving, boundaries, whisper, whispered, dancing, shadows, gentle, breeze, fading, silk, fabric, curtains, robes, vertebrae, marrow, sinew, tendons, bones, spine, ribcage, chalice, incense, altar, temple, pilgrimage, veil, luminous, ethereal, shimmer, glow, drift, echo, hollow, fracture, ripple, pulse, bloom, woven, thread, tapestry, vessel, threshold, emerge, crystalline, iridescent, gossamer, ancient, infinite, vast, cosmic, sacred, divine, eternal, celestial, radiant, serene, tranquil, ephemeral, transcendent, sublime, resonance, vibration, frequency, wavelength, harmony, melody, silence, stillness, light, darkness, depth, ocean, river, mountain, stone, crystal, mirror, glass, flame, smoke, mist, fog, dew, frost, moonlight, starlight, dawn, twilight, horizon, abyss, void, cosmos, universe, galaxy, nebula, aurora
- NEVER reuse the same imagery, metaphor, or thematic territory as previous fragments. Each batch must explore COMPLETELY different conceptual terrain
- Reach for images that feel like they have never been written before — strange, specific, physical, surprising
- Mix concrete sensory details with abstract sensation
- Each of the ${lineCount} fragments must come from a DIFFERENT domain of human experience. Never cluster around the same theme
- Pull from the full range of human experience — architecture, weather, geology, machinery, animals, food, mathematics, memory, cities, water, fire, pressure, texture, temperature, speed, weight, industry, sports, cooking, construction, transportation, astronomy, microscopy, medicine, botany, cartography, textiles, metallurgy, ceramics, fermentation, demolition, migration, archaeology, typography, clockwork, plumbing, aviation, deep-sea diving, beekeeping, glassblowing, printmaking

## Creative direction
${creativeAngle}

## The music
- Mood: ${mood}
- Key: ${key_signature ?? "unknown"}
${tempo ? `- Tempo: ~${tempo} BPM` : ""}
${summary ? `- Character: ${summary}` : ""}
${phaseContext}
${imageryContext}
${storyContextSection}
${languageInstruction}
${avoidList}
${avoidKeywordsList}

IMPORTANT: Every single fragment must be genuinely novel. If you catch yourself writing something that sounds "poetic" in a familiar way, delete it and write something weirder, more specific, more surprising. Prefer concrete nouns over abstract ones. Prefer unexpected verbs.`;

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
