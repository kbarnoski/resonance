import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { journeyId } = await request.json();
    if (!journeyId) {
      return Response.json({ error: "Missing journeyId" }, { status: 400 });
    }

    // Check ownership
    const { data: journey } = await supabase
      .from("journeys")
      .select("id, share_token")
      .eq("id", journeyId)
      .eq("user_id", user.id)
      .single();

    if (!journey) {
      return Response.json({ error: "Journey not found" }, { status: 404 });
    }

    // Return existing token or generate new one
    if (journey.share_token) {
      return Response.json({ token: journey.share_token });
    }

    const token = randomUUID().replace(/-/g, "").slice(0, 16);

    const { error } = await supabase
      .from("journeys")
      .update({ share_token: token })
      .eq("id", journeyId);

    if (error) {
      return Response.json({ error: "Failed to generate share token" }, { status: 500 });
    }

    return Response.json({ token });
  } catch (error) {
    console.error("Journey share error:", error);
    return Response.json({ error: "Failed to share journey" }, { status: 500 });
  }
}
