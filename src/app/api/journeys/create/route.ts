import { createClient } from "@/lib/supabase/server";
import { buildJourneyFromStory } from "@/lib/journeys/journey-builder";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { storyText, realmId, recordingId, name } = await request.json();

    if (!storyText) {
      return Response.json({ error: "Missing storyText" }, { status: 400 });
    }

    // Build journey from story using AI — realmId is optional now
    const journey = await buildJourneyFromStory(storyText, realmId || undefined);

    // Store in database
    const { data, error } = await supabase.from("journeys").insert({
      user_id: user.id,
      recording_id: recordingId || null,
      name: name || journey.name,
      subtitle: journey.subtitle,
      description: journey.description,
      story_text: storyText,
      realm_id: journey.realmId,
      phases: JSON.parse(JSON.stringify(journey.phases)),
      theme: journey.theme ? JSON.parse(JSON.stringify(journey.theme)) : null,
    }).select().single();

    if (error) {
      console.error("Failed to save journey:", error);
      return Response.json(
        { error: `Failed to save journey: ${error.message} (${error.code})` },
        { status: 500 }
      );
    }

    return Response.json({ journey: { ...journey, id: data.id }, dbRecord: data });
  } catch (error) {
    console.error("Journey creation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `Failed to create journey: ${message}` }, { status: 500 });
  }
}
