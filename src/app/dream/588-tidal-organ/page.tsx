"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  COASTS,
  fetchSwell,
  makeDemoSwell,
  nearestCoast,
  type Coast,
  type SwellState,
  type Source,
} from "./ocean";
import { runOrgan, type OrganHandle } from "./audio";
import {
  buildCanvas2DField,
  buildWebGPUField,
  paramsFromSwell,
  type FieldHandle,
} from "./field";

export default function TidalOrganPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const organRef = useRef<OrganHandle | null>(null);
  const fieldRef = useRef<FieldHandle | null>(null);
  const swellRef = useRef<SwellState>(makeDemoSwell(0));
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [coast, setCoast] = useState<Coast>(COASTS[0]);
  const [source, setSource] = useState<Source>({ kind: "demo", name: COASTS[0].name });
  const [renderer, setRenderer] = useState<"webgpu" | "canvas2d" | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Pull live swell for a coast; fall back to demo on any failure.
  const loadSwell = useCallback(async (c: Coast) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const s = await fetchSwell(c, controller.signal);
      swellRef.current = s;
      organRef.current?.setSwell(s);
      setSource({ kind: "live", name: c.name });
      setStatusMsg(null);
    } catch {
      // keep the demo swell already running
      setSource({ kind: "demo", name: c.name });
      setStatusMsg("Marine feed unreachable — playing demo swell.");
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  // Build the visual field (WebGPU preferred, Canvas2D fallback).
  const buildField = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let field: FieldHandle | null = null;
    try {
      field = await buildWebGPUField(canvas);
    } catch {
      field = null;
    }
    if (!field) field = buildCanvas2DField(canvas);
    fieldRef.current = field;
    setRenderer(field ? field.kind : null);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    field?.resize(canvas.clientWidth, canvas.clientHeight, dpr);
  }, []);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);

    // Create + resume AudioContext inside the gesture (iOS).
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    try {
      await ctx.resume();
    } catch {
      // best effort
    }
    const organ = runOrgan(ctx);
    organRef.current = organ;
    organ.setSwell(swellRef.current);

    await buildField();
    void loadSwell(coast);
  }, [buildField, coast, loadSwell]);

  // Auto-start path: if nobody taps within ~3s, start silently-ish so a glance
  // at 06:30 still sounds and moves. (Browsers may gate audio until a gesture,
  // but the visual field and demo swell will already be running.)
  useEffect(() => {
    const id = setTimeout(() => {
      if (!startedRef.current) void start();
    }, 3000);
    return () => clearTimeout(id);
  }, [start]);

  // Animation + demo-swell drift loop.
  useEffect(() => {
    if (!started) return;
    let mounted = true;
    const t0 = performance.now();

    const loop = (now: number) => {
      if (!mounted) return;
      const elapsed = (now - t0) / 1000;

      // If we're on demo swell, keep it drifting and feed the organ.
      if (source.kind === "demo") {
        const s = makeDemoSwell(elapsed);
        swellRef.current = s;
        organRef.current?.setSwell(s);
      }

      const level = organRef.current?.level() ?? 0.3;
      const params = paramsFromSwell(swellRef.current, level);
      fieldRef.current?.render(params, elapsed);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [started, source.kind]);

  // Refresh live data periodically while live (the sea this minute keeps moving).
  useEffect(() => {
    if (!started || source.kind !== "live") return;
    const id = setInterval(() => void loadSwell(coast), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [started, source.kind, coast, loadSwell]);

  // Resize handling.
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current;
      const field = fieldRef.current;
      if (!canvas || !field) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      field.resize(canvas.clientWidth, canvas.clientHeight, dpr);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Cleanup audio + field on unmount.
  useEffect(() => {
    return () => {
      const organ = organRef.current;
      const field = fieldRef.current;
      organ?.dispose();
      field?.dispose();
      organ?.ctx.close().catch(() => {});
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const pickCoast = useCallback(
    (c: Coast) => {
      setCoast(c);
      setSource((prev) => ({ kind: prev.kind, name: c.name }));
      if (startedRef.current) void loadSwell(c);
    },
    [loadSwell],
  );

  const useMyLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatusMsg("Geolocation unavailable — pick a coastline below.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = nearestCoast(pos.coords.latitude, pos.coords.longitude);
        setStatusMsg(`Nearest ocean point: ${c.name}.`);
        pickCoast(c);
      },
      () => setStatusMsg("Location denied — pick a coastline below."),
      { timeout: 8000 },
    );
  }, [pickCoast]);

  const isLive = source.kind === "live";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#04080f] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Overlay UI */}
      <div className="relative z-10 flex min-h-screen flex-col justify-between p-5 sm:p-8">
        <header className="max-w-2xl">
          <Link
            href="/dream"
            className="text-sm text-muted-foreground transition hover:text-foreground"
          >
            ← dream lab
          </Link>
          <h1 className="mt-3 font-semibold text-3xl text-foreground sm:text-4xl">Tidal Organ</h1>
          <p className="mt-2 max-w-xl text-base text-foreground">
            A warm just-intonation organ tuned by the live state of a real ocean
            right now — music about the sea this minute, not a synth knob.
          </p>

          {/* source chip */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className={
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm " +
                (isLive
                  ? "border-violet-400/30 bg-violet-400/10 text-violet-300/95"
                  : "border-violet-400/30 bg-violet-400/10 text-violet-300/95")
              }
            >
              <span
                className={
                  "h-2 w-2 rounded-full " +
                  (isLive ? "bg-violet-300" : "bg-violet-300")
                }
              />
              {isLive ? `live · ${source.name}` : `demo swell (offline) · ${source.name}`}
            </span>
            {renderer && (
              <span className="text-sm text-muted-foreground">
                {renderer === "webgpu" ? "WebGPU field" : "Canvas2D field"}
              </span>
            )}
          </div>

          {statusMsg && (
            <p className="mt-3 text-sm text-violet-300">{statusMsg}</p>
          )}
        </header>

        <div className="mt-6 max-w-2xl">
          {!started ? (
            <button
              onClick={() => void start()}
              className="rounded-xl bg-muted px-6 py-3 text-base font-medium text-[#04080f] shadow-lg transition hover:bg-card"
            >
              Listen to the sea
            </button>
          ) : (
            <div className="space-y-4 rounded-2xl border border-border bg-black/30 p-4 backdrop-blur-sm">
              <div>
                <p className="mb-2 text-sm text-muted-foreground">Coastline</p>
                <div className="flex flex-wrap gap-2">
                  {COASTS.map((c) => {
                    const active = c.id === coast.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => pickCoast(c)}
                        className={
                          "rounded-lg px-4 py-2.5 text-sm transition " +
                          (active
                            ? "bg-violet-400/20 text-violet-300 ring-1 ring-violet-400/40"
                            : "bg-muted text-muted-foreground hover:bg-accent")
                        }
                      >
                        {c.name}
                      </button>
                    );
                  })}
                  <button
                    onClick={useMyLocation}
                    className="rounded-lg bg-muted px-4 py-2.5 text-sm text-muted-foreground transition hover:bg-accent"
                  >
                    Use my location
                  </button>
                </div>
              </div>

              <button
                onClick={() => setShowNotes((v) => !v)}
                className="text-sm text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
              >
                {showNotes ? "Hide design notes" : "Design notes"}
              </button>

              {showNotes && (
                <div className="space-y-2 border-t border-border pt-3 text-sm text-muted-foreground">
                  <p>
                    <span className="text-foreground">Mapping.</span> Wave period
                    breathes the whole texture (longer swell = slower, grander
                    breaths). Wave height stacks more just-intonation voices and
                    opens the filter (bigger seas = fuller, brighter chord).
                    Swell period sets the root (deep groundswell = lower
                    fundamental, ~55–110&nbsp;Hz). Wave direction pans the voices
                    — a compass of sound.
                  </p>
                  <p>
                    <span className="text-foreground">Chord.</span> Just-intonation
                    ratios 1/1, 9/8, 5/4, 3/2, 7/4, 2/1 over a low root, soft
                    sine/triangle partials, gentle lowpass, slow attack and
                    detune — a sea organ breathing, not a bright synth.
                  </p>
                  <p>
                    <span className="text-foreground">Data.</span> Open-Meteo
                    Marine API (no key, fetched client-side). If it fails or you
                    glance before interacting, a synthetic drifting demo swell
                    keeps the piece sounding and moving.
                  </p>
                  <p className="text-muted-foreground">
                    Lineage: Zadar Sea Organ; Annea Lockwood, “A Sound Map of the
                    Hudson River”; the “Pulse of an Ocean” buoy-sonification work;
                    arXiv 2602.14560 (ENSO sonification with gamelan scales).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
