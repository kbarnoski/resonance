import { createClient } from "@/lib/supabase/server";
import { VisualizerClient } from "@/components/audio/visualizer-client";

export default async function VisualizerPage({
  searchParams,
}: {
  searchParams: Promise<{ recording?: string; live?: string; journey?: string; autoplay?: string }>;
}) {
  const params = await searchParams;
  const recordingId = params.recording;
  const liveMode = params.live === "true";
  const journey = params.journey;
  const autoplay = params.autoplay !== "0";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = !!user;

  let recording: { id: string; title?: string; audio_url: string } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let analysis: any | null = null;
  let cueMarkers: { time: number; label: string }[] = [];

  if (recordingId) {
    const [recResult, analysisResult, cueResult] = await Promise.all([
      supabase.from("recordings").select("id, title, audio_url").eq("id", recordingId).single(),
      supabase.from("analyses").select("*").eq("recording_id", recordingId).single(),
      supabase.from("markers").select("time, label").eq("recording_id", recordingId).eq("type", "cue").order("time"),
    ]);

    if (recResult.data) {
      recording = {
        id: recResult.data.id,
        title: recResult.data.title,
        audio_url: `/api/audio/${recResult.data.id}`,
      };
    }
    analysis = analysisResult.data;
    cueMarkers = (cueResult.data ?? []) as { time: number; label: string }[];
  }

  return (
    <VisualizerClient
      recording={recording}
      analysis={analysis}
      initialLive={liveMode}
      initialJourney={journey}
      autoplay={autoplay}
      isAdmin={isAdmin}
      cueMarkers={cueMarkers}
    />
  );
}
