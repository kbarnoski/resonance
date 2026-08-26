"use client";

import { useRef, useState, useCallback, useEffect, useImperativeHandle, forwardRef, startTransition } from "react";
import WaveSurfer from "wavesurfer.js";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward, AlertCircle, Flag, Sparkles, Loader2, Zap } from "lucide-react";
import { useThemeColors } from "@/lib/use-theme-colors";
import { getAudioEngine } from "@/lib/audio/audio-engine";
import { useAudioStore } from "@/lib/audio/audio-store";
import { resolveAudioUrl, clearCachedUrl } from "@/lib/audio/resolve-audio-url";

export interface WaveformPlayerHandle {
  seekTo: (time: number) => void;
  getAudioElement: () => HTMLAudioElement | null;
}

interface MarkerDot {
  time: number;
  label: string;
  type?: "note" | "cue";
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

/**
 * Decode waveform peaks from a detached fetch — never touches the shared
 * global audio element. Used when a recording has no stored peaks yet:
 * WaveSurfer's own load() would set the media element's src, which
 * hijacks whatever track the global engine currently holds. Instead we
 * fetch + decode on a throwaway AudioContext, hand WaveSurfer
 * pre-computed peaks, and close the context.
 */
async function decodePeaksDetached(
  url: string,
): Promise<{ peaks: number[][]; duration: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio fetch ${res.status}`);
  const buf = await res.arrayBuffer();

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  try {
    const audioBuffer = await ctx.decodeAudioData(buf);
    const channels = Math.min(audioBuffer.numberOfChannels, 2);
    const buckets = Math.min(1000, audioBuffer.length);
    const peaks: number[][] = [];
    for (let c = 0; c < channels; c++) {
      const data = audioBuffer.getChannelData(c);
      const step = Math.max(1, Math.floor(data.length / buckets));
      const channelPeaks = new Array<number>(buckets);
      for (let i = 0; i < buckets; i++) {
        const start = i * step;
        const end = Math.min(start + step, data.length);
        let max = 0;
        // Sparse sampling within each bucket — plenty for an 80px waveform
        for (let j = start; j < end; j += 32) {
          const v = Math.abs(data[j]);
          if (v > max) max = v;
        }
        channelPeaks[i] = Math.round(max * 1000) / 1000;
      }
      peaks.push(channelPeaks);
    }
    return { peaks, duration: audioBuffer.duration };
  } finally {
    ctx.close().catch(() => {});
  }
}

export const WaveformPlayer = forwardRef<WaveformPlayerHandle, WaveformPlayerProps>(
  function WaveformPlayer({ audioUrl, recordingId, title, peaks, duration: propDuration, onTimeUpdate, markers = [], onVisualizerOpen }, ref) {
    const themeColors = useThemeColors();

    // Peaks decoded client-side when the server has none stored yet
    const [localPeaks, setLocalPeaks] = useState<number[][] | null>(null);
    const [localDuration, setLocalDuration] = useState<number | null>(null);

    const effPeaks = peaks && peaks.length > 0 ? peaks : localPeaks;
    const effDuration = propDuration ?? localDuration;
    const hasPeaks = !!(effPeaks && effPeaks.length > 0 && effDuration);

    // --- Store-driven play state (replaces local isPlaying) ---
    const storeIsPlaying = useAudioStore(s => s.isPlaying && s.currentTrack?.id === recordingId);
    const isCurrentTrack = useAudioStore(s => s.currentTrack?.id === recordingId);

    // --- State ---
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(effDuration ?? 0);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingAudio, setIsLoadingAudio] = useState(false);
    // Resolved playable URL — also feeds the fallback <audio> element
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

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

    // --- Save computed peaks to server so next visit skips the decode ---
    const savePeaksData = useCallback((computedPeaks: number[][], decodedDuration: number) => {
      if (peaksSavedRef.current || !recordingId || !audioUrl.startsWith("/api/")) return;
      peaksSavedRef.current = true;

      fetch(`/api/audio/${recordingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waveform_peaks: computedPeaks,
          ...(decodedDuration && !propDuration ? { duration: decodedDuration } : {}),
        }),
      }).catch((err) => console.error("[PEAKS] Failed to save:", err));
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

        const isCurrent = useAudioStore.getState().currentTrack?.id === recordingId;

        const ws = WaveSurfer.create({
          container: node,
          waveColor: "rgba(150,150,150,0.22)",
          progressColor: themeColors.primary,
          cursorColor: themeColors.primary,
          barWidth: 2,
          barGap: 1,
          barRadius: 2,
          height: 80,
          media: audio,
          // Only the active track's waveform may drive the shared element.
          // Non-current waveforms adopt the track via the click overlay below.
          interact: isCurrent,
          ...(hasPeaks
            ? { peaks: effPeaks as Array<number[]>, duration: effDuration! }
            : {}),
        });

        ws.on("ready", () => {
          if (cancelledRef.current) return;
          setDuration(ws.getDuration());
          setIsReady(true);
          setError(null);
        });

        // For peaks mode, waveform renders synchronously — "ready" fires immediately
        // but we also set state explicitly in case it already fired
        if (hasPeaks) {
          setDuration(effDuration!);
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

        // Capture exact time on pause — audioprocess stops firing so the last
        // reported time can be stale. Without this, cue markers placed while
        // paused land at the wrong position.
        ws.on("pause", () => {
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [hasPeaks, effPeaks, effDuration, recordingId]
    );

    // --- URL resolution + detached peaks decode (never loads the shared element) ---
    useEffect(() => {
      cancelledRef.current = false;

      const promise = resolveAudioUrl(audioUrl, recordingId);
      urlResolvePromiseRef.current = promise;

      promise.then(async (url) => {
        if (cancelledRef.current) return;
        resolvedUrlRef.current = url;
        setResolvedUrl(url);

        // No stored peaks: decode them from a detached fetch. We deliberately
        // never call ws.load() here — it would set the global audio element's
        // src, silently replacing whatever track (playing OR paused) the
        // store currently owns.
        if (!hasPeaks) {
          try {
            const { peaks: computed, duration: decoded } = await decodePeaksDetached(url);
            if (cancelledRef.current) return;
            setLocalPeaks(computed);
            setLocalDuration(decoded);
            savePeaksData(computed, decoded);
          } catch (err) {
            if (cancelledRef.current) return;
            // Waveform unavailable, but the track is still playable via the
            // engine — unlock the controls.
            console.warn("[PEAKS] Detached decode failed:", err);
            setIsReady(true);
          }
        }
      });

      return () => {
        cancelledRef.current = true;
      };
    }, [audioUrl, recordingId, hasPeaks, savePeaksData]);

    // --- Update waveform colors + interactivity when theme or active track changes ---
    useEffect(() => {
      if (wavesurferRef.current) {
        const isDark = document.documentElement.classList.contains("dark");
        wavesurferRef.current.setOptions({
          waveColor: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)",
          // Hide progress/cursor when a different track is playing
          progressColor: isCurrentTrack ? themeColors.primary : "transparent",
          cursorColor: isCurrentTrack ? themeColors.primary : "transparent",
          // A non-current waveform must not seek the globally playing track
          interact: isCurrentTrack,
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

    // --- Adopt this recording as the global track, starting at startTime ---
    const adoptTrack = useCallback(async (startTime: number) => {
      if (!recordingId) return;
      setIsLoadingAudio(true);
      try {
        let url = resolvedUrlRef.current;
        if (!url) {
          url = await (urlResolvePromiseRef.current ?? resolveAudioUrl(audioUrl, recordingId));
          resolvedUrlRef.current = url;
        }
        if (cancelledRef.current) return;

        const engine = getAudioEngine();
        await engine.audioContext.resume();
        const el = engine.audioElement;
        el.src = url;
        if (startTime > 0) {
          // Seeking before metadata loads is silently dropped — wait for it
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              el.removeEventListener("loadedmetadata", onMeta);
              el.removeEventListener("error", onErr);
            };
            const onMeta = () => { cleanup(); resolve(); };
            const onErr = () => { cleanup(); reject(new Error("Audio failed to load")); };
            el.addEventListener("loadedmetadata", onMeta);
            el.addEventListener("error", onErr);
            el.load();
          });
          el.currentTime = startTime;
        } else {
          el.currentTime = 0;
        }
        await el.play();

        // Update store — skipLoad tells AudioProvider not to reload (we already did)
        useAudioStore.getState().play(
          { id: recordingId, title: title ?? "Untitled", audioUrl, duration: effDuration || null },
          startTime,
          true, // skipLoad
        );
        setCurrentTime(startTime);
        onTimeUpdateRef.current?.(startTime);
      } catch (err) {
        console.error("Failed to play:", err);
        // Cached URL may be stale (expired signature / codec change) —
        // clear it so the next attempt re-resolves fresh.
        clearCachedUrl(recordingId);
        resolvedUrlRef.current = null;
        urlResolvePromiseRef.current = null;
      } finally {
        setIsLoadingAudio(false);
      }
    }, [audioUrl, recordingId, title, effDuration]);

    // --- togglePlay: goes through the store, no WaveSurfer playPause ---
    async function togglePlay() {
      const store = useAudioStore.getState();

      // Same track already in store — just toggle play/pause
      if (store.currentTrack?.id === recordingId) {
        store.togglePlayPause();
        return;
      }

      // Different track or first play — load onto global engine and play
      await adoptTrack(0);
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
      if (isCurrentTrack) {
        if (wavesurferRef.current && duration > 0) {
          wavesurferRef.current.seekTo(time / duration);
        }
      } else {
        // Non-current recording: adopt it, starting at the marker
        void adoptTrack(time);
      }
    }

    // Click on a non-current waveform adopts the track at the clicked position
    function handleAdoptClick(e: React.MouseEvent<HTMLButtonElement>) {
      const rect = e.currentTarget.getBoundingClientRect();
      const frac = rect.width > 0
        ? Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
        : 0;
      const d = duration || effDuration || 0;
      void adoptTrack(frac * d);
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
          {/* Adopt-on-click overlay for non-current recordings — sits under
              the marker dots so those stay individually clickable */}
          {isReady && !isCurrentTrack && !!recordingId && (
            <button
              type="button"
              aria-label={title ? `Play ${title}` : "Play this recording"}
              title="Click to play this recording"
              className="absolute inset-y-0 left-3 right-3 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
              onClick={handleAdoptClick}
              disabled={isLoadingAudio}
            />
          )}
          {/* Marker indicators overlay */}
          {isReady && duration > 0 && markers.length > 0 && (
            <div className="absolute inset-x-3 top-0 h-full pointer-events-none">
              {markers.map((marker, i) => {
                const pct = (marker.time / duration) * 100;
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Seek to ${marker.label} at ${formatTime(marker.time)}`}
                    className="absolute top-0 pointer-events-auto group p-2 -m-2"
                    style={{ left: `${pct}%` }}
                    onClick={() => handleMarkerClick(marker.time)}
                    title={`${formatTime(marker.time)}: ${marker.label}`}
                  >
                    {marker.type === "cue" ? (
                      <Zap className="h-3.5 w-3.5 text-amber-500 -translate-x-1/2" />
                    ) : (
                      <Flag className="h-3.5 w-3.5 text-primary -translate-x-1/2" />
                    )}
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
            <audio
              controls
              // The raw /api/audio/{id} endpoint returns JSON, not audio —
              // point the fallback at the resolved playable URL instead.
              src={resolvedUrl ?? (audioUrl.startsWith("/api/") ? `${audioUrl}?transcode=1` : audioUrl)}
              className="w-full"
              preload="metadata"
              aria-label={title ? `Playback controls for ${title}` : "Audio playback controls"}
            >
              <track kind="captions" />
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
              aria-label="Skip back 10 seconds"
              onClick={() => skip(-10)}
              disabled={!isReady || !isCurrentTrack}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              aria-label={storeIsPlaying ? "Pause" : "Play"}
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
              aria-label="Skip forward 10 seconds"
              onClick={() => skip(10)}
              disabled={!isReady || !isCurrentTrack}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            {onVisualizerOpen && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Enter The Room"
                onClick={onVisualizerOpen}
                disabled={!isReady}
                title="Enter The Room"
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
