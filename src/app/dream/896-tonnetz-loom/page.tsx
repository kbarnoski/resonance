"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TonnetzEngine } from "./audio";
import {
  applyTransform,
  buildNodes,
  buildTriads,
  chordName,
  findTriad,
  PC_NAMES,
  type Chord,
  type Layout,
  type Triad,
} from "./tonnetz";

// 896-tonnetz-loom — WALK the geometry of harmony.
// The Euler/Riemann triangular pitch lattice (Tonnetz) rendered as inline SVG.
// Tap a triangle to hear its triad in just intonation; P/L/R neo-Riemannian
// transforms hop to an adjacent triad by moving exactly one voice; your path is
// drawn as a glowing ribbon and can be exported as a standalone .svg file.

// ── Lattice extent + screen layout ──────────────────────────────────────────
const I_MIN = -3;
const I_MAX = 3;
const J_MIN = -2;
const J_MAX = 2;
const BASE_PC = 0; // (0,0) = C

const VIEW_W = 760;
const VIEW_H = 560;

// Sheared basis: i-axis runs right; j-axis runs up-and-right → equilateral feel.
const LAYOUT: Layout = {
  ox: VIEW_W / 2,
  oy: VIEW_H / 2,
  ux: 104, // perfect-fifth axis (horizontal)
  uy: 0,
  vx: 52, // major-third axis (up-right)
  vy: -90,
};

type Visited = { triad: Triad; key: string };

export default function TonnetzLoomPage() {
  const [started, setStarted] = useState(false);
  const [drift, setDrift] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // The current chord (root pc + quality) is the source of truth; the matching
  // Triad is resolved spatially so the highlight stays local on the lattice.
  const [chord, setChord] = useState<Chord>({ rootPc: 0, quality: "major" });
  const [path, setPath] = useState<Visited[]>([]);
  const [lastMove, setLastMove] = useState<string>("tap a triangle");

  const engineRef = useRef<TonnetzEngine | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const driftRef = useRef(false);
  const chordRef = useRef<Chord>(chord);
  const lastCentroidRef = useRef<{ cx: number; cy: number } | null>(null);

  useEffect(() => {
    chordRef.current = chord;
  }, [chord]);
  useEffect(() => {
    driftRef.current = drift;
  }, [drift]);

  // Static geometry — computed once.
  const nodes = useMemo(
    () => buildNodes(I_MIN, I_MAX, J_MIN, J_MAX, BASE_PC, LAYOUT),
    [],
  );
  const triads = useMemo(
    () => buildTriads(I_MIN, I_MAX, J_MIN, J_MAX, BASE_PC, LAYOUT),
    [],
  );

  // The Triad currently highlighted (resolved from chord, near last centroid).
  const activeTriad = useMemo(
    () => findTriad(triads, chord, lastCentroidRef.current ?? undefined),
    [triads, chord],
  );

  // ── Sounding a chord (strike vs. glide for voice-leading) ──────────────────
  const sound = useCallback(
    (next: Chord, mode: "strike" | "glide") => {
      const engine = engineRef.current;
      const t = findTriad(triads, next, lastCentroidRef.current ?? undefined);
      if (t) lastCentroidRef.current = { cx: t.cx, cy: t.cy };

      if (engine) {
        const freqs = engine.freqsFor(next.rootPc, next.quality, 3);
        if (mode === "glide") engine.glideTo(freqs);
        else engine.strike(freqs);
      }
      setChord(next);
      if (t) {
        setPath((p) => {
          const key = `${t.rootPc}-${t.quality}-${t.i}-${t.j}`;
          if (p.length > 0 && p[p.length - 1].key === key) return p;
          const nextPath = [...p, { triad: t, key }];
          return nextPath.slice(-48); // cap ribbon length
        });
      }
    },
    [triads],
  );

  // ── Ensure audio is alive (gesture-gated, iOS-safe) ────────────────────────
  const ensureAudio = useCallback(async () => {
    if (!engineRef.current) {
      engineRef.current = new TonnetzEngine();
    }
    try {
      await engineRef.current.ctx.resume();
    } catch {
      /* ignore */
    }
  }, []);

  const handleTriad = useCallback(
    async (t: Triad) => {
      await ensureAudio();
      setStarted(true);
      lastCentroidRef.current = { cx: t.cx, cy: t.cy };
      setLastMove(`played ${chordName({ rootPc: t.rootPc, quality: t.quality })}`);
      sound({ rootPc: t.rootPc, quality: t.quality }, "strike");
    },
    [ensureAudio, sound],
  );

  const handleTransform = useCallback(
    async (which: "P" | "L" | "R") => {
      await ensureAudio();
      setStarted(true);
      const next = applyTransform(chordRef.current, which);
      setLastMove(
        `${which} → ${chordName(chordRef.current)} → ${chordName(next)}`,
      );
      sound(next, "glide");
    },
    [ensureAudio, sound],
  );

  // ── Drift: gentle hands-free P-L-R-L… walk ─────────────────────────────────
  useEffect(() => {
    if (!drift) return;
    let cancelled = false;
    const seq: ("P" | "L" | "R")[] = ["P", "L", "R", "L"];
    let k = 0;
    const tick = async () => {
      if (cancelled || !driftRef.current) return;
      await ensureAudio();
      const which = seq[k % seq.length];
      k++;
      const next = applyTransform(chordRef.current, which);
      setLastMove(`drift ${which} → ${chordName(next)}`);
      sound(next, "glide");
    };
    // kick off immediately so there's a sounding glance on toggle
    void tick();
    const id = setInterval(() => void tick(), 2200);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [drift, ensureAudio, sound]);

  // ── SVG export ─────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(VIEW_W));
    clone.setAttribute("height", String(VIEW_H));
    // dark background rect so the exported file reads on its own
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", String(VIEW_W));
    bg.setAttribute("height", String(VIEW_H));
    bg.setAttribute("fill", "#070611");
    clone.insertBefore(bg, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob(
      ['<?xml version="1.0" encoding="UTF-8"?>\n', xml],
      { type: "image/svg+xml" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tonnetz-loom-path-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, []);

  const clearPath = useCallback(() => {
    setPath([]);
    setLastMove("path cleared");
  }, []);

  // ── Teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      void engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Ribbon points (centroids of visited triads) as a smooth polyline.
  const ribbon = useMemo(
    () => path.map((v) => `${v.triad.cx.toFixed(1)},${v.triad.cy.toFixed(1)}`),
    [path],
  );

  const activeKey = activeTriad
    ? `${activeTriad.rootPc}-${activeTriad.quality}-${activeTriad.i}-${activeTriad.j}`
    : null;

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#070611] text-foreground">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <header>
          <h1 className="font-semibold text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            tonnetz loom
          </h1>
          <p className="mt-2 text-base text-foreground">
            Walk the geometry of <span className="text-violet-300">harmony</span>.
            Each node is a pitch; each triangle is a consonant triad. Tap one to
            hear it in <span className="text-violet-300">just intonation</span>,
            then move with the neo-Riemannian{" "}
            <span className="font-mono text-foreground">P / L / R</span> transforms —
            each glides exactly one voice. Your path is woven as a ribbon.
          </p>
          <p className="mt-1 font-mono text-base text-muted-foreground">
            after Euler&rsquo;s <span className="italic">Tonnetz</span> (1739)
            &middot; Cohn, neo-Riemannian theory &middot; Lewin, transformations
          </p>
        </header>

        {/* The lattice */}
        <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black/30">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="block h-auto w-full touch-manipulation select-none"
            role="img"
            aria-label="Tonnetz pitch lattice"
          >
            <defs>
              <radialGradient id="loomGlow" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#1a1335" />
                <stop offset="100%" stopColor="#070611" />
              </radialGradient>
              <filter id="loomBlur" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.2" />
              </filter>
            </defs>
            <rect width={VIEW_W} height={VIEW_H} fill="url(#loomGlow)" />

            {/* Tappable triads (filled triangles). Major = up, minor = down. */}
            <g>
              {triads.map((t) => {
                const key = `${t.rootPc}-${t.quality}-${t.i}-${t.j}`;
                const isActive = key === activeKey;
                const pts = t.poly
                  .map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)
                  .join(" ");
                const baseFill =
                  t.quality === "major"
                    ? "rgba(139,116,255,0.05)"
                    : "rgba(96,165,250,0.04)";
                return (
                  <polygon
                    key={key}
                    points={pts}
                    fill={isActive ? "rgba(167,139,250,0.34)" : baseFill}
                    stroke={
                      isActive ? "rgba(196,181,253,0.9)" : "rgba(255,255,255,0.10)"
                    }
                    strokeWidth={isActive ? 2.2 : 1}
                    style={{ cursor: "pointer" }}
                    onPointerDown={() => void handleTriad(t)}
                  >
                    <title>
                      {chordName({ rootPc: t.rootPc, quality: t.quality })}
                    </title>
                  </polygon>
                );
              })}
            </g>

            {/* Path ribbon — glowing polyline over the lattice */}
            {ribbon.length >= 2 ? (
              <g>
                <polyline
                  points={ribbon.join(" ")}
                  fill="none"
                  stroke="rgba(167,139,250,0.55)"
                  strokeWidth={9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#loomBlur)"
                />
                <polyline
                  points={ribbon.join(" ")}
                  fill="none"
                  stroke="rgba(221,214,254,0.95)"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ) : null}

            {/* Path step dots */}
            <g>
              {path.map((v, idx) => (
                <circle
                  key={`dot-${v.key}-${idx}`}
                  cx={v.triad.cx}
                  cy={v.triad.cy}
                  r={idx === path.length - 1 ? 4.5 : 2.6}
                  fill={
                    idx === path.length - 1
                      ? "rgba(255,255,255,0.95)"
                      : "rgba(221,214,254,0.8)"
                  }
                />
              ))}
            </g>

            {/* Nodes + labels */}
            <g>
              {nodes.map((n) => (
                <g key={`n-${n.i}-${n.j}`}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={15}
                    fill="#0c0a1f"
                    stroke="rgba(196,181,253,0.45)"
                    strokeWidth={1.4}
                  />
                  <text
                    x={n.x}
                    y={n.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={14}
                    fontWeight={600}
                    fill="rgba(255,255,255,0.96)"
                    style={{ pointerEvents: "none" }}
                  >
                    {PC_NAMES[n.pc]}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </div>

        {/* Status line */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-base">
          <span className="text-muted-foreground">
            current:{" "}
            <span className="text-violet-300/95">{chordName(chord)}</span>
          </span>
          <span className="text-muted-foreground">
            move: <span className="text-violet-300">{lastMove}</span>
          </span>
          <span className="text-muted-foreground">
            steps: <span className="text-foreground">{path.length}</span>
          </span>
        </div>

        {/* P / L / R transforms */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["P", "parallel — third moves (maj↔min)"],
                ["L", "leading-tone — root moves"],
                ["R", "relative — fifth moves"],
              ] as const
            ).map(([w, label]) => (
              <button
                key={w}
                onClick={() => void handleTransform(w)}
                className="flex min-h-[44px] flex-col items-center justify-center rounded-lg bg-violet-500/15 px-4 py-2.5 text-violet-200 ring-1 ring-violet-300/40 transition hover:bg-violet-500/25"
              >
                <span className="font-mono text-xl font-semibold">{w}</span>
                <span className="mt-0.5 text-center text-base leading-tight text-muted-foreground">
                  {label}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setDrift((d) => !d)}
              className={`min-h-[44px] rounded-lg px-4 py-2.5 font-mono text-base ring-1 transition ${
                drift
                  ? "bg-violet-500/20 text-violet-200 ring-violet-300/40 hover:bg-violet-500/30"
                  : "bg-muted text-foreground ring-border hover:bg-accent"
              }`}
            >
              {drift ? "■ drift on" : "▶ drift (auto-walk)"}
            </button>
            <button
              onClick={handleExport}
              className="min-h-[44px] rounded-lg bg-muted px-4 py-2.5 font-mono text-base text-foreground ring-1 ring-border transition hover:bg-accent"
            >
              ⤓ export SVG
            </button>
            <button
              onClick={clearPath}
              className="min-h-[44px] rounded-lg px-4 py-2.5 font-mono text-base text-muted-foreground ring-1 ring-border transition hover:bg-accent hover:text-foreground"
            >
              clear path
            </button>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-lg px-4 py-2.5 font-mono text-base text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
            >
              design notes
            </button>
            <Link
              href="/dream"
              className="font-mono text-base text-muted-foreground underline underline-offset-4 hover:text-muted-foreground"
            >
              ← gallery
            </Link>
          </div>

          {!started ? (
            <p className="text-base text-muted-foreground">
              Audio starts on your first tap (covers iOS autoplay). Tap any
              triangle, then move with P / L / R — or hit{" "}
              <span className="text-violet-300">drift</span> to hear it walk
              itself.
            </p>
          ) : null}
        </div>
      </div>

      {/* Design-notes panel */}
      {showNotes ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[82vh] max-w-xl overflow-y-auto rounded-lg border border-border bg-[#0b0a16] p-6 text-foreground">
            <div className="mb-3 flex items-start justify-between gap-4">
              <h2 className="font-semibold text-xl text-foreground">design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md px-4 py-2.5 font-mono text-base text-violet-300 hover:text-violet-200"
              >
                close ✕
              </button>
            </div>
            <div className="space-y-3 text-base leading-relaxed">
              <p>
                <span className="text-foreground">The lattice.</span> The Tonnetz is
                a triangular pitch-class grid. Horizontally each step is a perfect
                fifth (+7 semitones); the up-right axis is a major third (+4); the
                remaining edge is a minor third (+3, since 7&minus;4=3).
                Up-pointing triangles are <span className="text-violet-300">major</span>{" "}
                triads, down-pointing are <span className="text-violet-300">minor</span>.
              </p>
              <p>
                <span className="text-foreground">Just intonation.</span> Each triad
                is sounded from pure ratios on its root — major{" "}
                <span className="font-mono">4:5:6</span>, minor{" "}
                <span className="font-mono">10:12:15</span> — so the thirds are
                truly consonant, not the tempered approximation. Two detuned
                triangle oscillators per voice → soft envelope → procedural
                convolution reverb → compressor/limiter → out.
              </p>
              <p>
                <span className="text-foreground">P / L / R voice-leading.</span> Each
                neo-Riemannian transform flips quality and moves exactly{" "}
                <span className="text-violet-300">one voice</span> by a small step
                while two common tones hold: <span className="font-mono">P</span>{" "}
                (parallel) moves the third a semitone (C maj↔C min);{" "}
                <span className="font-mono">L</span> (leading-tone) moves the root
                a semitone (C maj↔E min); <span className="font-mono">R</span>{" "}
                (relative) moves the fifth a whole tone (C maj↔A min). The engine{" "}
                <span className="italic">glides</span> the oscillators rather than
                re-striking, so you hear the single moving voice.
              </p>
              <p>
                <span className="text-foreground">The loom.</span> Every visited
                triad appends its centroid to a glowing ribbon over the lattice,
                exportable as a standalone <span className="font-mono">.svg</span>{" "}
                (lattice + your path) via Blob + object URL.
              </p>
              <p>
                <span className="text-foreground">Lineage.</span> Leonhard Euler,{" "}
                <span className="italic">Tonnetz</span> (1739); Richard Cohn,
                neo-Riemannian theory (the P/L/R group); David Lewin,
                transformational theory. Anchored to{" "}
                <span className="font-mono text-muted-foreground">
                  RESEARCH §533 (2026-06-24)
                </span>
                .
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
