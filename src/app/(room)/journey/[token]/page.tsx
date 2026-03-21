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

  // Load associated recording if available
  let audioUrl: string | null = null;
  let recordingTitle: string | null = null;
  if (journeyRow.recording_id) {
    const { data: rec } = await supabase
      .from("recordings")
      .select("id, title")
      .eq("id", journeyRow.recording_id)
      .single();
    if (rec) {
      audioUrl = `/api/audio/${rec.id}`;
      recordingTitle = rec.title;
    }
  }

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
      }}
      audioUrl={audioUrl}
      recordingTitle={recordingTitle}
      shareToken={token}
    />
  );
}
