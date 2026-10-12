"use client";

/**
 * HORIZON SPLIT — the journey title card (Karel 2026-10-12: "i like option 7
 * for titling"; ~/Documents/Resonance/title-treatments-2026-10-12.html).
 * A Saul Bass-style horizon: a hairline draws outward from the centre, the
 * title (Inter Tight 300 caps, 5 vh, tracked 0.46em) rises from behind it, the
 * catalogue number (Bodoni Moda italic, 3.3 vh) drops from beneath. Shared by
 * every place a journey title shows so they always match.
 */

// light shadows only: the blurred 14 px pass rastered slowly on the kiosk
const SHADOW = "0 1px 2px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.5)";

export function splitJourneyName(name: string): { title: string; num: string | null } {
  const m = /^(.*?)\s+(\d+)$/.exec(name);
  return m ? { title: m[1], num: m[2] } : { title: name, num: null };
}

export function HorizonTitle({ name, byline }: { name: string; byline?: string | null }) {
  const { title, num } = splitJourneyName(name);
  return (
    // its own compositor layer: the entrance (transform + opacity) never repaints
    <div className="relative flex flex-col items-center text-center" style={{ maxWidth: "92vw", willChange: "transform, opacity", transform: "translateZ(0)" }}>
      {/* a small centred scrim (the screen never darkens as a whole) */}
      <div
        aria-hidden
        className="hz-by"
        style={{ position: "absolute", inset: "-60% -20%", background: "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,0.45), transparent 80%)", pointerEvents: "none" }}
      />
      <div style={{ overflow: "hidden", padding: "0.1em 0" }}>
        <div
          className="hz-title relative text-white uppercase whitespace-nowrap"
          style={{ fontFamily: "var(--font-inter-tight), var(--font-geist-sans), ui-sans-serif, sans-serif", fontWeight: 300, fontSize: "5vh", lineHeight: 1, letterSpacing: "0.46em", paddingLeft: "0.46em", textShadow: SHADOW }}
        >
          {title}
        </div>
      </div>
      <div
        aria-hidden
        className="hz-line relative"
        style={{ width: "46vw", height: 1, margin: "1.8vh 0 1.2vh", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55) 20%, rgba(255,255,255,0.55) 80%, transparent)" }}
      />
      {num && (
        <div style={{ overflow: "hidden", padding: "0.1em 0" }}>
          <div
            className="hz-num relative"
            style={{ fontFamily: "var(--font-bodoni), Georgia, serif", fontStyle: "italic", fontWeight: 400, fontSize: "3.3vh", lineHeight: 1.1, color: "rgba(255,255,255,0.82)", textShadow: SHADOW }}
          >
            No.&thinsp;{num}
          </div>
        </div>
      )}
      {byline && (
        <div
          className="hz-by relative uppercase"
          style={{ marginTop: "1.4vh", fontFamily: "var(--font-inter-tight), var(--font-geist-sans), sans-serif", fontWeight: 300, fontSize: "1.3vh", letterSpacing: "0.34em", paddingLeft: "0.34em", color: "rgba(255,255,255,0.52)", textShadow: SHADOW }}
        >
          {byline}
        </div>
      )}
    </div>
  );
}
