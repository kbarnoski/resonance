import { generateText } from "ai";
import { fastVisionModel } from "@/lib/ai/providers";

/**
 * Fast yes/no visual compliance check for generated journey imagery.
 *
 * Used by AiImageLayer when a journey has a strict visual contract (e.g. Ghost:
 * must show transparent wings, long white spiral hair, a feminine figure in a
 * white dress, no halo, no face). We call this right after fal.ai returns an
 * image URL and BEFORE the image is painted onto the canvas — if it fails the
 * check, the frame is silently discarded and the next generation fires.
 *
 * Uses Claude Haiku for low latency (~1s) and low cost (~$0.001 per check).
 */
export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    // No key — permissive pass-through so the app still works offline-ish.
    return Response.json({ valid: true, reason: "no-api-key" });
  }

  try {
    const { imageUrl, checks } = await request.json();

    if (!imageUrl || typeof imageUrl !== "string") {
      return Response.json({ error: "Missing imageUrl" }, { status: 400 });
    }

    // Default check covers Ghost's absolute requirements.
    const checkList: string[] = Array.isArray(checks) && checks.length > 0
      ? checks
      : [
          "a slender feminine figure is visible somewhere in the frame",
          "the figure has long pale/white/silver hair (NOT brown, NOT black, NOT tied up in a bun or ponytail)",
          "two wing shapes are visible behind the figure (can be transparent, wispy, or made of light)",
          "the figure is wearing a dress or flowing garment (NOT nude, NOT bare-skinned)",
          "no classical halo ring above the head",
        ];

    const checksBlock = checkList.map((c, i) => `${i + 1}. ${c}`).join("\n");

    const result = await generateText({
      model: fastVisionModel,
      maxTokens: 20,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Check this image against the following requirements:\n${checksBlock}\n\n` +
                `Answer with a single token: "PASS" if ALL requirements are clearly met, ` +
                `"FAIL" if ANY are not met. Do not explain.`,
            },
            {
              type: "image",
              image: new URL(imageUrl),
            },
          ],
        },
      ],
    });

    const answer = (result.text ?? "").trim().toUpperCase();
    const valid = answer.startsWith("PASS");

    return Response.json({ valid, reason: valid ? undefined : answer.slice(0, 40) });
  } catch (error) {
    // On ANY error — network, API, parse — default to permissive so we don't
    // freeze the journey. Prompt-level controls are still the primary defense.
    console.error("[validate] error:", error);
    return Response.json({ valid: true, reason: "error" });
  }
}
