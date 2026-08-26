import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecordingDetail } from "@/components/recordings/recording-detail";
import { EditableDate } from "@/components/recordings/editable-date";
import { Clock } from "lucide-react";
import { isOfflinePack, getRecording, getAnalysis } from "@/lib/offline/pack";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function RecordingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let recording;
  let analysis;
  let messages;
  let tags: { id: string; name: string; color: string }[];
  let readOnly;

  if (isOfflinePack()) {
    recording = getRecording(id);
    if (!recording) notFound();
    analysis = getAnalysis(id) ?? null;
    messages = [];
    tags = [];
    // Edit/chat endpoints hit Supabase — keep the kiosk read-only
    readOnly = true;
  } else {
    const supabase = await createClient();

    // Run all queries in parallel to eliminate waterfall
    const [recordingResult, analysisResult, messagesResult, tagsResult, { data: { user } }] = await Promise.all([
      supabase.from("recordings").select("*").eq("id", id).single(),
      supabase.from("analyses").select("*").eq("recording_id", id).single(),
      supabase
        .from("chat_messages")
        .select("*")
        .eq("recording_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("recording_tags")
        .select("tags(id, name, color)")
        .eq("recording_id", id),
      supabase.auth.getUser(),
    ]);

    recording = recordingResult.data;
    if (!recording) notFound();

    readOnly = recording.user_id !== user?.id;
    analysis = analysisResult.data;
    messages = messagesResult.data;
    tags = (tagsResult.data ?? [])
      .map((rt) => (Array.isArray(rt.tags) ? rt.tags[0] : rt.tags))
      .filter(Boolean) as { id: string; name: string; color: string }[];
  }

  // Use proxy API route — it detects ALAC and transcodes to AAC for Chrome
  const audioUrl = `/api/audio/${id}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extralight tracking-tight">{recording.title}</h1>
        {recording.description && (
          <p className="mt-1 text-sm text-muted-foreground">{recording.description}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <EditableDate
            recordingId={recording.id}
            recordedAt={recording.recorded_at}
            createdAt={recording.created_at}
            readOnly={readOnly}
          />
          {recording.duration && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDuration(recording.duration)}
            </span>
          )}
          {analysis && analysis.status === "completed" && (
            <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              Analyzed
            </span>
          )}
        </div>
      </div>

      <RecordingDetail
        recording={{
          ...recording,
          audio_url: audioUrl,
          description: recording.description ?? null,
          file_name: recording.file_name,
          share_token: recording.share_token ?? null,
          waveform_peaks: recording.waveform_peaks ?? null,
          audio_codec: recording.audio_codec ?? null,
          artist: recording.artist ?? null,
        }}
        analysis={analysis}
        initialMessages={messages ?? []}
        tags={tags}
        readOnly={readOnly}
      />
    </div>
  );
}
