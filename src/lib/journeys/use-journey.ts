"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAudioStore } from "@/lib/audio/audio-store";
import { getJourneyEngine } from "./journey-engine";
// import { getAmbientEngine } from "@/lib/audio/ambient-engine";
// import { getAudioEngine } from "@/lib/audio/audio-engine";
import type { JourneyFrame, JourneyPhaseId } from "./types";

interface UseJourneyReturn {
  /** Current frame data from the journey engine */
  frame: JourneyFrame | null;
  /** Whether a journey is active */
  active: boolean;
  /** Current phase ID */
  phase: JourneyPhaseId | null;
  /** Overall journey progress 0-1 */
  progress: number;
}

// Throttle frame state updates to ~10fps to avoid render storms.
// The journey engine still computes at whatever rate progress changes,
// but React only re-renders 10 times per second.
const FRAME_THROTTLE_MS = 33; // ~30fps — smooth enough for visual transitions

/**
 * React hook that subscribes to the journey engine and provides
 * the current frame state for rendering.
 *
 * Also drives the ambient sound engine — starts it when a journey
 * begins and updates layer intensities from each frame.
 */
export function useJourney(): UseJourneyReturn {
  const currentTime = useAudioStore((s) => s.currentTime);
  const duration = useAudioStore((s) => s.duration);
  const activeJourney = useAudioStore((s) => s.activeJourney);

  const [frame, setFrame] = useState<JourneyFrame | null>(null);
  const engineRef = useRef(getJourneyEngine());
  const lastFrameTimeRef = useRef(0);
  const frameRef = useRef<JourneyFrame | null>(null);
  /** Wall-clock time when the current journey started — for fallback progress */
  const journeyStartRef = useRef(0);

  // Record wall-clock start time when a journey begins
  useEffect(() => {
    if (activeJourney) {
      journeyStartRef.current = performance.now();
    } else {
      journeyStartRef.current = 0;
    }
  }, [activeJourney]);

  // Compute progress from audio, with wall-clock fallback
  const audioProgress = duration > 0 ? currentTime / duration : 0;
  const progress = audioProgress;
  const progressRef = useRef(progress);
  progressRef.current = progress;

  // Update frame from audio progress
  useEffect(() => {
    if (!activeJourney) {
      if (frameRef.current !== null) {
        frameRef.current = null;
        setFrame(null);
      }
      return;
    }

    const now = performance.now();
    const engine = engineRef.current;

    // Use audio progress, or wall-clock fallback if audio isn't advancing
    let p = progress;
    if (p <= 0 && journeyStartRef.current > 0) {
      const elapsedSec = (now - journeyStartRef.current) / 1000;
      p = Math.min(elapsedSec / 300, 1); // assume 300s default track
    }

    const newFrame = engine.getFrame(p);
    frameRef.current = newFrame;

    if (now - lastFrameTimeRef.current >= FRAME_THROTTLE_MS) {
      lastFrameTimeRef.current = now;
      setFrame(newFrame);
    }
  }, [activeJourney, progress]);


  // Poll engine for progress-based changes (shader switches, phase changes).
  // When audio progress is available, this catches changes at switch boundaries.
  // When audio is unavailable, the wall-clock fallback keeps the journey advancing.
  useEffect(() => {
    if (!activeJourney) return;

    const id = setInterval(() => {
      const engine = engineRef.current;

      // Use audio progress if available, otherwise wall-clock fallback
      let p = progressRef.current;
      if (p <= 0 && journeyStartRef.current > 0) {
        const elapsedSec = (performance.now() - journeyStartRef.current) / 1000;
        p = Math.min(elapsedSec / 300, 1);
      }

      const newFrame = engine.getFrame(p);
      if (!newFrame) return;

      const prev = frameRef.current;
      // Only push to React if something visually changed
      if (
        !prev ||
        prev.shaderMode !== newFrame.shaderMode ||
        prev.phase !== newFrame.phase ||
        prev.aiPrompt !== newFrame.aiPrompt
      ) {
        frameRef.current = newFrame;
        setFrame(newFrame);
      }
    }, 500);

    return () => clearInterval(id);
  }, [activeJourney]);

  // Subscribe to phase changes and sync to store
  const setJourneyPhase = useAudioStore((s) => s.setJourneyPhase);
  useEffect(() => {
    const engine = engineRef.current;
    const unsub = engine.onPhaseChange((phase) => {
      setJourneyPhase(phase);
    });
    return unsub;
  }, [setJourneyPhase]);

  // --- Ambient sound engine: disabled for now ---
  // To re-enable, uncomment the imports and the block below.
  // useEffect(() => { ... ambient engine start/stop/theme ... }, [activeJourney]);

  return {
    frame,
    active: activeJourney !== null,
    phase: frame?.phase ?? null,
    progress,
  };
}

/**
 * Hook for receiving phase change events with guidance phrases.
 */
export function usePhaseChange(
  callback: (phase: JourneyPhaseId, guidance: string | null) => void
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const engine = getJourneyEngine();
    const unsub = engine.onPhaseChange((phase, guidance) => {
      callbackRef.current(phase, guidance);
    });
    return unsub;
  }, []);
}
