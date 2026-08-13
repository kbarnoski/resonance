"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 11000 · Craquelure — a self-composing score that writes itself the way a glaze
// cracks: a living web of fractures spreading across a dark plane, each new crack
// ringing a note, so the crack-map IS the evolving music.
//
// THE ONE QUESTION: What if a score wrote itself like a crazing glaze — a web of
// fractures spreading over a near-black plane, every crack a note?
//
// TECHNIQUE: Jared Tarbell's *Substrate* (complexification.net/gallery/substrate)
// — agent-based crack propagation. Cracks are line-agents that advance one step
// per tick, claim cells of a coarse Uint16 grid, and on collision spawn fresh
// cracks at a perpendicular heading. Rendered as growing SVG <polyline>s; every
// birth strikes a note and every collision damps one, over a sub-bass drone. The
// plane fills over ~2 minutes, dissolves, and reseeds — see README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { Substrate, W, H } from "./substrate";
import { CrackSynth } from "./audio";

export default function CraquelurePage() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const engineRef = useRef<Substrate | null>(null);
  const synthRef = useRef<CrackSynth | null>(null);
  const rafRef = useRef<number | null>(null);

  const [soundOn, setSoundOn] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  // Mount once: bring the visual to life immediately; audio stays suspended
  // until the visitor presses the button (browsers block audio before a gesture).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const group = groupRef.current;
    if (!group) return;

    const synth = new CrackSynth();
    synthRef.current = synth;
    if (!synth.ok) setAudioAvailable(false);

    const engine = new Substrate(group, {
      onBirth: (gen, ang) => synthRef.current?.strike(gen, ang, false),
      onDeath: (gen, ang) => synthRef.current?.strike(gen, ang, true),
    });
    engineRef.current = engine;
    engine.seedRandom(3);

    const loop = () => {
      engine.frame();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      synthRef.current?.dispose();
      synthRef.current = null;
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBegin = async () => {
    const synth = synthRef.current;
    if (!synth || !synth.ok) {
      setAudioAvailable(false);
      return;
    }
    await synth.resume();
    setSoundOn(synth.running);
  };

  // Click / tap anywhere seeds a new crack; heading radiates from plane centre.
  const handlePointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const engine = engineRef.current;
    if (!svg || !engine) return;
    const rect = svg.getBoundingClientRect();
    // account for preserveAspectRatio="xMidYMid slice"
    const scale = Math.max(rect.width / W, rect.height / H);
    const offX = (rect.width - W * scale) / 2;
    const offY = (rect.height - H * scale) / 2;
    const x = (e.clientX - rect.left - offX) / scale;
    const y = (e.clientY - rect.top - offY) / scale;
    const ang = (Math.atan2(y - H / 2, x - W / 2) * 180) / Math.PI;
    engine.seedAt(x, y, ang);
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05060a] text-foreground">
      {/* ── The crazed plane ──────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        onPointerDown={handlePointer}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        style={{ filter: "blur(0.15px)" }}
        aria-label="A living web of fractures spreading across a dark plane."
      >
        <defs>
          <radialGradient id="craq-vignette" cx="50%" cy="42%" r="72%">
            <stop offset="0%" stopColor="#0b0d16" />
            <stop offset="100%" stopColor="#04050a" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="url(#craq-vignette)" />
        <g
          ref={groupRef}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ strokeWidth: 0.9 }}
        />
      </svg>

      {/* ── Chrome ───────────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
        <header className="pointer-events-auto max-w-xl">
          <Link
            href="/dream"
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← dream
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            Craquelure
          </h1>
          <p className="mt-1.5 max-w-md text-base leading-relaxed text-muted-foreground">
            A self-composing score that writes itself the way a glaze cracks —
            each fracture rings a note, so the crack-map is the music.
          </p>
        </header>

        <footer className="pointer-events-auto flex flex-wrap items-center gap-3">
          {!soundOn ? (
            <button
              onClick={handleBegin}
              disabled={!audioAvailable}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {audioAvailable ? "Sound on" : "Audio unavailable"}
            </button>
          ) : (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              ◈ listening
            </span>
          )}

          <button
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>

          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            tap the plane to seed a crack
          </span>
        </footer>
      </div>

      {/* ── Design-notes overlay ─────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-popover/95 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              A glaze that composes itself
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The plane grows the way a ceramic glaze crazes as it cools:
                hairline fractures nucleate, run, and split. Each crack is an
                autonomous line-agent following Jared Tarbell&rsquo;s{" "}
                <em>Substrate</em> — it advances one step at a time, claiming
                cells of a coarse grid. When it meets another crack at a
                different angle it stops and throws off new cracks at right
                angles, so the web keeps branching into finer and finer crazing.
              </p>
              <p>
                Sound is the map, not a soundtrack. Every crack&rsquo;s{" "}
                <em>birth</em> strikes a soft note whose pitch comes from its
                heading (read against a Lydian mode) and whose octave comes from
                how deep in the lineage it is — seed cracks ring low, distant
                descendants ring high. Every collision damps a quieter tone
                beneath a slow sub-bass drone.
              </p>
              <p>
                It is long-form: over a couple of minutes the plane fills, then
                dissolves over roughly twelve seconds and reseeds from scratch —
                so what you hear at minute five is a different glaze than at
                minute one. Tap anywhere to seed your own crack and nudge the
                growth.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
