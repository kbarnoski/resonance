/**
 * Global analysis runner — survives route changes.
 *
 * Module-level singleton: analysis keeps running even when the user
 * navigates away from the recording detail page. Progress and results
 * are written to the Zustand store so any component can read them.
 */

import { useAudioStore } from "./audio-store";
import { createClient } from "@/lib/supabase/client";

interface AnalysisJob {
  recordingId: string;
  recordingTitle?: string;
  audioUrl: string;
  abortController: AbortController;
}

let currentJob: AnalysisJob | null = null;

/** Check if analysis is running for a specific recording */
export function isAnalyzing(recordingId?: string): boolean {
  if (!currentJob) return false;
  if (recordingId) return currentJob.recordingId === recordingId;
  return true;
}

/** Get the recording ID of the current in-flight analysis */
export function getAnalyzingRecordingId(): string | null {
  return currentJob?.recordingId ?? null;
}

/** Start analysis for a recording. Runs in background, writes to store. */
export async function runAnalysis(
  recordingId: string,
  audioUrl: string,
  recordingTitle?: string,
): Promise<void> {
  // If already analyzing this recording, skip
  if (currentJob?.recordingId === recordingId) return;

  // Cancel any previous job
  if (currentJob) {
    currentJob.abortController.abort();
    currentJob = null;
  }

  const abortController = new AbortController();
  currentJob = { recordingId, recordingTitle, audioUrl, abortController };

  const store = useAudioStore.getState();
  store.setAnalysisInProgress({ recordingId, stage: "Starting analysis...", progress: 0 });

  try {
    const { transcribeAudio } = await import("@/lib/audio/transcribe");
    const { analyzeNotes } = await import("@/lib/audio/analyze");

    if (abortController.signal.aborted) return;

    const notes = await transcribeAudio(audioUrl, (stageMsg, prog) => {
      if (abortController.signal.aborted) return;
      useAudioStore.getState().setAnalysisInProgress({
        recordingId,
        stage: stageMsg,
        progress: prog,
      });
    });

    if (abortController.signal.aborted) return;

    useAudioStore.getState().setAnalysisInProgress({
      recordingId,
      stage: "Analyzing music theory...",
      progress: 90,
    });

    const result = analyzeNotes(notes);

    if (abortController.signal.aborted) return;

    useAudioStore.getState().setAnalysisInProgress({
      recordingId,
      stage: "Saving results...",
      progress: 95,
    });

    const supabase = createClient();
    const { data, error } = await supabase
      .from("analyses")
      .upsert({
        recording_id: recordingId,
        status: result.status,
        key_signature: result.key_signature,
        tempo: result.tempo,
        time_signature: result.time_signature,
        chords: result.chords,
        notes: result.notes,
        events: result.events ?? [],
        midi_data: result.midi_data,
      }, { onConflict: "recording_id" })
      .select()
      .single();

    if (error) throw error;
    if (abortController.signal.aborted) return;

    useAudioStore.getState().setAnalysisInProgress({
      recordingId,
      stage: "Generating teaching summary...",
      progress: 97,
    });

    // Generate AI teaching summary (non-blocking failure)
    try {
      const res = await fetch("/api/analysis/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: data.id,
          analysis: data,
          title: recordingTitle,
        }),
        signal: abortController.signal,
      });
      if (res.ok) {
        const { summary } = await res.json();
        data.summary = summary;
      }
    } catch {
      // Non-fatal
    }

    if (abortController.signal.aborted) return;

    // Write completed result to store
    const finalStore = useAudioStore.getState();
    finalStore.setAnalysisInProgress(null);
    finalStore.setAnalysisComplete({ recordingId, data });

    // Also set as current analysis if this recording is the current track
    if (finalStore.currentTrack?.id === recordingId) {
      finalStore.setAnalysis(data);
    }
  } catch (err) {
    if (abortController.signal.aborted) return;
    console.error("Analysis failed:", err);
    useAudioStore.getState().setAnalysisInProgress(null);
    // Import toast dynamically to avoid SSR issues
    const { toast } = await import("sonner");
    toast.error("Analysis failed. Please try again.");
  } finally {
    if (currentJob?.recordingId === recordingId) {
      currentJob = null;
    }
  }
}
