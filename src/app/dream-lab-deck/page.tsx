import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dream Lab — Resonance",
  description:
    "A public creative R&D loop. An autonomous Claude agent builds audio-visual prototypes for Resonance every hour, 24/7.",
};

const BG = "#000000";
const ACCENT = "#8b5cf6";
const ACCENT_PINK = "#f472b6";
const BORDER = "#1f1f1f";
const TEXT_DIM = "#a5a5a5";

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
        padding: "100px 96px",
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
        fontSize: 13,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color,
        marginBottom: 20,
      }}
    >
      {children}
    </div>
  );
}

export default function DreamLabDeck() {
  return (
    <main style={{ background: BG, fontFamily: "var(--font-geist-sans), Geist, system-ui, sans-serif" }}>
      {/* Slide 1 — Today's Progress / Hero */}
      <Slide>
        <Label>May 21, 2026 · Update</Label>
        <h1
          style={{
            fontSize: "clamp(64px, 9vw, 128px)",
            lineHeight: 0.92,
            letterSpacing: "-0.035em",
            fontWeight: 700,
            margin: 0,
          }}
        >
          Dream Lab<br />ships.
        </h1>
        <p
          style={{
            fontSize: 22,
            lineHeight: 1.5,
            color: TEXT_DIM,
            maxWidth: 760,
            marginTop: 32,
          }}
        >
          An autonomous agent is now building original audio-visual prototypes for Resonance every hour, 24/7. Today we shipped <span style={{ color: "#fff" }}>71 prototypes</span> to <span style={{ color: "#fff" }}>getresonance.vercel.app/dream</span> with admin-gated favoriting, abuse-resistant API guards, and a new direction.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 40,
            marginTop: 80,
            paddingTop: 32,
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
                  marginBottom: 8,
                }}
              >
                {k}
              </div>
              <div style={{ fontSize: 17, color: "#fff" }}>{v}</div>
            </div>
          ))}
        </div>
      </Slide>

      {/* Slide 2 — Public R&D Loop */}
      <Slide>
        <Label>The Dream Lab</Label>
        <h2
          style={{
            fontSize: "clamp(48px, 6.5vw, 96px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
            fontWeight: 700,
            margin: 0,
          }}
        >
          A public<br />creative R&amp;D loop.
        </h2>
        <p style={{ fontSize: 21, lineHeight: 1.5, color: TEXT_DIM, maxWidth: 780, marginTop: 28 }}>
          Anyone can browse 71 working audio-visual experiments — flow fields, vectorscopes, granular synths, ghost scenes, particle flocks, WebGPU fluids. A Claude agent in Anthropic&apos;s cloud builds one new prototype every hour. You see what it dreams, the moment it dreams it.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 28,
            marginTop: 56,
          }}
        >
          {[
            ["Public read", "Every visitor sees every prototype. No login wall. Shareable URLs."],
            ["Admin loves", "Karel signs in, hearts what he loves. The hearts steer what the agent builds next."],
            ["Abuse-proof", "Origin checks, per-IP rate limits, daily quotas — public without bleeding budget."],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                padding: 32,
                border: `1px solid ${BORDER}`,
                borderRadius: 4,
              }}
            >
              <Label>{k}</Label>
              <div style={{ fontSize: 18, lineHeight: 1.5 }}>{v}</div>
            </div>
          ))}
        </div>
      </Slide>

      {/* Slide 3 — The Agent */}
      <Slide>
        <Label>The Agent</Label>
        <h2
          style={{
            fontSize: "clamp(48px, 6vw, 88px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
            fontWeight: 700,
            margin: 0,
          }}
        >
          A studio that runs<br />while you sleep.
        </h2>
        <p style={{ fontSize: 20, lineHeight: 1.5, color: TEXT_DIM, maxWidth: 820, marginTop: 28 }}>
          Every hour, on the hour, a fresh Claude session wakes up in Anthropic&apos;s cloud. It reads its manual, checks what you&apos;ve loved, picks one thing to build, ships it, logs what it learned. Then disappears until next hour.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 0,
            marginTop: 64,
          }}
        >
          {[
            ["Orient", "Reads STATE.md, IDEAS.md, your love signal. Knows what shipped yesterday."],
            ["Decide", "Continue · build new · research · polish · or this cycle is kids-focused."],
            ["Act", "Writes the prototype. Web Audio + WebGPU + canvas. Self-contained per route."],
            ["Validate", "npm run build must pass. If it fails, git restore. Never push broken code."],
            ["Log + Ship", "One commit. Updates MORNING.md for tomorrow's review. Pushes. Sleeps."],
          ].map(([k, v], i) => (
            <div
              key={k}
              style={{
                padding: i === 0 ? "0 24px 0 0" : i === 4 ? "0 0 0 24px" : "0 24px",
                borderRight: i < 4 ? `1px solid ${BORDER}` : "none",
              }}
            >
              <Label>{k}</Label>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>{v}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            gap: 64,
            marginTop: 80,
            paddingTop: 32,
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
              <div style={{ fontSize: 28, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
      </Slide>

      {/* Slide 4 — Resonance Kids */}
      <Slide>
        <Label color={ACCENT_PINK}>New zone · Kids</Label>
        <h2
          style={{
            fontSize: "clamp(56px, 7vw, 104px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
            fontWeight: 700,
            margin: 0,
          }}
        >
          For a<br />four-year-old.
        </h2>
        <p style={{ fontSize: 21, lineHeight: 1.5, color: TEXT_DIM, maxWidth: 760, marginTop: 28 }}>
          Touch-first. No reading required. Tap targets bigger than thumbs. Immediate response. No wrong notes. No scary sounds. iPad and mobile primary form. Grounded in Reggio Emilia and the sensorimotor research on how kids learn music through movement and color.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 20,
            marginTop: 56,
          }}
        >
          {[
            ["Color Piano", "Eight giant circles, pentatonic — every tap a clean note. Hold to sustain."],
            ["Tilt Rain", "Tip the iPad to catch falling notes in a basket. Catches loop back as melody."],
            ["Hum to Paint", "Mic listens. Pitch becomes a brush stroke. 30 seconds later, the painting sings back."],
            ["Ghost Lullaby", "A simpler Ghost. Tap to make her sing. Two minutes, then a soft fadeout."],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                padding: 24,
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
              <div style={{ fontSize: 15, lineHeight: 1.45, color: "#ccc" }}>{v}</div>
            </div>
          ))}
        </div>
      </Slide>

      {/* Footer */}
      <footer
        style={{
          padding: "48px 96px",
          background: BG,
          color: "#666",
          fontSize: 12,
          fontFamily: "var(--font-geist-mono), 'Geist Mono', monospace",
          letterSpacing: "0.1em",
          textAlign: "center",
        }}
      >
        RESONANCE · DREAM LAB · MAY 21, 2026 · KAREL BARNOSKI
      </footer>
    </main>
  );
}
