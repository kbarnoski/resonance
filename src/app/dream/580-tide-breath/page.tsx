"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { loadMarine, type MarineResult } from "./marine";
import { buildDrone, type DroneHandle } from "./audio";
import { startRenderer, type RendererHandle } from "./render";

type Phase = "idle" | "loading" | "playing";

export default function TideBreathPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const droneRef = useRef<DroneHandle | null>(null);
  const rendererRef = useRef<RendererHandle | null>(null);
  const marineRef = useRef<MarineResult | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [marine, setMarine] = useState<MarineResult | null>(null);
  const [renderMode, setRenderMode] = useState<"webgpu" | "canvas2d" | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Resize canvas to screen ───────────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.offsetWidth * dpr);
    canvas.height = Math.round(canvas.offsetHeight * dpr);
  }, []);

  // ── Start handler (user gesture — required for AudioContext on iOS) ────────
  const handlePlay = useCallback(async () => {
    setPhase("loading");
    setLoadError(null);

    // 1. Start renderer first — visual works from frame one
    const canvas = canvasRef.current;
    if (!canvas) return;
    resizeCanvas();

    let renderer: RendererHandle;
    try {
      renderer = await startRenderer(canvas);
    } catch {
      setLoadError("Renderer failed to init.");
      setPhase("idle");
      return;
    }
    rendererRef.current = renderer;
    setRenderMode(renderer.mode);

    // 2. Build audio drone (inside user gesture for iOS unlock)
    let drone: DroneHandle;
    try {
      drone = buildDrone();
    } catch {
      renderer.stop();
      setLoadError("Audio failed to init.");
      setPhase("idle");
      return;
    }
    droneRef.current = drone;

    // 3. Fetch marine data (geolocation + API)
    setPhase("playing");
    try {
      const result = await loadMarine();
      marineRef.current = result;
      setMarine(result);
      drone.setMarine(result.data);
      renderer.setMarine(result.data);
    } catch {
      // loadMarine never throws (it has its own fallback), but be safe
      setLoadError("Could not load marine data — using sample swell.");
    }
  }, [resizeCanvas]);

  // ── Stop / cleanup ────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    droneRef.current?.stop();
    droneRef.current = null;
    rendererRef.current?.stop();
    rendererRef.current = null;
    marineRef.current = null;
    setMarine(null);
    setRenderMode(null);
    setPhase("idle");
    setShowNotes(false);
  }, []);

  // ── Resize observer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [phase, resizeCanvas]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      droneRef.current?.stop();
      rendererRef.current?.stop();
    };
  }, []);

  // ── Derived display values ────────────────────────────────────────────────
  const isLive = marine?.status === "live";
  const statusText = marine
    ? isLive
      ? `Live · Open-Meteo Marine · ${marine.place}`
      : "Sample swell (feed offline)"
    : null;
  const swellPeriod = marine?.data.swell_wave_period ?? marine?.data.wave_period ?? null;
  const waveHeight = marine?.data.wave_height ?? null;
  const sst = marine?.data.sea_surface_temperature ?? null;

  return (
    <div className="relative w-full min-h-screen bg-black overflow-hidden">
      {/* Canvas — always present, visible once playing */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{
          opacity: phase === "playing" ? 1 : 0,
          transition: "opacity 1.2s ease",
        }}
      />

      {/* Dark overlay for UI legibility during playing */}
      {phase === "playing" && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.5) 100%)" }}
        />
      )}

      {/* ── Idle / Loading screen ──────────────────────────────────────────── */}
      {(phase === "idle" || phase === "loading") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-20">
          {/* Ambient glow */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 65% 45% at 50% 70%, rgba(40,80,140,0.14) 0%, transparent 70%)" }}
          />

          <h1 className="font-semibold text-3xl md:text-4xl text-foreground mb-3 tracking-wide z-10">
            Tide Breath
          </h1>
          <p className="text-base text-muted-foreground max-w-sm mb-1 leading-relaxed z-10">
            The real ocean breathes a warm chord &mdash; a sustained just-intonation drone
            paced by your coast&rsquo;s live swell period.
          </p>
          <p className="text-sm text-muted-foreground max-w-xs mb-10 leading-relaxed z-10">
            Location optional &middot; no key &middot; no server
          </p>

          {loadError && (
            <p className="mb-5 text-sm text-violet-300 max-w-xs z-10">{loadError}</p>
          )}

          <button
            onClick={() => void handlePlay()}
            disabled={phase === "loading"}
            className="z-10 min-h-[52px] px-8 py-3 rounded-full text-lg font-medium text-foreground
                       border border-border hover:border-border hover:bg-accent
                       disabled:opacity-50 disabled:cursor-wait transition"
          >
            {phase === "loading" ? "Opening the tide…" : "Play the tide"}
          </button>

          <p className="mt-4 text-sm text-muted-foreground z-10">
            Tap grants location access for your nearest coast
          </p>

          {/* Design notes toggle */}
          <button
            onClick={() => setShowNotes((v: boolean) => !v)}
            className="mt-10 text-xs text-violet-300 hover:text-violet-200 z-10 transition"
          >
            {showNotes ? "Hide design notes ↑" : "Design notes ↓"}
          </button>

          {showNotes && (
            <div className="z-10 mt-4 max-w-md text-left text-sm text-muted-foreground leading-relaxed
                            bg-muted border border-border rounded-xl px-5 py-4 backdrop-blur-sm">
              <p className="text-foreground font-medium mb-2">How it works</p>
              <p className="mb-2">
                On play, the browser requests your geolocation (optional; falls back to Monterey Bay).
                A keyless fetch to Open-Meteo Marine returns live swell period, wave height, and sea
                surface temperature. These three numbers control the entire piece.
              </p>
              <p className="mb-2">
                <span className="text-foreground">Sound:</span> Six oscillator pairs tuned to a
                D2 just-intonation chord (root, 3/2, 2/1, 5/2, 3/1, 7/4). The swell period
                drives a sine-shaped breath LFO on master gain and lowpass cutoff &mdash; one full
                inhale/exhale per swell cycle. Wave height deepens the breath envelope. Sea
                temperature tilts the timbre: cooler water darkens the tone, warmer water brightens it.
              </p>
              <p className="mb-2">
                <span className="text-foreground">Visual:</span> A sum-of-sines water surface
                rises and falls with the same breath cycle. WebGPU renders a WGSL fragment shader
                (horizon glow, shimmer, temperature-tinted palette); Canvas2D is the hot fallback.
              </p>
              <p className="text-muted-foreground text-xs">
                References: Andrea Polli (ocean data sonification); &Eacute;liane Radigue &amp;
                La Monte Young (sustained just-intonation drone).
              </p>
            </div>
          )}

          <Link href="/dream" className="absolute bottom-6 text-xs text-muted-foreground/70 hover:text-muted-foreground z-10">
            &larr; back to dream sandbox
          </Link>
        </div>
      )}

      {/* ── Playing HUD ───────────────────────────────────────────────────────── */}
      {phase === "playing" && (
        <>
          {/* Top-right controls */}
          <div className="absolute top-5 right-5 z-20 flex flex-col items-end gap-2 select-none">
            <button
              onClick={handleStop}
              className="min-h-[44px] px-4 py-2.5 text-xs uppercase tracking-wider
                         text-muted-foreground border border-border hover:border-border
                         hover:text-foreground rounded transition"
            >
              Stop
            </button>
            <Link href="/dream"
              className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition">
              &larr; back
            </Link>
            <button
              onClick={() => setShowNotes((v: boolean) => !v)}
              className="text-[11px] text-violet-300/80 hover:text-violet-200 transition"
            >
              {showNotes ? "notes ↑" : "notes ↓"}
            </button>
            {renderMode && (
              <span className="text-[10px] text-muted-foreground/70 uppercase tracking-widest">
                {renderMode === "webgpu" ? "WebGPU" : "Canvas2D"}
              </span>
            )}
          </div>

          {/* Bottom status + data */}
          <div className="absolute bottom-0 left-0 right-0 z-20 px-5 pb-6 pt-10"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)" }}>
            {statusText && (
              <p className={`text-sm font-mono mb-1 ${isLive ? "text-violet-300/95" : "text-violet-300/95"}`}>
                {isLive ? "●" : "○"} {statusText}
              </p>
            )}
            {marine && (
              <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-xs font-mono text-muted-foreground">
                {swellPeriod !== null && (
                  <span>swell {swellPeriod.toFixed(1)} s</span>
                )}
                {waveHeight !== null && (
                  <span>height {waveHeight.toFixed(2)} m</span>
                )}
                {sst !== null && (
                  <span>SST {sst.toFixed(1)}&deg;C</span>
                )}
              </div>
            )}
          </div>

          {/* Design notes panel (in-play) */}
          {showNotes && (
            <div className="absolute top-16 right-5 z-20 max-w-xs text-sm text-muted-foreground
                            leading-relaxed bg-black/70 border border-border rounded-xl
                            px-5 py-4 backdrop-blur-sm">
              <p className="text-foreground font-medium mb-2 text-base">Design notes</p>
              <p className="mb-2">
                Six oscillator pairs tuned to D2 just intonation (1, 3/2, 2, 5/2, 3, 7/4).
                Swell period &rarr; LFO breath speed. Wave height &rarr; breath depth.
                SST &rarr; timbre warmth. No beats, no melody &mdash; one continuous chord
                the ocean plays.
              </p>
              <p className="text-muted-foreground text-xs">
                Ref: Andrea Polli &middot; &Eacute;liane Radigue &middot; La Monte Young
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
