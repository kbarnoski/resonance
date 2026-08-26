"use client";

/**
 * Slim persistent now-playing bar for the studio chrome.
 *
 * The audio engine deliberately survives navigation, but until now the
 * only pause control lived on the recording detail page — leave it and
 * the track kept playing with no visible affordance anywhere. This bar
 * sits at the bottom of the studio layout whenever a track is loaded:
 * title (links back to the recording), play/pause via the store, a
 * hairline progress line, and a stop/dismiss control that clears the
 * global track.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";
import { Pause, Play, X } from "lucide-react";
import { useAudioStore } from "@/lib/audio/audio-store";
import { Button } from "@/components/ui/button";

const BAR_HEIGHT = 52;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function NowPlayingBar() {
  const { currentTrack, isPlaying, currentTime, duration } = useAudioStore(
    useShallow((s) => ({
      currentTrack: s.currentTrack,
      isPlaying: s.isPlaying,
      currentTime: s.currentTime,
      duration: s.duration,
    }))
  );

  const [visible, setVisible] = useState(false);
  const dismissTimerRef = useRef<number | null>(null);

  // Fade in on the frame after a track appears; snap hidden when it goes
  useEffect(() => {
    if (currentTrack) {
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
  }, [currentTrack]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  if (!currentTrack) return null;

  function handleDismiss() {
    // Fade the bar out first, then stop + clear through the store so the
    // engine's own pause handling (ramps, ambient) does its thing.
    setVisible(false);
    dismissTimerRef.current = window.setTimeout(() => {
      const store = useAudioStore.getState();
      store.pause();
      store.clear();
    }, 300);
  }

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  return (
    <div
      className="relative shrink-0 overflow-hidden border-t border-white/[0.08] bg-black/80 backdrop-blur-md transition-[height,opacity] duration-fast ease-out"
      style={{ height: visible ? BAR_HEIGHT : 0, opacity: visible ? 1 : 0 }}
    >
      {/* Subtle progress line along the top edge */}
      <div className="absolute inset-x-0 top-0 h-px bg-white/[0.06]" />
      <div
        className="absolute left-0 top-0 h-px bg-primary/80"
        style={{ width: `${progress * 100}%` }}
      />

      <div className="flex items-center gap-3 px-4" style={{ height: BAR_HEIGHT }}>
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => useAudioStore.getState().togglePlayPause()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-500/[0.28] bg-violet-500/[0.08] text-white/85 transition-colors duration-instant hover:bg-violet-500/[0.14] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/50"
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5 translate-x-px" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <Link
            href={`/recording/${currentTrack.id}`}
            className="block truncate text-sm font-light text-white/85 transition-colors duration-instant hover:text-white focus-visible:outline-none focus-visible:underline"
          >
            {currentTrack.title}
          </Link>
        </div>

        <span className="hidden shrink-0 font-mono text-[0.68rem] tabular-nums text-white/45 sm:block">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <Button
          variant="glassIcon"
          aria-label="Stop and dismiss"
          title="Stop and dismiss"
          onClick={handleDismiss}
          className="size-8 min-h-8 min-w-8 shrink-0 rounded-md text-white/45 hover:text-white/70 focus-visible:ring-1 focus-visible:ring-white/30"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
