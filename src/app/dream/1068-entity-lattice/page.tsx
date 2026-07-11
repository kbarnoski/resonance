"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LatticeScene } from "./scene";
import { startAudio, type LatticeAudio } from "./audio";
import { startPose, type PoseRig, type PoseMode } from "./pose";

type Phase = "idle" | "starting" | "running" | "error";

export default function EntityLatticePage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<LatticeScene | null>(null);
  const audioRef = useRef<LatticeAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const poseRef = useRef<PoseRig | null>(null);
  const tickRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const lastBreakNotchRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<PoseMode | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [breakLevel, setBreakLevel] = useState(0);

  const teardown = useCallback(() => {
    if (tickRef.current) cancelAnimationFrame(tickRef.current);
    tickRef.current = 0;
    sceneRef.current?.dispose();
    sceneRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    poseRef.current?.stop();
    poseRef.current = null;
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

    const container = containerRef.current;
    if (!container) {
      setPhase("error");
      setErrorMsg("Could not mount the canvas.");
      return;
    }

    // ── Visuals (WebGL may be unavailable → graceful notice) ──────────────────
    let scene: LatticeScene;
    try {
      scene = new LatticeScene(container);
    } catch {
      setPhase("error");
      setErrorMsg(
        "WebGL is unavailable on this device, so the entity-lattice can't render.",
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

    // ── Pose (camera or synthetic demo body — always resolves) ────────────────
    const rig = await startPose();
    poseRef.current = rig;
    setMode(rig.mode);

    // ── Drive loop: body → drive → lattice + ascent ───────────────────────────
    lastRef.current = performance.now();
    const drive = () => {
      const now = performance.now();
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);

      const f = poseRef.current?.read(dt);
      const sc = sceneRef.current;
      if (f && sc) {
        sc.setPose(f.joints, f.motion, f.lift, f.spread);
        const d = sc.getDrive();
        audioRef.current?.setDrive(d);
        const b = sc.getBreakthrough();
        audioRef.current?.setBreakthrough(b);
        // Throttle React re-renders: only update the meter when it moves a notch.
        const notch = Math.round(b * 20);
        if (notch !== lastBreakNotchRef.current) {
          lastBreakNotchRef.current = notch;
          setBreakLevel(b);
        }
      }
      audioRef.current?.step(dt);

      tickRef.current = requestAnimationFrame(drive);
    };
    tickRef.current = requestAnimationFrame(drive);

    setPhase("running");
  }, [phase]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#05030f] text-foreground">
      {/* Full-screen three.js canvas mounts here, behind the UI. */}
      <div ref={containerRef} className="absolute inset-0" aria-hidden />

      {/* Faint radial vignette so the background is never flat black. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(40,16,90,0.18)_0%,transparent_45%,rgba(3,2,12,0.72)_100%)]" />

      {/* ── Idle / start panel ─────────────────────────────────────────────── */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-xl rounded-2xl bg-black/50 p-8 backdrop-blur-md ring-1 ring-border">
            <h1 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Entity Lattice
            </h1>
            <p className="mt-3 text-base leading-relaxed text-foreground">
              Your whole moving body, multiplied by camera body-tracking into a
              luminous DMT-style hyperspace lattice — recursive kaleidoscopic
              copies of yourself across more directions than there should be. The
              harder you move, lift and spread your arms, the faster an endless
              rising glissando climbs toward breakthrough.
            </p>

            <button
              type="button"
              onClick={begin}
              disabled={phase === "starting"}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-card px-4 py-2.5 text-base font-medium text-black transition hover:bg-accent disabled:opacity-60"
            >
              {phase === "starting" ? "Entering…" : "Start · allow camera"}
            </button>

            {errorMsg && (
              <p className="mt-4 text-base text-violet-300">{errorMsg}</p>
            )}

            <p className="mt-4 text-base text-muted-foreground">
              Stand back so your body is in frame and move freely. We use the
              camera only to drive the lattice in your browser — nothing is
              recorded or sent anywhere. Without a camera it runs a synthetic demo
              body so the lattice still lives and the ascent still climbs.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Intense by design: fast motion and brightness swells, no hard
              strobing. Use headphones for the rising tone.
            </p>
          </div>
        </div>
      )}

      {/* ── Running HUD ────────────────────────────────────────────────────── */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-6 top-6 select-none">
          <h1 className="font-serif text-2xl text-foreground">Entity Lattice</h1>
          {mode === "body" && (
            <p className="mt-1 font-mono text-base text-violet-300/95">
              ● body tracking
            </p>
          )}
          {mode === "demo" && (
            <p className="mt-1 font-mono text-base text-violet-300/95">
              ● demo body (no camera)
            </p>
          )}
          <p className="mt-2 max-w-xs text-base text-muted-foreground">
            Move. Lift your arms. Spread wide. Fast limbs glow gold; sustain the
            intensity and the lattice locks into a held mandala.
          </p>
          {/* Breakthrough meter — fills as you charge, latches at the mandala. */}
          <div className="mt-3 max-w-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">breakthrough</span>
              {breakLevel >= 0.95 && (
                <span className="font-mono text-xs text-violet-300/95">
                  ✦ mandala
                </span>
              )}
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-200 transition-[width] duration-150"
                style={{ width: `${Math.round(breakLevel * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Design-notes toggle (renders notes in-page) ────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-6 top-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-black/50 px-4 py-2.5 text-base text-foreground ring-1 ring-border backdrop-blur-md transition hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/75 px-6 py-16 backdrop-blur-md">
          <div className="max-w-2xl text-foreground">
            <h2 className="font-serif text-2xl text-foreground">Design notes</h2>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The question.</span> What if your
              whole moving body were multiplied — by camera body-tracking — into a
              luminous DMT-style hyperspace entity-lattice, where the
              &ldquo;entities&rdquo; are recursive kaleidoscopic copies of yourself
              across more directions than there should be, and the intensity of
              your motion drives an endless rising glissando toward breakthrough?
            </p>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Technique.</span> MediaPipe Pose
              tracks 33 landmarks; 12 key joints are normalised to a centred
              [-1,1] space and passed as a{" "}
              <span className="font-mono text-foreground">uniform vec3 uJoints[12]</span>{" "}
              to a custom GPU point shader. ~200,000{" "}
              <span className="font-mono text-foreground">THREE.Points</span> each
              carry a joint index, a symmetry slot and a small random offset. In
              the vertex shader each particle&apos;s joint is reflected and rotated
              across a high-fold radial kaleidoscope about the view axis (6→12
              fold with drive), mirrored in z, and repeated through concentric
              recursive shells — so one body tiles into a crystalline lattice of
              copies in &ldquo;more directions than there should be.&rdquo;
              Additive blending, indigo→magenta→gold-white by distance-from-core
              and speed, over a deep indigo vignette.
            </p>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The ascent.</span> Body motion, arm-lift
              and arm-spread fold into a single drive 0..1. Drive raises the rate
              and brightness of a Shepard–Risset endless glissando, opens the
              just-intonation drone&apos;s lowpass and saturation, blooms a
              convolution-void reverb, and densifies the lattice — so approaching
              breakthrough is heard, felt and seen at once. A sudden body surge
              fires a brief inharmonic bell accent. Everything runs through a
              limiter; nothing sounds until you tap Start.
            </p>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">References.</span>{" "}
              <em>&ldquo;Waves of Connection,&rdquo;</em> Osaka Expo 2025 — three.js
              + WebGPU rendering ~1M particles in real time on a 98-inch 4K display
              with Kinect body tracking, the embodied-installation frontier (Safari
              26, Sept 2025, made WebGPU universal). Graham St John,{" "}
              <em>
                &ldquo;The Breakthrough Experience: DMT Hyperspace and its Liminal
                Aesthetics&rdquo;
              </em>{" "}
              (Anthropology of Consciousness, 2018) — accelerating geometric
              movement, ascending sound, &ldquo;more directions in space than there
              should be,&rdquo; entity-contact. Heinrich Klüver&apos;s form
              constants; Roger Shepard / Jean-Claude Risset&apos;s endless
              glissando.
            </p>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Cycle 2 — breakthrough &amp; velocity
              colouring.</span> Each particle is now coloured by its joint&apos;s{" "}
              <em>true</em> per-frame speed, so a fast limb paints its copies hot
              gold-white while a still torso stays deep indigo — the lattice is
              literally painted by where your body moves. And the piece now has an{" "}
              <em>arc</em>: sustaining high drive charges a breakthrough meter; cross
              it and the lattice <em>latches</em> a held hyper-symmetric mandala —
              the fold snaps to maximum, the kaleidoscope spin freezes, everything
              floods gold, and a high just-intonation shimmer chord blooms in — for
              a bounded dwell before a refractory cool-down. The synthetic demo body
              self-drives a vigorous passage every ~40 s so the whole machine shows
              with no camera.
            </p>

            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Still ahead.</span> Depth-aware z from the
              pose so leaning in/out scales the lattice; a WebGPU/TSL compute path
              toward the Osaka million-particle scale; entity &ldquo;gaze&rdquo;
              where the nearest copies orient toward you at peak drive; multi-body
              lattices when two people are in frame.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
