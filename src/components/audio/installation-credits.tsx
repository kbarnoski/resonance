"use client";

import { useEffect, useState } from "react";

/**
 * Installation loop — credits screen.
 *
 * Default mode: shown after the last journey completes; the loop
 * client schedules a return-to-intro after CREDITS_MS (kiosk loop).
 *
 * playOnce mode (the /demo URL): the loop client doesn't schedule a
 * return-to-intro. Instead it passes an `onReplay` callback to this
 * component. Once the credits content has finished its fade-out, a
 * subtle "Begin again" affordance fades in — clicking it restarts
 * the cycle from the top so the reviewer can watch again.
 *
 * Dedication phrasing is intentionally universal so anyone reading
 * the credits can read it as their own.
 */
export function InstallationCredits({ onReplay }: { onReplay?: () => void }) {
  const [showReplay, setShowReplay] = useState(false);

  useEffect(() => {
    if (!onReplay) return;
    // The creditsContent keyframe finishes at 12s. Add a small beat
    // before the replay button fades in so the screen has a moment
    // of pure black between the credits ending and the affordance
    // appearing — feels like a deliberate end, not a cross-fade.
    const t = setTimeout(() => setShowReplay(true), 12_500);
    return () => clearTimeout(t);
  }, [onReplay]);

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black px-8 text-center"
    >
      {/* Inner content gets the fade animation; the outer black layer
          is fully opaque from frame 1 so the shader stack underneath
          never peeks through. */}
      <div className="flex flex-col items-center" style={{ animation: "creditsContent 12000ms ease-in-out forwards", opacity: 0 }}>
      {/* Dedication */}
      <div
        className="text-white/35"
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.72rem",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: "1.5rem",
        }}
      >
        In honor of
      </div>

      <div
        className="text-white/90"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "clamp(2.5rem, 5vw, 3.75rem)",
          letterSpacing: "-0.01em",
          lineHeight: 1.1,
          marginBottom: "3.5rem",
        }}
      >
        my father
      </div>

      {/* Special thanks — life partner */}
      <div
        className="text-white/30"
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.7rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: "1.25rem",
        }}
      >
        Special thanks to my life partner
      </div>

      <p
        className="text-white/75 max-w-xl"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "clamp(1.4rem, 2.4vw, 1.8rem)",
          lineHeight: 1.5,
        }}
      >
        Evelina
      </p>

      <div
        className="text-white/20 mt-20"
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.7rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        Resonance · by Karel Barnoski
      </div>
      </div>

      {/* Replay affordance — only rendered in playOnce mode (/demo).
          Mounts after the credits animation finishes so it doesn't
          overlap with the dedication. Subtle by design — the
          experience itself should be the focus, the button is just
          a quiet "you can see this again" cue. */}
      {onReplay && showReplay && (
        <button
          onClick={onReplay}
          className="absolute bottom-16 left-1/2 -translate-x-1/2"
          style={{
            animation: "replayFadeIn 1800ms ease-out forwards",
            opacity: 0,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: "999px",
            padding: "0.85rem 2.25rem",
            color: "rgba(255,255,255,0.75)",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(1.05rem, 1.8vw, 1.25rem)",
            letterSpacing: "0.04em",
            cursor: "pointer",
            transition: "color 250ms ease, border-color 250ms ease, background 250ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,0.95)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)";
            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,0.75)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          Begin again
        </button>
      )}

      <style jsx>{`
        @keyframes creditsContent {
          0%   { opacity: 0; }
          7%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes replayFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
