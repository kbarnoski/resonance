"use client";

import { useRef, useState, useCallback, useEffect, useImperativeHandle, forwardRef, startTransition } from "react";
import WaveSurfer from "wavesurfer.js";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward, AlertCircle, Flag, Sparkles, Loader2 } from "lucide-react";
import { useThemeColors } from "@/lib/use-theme-colors";
import { getAudioEngine } from "@/lib/audio/audio-engine";
import { useAudioStore } from "@/lib/audio/audio-store";

export interface WaveformPlayerHandle {
  seekTo: (time: number) => void;
  getAudioElement: () => HTMLAudioElement | null;
}

interface MarkerDot {
  time: number;
  label: string;
}

interface WaveformPlayerProps {
  audioUrl: string;
  recordingId?: string;
  title?: string;
  peaks?: number[][] | null;
  duration?: number | null;
  onTimeUpdate?: (currentTime: number) => void;
  markers?: MarkerDot[];
  onVisualizerOpen?: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isChromium(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Chrome|Chromium|Edg\//.test(ua);
}

// --- Cached URL helpers with 50-minute TTL ---

interface CachedUrlEntry {
  url: string;
  timestamp: number;
}

const URL_CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes

function getCachedUrl(recordingId: string): string | null {
  try {
    const raw = sessionStorage.getItem(`audio-url-${recordingId}`);
    if (!raw) return null;
    const entry: CachedUrlEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > URL_CACHE_TTL_MS) {
      sessionStorage.removeItem(`audio-url-${recordingId}`);
      return null;
    }
    return entry.url;
  } catch {
    return null;
  }
}

function setCachedUrl(recordingId: string, url: string): void {
  try {
    const entry: CachedUrlEntry = { url, timestamp: Date.now() };
    sessionStorage.setItem(`audio-url-${recordingId}`, JSON.stringify(entry));
  } catch {
    // sessionStorage may be full or unavailable
  }
}

// --- Standalone URL resolution (not a hook) ---

async function resolveAudioUrlImpl(
  audioUrl: string,
  recordingId?: string,
): Promise<string> {
  // Check cache first
  if (recordingId) {
    const cached = getCachedUrl(recordingId);
    if (cached) return cached;
  }

  if (!audioUrl.startsWith("/api/")) return audioUrl;

  try {
    const res = await fetch(audioUrl);
    const data = await res.json();

    if (data.url) {
      if (data.hasAac || (data.codec && data.codec !== "alac")) {
        if (recordingId) setCachedUrl(recordingId, data.url);
        return data.url;
      }
      if (data.codec === "alac" && isChromium()) {
        return audioUrl + "?transcode=1";
      }
      // Unknown codec — test playability
      const testAudio = new Audio();
      try {
        const canPlay = await new Promise<boolean>((resolve) => {
          testAudio.preload = "metadata";
          testAudio.onloadedmetadata = () => resolve(true);
          testAudio.onerror = () => resolve(false);
          testAudio.src = data.url;
          setTimeout(() => resolve(false), 5000);
        });
        if (canPlay) {
          if (recordingId) setCachedUrl(recordingId, data.url);
          return data.url;
        }
      } finally {
        testAudio.removeAttribute("src");
        testAudio.load();
      }
    }
  } catch {
    // fall through to transcode
  }

  return audioUrl + "?transcode=1";
}

export const WaveformPlayer = forwardRef<WaveformPlayerHandle, WaveformPlayerProps>(
  function WaveformPlayer({ audioUrl, recordingId, title, peaks, duration: propDuration, onTimeUpdate, markers = [], onVisualizerOpen }, ref) {
    const themeColors = useThemeColors();
    const hasPeaks = !!(peaks && peaks.length > 0 && propDuration);

    // --- Store-driven play state (replaces local isPlaying) ---
    const storeIsPlaying = useAudioStore(s => s.isPlaying && s.currentTrack?.id === recordingId);
    const isCurrentTrack = useAudioStore(s => s.currentTrack?.id === recordingId);

    // --- State ---
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(propDuration ?? 0);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingAudio, setIsLoadingAudio] = useState(false);

    // --- Refs ---
    const containerRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const resolvedUrlRef = useRef<string | null>(null);
    const urlResolvePromiseRef = useRef<Promise<string> | null>(null);
    const peaksSavedRef = useRef(false);
    const cancelledRef = useRef(false);
    const onTimeUpdateRef = useRef(onTimeUpdate);
    const lastTimeUpdateRef = useRef(0);

    // Keep onTimeUpdate ref current
    useEffect(() => {
      onTimeUpdateRef.current = onTimeUpdate;
    }, [onTimeUpdate]);

    // --- Imperative handle ---
    useImperativeHandle(ref, () => ({
      seekTo(time: number) {
        const d = wavesurferRef.current?.getDuration() ?? duration;
        if (wavesurferRef.current && d > 0) {
          wavesurferRef.current.seekTo(Math.max(0, Math.min(time / d, 1)));
        }
      },
      getAudioElement() {
        try { return getAudioEngine().audioElement; } catch { return null; }
      },
    }));

    // --- Save peaks to server ---
    const savePeaks = useCallback((ws: WaveSurfer) => {
      if (peaksSavedRef.current || !recordingId || !audioUrl.startsWith("/api/")) return;
      peaksSavedRef.current = true;

      try {
        const exported = ws.exportPeaks({ maxLength: 1000, precision: 3 });
        if (exported && exported.length > 0) {
          const wsDuration = ws.getDuration();
          fetch(`/api/audio/${recordingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              waveform_peaks: exported,
              ...(wsDuration && !propDuration ? { duration: wsDuration } : {}),
            }),
          }).catch((err) => console.error("[PEAKS] Failed to save:", err));
        }
      } catch (err) {
        console.error("[PEAKS] Failed to export:", err);
      }
    }, [recordingId, audioUrl, propDuration]);

    // --- Callback ref: creates WaveSurfer with the GLOBAL engine's audio element ---
    const initWaveSurfer = useCallback(
      (node: HTMLDivElement | null) => {
        if (!node) return;
        containerRef.current = node;

        // Teardown previous instance if callback ref re-fires (React strict mode)
        if (wavesurferRef.current) {
          wavesurferRef.current.destroy();
          wavesurferRef.current = null;
        }

        // Use the global audio engine's element — ONE audio source for everything
        let audio: HTMLAudioElement;
        try {
          audio = getAudioEngine().audioElement;
        } catch {
          return; // SSR guard
        }

        const ws = WaveSurfer.create({
          container: node,
          waveColor: "rgba(150,150,150,0.22)",
          progressColor: "#6366f1",
          cursorColor: "#6366f1",
          barWidth: 2,
          barGap: 1,
          barRadius: 2,
          height: 80,
          media: audio,
          ...(hasPeaks
            ? { peaks: peaks as Array<number[]>, duration: propDuration! }
            : {}),
        });

        ws.on("ready", () => {
          if (cancelledRef.current) return;
          setDuration(ws.getDuration());
          setIsReady(true);
          setError(null);

          // Save peaks after first audio decode (non-peaks path)
          if (!hasPeaks) {
            savePeaks(ws);
          }
        });

        // For peaks mode, waveform renders synchronously — "ready" fires immediately
        // but we also set state explicitly in case it already fired
        if (hasPeaks) {
          setDuration(propDuration!);
          setIsReady(true);
          setError(null);
        }

        ws.on("audioprocess", () => {
          // Only update time when this recording is the active track
          if (useAudioStore.getState().currentTrack?.id !== recordingId) return;
          const now = performance.now();
          if (now - lastTimeUpdateRef.current < 100) return; // ~10fps throttle
          lastTimeUpdateRef.current = now;
          const time = ws.getCurrentTime();
          // Low-priority update — won't block navigation transitions
          startTransition(() => {
            setCurrentTime(time);
            onTimeUpdateRef.current?.(time);
          });
        });

        ws.on("seeking", () => {
          if (useAudioStore.getState().currentTrack?.id !== recordingId) return;
          const time = ws.getCurrentTime();
          setCurrentTime(time);
          onTimeUpdateRef.current?.(time);
        });

        // No play/pause/finish event handlers needed — store state drives UI

        ws.on("error", (err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          if (typeof err === "string" && err.includes("aborted")) return;

          // Ignore fetch failures (CORS/signed URL) — audio can still play via media element
          const errStr = err instanceof Error ? err.message : typeof err === "string" ? err : "";
          if (errStr.includes("Failed to fetch") || errStr.includes("403") || errStr.includes("400")) {
            console.warn("WaveSurfer fetch failed (audio still playable):", errStr);
            if (!isReady) setIsReady(true);
            return;
          }

          let message: string;
          if (typeof err === "string") {
            message = err;
          } else if (err instanceof Error) {
            message = err.message;
          } else if (err && typeof err === "object" && "message" in err) {
            message = String((err as Record<string, unknown>).message);
          } else {
            message = "Unable to load audio file.";
          }
          console.error("WaveSurfer error:", message, err);
          setError(message);
        });

        wavesurferRef.current = ws;
      },
      // Stable deps only
      [hasPeaks, peaks, propDuration, savePeaks, recordingId]
    );

    // --- URL resolution effect (runs once on mount) ---
    useEffect(() => {
      cancelledRef.current = false;

      const promise = resolveAudioUrlImpl(audioUrl, recordingId);
      urlResolvePromiseRef.current = promise;

      promise.then((url) => {
        if (cancelledRef.current) return;
        resolvedUrlRef.current = url;

        // For no-peaks mode: WaveSurfer needs to decode audio for waveform.
        // ws.load() sets media.src AND fetches+decodes for rendering.
        // Only safe if nothing else is actively playing.
        if (!hasPeaks && wavesurferRef.current) {
          const store = useAudioStore.getState();
          if (!store.isPlaying || store.currentTrack?.id === recordingId) {
            wavesurferRef.current.load(url).catch(() => {
              if (cancelledRef.current) return;
              setIsReady(true);
            });
          }
        }
      });

      return () => {
        cancelledRef.current = true;
      };
    }, [audioUrl, recordingId, hasPeaks]);

    // --- Update waveform colors when theme or active track changes ---
    useEffect(() => {
      if (wavesurferRef.current) {
        const isDark = document.documentElement.classList.contains("dark");
        wavesurferRef.current.setOptions({
          waveColor: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)",
          // Hide progress/cursor when a different track is playing
          progressColor: isCurrentTrack ? "#6366f1" : "transparent",
          cursorColor: isCurrentTrack ? "#6366f1" : "transparent",
        });
      }
    }, [themeColors, isCurrentTrack]);

    // --- Sync current time from store on mount (when returning from viz) ---
    useEffect(() => {
      const store = useAudioStore.getState();
      if (store.currentTrack?.id === recordingId && store.currentTime > 0) {
        setCurrentTime(store.currentTime);
        onTimeUpdateRef.current?.(store.currentTime);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recordingId]);

    // --- Cleanup: destroy WaveSurfer only, NEVER touch the global audio element ---
    useEffect(() => {
      return () => {
        cancelledRef.current = true;
        try { wavesurferRef.current?.destroy(); } catch { /* ignore */ }
        wavesurferRef.current = null;
        // DO NOT pause or reset the audio element — it's the global engine's
      };
    }, []);

    // --- togglePlay: goes through the store, no WaveSurfer playPause ---
    async function togglePlay() {
      const ws = wavesurferRef.current;
      if (!ws) return;

      const store = useAudioStore.getState();

      // Same track already in store — just toggle play/pause
      if (store.currentTrack?.id === recordingId) {
        store.togglePlayPause();
        return;
      }

      // Different track or first play — load onto global engine and play
      setIsLoadingAudio(true);
      try {
        let url = resolvedUrlRef.current;
        if (!url) {
          url = await (urlResolvePromiseRef.current ?? resolveAudioUrlImpl(audioUrl, recordingId));
          resolvedUrlRef.current = url;
        }
        if (cancelledRef.current) return;

        const engine = getAudioEngine();
        await engine.audioContext.resume();
        engine.audioElement.src = url;
        engine.audioElement.currentTime = 0;
        await engine.audioElement.play();

        // Update store — skipLoad tells AudioProvider not to reload (we already did)
        store.play(
          { id: recordingId!, title: title ?? "Untitled", audioUrl, duration: propDuration || null },
          0,
          true, // skipLoad
        );
      } catch (err) {
        console.error("Failed to play:", err);
      } finally {
        setIsLoadingAudio(false);
      }
    }

    function skip(seconds: number) {
      const ws = wavesurferRef.current;
      if (!ws || !isCurrentTrack) return;
      const d = ws.getDuration();
      if (d <= 0) return;
      const newTime = Math.max(0, Math.min(ws.getCurrentTime() + seconds, d));
      ws.seekTo(newTime / d);
    }

    function handleMarkerClick(time: number) {
      if (wavesurferRef.current && duration > 0 && isCurrentTrack) {
        wavesurferRef.current.seekTo(time / duration);
      }
    }

    return (
      <div className="space-y-3">
        <div className="relative">
          <div
            ref={initWaveSurfer}
            className="rounded-lg border bg-card p-3"
          />
          {/* Loading skeleton */}
          {!isReady && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg border bg-card p-3">
              <div className="absolute inset-0 flex items-end gap-[3px] p-3 opacity-30">
                {[30,42,55,38,60,48,35,52,65,40,28,50,62,45,33,55,68,43,30,48,58,36,25,45,60,50,38,55,70,42,28,52,63,47,35,57,44,30,50,62,40,27,48,58,37,53,42,32].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-full bg-muted-foreground/10 animate-pulse"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <p className="relative z-10 text-xs text-muted-foreground animate-pulse">Loading waveform...</p>
            </div>
          )}
          {/* Marker indicators overlay */}
          {isReady && duration > 0 && markers.length > 0 && (
            <div className="absolute inset-x-3 top-0 h-full pointer-events-none">
              {markers.map((marker, i) => {
                const pct = (marker.time / duration) * 100;
                return (
                  <button
                    key={i}
                    className="absolute top-0 pointer-events-auto group p-2 -m-2"
                    style={{ left: `${pct}%` }}
                    onClick={() => handleMarkerClick(marker.time)}
                    title={`${formatTime(marker.time)}: ${marker.label}`}
                  >
                    <Flag className="h-3.5 w-3.5 text-primary -translate-x-1/2" />
                    <div className="absolute left-1/2 -translate-x-1/2 top-4 bg-popover border rounded px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10">
                      {marker.label}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {error && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p>{error || "Unable to load waveform"}</p>
            </div>
            <p className="text-xs text-muted-foreground">Fallback player:</p>
            <audio controls src={audioUrl} className="w-full" preload="metadata">
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatTime(currentTime)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skip(-10)}
              disabled={!isReady}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              onClick={togglePlay}
              disabled={!isReady || isLoadingAudio}
            >
              {isLoadingAudio ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : storeIsPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skip(10)}
              disabled={!isReady}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            {onVisualizerOpen && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onVisualizerOpen}
                disabled={!isReady}
                title="Open Visualizer"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            )}
          </div>
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatTime(duration)}
          </span>
        </div>
      </div>
    );
  }
);
