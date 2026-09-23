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

// ─────────────────────────────────────────────────────────────────────────────
// ImmersiveHud — Karel's directive (2026-09-23): fullscreen must be a
// professional viewing mode, not just hidden chrome. While immersive the
// viewer can summon a glass info overlay (title, what it is, how it works)
// without leaving fullscreen, so "you know what you're looking at and how
// it works". Keyboard: F toggles fullscreen, I toggles info, Esc exits.
// Usage (preferred over bare ImmersiveToggle for all new protos):
//
//   const { immersive, toggle } = useImmersive();
//   <ImmersiveHud immersive={immersive} onToggle={toggle}
//     title="Canon" description="Two-hand counterpoint conducting…"
//     howTo={["Allow the camera…", "Raise your right hand to…"]} />
// ─────────────────────────────────────────────────────────────────────────────

const HUD_PILL =
  "min-h-[44px] min-w-[44px] rounded-md border border-border/40 bg-background/30 px-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70 opacity-40 backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100";

export function ImmersiveHud({
  immersive,
  onToggle,
  title,
  description,
  howTo,
}: {
  immersive: boolean;
  onToggle: () => void;
  title: string;
  description: string;
  howTo?: string[];
}) {
  const [info, setInfo] = useState(false);

  // Keyboard: F fullscreen, I info (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "f" || e.key === "F") onToggle();
      if ((e.key === "i" || e.key === "I") && immersive) setInfo((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [immersive, onToggle]);

  // Leaving immersive mode always closes the overlay.
  useEffect(() => {
    if (!immersive) setInfo(false);
  }, [immersive]);

  if (!immersive) {
    return <ImmersiveToggle immersive={false} onToggle={onToggle} />;
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 flex gap-2">
        <button
          type="button"
          onClick={() => setInfo((v) => !v)}
          aria-label={info ? "Hide info" : "What am I looking at?"}
          className={HUD_PILL}
        >
          info
        </button>
        <button type="button" onClick={onToggle} aria-label="Exit fullscreen" className={HUD_PILL}>
          exit
        </button>
      </div>
      {info && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-start bg-black/30 p-6 sm:p-10"
          onClick={() => setInfo(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border/60 bg-background/80 p-6 shadow-lg backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">{description}</p>
            {howTo && howTo.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {howTo.map((line) => (
                  <li key={line} className="text-sm leading-relaxed text-muted-foreground">
                    · {line}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
              i — info · f — fullscreen · esc — exit
            </p>
          </div>
        </div>
      )}
    </>
  );
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
