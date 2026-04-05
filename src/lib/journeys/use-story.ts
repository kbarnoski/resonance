"use client";

import { useEffect, useRef } from "react";
import { useAudioStore } from "@/lib/audio/audio-store";

/**
 * Watches activeJourney + textOverlayMode.
 * When story mode is active with a journey, fetches a narrative from /api/story.
 */
export function useStoryGeneration() {
  const activeJourney = useAudioStore((s) => s.activeJourney);
  const textOverlayMode = useAudioStore((s) => s.textOverlayMode);
  const language = useAudioStore((s) => s.language);
  const setStoryData = useAudioStore((s) => s.setStoryData);
  const setStoryLoading = useAudioStore((s) => s.setStoryLoading);

  const fetchedForRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Only fetch when story mode is active with an active journey
    if (textOverlayMode !== "story" || !activeJourney) {
      // Clean up if we leave story mode
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      return;
    }

    // Don't re-fetch for the same journey
    const fetchKey = `${activeJourney.id}-${language}`;
    if (fetchedForRef.current === fetchKey) return;
    fetchedForRef.current = fetchKey;

    // Abort any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStoryLoading(true);

    fetch("/api/story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        journeyName: activeJourney.name,
        realmId: activeJourney.realmId,
        mood: activeJourney.phases[0]?.poetryMood ?? "flowing",
        language,
        poetryImagery: activeJourney.theme?.poetryImagery ?? null,
        phases: activeJourney.phases.map((p) => ({
          id: p.id,
          guidancePhrases: p.guidancePhrases,
        })),
      }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Story fetch failed");
        return res.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setStoryData(data);
          setStoryLoading(false);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("[story] fetch error:", err);
          setStoryLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [textOverlayMode, activeJourney, language, setStoryData, setStoryLoading]);

  // Reset fetch key when journey stops
  useEffect(() => {
    if (!activeJourney) {
      fetchedForRef.current = null;
      setStoryData(null);
      setStoryLoading(false);
    }
  }, [activeJourney, setStoryData, setStoryLoading]);
}
