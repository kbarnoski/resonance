"use client";

import { useEffect, useRef } from "react";
import { VisualizerClient } from "./visualizer-client";
import { useAudioStore, type Track } from "@/lib/audio/audio-store";
import { getAudioEngine, ensureResumed } from "@/lib/audio/audio-engine";
import { JOURNEYS } from "@/lib/journeys/journeys";

interface InstallationClientProps {
  tracks: Track[];
  journey?: string;
}

export function InstallationClient({ tracks, journey }: InstallationClientProps) {
  const setInstallationMode = useAudioStore((s) => s.setInstallationMode);
  const setQueue = useAudioStore((s) => s.setQueue);
  const startJourney = useAudioStore((s) => s.startJourney);
  const stopJourney = useAudioStore((s) => s.stopJourney);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Activate installation mode on mount
  useEffect(() => {
    setInstallationMode(true);

    // Load tracks into queue and auto-start
    if (tracks.length > 0) {
      setQueue(tracks, 0);
      // Ensure audio engine is ready
      try {
        getAudioEngine();
        ensureResumed();
      } catch {}
    }

    // Activate journey if specified
    if (journey) {
      const j = JOURNEYS.find((j) => j.id === journey);
      if (j) {
        startJourney(j.id);
      }
    }

    return () => {
      setInstallationMode(false);
      stopJourney();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Hide cursor after inactivity
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const hideCursor = () => {
      container.style.cursor = "none";
    };

    const showCursor = () => {
      container.style.cursor = "default";
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      cursorTimerRef.current = setTimeout(hideCursor, 3000);
    };

    container.addEventListener("mousemove", showCursor);
    cursorTimerRef.current = setTimeout(hideCursor, 3000);

    return () => {
      container.removeEventListener("mousemove", showCursor);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
    };
  }, []);

  // Disable most keyboard shortcuts except Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full">
      <VisualizerClient />
    </div>
  );
}
