import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { z } from "zod";
import { logger } from "@/lib/logger";

const analysisPostSchema = z.object({
  status: z.enum(["pending", "completed", "failed"]).optional(),
  key_signature: z.string().max(20).nullable().optional(),
  key_confidence: z.number().min(0).max(1).nullable().optional(),
  tempo: z.number().min(20).max(400).nullable().optional(),
  time_signature: z.string().max(20).nullable().optional(),
  chords: z.array(z.unknown()).max(5000).nullable().optional(),
  notes: z.array(z.unknown()).max(20000).nullable().optional(),
  midi_data: z.record(z.string(), z.unknown()).nullable().optional(),
  events: z.array(z.unknown()).max(5000).nullable().optional(),
  summary: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict();

/**
 * Client for the shared-recording fallback. Prefers the service-role key
 * so the released-set resolution keeps working after the anon RLS flip
 * (see supabase/migrations/MIGRATION-NOTES-2026-08-25.md). Falls back to
 * the anon client when the service key isn't configured (local dev).
 * Same pattern as /api/audio/[id]/route.ts.
 */
function createSharedResolver() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createAnonClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return createAnonClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Owner branch — only consulted when there is an actual session.
  // Previously the cookie client ran for anonymous requests too, where
  // it acts as the anon role and matched the public analyses policy for
  // ANY shared/featured parent — including the quarantined catalog,
  // which recording_is_released() deliberately excludes. Gating on a
  // session sends every anonymous request through the released check
  // below; owners keep their untouched RLS read.
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data, error } = await supabase
      .from("analyses")
      .select("*")
      .eq("recording_id", id)
      .single();

    if (!error && data) {
      return NextResponse.json(data);
    }
  }

  // Shared-recording fallback — mirrors /api/audio/[id]'s resolver: a
  // service-role client (so the read keeps working after the Phase-2
  // anon RLS flip), gated on the recording_is_released() SECURITY
  // DEFINER function. recording_is_released is the single source of
  // truth for the released set (featured OR own share token OR attached
  // to a shared journey, minus the quarantined/excluded catalog — see
  // supabase/migrations/20260825150000_fix_released_leaks.sql). The
  // released check IS the authorization here: never query the resolver
  // client without it. Falls back to the anon client when the service
  // key isn't configured (local dev) — identical row set today while
  // the public analyses policy is still in place.
  const sharedClient = createSharedResolver();

  const { data: released, error: releasedError } = await sharedClient.rpc(
    "recording_is_released",
    { p_recording_id: id }
  );

  if (releasedError || released !== true) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: sharedData, error: sharedError } = await sharedClient
    .from("analyses")
    .select("*")
    .eq("recording_id", id)
    .single();

  if (sharedError || !sharedData) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(sharedData);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: owned } = await supabase
    .from("recordings")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const rawBody = await request.json();
  const parsed = analysisPostSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid analysis payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("analyses")
    .upsert(
      {
        recording_id: id,
        ...parsed.data,
      },
      { onConflict: "recording_id" }
    )
    .select()
    .single();

  if (error) {
    logger.error("recordings/analysis", "upsert failed:", error);
    return NextResponse.json({ error: "Failed to save analysis" }, { status: 500 });
  }

  return NextResponse.json(data);
}
