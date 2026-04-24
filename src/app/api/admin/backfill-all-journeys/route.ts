import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { generateObject } from "ai";
import { defaultModel } from "@/lib/ai/providers";
import { z } from "zod";
import { JOURNEYS } from "@/lib/journeys/journeys";
import type { JourneyPhase } from "@/lib/journeys/types";

/**
 * Admin-only platform-wide sweep: enrich every custom journey in the DB
 * AND every built-in journey missing aiPromptSequence with multi-variant
 * sequences. Built-in enrichments go to the built_in_enrichments table
 * (read by every user at runtime); custom-journey enrichments are
 * written directly to the journeys table via the service role so RLS
 * doesn't block updates to other users' rows.
 *
 * Run it once after deploying the new journey-builder schema to
 * retroactively bring every pre-existing journey up to Ghost-level
 * imagery richness.
 *
 * POST /api/admin/backfill-all-journeys
 *   body: { limit?: number, batch?: number }
 *     limit — cap on total journeys processed in this call (default 8).
 *     batch — same thing, kept for clarity. Keep this small so the call
 *             stays under Vercel's 300s function ceiling — each Claude
 *             call is ~4-8s so 8 journeys ≈ 60-70s budget.
 *
 * Call repeatedly (the endpoint skips already-enriched rows) until both
 * customEnriched and builtInEnriched stop incrementing.
 */

// Stretch the Vercel function timeout from the 10s hobby default —
// this endpoint does multiple sequential Claude generations.
export const maxDuration = 300;

const backfillSchema = z.object({
  phases: z
    .array(
      z.object({
        aiPromptSequence: z.array(z.string()).min(6).max(7),
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

async function generateSequences(
  journeyName: string,
  subtitle: string,
  story: string,
  phases: JourneyPhase[],
) {
  const phaseSummary = phases
    .map((p, i) => `Phase ${i + 1} (${p.id ?? ""}): ${p.aiPrompt ?? ""}`)
    .join("\n");

  const { object } = await generateObject({
    model: defaultModel,
    schema: backfillSchema,
    prompt: `Expand this journey's single-prompt phases into rich multi-variant sequences so the renderer builds a cinematic collage instead of a slideshow.

Journey: "${journeyName}" — ${subtitle}
Story/intent: ${story}

Existing single prompts, in phase order:
${phaseSummary}

For EACH of the 6 phases, produce an aiPromptSequence of 6-7 variant prompts (15-30 words each). Each variant shows a different moment, camera angle, or focal subject within the same phase so the pipeline generates distinct images instead of caching to the same render. Vary camera framing on every entry: extreme wide establishing, overhead aerial, low-angle worm's-eye, three-quarter tracking, silhouette, environmental close-up, rear tracking. Never repeat the same framing twice inside one phase. Preserve the narrative thread of each original prompt — you're enriching it, not replacing it.`,
    temperature: 0.8,
  });

  return object.phases.map((p) => p.aiPromptSequence);
}

export async function POST(request: Request) {
  // Admin gate via the user's authenticated session.
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail || user.email?.toLowerCase().trim() !== adminEmail) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return Response.json(
      { error: "Service role not configured (SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }
  // Service-role client: bypasses RLS so we can update other users' journeys.
  const admin = createAdminClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Default 8 per call to stay under the 300s Vercel ceiling (each
  // Claude call is ~4-8s, so 8 journeys ≈ 60-70s). Caller repeats until
  // the summary shows no more enrichments happening.
  let limit = 8;
  try {
    const body = await request.json().catch(() => ({}));
    const fromBody = body?.limit ?? body?.batch;
    if (typeof fromBody === "number" && fromBody > 0) {
      limit = Math.min(fromBody, 40);
    }
  } catch { /* ignore */ }

  const results = {
    customProcessed: 0,
    customEnriched: 0,
    customSkipped: 0,
    customFailed: 0,
    builtInProcessed: 0,
    builtInEnriched: 0,
    builtInSkipped: 0,
    builtInFailed: 0,
    errors: [] as string[],
  };

  // Shared enrichment budget across custom + built-in.
  let enrichedThisCall = 0;

  // ── Custom journeys ──
  // Pull a handful of candidates without sequences — we over-fetch a bit
  // so if some are already enriched we still find work to do.
  const { data: customs } = await admin
    .from("journeys")
    .select("id, name, subtitle, description, story_text, phases")
    .limit(limit * 3);

  for (const row of customs ?? []) {
    if (enrichedThisCall >= limit) break;
    results.customProcessed += 1;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const phases = row.phases as any[];
      if (!Array.isArray(phases) || phases.length !== 6) {
        results.customSkipped += 1;
        continue;
      }
      if (hasSequences(phases)) {
        results.customSkipped += 1;
        continue;
      }
      const story = row.story_text || row.description || row.name;
      const sequences = await generateSequences(
        row.name ?? "Untitled",
        row.subtitle ?? "",
        story,
        phases as JourneyPhase[],
      );
      const updatedPhases = phases.map((p, i) => ({
        ...p,
        aiPromptSequence: sequences[i],
      }));
      const { error: writeErr } = await admin
        .from("journeys")
        .update({ phases: updatedPhases })
        .eq("id", row.id);
      if (writeErr) {
        results.customFailed += 1;
        results.errors.push(`custom ${row.id}: ${writeErr.message}`);
      } else {
        results.customEnriched += 1;
        enrichedThisCall += 1;
      }
    } catch (err) {
      results.customFailed += 1;
      results.errors.push(
        `custom ${row.id}: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  // ── Built-in journeys (except Ghost, which is hand-authored) ──
  const { data: existingEnrichments } = await admin
    .from("built_in_enrichments")
    .select("journey_id");
  const enrichedIds = new Set(
    (existingEnrichments ?? []).map((r: { journey_id: string }) => r.journey_id),
  );

  for (const journey of JOURNEYS) {
    if (enrichedThisCall >= limit) break;
    results.builtInProcessed += 1;
    try {
      if (journey.id === "ghost") {
        results.builtInSkipped += 1;
        continue;
      }
      if (enrichedIds.has(journey.id)) {
        results.builtInSkipped += 1;
        continue;
      }
      // Skip if the built-in already has sequences in code.
      if (hasSequences(journey.phases)) {
        results.builtInSkipped += 1;
        continue;
      }
      const sequences = await generateSequences(
        journey.name,
        journey.subtitle ?? "",
        journey.description ?? journey.subtitle ?? journey.name,
        journey.phases,
      );
      const enrichedPhases = journey.phases.map((p, i) => ({
        id: p.id,
        aiPromptSequence: sequences[i],
      }));
      const { error: writeErr } = await admin
        .from("built_in_enrichments")
        .upsert(
          {
            journey_id: journey.id,
            phases: enrichedPhases,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "journey_id" },
        );
      if (writeErr) {
        results.builtInFailed += 1;
        results.errors.push(`built-in ${journey.id}: ${writeErr.message}`);
      } else {
        results.builtInEnriched += 1;
        enrichedThisCall += 1;
      }
    } catch (err) {
      results.builtInFailed += 1;
      results.errors.push(
        `built-in ${journey.id}: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  return Response.json(results);
}
