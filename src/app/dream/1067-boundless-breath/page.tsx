"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BreathScene } from "./scene";
import { startAudio, type BreathAudio } from "./audio";
import { startBreath, type BreathRig } from "./breath";

type Phase = "idle" | "starting" | "running" | "error";

export default function BoundlessBreathPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<BreathScene | null>(null);
  const audioRef = useRef<BreathAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const breathRef = useRef<BreathRig | null>(null);
  const tickRef = useRef<number>(0);
  const lastRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"mic" | "auto" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const teardown = useCallback(() => {
    if (tickRef.current) cancelAnimationFrame(tickRef.current);
    tickRef.current = 0;
    sceneRef.current?.dispose();
    sceneRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    breathRef.current?.stop();
    breathRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      // Let the fade-outs ring before closing the context.
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 800);
    }
  }, []);

  // Full teardown on unmount.
  useEffect(() => teardown, [teardown]);

  const begin = useCallback(async () => {
    if (phase === "starting" || phase === "running") return;
    setPhase("starting");
    setErrorMsg(null);

    const container = containerRef.current;
    if (!container) {
      setPhase("error");
      setErrorMsg("Could not mount the canvas.");
      return;
    }

    // ── Visuals (WebGL may be unavailable → graceful notice) ──────────────────
    let scene: BreathScene;
    try {
      scene = new BreathScene(container);
    } catch {
      setPhase("error");
      setErrorMsg(
        "WebGL is unavailable on this device, so the starfield can't render.",
      );
      return;
    }
    sceneRef.current = scene;
    scene.start();

    // ── Audio ─────────────────────────────────────────────────────────────────
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      scene.dispose();
      sceneRef.current = null;
      setPhase("error");
      setErrorMsg("Web Audio is unavailable on this device.");
      return;
    }
    ctxRef.current = ctx;
    audioRef.current = startAudio(ctx);

    // ── Breath (mic or auto fallback — always resolves) ───────────────────────
    const rig = await startBreath({ ctx });
    breathRef.current = rig;
    setMode(rig.mode);

    // ── Drive loop: read breath → feed audio + scene ──────────────────────────
    lastRef.current = performance.now();
    const drive = () => {
      const now = performance.now();
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);

      const b = breathRef.current?.getBreath() ?? 0;
      audioRef.current?.setBreath(b);
      audioRef.current?.step(dt);
      sceneRef.current?.setBreath(b);

      tickRef.current = requestAnimationFrame(drive);
    };
    tickRef.current = requestAnimationFrame(drive);

    setPhase("running");
  }, [phase]);

  // Keep the renderer sized to the window.
  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#05030f] text-foreground">
      {/* Full-screen three.js canvas mounts here, behind the UI. */}
      <div ref={containerRef} className="absolute inset-0" aria-hidden />

      {/* Soft vignette so UI text stays legible over the starfield. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(5,3,15,0.65)_100%)]" />

      {/* ── Idle / start panel ─────────────────────────────────────────────── */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-xl rounded-2xl bg-black/45 p-8 backdrop-blur-md ring-1 ring-border">
            <h1 className="font-semibold text-3xl tracking-tight text-foreground sm:text-4xl">
              Boundless Breath
            </h1>
            <p className="mt-3 text-base leading-relaxed text-foreground">
              Breathe yourself into an endless ascent. Your inhale gathers a vast
              field of stars inward toward a luminous core and lifts a
              Shepard–Risset glissando upward; your exhale releases them to a
              boundless drift. You play the rising, not watch it.
            </p>

            <button
              type="button"
              onClick={begin}
              disabled={phase === "starting"}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-card px-4 py-2.5 text-base font-medium text-black transition hover:bg-accent disabled:opacity-60"
            >
              {phase === "starting" ? "Listening…" : "Begin breathing · allow mic"}
            </button>

            {errorMsg && (
              <p className="mt-4 text-base text-violet-300">{errorMsg}</p>
            )}

            <p className="mt-4 text-base text-muted-foreground">
              Use headphones if you can. We listen only to drive your breath
              envelope — no audio is recorded or sent anywhere. Without a mic it
              auto-paces a calm ~5.5 breaths-per-minute cycle.
            </p>
          </div>
        </div>
      )}

      {/* ── Running HUD ────────────────────────────────────────────────────── */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-6 top-6 select-none">
          <h1 className="font-semibold text-2xl text-foreground">Boundless Breath</h1>
          {mode === "mic" && (
            <p className="mt-1 text-base text-violet-300/95">● breath</p>
          )}
          {mode === "auto" && (
            <p className="mt-1 text-base text-violet-300/95">
              ○ auto-breath (no mic)
            </p>
          )}
        </div>
      )}

      {/* ── Design-notes toggle (renders notes in-page) ────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-6 top-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-black/45 px-4 py-2.5 text-base text-foreground ring-1 ring-border backdrop-blur-md transition hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/70 px-6 py-16 backdrop-blur-md">
          <div className="max-w-2xl text-foreground">
            <h2 className="font-semibold text-2xl text-foreground">Design notes</h2>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The question:</span> what if the felt
              sense of rising forever — auditory and visual vection together —
              were something you <em>play</em> with your breath, not a video you
              watch?
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Breath as control.</span> The mic RMS
              is smoothed into a slow envelope b∈[0,1]. Inhale (rising b)
              accelerates the upward Shepard transpose, opens timbral brightness,
              blooms the reverb, and speeds the stars&apos; inward flow toward the
              core. Exhale (falling b) eases the ascent to a near-hover and
              releases the stars to a slow boundless drift. No mic → a calm 5.5
              breaths/min sine paces it automatically.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Congruent vection.</span> A
              Shepard–Risset glissando induces <em>auditory</em> vection — a
              metaphorical bodily sense of self-motion strong enough to shift
              listeners&apos; postural sway. We pair it with <em>visual</em>{" "}
              vection: ~120k stars stream radially past the camera (optic-flow
              expansion), so the eyes feel the same ascent the ears do. Transport
              without the drug.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">References.</span> Roger Shepard
              (1964), discrete circular pitch; Jean-Claude Risset, the continuous
              glissando; and auditory-vection research showing the Shepard–Risset
              glissando evokes metaphorical self-motion / measurable postural
              sway.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Honest novelty.</span> The lab already
              has passive Shepard-tone demos (40-, 132-, 187-shepard-tone). The
              new thing here is the <em>breath-coupled, vection-paired, played</em>{" "}
              version — you steer the endless rise with your own lungs.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Next-cycle deepening:</span> detect
              inhale/exhale phase (not just amplitude) for true direction control;
              a breath-locked particle bloom at the core on the inhale peak;
              binaural spatialisation of the partials; gentle pitch-class colour
              mapping; a guided onboarding that teaches coherent breathing.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
