import { createClient } from "@/lib/supabase/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { VisualizerClient } from "@/components/audio/visualizer-client";

export default async function VisualizerPage({
  searchParams,
}: {
  searchParams: Promise<{
    recording?: string;
    live?: string;
    journey?: string;
    autoplay?: string;
    customJourneyId?: string;
    pathToken?: string;
    picker?: string;
    from?: string;
  }>;
}) {
  const params = await searchParams;
  const recordingId = params.recording;
  const liveMode = params.live === "true";
  const journey = params.journey;
  const autoplay = params.autoplay !== "0";
  const initialPicker = params.picker === "journeys" ? "journeys" : undefined;
  const fromPillar: "studio" | "vizes" | "journeys" | "paths" | undefined =
    params.from === "vizes" || params.from === "journeys" || params.from === "paths" || params.from === "studio"
      ? params.from
      : undefined;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = !!user && !!user.email && user.email.toLowerCase().trim() === (process.env.ADMIN_EMAIL ?? "").toLowerCase().trim();

  let recording: { id: string; title?: string; audio_url: string; artist?: string } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let analysis: any | null = null;
  let cueMarkers: { time: number; label: string }[] = [];

  // Path + custom journey hydration. When a user clicks a track from
  // /path/[token], we land here with customJourneyId + pathToken query
  // params. Fetch both so VisualizerClient can start the journey with the
  // path context already attached (for a native Continue Path end overlay).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let initialCustomJourney: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let initialPath: any = null;
  if (params.customJourneyId && user) {
    // Fire the journey row fetch in parallel with the (optional) path row
    // fetch. They're independent — we don't need jRow to know which path
    // to fetch. Cuts this transition's server time by ~150–300ms.
    const anon = params.pathToken
      ? createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      : null;
    const [journeyResult, pathResult] = await Promise.all([
      supabase
        .from("journeys")
        .select("*")
        .eq("id", params.customJourneyId)
        .eq("user_id", user.id)
        .single(),
      params.pathToken && anon
        ? anon.from("journey_paths").select("*").eq("share_token", params.pathToken).single()
        : Promise.resolve({ data: null }),
    ]);
    const jRow = journeyResult.data;
    if (pathResult.data) initialPath = pathResult.data;
    if (jRow) {
      initialCustomJourney = jRow;
      // Also pre-load the recording so audio is ready on mount
      if (jRow.recording_id) {
        const [recResult, analysisResult, cueResult] = await Promise.all([
          supabase.from("recordings").select("id, title, audio_url, artist").eq("id", jRow.recording_id).single(),
          supabase.from("analyses").select("*").eq("recording_id", jRow.recording_id).single(),
          supabase.from("markers").select("time, label").eq("recording_id", jRow.recording_id).eq("type", "cue").order("time"),
        ]);
        if (recResult.data) {
          recording = {
            id: recResult.data.id,
            title: recResult.data.title,
            audio_url: `/api/audio/${recResult.data.id}`,
            artist: recResult.data.artist ?? undefined,
          };
        }
        analysis = analysisResult.data;
        cueMarkers = (cueResult.data ?? []) as { time: number; label: string }[];
      }
    }
  } else if (recordingId) {
    const [recResult, analysisResult, cueResult] = await Promise.all([
      supabase.from("recordings").select("id, title, audio_url, artist").eq("id", recordingId).single(),
      supabase.from("analyses").select("*").eq("recording_id", recordingId).single(),
      supabase.from("markers").select("time, label").eq("recording_id", recordingId).eq("type", "cue").order("time"),
    ]);

    if (recResult.data) {
      recording = {
        id: recResult.data.id,
        title: recResult.data.title,
        audio_url: `/api/audio/${recResult.data.id}`,
        artist: recResult.data.artist ?? undefined,
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
      userId={user?.id}
      cueMarkers={cueMarkers}
      initialCustomJourney={initialCustomJourney}
      initialPath={initialPath}
      initialPicker={initialPicker}
      fromPillar={fromPillar}
    />
  );
}
