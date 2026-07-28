"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { AudioCleanup } from "../_shared/audio-cleanup";
import { AuraAudio } from "./audio";
import { createAuraGL, type AuraGL } from "./aura-gl";
import {
  CameraSilhouette,
  computeDescriptors,
  EMPTY_DESCRIPTORS,
  makeSynthState,
  MASK_H,
  MASK_W,
  renderSynthMask,
  type Descriptors,
} from "./silhouette";

// ════════════════════════════════════════════════════════════════════════════
// 3448 — aura
// Your silhouette becomes a glowing resonant aura, and the SHAPE of you — not
// your motion, not your pitch — makes the sound. A background-subtraction
// silhouette yields shape descriptors (area, boundary complexity, reach) that
// steer a soft evolving drone and a raw-WebGL2 golden-spiral bloom. No score,
// no win, no fail. Privacy-forward: only the shape is ever kept. See README.md.
// ════════════════════════════════════════════════════════════════════════════

type Phase = "idle" | "running";
type CameraStatus = "synthetic" | "live" | "denied";

const NOTES: { h: string; p: string }[] = [
  {
    h: "The one question",
    p: "What if your silhouette became a glowing resonant aura — and the SHAPE of you, not your motion or your pitch, made the sound? Stand tall and compact and the tone darkens and settles; open and reach and it brightens and lifts. There is nothing to score, nothing to win, nothing to fail. It is a mirror that hums back the shape you make.",
  },
  {
    h: "Shape into sound (cross-modal)",
    p: "A background-subtraction silhouette is reduced to a few shape descriptors, each mapped to a different sense of the drone. Area — how much of the frame you fill — sets the overall level and how many harmonic voices sing, floored so it is never fully silent. Boundary complexity (perimeter² / area — ragged and spread vs compact and still) opens or closes a low-pass filter. Reaching up glides the fundamental, continuously, never snapped to a scale or chord: the pitch simply bends.",
  },
  {
    h: "The aura",
    p: "The silhouette is uploaded as a small R8 mask texture to a raw WebGL2 fragment shader (#version 300 es) — no three.js — which blooms a golden-spiral halo around the shape on the Resonance violet ramp, with a slow luminance drift under 0.11 Hz (no strobe). Under prefers-reduced-motion the drift and the figure's breathing both still.",
  },
  {
    h: "Privacy-forward",
    p: "The camera is sampled only into a hidden, downscaled buffer to derive a binary shape. The raw video is never shown, never uploaded, never stored — the mask is the only thing that leaves the pixel buffer. With no camera the piece runs anyway on a seeded synthetic figure, so a reviewer with no webcam still sees the aura breathe and hears the drone evolve.",
  },
  {
    h: "Named references",
    p: "Myron Krueger's Videoplace (1974), the silhouette as instrument. Daniel Rozin's mirror works — you as your own reflection. And \"Fluid Body: An Adaptive Embodied Sonification System\" (CHI / Springer 2026): the sound steers you as much as you steer it.",
  },
];

export default function AuraPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("synthetic");
  const [glUnavailable, setGlUnavailable] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [muted, setMuted] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readout, setReadout] = useState<Descriptors>(EMPTY_DESCRIPTORS);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<AuraGL | null>(null);
  const audioRef = useRef<AuraAudio | null>(null);
  const cameraRef = useRef<CameraSilhouette | null>(null);

  const maskRef = useRef<Uint8Array>(new Uint8Array(MASK_W * MASK_H));
  const synthStateRef = useRef(makeSynthState());
  const descriptorsRef = useRef<Descriptors>(EMPTY_DESCRIPTORS);

  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const reduceMotionRef = useRef(false);
  const sourceRef = useRef<CameraStatus>("synthetic");
  const lastReadoutRef = useRef(0);

  // ── prefers-reduced-motion ──────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      reduceMotionRef.current = mq.matches;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // ── init WebGL2 + run the visual loop from mount (synthetic until Start) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: AuraGL | null = null;
    try {
      gl = createAuraGL(canvas);
    } catch {
      gl = null;
    }
    if (!gl) {
      setGlUnavailable(true);
      return;
    }
    glRef.current = gl;

    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) gl!.resize(box.width, box.height);
    });
    ro.observe(canvas);

    const step = () => {
      const now = performance.now();
      const reduce = reduceMotionRef.current;

      // Choose the mask source: live camera when granted, else seeded synthetic.
      let mask: Uint8Array;
      const cam = cameraRef.current;
      const live = sourceRef.current === "live" && cam ? cam.sample() : null;
      if (live) {
        mask = live;
      } else {
        renderSynthMask(maskRef.current, MASK_W, MASK_H, now, synthStateRef.current, reduce);
        mask = maskRef.current;
      }

      const d = computeDescriptors(mask, MASK_W, MASK_H);
      descriptorsRef.current = d;

      if (runningRef.current) audioRef.current?.update(d, reduce);

      gl!.render({
        mask,
        time: now * 0.001,
        area: d.area,
        complexity: d.complexity,
        reach: d.reach,
        cx: d.cx,
        cy: d.cy,
        reduceMotion: reduce,
      });

      // Throttled readout for the on-screen descriptor badges.
      if (now - lastReadoutRef.current > 180) {
        lastReadoutRef.current = now;
        setReadout(d);
      }

      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ro.disconnect();
      gl?.dispose();
      glRef.current = null;
    };
  }, []);

  // ── teardown of audio + camera on unmount ────────────────────────────────
  useEffect(() => {
    return () => {
      void audioRef.current?.dispose();
      audioRef.current = null;
      cameraRef.current?.dispose();
      cameraRef.current = null;
    };
  }, []);

  const handleStart = useCallback(async () => {
    const reduce = reduceMotionRef.current;

    // Audio must be created inside this gesture.
    const audio = new AuraAudio();
    if (!audio.available) {
      setAudioUnavailable(true);
    } else {
      audioRef.current = audio;
      audio.start(reduce);
      runningRef.current = true;
    }
    setPhase("running");

    // Camera is preferred but optional — request it inside the same gesture.
    try {
      const cam = new CameraSilhouette();
      await cam.start();
      cameraRef.current = cam;
      sourceRef.current = "live";
      setCameraStatus("live");
    } catch {
      cameraRef.current?.dispose();
      cameraRef.current = null;
      sourceRef.current = "synthetic";
      setCameraStatus("denied");
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const sourceLabel =
    cameraStatus === "live"
      ? "your silhouette"
      : cameraStatus === "denied"
        ? "synthetic figure"
        : "synthetic figure (preview)";

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-background px-4 py-10 text-foreground">
      <AudioCleanup />

      <button
        type="button"
        onClick={() => setNotesOpen(true)}
        className="fixed right-3 top-3 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      <header className="mb-6 max-w-xl text-center">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          The shape of you, resonant
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">aura</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Your silhouette becomes a glowing aura — and the shape of you, not your
          motion or your pitch, makes the sound. Reach and it brightens; gather in
          and it settles. Nothing to win, nothing to lose.
        </p>
      </header>

      <div className="relative aspect-[4/3] w-full max-w-[min(88vw,640px)] overflow-hidden rounded-lg border border-border bg-black">
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          aria-label="A golden-spiral glow aura blooming around a silhouette"
        />

        {glUnavailable && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 px-6 text-center">
            <p className="text-base text-destructive">WebGL2 isn&apos;t available here.</p>
            <p className="text-sm text-muted-foreground">
              The aura is drawn with a raw WebGL2 shader. Try a current desktop browser.
            </p>
          </div>
        )}

        {phase === "idle" && !glUnavailable && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/60 px-6 text-center backdrop-blur-sm">
            <p className="max-w-xs text-base text-muted-foreground">
              Sound needs your go-ahead. Begin, and the aura starts to hum. If you
              allow the camera, the shape becomes yours — otherwise a synthetic
              figure stands in.
            </p>
            <button
              type="button"
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
          </div>
        )}
      </div>

      {phase === "running" && (
        <div className="mt-6 flex w-full max-w-[min(88vw,640px)] flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge label="source" value={sourceLabel} />
            <Meter label="area" value={Math.min(1, readout.area * 3.4)} />
            <Meter label="bright" value={readout.complexity} />
            <Meter label="reach" value={readout.reach} />
          </div>

          {cameraStatus === "denied" && (
            <p className="max-w-sm text-center text-sm text-destructive">
              Camera unavailable — showing a synthetic figure. The full aura and
              drone still play; grant the camera to make the shape your own.
            </p>
          )}
          {audioUnavailable && (
            <p className="max-w-sm text-center text-sm text-destructive">
              Web Audio isn&apos;t available in this browser, so the aura plays
              silently. Try a current desktop browser for sound.
            </p>
          )}

          {!audioUnavailable && (
            <button
              type="button"
              onClick={toggleMute}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {muted ? "Unmute the drone" : "Mute the drone"}
            </button>
          )}
        </div>
      )}

      {notesOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Design notes</h2>
            <div className="mt-4 space-y-4">
              {NOTES.map((n) => (
                <div key={n.h}>
                  <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {n.h}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{n.p}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["3448-aura", "3424-attending", "3416-baton"]} />
    </main>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value}</span>
    </span>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-accent">
        <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
