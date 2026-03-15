import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  // Use anon client — no auth required for featured content
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: albums, error } = await supabase
    .from("featured_albums")
    .select(`
      id,
      name,
      artist,
      description,
      cover_url,
      position,
      featured_album_tracks (
        position,
        recording_id,
        recordings:recording_id (
          id,
          title,
          duration,
          analyses (
            key_signature,
            tempo
          )
        )
      )
    `)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sort tracks within each album by position
  const formatted = (albums ?? []).map((album) => ({
    ...album,
    featured_album_tracks: (album.featured_album_tracks ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)),
  }));

  return NextResponse.json(formatted);
}
