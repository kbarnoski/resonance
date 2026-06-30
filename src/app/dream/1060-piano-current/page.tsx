"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchPianoBuffer,
  renderFallbackBuffer,
  decodeUserFile,
  buildGrainCorpus,
  type AudioSourceKind,
  type Grain,
} from "./source";
import { FlowField, type FlowStats } from "./flow";
import { createInstrument, type InstrumentHandle } from "./instrument";

type Phase = "intro" | "loading" | "flowing";

const PARTICLE_COUNT = 3200;

export default function PianoCurrentPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [source, setSource] = useState<AudioSourceKind | null>(null);
  const [grainCount, setGrainCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const flowRef = useRef<FlowField | null>(null);
  const instrumentRef = useRef<InstrumentHandle | null>(null);
  const corpusRef = useRef<Grain[]>([]);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const audioTickRef = useRef(0);
  const statsRef = useRef<FlowStats | null>(null);

  // Pointer "stir" state.
  const stirRef = useRef({
    x: 0.5,
    y: 0.5,
    px: 0.5,
    py: 0.5,
    active: false,
    lastMove: 0,
    delta: 0,
  });

  // ─── Canvas sizing ───────────────────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }, []);

  // ─── Pointer / touch stir ────────────────────────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const s = stirRef.current;
    s.px = s.x;
    s.py = s.y;
    s.x = x;
    s.y = y;
    s.delta = Math.hypot(x - s.px, y - s.py);
    s.active = true;
    s.lastMove = performance.now();
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const s = stirRef.current;
    s.active = true;
    s.lastMove = performance.now();
  }, []);

  const onPointerUp = useCallback(() => {
    stirRef.current.active = false;
  }, []);

  // ─── Drag-and-drop user audio ────────────────────────────────────────────
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDropHint(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !ctxRef.current) return;
    const buf = await decodeUserFile(ctxRef.current, file);
    if (!buf) {
      setAudioError("Couldn't decode that audio file.");
      return;
    }
    bufferRef.current = buf;
    corpusRef.current = buildGrainCorpus(buf);
    setGrainCount(corpusRef.current.length);
    setSource("fallback");
    instrumentRef.current?.setBuffer(buf);
    instrumentRef.current?.setCorpus(corpusRef.current);
  }, []);

  // ─── Animation + audio loop ──────────────────────────────────────────────
  const loop = useCallback((now: number) => {
    const flow = flowRef.current;
    const canvas = canvasRef.current;
    if (!flow || !canvas) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    const dt = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : 1 / 60;
    lastTimeRef.current = now;

    // Apply the stir. Direction sign follows the gesture's tangential motion;
    // power follows speed. Decays in flow.step when not restirred.
    const s = stirRef.current;
    const idleMs = now - s.lastMove;
    if (s.active && idleMs < 250 && s.delta > 1e-4) {
      // Cross product of (pos - center)~(stir position offset) with motion gives
      // a rotation sign; simpler: use horizontal motion sign blended w/ vertical.
      const mvx = s.x - s.px;
      const mvy = s.y - s.py;
      // tangential sign relative to canvas center for an intuitive swirl
      const rx = s.x - 0.5;
      const ry = s.y - 0.5;
      const cross = rx * mvy - ry * mvx;
      const dirSign = cross >= 0 ? 1 : -1;
      const power = Math.min(1, s.delta * 28);
      flow.stir(s.x, s.y, dirSign, power);
      s.delta *= 0.5;
    } else {
      // keep vortex anchored at last position so it decays in place
      flow.stir(s.x, s.y, 0, 0);
    }

    // Audio RMS → flow amplitude feedback (river breathes with its sound).
    const inst = instrumentRef.current;
    flow.audioAmp = 1 + (inst ? inst.getRms() * 0.8 : 0);

    const stats = flow.step(Math.min(0.05, dt));
    statsRef.current = stats;

    // Drive the instrument at ~30Hz.
    audioTickRef.current += dt;
    if (audioTickRef.current >= 1 / 30 && inst) {
      audioTickRef.current = 0;
      inst.feed(stats);
    }

    draw(canvas, flow, stats);
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ─── Canvas2D render ─────────────────────────────────────────────────────
  function draw(canvas: HTMLCanvasElement, flow: FlowField, stats: FlowStats) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    // Per-frame semi-transparent indigo wash → ghost trails, never pure black.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(8, 6, 26, 0.16)";
    ctx.fillRect(0, 0, W, H);

    // Additive luminous streaks.
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = Math.max(1, W / 1400);
    const px = flow.px;
    const py = flow.py;
    const ppx = flow.ppx;
    const ppy = flow.ppy;
    const vx = flow.vx;
    const vy = flow.vy;

    for (let i = 0; i < flow.count; i++) {
      const x0 = ppx[i] * W;
      const y0 = ppy[i] * H;
      const x1 = px[i] * W;
      const y1 = py[i] * H;
      // skip wrap-jumps so toroidal teleports don't draw long lines
      if (Math.abs(x1 - x0) > W * 0.5 || Math.abs(y1 - y0) > H * 0.5) continue;

      const sp = Math.hypot(vx[i], vy[i]);
      // violet → cyan → gold by speed/pooling
      const t = Math.min(1, sp * 9);
      let r: number, g: number, b: number;
      if (t < 0.5) {
        const k = t / 0.5; // violet → cyan
        r = Math.round(150 * (1 - k) + 40 * k);
        g = Math.round(70 * (1 - k) + 210 * k);
        b = Math.round(240 * (1 - k) + 230 * k);
      } else {
        const k = (t - 0.5) / 0.5; // cyan → gold
        r = Math.round(40 * (1 - k) + 250 * k);
        g = Math.round(210 * (1 - k) + 210 * k);
        b = Math.round(230 * (1 - k) + 90 * k);
      }
      const alpha = 0.12 + t * 0.35;
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // A soft glow where the stir is, brightening with local vorticity.
    const s = stirRef.current;
    if (s.active || stats.vorticity > 0.1) {
      const cx = s.x * W;
      const cy = s.y * H;
      const rad = (0.05 + stats.vorticity * 0.12) * Math.min(W, H);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const a = 0.1 + stats.vorticity * 0.3;
      grad.addColorStop(0, `rgba(190,150,255,${a})`);
      grad.addColorStop(1, "rgba(190,150,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // ─── Start: gesture-gated audio ──────────────────────────────────────────
  const start = useCallback(async () => {
    if (phase !== "intro") return;
    setPhase("loading");
    setAudioError(null);

    let ctx: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      ctx = new AC();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      setAudioError("Audio is blocked in this browser. Tap again or check permissions.");
      setPhase("intro");
      return;
    }
    ctxRef.current = ctx;

    // Load Karel's piano, else the felt-piano fallback.
    let buffer = await fetchPianoBuffer(ctx);
    if (buffer) {
      setSource("piano");
    } else {
      buffer = await renderFallbackBuffer(ctx.sampleRate);
      setSource("fallback");
    }
    bufferRef.current = buffer;
    corpusRef.current = buildGrainCorpus(buffer);
    setGrainCount(corpusRef.current.length);

    instrumentRef.current = createInstrument(ctx, buffer, corpusRef.current);
    flowRef.current = new FlowField(PARTICLE_COUNT);

    setPhase("flowing");
  }, [phase]);

  // Start the loop once the canvas mounts in the flowing phase.
  useEffect(() => {
    if (phase !== "flowing") return;
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [phase, loop, resizeCanvas]);

  // ─── Full teardown on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      instrumentRef.current?.dispose();
      instrumentRef.current = null;
      flowRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
      ctxRef.current = null;
    };
  }, []);

  // ─── UI ──────────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#08061a] text-white">
      {/* Canvas */}
      {phase === "flowing" && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onDragOver={(e) => {
            e.preventDefault();
            setDropHint(true);
          }}
          onDragLeave={() => setDropHint(false)}
          onDrop={onDrop}
        />
      )}

      {/* Intro overlay */}
      {phase !== "flowing" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center">
          <p className="mb-3 font-mono text-base text-violet-300/90">
            1060 · piano-current
          </p>
          <h1 className="mb-4 font-serif text-4xl text-white sm:text-5xl">
            Stir the luminous river
          </h1>
          <p className="mb-8 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
            Thousands of particles drift through a divergence-free curl-noise
            field. Stir them with your hand and where the flow pools, accelerates
            and braids, Karel&rsquo;s own piano is re-voiced into a cosmic drift.
          </p>
          <button
            onClick={start}
            disabled={phase === "loading"}
            className="min-h-[44px] rounded-full bg-violet-500/20 px-6 py-2.5 font-mono text-base text-violet-200 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30 disabled:opacity-60"
          >
            {phase === "loading" ? "summoning the current…" : "Stir the current →"}
          </button>
          {audioError && (
            <p className="mt-5 max-w-md text-base text-rose-300">{audioError}</p>
          )}
          <p className="mt-8 font-mono text-base text-white/55">
            state: meditative cosmic drift · pole: cosmic-ambient
          </p>
        </div>
      )}

      {/* HUD during play */}
      {phase === "flowing" && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4 sm:p-6">
            <div className="pointer-events-auto">
              <h1 className="font-serif text-xl text-white/95 sm:text-2xl">
                piano-current
              </h1>
              <p className="mt-1 max-w-xs text-base text-white/75">
                Stir the river. It stays quiet until you move; pools swell, braids
                shimmer.
              </p>
              {source === "piano" && (
                <p className="mt-2 font-mono text-base text-emerald-300/95">
                  ♪ Karel&rsquo;s piano · {grainCount} grains
                </p>
              )}
              {source === "fallback" && (
                <p className="mt-2 font-mono text-base text-amber-300/95">
                  ♪ synth piano (offline) · {grainCount} grains
                </p>
              )}
              {audioError && (
                <p className="mt-2 text-base text-rose-300">{audioError}</p>
              )}
            </div>
            <div className="pointer-events-auto text-right">
              <button
                onClick={() => setShowNotes((v) => !v)}
                className="min-h-[44px] rounded-full bg-white/5 px-4 py-2.5 font-mono text-base text-white/80 ring-1 ring-white/15 transition hover:bg-white/10"
              >
                {showNotes ? "close" : "Design notes"}
              </button>
            </div>
          </div>

          <p className="pointer-events-none absolute bottom-4 left-0 right-0 z-10 text-center font-mono text-base text-white/55">
            {dropHint
              ? "drop an audio file to re-voice the river"
              : "drag-drop any audio file to swap the corpus"}
          </p>

          {/* Design notes panel */}
          {showNotes && (
            <div className="absolute right-4 top-24 z-30 max-h-[70vh] w-[min(92vw,28rem)] overflow-y-auto rounded-2xl bg-[#0c0a24]/95 p-5 text-base leading-relaxed text-white/80 ring-1 ring-white/15 backdrop-blur sm:right-6">
              <h2 className="mb-2 font-serif text-xl text-white/95">Design notes</h2>
              <p className="mb-3">
                <span className="text-violet-300">The question:</span> what if you
                could stir a river of thousands of particles flowing through a
                divergence-free noise field, and where the flow pools, accelerates
                and braids, it re-voices Karel&rsquo;s own piano into a cosmic
                drift?
              </p>
              <p className="mb-3">
                <span className="text-violet-300">Field:</span> particles are
                advected through a 2D <em>curl-noise</em> velocity field{" "}
                <code className="text-white/95">v = (∂ψ/∂y, −∂ψ/∂x)</code>. Because
                v is the curl of a stream function ψ, the field is divergence-free
                — pure swirls and braids, no sources or sinks. ψ is two octaves of
                gradient noise on a slowly drifting 3rd axis, so the river stays
                alive even idle.
              </p>
              <p className="mb-3">
                <span className="text-violet-300">Voice:</span> emergent flow
                stats become CataRT target descriptors. Coherent current →
                JI-locked grains; vorticity near the cursor → bright detuned
                shimmer; a pool → a sustained pad; a stir burst → onset; idle →
                sparse twinkle. Two merging vortices fire a deliberate fifth.
              </p>
              <p className="mb-3 text-white/75">
                Canvas2D only, Web Audio only — no WebGL/WebGPU, so it runs (and is
                verifiable) everywhere. See the README in this folder for the full
                technique and references (Bridson 2007; Schwarz 2006).
              </p>
              <Link
                href="/dream"
                className="font-mono text-base text-violet-300 underline-offset-4 hover:underline"
              >
                ← back to the gallery
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
