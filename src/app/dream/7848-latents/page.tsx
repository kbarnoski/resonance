"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 7848-latents — "Latents"
//
// THE ONE QUESTION: what if you don't play notes — you DISCOVER the hidden axes
// of a sound-world by ear, then compose by moving along the ones you found?
//
// A continuous 2D latent field (field.ts) maps every position to timbre /
// harmony / rhythm through smooth seeded Gaussians. The axes are NOT labelled.
// You drag a token to explore; when a spot sings you drop a marker (click). Your
// markers trace a closed path; pressing play loops the token along it and the
// path becomes a repeating phrase — a structure YOU authored by ear.
//
// Hand-built, no-ML realisation of "Discovering and Steering Interpretable
// Concepts in Large Generative Music Models" (arXiv:2505.18186): discover
// interpretable concept directions, then steer along the ones you found.
//
// SUBSTRATE: inline <svg> only. The field is a blurred grid of <rect> cells on a
// violet ramp; token, markers and path are SVG primitives. No <canvas>, no WebGL.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  discoverFeatures,
  makeField,
  type FieldSample,
  type Point,
} from "./field";
import { buildLoop, crossedVertices, pointAtPhase, type Loop } from "./path";
import { AudioEngine } from "./audio";
import { createExplorer, roamAt, type Explorer } from "./demo";

const VIEW = 100;
const GRID = 24;
const CELL = VIEW / GRID;

// ── Art-layer colours (SVG only — hex allowed here, violet ramp) ─────────────
const C_TOKEN = "#ddd6fe"; // violet-200
const C_TOKEN_RING = "#8b5cf6"; // violet-500
const C_MARKER = "#c4b5fd"; // violet-300
const C_PATH = "#a78bfa"; // violet-400

type Mode = "demo" | "manual" | "playing";

interface Cell {
  x: number;
  y: number;
  fill: string;
}

function cellColor(s: FieldSample): string {
  // hue fixed at violet 270; brightness → lightness, density → saturation.
  const light = 9 + s.brightness * 63;
  const sat = 26 + s.density * 56;
  return `hsl(270 ${sat.toFixed(0)}% ${light.toFixed(0)}%)`;
}

export default function LatentsPage() {
  const [markers, setMarkers] = useState<Point[]>([]);
  const [playing, setPlaying] = useState(false);
  const [tempo, setTempo] = useState(6); // seconds per loop
  const [mode, setMode] = useState<Mode>("demo");
  const [started, setStarted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState<FieldSample>({
    brightness: 0.5,
    tension: 0.3,
    pulse: 0.3,
    density: 0.5,
    pitch: 0.5,
  });

  // ── One shared field + its seeded explorer (deterministic 0x7848) ──────────
  const field = useMemo(() => makeField(0x7848), []);
  const explorer = useMemo<Explorer>(() => createExplorer(field), [field]);

  // Static field mesh — computed once, drawn as SVG rects.
  const cells = useMemo<Cell[]>(() => {
    const out: Cell[] = [];
    for (let iy = 0; iy < GRID; iy++) {
      for (let ix = 0; ix < GRID; ix++) {
        const s = field.sample((ix + 0.5) / GRID, (iy + 0.5) / GRID);
        out.push({ x: ix * CELL, y: iy * CELL, fill: cellColor(s) });
      }
    }
    return out;
  }, [field]);

  // ── Refs mirroring state for the single rAF loop ───────────────────────────
  const svgRef = useRef<SVGSVGElement | null>(null);
  const tokenRef = useRef<SVGGElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);

  const markersRef = useRef<Point[]>([]);
  const playingRef = useRef(false);
  const tempoRef = useRef(6);
  const startedRef = useRef(false);
  const loopRef = useRef<Loop | null>(null);
  const phaseRef = useRef(0);

  const demoActiveRef = useRef(true);
  const demoStartRef = useRef<number>(0);
  const revealedRef = useRef(0);
  const tokenPosRef = useRef<Point>({ x: 0.5, y: 0.5 });
  const lastFrameRef = useRef<number>(0);
  const lastReadoutRef = useRef<number>(0);

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    tempoRef.current = tempo;
  }, [tempo]);

  // Rebuild the loop whenever the authored markers / play state change.
  useEffect(() => {
    loopRef.current = buildLoop(markers);
  }, [markers, playing]);

  // ── Token render helper (mutates SVG directly — not a hook) ────────────────
  const drawToken = useCallback((p: Point) => {
    tokenPosRef.current = p;
    const g = tokenRef.current;
    if (g) g.setAttribute("transform", `translate(${p.x * VIEW} ${p.y * VIEW})`);
  }, []);

  const readAndVoice = useCallback(
    (p: Point, now: number) => {
      const s = field.sample(p.x, p.y);
      engineRef.current?.setField(s);
      if (now - lastReadoutRef.current > 110) {
        lastReadoutRef.current = now;
        setReadout(s);
      }
    },
    [field],
  );

  // ── The single animation loop: demo → playback → manual ────────────────────
  useEffect(() => {
    const step = (now: number) => {
      if (!demoStartRef.current) demoStartRef.current = now;
      const dtRaw = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0;
      lastFrameRef.current = now;
      const dt = Math.min(0.05, dtRaw);

      if (demoActiveRef.current) {
        // ── Seeded self-demo: roam, reveal markers, then hand off to play ────
        const elapsed = (now - demoStartRef.current) / 1000;
        const p = elapsed / explorer.exploreSeconds;
        if (p < 1) {
          const { pos, index } = roamAt(explorer.roam, p);
          drawToken(pos);
          readAndVoice(pos, now);
          // reveal any marker whose roam index we've now reached
          let reveal = revealedRef.current;
          while (
            reveal < explorer.revealAt.length &&
            index >= explorer.revealAt[reveal]
          ) {
            reveal++;
          }
          if (reveal !== revealedRef.current) {
            revealedRef.current = reveal;
            setMarkers(explorer.markers.slice(0, reveal));
          }
        } else {
          // hand off: the discovered path becomes the loop, playback begins
          demoActiveRef.current = false;
          revealedRef.current = explorer.markers.length;
          setMarkers(explorer.markers.slice());
          loopRef.current = buildLoop(explorer.markers);
          phaseRef.current = 0;
          playingRef.current = true;
          setPlaying(true);
          setMode("playing");
        }
      } else if (playingRef.current && loopRef.current) {
        // ── Sequencer: travel the authored loop, fire notes at markers ───────
        const loop = loopRef.current;
        const prev = phaseRef.current;
        const next = prev + dt / Math.max(1.2, tempoRef.current);
        phaseRef.current = next % 1;
        const hits = crossedVertices(loop, prev % 1, phaseRef.current);
        for (const hi of hits) {
          const mk = markersRef.current[hi % markersRef.current.length];
          if (mk) engineRef.current?.pluck(field.sample(mk.x, mk.y));
        }
        const pos = pointAtPhase(loop, phaseRef.current);
        drawToken(pos);
        readAndVoice(pos, now);
      } else {
        // ── Manual: token rests where the user left it, still voiced ─────────
        readAndVoice(tokenPosRef.current, now);
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // Loop reads everything through refs; deps are the stable helpers only.
  }, [explorer, field, drawToken, readAndVoice]);

  // ── Teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const engine = engineRef;
    return () => {
      cancelAnimationFrame(rafRef.current);
      void engine.current?.dispose();
      engine.current = null;
    };
  }, []);

  // Space toggles play/pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // togglePlay is stable via refs/setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Audio + interaction ────────────────────────────────────────────────────
  const ensureAudio = useCallback(async () => {
    if (startedRef.current) return;
    try {
      if (!engineRef.current) engineRef.current = new AudioEngine();
      await engineRef.current.start();
      startedRef.current = true;
      setStarted(true);
      setAudioBlocked(false);
    } catch {
      setAudioBlocked(true);
    }
  }, []);

  const cancelDemo = useCallback(() => {
    if (!demoActiveRef.current && mode !== "demo") return;
    demoActiveRef.current = false;
    playingRef.current = false;
    setPlaying(false);
    setMode("manual");
  }, [mode]);

  const clientToField = useCallback((clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0.5, y: 0.5 };
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return { x: clamp01(x), y: clamp01(y) };
  }, []);

  const downPosRef = useRef<Point | null>(null);
  const movedRef = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      void ensureAudio();
      cancelDemo();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const p = clientToField(e.clientX, e.clientY);
      downPosRef.current = p;
      movedRef.current = false;
      drawToken(p);
      readAndVoice(p, performance.now());
    },
    [ensureAudio, cancelDemo, clientToField, drawToken, readAndVoice],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!downPosRef.current) return;
      const p = clientToField(e.clientX, e.clientY);
      const d0 = downPosRef.current;
      if (Math.hypot(p.x - d0.x, p.y - d0.y) > 0.012) movedRef.current = true;
      drawToken(p);
      readAndVoice(p, performance.now());
    },
    [clientToField, drawToken, readAndVoice],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const p = clientToField(e.clientX, e.clientY);
      if (downPosRef.current && !movedRef.current) {
        // a click (no drag) drops a marker at that spot
        setMarkers((m) => [...m, p]);
      }
      downPosRef.current = null;
    },
    [clientToField],
  );

  const dropMarkerAtToken = useCallback(() => {
    void ensureAudio();
    cancelDemo();
    setMarkers((m) => [...m, { ...tokenPosRef.current }]);
  }, [ensureAudio, cancelDemo]);

  const togglePlay = useCallback(() => {
    void ensureAudio();
    if (demoActiveRef.current) cancelDemo();
    setPlaying((prev) => {
      const next = !prev;
      if (next && markersRef.current.length >= 2) {
        loopRef.current = buildLoop(markersRef.current);
        playingRef.current = true;
        setMode("playing");
        return true;
      }
      playingRef.current = false;
      setMode("manual");
      return false;
    });
  }, [ensureAudio, cancelDemo]);

  const clearAll = useCallback(() => {
    cancelDemo();
    revealedRef.current = 0;
    phaseRef.current = 0;
    loopRef.current = null;
    playingRef.current = false;
    setPlaying(false);
    setMarkers([]);
    setMode("manual");
  }, [cancelDemo]);

  const seedDiscover = useCallback(() => {
    void ensureAudio();
    cancelDemo();
    const found = discoverFeatures(field, 5, 0.2);
    revealedRef.current = found.length;
    setMarkers(found);
  }, [ensureAudio, cancelDemo, field]);

  // Path polylines (viewBox coords). Authored (open) + closed loop when playing.
  const markerPts = markers.map((m) => `${m.x * VIEW},${m.y * VIEW}`).join(" ");
  const loopPts =
    markers.length >= 2
      ? markers
          .concat([markers[0]])
          .map((m) => `${m.x * VIEW},${m.y * VIEW}`)
          .join(" ")
      : "";

  const modeLabel =
    mode === "demo"
      ? "self-demo · discovering"
      : mode === "playing"
        ? "looping your path"
        : "exploring";

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          7848 · latents
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Latents
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Don&apos;t play notes — discover the hidden axes of a sound-world by
          ear, then compose by moving along the ones you found. Drag to explore,
          click to mark a spot that sings, then press play to loop your path into
          a phrase.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* ── The latent field (inline SVG only) ─────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="relative w-full overflow-hidden rounded-lg border border-border bg-background">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW} ${VIEW}`}
              className="block aspect-square w-full touch-none select-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              role="application"
              aria-label="Latent sound-field. Drag to explore, click to drop a marker."
            >
              <defs>
                <filter id="latents-mesh" x="-5%" y="-5%" width="110%" height="110%">
                  <feGaussianBlur stdDeviation="2.1" />
                </filter>
                <radialGradient id="latents-token" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={C_TOKEN} stopOpacity="1" />
                  <stop offset="100%" stopColor={C_TOKEN} stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* soft field mesh */}
              <g filter="url(#latents-mesh)">
                {cells.map((c, i) => (
                  <rect
                    key={i}
                    x={c.x - 0.4}
                    y={c.y - 0.4}
                    width={CELL + 0.8}
                    height={CELL + 0.8}
                    fill={c.fill}
                  />
                ))}
              </g>

              {/* authored path */}
              {loopPts && (
                <polyline
                  points={playing ? loopPts : markerPts}
                  fill="none"
                  stroke={C_PATH}
                  strokeOpacity={playing ? 0.9 : 0.55}
                  strokeWidth={0.7}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={playing ? undefined : "2 2"}
                />
              )}

              {/* markers */}
              {markers.map((m, i) => (
                <g key={i} transform={`translate(${m.x * VIEW} ${m.y * VIEW})`}>
                  <circle r={2.6} fill="none" stroke={C_MARKER} strokeWidth={0.6} strokeOpacity={0.9} />
                  <circle r={1.3} fill={C_MARKER} />
                  <text
                    y={-3.4}
                    textAnchor="middle"
                    fontSize={3}
                    fill={C_MARKER}
                    fontFamily="monospace"
                  >
                    {i + 1}
                  </text>
                </g>
              ))}

              {/* the exploring token */}
              <g ref={tokenRef} transform="translate(50 50)">
                <circle r={5} fill="url(#latents-token)" />
                <circle r={2.1} fill={C_TOKEN} stroke={C_TOKEN_RING} strokeWidth={0.8} />
              </g>
            </svg>
          </div>

          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {modeLabel}
            {!started && " · sound waits for your first tap"}
            {audioBlocked && " · audio blocked — visuals continue"}
          </p>
        </div>

        {/* ── Controls + discovered qualities ─────────────────────────────── */}
        <aside className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {playing ? "Pause" : "Play path"}
            </button>
            <button
              type="button"
              onClick={dropMarkerAtToken}
              className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Drop marker
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={seedDiscover}
              className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Auto-discover
            </button>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              loop · {tempo.toFixed(1)}s
            </span>
            <input
              type="range"
              min={2}
              max={12}
              step={0.5}
              value={tempo}
              onChange={(e) => setTempo(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </label>

          <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-3">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              qualities here · found by ear
            </span>
            <Meter label="bright" value={readout.brightness} />
            <Meter label="tension" value={readout.tension} />
            <Meter label="pulse" value={readout.pulse} />
            <Meter label="density" value={readout.density} />
            <Meter label="pitch" value={readout.pitch} />
          </div>

          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="self-start font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Design notes
          </button>
        </aside>
      </div>

      {showNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Discover the axes, don&apos;t read them
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The field is a continuous 2D sound-world. Every position maps —
                through smooth sums of seeded 2D Gaussians — to filter cutoff,
                chord character (major → minor → cluster), tremolo rate, pad
                density and root pitch. The two spatial axes are deliberately{" "}
                <em>unlabelled</em>: you find the bright regions, consonant
                valleys and pulsing zones by ear, then mark them.
              </p>
              <p>
                Your markers, in order, trace a closed path. Press play and the
                token loops along it, reading the field continuously and firing a
                note at each marker. The loop is a phrase{" "}
                <em>you authored by exploring</em>, not one shown to you.
              </p>
              <p>
                This is a hand-built, no-ML realisation of{" "}
                <span className="text-foreground">
                  &ldquo;Discovering and Steering Interpretable Concepts in Large
                  Generative Music Models&rdquo; (arXiv:2505.18186)
                </span>{" "}
                and the ICLR-2026 steering work (arXiv:2510.19127): control a
                generative sound-space by discovering interpretable concept
                directions and steering along the ones you found. The smooth
                parameter map is the stand-in for those latent directions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 inline-flex min-h-[44px] items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["7848-latents"]} />
    </main>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-100"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </span>
    </div>
  );
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
