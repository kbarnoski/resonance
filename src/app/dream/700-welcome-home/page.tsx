"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 700-welcome-home — the reference proto for playing Karel's REAL music.
//
// This is the canonical example every future audible proto should copy when it
// wants genuine music instead of a synth bed:
//   1. `loadRealTrackBuffer(ctx, id)` fetches + decodes a real album track from
//      Welcome Home or the Snowflake EP (anon-playable via a shared journey
//      path — no login).
//   2. The decoded buffer plays through a BufferSource into `createSafeMaster`,
//      so the ear-safety bus (high-shelf cut · 14 kHz cap · limiter) sits between
//      the music and the speakers like it does for every other piece.
//   3. Visuals read `safeMaster.analyser` — the TAMED signal — so what you see is
//      what you actually hear.
//
// The visual is a soft radial spectrum bloom: warm, slow, meditative. No strobe,
// no harsh contrast — matches the cosmic / Richter-calm house aesthetic.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WELCOME_HOME_TRACKS,
  SNOWFLAKE_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";

type Phase = "idle" | "loading" | "playing" | "error";

function fmtClock(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function WelcomeHomePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeId, setActiveId] = useState<string>(WELCOME_HOME_TRACKS[0].id);
  const [title, setTitle] = useState<string>(WELCOME_HOME_TRACKS[0].title);
  const [clock, setClock] = useState<string>("0:00");
  const [error, setError] = useState<string>("");

  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  // ── teardown helpers ──────────────────────────────────────────────────────
  const stopSource = useCallback(() => {
    const src = srcRef.current;
    if (src) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* already stopped */
      }
      srcRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopSource();
      cancelAnimationFrame(rafRef.current);
      safeRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, [stopSource]);

  // ── play a chosen track ─────────────────────────────────────────────────────
  const play = useCallback(
    async (id: string) => {
      setError("");
      setActiveId(id);
      setPhase("loading");
      stopSource();

      // Lazily build the context + ear-safety bus once.
      let ctx = ctxRef.current;
      if (!ctx) {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new Ctx();
        ctxRef.current = ctx;
        safeRef.current = createSafeMaster(ctx);
      }
      await ctx.resume().catch(() => {});

      let loaded;
      try {
        loaded = await loadRealTrackBuffer(ctx, id);
      } catch (e) {
        setPhase("error");
        setError(e instanceof Error ? e.message : "could not load track");
        return;
      }

      const src = ctx.createBufferSource();
      src.buffer = loaded.buffer;
      src.connect(safeRef.current!.input);
      src.onended = () => {
        if (srcRef.current === src) {
          srcRef.current = null;
          setPhase("idle");
        }
      };
      srcRef.current = src;
      durationRef.current = loaded.buffer.duration;
      startedAtRef.current = ctx.currentTime;
      src.start();

      setTitle(loaded.title);
      setPhase("playing");
    },
    [stopSource],
  );

  const toggle = useCallback(() => {
    if (phase === "playing") {
      stopSource();
      setPhase("idle");
    } else {
      void play(activeId);
    }
  }, [phase, activeId, play, stopSource]);

  // ── radial spectrum bloom ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const bins = new Uint8Array(512);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;

      // slow fade for trails (dark, never full black flash)
      ctx2d.fillStyle = "rgba(6, 7, 12, 0.16)";
      ctx2d.fillRect(0, 0, W, H);

      const analyser = safeRef.current?.analyser;
      const playing = phase === "playing" && analyser;
      if (playing) analyser.getByteFrequencyData(bins);

      const n = 180;
      const baseR = Math.min(W, H) * 0.16;
      const maxR = Math.min(W, H) * 0.42;
      const t = performance.now() / 1000;

      ctx2d.lineWidth = Math.max(1, dpr);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        // sample the low-mid band where piano energy lives; gentle idle breath.
        const bi = Math.floor((i / n) * 220);
        const mag = playing ? bins[bi] / 255 : 0.12 + 0.06 * Math.sin(t + a * 3);
        const r0 = baseR + Math.sin(t * 0.3 + a * 5) * baseR * 0.05;
        const r1 = r0 + mag * (maxR - baseR);

        const hue = 28 + mag * 34; // warm amber → gold
        const light = 40 + mag * 30;
        ctx2d.strokeStyle = `hsla(${hue}, 70%, ${light}%, ${0.25 + mag * 0.6})`;
        ctx2d.beginPath();
        ctx2d.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx2d.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx2d.stroke();
      }

      // soft inner glow
      const g = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, baseR);
      g.addColorStop(0, "rgba(255, 214, 150, 0.10)");
      g.addColorStop(1, "rgba(255, 214, 150, 0)");
      ctx2d.fillStyle = g;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, baseR, 0, Math.PI * 2);
      ctx2d.fill();

      // transport clock
      if (playing) {
        const elapsed =
          (ctxRef.current?.currentTime ?? 0) - startedAtRef.current;
        setClock(`${fmtClock(elapsed)} / ${fmtClock(durationRef.current)}`);
      }
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [phase]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#06070c] text-neutral-200">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* center transport */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
        <button
          onClick={toggle}
          className="pointer-events-auto flex h-24 w-24 items-center justify-center rounded-full border border-amber-200/30 bg-black/30 text-amber-100 backdrop-blur-sm transition-colors hover:border-amber-200/60 hover:bg-black/50"
          aria-label={phase === "playing" ? "Pause" : "Play"}
        >
          {phase === "loading" ? (
            <span className="animate-pulse text-xs uppercase tracking-widest">
              loading
            </span>
          ) : phase === "playing" ? (
            <span className="text-3xl">❚❚</span>
          ) : (
            <span className="ml-1 text-3xl">▶</span>
          )}
        </button>
        <div className="text-center">
          <div className="text-lg font-light tracking-wide text-amber-50">
            {title}
          </div>
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-200/40">
            {SNOWFLAKE_TRACKS.some((t) => t.id === activeId)
              ? "Snowflake"
              : "Welcome Home"}{" "}
            · Karel Barnoski
          </div>
          {phase === "playing" && (
            <div className="mt-1 font-mono text-[11px] text-neutral-500">
              {clock}
            </div>
          )}
          {phase === "error" && (
            <div className="mt-1 font-mono text-[11px] text-red-400/80">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* track selector — two albums */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4">
        {(
          [
            ["Welcome Home", WELCOME_HOME_TRACKS],
            ["Snowflake", SNOWFLAKE_TRACKS],
          ] as const
        ).map(([album, tracks]) => (
          <div key={album} className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="mr-1 font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-600">
              {album}
            </span>
            {tracks.map((tk) => {
              const active = tk.id === activeId;
              return (
                <button
                  key={tk.id}
                  onClick={() => void play(tk.id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    active
                      ? "border-amber-200/60 bg-amber-200/10 text-amber-100"
                      : "border-white/10 text-neutral-400 hover:border-white/25 hover:text-neutral-200"
                  }`}
                >
                  {tk.title}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </main>
  );
}
