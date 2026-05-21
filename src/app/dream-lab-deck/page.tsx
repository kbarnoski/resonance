import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Dream Lab — Resonance",
  description:
    "A public creative R&D loop. An autonomous Claude agent builds audio-visual prototypes for Resonance every hour, 24/7.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const BG = "#000000";
const ACCENT = "#8b5cf6";
const ACCENT_PINK = "#f472b6";
const BORDER = "#1f1f1f";
const TEXT_DIM = "#a5a5a5";

// Responsive padding: tight on mobile, generous on desktop
const SLIDE_PAD = "clamp(56px, 9vw, 100px) clamp(20px, 6vw, 96px)";

function Slide({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section
      style={{
        minHeight: "100vh",
        padding: SLIDE_PAD,
        background: BG,
        color: "#ffffff",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        borderBottom: `1px solid ${BORDER}`,
        ...style,
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", width: "100%" }}>
        {children}
      </div>
    </section>
  );
}

function Label({ children, color = ACCENT }: { children: React.ReactNode; color?: string }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-geist-mono), 'Geist Mono', monospace",
        fontSize: "clamp(11px, 1.6vw, 13px)",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color,
        marginBottom: "clamp(14px, 2.5vw, 20px)",
      }}
    >
      {children}
    </div>
  );
}

const H1_STYLE: React.CSSProperties = {
  fontSize: "clamp(44px, 10vw, 128px)",
  lineHeight: 0.95,
  letterSpacing: "-0.035em",
  fontWeight: 700,
  margin: 0,
};

const H2_STYLE: React.CSSProperties = {
  fontSize: "clamp(36px, 7vw, 96px)",
  lineHeight: 0.95,
  letterSpacing: "-0.03em",
  fontWeight: 700,
  margin: 0,
};

const LEAD_STYLE: React.CSSProperties = {
  fontSize: "clamp(16px, 2.2vw, 22px)",
  lineHeight: 1.55,
  color: TEXT_DIM,
  maxWidth: 820,
  marginTop: "clamp(20px, 3vw, 32px)",
};

// Auto-wrapping grid: cards collapse to fewer columns as width shrinks
const autoGrid = (minCard = 240, gap = 20): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(min(${minCard}px, 100%), 1fr))`,
  gap,
});

export default function DreamLabDeck() {
  return (
    <main
      style={{
        background: BG,
        fontFamily: "var(--font-geist-sans), Geist, system-ui, sans-serif",
      }}
    >
      {/* Slide 1 — Hero */}
      <Slide>
        <Label>May 21, 2026 · Update</Label>
        <h1 style={H1_STYLE}>
          Dream Lab
          <br />
          ships.
        </h1>
        <p style={LEAD_STYLE}>
          An autonomous agent is now building original audio-visual prototypes for Resonance every hour, 24/7. Today we shipped <span style={{ color: "#fff" }}>71 prototypes</span> to <span style={{ color: "#fff", wordBreak: "break-word" }}>getresonance.vercel.app/dream</span> with admin-gated favoriting, abuse-resistant API guards, and a new direction.
        </p>
        <div
          style={{
            ...autoGrid(160, 32),
            marginTop: "clamp(48px, 8vw, 80px)",
            paddingTop: "clamp(24px, 4vw, 32px)",
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          {[
            ["Launched", "getresonance/dream"],
            ["Prototypes", "71 · all public"],
            ["Agent direction", "refocused"],
            ["New zones", "Kids · Exploratorium"],
          ].map(([k, v]) => (
            <div key={k}>
              <div
                style={{
                  fontFamily: "var(--font-geist-mono), 'Geist Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: ACCENT,
                  marginBottom: 6,
                }}
              >
                {k}
              </div>
              <div style={{ fontSize: "clamp(14px, 1.8vw, 17px)", color: "#fff" }}>
                {v}
              </div>
            </div>
          ))}
        </div>
      </Slide>

      {/* Slide 2 — Public R&D Loop */}
      <Slide>
        <Label>The Dream Lab</Label>
        <h2 style={H2_STYLE}>
          A public
          <br />
          creative R&amp;D loop.
        </h2>
        <p style={LEAD_STYLE}>
          Anyone can browse 71 working audio-visual experiments — flow fields, vectorscopes, granular synths, ghost scenes, particle flocks, WebGPU fluids. A Claude agent in Anthropic&apos;s cloud builds one new prototype every hour. You see what it dreams, the moment it dreams it.
        </p>
        <div style={{ ...autoGrid(260, 24), marginTop: "clamp(36px, 6vw, 56px)" }}>
          {[
            ["Public read", "Every visitor sees every prototype. No login wall. Shareable URLs."],
            ["Admin loves", "Karel signs in, hearts what he loves. The hearts steer what the agent builds next."],
            ["Abuse-proof", "Origin checks, per-IP rate limits, daily quotas — public without bleeding budget."],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                padding: "clamp(20px, 3vw, 32px)",
                border: `1px solid ${BORDER}`,
                borderRadius: 4,
              }}
            >
              <Label>{k}</Label>
              <div style={{ fontSize: "clamp(15px, 1.8vw, 18px)", lineHeight: 1.5 }}>{v}</div>
            </div>
          ))}
        </div>
      </Slide>

      {/* Slide 3 — The Agent */}
      <Slide>
        <Label>The Agent</Label>
        <h2 style={H2_STYLE}>
          A studio that runs
          <br />
          while you sleep.
        </h2>
        <p style={LEAD_STYLE}>
          Every hour, on the hour, a fresh Claude session wakes up in Anthropic&apos;s cloud. It reads its manual, checks what you&apos;ve loved, picks one thing to build, ships it, logs what it learned. Then disappears until next hour.
        </p>
        <div
          style={{
            ...autoGrid(200, 20),
            marginTop: "clamp(36px, 6vw, 56px)",
          }}
        >
          {[
            ["Orient", "Reads STATE.md, IDEAS.md, your love signal. Knows what shipped yesterday."],
            ["Decide", "Continue · build new · research · polish · or this cycle is kids-focused."],
            ["Act", "Writes the prototype. Web Audio + WebGPU + canvas. Self-contained per route."],
            ["Validate", "npm run build must pass. If it fails, git restore. Never push broken code."],
            ["Log + Ship", "One commit. Updates MORNING.md for tomorrow's review. Pushes. Sleeps."],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                padding: "clamp(16px, 2.5vw, 24px)",
                borderLeft: `2px solid ${ACCENT}`,
              }}
            >
              <Label>{k}</Label>
              <div style={{ fontSize: "clamp(13px, 1.6vw, 15px)", lineHeight: 1.5 }}>
                {v}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            ...autoGrid(150, 32),
            marginTop: "clamp(40px, 6vw, 64px)",
            paddingTop: "clamp(24px, 4vw, 32px)",
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          {[
            ["Cycles run", "90+"],
            ["Prototypes shipped", "71"],
            ["Research entries", "35+"],
            ["Karel intervention", "~5 min/day"],
          ].map(([k, v]) => (
            <div key={k}>
              <div
                style={{
                  fontFamily: "var(--font-geist-mono), 'Geist Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#666",
                  marginBottom: 6,
                }}
              >
                {k}
              </div>
              <div style={{ fontSize: "clamp(22px, 3.5vw, 28px)", fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
      </Slide>

      {/* Slide 4 — Kids */}
      <Slide>
        <Label color={ACCENT_PINK}>New zone · Kids</Label>
        <h2 style={H2_STYLE}>
          For a
          <br />
          four-year-old.
        </h2>
        <p style={LEAD_STYLE}>
          Touch-first. No reading required. Tap targets bigger than thumbs. Immediate response. No wrong notes. No scary sounds. iPad and mobile primary form. Grounded in Reggio Emilia and the sensorimotor research on how kids learn music through movement and color.
        </p>
        <div style={{ ...autoGrid(220, 16), marginTop: "clamp(36px, 6vw, 56px)" }}>
          {[
            ["Color Piano", "Eight giant circles, pentatonic — every tap a clean note. Hold to sustain."],
            ["Tilt Rain", "Tip the iPad to catch falling notes in a basket. Catches loop back as melody."],
            ["Hum to Paint", "Mic listens. Pitch becomes a brush stroke. 30 seconds later, the painting sings back."],
            ["Ghost Lullaby", "A simpler Ghost. Tap to make her sing. Two minutes, then a soft fadeout."],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                padding: "clamp(16px, 2.5vw, 24px)",
                background: "#0d0d0d",
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-geist-mono), 'Geist Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: ACCENT_PINK,
                  marginBottom: 10,
                }}
              >
                {k}
              </div>
              <div style={{ fontSize: "clamp(13px, 1.6vw, 15px)", lineHeight: 1.5, color: "#ccc" }}>
                {v}
              </div>
            </div>
          ))}
        </div>
      </Slide>

      <footer
        style={{
          padding: "clamp(28px, 5vw, 48px) clamp(20px, 6vw, 96px)",
          background: BG,
          color: "#666",
          fontSize: 11,
          fontFamily: "var(--font-geist-mono), 'Geist Mono', monospace",
          letterSpacing: "0.1em",
          textAlign: "center",
        }}
      >
        RESONANCE · DREAM LAB · MAY 21, 2026
      </footer>
    </main>
  );
}
