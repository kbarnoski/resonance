"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 9992-afterimage — "What if the artwork's true image is the one your own eyes
// paint after the screen goes blank?"
//
//   The display is only a PRIMER. It holds a saturated colour field steady long
//   enough for your retina to adapt (bleaching the cones that see that hue),
//   then ramps smoothly to a neutral mid-grey. The payoff is not on the screen:
//   your visual system now floods that grey with a vivid NEGATIVE AFTERIMAGE —
//   the complementary colour — that blooms and fades over several seconds. The
//   piece then adapts to (near) the hue you just hallucinated, precessing around
//   the opponent-colour wheel so the image keeps handing itself off to your eye.
//
//   Entirely a CSS/DOM compositor piece: two stacked <div> fields and an opacity
//   ramp are the whole renderer. No canvas, no WebGL, no strobing — every colour
//   ↔ grey transition is a slow luminance ramp (≥0.9 s), which is both the safe
//   way to show it and how afterimage adaptation actually works.
//
//   Grounded in opponent-process colour vision (Hering; Helmholtz on
//   afterimages) and op-art's use of complementary adaptation (Bridget Riley).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { AfterimageDrone, type Phase } from "./audio";

// ── timing (seconds, at speed = 1) ──────────────────────────────────────────
const ADAPT_HOLD = 12; // saturated field held steady (fade-in + steady stare)
const BLINK_HOLD = 9; // neutral grey held while the afterimage blooms/fades
const RAMP = 1.0; // luminance ramp at every boundary — safety + adaptation
const HUE_STEP = 210; // ≈ complement (180°) + 30° drift → walks the whole wheel

// ── art-layer palette (raw colour is allowed here — the fields ARE the art) ──
const NEUTRAL = "hsl(0 0% 50%)"; // the calm mid-grey the afterimage paints onto

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

// A full-field saturated wash with a gentle radial shading so the eye has a
// centre to hold. Returned as a CSS background string for the colour layer.
function fieldBackground(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  const light = `hsl(${h} 88% 62%)`;
  const mid = `hsl(${h} 92% 52%)`;
  const deep = `hsl(${h} 80% 42%)`;
  return `radial-gradient(circle at 50% 50%, ${light} 0%, ${mid} 46%, ${deep} 100%)`;
}

// The colour the retina will paint on grey — the opponent (complementary) hue.
function complementCss(hue: number): string {
  const h = ((hue + 180) % 360 + 360) % 360;
  return `hsl(${h} 78% 55%)`;
}

function reduceMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function AfterimagePage() {
  // ── DOM refs the rAF loop mutates directly (no per-frame React render) ──
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const phaseLabelRef = useRef<HTMLSpanElement | null>(null);
  const swatchRef = useRef<HTMLSpanElement | null>(null);
  const beatLabelRef = useRef<HTMLSpanElement | null>(null);

  // ── running state (refs — read/written inside the loop) ──
  const rafRef = useRef<number>(0);
  const droneRef = useRef<AfterimageDrone | null>(null);
  const speedRef = useRef<number>(1);
  const hueRef = useRef<number>(190); // start on a cyan primer → red afterimage
  const phaseRef = useRef<Phase>("adapt");
  const phaseStartRef = useRef<number>(0);
  const beatRef = useRef<number>(1);
  const appliedHueRef = useRef<number>(-1);
  const lastPhaseKeyRef = useRef<string>("");

  // ── discrete UI state ──
  const [speed, setSpeed] = useState(1);
  const [audioOn, setAudioOn] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Force an immediate BLINK (manual release) — the only real-time interaction.
  const triggerBlink = useCallback((ts: number) => {
    if (phaseRef.current === "adapt") {
      phaseRef.current = "blink";
      phaseStartRef.current = ts;
    }
  }, []);

  // ── the single auto-running visual loop (starts on mount, no gesture) ──
  useEffect(() => {
    const slow = reduceMotion() ? 0.7 : 1; // calmer default if user asks for it
    const start = performance.now();
    phaseStartRef.current = start;
    phaseRef.current = "adapt";

    const drawFrame = (ts: number) => {
      const speedMul = speedRef.current * slow;
      const adaptDur = ADAPT_HOLD / speedMul;
      const blinkDur = BLINK_HOLD / speedMul;
      const ramp = RAMP / speedMul;
      const hue = hueRef.current;

      // apply the field colour whenever the hue changes (cheap, not per-frame).
      if (appliedHueRef.current !== hue && fieldRef.current) {
        fieldRef.current.style.background = fieldBackground(hue);
        appliedHueRef.current = hue;
      }

      const local = (ts - phaseStartRef.current) / 1000;
      let opacity: number;
      let progress: number;

      if (phaseRef.current === "adapt") {
        // fade the saturated field IN, then hold it steady.
        opacity = smoothstep(local / ramp);
        progress = Math.min(1, local / adaptDur);
        if (local >= adaptDur) {
          phaseRef.current = "blink";
          phaseStartRef.current = ts;
        }
      } else {
        // ramp DOWN to neutral grey; hold while the afterimage does the work.
        opacity = 1 - smoothstep(local / ramp);
        progress = Math.min(1, local / blinkDur);
        if (local >= blinkDur) {
          // hand the image to the eye: next primer drifts around the wheel.
          hueRef.current = (hue + HUE_STEP) % 360;
          beatRef.current += 1;
          phaseRef.current = "adapt";
          phaseStartRef.current = ts;
        }
      }

      if (fieldRef.current) fieldRef.current.style.opacity = opacity.toFixed(3);
      if (progressRef.current)
        progressRef.current.style.width = `${(progress * 100).toFixed(1)}%`;

      // steer audio + readouts only on a real phase change (not every frame).
      const key = `${phaseRef.current}:${hueRef.current}`;
      if (key !== lastPhaseKeyRef.current) {
        lastPhaseKeyRef.current = key;
        droneRef.current?.setBeat(hueRef.current, phaseRef.current, ramp);
        if (phaseLabelRef.current)
          phaseLabelRef.current.textContent =
            phaseRef.current === "adapt" ? "adapt — hold your gaze" : "blink — look for the ghost";
        if (swatchRef.current)
          swatchRef.current.style.background = complementCss(hueRef.current);
        if (beatLabelRef.current)
          beatLabelRef.current.textContent = String(beatRef.current);
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // teardown audio on unmount.
  useEffect(() => {
    return () => {
      droneRef.current?.dispose();
      droneRef.current = null;
    };
  }, []);

  // Space / click / tap → immediate manual blink.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        triggerBlink(performance.now());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [triggerBlink]);

  const startAudio = useCallback(async () => {
    setAudioError(null);
    try {
      const drone = droneRef.current ?? new AfterimageDrone();
      droneRef.current = drone;
      await drone.start();
      drone.setBeat(hueRef.current, phaseRef.current, 0.4);
      setAudioOn(true);
    } catch {
      setAudioError(
        "Web Audio is unavailable here — the visual afterimage cycle keeps running silently.",
      );
      droneRef.current?.dispose();
      droneRef.current = null;
      setAudioOn(false);
    }
  }, []);

  const stopAudio = useCallback(() => {
    droneRef.current?.dispose();
    droneRef.current = null;
    setAudioOn(false);
  }, []);

  const onSpeed = useCallback((v: number) => {
    setSpeed(v);
    speedRef.current = v;
  }, []);

  const onStageActivate = useCallback(() => {
    triggerBlink(performance.now());
  }, [triggerBlink]);

  return (
    <main className="relative min-h-dvh bg-background px-4 py-6 text-foreground sm:px-6">
      <PrototypeNav slugs={["9992-afterimage"]} />

      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            9992 · afterimage · the image your retina paints
          </span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            The picture arrives after the screen goes blank
          </h1>
          <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
            Look at the small cross and don&apos;t move your eyes. A saturated
            field holds, then dissolves to grey — and your own visual system
            floods that grey with the complementary colour that was never on the
            display. The screen only primes; the artwork is rendered by your
            retina.
          </p>
        </header>

        {/* ── the compositor stage: two stacked fields + an opacity ramp ── */}
        <button
          type="button"
          onClick={onStageActivate}
          aria-label="Tap to trigger an immediate blink to grey"
          className="relative block aspect-square w-full cursor-pointer overflow-hidden rounded-lg border border-border sm:aspect-[4/3]"
        >
          {/* base layer: the calm neutral grey the afterimage lands on */}
          <div className="absolute inset-0" style={{ background: NEUTRAL }} />
          {/* colour layer: full-field saturated wash, opacity driven per frame */}
          <div
            ref={fieldRef}
            className="absolute inset-0"
            style={{ background: fieldBackground(190), opacity: 1 }}
          />
          {/* fixation mark — dim neutral cross, readable over colour AND grey */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-6 w-6">
              <span
                className="absolute left-1/2 top-0 h-6 w-[2px] -translate-x-1/2"
                style={{ background: "rgba(15,15,20,0.55)" }}
              />
              <span
                className="absolute top-1/2 left-0 h-[2px] w-6 -translate-y-1/2"
                style={{ background: "rgba(15,15,20,0.55)" }}
              />
            </div>
          </div>
          {/* on-stage instruction */}
          <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-black/45">
            hold the cross · don&apos;t move your eyes
          </span>
        </button>

        {/* phase progress bar */}
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-border">
          <div
            ref={progressRef}
            className="h-full rounded-full bg-primary/70"
            style={{ width: "0%" }}
          />
        </div>

        {/* ── live readout ── */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              phase
            </span>
            <span ref={phaseLabelRef} className="text-base">
              adapt — hold your gaze
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              predicted afterimage
            </span>
            <span className="flex items-center gap-2 text-base">
              <span
                ref={swatchRef}
                className="inline-block h-4 w-4 rounded-full border border-border"
                style={{ background: complementCss(190) }}
              />
              the opponent hue
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              beat
            </span>
            <span ref={beatLabelRef} className="text-base">
              1
            </span>
          </div>
        </div>

        {/* ── controls ── */}
        <div className="flex flex-wrap items-center gap-3">
          {audioOn ? (
            <button
              onClick={stopAudio}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop sound
            </button>
          ) : (
            <button
              onClick={startAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground"
            >
              Begin
            </button>
          )}

          <button
            onClick={onStageActivate}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Blink now
          </button>

          <label className="flex min-h-[44px] items-center gap-3 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground">
            <span className="font-mono text-xs uppercase tracking-[0.18em]">
              pace
            </span>
            <input
              type="range"
              min={0.6}
              max={1.6}
              step={0.05}
              value={speed}
              onChange={(e) => onSpeed(Number(e.target.value))}
              aria-label="Cycle pace"
              className="w-32 accent-primary"
            />
            <span className="w-10 text-right tabular-nums">
              {speed.toFixed(2)}×
            </span>
          </label>

          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Hide notes" : "Design notes"}
          </button>
        </div>

        {audioError && (
          <p className="text-sm text-destructive" role="status">
            {audioError}
          </p>
        )}

        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          The cycle runs on its own from the moment the page loads — no input
          needed. Press <span className="font-mono">Space</span>, or tap the
          field, to release the colour to grey immediately. Each primer adapts to
          roughly the hue you just hallucinated, so the piece slowly walks the
          opponent-colour wheel.
        </p>

        {showNotes && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/60 p-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              <span className="text-foreground">The mechanism.</span> Staring at
              a saturated hue fatigues the cone/opponent channels tuned to it.
              When the field ramps to neutral grey, the still-fresh opposing
              channel dominates and you perceive the complementary colour —
              a <em>negative afterimage</em>. Nothing complementary is ever
              drawn: the image is endogenous, delivered by your visual system.
            </p>
            <p>
              <span className="text-foreground">The rendering.</span> There is no
              canvas and no WebGL. The whole picture is two stacked{" "}
              <span className="font-mono">&lt;div&gt;</span> fields — a neutral
              base and a saturated wash — and a single opacity ramp. The browser
              compositor is the only renderer; your retina is the second.
            </p>
            <p>
              <span className="text-foreground">Lineage.</span> Opponent-process
              colour vision (Ewald Hering) and Helmholtz&apos;s writing on
              afterimages explain the effect; Bridget Riley and op-art turned
              complementary adaptation into art. This piece hands the picture off
              to your eye instead of to the glass.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
