import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { SharedJourneyClient } from "./client";
import { getJourney, JOURNEYS } from "@/lib/journeys/journeys";

export const dynamic = "force-dynamic";

function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAnonClient();
  const { data: metaRow } = await supabase
    .from("journeys")
    .select("name, subtitle, theme")
    .eq("share_token", token)
    .single();

  if (!metaRow) return { title: "Journey Not Found" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metaTheme = metaRow.theme as Record<string, any> | null;
  const metaBuiltin = metaTheme?.builtinJourneyId
    ? getJourney(metaTheme.builtinJourneyId)
    : JOURNEYS.find((j) => j.name === metaRow.name) ?? null;
  const name = metaBuiltin?.name ?? metaRow.name;
  const subtitle = metaBuiltin?.subtitle ?? metaRow.subtitle;

  return {
    title: `${name} — Resonance`,
    description: subtitle || "A shared journey on Resonance",
  };
}

export default async function SharedJourneyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ pathToken?: string }>;
}) {
  const { token } = await params;
  const { pathToken } = await searchParams;
  const supabase = createAnonClient();

  const { data: journeyRow } = await supabase
    .from("journeys")
    .select("*")
    .eq("share_token", token)
    .single();

  if (!journeyRow) notFound();

  // Culmination journeys have no bound recording — they pick a random track
  // from theme.randomTrackPool at playback time so every replay surprises.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const culmTheme = journeyRow.theme as Record<string, any> | null;
  if (
    !journeyRow.recording_id &&
    culmTheme?.isCulmination &&
    Array.isArray(culmTheme.randomTrackPool) &&
    culmTheme.randomTrackPool.length > 0
  ) {
    const pool = culmTheme.randomTrackPool as string[];
    journeyRow.recording_id = pool[Math.floor(Math.random() * pool.length)];
  }

  // Build audio URL directly from recording_id (audio API handles access for shared journeys)
  const audioUrl = journeyRow.recording_id
    ? `/api/audio/${journeyRow.recording_id}`
    : null;

  // Fetch recording artist, analysis events, and cue markers for credits + bass flash
  let musicArtist: string | null = null;
  let analysisEvents: { time: number; type: string; intensity: number }[] = [];
  let cueMarkers: { time: number; label: string }[] = [];
  let recordingDuration = 0;

  if (journeyRow.recording_id) {
    const [recRes, analysisRes, markersRes] = await Promise.all([
      supabase.from("recordings").select("artist, duration").eq("id", journeyRow.recording_id).single(),
      supabase.from("analyses").select("events").eq("recording_id", journeyRow.recording_id).single(),
      supabase.from("markers").select("time, label").eq("recording_id", journeyRow.recording_id).eq("type", "cue").order("time"),
    ]);
    musicArtist = recRes.data?.artist ?? null;
    recordingDuration = recRes.data?.duration ?? 0;
    analysisEvents = (analysisRes.data?.events ?? []) as { time: number; type: string; intensity: number }[];
    cueMarkers = (markersRes.data ?? []) as { time: number; label: string }[];
  }

  // For built-in journeys, use the live definition so design changes propagate immediately.
  // Falls back to DB snapshot for custom journeys or if the built-in was removed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const themeData = journeyRow.theme as Record<string, any> | null;
  const builtinId = themeData?.builtinJourneyId as string | undefined;
  // Try by explicit ID first, then fall back to name match for old share rows
  const liveJourney = builtinId
    ? getJourney(builtinId)
    : JOURNEYS.find((j) => j.name === journeyRow.name) ?? null;

  const journey = liveJourney
    ? {
        id: journeyRow.id,
        name: liveJourney.name,
        subtitle: liveJourney.subtitle,
        description: liveJourney.description,
        realmId: liveJourney.realmId,
        phases: liveJourney.phases,
        aiEnabled: liveJourney.aiEnabled,
        enableBassFlash: liveJourney.enableBassFlash ?? false,
        audioReactive: liveJourney.audioReactive ?? false,
        completionOffset: liveJourney.completionOffset ?? 0,
        ...(liveJourney.phaseLabels ? { phaseLabels: liveJourney.phaseLabels } : {}),
        ...(liveJourney.theme ? { theme: liveJourney.theme } : {}),
      }
    : {
        id: journeyRow.id,
        name: journeyRow.name,
        subtitle: journeyRow.subtitle || "",
        description: journeyRow.description || "",
        realmId: journeyRow.realm_id,
        phases: journeyRow.phases,
        aiEnabled: true,
        ...(journeyRow.theme ? { theme: journeyRow.theme } : {}),
        ...(Array.isArray(journeyRow.local_image_urls) && journeyRow.local_image_urls.length > 0
          ? { localImageUrls: journeyRow.local_image_urls as string[] }
          : {}),
        photographyCredit: journeyRow.photography_credit ?? null,
        dedication: journeyRow.dedication ?? null,
      };

  // If the viewer came from a shared path (?pathToken=...), fetch the
  // path so the shared client can render Continue Path + Back to Path +
  // Enter The Culmination buttons in the end overlay.
  let pathContext: {
    pathToken: string;
    pathName: string;
    accent: string;
    glow: string;
    steps: Array<{ journeyId: string; shareToken: string | null; name: string }>;
    currentIndex: number;
    culmination: { journeyId: string; shareToken: string | null; name: string } | null;
  } | null = null;
  if (pathToken) {
    const { data: pRow } = await supabase
      .from("journey_paths")
      .select("name, journey_ids, culmination_journey_id, accent_color, glow_color")
      .eq("share_token", pathToken)
      .single();
    if (pRow && Array.isArray(pRow.journey_ids)) {
      const allIds = [...(pRow.journey_ids as string[])];
      if (pRow.culmination_journey_id) allIds.push(pRow.culmination_journey_id as string);
      const { data: stepJourneys } = await supabase
        .from("journeys")
        .select("id, name, share_token")
        .in("id", allIds);
      const byId = new Map<string, { id: string; name: string; share_token: string | null }>();
      for (const j of stepJourneys ?? []) byId.set(j.id as string, j as { id: string; name: string; share_token: string | null });
      const steps = (pRow.journey_ids as string[])
        .map((jid) => {
          const row = byId.get(jid);
          if (!row) return null;
          return { journeyId: row.id, shareToken: row.share_token ?? null, name: row.name };
        })
        .filter((s): s is { journeyId: string; shareToken: string | null; name: string } => !!s);
      const currentIndex = steps.findIndex((s) => s.journeyId === journeyRow.id);
      const culmRow = pRow.culmination_journey_id ? byId.get(pRow.culmination_journey_id as string) : null;
      pathContext = {
        pathToken,
        pathName: (pRow.name as string) ?? "Path",
        accent: (pRow.accent_color as string) ?? "#d0a070",
        glow: (pRow.glow_color as string) ?? "#e0b080",
        steps,
        currentIndex,
        culmination: culmRow ? { journeyId: culmRow.id, shareToken: culmRow.share_token ?? null, name: culmRow.name } : null,
      };
    }
  }

  return (
    <SharedJourneyClient
      journey={journey}
      audioUrl={audioUrl}
      shareToken={token}
      playbackSeed={journeyRow.playback_seed ?? null}
      creatorName={journeyRow.creator_name ?? null}
      musicArtist={musicArtist}
      analysisEvents={analysisEvents}
      cueMarkers={cueMarkers}
      recordingDuration={recordingDuration}
      pathContext={pathContext}
    />
  );
}
