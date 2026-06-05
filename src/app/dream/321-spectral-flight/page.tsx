"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 321-spectral-flight — fly through the INSIDE of Karel's own recording.
//
// His "Welcome Home" piano is fetched, decoded, and run through a hand-written
// offline STFT into a time × log-frequency magnitude grid. That grid becomes a
// three.js point-cloud landscape you pilot: the camera flies forward along the
// time axis locked to playback position, and drag / arrow keys steer the look.
//
// Four subsystems: real-stem fetch+decode (audio.ts) · offline-STFT landscape
// builder (fft.ts) · three.js flythrough renderer (scene.ts) · transport-sync
// (this file). References: Refik Anadol "Latent City" (BRUSK, 2026) and Ryoji
// Ikeda "data-verse" — inhabiting data as a navigable landscape.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveSource } from "./audio";
import { buildSpectralGrid } from "./fft";
import { buildFlightScene, type FlightScene } from "./scene";

type Phase = "idle" | "loading" | "flying" | "error";

function fmtClock(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function makeCtx(): AudioContext | null {
  try {
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    return new Ctx();
  } catch {
    return null;
  }
}

export default function SpectralFlightPage() {
  const mountRef = useRef<HTMLDivElement>(null);

  // engine refs (rAF reads these, never React state)
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const sceneRef = useRef<FlightScene | null>(null);
  const rafRef = useRef<number>(0);

  // transport bookkeeping — all in AudioContext time
  const startedAtRef = useRef(0); // ctx.currentTime when playback (re)started
  const offsetRef = useRef(0); // seconds into the buffer at that start
  const playingRef = useRef(false);

  // steer state, read by rAF
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const keysRef = useRef({ left: false, right: false, up: false, down: false });
  const draggingRef = useRef(false);

  // UI state
  const [phase, setPhase] = useState<Phase>("idle");
  const [sourceLabel, setSourceLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [webglOk, setWebglOk] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [clock, setClock] = useState("0:00");
  const [duration, setDuration] = useState(0);

  // ── transport helpers ───────────────────────────────────────────────────────
  const currentTime = useCallback((): number => {
    const ctx = ctxRef.current;
    const buf = bufferRef.current;
    if (!ctx || !buf) return 0;
    if (!playingRef.current) return offsetRef.current;
    const t = offsetRef.current + (ctx.currentTime - startedAtRef.current);
    return t % buf.duration; // loop
  }, []);

  const startPlayback = useCallback((offset: number) => {
    const ctx = ctxRef.current;
    const buf = bufferRef.current;
    const master = masterRef.current;
    if (!ctx || !buf || !master) return;

    // tear down any prior source
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null;
        sourceNodeRef.current.stop();
      } catch {
        /* already stopped */
      }
      sourceNodeRef.current.disconnect();
    }

    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.loop = true;
    node.connect(master);
    node.start(0, offset % buf.duration);
    sourceNodeRef.current = node;
    offsetRef.current = offset % buf.duration;
    startedAtRef.current = ctx.currentTime;
    playingRef.current = true;
    setPlaying(true);
  }, []);

  const pausePlayback = useCallback(() => {
    const node = sourceNodeRef.current;
    offsetRef.current = currentTime();
    playingRef.current = false;
    if (node) {
      try {
        node.onended = null;
        node.stop();
      } catch {
        /* already stopped */
      }
      node.disconnect();
      sourceNodeRef.current = null;
    }
    setPlaying(false);
  }, [currentTime]);

  const togglePlay = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume(); // iOS gesture resume
    if (playingRef.current) {
      pausePlayback();
    } else {
      startPlayback(offsetRef.current);
    }
  }, [pausePlayback, startPlayback]);

  // ── primary action: build the world and take off ────────────────────────────
  const launch = useCallback(async () => {
    if (phase === "loading" || phase === "flying") return;
    setError(null);
    setPhase("loading");

    const ctx = ctxRef.current ?? makeCtx();
    if (!ctx) {
      setError("Web Audio is unavailable in this browser.");
      setPhase("error");
      return;
    }
    ctxRef.current = ctx;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* will retry on play */
      }
    }

    // master chain: gentle lowpass + a touch of make-up gain
    let master = masterRef.current;
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0.9;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 14000;
      lp.Q.value = 0.3;
      master.connect(lp);
      lp.connect(ctx.destination);
      masterRef.current = master;
    }

    let source;
    try {
      source = await resolveSource(ctx);
    } catch {
      setError("Could not prepare an audio source.");
      setPhase("error");
      return;
    }
    bufferRef.current = source.buffer;
    setSourceLabel(source.label);
    setDuration(source.buffer.duration);

    // offline STFT → landscape grid (mono mix of the whole track)
    const channels: Float32Array[] = [];
    for (let c = 0; c < source.buffer.numberOfChannels; c++) {
      channels.push(source.buffer.getChannelData(c));
    }
    let grid;
    try {
      grid = buildSpectralGrid(channels, source.buffer.sampleRate, {
        fftSize: 2048,
        hop: 1024,
        outCols: 340,
        outRows: 128,
      });
    } catch {
      setError("Spectral analysis failed.");
      setPhase("error");
      return;
    }

    // build the three.js scene
    const mount = mountRef.current;
    if (!mount) {
      setError("Render mount missing.");
      setPhase("error");
      return;
    }
    const scene = buildFlightScene(mount, grid);
    if (!scene) {
      setWebglOk(false);
      setError("WebGL is unavailable — the flythrough needs WebGL.");
      setPhase("error");
      return;
    }
    sceneRef.current = scene;

    setPhase("flying");
    offsetRef.current = 0;
    startPlayback(0);
  }, [phase, startPlayback]);

  // ── render + transport-sync loop ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "flying") return;
    const buf = bufferRef.current;
    const scene = sceneRef.current;
    if (!buf || !scene) return;

    let last = performance.now();
    let clockAcc = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // integrate keyboard steering
      const keys = keysRef.current;
      const rate = dt * 1.6;
      if (!draggingRef.current) {
        if (keys.left) yawRef.current -= rate;
        if (keys.right) yawRef.current += rate;
        if (keys.up) pitchRef.current += rate;
        if (keys.down) pitchRef.current -= rate;
      }
      // ease steer back toward center when idle
      yawRef.current *= 1 - dt * 0.6;
      pitchRef.current *= 1 - dt * 0.6;
      yawRef.current = Math.max(-1.6, Math.min(1.6, yawRef.current));
      pitchRef.current = Math.max(-1, Math.min(1, pitchRef.current));

      const t = currentTime();
      const progress = buf.duration > 0 ? t / buf.duration : 0;
      scene.render(progress, yawRef.current, pitchRef.current, dt);

      // throttle the React clock to ~4 Hz
      clockAcc += dt;
      if (clockAcc > 0.25) {
        clockAcc = 0;
        setClock(fmtClock(t));
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, currentTime]);

  // ── resize ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── keyboard steering ────────────────────────────────────────────────────────
  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = keysRef.current;
      switch (e.key) {
        case "ArrowLeft":
          k.left = down;
          break;
        case "ArrowRight":
          k.right = down;
          break;
        case "ArrowUp":
          k.up = down;
          break;
        case "ArrowDown":
          k.down = down;
          break;
        case " ":
          if (down && phase === "flying") {
            e.preventDefault();
            void togglePlay();
          }
          return;
        default:
          return;
      }
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        e.preventDefault();
      }
    };
    const onDown = (e: KeyboardEvent) => set(e, true);
    const onUp = (e: KeyboardEvent) => set(e, false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [phase, togglePlay]);

  // ── pointer drag steering ────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      draggingRef.current = true;
      lastX = e.clientX;
      lastY = e.clientY;
      mount.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      yawRef.current = Math.max(
        -1.6,
        Math.min(1.6, yawRef.current + dx * 0.006),
      );
      pitchRef.current = Math.max(
        -1,
        Math.min(1, pitchRef.current - dy * 0.005),
      );
    };
    const onPointerUp = (e: PointerEvent) => {
      draggingRef.current = false;
      mount.releasePointerCapture?.(e.pointerId);
    };
    mount.addEventListener("pointerdown", onPointerDown);
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerup", onPointerUp);
    mount.addEventListener("pointercancel", onPointerUp);
    return () => {
      mount.removeEventListener("pointerdown", onPointerDown);
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerup", onPointerUp);
      mount.removeEventListener("pointercancel", onPointerUp);
    };
  }, [phase]);

  // ── full teardown on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const node = sourceNodeRef.current;
      if (node) {
        try {
          node.onended = null;
          node.stop();
        } catch {
          /* already stopped */
        }
        node.disconnect();
      }
      sceneRef.current?.dispose();
      sceneRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
    };
  }, []);

  const flying = phase === "flying";

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#04030a] font-mono text-white">
      {/* three.js mount */}
      <div ref={mountRef} className="absolute inset-0 z-0" aria-hidden />

      {/* top-left identity + transport */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-5 sm:p-7">
        <header className="max-w-xl space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Spectral Flight
          </h1>
          <p className="text-base leading-relaxed text-white/75">
            Fly through the inside of Karel&apos;s own recording — his{" "}
            <span className="text-violet-300">Welcome Home</span> piano rendered
            as a navigable 3D spectral landscape, in sync with playback.
          </p>

          {sourceLabel && (
            <p
              className={`text-base ${
                sourceLabel.includes("demo")
                  ? "text-rose-300"
                  : "text-violet-300"
              }`}
            >
              {sourceLabel}
            </p>
          )}

          {error && (
            <p className="text-base text-rose-300" role="alert">
              {error}
            </p>
          )}

          {!webglOk && (
            <p className="text-base text-rose-300">
              Your browser reports no WebGL — the flythrough cannot render here.
            </p>
          )}
        </header>

        {/* bottom transport row */}
        <footer className="flex flex-wrap items-end justify-between gap-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3">
            {!flying ? (
              <button
                onClick={() => void launch()}
                disabled={phase === "loading"}
                className="min-h-[44px] rounded-full border border-violet-400/40 bg-violet-500/20 px-5 py-2.5 text-base font-medium text-white transition-colors hover:bg-violet-500/30 disabled:cursor-wait disabled:opacity-60"
              >
                {phase === "loading"
                  ? "Building the landscape…"
                  : "Fly through his recording"}
              </button>
            ) : (
              <>
                <button
                  onClick={() => void togglePlay()}
                  className="min-h-[44px] rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-base font-medium text-white transition-colors hover:bg-white/20"
                >
                  {playing ? "Pause" : "Play"}
                </button>
                <span className="text-base tabular-nums text-white/75">
                  {clock} / {fmtClock(duration)}
                </span>
                <span className="hidden text-base text-white/55 sm:inline">
                  drag or arrow keys to steer · space to play/pause
                </span>
              </>
            )}
          </div>

          <a
            href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/321-spectral-flight/README.md"
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto text-base text-white/55 underline transition-colors hover:text-white/95"
          >
            Read the design notes
          </a>
        </footer>
      </div>
    </div>
  );
}
