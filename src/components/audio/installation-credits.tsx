"use client";

/**
 * Installation loop — credits screen. Shown after the last journey
 * completes; loops back to intro after CREDITS_MS.
 *
 * Dedicated to the creator's father, with thanks to the people who
 * supported the project. Phrasing intentionally universal so anyone can
 * read it as their own.
 */
export function InstallationCredits() {
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black px-8 text-center"
      style={{ animation: "creditsCycle 12000ms ease-in-out forwards" }}
    >
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

      {/* Thanks */}
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
        With thanks to
      </div>

      <p
        className="text-white/65 max-w-xl"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "clamp(1.1rem, 2vw, 1.4rem)",
          lineHeight: 1.7,
        }}
      >
        Evelina, Johnny, and the countless others who held this project up
        along the way.
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

      <style jsx>{`
        @keyframes creditsCycle {
          0%   { opacity: 0; }
          7%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
