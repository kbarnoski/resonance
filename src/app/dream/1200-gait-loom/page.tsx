"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1200-gait-loom — your gait is the sequencer's transport.
//
//   MediaPipe Pose (CDN, VIDEO mode, 33 landmarks) tracks your stepping cadence;
//   the prototype locks a rhythmic clock (BPM) to your gait and weaves a granular
//   groove — footfalls drop low granular thuds, wrists spray bright grains, all
//   quantized to the gait clock and looped around a rotating radial step-loom.
//   Walk faster → the whole groove speeds up; stop → the loom unravels to silence.
//   Camera denied / model down / no WebGL → the SAME clock + granular engine runs
//   from on-screen limb pads, a tap-tempo button and the spacebar. Chromatic
//   chiaroscuro palette (ember + teal on graphite). No strobe.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { startPose, type PoseRig } from "./pose";
import { createGaitEngine, type GaitEngine, type Limb } from "./gait";
import { createGranularLoom, type GranularLoom } from "./grains";
import { createLoomRenderer, type LoomRenderer } from "./render";

type Phase = "idle" | "starting" | "running";
type Mode = "pose" | "pads";

const PADS: { limb: Limb; label: string; hint: string }[] = [
  { limb: "footL", label: "L foot", hint: "low thud" },
  { limb: "wristL", label: "L wrist", hint: "bright spray" },
  { limb: "wristR", label: "R wrist", hint: "bright spray" },
  { limb: "footR", label: "R foot", hint: "low thud" },
];

export default function GaitLoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const loomRef = useRef<GranularLoom | null>(null);
  const gaitRef = useRef<GaitEngine | null>(null);
  const rigRef = useRef<PoseRig | null>(null);
  const rendererRef = useRef<LoomRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const hudCounterRef = useRef<number>(0);
  // Fallback tap-tempo state.
  const lastTapRef = useRef<number>(0);
  const tapBpmRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("pose");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [activePad, setActivePad] = useState<Limb | null>(null);
  const [hud, setHud] = useState({ bpm: 100, cadence: 0, locked: false });

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    loomRef.current?.stop();
    loomRef.current = null;
    rigRef.current?.stop();
    rigRef.current = null;
    gaitRef.current = null;
    const ctx = audioRef.current;
    audioRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 500);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }, []);

  useEffect(() => {
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  const runLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const gait = gaitRef.current;
    const loom = loomRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !ctx || !gait || !loom || !renderer) return;

    const t = (performance.now() - startTimeRef.current) / 1000;
    const rig = rigRef.current;
    const frame = rig ? rig.read() : { present: false, landmarks: null };

    const read = gait.update(frame.landmarks, t);

    // Gait tempo → loom transport; body motion → loom energy.
    // If the fallback tap-tempo set a BPM, prefer it until real gait locks.
    const bpm = read.locked || tapBpmRef.current === 0 ? read.bpm : tapBpmRef.current;
    loom.setBpm(bpm);
    loom.setEnergy(read.motion);

    for (const hit of read.footfalls) loom.feed(hit);
    for (const hit of read.swings) loom.feed(hit);

    loom.pump();
    const loomState = loom.drain();

    renderer.draw({
      ctx,
      w: canvas.width,
      h: canvas.height,
      time: t,
      loom: loomState,
      landmarks: frame.landmarks,
      motion: read.motion,
      locked: read.locked,
      cadence: read.cadence,
    });

    hudCounterRef.current += 1;
    if (hudCounterRef.current % 8 === 0) {
      setHud({
        bpm: Math.round(loomState.bpm),
        cadence: Math.round(read.cadence),
        locked: read.locked,
      });
    }

    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  const begin = useCallback(
    async (wantCamera: boolean) => {
      if (phase === "starting" || phase === "running") return;
      setPhase("starting");
      setNotice(null);
      resizeCanvas();

      // AudioContext must be created/resumed from this user gesture.
      let ctx: AudioContext;
      try {
        ctx = new AudioContext();
        if (ctx.state === "suspended") await ctx.resume();
      } catch {
        setPhase("idle");
        setNotice("Web Audio is unavailable on this device.");
        return;
      }
      audioRef.current = ctx;
      loomRef.current = createGranularLoom(ctx);
      gaitRef.current = createGaitEngine();
      rendererRef.current = createLoomRenderer();

      if (wantCamera) {
        const { rig, fallbackReason } = await startPose();
        if (rig) {
          rigRef.current = rig;
          setMode("pose");
        } else {
          setMode("pads");
          setNotice(fallbackReason);
        }
      } else {
        setMode("pads");
      }

      startTimeRef.current = performance.now();
      setPhase("running");
      rafRef.current = requestAnimationFrame(runLoop);
    },
    [phase, resizeCanvas, runLoop],
  );

  // ── fallback triggers (pads / spacebar / tap-tempo) ──────────────────────
  const fireLimb = useCallback((limb: Limb) => {
    const gait = gaitRef.current;
    if (!gait) return;
    const pan =
      limb === "footL" || limb === "wristL"
        ? -0.6
        : limb === "footR" || limb === "wristR"
          ? 0.6
          : 0;
    gait.manualStep(limb, 0.9, pan);
    // Feed the tap-tempo estimator on foot events.
    if (limb === "footL" || limb === "footR") {
      const now = performance.now();
      const dt = (now - lastTapRef.current) / 1000;
      if (dt > 0.25 && dt < 2.0) {
        const b = 60 / dt;
        tapBpmRef.current = tapBpmRef.current
          ? tapBpmRef.current * 0.6 + b * 0.4
          : b;
      }
      lastTapRef.current = now;
    }
  }, []);

  const pressPad = useCallback(
    (limb: Limb) => {
      setActivePad(limb);
      fireLimb(limb);
      window.setTimeout(() => setActivePad((p) => (p === limb ? null : p)), 120);
    },
    [fireLimb],
  );

  useEffect(() => {
    if (phase !== "running" || mode !== "pads") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        // Alternate feet on each spacebar "step".
        const foot = hudCounterRef.current % 2 === 0 ? "footL" : "footR";
        fireLimb(foot);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, mode, fireLimb]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#0d0f13] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* ── Idle / start panel ─────────────────────────────────────────────── */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-xl rounded-3xl bg-black/55 p-8 ring-1 ring-border backdrop-blur-md">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Gait Loom
            </h1>
            <p className="mt-1 font-mono text-base text-violet-300">
              your gait is the step sequencer
            </p>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Step in place or walk on the spot in view of the camera. The loom
              locks a tempo to your cadence: every footfall drops a low granular
              thud onto the ring, every swing of a wrist sprays bright grains, and
              a groove weaves itself around the clock. Walk faster and the whole
              thing speeds up; stop and the loom slowly unravels to silence.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => begin(true)}
                disabled={phase === "starting"}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-card px-4 py-2.5 text-base font-medium text-black transition hover:bg-accent disabled:opacity-60"
              >
                {phase === "starting" ? "Warming up the loom…" : "Start camera · step"}
              </button>
              <button
                type="button"
                onClick={() => begin(false)}
                disabled={phase === "starting"}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-muted px-4 py-2.5 text-base font-medium text-foreground ring-1 ring-border transition hover:bg-accent disabled:opacity-60"
              >
                No camera — use limb pads
              </button>
            </div>

            {notice && <p className="mt-4 text-base text-violet-300">{notice}</p>}

            <p className="mt-5 text-base text-muted-foreground">
              The camera runs entirely in your browser — nothing is recorded or
              sent anywhere. Use headphones; audio starts only when you press a
              button. Slow glows only — no strobing.
            </p>
          </div>
        </div>
      )}

      {/* ── Running HUD ─────────────────────────────────────────────────────── */}
      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-6 top-6 select-none">
            <h1 className="text-2xl font-semibold text-foreground drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
              Gait Loom
            </h1>
            {mode === "pose" ? (
              <p className="mt-1 font-mono text-base text-violet-300/95">
                ● live body · step to drive the clock
              </p>
            ) : (
              <p className="mt-1 font-mono text-base text-violet-300/95">
                ● fallback · pads / spacebar drive the clock
              </p>
            )}
            {notice && (
              <p className="mt-2 max-w-xs text-base text-violet-300">{notice}</p>
            )}
            <p className="mt-2 font-mono text-base text-muted-foreground">
              {hud.locked
                ? `gait-locked · ${hud.cadence} steps/min`
                : "seeking a steady cadence…"}
            </p>
          </div>

          {/* Fallback limb pads + tap tempo */}
          {mode === "pads" && (
            <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-4 px-6">
              <div className="flex flex-wrap justify-center gap-3">
                {PADS.map((p) => (
                  <button
                    key={p.limb}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      pressPad(p.limb);
                    }}
                    className={`inline-flex min-h-[64px] min-w-[92px] flex-col items-center justify-center rounded-2xl px-4 py-2.5 ring-1 backdrop-blur-md transition ${
                      activePad === p.limb
                        ? "bg-card text-black ring-border"
                        : p.limb === "footL" || p.limb === "footR"
                          ? "bg-violet-500/15 text-violet-200 ring-violet-300/30 hover:bg-violet-500/25"
                          : "bg-violet-500/15 text-violet-200 ring-violet-300/30 hover:bg-violet-500/25"
                    }`}
                  >
                    <span className="text-base font-semibold">{p.label}</span>
                    <span className="mt-0.5 font-mono text-sm opacity-70">{p.hint}</span>
                  </button>
                ))}
              </div>
              <p className="font-mono text-base text-muted-foreground">
                tap the foot pads (or press spacebar) in a steady rhythm — the loom
                locks its tempo to your taps
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Design notes ────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute bottom-6 right-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-black/50 px-4 py-2.5 text-base text-foreground ring-1 ring-border backdrop-blur-md transition hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/85 px-6 py-16 backdrop-blur-md">
          <div className="max-w-2xl text-muted-foreground">
            <h2 className="text-2xl font-semibold text-foreground">
              Gait Loom — design notes
            </h2>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The question.</span> What if walking —
              or stepping in place — were a step sequencer, your gait setting the
              tempo and your limbs weaving a granular rhythm?
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Technique.</span> MediaPipe Pose gives
              33 body landmarks per frame. A per-foot state machine watches each
              ankle&rsquo;s vertical motion (normalized by torso height): a lift
              then a plant registers a footfall. The intervals between footfalls
              estimate a cadence, which is median- and EMA-smoothed into a BPM
              (clamped ~60–160) — the loom&rsquo;s transport. Wrist velocity peaks
              fire limb-swings between the beats.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Voice.</span> Granular synthesis, not a
              choir or drone. Two source buffers are synthesized at load — a
              filtered-noise burst and a decaying resonator ping — and every hit
              granulates them: short Hann-windowed slices pitched by playbackRate
              and panned by which limb fired. Footfalls = low granular thuds; wrists
              = bright high sprays. Grains are quantized into a 16-step ring at the
              gait BPM; each cycle replays them, and slot lives decay so the loop
              unravels when you stop.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Lineage.</span> Curtis Roads,
              <em> Microsound</em> (2001); Myron Krueger&rsquo;s <em>Videoplace</em>
              {" "}(1974–75) for full-body interaction; and the &ldquo;Sonified
              Body&rdquo; practice of mapping skeletal movement to sound.
            </p>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Full mapping table, fallback behaviour, safety and references live in
              this prototype&rsquo;s README.md.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
