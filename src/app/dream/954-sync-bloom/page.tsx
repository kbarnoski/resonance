"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  makeFieldConfig,
  makeNaturalFreqs,
  makeInitialPhases,
  decayKLocal,
  brushKLocal,
  detectChord,
  cpuStep,
  JI_NAMES,
  type FieldConfig,
  type ChordReadout,
} from "./kuramoto";
import { initSyncGpu, type SyncGpu } from "./gpu";
import { initSyncGl, type SyncGl } from "./webgl-fallback";
import { SyncBloomAudio } from "./audio";

type RenderState = "webgpu" | "webgl2" | "none";

const TARGET_N = 1024; // -> 32x32 field
const FIXED_DT = 0.045; // integration step (seconds, sim-time)

export default function SyncBloomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const cfgRef = useRef<FieldConfig>(makeFieldConfig(TARGET_N));
  const gpuRef = useRef<SyncGpu | null>(null);
  const glRef = useRef<SyncGl | null>(null);
  const audioRef = useRef<SyncBloomAudio | null>(null);
  const rafRef = useRef<number>(0);

  // field state (CPU mirror; authoritative for the WebGL2 path, and used for
  // chord detection on the GPU path via readback)
  const phaseRef = useRef<Float32Array>(new Float32Array(0));
  const omegaRef = useRef<Float32Array>(new Float32Array(0));
  const kLocalRef = useRef<Float32Array>(new Float32Array(0));
  const orderRef = useRef(0);

  // pointer brush
  const pointerRef = useRef<{ x: number; y: number; down: boolean }>({
    x: 0.5,
    y: 0.5,
    down: false,
  });

  const kGlobalRef = useRef(0.9); // base coupling (slider)
  const readBusyRef = useRef(false);
  const chordRef = useRef<ChordReadout>({ r: 0, clusters: [], histogram: [] });

  const [entered, setEntered] = useState(false);
  const [renderState, setRenderState] = useState<RenderState>("none");
  const [errMsg, setErrMsg] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [kGlobal, setKGlobal] = useState(0.9);
  const [hud, setHud] = useState<{ order: number; chord: string }>({
    order: 0,
    chord: "—",
  });

  // ── the loop ────────────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const startT = performance.now();
    let lastUi = 0;
    let lastReadback = 0;
    let lastChordPush = 0;
    const cfg = cfgRef.current;

    const tick = () => {
      const t = (performance.now() - startT) / 1000;

      // autonomous "breathing" of K so an idle glance self-organizes within ~1s:
      // a slow swell layered on top of the slider value.
      const breath = 0.55 + 0.55 * Math.sin(t * 0.7 - 1.2);
      const kEff = kGlobalRef.current * (0.6 + 0.9 * breath);

      // pointer brush: drip coupling where you point (down = stronger)
      const p = pointerRef.current;
      if (p.down) {
        brushKLocal(kLocalRef.current, cfg, p.x, p.y, 0.18, 0.55);
      } else {
        // a hovering pointer still nudges, gently
        brushKLocal(kLocalRef.current, cfg, p.x, p.y, 0.1, 0.12);
      }
      decayKLocal(kLocalRef.current, 0.94);

      // slow root drift so the harmony breathes over tens of seconds
      const root = 104 + 14 * Math.sin(t * 0.045);
      audioRef.current?.setRootDrift(root);

      // ── integrate + render ──
      if (gpuRef.current) {
        const gpu = gpuRef.current;
        gpu.writeKLocal(kLocalRef.current);
        // a couple of substeps per frame for stability + snappier sync
        gpu.step(FIXED_DT, kEff, t);
        gpu.step(FIXED_DT, kEff, t);
        gpu.render(t, 0.05);

        // async readback every ~6 frames for chord detection
        if (t - lastReadback > 0.1 && !readBusyRef.current) {
          lastReadback = t;
          readBusyRef.current = true;
          gpu
            .readback()
            .then((ph) => {
              if (ph && ph.length === omegaRef.current.length) {
                phaseRef.current = ph;
                const chord = detectChord(ph, omegaRef.current);
                chordRef.current = chord;
                orderRef.current = chord.r;
              }
            })
            .finally(() => {
              readBusyRef.current = false;
            });
        }
      } else if (glRef.current) {
        const gl = glRef.current;
        // same physics on CPU; two substeps
        cpuStep(
          phaseRef.current,
          omegaRef.current,
          kLocalRef.current,
          kEff,
          FIXED_DT,
        );
        const r = cpuStep(
          phaseRef.current,
          omegaRef.current,
          kLocalRef.current,
          kEff,
          FIXED_DT,
        );
        orderRef.current = r;
        gl.render(phaseRef.current, r, 0.05);
        // chord detection straight off the CPU phases (cheap)
        if (t - lastReadback > 0.1) {
          lastReadback = t;
          chordRef.current = detectChord(phaseRef.current, omegaRef.current);
        }
      }

      // push chord to audio a few times a second
      if (t - lastChordPush > 0.12) {
        lastChordPush = t;
        const c = chordRef.current;
        audioRef.current?.setChord(c.clusters, c.r || orderRef.current);
      }

      // HUD
      if (t - lastUi > 0.12) {
        lastUi = t;
        const c = chordRef.current;
        const names = c.clusters
          .map((cl) => JI_NAMES[cl.ratioIndex])
          .join(" · ");
        setHud({
          order: c.r || orderRef.current,
          chord: names || "(scattered)",
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── renderer setup: WebGPU -> WebGL2 ──
  const setupRenderer = useCallback(async (): Promise<RenderState> => {
    const canvas = canvasRef.current;
    if (!canvas) return "none";
    const cfg = cfgRef.current;
    const omega = omegaRef.current;
    const phase0 = phaseRef.current;
    try {
      const gpu = await initSyncGpu(canvas, cfg, phase0, omega);
      if (gpu) {
        gpuRef.current = gpu;
        return "webgpu";
      }
    } catch {
      /* fall through */
    }
    try {
      const gl = initSyncGl(canvas, cfg);
      if (gl) {
        glRef.current = gl;
        setErrMsg(
          (m) =>
            m ||
            "WebGPU unavailable — running CPU fallback (same Kuramoto field on WebGL2).",
        );
        return "webgl2";
      }
    } catch {
      /* fall through */
    }
    setErrMsg(
      (m) => m || "Neither WebGPU nor WebGL2 is available in this browser.",
    );
    return "none";
  }, []);

  // ── Start gesture ──
  const enter = useCallback(async () => {
    if (entered) return;
    setEntered(true);

    // init field
    const cfg = cfgRef.current;
    omegaRef.current = makeNaturalFreqs(cfg);
    phaseRef.current = makeInitialPhases(cfg.n);
    kLocalRef.current = new Float32Array(cfg.n);

    // audio (gesture-gated)
    try {
      const a = new SyncBloomAudio();
      if (a.ctx.state === "suspended") await a.ctx.resume();
      a.start();
      audioRef.current = a;
    } catch {
      setErrMsg((m) => m || "Audio could not start in this browser.");
    }

    const rs = await setupRenderer();
    setRenderState(rs);
    if (rs !== "none") startLoop();
  }, [entered, setupRenderer, startLoop]);

  // pointer over canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const toGrid = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      // account for the 0.94 margin + aspect in the shaders, approximately
      pointerRef.current.x = Math.max(
        0,
        Math.min(1, (e.clientX - r.left) / r.width),
      );
      pointerRef.current.y = Math.max(
        0,
        Math.min(1, (e.clientY - r.top) / r.height),
      );
    };
    const onMove = (e: PointerEvent) => toGrid(e);
    const onDown = (e: PointerEvent) => {
      toGrid(e);
      pointerRef.current.down = true;
    };
    const onUp = () => {
      pointerRef.current.down = false;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // keep ref in sync with slider
  useEffect(() => {
    kGlobalRef.current = kGlobal;
  }, [kGlobal]);

  // teardown
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        gpuRef.current?.dispose();
      } catch {
        /* noop */
      }
      gpuRef.current = null;
      try {
        glRef.current?.dispose();
      } catch {
        /* noop */
      }
      glRef.current = null;
      try {
        audioRef.current?.close();
      } catch {
        /* noop */
      }
      audioRef.current = null;
    };
  }, []);

  const renderLabel: Record<RenderState, string> = {
    webgpu: "WebGPU · WGSL @compute",
    webgl2: "WebGL2 + CPU (fallback)",
    none: "—",
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#05060a] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        <header className="max-w-2xl">
          <h1 className="font-serif text-2xl text-white md:text-5xl">
            Sync Bloom
          </h1>
          <p className="mt-2 text-base text-white/80 md:text-lg">
            A field of hundreds of coupled oscillators. Scribble coupling into it
            and watch the phases lock into clusters — each locked cluster becomes
            a real consonant pitch, so the chord you hear is the field reaching
            consensus.
          </p>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="mt-3 min-h-[44px] px-4 py-2.5 text-base text-violet-300 underline underline-offset-4 hover:text-violet-200"
          >
            {showNotes ? "Hide the design notes" : "Read the design notes"}
          </button>
        </header>

        {!entered && (
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <button
              onClick={enter}
              className="min-h-[44px] rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-xl font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              Start the field
            </button>
            <p className="mt-3 text-base text-white/75">
              Sound starts on your tap (browsers require a gesture). Then drag
              across the field to drip in coupling — or just watch: it breathes
              itself into sync within a second.
            </p>
          </div>
        )}

        {entered && (
          <div className="mx-auto w-full max-w-md">
            <label className="block text-center font-mono text-base text-white/75">
              global coupling K{" "}
              <span className="text-violet-300">{kGlobal.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={2.4}
              step={0.01}
              value={kGlobal}
              onChange={(e) => setKGlobal(parseFloat(e.target.value))}
              className="mt-2 h-2 w-full cursor-pointer accent-violet-400"
              aria-label="global coupling K"
            />
            <p className="mt-2 text-center text-base text-white/60">
              Low K → scattered, beating, unresolved. High K → clusters lock, the
              chord fills in and resolves toward consonance.
            </p>
          </div>
        )}

        <footer className="max-w-3xl">
          {errMsg && (
            <p className="mb-3 rounded-lg border border-rose-400/40 bg-rose-950/30 px-4 py-2.5 text-base text-rose-300">
              {errMsg}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-base">
            <span className="text-white/75">
              render:{" "}
              <span className="text-violet-300">{renderLabel[renderState]}</span>
            </span>
            {entered && (
              <>
                <span className="text-white/75">
                  sync r{" "}
                  <span className="text-emerald-300/95">
                    {(hud.order * 100).toFixed(0)}%
                  </span>
                </span>
                <span className="text-white/75">
                  chord{" "}
                  <span className="text-amber-300/95">{hud.chord}</span>
                </span>
              </>
            )}
            <Link
              href="/dream"
              className="text-white/75 underline underline-offset-4 hover:text-white"
            >
              ← back to the lab
            </Link>
          </div>
        </footer>
      </div>

      {showNotes && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-black/85 p-6 backdrop-blur-md md:p-12">
          <div className="mx-auto max-w-2xl space-y-4 text-base leading-relaxed text-white/80">
            <h2 className="font-serif text-2xl text-white">Design notes</h2>
            <p>
              <span className="text-white/95">The question:</span> what if a
              chord could grow itself? Instead of looking harmony up from a chart,
              you grow it: a field of {cfgRef.current.n} phase-coupled oscillators
              runs on the GPU, and when you nudge them they spontaneously
              phase-lock into clusters. Each locked cluster becomes a real
              consonant pitch — so the chord you hear is literally the field
              reaching consensus.
            </p>
            <p>
              <span className="text-white/95">The Kuramoto model.</span> Each
              oscillator i has a phase θ and a natural frequency ω. Every step,
              dθ/dt = ω + K·r·sin(ψ − θ), where r·e^{"{iψ}"} is the field&apos;s
              mean
              phase (the <span className="text-violet-300">order parameter</span>
              ). When K is large enough relative to the spread of natural
              frequencies, sub-populations spontaneously{" "}
              <span className="text-white/95">phase-lock</span>. That locking is,
              physically, what musical consonance is: simple frequency ratios
              lock; dissonance never settles and beats.
            </p>
            <p>
              <span className="text-white/95">On the GPU.</span> The integration
              runs as a raw WGSL{" "}
              <span className="text-white/95">@compute</span> shader — a reduction
              pass folds the field into the order parameter, an advance pass steps
              every phase toward the mean field, both on storage buffers. Every
              few frames we async <span className="text-white/95">mapAsync</span>{" "}
              the phases back, bin them, and find phase-locked clusters; each
              cluster&apos;s effective frequency snaps to the nearest{" "}
              <span className="text-white/95">just-intonation</span> partial of a
              slowly drifting root (1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2). The set
              of locked clusters = the current chord.
            </p>
            <p>
              <span className="text-white/95">Sound.</span> Each locked partial is
              voiced as a warm additive tone (sine + soft triangle body) with a
              gentle FM vibrato, over a root drone bed. As coupling rises more
              clusters lock and the chord fills in toward consonance; as it falls
              voices thin to a hum. Master chain: gain ≤ 0.24 → lowpass ~7 kHz →
              compressor → out, so it can never get harsh. No granular, no
              samples — pure synthesis.
            </p>
            <p>
              <span className="text-white/95">Visuals.</span> Each oscillator is a
              glowing point whose hue encodes its phase; phase-locked clusters
              read as coherent colour-bands blooming out of noise, and the global
              order parameter drives the overall bloom and contrast. Luminous and
              bioluminescent — Ikeda precision warmed by Anadol flow.
            </p>
            <p className="text-white/75">
              <span className="text-white/95">Degrades:</span> no WebGPU →
              hand-written WebGL2 render running the{" "}
              <span className="text-white/95">same</span> Kuramoto math on the CPU
              (and a rose notice). Autonomous breathing of K means an idle glance
              still sees and hears it self-organize within ~1s; the pointer brush
              drips extra coupling where you scribble.
            </p>
            <p className="text-white/75">
              <span className="text-white/95">References.</span> Y. Kuramoto
              (1975), the coupled-oscillator model · Steven Strogatz,{" "}
              <em>Sync</em> (2003) · &quot;Kuramoto oscillatory Phase Encoding&quot;
              (KoPE), arXiv 2604.07904 (2026) — the deep-learning revival of
              Kuramoto sync that prompted re-reading synchronization as a
              generative primitive.
            </p>
            <p className="text-white/60">
              <span className="text-white/80">Honest warts:</span> cluster→JI
              mapping is a heuristic (phase-bin density + nearest-ratio snap), so
              the exact voicing wanders; the GPU order parameter lags one frame
              behind the advance (we fold it async), which is harmless here but
              not physically exact.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-xl border border-white/20 px-4 py-2.5 text-base text-white hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
