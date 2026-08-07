"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { HuygensField, drawField, type TiltInput } from "./huygens";
import { HuygensAudio } from "./audio";

type Phase = "idle" | "running" | "error";

type OrientCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const REGIME_LABEL: Record<string, string> = {
  plane: "plane wave · source far behind the array",
  converging: "converging · envelope collapsing inward",
  focus: "focus · wavelets meeting in phase",
};

export default function HuygensPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<HuygensField | null>(null);
  const audioRef = useRef<HuygensAudio | null>(null);
  const rafRef = useRef<number>(0);
  const t0Ref = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const tiltRef = useRef<{ active: boolean; beta: number; gamma: number }>({
    active: false,
    beta: 45,
    gamma: 0,
  });
  const orientHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(
    null,
  );

  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [audioNote, setAudioNote] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"tilt" | "drift">("drift");
  const [regime, setRegime] = useState<string>("plane");

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    if (!canvas || !field) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    field.resize(W, H);
  }, []);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (orientHandlerRef.current) {
      window.removeEventListener(
        "deviceorientation",
        orientHandlerRef.current as EventListener,
      );
      orientHandlerRef.current = null;
    }
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.stop();
      window.setTimeout(() => audio.close(), 600);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const begin = useCallback(async () => {
    if (phase === "running") return;

    const canvas = canvasRef.current;
    if (!canvas) {
      setPhase("error");
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setPhase("error");
      return;
    }

    // reduced motion
    reducedRef.current =
      typeof window !== "undefined" && !!window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    const field = new HuygensField();
    fieldRef.current = field;
    sizeCanvas();

    // ── Tilt input (iOS gate) — fall back to seeded drift ──
    const OrientCtorRef =
      typeof window !== "undefined"
        ? (window.DeviceOrientationEvent as OrientCtor | undefined)
        : undefined;
    let tiltGranted = false;
    if (OrientCtorRef) {
      if (typeof OrientCtorRef.requestPermission === "function") {
        try {
          const p = await OrientCtorRef.requestPermission();
          tiltGranted = p === "granted";
        } catch {
          tiltGranted = false;
        }
      } else {
        tiltGranted = true; // non-iOS: no gate needed
      }
    }
    if (tiltGranted) {
      const handler = (e: DeviceOrientationEvent) => {
        if (e.beta == null && e.gamma == null) return;
        tiltRef.current.active = true;
        tiltRef.current.beta = e.beta ?? tiltRef.current.beta;
        tiltRef.current.gamma = e.gamma ?? tiltRef.current.gamma;
        setInputMode("tilt");
      };
      orientHandlerRef.current = handler;
      window.addEventListener("deviceorientation", handler as EventListener);
    }

    // ── Audio (optional) ──
    try {
      const audio = new HuygensAudio();
      await audio.start();
      audioRef.current = audio;
    } catch {
      audioRef.current = null;
      setAudioNote("Audio unavailable — showing the construction silently.");
    }

    setPhase("running");
    t0Ref.current = 0;
    let lastRegime = "";

    const loop = (ts: number) => {
      if (t0Ref.current === 0) t0Ref.current = ts;
      const tSec = (ts - t0Ref.current) / 1000;

      const tilt = tiltRef.current;
      const input: TiltInput | null = tilt.active
        ? { beta: tilt.beta, gamma: tilt.gamma }
        : null;

      const model = field.step(tSec, input, reducedRef.current);
      drawField(ctx, model);

      audioRef.current?.update({
        azimuth: model.azimuth,
        present: model.present,
        focus: model.focus,
        launched: model.launched,
      });

      if (model.regime !== lastRegime) {
        lastRegime = model.regime;
        setRegime(model.regime);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [phase, sizeCanvas]);

  // keep the canvas crisp on resize while running
  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase, sizeCanvas]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Running chrome — title + live regime readout */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between p-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Huygens
            </h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {REGIME_LABEL[regime] ?? regime}
            </p>
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {inputMode === "tilt" ? "tilt to steer" : "auto drift"}
            </span>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
        </div>
      )}

      {audioNote && phase === "running" && (
        <p className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 text-center text-sm text-destructive">
          {audioNote}
        </p>
      )}

      {/* Idle splash */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-border bg-background/80 p-8 backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Wave field synthesis
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Huygens
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              A wall of point sources, each throwing a circular wavelet — and
              the sound&apos;s wavefront emerging as the tangent envelope of them
              all. Steer it from a flat plane wave into a converging bloom.
            </p>
            {phase === "error" && (
              <p className="mt-3 text-sm text-destructive">
                Canvas 2D is unavailable in this browser.
              </p>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={begin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Begin
              </button>
              <button
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Tilt your phone to move the virtual source; with no motion sensor
              it drifts on its own through every regime.
            </p>
          </div>
        </div>
      )}

      {/* Design-notes overlay */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-background/70 p-6 backdrop-blur-sm">
          <div className="max-w-lg rounded-lg border border-border bg-background p-6">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              The construction
            </h2>
            <div className="mt-4 space-y-3 text-base text-muted-foreground">
              <p>
                Huygens&apos; principle: every point on a wavefront is itself a
                source of a secondary circular wavelet, and the wavefront an
                instant later is the common tangent{" "}
                <span className="text-foreground">envelope</span> of all of them.
              </p>
              <p>
                Forty emitters line the top edge. A steerable virtual source sets
                each emitter&apos;s emission delay by its distance. When the
                source sits far behind the array all the delays line up and the
                envelope is a near-flat plane wave; pull it into the room with
                time-reversed timing and the envelope becomes a converging arc
                that collapses onto a bright{" "}
                <span className="text-primary">focus</span>.
              </p>
              <p>
                The thin arcs are the individual wavelets; the bright violet
                curve is the analytic envelope, laid over them so you can watch
                it kiss each wavelet. The tone is placed binaurally from the
                source geometry and swells as it focuses onto the listener.
              </p>
              <p className="text-sm">
                Honest limits: the envelope is drawn analytically from the source
                geometry rather than solved numerically, and this is a 2D
                didactic evocation — not a full 2.5D WFS field solve.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["7784-huygens"]} />
    </main>
  );
}
