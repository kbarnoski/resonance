import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exploratorium — Resonance Dream Lab",
  description:
    "Walk in. Become the music. A Resonance installation concept for the Exploratorium SF.",
};

const BG = "#000000";
const ACCENT = "#8b5cf6";
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-geist-mono), 'Geist Mono', monospace",
        fontSize: 13,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: ACCENT,
        marginBottom: 20,
      }}
    >
      {children}
    </div>
  );
}

export default function ExploratoriumDeck() {
  return (
    <main style={{ background: BG, fontFamily: "var(--font-geist-sans), Geist, system-ui, sans-serif" }}>
      {/* Slide 1 — Hero / Pitch */}
      <Slide>
        <Label>Concept · Exploratorium SF</Label>
        <h1
          style={{
            fontSize: "clamp(64px, 10vw, 144px)",
            lineHeight: 0.9,
            letterSpacing: "-0.04em",
            fontWeight: 700,
            margin: 0,
          }}
        >
          Walk in.<br />Become the music.
        </h1>
        <p style={{ fontSize: 23, lineHeight: 1.5, color: TEXT_DIM, maxWidth: 880, marginTop: 36 }}>
          A small room at the Exploratorium. No screens. No buttons. The room <span style={{ color: "#fff" }}>listens</span> — depth cameras, microphones, footfalls — and <span style={{ color: "#fff" }}>sings back</span> through projected light and surround sound. Your body is an instrument. The collective is a piece.
        </p>
        <div
          style={{
            display: "flex",
            gap: 80,
            marginTop: 80,
            paddingTop: 32,
            borderTop: `1px solid ${BORDER}`,
            flexWrap: "wrap",
          }}
        >
          <div>
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
              Where
            </div>
            <div style={{ fontSize: 17, color: "#fff" }}>Exploratorium, Pier 15, San Francisco</div>
          </div>
          <div>
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
              Why there
            </div>
            <div style={{ fontSize: 17, color: "#fff" }}>Listening Vessels · Archimedes · already a museum of sound</div>
          </div>
        </div>
      </Slide>

      {/* Slide 2 — Visitor Experience */}
      <Slide>
        <Label>Visitor Experience</Label>
        <h2
          style={{
            fontSize: "clamp(40px, 5vw, 72px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
            fontWeight: 700,
            margin: 0,
            marginBottom: 56,
          }}
        >
          What you feel<br />when you enter.
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {[
            ["00:00", "The room is dim. A soft pad drones from invisible speakers. A small floor mat at the entry: \"Move slowly. The room is listening.\""],
            ["00:10", "A depth camera finds your body. The projector picks out a soft glow on the wall behind you. The room knows you're there."],
            ["00:25", "You hum. The drone shifts to harmonize with your pitch. The glow pulses with your voice's loudness."],
            ["00:40", "You step left. A short melodic phrase plays from the left speaker — the room whispering back."],
            ["01:30", "A second visitor enters. Their glow is a different color. The two voices cross-fade into intervals that make musical sense."],
            ["03:00", "You step back to the mat. The piece you made fades into a final cadence. Three seconds of silence. Then the drone returns for the next visitor."],
          ].map(([t, line]) => (
            <div key={t} style={{ display: "flex", gap: 32, alignItems: "baseline" }}>
              <div
                style={{
                  fontFamily: "var(--font-geist-mono), 'Geist Mono', monospace",
                  fontSize: 13,
                  letterSpacing: "0.18em",
                  color: ACCENT,
                  minWidth: 80,
                }}
              >
                {t}
              </div>
              <div style={{ fontSize: 19, lineHeight: 1.5 }}>{line}</div>
            </div>
          ))}
        </div>
      </Slide>

      {/* Slide 3 — Five Stations */}
      <Slide>
        <Label>Modular Layout</Label>
        <h2
          style={{
            fontSize: "clamp(40px, 5vw, 72px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
            fontWeight: 700,
            margin: 0,
          }}
        >
          Five stations<br />along one wall.
        </h2>
        <p style={{ fontSize: 19, lineHeight: 1.5, color: TEXT_DIM, maxWidth: 760, marginTop: 24 }}>
          If the full room is a stretch, the modular version. Five 6-foot stations, each independently valuable. The museum picks how many it can host.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 16,
            marginTop: 56,
          }}
        >
          {[
            ["Station 1", "Voice → Color", "Hum into a mic. Pitch becomes a colored brush stroke on the wall. Build a painting in 30 seconds."],
            ["Station 2", "Body → Drum", "Step pads on the floor. Each step plays percussion. Multi-visitor — kids find this first."],
            ["Station 3", "Two-Person Harmony", "Two listening vessels at 10ft apart. Each voice captured. The two voices harmonize live, then play back as a duet."],
            ["Station 4", "Movement Mirror", "A single visitor in front of a depth camera. Their silhouette drives an audio-reactive shader projected on the wall."],
            ["Station 5", "Group Cymatics", "A real vibrating plate under plexiglass. Visitors hum. Chladni patterns form. Digital meets physical."],
          ].map(([num, title, desc]) => (
            <div
              key={num}
              style={{
                padding: 24,
                background: "#0d0d0d",
                borderLeft: `2px solid ${ACCENT}`,
                minHeight: 200,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-geist-mono), 'Geist Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: ACCENT,
                  marginBottom: 10,
                }}
              >
                {num}
              </div>
              <div style={{ fontSize: 21, fontWeight: 600, marginBottom: 10 }}>{title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_DIM }}>{desc}</div>
            </div>
          ))}
        </div>
      </Slide>

      {/* Slide 4 — Architecture + Budget */}
      <Slide>
        <Label>Architecture</Label>
        <h2
          style={{
            fontSize: "clamp(40px, 5vw, 72px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
            fontWeight: 700,
            margin: 0,
          }}
        >
          Browser-first.<br />Off-the-shelf hardware.
        </h2>
        <p style={{ fontSize: 19, lineHeight: 1.5, color: TEXT_DIM, maxWidth: 760, marginTop: 24 }}>
          Built on the same WebGPU + AudioWorklet stack that powers the Dream Lab today. No native install. No bespoke engineering. ~$5,500 in commodity hardware.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 32,
            marginTop: 56,
          }}
        >
          {[
            ["Sensors", "2× Intel RealSense D455\n(body tracking, 6 visitors)\n\n2× Shure SM7B mics\n(voice / hum capture)\n\nMediaPipe webcam fallback\n1 pressure mat at entry"],
            ["Compute", "1× M2 Mac Mini\nfullscreen Chromium\n\nWebGPU + AudioWorklet\nall in-browser\n\nMediaPipe Pose at 30fps\non integrated GPU"],
            ["Output", "2× Optoma GT2000HDR\nshort-throw projectors\n\n4-channel speaker array\n(stereo + 2 surround)\n\nDMX ambient light strips\nat room edges"],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                padding: 28,
                background: "#0d0d0d",
                borderRadius: 4,
              }}
            >
              <Label>{k}</Label>
              <div style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-line", color: "#e5e5e5" }}>{v}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            gap: 64,
            marginTop: 56,
            paddingTop: 32,
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          {[
            ["Bill of materials", "~$5,500"],
            ["Build effort", "~6 weeks"],
            ["Reuse from Dream Lab", "~70%"],
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
              <div style={{ fontSize: 32, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
      </Slide>

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
        RESONANCE · DREAM LAB · EXPLORATORIUM CONCEPT · MAY 21, 2026
      </footer>
    </main>
  );
}
