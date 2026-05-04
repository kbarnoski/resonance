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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("analyses")
    .select("*")
    .eq("recording_id", id)
    .single();

  if (!error && data) {
    return NextResponse.json(data);
  }

  // Tightened anon fallback: ONLY return analyses for recordings that
  // are actually flagged is_featured (or attached to a shared journey).
  // Previously we'd fall through on any RLS error from the user client,
  // which meant a private analysis could surface via the anon client
  // if RLS policies were ever loosened. Now we positively confirm the
  // recording is meant to be public before returning anything.
  const anonClient = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: rec } = await anonClient
    .from("recordings")
    .select("id, is_featured")
    .eq("id", id)
    .maybeSingle();

  let publiclyVisible = !!rec?.is_featured;

  if (!publiclyVisible) {
    // Also allow recordings attached to a shared journey.
    const { data: sharedJourney } = await anonClient
      .from("journeys")
      .select("id")
      .eq("recording_id", id)
      .not("share_token", "is", null)
      .limit(1)
      .maybeSingle();
    publiclyVisible = !!sharedJourney;
  }

  if (!publiclyVisible) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: anonData, error: anonError } = await anonClient
    .from("analyses")
    .select("*")
    .eq("recording_id", id)
    .single();

  if (anonError || !anonData) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(anonData);
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
