"use client";

/**
 * One-shot batch analyzer for the Welcome Home album.
 *
 * Queries the user's recordings matching "01_".."13_", runs the full
 * Studio analysis pipeline on each one sequentially (transcription +
 * music theory + teaching summary), and writes each result to the
 * analyses table. This lives in the studio layout so it's gated behind
 * auth and shares the sidebar chrome.
 *
 * After every track is done, the page shows a "ready" state and the
 * rest of the Welcome Home pipeline (journey creation + path assembly)
 * can run from a local script.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { runAnalysis } from "@/lib/audio/analysis-runner";
import { resetTranscribeBackend } from "@/lib/audio/transcribe";
import { Loader2, CheckCircle2, AlertCircle, Play } from "lucide-react";

type Status = "pending" | "running" | "done" | "error" | "already-done";

interface Track {
  id: string;
  title: string;
  cleanTitle: string;
  hadAnalysis: boolean;
  status: Status;
  error?: string;
  stage?: string;
  progress?: number;
}

const AUTORUN_KEY = "wh-batch-autorun";

export default function BatchAnalyzePage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const hasAutoStartedRef = useRef(false);

  const loadTracks = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: recs } = await supabase
      .from("recordings")
      .select("id, title")
      .eq("user_id", user.id)
      .order("title", { ascending: true });

    const welcomeHome = (recs ?? []).filter((r) => /^(0?[1-9]|1[0-3])[_\-\s.]/.test(r.title));

    const ids = welcomeHome.map((r) => r.id);
    const { data: existing } = await supabase
      .from("analyses")
      .select("recording_id, status")
      .in("recording_id", ids);
    const analyzedIds = new Set((existing ?? []).filter((a) => a.status === "completed").map((a) => a.recording_id));

    setTracks(
      welcomeHome.map((r) => ({
        id: r.id,
        title: r.title,
        cleanTitle: r.title.replace(/^(0?[1-9]|1[0-3])[_\-\s.]+/, "").replace(/\.[a-z0-9]+$/i, "").trim(),
        hadAnalysis: analyzedIds.has(r.id),
        status: analyzedIds.has(r.id) ? "already-done" : "pending",
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  // Auto-resume after a page reload if we're in the middle of a batch.
  // We reload between tracks to guarantee a fresh WebGL context — this
  // kicks off the next track as soon as the freshly-loaded tracks list
  // has one left to do.
  useEffect(() => {
    if (loading || hasAutoStartedRef.current) return;
    try {
      const flag = localStorage.getItem(AUTORUN_KEY);
      if (!flag) return;
      const remaining = tracks.filter((t) => t.status === "pending" || t.status === "error").length;
      if (remaining === 0) {
        localStorage.removeItem(AUTORUN_KEY);
        return;
      }
      hasAutoStartedRef.current = true;
      // Tiny delay so React can paint the list before we start work
      setTimeout(() => runAll(), 400);
    } catch {
      // localStorage blocked — user will have to click Start
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tracks.length]);

  // Verify an analysis row exists and is completed. runAnalysis swallows
  // errors internally (shows a toast) and never throws, so the only honest
  // signal that a track succeeded is "is there a completed row in the DB?".
  const verifyAnalysis = async (recordingId: string): Promise<boolean> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("analyses")
      .select("status")
      .eq("recording_id", recordingId)
      .maybeSingle();
    return data?.status === "completed";
  };

  const runOne = async (i: number, t: Track) => {
    setTracks((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, status: "running", error: undefined, stage: "Starting...", progress: 0 } : p))
    );
    try {
      const audioUrl = `/api/audio/${t.id}`;
      await runAnalysis(t.id, audioUrl, t.cleanTitle);
      // Post-hoc verify — runAnalysis eats errors via internal toast handling.
      const ok = await verifyAnalysis(t.id);
      setTracks((prev) =>
        prev.map((p, idx) => (idx === i ? {
          ...p,
          status: ok ? "done" : "error",
          error: ok ? undefined : "Analysis did not save — retry this one.",
          progress: ok ? 100 : p.progress,
        } : p))
      );
      return ok;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTracks((prev) =>
        prev.map((p, idx) => (idx === i ? { ...p, status: "error", error: msg } : p))
      );
      return false;
    }
  };

  // Run exactly ONE pending/errored track, then full-reload the page.
  // The TF.js WebGL context is irreversibly cooked after a transcription —
  // reloading the whole page is the only reliable way to reset it on
  // older GPUs. localStorage flag keeps the loop going across reloads.
  const runAll = async () => {
    if (running) return;
    try { localStorage.setItem(AUTORUN_KEY, "1"); } catch {}
    setRunning(true);
    setFinished(false);

    const nextIdx = tracks.findIndex((t) => t.status === "pending" || t.status === "error");
    if (nextIdx === -1) {
      try { localStorage.removeItem(AUTORUN_KEY); } catch {}
      setRunning(false);
      setFinished(true);
      return;
    }

    await runOne(nextIdx, tracks[nextIdx]);

    // Give the DB write a beat, then reload — the useEffect auto-start
    // picks up from here next time the page loads.
    await new Promise((r) => setTimeout(r, 800));
    window.location.reload();
  };

  const retryErrored = runAll;

  const stopBatch = () => {
    try { localStorage.removeItem(AUTORUN_KEY); } catch {}
    setRunning(false);
    setFinished(false);
    hasAutoStartedRef.current = true; // prevent re-auto-start on the current load
  };

  const remaining = tracks.filter((t) => t.status === "pending" || t.status === "running").length;
  const erroredCount = tracks.filter((t) => t.status === "error").length;
  const doneCount = tracks.filter((t) => t.status === "done" || t.status === "already-done").length;

  return (
    <div className="max-w-2xl">
      <h1 className="text-white/90 text-2xl tracking-tight mb-1" style={{ fontFamily: "var(--font-geist-sans)", fontWeight: 200 }}>
        Batch Analyze — Welcome Home
      </h1>
      <p className="text-white/40 mb-6" style={{ fontSize: "0.78rem", fontFamily: "var(--font-geist-mono)" }}>
        Runs the full Studio analysis pipeline on every album track. Keep this tab open until it finishes.
      </p>

      {loading ? (
        <div className="text-white/30" style={{ fontSize: "0.85rem" }}>Loading tracks…</div>
      ) : tracks.length === 0 ? (
        <div className="text-white/40" style={{ fontSize: "0.85rem" }}>
          No Welcome Home tracks found. Tracks must be named <code>01_Title</code> through <code>13_Title</code>.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={runAll}
              disabled={running || remaining === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white/85 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                fontSize: "0.82rem",
                fontFamily: "var(--font-geist-mono)",
                backgroundColor: "rgba(139, 92, 246, 0.2)",
                border: "1px solid rgba(139, 92, 246, 0.4)",
              }}
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? `Analyzing… ${doneCount}/${tracks.length}` : remaining === 0 ? "All tracks analyzed" : `Start (${remaining} to go)`}
            </button>
            {running && (
              <button
                onClick={stopBatch}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-white/60 hover:text-white/90 transition-colors"
                style={{
                  fontSize: "0.78rem",
                  fontFamily: "var(--font-geist-mono)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                Stop batch
              </button>
            )}
            {erroredCount > 0 && !running && (
              <button
                onClick={retryErrored}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-white/80 hover:text-white transition-colors"
                style={{
                  fontSize: "0.78rem",
                  fontFamily: "var(--font-geist-mono)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                Retry {erroredCount} failed
              </button>
            )}
            {finished && erroredCount === 0 && (
              <span className="text-white/60" style={{ fontSize: "0.78rem", fontFamily: "var(--font-geist-mono)" }}>
                Done. Message Claude to run the journey + path builder.
              </span>
            )}
          </div>

          <div className="space-y-2">
            {tracks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg"
                style={{
                  backgroundColor: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="w-6 flex-shrink-0">
                  {t.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-white/70" />}
                  {(t.status === "done" || t.status === "already-done") && <CheckCircle2 className="h-4 w-4 text-green-400/80" />}
                  {t.status === "error" && <AlertCircle className="h-4 w-4 text-red-400/80" />}
                  {t.status === "pending" && <div className="h-2 w-2 rounded-full bg-white/20" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white/85 truncate" style={{ fontSize: "0.85rem", fontFamily: "var(--font-geist-sans)" }}>
                    {t.cleanTitle}
                  </div>
                  <div className="text-white/35 truncate" style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)" }}>
                    {t.status === "already-done" && "Already analyzed"}
                    {t.status === "running" && "Analyzing…"}
                    {t.status === "done" && "Analysis saved"}
                    {t.status === "error" && `Error: ${t.error}`}
                    {t.status === "pending" && "Pending"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
