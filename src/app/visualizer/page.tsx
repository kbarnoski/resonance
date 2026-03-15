import { createClient } from "@/lib/supabase/server";
import { VisualizerClient } from "@/components/audio/visualizer-client";

export default async function VisualizerPage({
  searchParams,
}: {
  searchParams: Promise<{ recording?: string; live?: string; journey?: string }>;
}) {
  const params = await searchParams;
  const recordingId = params.recording;
  const liveMode = params.live === "true";
  const journey = params.journey;

  let recording: { id: string; title?: string; audio_url: string } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let analysis: any | null = null;

  if (recordingId) {
    const supabase = await createClient();
    const [recResult, analysisResult] = await Promise.all([
      supabase.from("recordings").select("id, title, audio_url").eq("id", recordingId).single(),
      supabase.from("analyses").select("*").eq("recording_id", recordingId).single(),
    ]);

    if (recResult.data) {
      recording = {
        id: recResult.data.id,
        title: recResult.data.title,
        audio_url: `/api/audio/${recResult.data.id}`,
      };
    }
    analysis = analysisResult.data;
  }

  return (
    <VisualizerClient
      recording={recording}
      analysis={analysis}
      initialLive={liveMode}
      initialJourney={journey}
    />
  );
}
