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
  }>;
}) {
  const params = await searchParams;
  const recordingId = params.recording;
  const liveMode = params.live === "true";
  const journey = params.journey;
  const autoplay = params.autoplay !== "0";

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
        ? anon.rpc("get_path_by_token", { p_token: params.pathToken })
        : Promise.resolve({ data: null }),
    ]);
    const jRow = journeyResult.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pathRow = ((pathResult.data ?? []) as any[])[0] ?? null;
    if (pathRow) {
      // get_path_by_token doesn't echo the token back; VisualizerClient
      // reads initialPath.share_token (activePath + /path prefetch), so
      // re-attach the token we already hold.
      initialPath = { ...pathRow, share_token: params.pathToken };
    }
    if (jRow) {
      initialCustomJourney = jRow;
      // Also pre-load the recording so audio is ready on mount
      if (jRow.recording_id) {
        // Signed-in owner context — direct table read stays (owner RLS
        // policy). The DB audio_url column is never surfaced: playback
        // always resolves through /api/audio/[id].
        const [recResult, analysisResult, cueResult] = await Promise.all([
          supabase.from("recordings").select("id, title, artist").eq("id", jRow.recording_id).single(),
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
    // Signed-in visitors keep the direct table read (their RLS policies
    // decide visibility). Anonymous visitors go through the token-scoped
    // get_released_recording_meta function so this flow survives the
    // Phase-2 anon RLS flip (MIGRATION-NOTES-2026-08-25.md, item 9).
    // Analyses + markers stay direct — their public policies remain in
    // place at flip time.
    const recPromise = user
      ? supabase.from("recordings").select("id, title, artist").eq("id", recordingId).single()
      : supabase.rpc("get_released_recording_meta", { p_recording_id: recordingId });
    const [recResult, analysisResult, cueResult] = await Promise.all([
      recPromise,
      supabase.from("analyses").select("*").eq("recording_id", recordingId).single(),
      supabase.from("markers").select("time, label").eq("recording_id", recordingId).eq("type", "cue").order("time"),
    ]);

    const recRow = user
      ? (recResult.data as { id: string; title: string; artist: string | null } | null)
      : (((recResult.data ?? []) as { id: string; title: string; artist: string | null }[])[0] ?? null);
    if (recRow) {
      recording = {
        id: recRow.id,
        title: recRow.title,
        audio_url: `/api/audio/${recRow.id}`,
        artist: recRow.artist ?? undefined,
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
    />
  );
}
