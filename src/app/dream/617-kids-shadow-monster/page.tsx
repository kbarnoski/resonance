"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 617-kids-shadow-monster — Shadow Monster Stage
//
// "What if a 4-year-old's whole BODY becomes a giant googly shadow-monster on a
// stage — wave your arms and it whooshes, jump and it BOINGs, stretch big and it
// ROARs?"
//
// INPUT     : webcam → MediaPipe ImageSegmenter (CDN, runtime) → a filled body
//             SILHOUETTE MASK (not pose landmarks). See segment.ts / mask.ts.
// OUTPUT    : hand-written WebGPU/WGSL stage spectacle (mask as a texture driving
//             a glowing creature field) with a full Canvas2D fallback.
// TECH      : silhouette-mask → creature + motion-energy → friendly synth.
// VIBE      : theatrical, giant, silly-spooky-but-FRIENDLY shadow-puppet show.
//
// Kid-safe (4+): no reading required, ≥64px targets, always-on soft bed, no fail
// states, soft sounds only. Robust no-camera path: any failure → friendly rose
// notice + three big buttons (ROAR / WHOOSH / BOING) + keys A/S/D, and the idle
// auto-demo keeps the monster moving & sounding on its own.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildMonsterAudio, type MonsterAudio } from "./audio";
import { MASK_W, MASK_H, MonsterTracker, makeGhostMask } from "./mask";
import {
  createSilhouetteSegmenter,
  type SilhouetteSegmenter,
} from "./segment";
import { initGpu, type GpuRenderer, type MonsterFrame } from "./gpu";
import { initRenderer2D } from "./render2d";

const README_URL =
  "https://github.com/kbarnoski/resonance/blob/main/src/app/dream/617-kids-shadow-monster/README.md";

const IDLE_MS = 2500; // ~2.5s with no interaction → auto-demo

type Phase = "idle" | "loading" | "running";
type Backend = "webgpu" | "canvas2d" | "—";

export default function ShadowMonster() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const audioRef = useRef<MonsterAudio | null>(null);
  const rendererRef = useRef<GpuRenderer | null>(null);
  const segRef = useRef<SilhouetteSegmenter | null>(null);
  const trackerRef = useRef<MonsterTracker>(new MonsterTracker());
  const rafRef = useRef<number>(0);

  const liveGrid = useRef<Float32Array>(new Float32Array(MASK_W * MASK_H));
  const haveCamMask = useRef(false); // true once a real mask is read
  const lastInteractRef = useRef(0); // ms of last real interaction
  const pupilRef = useRef<[number, number]>([0, 0]);
  const levelRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [backend, setBackend] = useState<Backend>("—");
  const [showNotes, setShowNotes] = useState(false);

  // ── main loop: derive monster signals, drive audio, render ──────────────────
  const startLoop = useCallback(() => {
    const tracker = trackerRef.current;

    const frame = () => {
      const nowMs = performance.now();
      const tSec = nowMs / 1000;

      // 1) Pick the mask source: live camera mask > idle ghost auto-demo.
      let grid = liveGrid.current;
      let gotLive = false;
      const seg = segRef.current;
      const video = videoRef.current;
      if (seg && video) {
        gotLive = seg.step(video, nowMs, liveGrid.current);
        if (gotLive) {
          haveCamMask.current = true;
          lastInteractRef.current = nowMs;
        }
      }
      const idleFor = nowMs - lastInteractRef.current;
      if (!gotLive && (idleFor > IDLE_MS || lastInteractRef.current === 0)) {
        // No real input for a while (or never) → ghost monster performs alone.
        grid = makeGhostMask(tSec);
      } else if (!gotLive) {
        // recently interacted but no new frame → hold the last live grid
        grid = liveGrid.current;
      }

      // 2) Derive monster signals from the silhouette mask.
      const s = tracker.update(grid, nowMs);

      // 3) Drive audio (continuous + one-shot).
      const a = audioRef.current;
      if (a) {
        a.setWhoosh(s.whoosh);
        a.setRoar(s.roar);
        if (s.boing > 0) a.boing(s.boing);
      }

      // 4) Googly-eye placement from the mask bounding box (top of the body).
      // Scan the grid for its bbox so eyes sit near the top, friendly & rounded.
      let x0 = 1;
      let y0 = 1;
      let x1 = 0;
      let y1 = 0;
      let any = false;
      for (let y = 0; y < MASK_H; y++) {
        for (let x = 0; x < MASK_W; x++) {
          if (grid[y * MASK_W + x] > 0.5) {
            any = true;
            const nx = x / MASK_W;
            const ny = y / MASK_H;
            if (nx < x0) x0 = nx;
            if (ny < y0) y0 = ny;
            if (nx > x1) x1 = nx;
            if (ny > y1) y1 = ny;
          }
        }
      }
      if (!any) {
        x0 = 0.32;
        y0 = 0.2;
        x1 = 0.68;
        y1 = 0.85;
      }
      const bw = x1 - x0;
      const eyeY = y0 + (y1 - y0) * 0.22; // near the top of the body
      const eyeRad = Math.max(0.03, Math.min(0.08, bw * 0.16));
      const eyeL: [number, number] = [x0 + bw * 0.34, eyeY];
      const eyeR: [number, number] = [x0 + bw * 0.66, eyeY];

      // googly pupil: rolls toward where the body is moving + lazy wander
      const pupil = pupilRef.current;
      const targetPX = (s.cx - 0.5) * 1.6 + Math.sin(tSec * 1.3) * 0.3;
      const targetPY = (s.cy - 0.5) * 1.4 + Math.cos(tSec * 1.7) * 0.3;
      pupil[0] += (Math.max(-1, Math.min(1, targetPX)) - pupil[0]) * 0.12;
      pupil[1] += (Math.max(-1, Math.min(1, targetPY)) - pupil[1]) * 0.12;

      // 5) Render. Smooth a level proxy from the signals for extra bloom.
      const target = s.whoosh * 0.4 + s.roar * 0.6;
      levelRef.current = levelRef.current * 0.85 + target * 0.15;
      const level = a ? levelRef.current : 0;
      const r = rendererRef.current;
      if (r) {
        const mf: MonsterFrame = {
          timeSec: tSec,
          grid,
          coverage: s.coverage,
          cx: s.cx,
          cy: s.cy,
          motion: s.motion,
          roar: s.roar,
          wobble: s.wobble,
          level,
          eyeL,
          eyeR,
          eyeR2: eyeRad,
          pupil: [pupil[0], pupil[1]],
          hue: (tSec * 0.03) % 1,
        };
        r.render(mf);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  // ── best-effort camera + ImageSegmenter (one try/catch around it all) ───────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      video.srcObject = stream;
      await video.play();
      const seg = await createSilhouetteSegmenter();
      segRef.current = seg;
      lastInteractRef.current = performance.now();
      setNotice(null);
    } catch {
      // denied / blocked / CDN-WASM-model load error / unsupported → fallback.
      setNotice(
        "No camera right now — that's okay! Tap the big buttons (or press A S D) to make the monster ROAR, WHOOSH and BOING. It plays by itself too.",
      );
      const v = videoRef.current;
      const st = v?.srcObject as MediaStream | null;
      st?.getTracks().forEach((t) => t.stop());
      if (v) v.srcObject = null;
    }
  }, []);

  // ── primary gesture: start the show (audio unlock + renderer + camera) ──────
  const start = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");

    // Audio FIRST (inside the gesture → iOS unlock; bed never silent).
    const a = buildMonsterAudio();
    audioRef.current = a;
    try {
      await a.resume();
    } catch {
      /* will retry on next gesture */
    }

    // Renderer: WebGPU, else Canvas2D fallback.
    const canvas = canvasRef.current;
    if (canvas) {
      const gpu = await initGpu(canvas);
      if (gpu) {
        rendererRef.current = gpu;
        setBackend("webgpu");
      } else {
        rendererRef.current = initRenderer2D(canvas);
        setBackend("canvas2d");
      }
    }

    setPhase("running");
    startLoop();
    // Best-effort camera; fallback fully covers failure.
    startCamera();
  }, [phase, startLoop, startCamera]);

  // ── fallback triggers (buttons + keys) — also count as interaction ──────────
  const fire = useCallback((kind: "roar" | "whoosh" | "boing") => {
    const a = audioRef.current;
    lastInteractRef.current = performance.now();
    if (!a) return;
    if (kind === "roar") {
      // a deliberate big roar swell (ride the continuous roar up, then ease)
      a.setRoar(1);
      window.setTimeout(() => a.setRoar(0.05), 1100);
    } else if (kind === "whoosh") {
      a.setWhoosh(1);
      window.setTimeout(() => a.setWhoosh(0.05), 700);
    } else {
      a.boing(0.9);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "running") return;
      const k = e.key.toLowerCase();
      if (k === "a") fire("roar");
      else if (k === "s") fire("whoosh");
      else if (k === "d") fire("boing");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, fire]);

  // ── resize ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      const c = canvasRef.current;
      if (c) rendererRef.current?.resize(window.innerWidth, window.innerHeight);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  // ── teardown ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      segRef.current?.close();
      const st = video?.srcObject as MediaStream | null;
      st?.getTracks().forEach((t) => t.stop());
      rendererRef.current?.dispose();
      audioRef.current?.dispose();
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-white/95">
      {/* stage canvas (full-bleed) */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* hidden camera feed (analysed in-browser only — never recorded/sent) */}
      <video
        ref={videoRef}
        className="pointer-events-none absolute -left-[9999px] h-2 w-2 opacity-0"
        playsInline
        muted
      />

      {/* live backend badge */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-md bg-white/10 px-2 py-1 font-mono text-base text-white/75">
          {backend === "webgpu" ? "WebGPU" : "Canvas2D"}
        </div>
      )}

      {/* corner design-notes affordance */}
      <button
        type="button"
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-3 top-3 z-30 min-h-[44px] rounded-full bg-white/10 px-4 text-base text-white/75 hover:text-violet-200"
        aria-label="Design notes"
      >
        ?
      </button>
      {showNotes && (
        <div className="absolute right-3 top-16 z-30 max-w-xs rounded-xl bg-black/85 p-4 text-base leading-relaxed text-white/75 ring-1 ring-white/15">
          <p className="mb-2 text-white/95">
            Your whole body becomes a giant googly shadow-monster. Wave to
            whoosh, jump to boing, get BIG to roar.
          </p>
          <p className="mb-2">
            Built from a body silhouette <em>mask</em> (MediaPipe ImageSegmenter)
            — not skeleton joints. Camera stays in your browser.
          </p>
          <Link
            href={README_URL}
            target="_blank"
            rel="noreferrer"
            className="text-violet-300 underline underline-offset-4 hover:text-violet-200"
          >
            Read the design notes
          </Link>
        </div>
      )}

      {/* intro overlay */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white/95 sm:text-5xl">
            Shadow Monster Stage
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-white/75">
            Step in front of the camera and your whole body becomes a giant
            googly shadow-monster. Wave your arms and it whooshes. Jump and it
            BOINGs. Stretch big and it ROARs.
          </p>
          <button
            type="button"
            onClick={start}
            disabled={phase === "loading"}
            className="min-h-[64px] rounded-full bg-violet-500/90 px-10 text-2xl font-semibold text-white/95 transition hover:bg-violet-400 disabled:opacity-60"
          >
            {phase === "loading" ? "Lights up…" : "Start the show ✦"}
          </button>
          <p className="text-base text-white/55">
            Sound on. No camera? It still plays — big buttons appear.
          </p>
        </div>
      )}

      {/* running: friendly notice + big fallback buttons (always available) */}
      {phase === "running" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-4 px-4 pb-6 text-center">
          {notice && (
            <p className="pointer-events-none max-w-lg text-base leading-relaxed text-rose-300">
              {notice}
            </p>
          )}
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => fire("roar")}
              className="min-h-[88px] min-w-[88px] rounded-3xl bg-amber-500/85 px-7 text-2xl font-bold text-black/85 transition active:scale-95 hover:bg-amber-400"
            >
              🦖 ROAR
            </button>
            <button
              type="button"
              onClick={() => fire("whoosh")}
              className="min-h-[88px] min-w-[88px] rounded-3xl bg-sky-400/85 px-7 text-2xl font-bold text-black/85 transition active:scale-95 hover:bg-sky-300"
            >
              💨 WHOOSH
            </button>
            <button
              type="button"
              onClick={() => fire("boing")}
              className="min-h-[88px] min-w-[88px] rounded-3xl bg-fuchsia-400/85 px-7 text-2xl font-bold text-black/85 transition active:scale-95 hover:bg-fuchsia-300"
            >
              🤸 BOING
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
