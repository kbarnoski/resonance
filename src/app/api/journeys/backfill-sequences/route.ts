import { createClient } from "@/lib/supabase/server";
import { generateObject } from "ai";
import { defaultModel } from "@/lib/ai/providers";
import { z } from "zod";
import { logger } from "@/lib/logger";

/**
 * Retrofit old custom journeys with the multi-variant aiPromptSequence
 * the renderer needs to produce rich collage imagery instead of a
 * single-image slideshow. Ghost has this baked in by hand; every custom
 * journey generated before we taught the builder to produce sequences
 * ships with only one prompt per phase — those journeys feel flat on
 * playback because the image cache returns the same render every time.
 *
 * POST /api/journeys/backfill-sequences
 *   body: { journeyId: string }
 *
 * The caller must own the journey (RLS enforces that). We re-read the
 * journey's story_text + existing phase aiPrompts, ask Claude for 6-7
 * varied variants per phase, and write them back into the phases JSONB.
 * Skip if a phase already has aiPromptSequence of length >= 4 — it's
 * likely been backfilled already.
 */

const backfillSchema = z.object({
  phases: z
    .array(
      z.object({
        aiPromptSequence: z
          .array(z.string())
          .min(6)
          .max(7),
      }),
    )
    .length(6),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasSequences(phases: any[]): boolean {
  if (!Array.isArray(phases) || phases.length === 0) return false;
  return phases.every(
    (p) => Array.isArray(p?.aiPromptSequence) && p.aiPromptSequence.length >= 4,
  );
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { journeyId } = await request.json();
    if (!journeyId || typeof journeyId !== "string") {
      return Response.json({ error: "Missing journeyId" }, { status: 400 });
    }

    const { data: row, error: readErr } = await supabase
      .from("journeys")
      .select("id, user_id, name, subtitle, description, story_text, phases")
      .eq("id", journeyId)
      .single();
    if (readErr || !row) {
      return Response.json({ error: "Journey not found" }, { status: 404 });
    }
    if (row.user_id !== user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const phases = row.phases as any[];
    if (!Array.isArray(phases) || phases.length !== 6) {
      return Response.json({ error: "Invalid journey phases" }, { status: 400 });
    }
    if (hasSequences(phases)) {
      return Response.json({ ok: true, skipped: true, reason: "already enriched" });
    }

    const story = row.story_text || row.description || row.name;
    const phaseSummary = phases
      .map((p, i) => `Phase ${i + 1} (${p?.id ?? ""}): ${p?.aiPrompt ?? ""}`)
      .join("\n");

    const { object } = await generateObject({
      model: defaultModel,
      schema: backfillSchema,
      prompt: `Expand this existing journey's single-prompt phases into rich multi-variant sequences so the renderer can build a cinematic collage instead of a slideshow.

Journey: "${row.name}" — ${row.subtitle ?? ""}
Story/intent: ${story}

Existing single prompts, in phase order:
${phaseSummary}

For EACH of the 6 phases, produce an aiPromptSequence of 6-7 variant prompts (15-30 words each). Each variant shows a different moment, camera angle, or focal subject within the same phase so the image pipeline generates distinct renders instead of caching to the same image. Vary camera framing on every entry: extreme wide establishing, overhead aerial, low-angle worm's-eye, three-quarter tracking, silhouette, environmental close-up, rear tracking. Never repeat the same framing twice inside one phase.

Preserve the narrative thread of each original aiPrompt — you're enriching it, not replacing it.`,
      temperature: 0.8,
    });

    const updatedPhases = phases.map((p, i) => ({
      ...p,
      aiPromptSequence: object.phases[i].aiPromptSequence,
    }));

    const { error: writeErr } = await supabase
      .from("journeys")
      .update({ phases: updatedPhases })
      .eq("id", journeyId)
      .eq("user_id", user.id);

    if (writeErr) {
      logger.error("journeys/backfill-sequences", "write failed:", writeErr);
      return Response.json(
        { error: `Failed to save enriched phases: ${writeErr.message}` },
        { status: 500 },
      );
    }

    return Response.json({ ok: true, phases: updatedPhases });
  } catch (err) {
    logger.error("journeys/backfill-sequences", "error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Backfill failed: ${msg}` }, { status: 500 });
  }
}
