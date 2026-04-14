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
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAnonClient();

  const { data: journeyRow } = await supabase
    .from("journeys")
    .select("*")
    .eq("share_token", token)
    .single();

  if (!journeyRow) notFound();

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
      };

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
    />
  );
}
