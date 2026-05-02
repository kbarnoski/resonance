"use client";

import { useEffect, useRef, useState } from "react";
import { VisualizerClient } from "./visualizer-client";
import { useAudioStore, type Track } from "@/lib/audio/audio-store";
import { getAudioEngine, ensureResumed } from "@/lib/audio/audio-engine";
import { isDesktopApp, enterKioskMode, exitKioskMode, setCursorVisible } from "@/lib/tauri";
import type { Journey } from "@/lib/journeys/types";
import { InstallationIntro } from "./installation-intro";
import { InstallationTitleCard } from "./installation-title-card";
import { InstallationCredits } from "./installation-credits";

/** One entry in the curated loop sequence. */
export interface SequenceEntry {
  journey: Journey;
  track: Track | null;
}

interface Props {
  sequence: SequenceEntry[];
  /** Featured-recordings pool used when a journey has no paired track. */
  fallbackTracks: Track[];
}

const INTRO_MS = 8_000;
const TITLE_CARD_MS = 6_000;
const CREDITS_MS = 12_000;
// Safety net so the loop keeps moving even when a track is missing or has
// no metadata duration. Tuned to ~6 minutes — longer than any built-in
// journey but short enough that a stuck phase recovers visibly.
const MAX_JOURNEY_MS = 6 * 60 * 1_000;

type Phase =
  | { kind: "intro" }
  | { kind: "journey"; index: number; titleVisible: boolean }
  | { kind: "credits" };

export function InstallationLoopClient({ sequence, fallbackTracks }: Props) {
  const setInstallationMode = useAudioStore((s) => s.setInstallationMode);
  const setQueue = useAudioStore((s) => s.setQueue);
  const startJourney = useAudioStore((s) => s.startJourney);
  const stopJourney = useAudioStore((s) => s.stopJourney);

  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pick the right track for this index — paired first, then by-index from
  // the fallback pool, wrapping with modulo so any pool size works.
  const trackForIndex = (i: number): Track | null => {
    const entry = sequence[i];
    if (entry?.track) return entry.track;
    if (fallbackTracks.length === 0) return null;
    return fallbackTracks[i % fallbackTracks.length] ?? null;
  };

  // ─── Mount: kiosk + installation flag, cursor hide, key trap ───
  useEffect(() => {
    setInstallationMode(true);
    if (isDesktopApp()) enterKioskMode().catch(() => {});

    return () => {
      setInstallationMode(false);
      stopJourney();
      if (isDesktopApp()) exitKioskMode().catch(() => {});
    };
    // Run only on mount/unmount; the actions are stable references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hide cursor after inactivity — same posture as InstallationClient.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const hide = () => {
      container.style.cursor = "none";
      setCursorVisible(false).catch(() => {});
    };
    const show = () => {
      container.style.cursor = "default";
      setCursorVisible(true).catch(() => {});
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      cursorTimerRef.current = setTimeout(hide, 3000);
    };
    container.addEventListener("mousemove", show);
    cursorTimerRef.current = setTimeout(hide, 3000);
    return () => {
      container.removeEventListener("mousemove", show);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      setCursorVisible(true).catch(() => {});
    };
  }, []);

  // Key trap — only Escape allowed, used by kiosk to exit.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);

  // ─── Phase machine ──────────────────────────────────────────────
  useEffect(() => {
    if (phase.kind === "intro") {
      const t = setTimeout(() => {
        if (sequence.length === 0) {
          setPhase({ kind: "credits" });
        } else {
          setPhase({ kind: "journey", index: 0, titleVisible: true });
        }
      }, INTRO_MS);
      return () => clearTimeout(t);
    }

    if (phase.kind === "credits") {
      stopJourney();
      const t = setTimeout(() => {
        setPhase({ kind: "intro" });
      }, CREDITS_MS);
      return () => clearTimeout(t);
    }

    if (phase.kind === "journey") {
      const entry = sequence[phase.index];
      if (!entry) {
        setPhase({ kind: "credits" });
        return;
      }

      // First visit to this index — load track, start journey, then
      // schedule the title-card hide. The same effect re-runs after
      // setPhase flips titleVisible to false (no double-load).
      if (phase.titleVisible) {
        try {
          getAudioEngine();
          ensureResumed();
        } catch { /* engine warming */ }
        const track = trackForIndex(phase.index);
        if (track) {
          setQueue([track], 0);
        }
        startJourney(entry.journey.id);

        const t = setTimeout(() => {
          setPhase({ kind: "journey", index: phase.index, titleVisible: false });
        }, TITLE_CARD_MS);
        return () => clearTimeout(t);
      }

      // Title card hidden — watch for journey end (audio finishes or the
      // safety timer expires) then advance.
      const startMs = Date.now();
      let raf = 0;
      const advance = () => {
        if (phase.index + 1 < sequence.length) {
          setPhase({ kind: "journey", index: phase.index + 1, titleVisible: true });
        } else {
          setPhase({ kind: "credits" });
        }
      };
      const tick = () => {
        const { currentTime, duration } = useAudioStore.getState();
        const audioEnded = duration > 0 && currentTime >= duration - 0.5;
        const timedOut = Date.now() - startMs >= MAX_JOURNEY_MS;
        if (audioEnded || timedOut) {
          advance();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    // Exhaustive — TS will catch missing branches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sequence]);

  const currentJourney =
    phase.kind === "journey" ? sequence[phase.index]?.journey : null;
  const currentTrack =
    phase.kind === "journey" ? trackForIndex(phase.index) : null;

  return (
    <div ref={containerRef} className="h-full w-full relative">
      <VisualizerClient />

      {phase.kind === "intro" && <InstallationIntro />}

      {phase.kind === "journey" && phase.titleVisible && currentJourney && (
        <InstallationTitleCard
          journey={currentJourney}
          trackTitle={currentTrack?.title ?? null}
        />
      )}

      {phase.kind === "credits" && <InstallationCredits />}
    </div>
  );
}
