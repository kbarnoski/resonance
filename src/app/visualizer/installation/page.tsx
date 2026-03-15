import { createClient } from "@/lib/supabase/server";
import { InstallationClient } from "@/components/audio/installation-client";

interface Props {
  searchParams: Promise<{ journey?: string }>;
}

export default async function InstallationPage({ searchParams }: Props) {
  const { journey } = await searchParams;

  // Fetch featured content, fall back to all recordings
  let tracks: { id: string; title: string; audioUrl: string; duration?: number | null }[] = [];

  try {
    const supabase = await createClient();

    // Try featured recordings first
    const { data: featured } = await supabase
      .from("recordings")
      .select("id, title, duration")
      .eq("is_featured", true)
      .order("created_at", { ascending: true });

    if (featured && featured.length > 0) {
      tracks = featured.map((r) => ({
        id: r.id,
        title: r.title || "Untitled",
        audioUrl: `/api/audio/${r.id}`,
        duration: r.duration,
      }));
    } else {
      // Fallback to all recordings
      const { data: all } = await supabase
        .from("recordings")
        .select("id, title, duration")
        .order("created_at", { ascending: false })
        .limit(50);

      if (all) {
        tracks = all.map((r) => ({
          id: r.id,
          title: r.title || "Untitled",
          audioUrl: `/api/audio/${r.id}`,
          duration: r.duration,
        }));
      }
    }
  } catch {
    // If DB isn't ready (missing column), fall back gracefully
    try {
      const supabase = await createClient();
      const { data: all } = await supabase
        .from("recordings")
        .select("id, title, duration")
        .order("created_at", { ascending: false })
        .limit(50);

      if (all) {
        tracks = all.map((r) => ({
          id: r.id,
          title: r.title || "Untitled",
          audioUrl: `/api/audio/${r.id}`,
          duration: r.duration,
        }));
      }
    } catch {
      // No tracks available
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      <InstallationClient tracks={tracks} journey={journey} />
    </div>
  );
}
