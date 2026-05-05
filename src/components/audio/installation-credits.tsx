"use client";

/**
 * Installation loop — credits screen.
 *
 * Two layered fades:
 *   1. Outer black backdrop fades in over 3000ms so the visualizer
 *      melts to black instead of being hard-cut on phase change.
 *   2. Inner content holds invisible until ~21% in (matching the bg
 *      fade) then fades in/out over the rest of the 14s window — eye
 *      never sees ghostly text on a darkening shader.
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
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center px-8 text-center">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: "black",
          animation: "creditsBg 3000ms ease-out forwards",
          opacity: 0,
        }}
      />
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
        @keyframes creditsBg {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
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
