import { enforceLlmLimit, readCappedJson } from "@/lib/api/llm-guard";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { generateDeepSummary } from "@/lib/audio/deep-summary";
import { isAnalysisFrozen } from "@/lib/audio/analysis-protected";
import type { MusicProfile } from "@/lib/audio/music-profile";

/**
 * Deep analysis v2 (see src/lib/audio/deep-summary.ts).
 *
 * The client sends only { analysisId, title, profile? } — the notes,
 * chords and events are read from the DB here. (Root cause of 80 missing
 * summaries, 2026-09-19 → 10-05: the runner used to POST the whole
 * analysis row — 10k+ notes, ~1 MB — and readCappedJson's 64 KB cap
 * rejected every one with a 413 that the runner swallowed.)
 * `profile` is the browser-computed MusicProfile (audio tempo, sections,
 * dynamics); without it the server builds one from the notes alone.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Batch-analyze runs one per track — allow a deeper burst than chat.
    const limited = await enforceLlmLimit(request, user.id, "analysis-summarize", { burst: 40, refillPerSec: 0.1 });
    if (limited) return limited;
    const body = await readCappedJson(request, 256 * 1024);
    if (body instanceof Response) return body;
    const { analysisId, title, profile } = body as { analysisId?: string; title?: string; profile?: MusicProfile };

    if (!analysisId) {
      return Response.json({ error: "Missing analysisId" }, { status: 400 });
    }

    const { data: row } = await supabase
      .from("analyses")
      .select("id, recording_id, key_signature, notes, chords, events, recordings!inner(user_id, title, duration)")
      .eq("id", analysisId)
      .eq("recordings.user_id", user.id)
      .maybeSingle();
    if (!row) {
      return Response.json({ error: "Analysis not found" }, { status: 404 });
    }
    const rec = row.recordings as unknown as { title: string; duration: number | null };

    const usableProfile =
      profile && typeof profile === "object" && profile.version === 2 && Array.isArray(profile.sections) && profile.sections.length > 0
        ? profile
        : null;

    const { summary, profile: used } = await generateDeepSummary({
      title: title ?? rec?.title ?? null,
      notes: row.notes ?? [],
      chords: row.chords ?? [],
      events: row.events ?? [],
      duration: rec?.duration ?? null,
      keySignature: row.key_signature,
      profile: usableProfile,
    });

    // Frozen recordings (Ghost/Snowflake/Realized/Kinetic Lab): the Room
    // reads these columns at runtime — never write them automatically.
    if (isAnalysisFrozen(row.recording_id)) {
      return Response.json({ summary, frozen: true });
    }

    const update: Record<string, unknown> = { summary };
    if (used.tempo) update.tempo = Math.round(used.tempo.bpm);
    if (used.key.detected) update.key_signature = used.key.detected;
    const { error } = await supabase.from("analyses").update(update).eq("id", analysisId);

    if (error) {
      logger.error("analysis/summarize", "Failed to save summary:", error);
      return Response.json({ error: "Failed to save summary" }, { status: 500 });
    }

    return Response.json({ summary });
  } catch (error) {
    logger.error("analysis/summarize", "API error:", error);
    return Response.json(
      { error: "Failed to generate summary" },
      { status: 500 }
    );
  }
}
