"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  actName,
  createArc,
  PHASE_LABEL,
  stepArc,
  type ArcState,
} from "./arc";
import { createDirector, stepDirector, type DirectorState } from "./director";
import { makeReverieAudio, type ReverieAudio } from "./audio";
import { buildGpu, stepGpu, type FieldParams, type GpuState } from "./compute";
import {
  createFallback,
  stepFallback,
  type FallbackState,
} from "./fallback";

type Mode = "idle" | "running" | "paused";

export default function ReveriePage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [using2D, setUsing2D] = useState(false);
  const [noAudio, setNoAudio] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [driver, setDriver] = useState<"auto" | "you">("auto");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gpuRef = useRef<GpuState | null>(null);
  const fbRef = useRef<FallbackState | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<ReverieAudio | null>(null);
  const rafRef = useRef<number>(0);

  const arcRef = useRef<ArcState>(createArc());
  const dirRef = useRef<DirectorState>(createDirector());
  const timeRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const modeRef = useRef<Mode>("idle");
  const reduceRef = useRef<boolean>(false);

  const holdingRef = useRef<boolean>(false);
  const dwellRef = useRef<number>(0);
  const humanRef = useRef<boolean>(false);
  const intensityRef = useRef<number>(0);

  // HUD refs (per-frame DOM writes, no re-render)
  const actElRef = useRef<HTMLSpanElement | null>(null);
  const phaseElRef = useRef<HTMLSpanElement | null>(null);
  const valElRef = useRef<HTMLDivElement | null>(null);
  const arsElRef = useRef<HTMLDivElement | null>(null);
  const denElRef = useRef<HTMLDivElement | null>(null);
  const dwellElRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    reduceRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }, []);

  const engageHuman = useCallback(() => {
    if (!humanRef.current) {
      humanRef.current = true;
      setDriver("you");
    }
  }, []);

  const renderLoop = useCallback((ts: number) => {
    const last = lastTsRef.current || ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    lastTsRef.current = ts;
    timeRef.current += dt;

    const arc = arcRef.current;
    const dir = dirRef.current;
    const reduce = reduceRef.current;

    // dwell eases toward the hold state (linger)
    const holdTarget = holdingRef.current ? 1 : 0;
    const dwellRate = holdingRef.current ? 1.6 : 2.4;
    dwellRef.current +=
      (holdTarget - dwellRef.current) * (1 - Math.exp(-dwellRate * dt));
    const dwell = dwellRef.current;

    // intensity nudge relaxes back toward 0 slowly
    intensityRef.current = Math.max(0, intensityRef.current - dt * 0.08);

    if (modeRef.current === "running") {
      // lingering dilates time: the clock nearly freezes while holding
      const dilated = dt * (1 - dwell * 0.92);
      stepArc(arc, dilated);
    }

    const aff = stepDirector(dir, arc, dt, dwell, intensityRef.current);
    audioRef.current?.setFrame(arc, aff, dwell);

    // ── build field params ──
    const canvas = canvasRef.current;
    const w = canvas?.width || 1;
    const h = canvas?.height || 1;
    const aspect = w / h;
    // trails: shorter smear at high arousal, dreamier when calm
    const fade = reduce ? 0.86 : 0.93 - aff.arousal * 0.08;
    // damp brightness swings under reduced motion (no flashes)
    const brightness = reduce ? 0.4 + aff.brightness * 0.35 : aff.brightness;

    const p: FieldParams = {
      time: timeRef.current,
      aspect,
      driftW: aff.driftW,
      vortexW: aff.vortexW,
      radialW: aff.radialW,
      turbW: aff.turbW,
      radialDir: aff.radialDir,
      arousal: aff.arousal,
      valence: aff.valence,
      brightness,
      density: aff.density,
      dwell,
      reduce: reduce ? 1 : 0,
      fade,
    };

    if (gpuRef.current) {
      stepGpu(gpuRef.current, p);
    } else if (ctx2dRef.current && fbRef.current) {
      stepFallback(ctx2dRef.current, fbRef.current, p, w, h);
    }

    // ── HUD ──
    if (actElRef.current) actElRef.current.textContent = actName(arc.toAct);
    if (phaseElRef.current) phaseElRef.current.textContent = PHASE_LABEL[arc.phase];
    if (valElRef.current) valElRef.current.style.width = `${Math.round(aff.valence * 100)}%`;
    if (arsElRef.current) arsElRef.current.style.width = `${Math.round(aff.arousal * 100)}%`;
    if (denElRef.current) denElRef.current.style.width = `${Math.round(aff.density * 100)}%`;
    if (dwellElRef.current) dwellElRef.current.style.width = `${Math.round(dwell * 100)}%`;

    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  const handleStart = useCallback(async () => {
    if (mode === "running") return;
    if (mode === "paused") {
      if (acRef.current?.state === "suspended") await acRef.current.resume();
      setMode("running");
      return;
    }

    sizeCanvas();
    const canvas = canvasRef.current;

    // ── visuals: prefer WebGPU compute, else Canvas2D ──
    let gotGpu = false;
    if (canvas && typeof navigator !== "undefined" && navigator.gpu) {
      try {
        gpuRef.current = await buildGpu(canvas);
        gotGpu = true;
      } catch {
        gpuRef.current = null;
      }
    }
    if (!gotGpu && canvas) {
      const g2d = canvas.getContext("2d");
      if (g2d) {
        ctx2dRef.current = g2d;
        fbRef.current = createFallback();
        setUsing2D(true);
      }
    }

    // ── audio (must be inside this user gesture) ──
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new AC();
      await ac.resume();
      acRef.current = ac;
      audioRef.current = makeReverieAudio(ac, 0.17);
    } catch {
      setNoAudio(true);
    }

    arcRef.current = createArc();
    dirRef.current = createDirector();
    timeRef.current = 0;
    dwellRef.current = 0;
    holdingRef.current = false;
    humanRef.current = false;
    intensityRef.current = 0;
    setDriver("auto");
    lastTsRef.current = 0;
    setMode("running");
  }, [mode, sizeCanvas]);

  const handlePause = useCallback(async () => {
    if (modeRef.current !== "running") return;
    setMode("paused");
    holdingRef.current = false;
    if (acRef.current?.state === "running") await acRef.current.suspend();
  }, []);

  // keyboard: hold Space to dwell/linger; arrows nudge intensity
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.code === "Space" || ev.key === " ") {
        ev.preventDefault();
        if (ev.repeat) return;
        if (modeRef.current !== "running") return;
        engageHuman();
        holdingRef.current = true;
      } else if (ev.code === "ArrowUp") {
        ev.preventDefault();
        engageHuman();
        intensityRef.current = Math.min(1, intensityRef.current + 0.22);
      } else if (ev.code === "ArrowDown") {
        ev.preventDefault();
        engageHuman();
        intensityRef.current = Math.max(0, intensityRef.current - 0.22);
      }
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code === "Space" || ev.key === " ") {
        ev.preventDefault();
        holdingRef.current = false;
      }
    };
    const blur = () => {
      holdingRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [engageHuman]);

  const onPadDown = useCallback(() => {
    if (modeRef.current !== "running") return;
    engageHuman();
    holdingRef.current = true;
  }, [engageHuman]);
  const onPadUp = useCallback(() => {
    holdingRef.current = false;
  }, []);

  // run the loop while not idle
  useEffect(() => {
    if (mode === "idle") return;
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(renderLoop);
    const onResize = () => {
      // only the 2D fallback can cheaply re-size; GPU trail is fixed at start
      if (ctx2dRef.current) sizeCanvas();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [mode, renderLoop, sizeCanvas]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 450);
      }
      acRef.current = null;
      if (gpuRef.current) {
        gpuRef.current.device.destroy();
        gpuRef.current = null;
      }
      ctx2dRef.current = null;
      fbRef.current = null;
    };
  }, []);

  const running = mode === "running";

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full touch-none"
      />

      {/* top-left: title + controls */}
      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Reverie
        </h1>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          A journey engine shaped like a cinematic three-act arc — and its most
          crafted moments are the transitions, where a director synthesizes a
          seamless musical and visual bridge that morphs one act&apos;s world
          into the next.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {!running && (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {mode === "paused" ? "Resume" : "Begin the journey"}
            </button>
          )}
          {running && (
            <button
              onClick={handlePause}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Pause
            </button>
          )}
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        {mode === "idle" && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            tap begin — the arc plays itself, hands-off
          </p>
        )}
        {noAudio && (
          <p className="mt-3 text-base leading-relaxed text-destructive">
            Web Audio is unavailable in this browser, so the score cannot play.
            The visual arc still runs.
          </p>
        )}
        {using2D && running && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            webgpu absent · canvas 2d fallback
          </p>
        )}
      </div>

      {/* top-right: live driver badge */}
      {running && (
        <div className="fixed right-0 top-0 z-30 flex items-center gap-2 p-5 sm:p-7">
          <span className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            {driver === "auto" ? "live · auto" : "live · you"}
          </span>
        </div>
      )}

      {/* bottom: HUD — act, phase, affect readouts, linger affordance */}
      {running && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 p-5 sm:p-7">
          <div className="flex w-full max-w-md flex-col gap-2 rounded-lg border border-border bg-background/50 p-4 backdrop-blur-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                act <span ref={actElRef} className="text-primary">I</span>
              </span>
              <span
                ref={phaseElRef}
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
              >
                act i · setup
              </span>
            </div>
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                valence
              </span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-border">
                <div ref={valElRef} className="h-full bg-primary/70" style={{ width: "34%" }} />
              </div>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                arousal
              </span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-border">
                <div ref={arsElRef} className="h-full bg-primary" style={{ width: "14%" }} />
              </div>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                density
              </span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-border">
                <div ref={denElRef} className="h-full bg-primary/50" style={{ width: "22%" }} />
              </div>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                dwell
              </span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-border">
                <div ref={dwellElRef} className="h-full bg-primary/40" style={{ width: "0%" }} />
              </div>
            </div>
          </div>

          <button
            onPointerDown={onPadDown}
            onPointerUp={onPadUp}
            onPointerLeave={onPadUp}
            onPointerCancel={onPadUp}
            className="min-h-[44px] select-none rounded-md border border-border bg-background/60 px-6 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-primary active:text-primary-foreground"
          >
            HOLD to linger · release to resume
          </button>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            spacebar dwells · ↑ ↓ nudge intensity
          </p>
        </div>
      )}

      {/* design notes */}
      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Reverie asks what a Resonance journey engine would feel like as
                a cinematic{" "}
                <span className="text-foreground">three-act narrative</span>:{" "}
                <span className="text-foreground">
                  Setup → Confrontation → Resolution
                </span>
                , looping forever. The centerpiece is the{" "}
                <span className="text-foreground">transition</span> between acts
                — never a cut, always a synthesized bridge.
              </p>
              <p>
                A rule-based director interpolates an affective state
                (valence, arousal, density, tempo, brightness) toward each
                act&apos;s target every frame. Across a bridge it glides that
                target between two acts and picks a style: a{" "}
                <span className="text-foreground">rise</span> into Act II, a{" "}
                <span className="text-foreground">collapse</span> at the Act III
                climax, a <span className="text-foreground">settle</span> back
                to the start.
              </p>
              <p>
                The music modulates by{" "}
                <span className="text-foreground">common-tone / pivot chord</span>
                : Act I A-minor → Act II F-minor → Act III C-major, each bridge
                holding a shared tone fixed while the other pad voices glide by
                minimal motion. The visual world is a WebGPU compute-shader
                particle nebula whose force field is a weighted sum of drift,
                vortex and radial operators — the bridge lerps those weights, so
                the cloud continuously re-forms from horizon to storm to bloom.
                No WebGPU → a Canvas2D fallback runs the same model.
              </p>
              <p>
                Your role is <span className="text-foreground">witness &amp;
                pace</span>: the arc auto-advances and demos itself hands-off.
                Hold Space to <span className="text-foreground">linger</span> —
                time dilates and the moment deepens; you can even freeze inside
                a transition and watch the morph hang. Nothing can be failed.
              </p>
              <p>
                References: NarraScore (arXiv:2602.09070, Feb 2026) for
                affective valence/arousal arc control; JenBridge
                (arXiv:2606.01703, Jun 2026) for the director that selects a
                generative transition style per narrative shift; and the classic
                three-act setup/confrontation/resolution trailer-music form.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
