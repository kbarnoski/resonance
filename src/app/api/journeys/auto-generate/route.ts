import { createClient } from "@/lib/supabase/server";
import { buildJourneyFromAnalysis } from "@/lib/journeys/journey-builder";
import type { AnalysisResult } from "@/lib/audio/types";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { recordingId, realmId } = await request.json();

    if (!recordingId) {
      return Response.json({ error: "Missing recordingId" }, { status: 400 });
    }

    // Fetch analysis from DB
    const { data: analysisRow, error: analysisError } = await supabase
      .from("analyses")
      .select("key_signature, tempo, time_signature, chords, notes")
      .eq("recording_id", recordingId)
      .single();

    if (analysisError || !analysisRow) {
      return Response.json(
        { error: "No analysis found for this recording" },
        { status: 404 },
      );
    }

    // Reconstruct AnalysisResult from DB columns
    const analysis: AnalysisResult = {
      status: "completed",
      key_signature: analysisRow.key_signature,
      tempo: analysisRow.tempo,
      time_signature: analysisRow.time_signature,
      chords: analysisRow.chords ?? [],
      notes: analysisRow.notes ?? [],
      midi_data: null,
    };

    // Generate journey from analysis
    const journey = await buildJourneyFromAnalysis(analysis, realmId ?? undefined);

    // Store in database
    const { data, error } = await supabase.from("journeys").insert({
      user_id: user.id,
      recording_id: recordingId,
      name: journey.name,
      subtitle: journey.subtitle,
      description: journey.description,
      story_text: `Auto-generated from audio analysis`,
      realm_id: journey.realmId,
      phases: JSON.parse(JSON.stringify(journey.phases)),
    }).select().single();

    if (error) {
      console.error("Failed to save auto-generated journey:", error);
      return Response.json(
        { error: `Failed to save journey: ${error.message}` },
        { status: 500 },
      );
    }

    return Response.json({
      journey: { ...journey, id: data.id, recordingId },
      dbRecord: data,
    });
  } catch (error) {
    console.error("Auto-generate journey error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { error: `Failed to auto-generate journey: ${message}` },
      { status: 500 },
    );
  }
}
