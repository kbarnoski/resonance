"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wand2, Loader2, RefreshCw } from "lucide-react";
import { useAudioStore } from "@/lib/audio/audio-store";
import { runAnalysis } from "@/lib/audio/analysis-runner";

interface AnalyzeButtonProps {
  recordingId: string;
  recordingTitle?: string;
  audioUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onComplete: (analysis: any) => void;
  hasExisting?: boolean;
}

export function AnalyzeButton({ recordingId, recordingTitle, audioUrl, onComplete, hasExisting }: AnalyzeButtonProps) {
  const inProgress = useAudioStore((s) => s.analysisInProgress);
  const completed = useAudioStore((s) => s.analysisComplete);

  // Check if completed result is waiting for this recording
  const completedForThis = completed?.recordingId === recordingId ? completed.data : null;
  if (completedForThis) {
    // Pick up the result and clear it
    onComplete(completedForThis);
    useAudioStore.getState().setAnalysisComplete(null);
  }

  const analyzing = inProgress?.recordingId === recordingId;
  const stage = analyzing ? inProgress.stage : "";
  const progress = analyzing ? inProgress.progress : 0;

  const handleAnalyze = useCallback(() => {
    // Fire-and-forget — internal toast handles errors. Swallow the rejection
    // so it doesn't surface as an unhandled promise warning.
    runAnalysis(recordingId, audioUrl, recordingTitle).catch(() => {});
  }, [recordingId, audioUrl, recordingTitle]);

  if (analyzing) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">{stage}</p>
              <div className="mt-2 h-2 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (hasExisting) {
    return (
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleAnalyze}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Re-analyze
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-6">
        <div>
          <p className="font-medium">Ready to analyze</p>
          <p className="text-sm text-muted-foreground">
            AI will transcribe notes and detect chords, key, and tempo
          </p>
        </div>
        <Button onClick={handleAnalyze}>
          <Wand2 className="mr-2 h-4 w-4" />
          Analyze
        </Button>
      </CardContent>
    </Card>
  );
}
