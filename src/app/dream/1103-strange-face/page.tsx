"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StrangeScene } from "./scene";
import { startStrangeAudio, type StrangeAudio } from "./audio";
import { startFace, type FaceRig, type FaceMode } from "./face";

type Phase = "idle" | "starting" | "running" | "error";

// The strange-face threshold: cross this and the shiver fires; re-arm below re-arm.
const THRESHOLD = 0.7;
const REARM = 0.55;

export default function StrangeFacePage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<StrangeScene | null>(null);
  const audioRef = useRef<StrangeAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const faceRef = useRef<FaceRig | null>(null);
  const tickRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const dissolveRef = useRef<number>(0);
  const armedRef = useRef<boolean>(true);
  const notchRef = useRef<number>(-1);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<FaceMode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dissolve, setDissolve] = useState(0);
  const [strange, setStrange] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const teardown = useCallback(() => {
    if (tickRef.current) cancelAnimationFrame(tickRef.current);
    tickRef.current = 0;
    sceneRef.current?.dispose();
    sceneRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    faceRef.current?.stop();
    faceRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 900);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const begin = useCallback(async () => {
    if (phase === "starting" || phase === "running") return;
    setPhase("starting");
    setErrorMsg(null);
    setNotice(null);

    const container = containerRef.current;
    if (!container) {
      setPhase("error");
      setErrorMsg("Could not mount the mirror.");
      return;
    }

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    // ── Visuals (WebGL2 may be unavailable → graceful notice) ────────────────
    let scene: StrangeScene;
    try {
      scene = new StrangeScene(container, reduced);
    } catch {
      setPhase("error");
      setErrorMsg(
        "WebGL2 is unavailable on this device, so the mirror can't render.",
      );
      return;
    }
    sceneRef.current = scene;

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
    audioRef.current = startStrangeAudio(ctx);

    // ── Face source (camera or autonomous pseudo-face — always resolves) ─────
    const { rig, fallbackReason } = await startFace();
    faceRef.current = rig;
    setMode(rig.mode);
    if (fallbackReason) setNotice(fallbackReason);

    // Show the running UI immediately so the AV idea is live at once.
    setPhase("running");

    dissolveRef.current = 0;
    armedRef.current = true;
    lastRef.current = performance.now();

    const loop = () => {
      const now = performance.now();
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);

      const rigNow = faceRef.current;
      const sc = sceneRef.current;
      if (rigNow && sc) {
        const f = rigNow.read(dt);

        // Stillness → dissolution. Hold still (low motion) → rises slowly
        // (~tau 24s to full); any real motion → fast snap-back (~tau 1.1s).
        const stillTarget = Math.max(0, 1 - f.motion * 4.5);
        let d = dissolveRef.current;
        const rising = stillTarget > d;
        const tau = rising ? 24 : 1.1;
        const k = 1 - Math.exp(-dt / tau);
        d += (stillTarget - d) * k;
        d = Math.min(1, Math.max(0, d));
        dissolveRef.current = d;

        sc.render(rigNow.source, rigNow.sourceAspect(), d, dt);
        audioRef.current?.setDissolve(d);

        // Strange-face threshold shiver (hysteresis).
        if (armedRef.current && d >= THRESHOLD) {
          audioRef.current?.chime();
          armedRef.current = false;
          setStrange(true);
        } else if (!armedRef.current && d < REARM) {
          armedRef.current = true;
          setStrange(false);
        }

        // Throttle React re-renders to meter notches.
        const notch = Math.round(d * 20);
        if (notch !== notchRef.current) {
          notchRef.current = notch;
          setDissolve(d);
        }
      }

      tickRef.current = requestAnimationFrame(loop);
    };
    tickRef.current = requestAnimationFrame(loop);
  }, [phase]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#060509] text-foreground">
      {/* Full-screen WebGL2 mirror mounts here, behind the UI. */}
      <div ref={containerRef} className="absolute inset-0" aria-hidden />

      {/* Idle / start panel */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-xl rounded-2xl bg-black/55 p-8 backdrop-blur-md ring-1 ring-border">
            <h1 className="font-mono text-2xl tracking-tight text-foreground sm:text-3xl">
              Strange Face
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Gaze into a dark mirror and hold still: the longer you stay
              motionless, the more your own reflection loses its edges, folds
              into itself and drifts into someone else — the Caputo
              strange-face-in-the-mirror illusion, induced on purpose. Any real
              movement snaps you back.
            </p>

            <button
              type="button"
              onClick={begin}
              disabled={phase === "starting"}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-card px-4 py-2.5 text-base font-medium text-black transition hover:bg-accent disabled:opacity-60"
            >
              {phase === "starting" ? "Opening the mirror…" : "Enable camera · begin"}
            </button>

            {errorMsg && (
              <p className="mt-4 text-base text-violet-300">{errorMsg}</p>
            )}

            <p className="mt-4 text-base text-muted-foreground">
              Dim your room and use headphones. The camera is used only in your
              browser to sense how still you are — nothing is recorded or sent
              anywhere. With no camera it runs an autonomous pseudo-face that
              dissolves on its own, so it is never blank or silent.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Slow, quiet and a little unsettling by design. No strobing;
              respects reduced-motion.
            </p>
          </div>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-6 top-6 select-none">
          <h1 className="font-mono text-2xl text-foreground">Strange Face</h1>
          {mode === "face" && (
            <p className="mt-1 font-mono text-base text-violet-300/95">
              ● live reflection · hold still
            </p>
          )}
          {mode === "auto" && (
            <p className="mt-1 font-mono text-base text-violet-300/95">
              ● autonomous pseudo-face
            </p>
          )}
          {notice && (
            <p className="mt-2 max-w-xs text-base text-violet-300">{notice}</p>
          )}
          <p className="mt-2 max-w-xs text-base text-muted-foreground">
            Keep your gaze soft and your head motionless. Move to return.
          </p>
          <div className="mt-3 max-w-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">dissolution</span>
              {strange && (
                <span className="font-mono text-xs text-violet-300">
                  ✦ strange face
                </span>
              )}
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-300 transition-[width] duration-150"
                style={{ width: `${Math.round(dissolve * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Design-notes toggle */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-6 top-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-black/50 px-4 py-2.5 text-base text-muted-foreground ring-1 ring-border backdrop-blur-md transition hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/80 px-6 py-16 backdrop-blur-md">
          <div className="max-w-2xl text-muted-foreground">
            <h2 className="font-mono text-2xl text-foreground">Notes</h2>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The question.</span> What if
              staring into your own reflection dissolved your face? In dim light,
              after about a minute of still mirror-gazing, people reliably report
              that the face in the mirror is no longer their own — a stranger, a
              distorted mask, someone else looking back. This induces that on
              purpose in the browser.
            </p>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Technique.</span> A WebGL2 pipeline
              turns your webcam (tracked by MediaPipe FaceLandmarker, used only to
              measure how still you are) into a dark mirror. The longer your
              facial motion stays low, one scalar{" "}
              <span className="font-mono text-foreground">dissolve</span> climbs — and
              with it the reflection (a) loses edge definition toward the
              periphery while the centre stays sharp{" "}
              <span className="text-foreground">(Troxler fading)</span>, (b) folds
              into N-fold radial mirror symmetry, and (c) slowly warps and
              hue-drifts through an optical ping-pong feedback loop. Any real
              motion snaps it back to clarity. Sound thins and detunes, a low
              slow beat deepens, and a soft shiver marks the strange-face
              threshold.
            </p>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">References.</span> Giovanni B.
              Caputo, &ldquo;Strange-Face-in-the-Mirror Illusion&rdquo;{" "}
              (<em>Perception</em>, 2010); Caputo et al. (2023) on strange-face
              illusions and derealization / depersonalization / dissociation; and
              Ignaz Paul Vital Troxler&apos;s 1804 observation of peripheral
              fading (Troxler fading).
            </p>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Honest scope.</span> Face tracking
              itself is not new here. The fresh move is the dissolution
              mechanism: stillness-driven Troxler fade plus radial-symmetry
              folding plus optical feedback, staged as a Caputo mirror-gaze
              rather than a party filter.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
