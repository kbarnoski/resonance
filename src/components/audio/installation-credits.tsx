"use client";

/**
 * Installation loop — credits screen.
 *
 * Backdrop is opaque from frame 1. The actual fade-to-black is done
 * by the visualizer wrapper in installation-loop-client (it drops
 * the entire shader/AI/post-process stack to opacity 0 over 3000ms
 * when phase=credits). This screen just provides the dedication
 * content over an already-black canvas — no double fade so the dim
 * has a clean ease-out feel rather than a steep compound ramp.
 *
 * Inner content holds invisible until ~21% in (matching the visualizer
 * fade duration) then fades in/out over the rest of the 14s window —
 * eye never sees text appear on a still-dimming canvas.
 *
 * Typography mirrors the journey-title treatment in installation-intro
 * + visualizer-client: mono eyebrow (0.78rem letter 0.22em white/55),
 * Cormorant 300 hero, mono 1rem credit line, italic Cormorant
 * dedication. Same TEXT_SHADOW stack — kept for parity even though
 * credits sits on solid black.
 */
const TEXT_SHADOW =
  "0 1px 2px rgba(0,0,0,0.95), 0 2px 12px rgba(0,0,0,0.9), 0 0 32px rgba(0,0,0,0.7)";

export function InstallationCredits() {
  return (
    <div className="absolute inset-0 z-[120] flex flex-col items-center justify-center px-8 text-center">
      {/* No bg layer — the visualizer wrapper fades the shader stack
          to opacity 0 over 3s and the page bg-black shows through.
          Adding a bg here would either instantly hide the visualizer
          fade (if opaque) or compound with it (if also fading). */}
      <div
        className="relative flex flex-col items-center"
        style={{ animation: "creditsContent 14000ms ease-in-out forwards", opacity: 0 }}
      >
        <div
          className="text-white/55"
          style={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: "0.78rem",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            marginBottom: "1.75rem",
            textShadow: TEXT_SHADOW,
          }}
        >
          In honor of
        </div>

        <div
          className="text-white"
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: "clamp(3rem, 6.5vw, 5rem)",
            letterSpacing: "-0.01em",
            lineHeight: 1.05,
            marginBottom: "4rem",
            textShadow: TEXT_SHADOW,
          }}
        >
          my father
        </div>

        <div
          className="text-white/55"
          style={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: "0.78rem",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            marginBottom: "1.5rem",
            textShadow: TEXT_SHADOW,
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
            fontSize: "clamp(1.4rem, 2.6vw, 1.9rem)",
            letterSpacing: "0.02em",
            lineHeight: 1.5,
            textShadow: TEXT_SHADOW,
          }}
        >
          Evelina
        </p>

        <div
          className="text-white/65 mt-20"
          style={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: "1rem",
            letterSpacing: "0.06em",
            textShadow: TEXT_SHADOW,
          }}
        >
          Resonance  ·  by Karel Barnoski
        </div>

        <p
          className="text-white/75 mt-10 max-w-xl"
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: "clamp(1.15rem, 2vw, 1.45rem)",
            letterSpacing: "0.02em",
            lineHeight: 1.5,
            textShadow: TEXT_SHADOW,
          }}
        >
          Thank you for experiencing Resonance.
        </p>
      </div>

      <style jsx>{`
        @keyframes creditsContent {
          0%   { opacity: 0; }
          21%  { opacity: 0; }
          30%  { opacity: 1; }
          92%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
