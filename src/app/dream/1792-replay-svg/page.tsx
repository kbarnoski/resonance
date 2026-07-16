"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1792-replay-svg — "Replay" · state: Wake-Sleep sleep-phase memory replay · pole: dream
//
// THE QUESTION: what if a dream visual weren't noise turned into geometry, but
// your own cortex closing the sensory gate and REPLAYING what it just saw —
// recombined into dream-logic?
//
// Grounded in Bredenberg et al., eLife 2026;14:RP105968: one parameter α∈[0,1]
// trades cortical control between basal dendrites (α=0, WAKE — bottom-up sensory
// inference) and apical dendrites (α=1, SLEEP — top-down generative REPLAY). As
// α→1 the sensory gate closes and what you "see" is internally-generated content
// matching LEARNED MEMORY, not pure noise.
//
// SUBSTRATE: 100% SVG DOM vector art — no <canvas>, no WebGL, no three.js. The
// day-scene forms are real <g>/<path>/<polygon>/<circle> elements; the dream is
// those SAME elements REPLAYED via <use> duplication + SVG transforms + an SVG
// filter graph (feTurbulence→feDisplacementMap melt, feColorMatrix hue drift,
// feGaussianBlur top-down softening) whose parameters ride α. A single rAF loop
// MUTATES attributes/filter params each frame — the DOM subtree is built once.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { startAudio, type ReplayAudio } from "./audio";
import {
  arcAlpha,
  DREAM_INSTANCES,
  LAYOUT,
  VIEW,
} from "./scene";

type Phase = "idle" | "running" | "error";

const TWO_PI = Math.PI * 2;

export default function ReplaySvgPage() {
  const audioRef = useRef<ReplayAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const rafRef = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);

  // SVG element refs — created once, MUTATED per frame (never rebuilt).
  const wakeRef = useRef<SVGGElement | null>(null);
  const useRefs = useRef<(SVGUseElement | null)[]>([]);
  const dispRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const blurRef = useRef<SVGFEGaussianBlurElement | null>(null);
  const colorRef = useRef<SVGFEColorMatrixElement | null>(null);
  const turbRef = useRef<SVGFETurbulenceElement | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [alphaView, setAlphaView] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);

  // ── The single frame loop: mutate attributes/filter params off a frame counter.
  const frame = useCallback(() => {
    const f = frameRef.current++;
    const reduced = reducedRef.current;
    const timeScale = reduced ? 0.6 : 1; // reduced-motion → slow everything.
    const t = (f / 60) * timeScale; // seconds (deterministic 60fps assumption)
    const alpha = arcAlpha(t);

    // WAKE veridical layer: the sharp day scene fades as the gate closes.
    if (wakeRef.current) {
      const wo = Math.min(1, Math.max(0, 1 - alpha * 1.3));
      wakeRef.current.setAttribute("opacity", wo.toFixed(3));
    }

    // Filter graph rides α — the field "melts", softens and hue-drifts.
    const meltMax = reduced ? 22 : 56;
    const blurMax = reduced ? 1.2 : 2.3;
    if (dispRef.current) {
      dispRef.current.setAttribute("scale", (meltMax * alpha).toFixed(2));
    }
    if (blurRef.current) {
      blurRef.current.setAttribute("stdDeviation", (blurMax * alpha).toFixed(3));
    }
    if (turbRef.current) {
      // Slow breathing melt (< 0.15 Hz) — flowing, never flashing.
      const bf = 0.0075 + 0.006 * alpha + 0.0022 * Math.sin(t * TWO_PI * 0.05);
      turbRef.current.setAttribute("baseFrequency", bf.toFixed(5));
    }
    if (colorRef.current) {
      // Hue drift ~0.06 Hz + a small α lean.
      const hue = (t * 0.06 * 360 + alpha * 40) % 360;
      colorRef.current.setAttribute("values", hue.toFixed(1));
    }

    // Each remembered fragment: drift, wrong rotation/scale, condense, fade in.
    const insts = DREAM_INSTANCES;
    for (let i = 0; i < insts.length; i++) {
      const el = useRefs.current[i];
      if (!el) continue;
      const d = insts[i];
      // Converge toward a shared attractor as α→1 (two glyphs melt into one).
      const conv = d.condense * alpha;
      const cx = d.bx + (d.atx - d.bx) * conv;
      const cy = d.by + (d.aty - d.by) * conv;
      const driftX = d.ax * Math.sin(t * d.wx + d.px) * alpha;
      const driftY = d.ay * Math.cos(t * d.wy + d.py) * alpha;
      const x = cx + driftX;
      const y = cy + driftY;
      const rot = d.rot * t * alpha; // slow, α-gated rotation
      const sc = d.baseScale * (1 + 0.35 * alpha * Math.sin(t * 0.4 + d.px));
      el.setAttribute(
        "transform",
        `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${sc.toFixed(3)})`,
      );
      const op = d.op * Math.min(1, Math.max(0, (alpha - d.appearAt) / 0.18));
      el.setAttribute("opacity", op.toFixed(3));
    }

    // Cross-modal replay: the motif is captured & replayed recombined as α rises.
    audioRef.current?.tick(f, alpha);

    if (f % 10 === 0) setAlphaView(alpha);
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  const begin = useCallback(async () => {
    if (phase === "running") return;
    reducedRef.current = prefersReducedMotion();
    frameRef.current = 0;

    // Audio is gesture-gated here; visuals still run if it is blocked.
    try {
      const ac = new AudioContext();
      if (ac.state === "suspended") await ac.resume();
      ctxRef.current = ac;
      audioRef.current = startAudio(ac);
      setAudioBlocked(false);
    } catch {
      audioRef.current = null;
      setAudioBlocked(true);
    }

    setPhase("running");
    rafRef.current = requestAnimationFrame(frame);
  }, [phase, frame]);

  // ── Full teardown on unmount ────────────────────────────────────────────────
  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    audioRef.current?.stop();
    audioRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 500);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const phaseLabel =
    alphaView < 0.16
      ? "WAKE — bottom-up sensory (basal)"
      : alphaView < 0.72
        ? "drifting — replay taking over"
        : "SLEEP — top-down memory replay (apical)";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0705] text-foreground">
      {/* ── The whole visual: SVG DOM vector art only ──────────────────────── */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="rp-bg" cx="52%" cy="42%" r="75%">
            <stop offset="0%" stopColor="#241206" />
            <stop offset="55%" stopColor="#140a06" />
            <stop offset="100%" stopColor="#080503" />
          </radialGradient>

          {/* The melt / softening / hue-drift filter graph — parameters ride α. */}
          <filter
            id="rp-melt"
            x="-40%"
            y="-40%"
            width="180%"
            height="180%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              ref={turbRef}
              type="fractalNoise"
              baseFrequency="0.0075"
              numOctaves={2}
              seed={6}
              result="rp-noise"
            />
            <feDisplacementMap
              ref={dispRef}
              in="SourceGraphic"
              in2="rp-noise"
              scale={0}
              xChannelSelector="R"
              yChannelSelector="G"
              result="rp-disp"
            />
            <feColorMatrix
              ref={colorRef}
              in="rp-disp"
              type="hueRotate"
              values="0"
              result="rp-hued"
            />
            <feGaussianBlur in="rp-hued" ref={blurRef} stdDeviation={0} />
          </filter>

          {/* ── The seven SOURCE glyphs of the day, centred at origin ─────────
              These same ids are re-used, recombined, in the dream layer. */}
          <g id="g0">
            <circle r={24} fill="hsl(42 92% 60%)" />
            <circle r={24} fill="none" stroke="hsl(48 96% 80%)" strokeWidth={2} />
          </g>
          <g id="g1">
            <polygon
              points="0,-30 27,21 -27,21"
              fill="hsl(16 86% 54%)"
              stroke="hsl(24 92% 72%)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </g>
          <g id="g2">
            <polygon
              points="0,-30 8.8,-9.3 30,-9.3 12.9,4.5 18.5,26 0,13 -18.5,26 -12.9,4.5 -30,-9.3 -8.8,-9.3"
              fill="hsl(50 94% 62%)"
              stroke="hsl(54 96% 82%)"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </g>
          <g id="g3">
            <path
              d="M 2,-26 A 26,26 0 1,0 2,26 A 20,20 0 1,1 2,-26 Z"
              fill="hsl(32 90% 58%)"
              stroke="hsl(38 94% 78%)"
              strokeWidth={2}
            />
          </g>
          <g id="g4">
            <polygon
              points="26,0 13,22.5 -13,22.5 -26,0 -13,-22.5 13,-22.5"
              fill="hsl(8 84% 60%)"
              stroke="hsl(14 90% 76%)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </g>
          <g id="g5">
            <path
              d="M -30,0 Q 0,-22 30,0 Q 0,22 -30,0 Z"
              fill="hsl(55 90% 60%)"
              stroke="hsl(58 94% 82%)"
              strokeWidth={2}
            />
            <circle r={7} fill="hsl(28 88% 40%)" />
          </g>
          <g id="g6">
            <polygon
              points="0,-28 20,0 0,28 -20,0"
              fill="hsl(26 88% 56%)"
              stroke="hsl(32 92% 76%)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            <circle r={5} fill="hsl(48 96% 82%)" />
          </g>
        </defs>

        <rect x={0} y={0} width={VIEW} height={VIEW} fill="url(#rp-bg)" />

        {/* ── DREAM layer: the SAME glyphs, replayed & recombined under α ───── */}
        <g filter="url(#rp-melt)">
          {DREAM_INSTANCES.map((d, i) => (
            <use
              key={`inst-${i}`}
              href={`#${d.gid}`}
              ref={(el) => {
                useRefs.current[i] = el;
              }}
              opacity={0}
            />
          ))}
        </g>

        {/* ── WAKE layer: the crisp, veridical day scene (fades as α→1) ─────── */}
        <g ref={wakeRef} opacity={1}>
          {LAYOUT.map((item, i) => (
            <use
              key={`day-${i}`}
              href={`#${item.gid}`}
              transform={`translate(${item.x} ${item.y}) scale(${item.scale})`}
            />
          ))}
        </g>
      </svg>

      {/* subtle vignette for legibility of chrome (pure CSS, over the SVG) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

      {/* ── Title + one-sentence description ───────────────────────────────── */}
      <div className="pointer-events-none absolute left-0 top-0 max-w-xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Replay
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          A dream isn&rsquo;t noise turned into geometry &mdash; it&rsquo;s your
          cortex closing the sensory gate and replaying the day&rsquo;s own forms,
          recombined into dream-logic.
        </p>
      </div>

      {/* ── Start overlay ──────────────────────────────────────────────────── */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
          <div className="max-w-lg text-center">
            <p className="mb-6 text-base text-muted-foreground">
              Press Begin. First you see a sharp &ldquo;day&rdquo; &mdash; seven
              luminous forms and a short melody. Then, with no further input, the
              sensory gate closes over about a minute: the veridical scene fades
              and a top-down pathway replays those exact forms, fragmented and
              recombined, until the dream is made entirely out of its own memory.
              Then it gently wakes and loops. Sound on; no microphone, no camera.
            </p>
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          </div>
        </div>
      )}

      {/* ── WAKE ↔ SLEEP α readout (always visible while running) ───────────── */}
      {phase === "running" && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-6">
          {audioBlocked && (
            <p className="text-base text-muted-foreground">
              Audio is blocked on this device &mdash; the visuals still run.
            </p>
          )}
          <div className="flex w-full max-w-md flex-col items-center gap-1">
            <div className="flex w-full items-center justify-between font-mono text-sm text-muted-foreground">
              <span>WAKE</span>
              <span className="text-foreground">
                &alpha; {alphaView.toFixed(2)} &middot; {phaseLabel}
              </span>
              <span>SLEEP</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round(alphaView * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Design notes affordance ────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {showNotes ? "Close" : "Read the design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/50 p-6 backdrop-blur-sm">
          <div className="mt-16 max-w-lg rounded-lg border border-border bg-background p-6 text-base leading-relaxed text-foreground shadow-lg">
            <h2 className="mb-3 text-xl font-semibold tracking-tight">
              Design notes
            </h2>
            <p className="mb-3">
              A single parameter <span className="font-mono text-primary">&alpha;</span>{" "}
              runs 0&rarr;1 on a slow auto-arc. It is the control parameter of
              Bredenberg et al.,{" "}
              <em>
                &ldquo;Modeling the hallucinatory effects of classical
                psychedelics in terms of replay-dependent plasticity
                mechanisms,&rdquo;
              </em>{" "}
              eLife 2026;14:RP105968, which maps the Wake-Sleep algorithm onto
              cortex: <strong>&alpha;=0</strong> is WAKE &mdash; basal dendrites,
              bottom-up sensory inference; <strong>&alpha;=1</strong> is SLEEP
              &mdash; apical dendrites, top-down generative <em>replay</em>. As the
              sensory gate closes, what you perceive is internally generated to
              match <em>learned memory</em>, not pure noise.
            </p>
            <p className="mb-3">
              So the dream here is literally made of the day. The seven day-scene
              glyphs are real SVG shapes; the dream re-uses those exact shapes via{" "}
              <span className="font-mono">&lt;use&gt;</span> duplication and
              recombines them &mdash; drifting, superimposed, condensing two-into-one,
              scaled and rotated wrong &mdash; through an SVG filter graph
              (turbulence &rarr; displacement melt, hue drift, top-down blur) whose
              parameters ride <span className="font-mono text-primary">&alpha;</span>.
              The motif is replayed the same way: fragments in the wrong order,
              pitch-shifted, time-stretched, overlapping &mdash; cross-modal memory
              replay.
            </p>
            <p className="mb-3">
              This builds on the <strong>Wake-Sleep algorithm</strong> (Hinton,
              Dayan, Frey &amp; Neal, 1995) and contrasts with{" "}
              <strong>REBUS</strong> (Carhart-Harris &amp; Friston, 2019), where
              flattened high-level priors let bottom-up signal through &mdash; a
              relaxation account rather than an active generative-replay one. Both
              sit inside predictive processing; this piece takes the replay side
              literally.
            </p>
            <p className="mb-3 text-muted-foreground">
              Substrate: 100% SVG DOM vector art &mdash; no canvas, no WebGL. Crisp,
              resolution-independent line-art plus a declarative, animatable filter
              pipeline is exactly what SVG does that canvas cannot.
            </p>
            <p className="text-muted-foreground">
              Safety: all luminance change is slow drift (breathing &lt; 0.15 Hz,
              hue drift ~0.06 Hz). No strobe, no flicker in the alpha band; the
              dream intensity comes from recombination density and blur, never from
              flashing. Reduced-motion is honored (motion slowed, melt damped).
            </p>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1792-replay-svg"]} />
    </main>
  );
}
