"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAudioStore } from "@/lib/audio/audio-store";
import { getJourneyEngine } from "./journey-engine";
import { getAmbientEngine } from "@/lib/audio/ambient-engine";
import { getAudioEngine } from "@/lib/audio/audio-engine";
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

  // Compute progress
  const progress = duration > 0 ? currentTime / duration : 0;

  // Update frame — throttled to avoid cascading re-renders
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

    // Always compute the frame (cheap ref update)
    const newFrame = engine.getFrame(progress);
    frameRef.current = newFrame;

    // Only push to React state at throttled rate
    if (now - lastFrameTimeRef.current >= FRAME_THROTTLE_MS) {
      lastFrameTimeRef.current = now;
      setFrame(newFrame);
    }
  }, [activeJourney, progress]);

  // Subscribe to phase changes and sync to store
  const setJourneyPhase = useAudioStore((s) => s.setJourneyPhase);
  useEffect(() => {
    const engine = engineRef.current;
    const unsub = engine.onPhaseChange((phase) => {
      setJourneyPhase(phase);
    });
    return unsub;
  }, [setJourneyPhase]);

  // --- Ambient sound engine: start/stop with journey ---
  useEffect(() => {
    if (!activeJourney) {
      const ambient = getAmbientEngine();
      if (ambient.isRunning()) ambient.stop();
      return;
    }

    // Defer start to avoid blocking the main thread on journey open
    const timer = setTimeout(() => {
      const ambient = getAmbientEngine();
      if (!ambient.isRunning()) {
        try {
          const engine = getAudioEngine();
          ambient.start(engine.audioContext);
        } catch {
          ambient.start();
        }
      }
    }, 800);

    return () => {
      clearTimeout(timer);
      const a = getAmbientEngine();
      if (a.isRunning()) a.stop();
    };
  }, [activeJourney]);

  // Update ambient layers — driven by phase changes, not every frame
  const currentPhaseId = frame?.phase ?? null;
  const updateAmbientLayers = useCallback(() => {
    const f = frameRef.current;
    if (!f?.ambientLayers) return;
    const ambient = getAmbientEngine();
    if (ambient.isRunning()) {
      ambient.setLayers(f.ambientLayers);
    }
  }, []);

  useEffect(() => {
    if (!currentPhaseId) return;
    // Update immediately on phase change
    updateAmbientLayers();
    // Then periodically during the phase
    const interval = setInterval(updateAmbientLayers, 2000);
    return () => clearInterval(interval);
  }, [currentPhaseId, updateAmbientLayers]);

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
