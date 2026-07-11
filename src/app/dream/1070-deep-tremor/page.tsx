"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TremorScene, hasWebGL } from "./scene";
import { startAudio, type TremorAudio } from "./audio";
import {
  loadQuakes,
  pollQuakes,
  type Quake,
  type QuakeSource,
} from "./data";

type Phase = "idle" | "starting" | "running" | "error";

// Replay the recent quakes (sorted by time) over this window so the listener
// hears the planet's last hour unfold, then we switch to live polling.
const REPLAY_SECONDS = 36;
const POLL_MS = 60_000;

export default function DeepTremorPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<TremorScene | null>(null);
  const audioRef = useRef<TremorAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<number[]>([]);
  const pollRef = useRef<number>(0);
  const activeRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<QuakeSource | null>(null);
  const [count, setCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const fireQuake = useCallback((q: Quake) => {
    if (seenRef.current.has(q.id)) return;
    seenRef.current.add(q.id);
    audioRef.current?.strike(q);
    sceneRef.current?.spawnQuake(q.lon, q.lat, q.mag);
    setCount((c) => c + 1);
    // A short-lived "activity" pulse swells the drone when quakes cluster.
    activeRef.current = Math.min(1, activeRef.current + 0.16);
    audioRef.current?.setActivity(activeRef.current);
  }, []);

  const teardown = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = 0;
    }
    sceneRef.current?.dispose();
    sceneRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      // Let the reverb tails ring out before closing the context.
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 900);
    }
  }, []);

  // Full teardown on unmount.
  useEffect(() => teardown, [teardown]);

  // Decay the drone activity smoothly between quakes.
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      activeRef.current = Math.max(0, activeRef.current - 0.04);
      audioRef.current?.setActivity(activeRef.current);
    }, 250);
    return () => clearInterval(id);
  }, [phase]);

  const begin = useCallback(async () => {
    if (phase === "starting" || phase === "running") return;
    setPhase("starting");
    setErrorMsg(null);

    const container = containerRef.current;
    if (!container) {
      setPhase("error");
      setErrorMsg("Could not mount the canvas.");
      return;
    }

    // ── Visuals (WebGL may be unavailable → graceful rose notice) ────────────
    if (!hasWebGL()) {
      setPhase("error");
      setErrorMsg(
        "WebGL is unavailable on this device, so the globe can't render.",
      );
      return;
    }
    let scene: TremorScene;
    try {
      scene = new TremorScene(container);
    } catch {
      setPhase("error");
      setErrorMsg("WebGL failed to initialise, so the globe can't render.");
      return;
    }
    sceneRef.current = scene;
    scene.start();

    // ── Audio (must start from the user gesture) ─────────────────────────────
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      scene.dispose();
      sceneRef.current = null;
      setPhase("error");
      setErrorMsg("Web Audio is unavailable on this device.");
      return;
    }
    ctxRef.current = ctx;
    audioRef.current = startAudio(ctx);

    setPhase("running");

    // ── Data: load, replay the last hour, then poll for new quakes ───────────
    const result = await loadQuakes();
    setSource(result.source);

    const quakes = result.quakes;
    if (quakes.length > 0) {
      const first = quakes[0].time;
      const last = quakes[quakes.length - 1].time;
      const span = Math.max(1, last - first);
      quakes.forEach((q) => {
        const frac = (q.time - first) / span;
        const delayMs = frac * REPLAY_SECONDS * 1000;
        const id = window.setTimeout(() => fireQuake(q), delayMs);
        timersRef.current.push(id);
      });
    }

    // After the replay, poll all_hour every 60s and strike only NEW ids.
    if (result.source === "live") {
      pollRef.current = window.setInterval(async () => {
        try {
          const fresh = await pollQuakes();
          for (const q of fresh) {
            if (!seenRef.current.has(q.id)) fireQuake(q);
          }
        } catch {
          /* transient poll failure — keep playing, try again next tick */
        }
      }, POLL_MS);
    }
  }, [phase, fireQuake]);

  // Keep the renderer sized to the window.
  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#04060c] text-foreground">
      {/* Full-screen three.js canvas mounts here, behind the UI. */}
      <div ref={containerRef} className="absolute inset-0" aria-hidden />

      {/* Soft vignette so UI text stays legible over the void. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(4,6,12,0.7)_100%)]" />

      {/* ── Idle / start panel ─────────────────────────────────────────────── */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-xl rounded-2xl bg-black/55 p-8 ring-1 ring-border backdrop-blur-md">
            <h1 className="font-semibold text-2xl tracking-tight text-foreground sm:text-3xl">
              Deep Tremor
            </h1>
            <p className="mt-3 text-base leading-relaxed text-foreground">
              The planet&apos;s live seismic activity, made into a dark
              instrument you fall into. Every real earthquake of the last hour
              rings out as one depth-timbred strike, placed in 3D from its true
              direction on Earth, decaying into a cavernous void.
            </p>

            <button
              type="button"
              onClick={begin}
              disabled={phase === "starting"}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-card px-4 py-2.5 text-base font-medium text-black transition hover:bg-accent disabled:opacity-60"
            >
              {phase === "starting" ? "Falling in…" : "Begin · descend into the void"}
            </button>

            {errorMsg && (
              <p className="mt-4 text-base text-violet-300">{errorMsg}</p>
            )}

            <p className="mt-4 text-base text-muted-foreground">
              Use headphones — each quake is HRTF-spatialised, so it rings out
              from its true compass bearing around you. Live data from the USGS;
              if the network is unavailable it plays a synthetic Ring of Fire so
              the planet always sounds.
            </p>
          </div>
        </div>
      )}

      {/* ── Running HUD ────────────────────────────────────────────────────── */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-6 top-6 select-none">
          <h1 className="font-semibold text-2xl text-foreground">Deep Tremor</h1>
          <div className="mt-2 flex items-center gap-3">
            {source === "live" && (
              <span className="rounded-full bg-violet-500/15 px-3 py-1 font-mono text-base text-violet-300 ring-1 ring-violet-400/30">
                live · USGS
              </span>
            )}
            {source === "synthetic" && (
              <span className="rounded-full bg-violet-500/15 px-3 py-1 font-mono text-base text-violet-300 ring-1 ring-violet-400/30">
                synthetic
              </span>
            )}
            {source === null && (
              <span className="font-mono text-base text-muted-foreground">
                listening to Earth…
              </span>
            )}
            <span className="font-mono text-base text-muted-foreground">
              {count} quakes
            </span>
          </div>
        </div>
      )}

      {/* ── Design-notes toggle (renders notes in-page) ────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-6 top-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-black/55 px-4 py-2.5 text-base text-foreground ring-1 ring-border backdrop-blur-md transition hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/75 px-6 py-16 backdrop-blur-md">
          <div className="max-w-2xl text-foreground">
            <h2 className="font-semibold text-2xl text-foreground">Design notes</h2>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The question.</span> What if the
              planet&apos;s live seismic activity — every earthquake happening
              on Earth right now — were a dark, spatialised instrument you fall
              into: each real quake a depth-timbred strike placed in 3D space
              around you, ringing out into a cavernous void?
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The data.</span> On the Begin
              gesture we fetch the USGS{" "}
              <span className="font-mono text-base">all_hour</span> GeoJSON feed
              (no key, CORS-enabled), widening to{" "}
              <span className="font-mono text-base">all_day</span> if the hour is
              thin. Each feature gives longitude, latitude, depth (km),
              magnitude, place and time. We replay the last hour over ~36s sorted
              by time, then poll every 60s and strike only genuinely new quake
              ids. Any failure falls back to a synthetic Ring of Fire so the
              piece always plays with zero network (amber badge).
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The HRTF mapping.</span> Each quake is
              one struck gong: pitch maps inversely to magnitude (a big quake is
              a low, massive boom; a small one a high tap), depth maps to timbre
              (shallow = brighter and sharper; deep = darker, longer, more sub),
              and magnitude also sets loudness and decay length. The strike runs
              through a PannerNode with{" "}
              <span className="font-mono text-base">panningModel = &quot;HRTF&quot;</span>:
              we convert its (lon, lat) to a point on the unit sphere and place
              it there around the listener, pushing deeper quakes further out
              (quieter). Each panner feeds the shared convolution void, so every
              strike decays into the same cavern over a very low just-intonation
              drone.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The visual.</span> A slowly
              auto-rotating dark point/wireframe Earth in a star-flecked void.
              Each quake spawns an expanding ring tangent to the globe surface at
              its true lat/lon plus a brief radial glow; ring radius and
              brightness scale with magnitude and fade as they grow — rings
              appear all over the planet, never as a center-screen bloom. All
              luminance changes are slow drifts, well under 3 Hz (no strobing).
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">References.</span> &ldquo;Echoes of
              the Land: An Interactive Installation Based on Physical Model of
              Earthquake&rdquo; (arXiv:2507.14947, 2025), turning seismic
              dynamics into real-time multisensory sound and light; the
              ambisonic / spatial &ldquo;make the Earth audible&rdquo;
              seismic-sonification tradition (spatialising seismic data to
              surround sound, high-frequency P waves gliding down into lower
              S/surface waves); and near-death-experience / void phenomenology —
              the dark, vast, presence-in-the-void pole — as the aesthetic
              target.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Next cycle.</span> Map the true P→S→
              surface-wave glide of each event as a short downward sweep; couple
              ring colour to depth; add a faint great-circle ripple propagating
              across the globe from each epicentre; let the listener orbit the
              camera with a drag; and add a magnitude-gated low sub-bass thump
              you feel more than hear for the rare large quakes.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
