import { generateObject } from "ai";
import { defaultModel } from "@/lib/ai/providers";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

// Defaults make every field tolerant of Claude returning a partial
// structured output. The previous strict version threw a ZodError
// when generateObject occasionally produced `{ '$PARAMETER_NAME': … }`
// (an SDK quirk), causing the route to 500. Now a partial response
// degrades gracefully — empty array for missing groups, empty string
// for missing overview — and the UI just shows what's available.
const insightsSummarySchema = z.object({
  overview: z.string().default("").describe("2-3 sentence overview of the library — total recordings, predominant keys/styles, overall musical tendencies"),
  clusters: z.array(z.object({
    name: z.string().default(""),
    recordingTitles: z.array(z.string()).default([]),
    description: z.string().default(""),
  })).default([]).describe("Groups of musically similar recordings"),
  standouts: z.array(z.object({
    title: z.string().default(""),
    reason: z.string().default(""),
  })).default([]).describe("Recordings that are harmonically or rhythmically unique compared to the rest"),
  suggestions: z.array(z.string()).default([]).describe("3-5 actionable development suggestions referencing specific recordings"),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { analyses } = await request.json();

    if (!analyses || !Array.isArray(analyses) || analyses.length === 0) {
      return Response.json({ error: "No analyses provided" }, { status: 400 });
    }

    const recordingSummaries = analyses.map((a: {
      title: string;
      key_signature: string | null;
      tempo: number | null;
      chords: { chord: string }[];
    }) => {
      const uniqueChords = [...new Set(a.chords.map((c) => c.chord))];
      return `- "${a.title}" — Key: ${a.key_signature ?? "?"}, Tempo: ${a.tempo ? `~${a.tempo} BPM` : "?"}, Chords: ${uniqueChords.slice(0, 10).join(", ")}`;
    }).join("\n");

    const prompt = `Analyze this library of ${analyses.length} piano voice memo recordings and generate insights.

## Recordings
${recordingSummaries}

Group similar recordings into clusters based on shared musical characteristics (key, chord vocabulary, tempo, style). Identify any standout recordings that are harmonically unique. Suggest how specific recordings could be developed or combined into full pieces.`;

    // Claude's generateObject occasionally returns malformed structured
    // output (zod gets undefined on every required field). When that
    // happens we retry once before bubbling a 500 — the second call
    // almost always succeeds, as observed in dev logs:
    //   POST /api/insights/summarize 500 in 39s
    //   POST /api/insights/summarize 200 in 46s   ← natural retry
    let summary;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await generateObject({
          model: defaultModel,
          schema: insightsSummarySchema,
          prompt,
        });
        summary = result.object;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt === 0) continue;
        throw err;
      }
    }
    if (!summary) throw lastErr ?? new Error("Empty summary");

    return Response.json({ summary });
  } catch (error) {
    console.error("Insights summarize error:", error);
    return Response.json(
      { error: "Failed to generate insights summary" },
      { status: 500 }
    );
  }
}
