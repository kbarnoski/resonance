"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 707-two-track-weave — let two of Karel's pieces breathe together.
//
// Choose any two recordings from the catalog. They play at once, each looping,
// each its own luminous ribbon — one warm, one cool — woven across the dark. A
// single slider is an equal-power crossfade: slide toward one and its ribbon
// swells and brightens while the other recedes to a hush, and every point in
// between is a new duet that never existed before. Both voices pass through
// their own safeMaster ear-safety bus, so no blend can turn harsh.
//
// The point is endlessness: 30 pieces, any pair, any balance — a generative
// chamber for his own music.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { COLLECTIONS, REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

type Phase = "idle" | "loading" | "playing" | "error";

const HUE_A = 34; // warm amber
const HUE_B = 190; // cool cyan

export default function TwoTrackWeavePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [idA, setIdA] = useState(REAL_TRACKS[0].id);
  const [idB, setIdB] = useState(REAL_TRACKS[13].id); // a Snowflake piece by default
  const [mix, setMix] = useState(0.5);

  const ctxRef = useRef<AudioContext | null>(null);
  const safeARef = useRef<SafeMaster | null>(null);
  const safeBRef = useRef<SafeMaster | null>(null);
  const srcARef = useRef<AudioBufferSourceNode | null>(null);
  const srcBRef = useRef<AudioBufferSourceNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const mixRef = useRef(0.5);

  const stopSources = useCallback(() => {
    for (const ref of [srcARef, srcBRef]) {
      const s = ref.current;
      if (s) { try { s.onended = null; s.stop(); } catch { /* stopped */ } ref.current = null; }
    }
  }, []);

  useEffect(() => () => {
    stopSources();
    cancelAnimationFrame(rafRef.current);
    safeARef.current?.disconnect();
    safeBRef.current?.disconnect();
    ctxRef.current?.close().catch(() => {});
  }, [stopSources]);

  const applyMix = useCallback((m: number) => {
    // equal-power crossfade, scaled under the safeMaster ceiling
    safeARef.current?.setGain(Math.cos(m * Math.PI / 2) * 0.85);
    safeBRef.current?.setGain(Math.sin(m * Math.PI / 2) * 0.85);
  }, []);

  const start = useCallback(async () => {
    stopSources();
    setPhase("loading");
    let ctx = ctxRef.current;
    if (!ctx) {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
      ctxRef.current = ctx;
      safeARef.current = createSafeMaster(ctx);
      safeBRef.current = createSafeMaster(ctx);
    }
    await ctx.resume().catch(() => {});
    try {
      const [a, b] = await Promise.all([
        loadRealTrackBuffer(ctx, idA),
        loadRealTrackBuffer(ctx, idB),
      ]);
      const srcA = ctx.createBufferSource();
      srcA.buffer = a.buffer; srcA.loop = true;
      srcA.connect(safeARef.current!.input);
      const srcB = ctx.createBufferSource();
      srcB.buffer = b.buffer; srcB.loop = true;
      srcB.connect(safeBRef.current!.input);
      srcARef.current = srcA;
      srcBRef.current = srcB;
      applyMix(mix);
      const t0 = ctx.currentTime + 0.06;
      srcA.start(t0);
      srcB.start(t0);
      setPhase("playing");
    } catch {
      setPhase("error");
    }
  }, [idA, idB, mix, applyMix, stopSources]);

  const toggle = useCallback(() => {
    if (phase === "playing") { stopSources(); setPhase("idle"); }
    else void start();
  }, [phase, start, stopSources]);

  const onMix = useCallback((m: number) => {
    setMix(m);
    applyMix(m);
  }, [applyMix]);

  // render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const waveA = new Uint8Array(1024);
    const waveB = new Uint8Array(1024);

    const ribbon = (
      analyser: AnalyserNode | undefined,
      buf: Uint8Array<ArrayBuffer>,
      hue: number,
      gain: number,
      phaseOff: number,
      W: number,
      H: number,
      t: number,
    ) => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(buf);
      const mid = H / 2;
      const amp = H * 0.16 * gain;
      g.globalCompositeOperation = "lighter";
      for (let layer = 0; layer < 2; layer++) {
        g.beginPath();
        const N = 180;
        for (let i = 0; i <= N; i++) {
          const fx = i / N;
          const bi = Math.floor(fx * (buf.length - 1));
          const w = (buf[bi] - 128) / 128;
          const braid = Math.sin(fx * Math.PI * 3 + t * 0.6 + phaseOff) * H * 0.12;
          const x = fx * W;
          const y = mid + braid + w * amp * (1 - layer * 0.4);
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.strokeStyle = `hsla(${hue}, 80%, ${58 - layer * 10}%, ${(0.10 + gain * 0.35) * (1 - layer * 0.4)})`;
        g.lineWidth = dpr * (2.4 - layer);
        g.stroke();
      }
      g.globalCompositeOperation = "source-over";
    };

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width, H = canvas.height;
      const t = performance.now() / 1000;
      g.fillStyle = "rgba(4,5,10,0.22)";
      g.fillRect(0, 0, W, H);

      const gA = Math.cos(mixRef.current * Math.PI / 2);
      const gB = Math.sin(mixRef.current * Math.PI / 2);
      ribbon(safeARef.current?.analyser, waveA, HUE_A, gA, 0, W, H, t);
      ribbon(safeBRef.current?.analyser, waveB, HUE_B, gB, Math.PI, W, H, t);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => { mixRef.current = mix; }, [mix]);

  const titleFor = (id: string) => REAL_TRACKS.find((t) => t.id === id)?.title ?? "";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#04050a] text-neutral-200">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* top: the two voices */}
      <div className="pointer-events-none absolute inset-x-0 top-6 flex items-center justify-between px-6 text-center sm:px-16">
        <div className="text-left">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em]" style={{ color: `hsl(${HUE_A},70%,65%)` }}>voice A</div>
          <div className="text-sm font-light text-amber-100">{titleFor(idA)}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em]" style={{ color: `hsl(${HUE_B},70%,65%)` }}>voice B</div>
          <div className="text-sm font-light text-cyan-100">{titleFor(idB)}</div>
        </div>
      </div>

      {/* controls */}
      <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-4 px-4">
        <div className="flex w-full max-w-xl items-center gap-3">
          <span className="font-mono text-[10px]" style={{ color: `hsl(${HUE_A},70%,65%)` }}>A</span>
          <input
            type="range" min={0} max={1} step={0.005} value={mix}
            onChange={(e) => onMix(parseFloat(e.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-gradient-to-r from-amber-400/60 to-cyan-400/60 accent-neutral-200"
          />
          <span className="font-mono text-[10px]" style={{ color: `hsl(${HUE_B},70%,65%)` }}>B</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <select
            value={idA}
            onChange={(e) => { setIdA(e.target.value); if (phase === "playing") void start(); }}
            className="max-w-[42vw] rounded-full border border-amber-300/25 bg-black/50 px-3 py-1.5 text-xs text-amber-100 backdrop-blur-sm focus:outline-none"
          >
            {COLLECTIONS.map((c) => (
              <optgroup key={c.name} label={c.name}>
                {c.tracks.map((t) => <option key={t.id} value={t.id} className="bg-neutral-900">{t.title}</option>)}
              </optgroup>
            ))}
          </select>

          <button
            onClick={toggle}
            className="rounded-full border border-white/25 bg-black/40 px-5 py-1.5 text-xs uppercase tracking-widest text-neutral-100 transition-colors hover:bg-black/60"
          >
            {phase === "loading" ? "loading…" : phase === "playing" ? "stop" : "weave"}
          </button>

          <select
            value={idB}
            onChange={(e) => { setIdB(e.target.value); if (phase === "playing") void start(); }}
            className="max-w-[42vw] rounded-full border border-cyan-300/25 bg-black/50 px-3 py-1.5 text-xs text-cyan-100 backdrop-blur-sm focus:outline-none"
          >
            {COLLECTIONS.map((c) => (
              <optgroup key={c.name} label={c.name}>
                {c.tracks.map((t) => <option key={t.id} value={t.id} className="bg-neutral-900">{t.title}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {phase === "error" && <div className="text-xs text-red-400/80">could not load one of the tracks</div>}
      </div>
    </main>
  );
}
