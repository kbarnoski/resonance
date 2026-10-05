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

/** Abort the in-flight analysis, if any. The abort takes effect at the
 *  next checkpoint inside runAnalysis; progress UI is cleared now. */
export function abortAnalysis(): void {
  if (!currentJob) return;
  currentJob.abortController.abort();
  currentJob = null;
  useAudioStore.getState().setAnalysisInProgress(null);
}

/** Start analysis for a recording. Runs in background, writes to store. */
export async function runAnalysis(
  recordingId: string,
  audioUrl: string,
  recordingTitle?: string,
): Promise<void> {
  // If already analyzing this recording, skip
  if (currentJob?.recordingId === recordingId) return;

  // Frozen recordings (final-mastered journeys) — the Room reads their
  // analyses at runtime; re-analysis would change how they play.
  const { isAnalysisFrozen } = await import("@/lib/audio/analysis-protected");
  if (isAnalysisFrozen(recordingId)) {
    throw new Error("This recording's analysis is frozen (mastered journey) — not re-analyzed.");
  }

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

    const { computeAudioFeatures, buildMusicProfile } = await import("@/lib/audio/music-profile");
    let audioFeatures: import("@/lib/audio/music-profile").AudioFeatures | null = null;
    const notes = await transcribeAudio(
      audioUrl,
      (stageMsg, prog) => {
        if (abortController.signal.aborted) return;
        useAudioStore.getState().setAnalysisInProgress({
          recordingId,
          stage: stageMsg,
          progress: prog,
        });
      },
      (samples, sr) => {
        // Real tempo / dynamics / sections come from the audio itself.
        audioFeatures = computeAudioFeatures(samples, sr);
      },
    );

    if (abortController.signal.aborted) return;

    useAudioStore.getState().setAnalysisInProgress({
      recordingId,
      stage: "Analyzing music theory...",
      progress: 90,
    });

    const af = audioFeatures as import("@/lib/audio/music-profile").AudioFeatures | null;
    const preResult = analyzeNotes(notes);
    const profile = buildMusicProfile({
      notes,
      chords: preResult.chords,
      duration: af?.duration ?? null,
      keySignature: preResult.key_signature,
      audio: af,
    });
    const result = profile.tempo ? { ...preResult, tempo: Math.round(profile.tempo.bpm) } : preResult;

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
      stage: "Deep analysis (tempo, sections, mood, narrative)...",
      progress: 97,
    });

    // Deep analysis v2 — ALWAYS part of an analysis run. Only the id +
    // the compact measured profile are sent (the server reads notes/chords
    // from the DB); posting the full row is what silently 413'd for 80
    // tracks. One retry; a failure is surfaced, not swallowed.
    let summaryError: string | null = null;
    for (let attempt = 0; attempt < 2 && !data.summary?.version; attempt++) {
      try {
        const res = await fetch("/api/analysis/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysisId: data.id, title: recordingTitle, profile }),
          signal: abortController.signal,
        });
        if (res.ok) {
          const { summary } = await res.json();
          data.summary = summary;
          if (summary?.tempo?.bpm && !summary?.frozen) data.tempo = summary.tempo.bpm;
        } else {
          summaryError = `deep summary HTTP ${res.status}`;
        }
      } catch (err) {
        if (abortController.signal.aborted) return;
        summaryError = err instanceof Error ? err.message : String(err);
      }
    }
    if (!data.summary?.version && summaryError) {
      const { toast } = await import("sonner");
      toast.error(`Deep analysis failed for ${recordingTitle ?? "track"}: ${summaryError.slice(0, 100)}`);
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
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(`Analysis failed: ${msg.slice(0, 120)}`);
    // Re-throw so batch callers can capture the real error — single-call sites
    // from AnalyzeButton still work because they don't await.
    throw err;
  } finally {
    if (currentJob?.recordingId === recordingId) {
      currentJob = null;
    }
  }
}
