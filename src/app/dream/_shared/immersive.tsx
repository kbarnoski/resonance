"use client";

// ─────────────────────────────────────────────────────────────────────────────
// immersive.tsx — shared fullscreen / focus mode for dream protos.
//
// Karel's directive (2026-09-18): every proto needs a fullscreen ability so
// the write-up/instructions chrome disappears and the experience focuses on
// the piece itself. Pattern:
//
//   const { immersive, toggle } = useImmersive();
//   ...
//   {!immersive && <header>title, description, notes link…</header>}
//   <ImmersiveToggle immersive={immersive} onToggle={toggle} />
//
// Uses the native Fullscreen API when available (Esc exits, state tracked via
// fullscreenchange); where it's unavailable (iPhone Safari) it degrades to a
// chrome-hiding focus mode with the same API. While immersive, the toggle
// renders as a barely-there corner pill so the art stays clean but an exit
// is always discoverable.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";

export function useImmersive(): {
  immersive: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
} {
  const [immersive, setImmersive] = useState(false);

  // Native fullscreen exits (Esc, system UI) must update our state.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setImmersive(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const enter = useCallback(() => {
    setImmersive(true);
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {
        /* fullscreen refused (iframe policy, iOS) — focus mode still applies */
      });
    }
  }, []);

  const exit = useCallback(() => {
    setImmersive(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {
        /* already out */
      });
    }
  }, []);

  const toggle = useCallback(() => {
    if (immersive) exit();
    else enter();
  }, [immersive, enter, exit]);

  return { immersive, enter, exit, toggle };
}

export function ImmersiveToggle({
  immersive,
  onToggle,
}: {
  immersive: boolean;
  onToggle: () => void;
}) {
  if (immersive) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label="Exit fullscreen"
        className="fixed bottom-4 right-4 z-50 min-h-[44px] min-w-[44px] rounded-md border border-border/40 bg-background/30 px-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70 opacity-40 backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        exit
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Enter fullscreen"
      className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      ⛶ Fullscreen
    </button>
  );
}
