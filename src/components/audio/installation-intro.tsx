"use client";

/**
 * Installation loop — intro screen.
 *
 * Pure presentational. Auto-fades-in once mounted; the loop client
 * removes it after INTRO_MS.
 */
export function InstallationIntro() {
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black px-8 text-center"
      style={{ animation: "installationFadeIn 1200ms ease-out forwards" }}
    >
      <div
        className="text-white/90"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 300,
          fontSize: "clamp(3.5rem, 8vw, 6rem)",
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
        }}
      >
        Resonance
      </div>

      <div
        className="text-white/55 mt-3"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "clamp(1.1rem, 2.4vw, 1.7rem)",
          letterSpacing: "0.01em",
        }}
      >
        A contemplative listening room
      </div>

      <p
        className="text-white/40 mt-12 max-w-xl"
        style={{
          fontFamily: "var(--font-geist-sans)",
          fontWeight: 400,
          fontSize: "clamp(0.85rem, 1.4vw, 1rem)",
          lineHeight: 1.7,
        }}
      >
        Composed music drives a slow audiovisual landscape — shaders, light,
        AI-curated imagery — that never repeats verbatim. Recline. Stay as long
        or as briefly as you wish.
      </p>

      <div
        className="text-white/25 mt-16"
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.72rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        by Karel Barnoski
      </div>

      <style jsx>{`
        @keyframes installationFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
