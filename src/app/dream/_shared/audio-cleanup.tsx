"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Global audio cleanup for the dream zone.
 *
 * Problem: when a visitor navigates from a prototype back to /dream
 * (or to another prototype), the previous prototype's AudioContext +
 * any <audio>/<video> elements keep playing because Next.js client-
 * side routing doesn't tear down the previous page's audio resources.
 *
 * Approach (zero changes to prototypes):
 *   1. Monkey-patch window.AudioContext + webkitAudioContext so every
 *      instance gets tracked in a Set the moment it's constructed.
 *   2. On every pathname change inside /dream/*, close all tracked
 *      AudioContexts AND pause every <audio>/<video> element in the
 *      DOM.
 *
 * Tradeoff: monkey-patching globals is mildly fragile, but the only
 * alternative is editing every single prototype to clean up its own
 * audio — which the dream agent didn't do consistently. This is the
 * single-point fix.
 */

declare global {
  interface Window {
    __resonanceAudioCleanup?: {
      contexts: Set<AudioContext>;
      patched: boolean;
    };
  }
}

function resumeAll() {
  if (typeof window === "undefined") return;
  const state = window.__resonanceAudioCleanup;
  if (!state) return;
  for (const ctx of state.contexts) {
    if (ctx.state === "suspended") {
      // Fire-and-forget; iOS rejects if not in a gesture but we're
      // attached to a gesture listener so this is safe.
      ctx.resume().catch(() => {
        /* ignore */
      });
    }
  }
}

function attachGestureListeners() {
  if (typeof window === "undefined") return;
  // Use capture so we run before any handler that calls
  // stopPropagation. Use { once: false } so we resume after every
  // gesture — prototype navigation creates new contexts.
  const events: (keyof DocumentEventMap)[] = [
    "touchstart",
    "pointerdown",
    "click",
    "keydown",
  ];
  const handler = () => resumeAll();
  for (const ev of events) {
    document.addEventListener(ev, handler, { capture: true, passive: true });
  }
}

function ensurePatched() {
  if (typeof window === "undefined") return;
  if (window.__resonanceAudioCleanup?.patched) return;

  const state = (window.__resonanceAudioCleanup ??= {
    contexts: new Set<AudioContext>(),
    patched: false,
  });

  // Patch standard AudioContext
  const OrigAudioContext = window.AudioContext;
  if (OrigAudioContext) {
    const Patched = class extends OrigAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        state.contexts.add(this);
        this.addEventListener("statechange", () => {
          if (this.state === "closed") state.contexts.delete(this);
        });
        // iOS / Android Chrome create new contexts in "suspended"
        // state. Try to resume right away — if we're already inside
        // a user gesture (because the constructor was called from a
        // click handler), this succeeds immediately. If not, the
        // gesture listener below will resume on the next tap.
        if (this.state === "suspended") {
          this.resume().catch(() => {
            /* ignore — will resume on next gesture */
          });
        }
      }
    };
    window.AudioContext = Patched as typeof AudioContext;
  }

  // Patch webkitAudioContext for older Safari
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const OrigWebkit = (window as any).webkitAudioContext;
  if (OrigWebkit && OrigWebkit !== OrigAudioContext) {
    const PatchedWebkit = class extends OrigWebkit {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(...args: any[]) {
        super(...args);
        const self = this as unknown as AudioContext;
        state.contexts.add(self);
        self.addEventListener("statechange", () => {
          if (self.state === "closed") state.contexts.delete(self);
        });
        if (self.state === "suspended") {
          self.resume().catch(() => {
            /* ignore */
          });
        }
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webkitAudioContext = PatchedWebkit;
  }

  attachGestureListeners();
  state.patched = true;
}

async function cleanupAll() {
  if (typeof window === "undefined") return;

  const state = window.__resonanceAudioCleanup;
  if (state) {
    // Snapshot first because close() triggers statechange which mutates
    // the set asynchronously.
    const ctxs = Array.from(state.contexts);
    state.contexts.clear();
    for (const ctx of ctxs) {
      if (ctx.state !== "closed") {
        try {
          await ctx.close();
        } catch {
          /* ignore — context may already be closing */
        }
      }
    }
  }

  // Stop and reset any media elements the page mounted.
  document
    .querySelectorAll<HTMLMediaElement>("audio, video")
    .forEach((el) => {
      try {
        el.pause();
        // Resetting currentTime is the difference between "paused mid-
        // sample" and "fully stopped". Choose stopped — visitors don't
        // expect a half-played file to resume on return.
        if (el.currentTime > 0 && !el.paused === false) {
          el.currentTime = 0;
        }
      } catch {
        /* ignore */
      }
    });
}

export function AudioCleanup() {
  // Patch on first client render so any AudioContext constructed by
  // prototype code (which mounts after this component) is tracked.
  ensurePatched();
  const pathname = usePathname();

  useEffect(() => {
    // Cleanup runs when pathname changes (or when this component
    // itself unmounts on leaving /dream). At that point we close all
    // tracked AudioContexts that the previous prototype owned.
    return () => {
      void cleanupAll();
    };
  }, [pathname]);

  return null;
}
