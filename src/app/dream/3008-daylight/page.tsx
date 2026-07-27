"use client";

// 3008 · Daylight
// "What if the light in your room were the instrument?"
//
// The webcam reads THE ENVIRONMENT — overall brightness, warmth, and motion,
// NOT your body — and turns it into one slow, living, continuous-pitch chord
// and a matching aurora. Cup the lens and it hushes to near-silence; lean
// toward a warm lamp vs a cool window and the chord's colour shifts; wave a
// hand and it shimmers.
//
// This is Scriabin's colour-organ (Prometheus, 1910) and Castel's clavecin
// oculaire (1730s) INVERTED — colour drives sound instead of sound driving
// colour. Whole camera frame → three scalars → one breathing chord + light.
//
// Everything is client-side. No pixel data leaves the browser; no network.

import { useCallback, useEffect, useRef, useState } from "react";
import { LightAudio } from "./audio";
import { AuroraRenderer } from "./viz";
import {
  LightSensor,
  createAutopilot,
  type Light,
} from "./vision";

type Mode = "idle" | "camera" | "autopilot";

interface Readout extends Light {
  mode: Mode;
}

export default function DaylightPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const audioRef = useRef<LightAudio | null>(null);
  const rendererRef = useRef<AuroraRenderer | null>(null);
  const sensorRef = useRef<LightSensor | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autopilotRef = useRef<(t: number) => Light>(createAutopilot(0x3008));

  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const modeRef = useRef<Mode>("autopilot");
  const audioOnRef = useRef<boolean>(false);

  // Smoothed scalars — one-pole lowpass so the chord breathes, never jitters.
  const smoothRef = useRef<Light>({ L: 0.4, H: 0.5, M: 0 });
  const readoutRef = useRef<Readout>({ L: 0.4, H: 0.5, M: 0, mode: "autopilot" });

  const [running, setRunning] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<"off" | "loading" | "on">(
    "off",
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readout, setReadout] = useState<Readout>(readoutRef.current);

  // --- The frame loop (plain function driven by rAF, not a hook) ---
  const runFrame = useCallback((now: number) => {
    rafRef.current = requestAnimationFrame(runFrame);
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (startTimeRef.current === 0) startTimeRef.current = now;
    const time = (now - startTimeRef.current) / 1000;

    // Gather this tick's raw light from whichever source is live.
    let raw: Light | null = null;
    if (modeRef.current === "camera" && sensorRef.current && videoRef.current) {
      raw = sensorRef.current.read(videoRef.current);
    }
    if (!raw) {
      // No camera (idle before Start, denied, or a stale frame) → autopilot.
      raw = autopilotRef.current(time);
    }

    // One-pole smoothing: L heavy (slow breath), H medium, M light (gestures).
    const s = smoothRef.current;
    const prevM = s.M;
    s.L += (raw.L - s.L) * 0.022;
    s.H += (raw.H - s.H) * 0.03;
    s.M += (raw.M - s.M) * 0.12;

    // Motion spike → soft accent (light catching a wave).
    const audio = audioRef.current;
    if (audio) {
      audio.setLight(s.L, s.H, s.M);
      if (s.M - prevM > 0.06) audio.accent(s.M);
    }

    renderer.render(s.L, s.H, s.M, time);

    readoutRef.current = { L: s.L, H: s.H, M: s.M, mode: modeRef.current };
  }, []);

  // --- Mount: build renderer + sensor, start the visual loop (silent) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        rendererRef.current = new AuroraRenderer(canvas);
      } catch {
        setNotice("Canvas2D is unavailable in this browser, so the visual can't run.");
      }
    }
    try {
      sensorRef.current = new LightSensor();
    } catch {
      sensorRef.current = null;
    }

    modeRef.current = "autopilot";
    startTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(runFrame);

    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);

    const hud = window.setInterval(() => {
      setReadout({ ...readoutRef.current });
    }, 150);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.clearInterval(hud);
      window.removeEventListener("resize", onResize);
      audioRef.current?.stop();
      audioRef.current = null;
      audioOnRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      sensorRef.current = null;
    };
    // runFrame is stable (useCallback, empty deps); intentional one-shot mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Start: user gesture opens both AudioContext and the camera ---
  const runStart = useCallback(async () => {
    if (audioOnRef.current) return;
    setNotice(null);

    // 1) Audio first — this is the guaranteed part of the gesture.
    try {
      const audio = new LightAudio();
      await audio.start();
      audioRef.current = audio;
      audioOnRef.current = true;
      setRunning(true);
    } catch {
      setNotice("Web Audio could not start in this browser.");
      return;
    }

    // 2) Camera — optional. On any failure we keep the autopilot alive.
    setCameraStatus("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      sensorRef.current?.reset();
      modeRef.current = "camera";
      setCameraStatus("on");
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      modeRef.current = "autopilot";
      setCameraStatus("off");
      const denied =
        err instanceof DOMException && err.name === "NotAllowedError";
      setNotice(
        denied
          ? "Camera permission denied — showing a simulated room at dusk. Sound still plays."
          : "No camera — showing a simulated room at dusk. Sound still plays.",
      );
    }
  }, []);

  const cameraLive = cameraStatus === "on";

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      {/* Art canvas — the aurora. Raw hsla colour lives only in viz.ts. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Hidden capture feed — read locally, never displayed or transmitted. */}
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      {/* Chrome overlay — semantic tokens only */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5">
        {/* Top row */}
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              3008 · Daylight
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              The light in your room is the instrument
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              The camera reads your room&apos;s light — not you. Cup the lens
              and the chord hushes to near-silence; face a warm lamp or a cool
              window and its colour shifts; wave a hand and it shimmers.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="pointer-events-auto min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* Bottom row — controls + readouts */}
        <div className="flex flex-col gap-4">
          {notice && (
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              {notice}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <div className="pointer-events-auto flex flex-wrap items-center gap-3">
              {!running ? (
                <button
                  type="button"
                  onClick={runStart}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Start — light on, sound up
                </button>
              ) : (
                <span className="min-h-[44px] inline-flex items-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm">
                  {cameraStatus === "loading"
                    ? "Opening camera…"
                    : cameraLive
                      ? "Reading your room — try dimming or waving"
                      : "Playing a simulated room at dusk"}
                </span>
              )}
            </div>

            {/* Live readouts */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <span>src: {readout.mode === "camera" ? "camera" : "sim dusk"}</span>
              <span>lum: {readout.L.toFixed(2)}</span>
              <span>warm: {readout.H.toFixed(2)}</span>
              <span>move: {readout.M.toFixed(2)}</span>
            </div>
          </div>

          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
            All processing is on-device · no pixels leave the browser · no network
          </p>
        </div>
      </div>

      {/* Design-notes modal */}
      {notesOpen && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              Daylight
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The whole camera frame is downscaled to 64×48 and reduced to three
              numbers every frame: mean brightness, warm↔cool balance, and
              motion. Brightness sets the chord&apos;s loudness, how many
              partials you can hear, and its brightness; warmth glides the base
              pitch and interval colour; motion adds shimmer. Every change
              glides — it is a drone that breathes, not a synth pad.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              This inverts the colour-organ. Scriabin scored a &quot;tastiera
              per luce&quot; into <em>Prometheus: Poem of Fire</em> (1910) and
              Louis-Bertrand Castel built a <em>clavecin oculaire</em> in the
              1730s — both turned sound into light. Daylight runs the arrow the
              other way: colour drives sound.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              No camera, denied permission, or headless? A seeded autopilot
              drifts the same three numbers like a room easing into dusk with
              passing clouds, so the piece is always alive. Nothing you point it
              at ever leaves your device.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
