import { createClient } from "@/lib/supabase/server";
import { LibraryClient } from "@/components/recordings/library-client";

export default async function LibraryPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  const [{ data: recordings }, { data: tags }] = await Promise.all([
    supabase
      .from("recordings")
      .select(
        "id, user_id, title, duration, created_at, recorded_at, file_name, description, analyses(id, status, key_signature, tempo), recording_tags(tag_id, tags(id, name))"
      )
      .eq("user_id", userId!)
      .order("created_at", { ascending: false }),
    supabase
      .from("tags")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  const normalized = (recordings ?? []).map((rec) => {
    // analyses can be an array or a single object depending on the relationship
    const analysesList = Array.isArray(rec.analyses)
      ? rec.analyses
      : rec.analyses
        ? [rec.analyses]
        : [];
    const completed = analysesList.find((a: { status?: string }) => a.status === "completed") as
      | { key_signature?: string | null; tempo?: number | null }
      | undefined;

    return {
      id: rec.id,
      title: rec.title,
      duration: rec.duration,
      createdAt: rec.created_at,
      recordedAt: rec.recorded_at,
      fileName: rec.file_name,
      description: rec.description,
      hasAnalysis: !!completed,
      keySignature: completed?.key_signature ?? null,
      tempo: completed?.tempo ?? null,
      tags: Array.isArray(rec.recording_tags)
        ? rec.recording_tags
            .map((rt: Record<string, unknown>) => rt.tags as { id: string; name: string } | null)
            .filter(Boolean) as { id: string; name: string }[]
        : [],
      readOnly: rec.user_id !== userId,
    };
  });

  return (
    <LibraryClient
      recordings={normalized}
      allTags={tags ?? []}
    />
  );
}
