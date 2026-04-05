import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { SharedJourneyClient } from "./client";

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
  const { data: journey } = await supabase
    .from("journeys")
    .select("name, subtitle")
    .eq("share_token", token)
    .single();

  if (!journey) return { title: "Journey Not Found" };

  return {
    title: `${journey.name} — Resonance`,
    description: journey.subtitle || "A shared journey on Resonance",
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

  return (
    <SharedJourneyClient
      journey={{
        id: journeyRow.id,
        name: journeyRow.name,
        subtitle: journeyRow.subtitle || "",
        description: journeyRow.description || "",
        realmId: journeyRow.realm_id,
        phases: journeyRow.phases,
        aiEnabled: true,
        ...(journeyRow.theme ? { theme: journeyRow.theme } : {}),
      }}
      audioUrl={audioUrl}
      shareToken={token}
      playbackSeed={journeyRow.playback_seed ?? null}
    />
  );
}
