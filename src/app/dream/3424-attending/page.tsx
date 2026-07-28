"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { AudioCleanup } from "../_shared/audio-cleanup";
import { useMicAnalyser } from "../_shared/use-mic-analyser";
import { AttendingAudio } from "./audio";
import {
  applyBloom,
  centroidToFocus,
  FIELD_DETUNES,
  FIELD_FREQS,
  makeAutopilot,
  makeField,
  stepAutopilot,
  type Glyph,
} from "./field";

// ════════════════════════════════════════════════════════════════════════════
// 3424 — attending
// A living phyllotaxis field of voice-glyphs. Wherever attention settles,
// nearby glyphs brighten, unfurl, and rise from a hum-floor into a fuller voice.
// Moving away subtracts nothing. No score, no decay, no fail-state — adding only
// ever adds. Rendered as inline SVG. See README.md.
// ════════════════════════════════════════════════════════════════════════════

type Phase = "idle" | "running" | "unavailable";
type Source = "mic" | "pointer" | "tending";

const PETALS = 6;
const PETAL_TRANSFORMS = Array.from({ length: PETALS }, (_, k) => {
  const deg = (360 / PETALS) * k;
  return `rotate(${deg}) translate(0 -9)`;
});

const NOTES: { h: string; p: string }[] = [
  {
    h: "The one question",
    p: "What if attention were a gift that grows things — and nothing you ever noticed could be lost? Wherever your attention settles, nearby glyphs brighten, unfurl, and rise from a resting hum into a fuller voice. Move your attention away and it subtracts nothing: each glyph keeps everything it was ever given and holds at its earned brightness, humming on.",
  },
  {
    h: "The inverse of forgetting",
    p: "This is the deliberate emotional inverse of a working-memory piece where every new note steals attention from the ones already held (retroactive interference — Miller's \"seven, plus or minus two,\" 1956). Here the governing scalar per glyph is monotonic and non-decreasing: adding only ever adds. There is no score, no timer, no eviction, no wrong move, no win or lose.",
  },
  {
    h: "How it's built",
    p: "About 37 glyphs are packed on a golden-angle (137.5°) phyllotaxis spiral — Vogel's model of how a sunflower seats its seeds. Each glyph is one soft additive voice at a continuous, un-snapped frequency; its gain is a quiet floor plus bloom times fuller, so blooming thickens a slow evolving drone (a nod to Brian Eno's generative ambient — music that makes itself). All of it lives in your attentional periphery at low cognitive load — calm technology, in Weiser & Brown's sense.",
  },
  {
    h: "Attention, and the constellation",
    p: "Presence in the room is the preferred input: your mic's loudness sets how strongly the focused region blooms, and its spectral centroid chooses which region. Denied the mic, it falls to your pointer; given neither, a seeded wander tends the least-bloomed places on its own. Faint lines connect glyphs in the order they were first noticed, so the shape of your attention accretes as a growing constellation.",
  },
  {
    h: "Named references",
    p: "Weiser & Brown, \"The Coming Age of Calm Technology\" (1996), on information in the attentional periphery — recently restated by Hubenschmid et al., \"Ambient Analytics: Calm Technology\" (arXiv:2602.19809, Feb 2026). Brian Eno on generative ambient. Vogel's phyllotaxis / golden-angle packing. Framed as the positive inverse of retroactive interference (Miller, 1956): adding without cost.",
  },
];

export default function AttendingPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<Source>("tending");
  const [micDenied, setMicDenied] = useState(false);
  const [muted, setMuted] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const mic = useMicAnalyser();
  const getFrameRef = useRef(mic.getFrame);
  getFrameRef.current = mic.getFrame;

  const glyphsRef = useRef<Glyph[]>(makeField());
  const autopilotRef = useRef(makeAutopilot());
  const noticedRef = useRef<number[]>([]);
  const audioRef = useRef<AttendingAudio | null>(null);

  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  const pointerRef = useRef({ x: 0, y: 0, active: false, lastMove: 0 });

  const glowRefs = useRef<(SVGCircleElement | null)[]>([]);
  const petalRefs = useRef<(SVGGElement | null)[]>([]);
  const coreRefs = useRef<(SVGCircleElement | null)[]>([]);
  const polyRef = useRef<SVGPolylineElement | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const lastNoticedLenRef = useRef(0);
  const lastSourceSyncRef = useRef(0);

  // ── the whole loop: visuals run from mount; blooming + audio only when running.
  useEffect(() => {
    const step = () => {
      const now = performance.now();
      const dt =
        lastFrameRef.current > 0
          ? Math.min(0.05, (now - lastFrameRef.current) / 1000)
          : 0.016;
      lastFrameRef.current = now;

      const glyphs = glyphsRef.current;
      const ap = autopilotRef.current;
      const noticed = noticedRef.current;

      let liveSource: Source = "tending";

      if (phaseRef.current === "running") {
        stepAutopilot(ap, glyphs, now, dt);

        // Which source is attending right now? Pointer wins, then mic presence.
        let liveFx = 0;
        let liveFy = 0;
        let liveStrength = 0;
        const p = pointerRef.current;
        if (p.active && now - p.lastMove < 260) {
          liveFx = p.x;
          liveFy = p.y;
          liveStrength = 0.95;
          liveSource = "pointer";
        } else {
          const frame = getFrameRef.current();
          if (frame && frame.amplitude > 0.02) {
            const f = centroidToFocus(glyphs, frame.centroid);
            liveFx = f.fx;
            liveFy = f.fy;
            liveStrength = Math.min(1.4, frame.amplitude * 3.2);
            liveSource = "mic";
          }
        }

        // Autopilot always tends the field — a weak trickle when a live source
        // is present, full strength when the room is quiet and untouched.
        applyBloom(glyphs, ap.fx, ap.fy, liveStrength > 0 ? 0.16 : 0.72, dt, now, noticed);
        if (liveStrength > 0) {
          applyBloom(glyphs, liveFx, liveFy, liveStrength, dt, now, noticed);
        }

        audioRef.current?.update(glyphs);

        if (now - lastSourceSyncRef.current > 350) {
          lastSourceSyncRef.current = now;
          setSource((prev) => (prev === liveSource ? prev : liveSource));
        }
      }

      // ── render (inline SVG, attribute writes only — no per-frame React) ──
      const breathHz = 0.12;
      const bt = now * 0.001 * Math.PI * 2 * breathHz;
      for (const g of glyphs) {
        const breath = Math.sin(bt + g.breathPhase);
        const b = g.bloom;

        const glow = glowRefs.current[g.i];
        if (glow) {
          glow.setAttribute("r", (7 + b * 26).toFixed(2));
          glow.setAttribute(
            "opacity",
            (0.04 + b * 0.42 + breath * (0.02 + b * 0.05)).toFixed(3),
          );
        }
        const petals = petalRefs.current[g.i];
        if (petals) {
          const s = 0.34 + b * 0.95 + breath * 0.03 * (0.3 + b);
          petals.setAttribute("transform", `scale(${s.toFixed(3)})`);
          petals.setAttribute("opacity", (0.12 + b * 0.7).toFixed(3));
        }
        const core = coreRefs.current[g.i];
        if (core) {
          core.setAttribute("r", (2.4 + b * 5.6).toFixed(2));
          // violet ramp: darker at rest, luminous when tended. Slow drift only.
          core.setAttribute("fill", `hsl(272 74% ${38 + b * 40}%)`);
        }
      }

      // constellation: rebuild the polyline only when a new glyph is noticed.
      if (noticed.length !== lastNoticedLenRef.current && polyRef.current) {
        lastNoticedLenRef.current = noticed.length;
        const pts = noticed
          .map((idx) => {
            const g = glyphs[idx];
            return `${g.x.toFixed(1)},${g.y.toFixed(1)}`;
          })
          .join(" ");
        polyRef.current.setAttribute("points", pts);
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Teardown: stop oscillators + close context on unmount. (Mic hook stops itself.)
  useEffect(() => {
    return () => {
      void audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  // Surface a mic denial as a calm note once the hook reports an error.
  useEffect(() => {
    if (mic.error) setMicDenied(true);
  }, [mic.error]);

  const handleBegin = useCallback(async () => {
    const audio = new AttendingAudio();
    if (!audio.available) {
      setPhase("unavailable");
      return;
    }
    audioRef.current = audio;
    const glyphs = glyphsRef.current;
    audio.start(FIELD_FREQS(glyphs), FIELD_DETUNES(glyphs));
    setPhase("running");
    // Mic is preferred but optional — start() resolves without throwing on deny.
    try {
      await mic.start();
    } catch {
      setMicDenied(true);
    }
  }, [mic]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const toSvgPoint = useCallback((clientX: number, clientY: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 600,
      y: ((clientY - rect.top) / rect.height) * 600,
    };
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (phaseRef.current !== "running") return;
      const pt = toSvgPoint(e.clientX, e.clientY, e.currentTarget);
      const p = pointerRef.current;
      p.x = pt.x;
      p.y = pt.y;
      p.active = true;
      p.lastMove = performance.now();
    },
    [toSvgPoint],
  );

  const handlePointerLeave = useCallback(() => {
    pointerRef.current.active = false;
  }, []);

  const sourceLabel =
    source === "mic"
      ? "listening to the room"
      : source === "pointer"
        ? "attending where you point"
        : "tending itself";

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-background px-4 py-10 text-foreground">
      <AudioCleanup />

      <button
        type="button"
        onClick={() => setNotesOpen(true)}
        className="fixed right-3 top-3 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      <header className="mb-6 max-w-xl text-center">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          A field that only ever grows
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">attending</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Wherever your attention settles, the field blooms — and moving away
          takes nothing back. Nothing you notice here can ever be lost.
        </p>
      </header>

      <div className="relative w-full max-w-[min(86vw,560px)]">
        <svg
          viewBox="0 0 600 600"
          className="w-full touch-none"
          role="img"
          aria-label="A golden-angle spiral of soft voice-glyphs that bloom where attention settles"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          {/* constellation memory — the order attention noticed things */}
          <polyline
            ref={polyRef}
            fill="none"
            stroke="hsl(276 80% 70%)"
            strokeOpacity={0.16}
            strokeWidth={1}
            strokeLinejoin="round"
          />
          {glyphsRef.current.map((g) => (
            <g key={g.i} transform={`translate(${g.x.toFixed(1)} ${g.y.toFixed(1)})`}>
              <circle
                ref={(el) => {
                  glowRefs.current[g.i] = el;
                }}
                r={7}
                fill="hsl(276 90% 68%)"
                opacity={0.04}
              />
              <g
                ref={(el) => {
                  petalRefs.current[g.i] = el;
                }}
                transform="scale(0.34)"
                opacity={0.12}
              >
                {PETAL_TRANSFORMS.map((tf, k) => (
                  <ellipse
                    key={k}
                    cx={0}
                    cy={0}
                    rx={2.4}
                    ry={6}
                    transform={tf}
                    fill="hsl(270 68% 62%)"
                    fillOpacity={0.5}
                  />
                ))}
              </g>
              <circle
                ref={(el) => {
                  coreRefs.current[g.i] = el;
                }}
                r={2.4}
                fill="hsl(272 74% 38%)"
              />
            </g>
          ))}
        </svg>

        {phase === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-lg bg-background/70 backdrop-blur-sm">
            <p className="max-w-xs px-6 text-center text-base text-muted-foreground">
              Sound needs your go-ahead. Begin, and the field starts to hum —
              speak or hum into the mic to tend it, or just watch it tend itself.
            </p>
            <button
              type="button"
              onClick={handleBegin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          </div>
        )}

        {phase === "unavailable" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/80 px-6 text-center">
            <p className="text-base text-destructive">
              Web Audio isn&apos;t available in this browser.
            </p>
            <p className="text-sm text-muted-foreground">
              The field needs an AudioContext to sing. Try a current desktop browser.
            </p>
          </div>
        )}
      </div>

      {phase === "running" && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {sourceLabel}
          </p>
          {micDenied && (
            <p className="max-w-sm text-center text-sm text-destructive">
              Microphone unavailable — no matter. Move your pointer over the field
              to lend attention, or let it tend itself. Nothing is lost either way.
            </p>
          )}
          <button
            type="button"
            onClick={toggleMute}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {muted ? "Unmute the field" : "Mute the field"}
          </button>
        </div>
      )}

      {notesOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-4 space-y-4">
              {NOTES.map((n) => (
                <div key={n.h}>
                  <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {n.h}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {n.p}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["3416-baton", "3392-longnow", "3248-crowd"]} />
    </main>
  );
}
