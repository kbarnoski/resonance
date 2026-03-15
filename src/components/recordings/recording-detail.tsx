"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Trash2, Share2, Copy, Check, Link, Music, Gauge, Clock } from "lucide-react";
import { toast } from "sonner";
import { WaveformPlayer, type WaveformPlayerHandle } from "@/components/audio/waveform-player";
import { AnalyzeButton } from "@/components/analysis/analyze-button";
import { AnalysisDisplay } from "@/components/analysis/analysis-display";

import { PianoRoll } from "@/components/analysis/piano-roll";
import { ExportMidiButton } from "@/components/analysis/export-midi-button";
import { ChatPanel } from "@/components/chat/chat-panel";
import { MarkersPanel, type Marker } from "@/components/markers/markers-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAudioStore } from "@/lib/audio/audio-store";
import { getAudioEngine } from "@/lib/audio/audio-engine";

interface RecordingDetailProps {
  recording: {
    id: string;
    title: string;
    audio_url: string;
    duration: number | null;
    created_at: string;
    description: string | null;
    file_name: string;
    share_token: string | null;
    waveform_peaks: number[][] | null;
    audio_codec: string | null;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis: any | null;
  initialMessages: {
    id: string;
    role: string;
    content: string;
    created_at: string;
  }[];
}

export function RecordingDetail({
  recording,
  analysis: initialAnalysis,
  initialMessages,
}: RecordingDetailProps) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [currentTime, setCurrentTime] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [description, setDescription] = useState(recording.description ?? "");
  const [shareToken, setShareToken] = useState(recording.share_token);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const playerRef = useRef<WaveformPlayerHandle>(null);

  const handleSeek = useCallback((time: number) => {
    playerRef.current?.seekTo(time);
  }, []);

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();

    await supabase.storage.from("recordings").remove([recording.file_name]);

    const { error } = await supabase
      .from("recordings")
      .delete()
      .eq("id", recording.id);

    if (error) {
      toast.error(`Failed to delete: ${error.message}`);
      setDeleting(false);
      return;
    }

    toast.success("Recording deleted");
    router.push("/library");
  }

  async function saveDescription() {
    const trimmed = description.trim();
    if (trimmed === (recording.description ?? "")) return;
    const supabase = createClient();
    await supabase
      .from("recordings")
      .update({ description: trimmed || null })
      .eq("id", recording.id);
  }

  async function handleShare() {
    if (shareToken) {
      setShareDialogOpen(true);
      return;
    }
    setSharing(true);
    const token = crypto.randomUUID();
    const supabase = createClient();
    const { error } = await supabase
      .from("recordings")
      .update({ share_token: token })
      .eq("id", recording.id);
    if (error) {
      toast.error(`Failed to create share link: ${error.message}`);
      setSharing(false);
      return;
    }
    setShareToken(token);
    setSharing(false);
    setShareDialogOpen(true);
  }

  function getShareUrl() {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/share/${shareToken}`;
  }

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  }

  const hasAnalysis = analysis?.status === "completed";

  const confidence = analysis?.key_confidence ?? 0;
  const confidenceLabel = confidence > 0.85 ? "high" : confidence > 0.7 ? "moderate" : "low";

  // Compute effective duration: DB value, or derive from analysis data
  const effectiveDuration = (() => {
    if (recording.duration) return recording.duration;
    if (!hasAnalysis) return 0;
    // Derive from chord/note end times
    const chords: { time: number; duration: number }[] = analysis.chords ?? [];
    const notes: { time: number; duration: number }[] = analysis.notes ?? [];
    let maxEnd = 0;
    for (const c of chords) maxEnd = Math.max(maxEnd, c.time + c.duration);
    for (const n of notes) maxEnd = Math.max(maxEnd, n.time + n.duration);
    return maxEnd;
  })();

  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Add a description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          className="text-sm text-muted-foreground"
        />
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleShare}
          disabled={sharing}
        >
          {shareToken ? <Link className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
        </Button>

        <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share Recording</DialogTitle>
              <DialogDescription>
                Anyone with this link can view the recording and its analysis.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={getShareUrl()}
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={copyShareUrl}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete recording?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete &ldquo;{recording.title}&rdquo; and remove its analysis, markers, and chat history. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <WaveformPlayer
        ref={playerRef}
        audioUrl={recording.audio_url}
        recordingId={recording.id}
        title={recording.title}
        peaks={recording.waveform_peaks}
        duration={recording.duration}
        onTimeUpdate={setCurrentTime}
        markers={markers}
        onVisualizerOpen={async () => {
          const store = useAudioStore.getState();
          // Resume AudioContext in user gesture context
          try { await getAudioEngine().audioContext.resume(); } catch {}
          // Ensure track is in store (if not already playing)
          if (store.currentTrack?.id !== recording.id) {
            store.play({
              id: recording.id,
              title: recording.title,
              audioUrl: recording.audio_url,
              duration: recording.duration,
            }, currentTime);
          }
          if (analysis) store.setAnalysis(analysis);
          router.push("/visualizer");
        }}
      />

      {/* Compact stats bar */}
      {hasAnalysis && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1">
            <Music className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{analysis.key_signature ?? "Unknown"}</span>
            {analysis.key_confidence !== undefined && (
              <span className="text-xs text-muted-foreground">({confidenceLabel})</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium tabular-nums">
              {analysis.tempo ? `~${analysis.tempo} BPM` : "Unknown"}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{analysis.time_signature ?? "Unknown"}</span>
          </span>
        </div>
      )}

      {/* Markers — always visible */}
      <MarkersPanel
        recordingId={recording.id}
        currentTime={currentTime}
        duration={effectiveDuration}
        onSeek={handleSeek}
        onMarkersChange={setMarkers}
      />

      <AnalyzeButton
        recordingId={recording.id}
        recordingTitle={recording.title}
        audioUrl={recording.audio_url}
        onComplete={setAnalysis}
        hasExisting={hasAnalysis}
      />

      {/* Two tabs: Analysis | Chat */}
      <Tabs defaultValue={hasAnalysis ? "analysis" : "chat"}>
        <TabsList>
          <TabsTrigger value="analysis" disabled={!hasAnalysis}>
            Analysis
          </TabsTrigger>
          <TabsTrigger value="chat" disabled={!hasAnalysis}>
            Chat
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="space-y-6">
          {hasAnalysis && (
            <>
              <AnalysisDisplay analysis={analysis} />
              <PianoRoll
                notes={analysis.notes ?? []}
                currentTime={currentTime}
                duration={effectiveDuration}
                defaultOpen={false}
              />
              <ExportMidiButton
                notes={analysis.notes ?? []}
                filename={`${recording.title}.mid`}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="chat">
          {hasAnalysis && (
            <ChatPanel
              recordingId={recording.id}
              analysis={analysis}
              initialMessages={initialMessages}
            />
          )}
        </TabsContent>
      </Tabs>

    </>
  );
}
