"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  activeRingIndex,
  buildRings,
  buildSpokePath,
  CX,
  CY,
  ringBand,
  VIEW,
} from "./figure";
import { EnigmaDrone } from "./audio";
import { README_TEXT } from "./readme-text";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

// ════════════════════════════════════════════════════════════════════════════
// 2012 — Enigma Drift
//
// THE QUESTION: What if a completely STILL image streamed with motion generated
// by the viewer's own visual cortex — a drug-free perceptual hallucination —
// and that illusory motion was audible?
//
// A Leviant "Enigma" figure (concentric indigo/bone rings crossed by a dense
// field of fine radial spokes) sits nearly static in the SVG DOM, yet the rings
// appear to stream and rotate. That motion lives in your cortex, not the pixels.
// Holding your gaze on the centre dot deepens it; a flick of the pointer snaps
// it, like a saccade. Two oscillator banks a few Hz apart beat at the perceived
// streaming rate, so the shimmer you HEAR tracks the rotation you SEE.
//
// Substrate: SVG + CSS + Web Audio only. No canvas/WebGL. See README.md.
// ════════════════════════════════════════════════════════════════════════════

interface Driver {
  depth: number;
  lastMoveT: number;
  snapUntil: number;
  px: number;
  py: number;
  radius: number;
  activeIdx: number;
}

export default function EnigmaDriftPage() {
  const [ringCount, setRingCount] = useState(15);
  const [spokeCount, setSpokeCount] = useState(360);
  const [begun, setBegun] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const rings = useMemo(() => buildRings(ringCount), [ringCount]);
  const band = useMemo(() => ringBand(ringCount), [ringCount]);
  const spokeD = useMemo(() => buildSpokePath(spokeCount), [spokeCount]);

  // geometry the animation loop needs, kept fresh across control changes.
  const geomRef = useRef({ rings, band });
  useEffect(() => {
    geomRef.current = { rings, band };
  }, [rings, band]);

  // imperative handles (updated per frame — never via React state).
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const ringGroupRef = useRef<SVGGElement | null>(null);
  const driftGroupRef = useRef<SVGGElement | null>(null);
  const spokePathRef = useRef<SVGPathElement | null>(null);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const ringEls = useRef<(SVGCircleElement | null)[]>([]);
  const audioRef = useRef<EnigmaDrone | null>(null);

  const driver = useRef<Driver>({
    depth: 0.12,
    lastMoveT: -100,
    snapUntil: -100,
    px: 0,
    py: 0,
    radius: 0.4,
    activeIdx: 0,
  });

  // ── the illusion-driver engine (runs from mount so the piece self-demos) ──
  useEffect(() => {
    const reduced = prefersReducedMotion();
    const driftHz = reduced ? 0.05 : 0.12; // sub-0.2 Hz — a drift, never flicker
    const driftAmp = reduced ? 0.18 : 0.55; // degrees — near-static
    const lumHz = 0.09;
    const lumAmp = reduced ? 0.03 : 0.06;

    let raf = 0;
    let frame = 0;
    let lastT = performance.now() / 1000;

    const tick = (nowMs: number) => {
      const t = nowMs / 1000;
      const dt = Math.min(0.05, t - lastT);
      lastT = t;
      const D = driver.current;

      const still = t - D.lastMoveT > 0.4;
      const snapping = t < D.snapUntil;
      let target: number;
      let tau: number;
      if (snapping) {
        target = 0.08;
        tau = 0.25;
      } else if (still) {
        target = 1;
        tau = 4.5;
      } else {
        target = 0.32;
        tau = 1.5;
      }
      D.depth += (target - D.depth) * (1 - Math.exp(-dt / tau));
      const depth = D.depth;

      // slow phase drift of the spokes re-triggers the illusion.
      const angle = driftAmp * Math.sin(2 * Math.PI * driftHz * t);
      driftGroupRef.current?.setAttribute(
        "transform",
        `rotate(${angle.toFixed(3)} ${CX} ${CY})`,
      );

      // slow luminance drift + contrast that rises with fixation depth.
      const lum = 1 + lumAmp * Math.sin(2 * Math.PI * lumHz * t);
      const bright = (0.88 + depth * 0.42) * lum * (snapping ? 1.22 : 1);
      const contrast = 1 + depth * 0.7;
      if (ringGroupRef.current) {
        ringGroupRef.current.style.filter = `brightness(${bright.toFixed(3)}) contrast(${contrast.toFixed(3)})`;
      }
      if (spokePathRef.current) {
        spokePathRef.current.style.opacity = (0.5 + depth * 0.45).toFixed(3);
      }

      // brighten the active annulus (and its neighbours) under the pointer.
      const geom = geomRef.current;
      const n = geom.rings.length;
      for (let i = 0; i < n; i++) {
        const el = ringEls.current[i];
        if (!el) continue;
        const d = Math.abs(i - D.activeIdx);
        const near = d === 0 ? 1 : d === 1 ? 0.5 : 0;
        el.setAttribute(
          "stroke-width",
          (geom.band * (1 + near * 0.5)).toFixed(1),
        );
        el.setAttribute("opacity", (0.82 + near * 0.18).toFixed(2));
      }

      if (meterRef.current) {
        meterRef.current.style.width = `${(depth * 100).toFixed(1)}%`;
      }

      // couple the sound: perceived streaming → beat rate; radius → register.
      const a = audioRef.current;
      if (a) {
        if (frame % 4 === 0) a.setDepth(depth);
        if (frame % 12 === 0) a.setRegister(D.radius);
      }

      frame++;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── audio lifecycle: start the drone on the single "Begin" gesture ──
  useEffect(() => {
    if (!begun) return;
    const Ctor =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!Ctor) {
      setAudioError(
        "Web Audio is unavailable here — the illusion still works, silently.",
      );
      return;
    }
    let ctx: AudioContext | null = null;
    let drone: EnigmaDrone | null = null;
    try {
      ctx = new Ctor();
      void ctx.resume();
      drone = new EnigmaDrone(ctx);
      drone.start();
      drone.setMuted(muted);
      audioRef.current = drone;
    } catch {
      setAudioError(
        "Audio could not start — the illusion still works, silently.",
      );
    }
    return () => {
      drone?.stop();
      audioRef.current = null;
      void ctx?.close();
    };
    // muted is applied on start; its own effect handles later toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [begun]);

  // ── mute toggle ──
  useEffect(() => {
    audioRef.current?.setMuted(muted);
  }, [muted]);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    const D = driver.current;
    const t = performance.now() / 1000;
    const mag = Math.hypot(nx - D.px, ny - D.py);
    D.px = nx;
    D.py = ny;
    D.radius = Math.min(1, Math.hypot(nx, ny));
    D.activeIdx = activeRingIndex(D.radius, geomRef.current.rings.length);
    D.lastMoveT = t;
    if (mag > 0.09) D.snapUntil = t + 0.35; // a "saccade" snaps the illusion
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background">
      {/* header */}
      <div className="pointer-events-none absolute left-5 top-5 z-20 max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Enigma Drift
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Stare at the dot — the rings will begin to stream. The motion is made
          by your own visual cortex, and you can hear it.
        </p>
      </div>

      {/* the figure */}
      <div
        ref={wrapRef}
        onPointerMove={onPointerMove}
        className="relative flex aspect-square w-[min(92vw,92vh)] items-center justify-center"
      >
        <svg
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          className="h-full w-full touch-none select-none"
          aria-label="Leviant Enigma illusory-motion figure"
        >
          <defs>
            <radialGradient id="enigma-bg" cx="50%" cy="50%" r="72%">
              <stop offset="0%" stopColor="#101322" />
              <stop offset="100%" stopColor="#07080f" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={VIEW} height={VIEW} fill="url(#enigma-bg)" />

          {/* concentric duotone rings */}
          <g ref={ringGroupRef}>
            {rings.map((ring, i) => (
              <circle
                key={i}
                ref={(el) => {
                  ringEls.current[i] = el;
                }}
                cx={CX}
                cy={CY}
                r={ring.r}
                fill="none"
                stroke={ring.color}
                strokeWidth={band}
                opacity={0.9}
              />
            ))}
          </g>

          {/* dense radial spoke field (one path node) — this is what streams */}
          <g ref={driftGroupRef}>
            <path
              ref={spokePathRef}
              d={spokeD}
              stroke="#05060c"
              strokeWidth={1.15}
              fill="none"
              opacity={0.7}
            />
          </g>

          {/* fixation dot */}
          <circle cx={CX} cy={CY} r={7} fill="#e9e4d6" />
          <circle
            cx={CX}
            cy={CY}
            r={13}
            fill="none"
            stroke="#e9e4d6"
            strokeWidth={1.4}
            opacity={0.55}
          />
        </svg>
      </div>

      {/* streaming-depth meter */}
      <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 w-56 -translate-x-1/2">
        <div className="mb-1 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
          perceived streaming
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-border">
          <div
            ref={meterRef}
            className="h-full rounded-full bg-primary transition-none"
            style={{ width: "12%" }}
          />
        </div>
      </div>

      {/* controls */}
      <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-5 rounded-lg border border-border bg-background/70 px-5 py-3 backdrop-blur-sm">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-widest">
            spoke density · {spokeCount}
          </span>
          <input
            type="range"
            min={120}
            max={720}
            step={12}
            value={spokeCount}
            onChange={(e) => setSpokeCount(Number(e.target.value))}
            className="w-40 accent-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-widest">
            rings · {ringCount}
          </span>
          <input
            type="range"
            min={7}
            max={23}
            step={2}
            value={ringCount}
            onChange={(e) => setRingCount(Number(e.target.value))}
            className="w-40 accent-primary"
          />
        </label>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>

      {/* design-notes link */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-5 top-5 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {audioError && (
        <div className="absolute bottom-40 left-1/2 z-20 -translate-x-1/2 rounded-md border border-border bg-background/80 px-4 py-2 text-sm text-destructive backdrop-blur-sm">
          {audioError}
        </div>
      )}

      {/* Begin overlay (satisfies autoplay policy; visual already runs) */}
      {!begun && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/50 backdrop-blur-sm">
          <div className="max-w-lg rounded-lg border border-border bg-background p-6 text-center shadow-lg">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              A drug-free hallucination
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The figure is already streaming — that motion is generated by your
              own visual cortex, not the screen. Press Begin to add the beating
              drone whose shimmer tracks what you see, then stare at the centre
              dot and hold still.
            </p>
            <button
              type="button"
              onClick={() => setBegun(true)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          </div>
        </div>
      )}

      {/* notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {README_TEXT}
            </p>
            <button
              type="button"
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
