import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Explicit application-layer scope (defense-in-depth; RLS also enforces
  // this). A signed-in user may read their own journey or any public one —
  // mirrors the journeys RLS policy so we don't lean on it as the only gate.
  // user.id is a session-derived UUID, so it's safe to inline in the filter.
  const { data, error } = await supabase
    .from("journeys")
    .select("*")
    .eq("id", id)
    .or(`user_id.eq.${user.id},is_public.eq.true`)
    .single();

  if (error || !data) {
    return Response.json({ error: "Journey not found" }, { status: 404 });
  }

  return Response.json(data);
}

// Fields the journey-edit form is allowed to update. Whitelisted to keep
// users from poking at server-managed columns (id, user_id, created_at,
// share_token, etc.) by hand.
const EDITABLE_FIELDS = new Set([
  "name",
  "subtitle",
  "description",
  "story_text",
  "realm_id",
  "phases",
  "theme",
  "audio_reactive",
  "ai_enabled",
  "recording_id",
  "local_image_urls",
  "is_public",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (EDITABLE_FIELDS.has(key)) updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("journeys")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: "Failed to update journey" }, { status: 500 });
  }

  return Response.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("journeys")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return Response.json({ error: "Failed to delete journey" }, { status: 500 });
  }

  return Response.json({ success: true });
}
