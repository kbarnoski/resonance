"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Kinetic Dancer — a few flat, identical, un-shaded ivory dots that your brain
// assembles into a living person turning in place, and then flips the direction
// it spins. Johansson point-light biological motion × orthographic
// structure-from-motion × the bistable Spinning Dancer illusion.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { KineticDancer, hasWebGL, type DancerSample } from "./scene";
import { DancerAudio } from "./audio";

type Phase = "idle" | "running" | "error";

export default function KineticDancerPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<KineticDancer | null>(null);
  const audioRef = useRef<DancerAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sampleRef = useRef<DancerSample>({ effBias: 0, userBias: 0 });
  const dragRef = useRef<{ active: boolean; lastX: number }>({
    active: false,
    lastX: 0,
  });

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [bias, setBias] = useState(0);
  const [noise, setNoise] = useState(0);
  const [audioOnly, setAudioOnly] = useState(false);
  const [readout, setReadout] = useState({ dir: "ambiguous", eff: 0 });

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const teardown = useCallback(() => {
    sceneRef.current?.dispose();
    sceneRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => {
        ctx.close().catch(() => {});
      }, 600);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  // Poll the scene for the live percept-bias readout and keep audio in sync.
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      const s = sampleRef.current;
      // In audio-only mode the audio follows the manual bias slider (visual
      // stays neutral); otherwise it follows the figure's effective tilt bias.
      const audioDir = audioOnly ? bias : s.effBias;
      audioRef.current?.setDirection(audioDir);
      const eff = audioOnly ? bias : s.effBias;
      const dir =
        eff > 0.06
          ? "clockwise (seen from above)"
          : eff < -0.06
            ? "counter-clockwise"
            : "ambiguous — your call";
      setReadout({ dir, eff });
      if (!audioOnly && !dragRef.current.active) {
        setBias(Number(s.userBias.toFixed(2)));
      }
    }, 140);
    return () => clearInterval(id);
  }, [phase, audioOnly, bias]);

  const begin = useCallback(async () => {
    if (phase === "running") return;
    setErrorMsg(null);

    const container = containerRef.current;
    if (!container) {
      setPhase("error");
      setErrorMsg("Could not mount the canvas.");
      return;
    }
    if (!hasWebGL()) {
      setPhase("error");
      setErrorMsg(
        "WebGL is unavailable on this device, so the rotating point cloud can't render. A static point-light figure is shown instead.",
      );
      return;
    }

    let scene: KineticDancer;
    try {
      scene = new KineticDancer(container, {
        seed: 0x1129,
        onSample: (s) => {
          sampleRef.current = s;
        },
      });
    } catch {
      setPhase("error");
      setErrorMsg("WebGL failed to initialise, so the figure can't render.");
      return;
    }
    sceneRef.current = scene;
    scene.setReducedMotion(!!reducedMotion);
    scene.setSpeed(speed);
    scene.setNoise(noise);
    scene.setVisualBias(!audioOnly);
    scene.setDriftEnabled(!audioOnly);
    scene.start();

    // Audio — created and resumed from this user gesture.
    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const audio = new DancerAudio(ctx);
      audio.start();
      audioRef.current = audio;
    } catch {
      // Visuals still run; audio simply stays silent.
    }

    setPhase("running");
  }, [phase, reducedMotion, speed, noise, audioOnly]);

  // ── Drag-to-bias (pointer + touch) ─────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!sceneRef.current) return;
    dragRef.current = { active: true, lastX: e.clientX };
    sceneRef.current.setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current.active || !sceneRef.current) return;
      const w = containerRef.current?.clientWidth || 1;
      const dx = (e.clientX - dragRef.current.lastX) / w;
      dragRef.current.lastX = e.clientX;
      if (audioOnly) {
        setBias((b) => Math.max(-1, Math.min(1, b + dx * 1.6)));
      } else {
        sceneRef.current.nudge(dx);
      }
    },
    [audioOnly],
  );

  const endDrag = useCallback((e: React.PointerEvent) => {
    dragRef.current.active = false;
    sceneRef.current?.setDragging(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  // ── Control wiring ─────────────────────────────────────────────────────────
  const onSpeed = (v: number) => {
    setSpeed(v);
    sceneRef.current?.setSpeed(v);
  };
  const onNoise = (v: number) => {
    setNoise(v);
    sceneRef.current?.setNoise(v);
  };
  const onBias = (v: number) => {
    setBias(v);
    if (!audioOnly) sceneRef.current?.setUserBias(v);
  };
  const onAudioOnly = (v: boolean) => {
    setAudioOnly(v);
    sceneRef.current?.setVisualBias(!v);
    sceneRef.current?.setDriftEnabled(!v);
    if (v) sceneRef.current?.setUserBias(0);
  };

  return (
    <main className="min-h-screen bg-[#111a26] text-white/95">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1
          className="text-2xl sm:text-3xl font-serif tracking-tight text-white/95"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          Kinetic Dancer
        </h1>
        <p className="mt-2 text-base text-white/75">
          Fourteen flat, identical dots — no shading, no depth — yet your brain
          builds a person turning in place, and decides for itself which way she
          spins. Drag the figure to tip the illusion; let go and watch it flip.
        </p>

        {/* Stage */}
        <div
          ref={containerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative mt-5 aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-lg border border-white/10 bg-[#18212f]"
          style={{ cursor: phase === "running" ? "ew-resize" : "default" }}
        >
          {phase !== "running" && (
            <div className="absolute inset-0 flex items-center justify-center">
              {phase === "error" ? (
                <StaticFigure />
              ) : (
                <button
                  onClick={begin}
                  className="min-h-[44px] rounded-md bg-white/90 px-4 py-2.5 text-base font-medium text-[#111a26] transition hover:bg-white"
                >
                  Begin
                </button>
              )}
            </div>
          )}
        </div>

        {phase === "error" && errorMsg && (
          <p className="mt-3 text-base text-rose-300">{errorMsg}</p>
        )}

        {/* Readout */}
        {phase === "running" && (
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-base">
            <span className="text-white/75">
              Committed reading:{" "}
              <span className="text-white/95">{readout.dir}</span>
            </span>
            <span className="text-white/75">
              bias{" "}
              <span className="tabular-nums text-white/95">
                {readout.eff >= 0 ? "+" : ""}
                {readout.eff.toFixed(2)}
              </span>
            </span>
          </div>
        )}

        {/* Controls */}
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-base text-white/75">
            <span>Rotation speed — {speed.toFixed(2)}×</span>
            <input
              type="range"
              min={0.35}
              max={2.5}
              step={0.05}
              value={speed}
              onChange={(e) => onSpeed(Number(e.target.value))}
              className="h-11 accent-amber-200"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-base text-white/75">
            <span>
              Bias {audioOnly ? "(audio pan)" : "(visual tilt)"} —{" "}
              {bias >= 0 ? "+" : ""}
              {bias.toFixed(2)}
            </span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.02}
              value={bias}
              onChange={(e) => onBias(Number(e.target.value))}
              className="h-11 accent-amber-200"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-base text-white/75">
            <span>Noise field — {Math.round(noise * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={noise}
              onChange={(e) => onNoise(Number(e.target.value))}
              className="h-11 accent-amber-200"
            />
          </label>

          <label className="flex min-h-[44px] items-center gap-3 text-base text-white/75">
            <input
              type="checkbox"
              checked={audioOnly}
              onChange={(e) => onAudioOnly(e.target.checked)}
              className="h-5 w-5 accent-amber-200"
            />
            <span>Audio-only bias (no visual cue — let sound tip it)</span>
          </label>
        </div>

        {/* Design notes */}
        <div className="mt-7">
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] text-base text-white/75 underline decoration-white/30 underline-offset-4 hover:text-white/95"
          >
            {showNotes ? "Hide the design notes" : "Read the design notes"}
          </button>
          {showNotes && (
            <div className="mt-3 space-y-3 rounded-lg border border-white/10 bg-white/5 p-4 text-base text-white/75">
              <p>
                Each dot is drawn flat and identical — a three.js{" "}
                <code className="text-white/90">PointsMaterial</code> with{" "}
                <code className="text-white/90">sizeAttenuation:false</code>{" "}
                under an <code className="text-white/90">OrthographicCamera</code>
                . Orthographic projection throws away depth, so the figure&apos;s
                real (always-the-same) rotation about the vertical axis is
                genuinely <em>ambiguous</em>: nothing in the image says whether
                the near shoulder is swinging left or right.
              </p>
              <p>
                Dragging adds a tiny <em>real</em> 3D tilt about the horizontal
                axis — the one cue that can break the tie and commit the percept.
                Release, and a slow seeded drift lets the bias wander back across
                zero, so the dancer can flip on her own. In{" "}
                <em>audio-only bias</em> mode that visual tilt is switched off
                entirely and only the stereo drone — bright &amp; panned right for
                clockwise, dark &amp; panned left for counter-clockwise — is left
                to tip you.
              </p>
              <p>
                The noise slider buries the walker among randomly-moving decoy
                dots: at high noise she only &quot;pops out&quot; once your brain
                locks on, echoing the 2026 finding that expectation drives
                detection of biological motion.
              </p>
              <p className="text-white/60">
                References: Johansson 1973 (point-light biological motion);
                Wallach &amp; O&apos;Connell 1953 and Ullman 1979 (kinetic depth /
                structure-from-motion); Kayahara 2003 (the Spinning Dancer);
                &ldquo;I see moving people&rdquo;, PMC 2026 (expectation &amp;
                detection in noisy point-light displays). The strength of the
                flip is per-viewer and can&apos;t be measured from the code alone.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// Static point-light silhouette for the no-WebGL fallback — never a blank page.
function StaticFigure() {
  const dots: [number, number][] = [
    [100, 24],
    [74, 62],
    [126, 62],
    [58, 96],
    [142, 90],
    [46, 128],
    [150, 70],
    [100, 108],
    [84, 116],
    [116, 116],
    [116, 158],
    [118, 196],
    [70, 150],
    [50, 168],
  ];
  return (
    <svg
      viewBox="0 0 200 220"
      className="h-full max-h-[90%] w-auto"
      aria-label="Static point-light figure"
    >
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={5} fill="#f3ecda" />
      ))}
    </svg>
  );
}
