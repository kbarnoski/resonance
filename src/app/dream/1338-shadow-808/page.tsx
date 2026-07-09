"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSequencer,
  STEPS,
  VOICES,
  type Sequencer,
} from "./sequencer";
import {
  startSilhouette,
  type MotionSample,
  type SilhouetteHandle,
} from "./silhouette";
import { drawScene, hitCell, layoutGrid } from "./draw";

type Phase = "idle" | "running";
type CamStatus = "camera" | "touch";

interface Hud {
  bpm: number;
  phase: string;
  density: number;
  intensity: number;
}

export default function ShadowEightOhEight() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const seqRef = useRef<Sequencer | null>(null);
  const silRef = useRef<SilhouetteHandle | null>(null);
  const motionRef = useRef<MotionSample | null>(null);
  const rafRef = useRef<number>(0);
  const lastStepRef = useRef<number>(-1);
  const reducedRef = useRef<boolean>(false);
  const hudTickRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [camStatus, setCamStatus] = useState<CamStatus>("touch");
  const [camNotice, setCamNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [bpm, setBpmState] = useState(120);
  const [swing, setSwingState] = useState(0.16);
  const [hud, setHud] = useState<Hud>({
    bpm: 120,
    phase: "normal",
    density: 0,
    intensity: 0,
  });

  const runLoop = useCallback(() => {
    const seq = seqRef.current;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!seq || !canvas || !ctx) return;

    // pull a fresh camera sample (also drives the silhouette glow)
    const sil = silRef.current;
    if (sil) {
      const s = sil.sample();
      motionRef.current = s;
      seq.setMotionIntensity(s.intensity);
    }

    const snap = seq.getSnapshot();

    // WRITE THE PATTERN BY DANCING: when the playhead advances to a new
    // step, arm every voice whose cell your silhouette is occupying.
    if (snap.step !== lastStepRef.current) {
      lastStepRef.current = snap.step;
      const m = motionRef.current;
      if (m) {
        for (let r = 0; r < VOICES; r++) {
          if (m.occ[r][snap.step]) {
            seq.armCell(VOICES - 1 - r, snap.step);
          }
        }
      }
    }

    const now = ctx.currentTime;
    const playhead = seq.getPlayhead(now);

    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const needW = Math.round(cssW * dpr);
    const needH = Math.round(cssH * dpr);
    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width = needW;
      canvas.height = needH;
    }
    const g = canvas.getContext("2d");
    if (g) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene({
        ctx: g,
        w: cssW,
        h: cssH,
        snap,
        motion: motionRef.current,
        playhead,
        now,
        reduced: reducedRef.current,
      });
    }

    // throttled HUD update (~6fps) so React doesn't churn every frame
    hudTickRef.current++;
    if (hudTickRef.current % 10 === 0) {
      setHud({
        bpm: snap.bpm,
        phase: snap.phase,
        density: snap.density,
        intensity: snap.intensity,
      });
    }

    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  const begin = useCallback(async () => {
    if (phase !== "idle") return;

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* best effort */
      }
    }

    const seq = createSequencer(ctx, 0.28);
    seqRef.current = seq;
    seq.setBpm(bpm);
    seq.setSwing(swing);
    seq.loadAutoDemo(); // a real groove plays immediately — never silent
    seq.start();

    // try the camera; on any failure keep the touch sequencer + auto-demo
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices?.getUserMedia
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
        const sil = startSilhouette(stream);
        if (sil) {
          silRef.current = sil;
          setCamStatus("camera");
          // capture the empty-room background shortly after warm-up
          window.setTimeout(() => silRef.current?.captureBackground(), 1200);
        } else {
          setCamNotice("Could not read the camera — tap the grid to build a beat.");
        }
      } catch {
        setCamNotice(
          "Camera unavailable or blocked — the beat is playing. Tap the grid to add steps.",
        );
      }
    } else {
      setCamNotice(
        "No camera on this device — the beat is playing. Tap the grid to add steps.",
      );
    }

    setPhase("running");
    rafRef.current = requestAnimationFrame(runLoop);
  }, [phase, bpm, swing, runLoop]);

  // pointer / touch step-sequencer fallback (always available)
  const onCanvasPointer = useCallback((e: React.PointerEvent) => {
    const seq = seqRef.current;
    const canvas = canvasRef.current;
    if (!seq || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const lay = layoutGrid(rect.width, rect.height);
    const hit = hitCell(lay, px, py);
    if (hit) seq.toggleCell(VOICES - 1 - hit.row, hit.col);
  }, []);

  // reduced-motion preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const on = () => (reducedRef.current = mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      silRef.current?.dispose();
      seqRef.current?.dispose();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#08060a] text-white">
      <canvas
        ref={canvasRef}
        onPointerDown={onCanvasPointer}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="808 step sequencer grid"
      />

      {/* corner: design notes */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-3 top-3 z-30 min-h-[44px] rounded-full border border-amber-400/30 bg-black/50 px-4 py-2.5 text-sm text-white/85 backdrop-blur hover:text-white"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {/* idle: title + description + Begin */}
      {phase === "idle" && (
        <div className="relative z-20 mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.3em] text-amber-300/80">
            Dream 1338
          </p>
          <h1 className="text-4xl font-semibold text-white sm:text-5xl">
            Shadow 808
          </h1>
          <p className="max-w-xl text-base text-white/85 sm:text-lg">
            Step into a drum machine and{" "}
            <span className="text-white">dance the pattern in</span>: as the
            playhead sweeps the grid, wherever your silhouette lands arms that
            step. The groove loops back at you with swing, ghost notes, and a
            build-to-drop when you dance hard.
          </p>
          <button
            onClick={begin}
            className="min-h-[44px] rounded-2xl bg-amber-500 px-8 py-3 text-lg font-semibold text-black shadow-lg transition hover:bg-amber-400 active:scale-[0.98]"
          >
            Begin
          </button>
          <p className="max-w-md text-sm text-white/70">
            Sound starts on tap. The camera only senses motion on this device —
            nothing is recorded or sent. No camera? The beat still plays and you
            can tap the grid.
          </p>
        </div>
      )}

      {/* running HUD */}
      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-1 rounded-xl border border-white/10 bg-black/45 px-3 py-2 font-mono text-sm text-white/90 backdrop-blur">
            <span>
              {hud.bpm} BPM · {STEPS} steps · swing {Math.round(swing * 100)}%
            </span>
            <span className="text-white/75">
              {camStatus === "camera" ? "camera: dancing in" : "touch: tap grid"}{" "}
              ·{" "}
              <span
                className={
                  hud.phase === "slam"
                    ? "text-rose-300"
                    : hud.phase === "build"
                      ? "text-amber-300"
                      : "text-white/75"
                }
              >
                {hud.phase === "slam"
                  ? "DROP"
                  : hud.phase === "build"
                    ? "BUILD…"
                    : hud.phase === "silence"
                      ? "…"
                      : `density ${Math.round(hud.density * 100)}%`}
              </span>
            </span>
          </div>

          {camNotice && (
            <div className="pointer-events-none absolute left-1/2 top-16 z-20 max-w-sm -translate-x-1/2 rounded-lg border border-rose-400/30 bg-black/60 px-4 py-2 text-center text-base text-rose-300 backdrop-blur">
              {camNotice}
            </div>
          )}

          {/* controls */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-center gap-3 px-4 pb-6 pt-4">
            <button
              onClick={() => seqRef.current?.triggerBuild()}
              className="min-h-[44px] rounded-xl bg-rose-500/90 px-4 py-2.5 text-sm font-semibold text-black hover:bg-rose-400"
            >
              Build → Drop
            </button>
            <button
              onClick={() => seqRef.current?.clear()}
              className="min-h-[44px] rounded-xl border border-white/20 bg-black/50 px-4 py-2.5 text-sm text-white/90 hover:text-white"
            >
              Clear
            </button>
            <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-3 py-2 font-mono text-sm text-white/80">
              BPM
              <input
                type="range"
                min={100}
                max={132}
                step={1}
                value={bpm}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setBpmState(v);
                  seqRef.current?.setBpm(v);
                }}
                className="w-24 accent-amber-500"
              />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-3 py-2 font-mono text-sm text-white/80">
              SWING
              <input
                type="range"
                min={0}
                max={0.36}
                step={0.02}
                value={swing}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSwingState(v);
                  seqRef.current?.setSwing(v);
                }}
                className="w-24 accent-amber-500"
              />
            </label>
          </div>
        </>
      )}

      {/* design notes overlay */}
      {showNotes && (
        <div className="absolute inset-x-4 top-20 z-40 mx-auto max-w-2xl rounded-2xl border border-amber-400/20 bg-black/85 p-5 text-left backdrop-blur-md">
          <h2 className="text-xl font-semibold text-white">Design notes</h2>
          <p className="mt-2 text-base text-white/85">
            The screen is an 8-step × 5-voice TR-808 grid (kick / snare / hat /
            clap / tom). Your camera frame is mirrored, shrunk to 64×40, and
            turned into a decaying <span className="text-amber-300">presence
            field</span> (frame-difference plus background subtraction). As the
            playhead sweeps left→right in time, whichever cells your silhouette
            occupies get <span className="text-amber-300">armed</span> — so you
            choreograph the beat with your body, and it loops back at you.
          </p>
          <p className="mt-3 text-base text-white/85">
            A look-ahead Web Audio scheduler (the &ldquo;Tale of Two
            Clocks&rdquo; pattern) drives synthesised 808 voices with real swing
            and per-step probability, so armed steps sometimes ghost. Dance hard
            and a riser builds, the groove drops to silence for a beat, then
            slams back at full density. The pattern is persistent state — it
            accretes the longer you play.
          </p>
          <p className="mt-3 text-sm text-white/75">
            In the lineage of Sergi Jordà&rsquo;s <em>reactable</em> and Jono
            Brandel&rsquo;s <em>Patatap</em>, with per-step probability after
            BeatState (beatstate.net). No strobe — beat pulses are smooth
            luminance drift. See the README for the full mapping.
          </p>
          <Link
            href="/dream"
            className="mt-4 inline-block text-sm text-amber-300/95 hover:underline"
          >
            ← Back to the dream lab
          </Link>
        </div>
      )}
    </main>
  );
}
