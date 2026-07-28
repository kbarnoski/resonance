"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  AutoConductor,
  BeatEngine,
  IctusDetector,
  MotionTracker,
} from "./beat";
import { Ensemble } from "./ensemble";
import { BatonScene, type SceneState } from "./scene";

/* ------------------------------------------------------------------ *
 * 3416 — Baton
 * Conduct a small synth ensemble with your body — camera only, no
 * controller. Motion energy → derivative-threshold ictus → phase-locked
 * beat grid. The ensemble keeps its OWN inertial pulse: rush or drag and
 * it strains, detunes ~40 cents, drops notes, and can LOSE THE PULSE.
 * A seeded mulberry32(0x3416) auto-conductor demos the whole mechanic
 * with no camera, including a deliberate rush so the fail-state is visible.
 * ------------------------------------------------------------------ */

type CamStatus = "off" | "requesting" | "on" | "denied" | "unavailable";
type Source = "demo" | "live";

interface Readout {
  bpm: number;
  bar: number;
  tightness: number;
  instability: number;
}

export default function BatonPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);

  // engine objects (stable across renders)
  const engineRef = useRef(new BeatEngine());
  const autoRef = useRef(new AutoConductor());
  const detectorRef = useRef(new IctusDetector());
  const trackerRef = useRef(new MotionTracker(80, 60));
  const sceneRef = useRef<BatonScene | null>(null);
  const ensembleRef = useRef<Ensemble | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const schedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const sourceRef = useRef<Source>("demo");
  const camOnRef = useRef(false);
  const lastCentroidRef = useRef(0);

  const [phase, setPhase] = useState<"idle" | "playing">("idle");
  const [source, setSource] = useState<Source>("demo");
  const [camStatus, setCamStatus] = useState<CamStatus>("off");
  const [webglError, setWebglError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState<Readout>({
    bpm: 120,
    bar: 1,
    tightness: 1,
    instability: 0,
  });

  // ── the render/beat loop — runs from mount, silent until "Take the baton" ──
  useEffect(() => {
    const rm =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // three.js scene (may fail if no WebGL)
    if (mountRef.current) {
      try {
        sceneRef.current = new BatonScene(mountRef.current, rm);
      } catch {
        setWebglError(true);
      }
    }

    const engine = engineRef.current;
    const auto = autoRef.current;
    const detector = detectorRef.current;
    const tracker = trackerRef.current;

    let readoutAcc = 0;
    lastRef.current = performance.now();

    const loop = () => {
      const nowMs = performance.now();
      const now = nowMs / 1000;
      const dt = Math.min(0.05, (nowMs - lastRef.current) / 1000);
      lastRef.current = nowMs;

      // ── ictus source: live camera OR seeded auto-conductor ──
      if (camOnRef.current) {
        const frame = sampleFrame(videoRef.current, sampleRef.current);
        if (frame) {
          const { energy, centroidX } = tracker.compute(frame);
          lastCentroidRef.current = centroidX;
          if (detector.detect(energy, now)) {
            if (sourceRef.current !== "live") {
              sourceRef.current = "live";
              setSource("live");
            }
            engine.onIctus(now);
          }
        }
      }
      if (sourceRef.current === "demo" && auto.fire(now)) {
        engine.onIctus(now);
      }

      engine.step(dt);

      // ── drive the scene ──
      const scene = sceneRef.current;
      if (scene) {
        const frac = engine.totalBeats - Math.floor(engine.totalBeats);
        const beatPulse = Math.exp(-6 * frac);
        const isDown = ((Math.floor(engine.totalBeats) % 4) + 4) % 4 === 0;
        const st: SceneState = {
          levels: ensembleRef.current
            ? ensembleRef.current.levels()
            : [beatPulse * 0.5, 0.2, beatPulse * 0.4],
          instability: engine.instability,
          tightness: engine.tightness,
          centroidX: camOnRef.current ? lastCentroidRef.current : centroidDemo(now),
          beatPulse,
          downbeat: isDown ? beatPulse : beatPulse * 0.25,
        };
        scene.update(st, dt);
      }

      // ── throttled readout ──
      readoutAcc += dt;
      if (readoutAcc > 0.1) {
        readoutAcc = 0;
        setReadout({
          bpm: Math.round(engine.bpm),
          bar: engine.barBeat(),
          tightness: engine.tightness,
          instability: engine.instability,
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (schedRef.current != null) clearInterval(schedRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ensembleRef.current?.dispose();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
      sceneRef.current?.dispose();
    };
  }, []);

  // ── "Take the baton": create AudioContext in the gesture, start ensemble ──
  const takeBaton = useCallback(async () => {
    if (ctxRef.current) return;
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    try {
      await ctx.resume();
    } catch {
      /* resumed on next gesture */
    }
    ctxRef.current = ctx;
    const ens = new Ensemble(ctx);
    ens.start(engineRef.current.totalBeats);
    ensembleRef.current = ens;
    schedRef.current = setInterval(() => {
      const e = engineRef.current;
      ens.schedule(e.totalBeats, e.gridPeriod, e.instability);
    }, 25);
    setPhase("playing");
  }, []);

  // ── "Use my camera": request getUserMedia, wire the video element ──
  const useCamera = useCallback(async () => {
    if (camOnRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamStatus("unavailable");
      return;
    }
    setCamStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      trackerRef.current.reset();
      detectorRef.current.reset();
      camOnRef.current = true;
      setCamStatus("on");
    } catch {
      setCamStatus("denied");
    }
  }, []);

  const instabPct = Math.round(readout.instability * 100);
  const lost = readout.instability > 0.6;

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* three.js output */}
      <div ref={mountRef} className="absolute inset-0" />

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="text-sm text-destructive">
            WebGL is unavailable, so the orbs can&apos;t render — but the seeded
            ensemble still keeps its pulse. Turn on sound with the baton below.
          </p>
        </div>
      )}

      {/* top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="pointer-events-auto">
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`inline-block rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] ${
                  source === "live"
                    ? "bg-primary/20 text-primary"
                    : "bg-accent text-muted-foreground"
                }`}
              >
                {source === "live" ? "● Live" : "◐ Demo"}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                3416 · baton
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Conduct the ensemble
            </h1>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Your body is the baton. Keep the beat steady and the three voices
              lock in tune; rush or drag and they strain, detune, and can lose
              the pulse. Your beat <em>is</em> the performance.
            </p>
          </div>

          <Link
            href="/dream"
            className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            ← dream
          </Link>
        </div>
      </div>

      {/* live video thumbnail (frames stay local) */}
      <video
        ref={videoRef}
        className={`absolute right-5 top-24 h-20 w-28 rounded-md border border-border object-cover opacity-60 transition-opacity sm:top-28 ${
          camStatus === "on" ? "block" : "hidden"
        }`}
        muted
        playsInline
      />
      <canvas ref={sampleRef} width={80} height={60} className="hidden" />

      {/* bottom chrome: readouts + meters + controls */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-5 sm:p-7">
        {/* readout row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>
            <span className="text-foreground">{readout.bpm}</span> bpm
          </span>
          <span className="flex items-center gap-1">
            bar
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className={
                  n === readout.bar ? "text-primary" : "text-muted-foreground/40"
                }
              >
                {n}
              </span>
            ))}
          </span>
          <span>
            tight{" "}
            <span className="text-foreground">
              {Math.round(readout.tightness * 100)}%
            </span>
          </span>
          <span className={lost ? "text-destructive" : ""}>
            strain <span className="text-foreground">{instabPct}%</span>
          </span>
        </div>

        {/* the fail meter */}
        <div className="max-w-xl">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              pulse lock
            </span>
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
                lost ? "text-destructive" : "text-muted-foreground/50"
              }`}
            >
              {lost ? "lost the pulse" : "locked"}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent">
            <div
              className={`h-full rounded-full transition-[width] duration-150 ${
                lost ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${Math.max(2, instabPct)}%` }}
            />
          </div>
        </div>

        {/* controls */}
        <div className="flex flex-wrap items-center gap-3">
          {phase === "idle" ? (
            <button
              onClick={takeBaton}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Take the baton
            </button>
          ) : (
            <button
              onClick={useCamera}
              disabled={camStatus === "on" || camStatus === "requesting"}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              {camStatus === "on"
                ? "Camera on — you're conducting"
                : camStatus === "requesting"
                  ? "Requesting camera…"
                  : "Use my camera"}
            </button>
          )}

          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>

          {(camStatus === "denied" || camStatus === "unavailable") && (
            <span className="text-sm text-destructive">
              {camStatus === "denied"
                ? "Camera denied — the seeded auto-conductor is driving the ensemble."
                : "No camera here — the seeded auto-conductor is driving the ensemble."}
            </span>
          )}
          {phase === "idle" && (
            <span className="text-xs text-muted-foreground">
              Silent preview is running — start sound to hear the ensemble.
            </span>
          )}
        </div>

        <p className="max-w-xl font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
          Camera frames are downscaled to 80×60 and processed on-device only —
          never uploaded, never stored.
        </p>
      </div>

      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}

      <PrototypeNav
        slugs={[
          "3416-baton",
        ]}
      />
    </main>
  );
}

// ── helpers (non-hook names) ────────────────────────────────────────────────

/** Draw the video to the 80×60 sampling buffer and return its pixels. */
function sampleFrame(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
): Uint8ClampedArray | null {
  if (!video || !canvas || video.readyState < 2) return null;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return null;
  }
}

/** Gentle seeded-looking centroid sway for the demo conductor marker. */
function centroidDemo(now: number): number {
  return Math.sin(now * 0.9) * 0.5 + Math.sin(now * 0.37) * 0.3;
}

function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tracking-tight">Baton — design notes</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            The camera never runs pose or hand tracking. Each frame is
            downscaled to 80×60 luminance and reduced to one number — global{" "}
            <em>motion energy</em>. The beat instant (the <em>ictus</em>) is a
            peak not in that energy but in its <em>derivative</em>: we track a
            running mean+σ of d(energy)/dt and fire when it crosses mean + 1.6σ
            after a 180 ms refractory gap. A conductor&apos;s downbeat is an{" "}
            <em>acceleration</em> of the hand, so the derivative is where the
            beat actually lives — this is what makes camera-conducting feel
            crisp instead of mushy.
          </p>
          <p>
            Each ictus feeds an EWMA tempo estimate and a phase-locked loop that
            steers a beat grid. The ensemble runs on its OWN inertial clock that
            follows the grid slowly. Conduct evenly and it locks in tune; rush or
            drag and a gap opens — voices detune up to ~40 cents, the lead drops
            notes, and the red pulse-lock meter fills. It only recedes when you
            steady the beat and the loop re-locks.
          </p>
          <p>
            With no camera, a seeded{" "}
            <code className="text-foreground">mulberry32(0x3416)</code>{" "}
            auto-conductor drives the same pipeline — and every ~21 s it
            deliberately rushes so you can watch the ensemble strain, then
            recover.
          </p>
          <p className="text-muted-foreground/80">
            References — Sympathetic Orchestra (CHI 2026,
            doi.org/10.1145/3772363.3798418); arXiv:2604.27957, &ldquo;Real-Time
            Control of a Virtual Orchestra by Recognition of Conducting
            Gestures&rdquo; (2026); Max Mathews&apos; Radio-Baton / Conductor
            Program (Bell Labs, 1989).
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Close
        </button>
      </div>
    </div>
  );
}
