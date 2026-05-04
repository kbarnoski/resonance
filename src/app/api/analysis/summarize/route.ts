import { generateObject } from "ai";
import { defaultModel } from "@/lib/ai/providers";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { logger } from "@/lib/logger";

const summarySchema = z.object({
  overview: z.string().describe("A 2-3 sentence overview of the piece's character, style, and mood"),
  key_center: z.string().describe("The key center with any modulations or tonicizations noted"),
  sections: z.array(z.object({
    label: z.string().describe("Section label with timestamp range, e.g. 'Intro (0:00-0:15)'"),
    description: z.string().describe("What happens musically in this section — chords, melody, texture"),
  })).describe("Musical sections in chronological order"),
  chord_vocabulary: z.array(z.string()).describe("All unique chords used, listed in order of importance"),
  harmonic_highlights: z.string().describe("Notable harmonic moments — strongest cadences, interesting substitutions, modal borrowing"),
  rhythm_and_feel: z.string().describe("Rhythmic character, harmonic rhythm, tempo feel"),
  relearning_tips: z.string().describe("Practical advice for relearning this piece — which section to start with, voicing suggestions, practice order"),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { analysisId, analysis, title } = await request.json();

    if (!analysis || !analysisId) {
      return Response.json({ error: "Missing analysis data" }, { status: 400 });
    }

    const { data: ownedAnalysis } = await supabase
      .from("analyses")
      .select("id, recordings!inner(user_id)")
      .eq("id", analysisId)
      .eq("recordings.user_id", user.id)
      .maybeSingle();
    if (!ownedAnalysis) {
      return Response.json({ error: "Analysis not found" }, { status: 404 });
    }

    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    function midiToNote(midi: number): string {
      return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
    }

    // Build chord progression string
    const chordProgression = (analysis.chords ?? [])
      .map((c: { chord: string; time: number; duration: number }) =>
        `${c.chord} (${formatTime(c.time)}, ${c.duration.toFixed(1)}s)`
      )
      .join(" | ");

    // Note range
    const notes = analysis.notes ?? [];
    const midiValues = notes.map((n: { midi: number }) => n.midi);
    const minNote = midiValues.length > 0 ? midiToNote(Math.min(...midiValues)) : "N/A";
    const maxNote = midiValues.length > 0 ? midiToNote(Math.max(...midiValues)) : "N/A";

    const prompt = `Analyze this piano voice memo recording titled "${title ?? "Untitled"}" and generate a teaching summary that would help the pianist relearn and develop this piece.

## Raw Analysis Data

**Key:** ${analysis.key_signature ?? "Unknown"} (confidence: ${Math.round((analysis.key_confidence ?? 0) * 100)}%)
**Tempo:** ${analysis.tempo ? `~${analysis.tempo} BPM` : "Unknown"}
**Time Signature:** ${analysis.time_signature ?? "Unknown"}
**Notes Detected:** ${notes.length}
**Range:** ${minNote} to ${maxNote}

**Full Chord Progression (with timestamps):**
${chordProgression || "No chords detected"}

Think about this as a music teacher would: identify natural sections, explain the harmonic language, and give practical relearning advice. Be specific about the actual chords and progressions found.`;

    const { object: summary } = await generateObject({
      model: defaultModel,
      schema: summarySchema,
      prompt,
    });

    const { error } = await supabase
      .from("analyses")
      .update({ summary })
      .eq("id", analysisId);

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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
