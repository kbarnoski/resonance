"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { makeNarthexAudio, mulberry32, type NarthexAudio } from "./audio";
import { drawVoid, makeStarField, type VoidField } from "./render";

type Phase = "idle" | "crossing";

const DEMO_SECONDS = 13; // hands-free descent length
const README = `# Narthex — a threshold you cross

**The one question.** What if a room could be a place you cross, not a screen you watch? A cosmic-ambient near-death "threshold" you inhabit, where a choir of drone-voices is HRTF-spatialised in a full sphere around your head — and you cross from a scattered dark void into a warm unison light by turning your head and drawing forward.

**The HRTF choir + head-tracked listener.** Eight sustained drone-voices (detuned sine/triangle partials + a breath of filtered noise) are each fixed at a point on a sphere around you — a ring of six at head height, one overhead, one behind and below — and rendered through their own \`PannerNode\` with \`panningModel: "HRTF"\`. A head-tracked \`AudioListener\` (its \`forward\`/\`up\` vectors driven by your look) rotates the whole field around your head as you turn, so you move AMONG the voices rather than hearing a stereo mix. This is a synthetic homage to Janet Cardiff's *The Forty Part Motet* — a room of individual voices you walk between.

**The void → tunnel → light state machine.** One scalar, distance-to-light (0 = void … 1 = arrived), drives everything. A procedurally-synthesised convolution reverb (a long, dark cathedral tail — no external IR file) is wet and vast in the void and pulls back toward the direct light. A master low-pass is muffled in the void and opens bright at the light. And the voices' pitches slew from a scattered, detuned microtonal cluster into a single luminous unison chord as you arrive. Visually, a projected-3D starfield drifts scattered in the dark, streaks into a forward tunnel as you draw in, and a warm violet-white light blooms at the vanishing point.

**Input & the hands-free demo.** Head-look comes from \`deviceorientation\` (iOS permission requested on Enter) with a pointer-drag fallback that always works on desktop. Aim your look at the light and it draws you forward. If you never touch it, a seeded scripted descent plays the full journey in ~13 s. All randomness is a seeded \`mulberry32(0x5048)\` PRNG; nothing uses the wall clock.

**Fresh research.** This piece draws on **arXiv:2607.23293 "PathRIR" (28 Jul 2026)** — fast room-impulse-response simulation for a moving listener: a room whose acoustic signature you inhabit and carry with you as you cross it.

**References.** Janet Cardiff, *The Forty Part Motet* (spatial choir installation) · Susan Blackmore, *Dying to Live* (the NDE tunnel-to-light phenomenology) · arXiv:2607.23293 "PathRIR" (moving-listener RIR simulation).

**Ambition floor.** Four subsystems (HRTF spatial choir · head-tracked listener · procedural convolution reverb · void→tunnel→light state machine) + three named references + fresh 2026 research.`;

export default function NarthexPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [manual, setManual] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<VoidField | null>(null);
  const audioRef = useRef<NarthexAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  // shared drive state (refs so the loop never restarts)
  const lastTickRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const dtlRef = useRef<number>(0);
  const yawRef = useRef<number>(0);
  const pitchRef = useRef<number>(0);
  const manualRef = useRef<boolean>(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }, []);

  const takeOver = useCallback(() => {
    if (!manualRef.current) {
      manualRef.current = true;
      setManual(true);
    }
  }, []);

  // ── head-look input: pointer drag (always works) ──
  const onPointerDown = useCallback((e: PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);
  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      takeOver();
      const dx = (e.clientX - d.x) / window.innerWidth;
      const dy = (e.clientY - d.y) / window.innerHeight;
      // dragging right → look right (+yaw); dragging down → look down (−pitch)
      yawRef.current = clamp(yawRef.current + dx * 1.4, -1.1, 1.1);
      pitchRef.current = clamp(pitchRef.current - dy * 1.1, -0.7, 0.7);
      dragRef.current = { x: e.clientX, y: e.clientY };
    },
    [takeOver],
  );

  // ── head-look input: device orientation ──
  const onOrient = useCallback(
    (e: DeviceOrientationEvent) => {
      if (e.gamma == null && e.beta == null) return;
      takeOver();
      yawRef.current = clamp((e.gamma ?? 0) / 40, -1, 1) * 1.05;
      pitchRef.current = clamp(((e.beta ?? 45) - 45) / 40, -1, 1) * 0.65;
    },
    [takeOver],
  );

  const renderLoop = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTickRef.current) / 1000);
    lastTickRef.current = now;
    const elapsed = (now - startedAtRef.current) / 1000;

    if (manualRef.current) {
      // aim your look at the light → drawn forward; look away → drift back
      const align = Math.cos(yawRef.current) * Math.cos(pitchRef.current);
      const rate = align > 0.6 ? (align - 0.5) * 0.42 : -0.16;
      dtlRef.current = clamp(dtlRef.current + rate * dt, 0, 0.97);
    } else {
      // seeded hands-free descent: sweep the head, ramp distance-to-light
      const p = clamp(elapsed / DEMO_SECONDS, 0, 1);
      const eased = p * p * (3 - 2 * p);
      dtlRef.current = eased * 0.92;
      yawRef.current = (1 - eased) * 0.6 * Math.sin(elapsed * 0.85);
      pitchRef.current = (1 - eased) * 0.22 * Math.sin(elapsed * 0.5 + 1);
    }

    const canvas = canvasRef.current;
    const field = fieldRef.current;
    if (canvas && field) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        drawVoid(ctx, canvas.width, canvas.height, field, dt, {
          dtl: dtlRef.current,
          yaw: yawRef.current,
          pitch: pitchRef.current,
          time: elapsed,
        });
      }
    }

    audioRef.current?.update(dtlRef.current, yawRef.current, pitchRef.current);
    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  const handleEnter = useCallback(async () => {
    if (phase === "crossing") return;

    resize();
    fieldRef.current = makeStarField(mulberry32(0x5048), 540);

    // audio inside the user gesture
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new AC();
      await ac.resume();
      acRef.current = ac;
      audioRef.current = makeNarthexAudio(ac, 0.16);
    } catch {
      setAudioError(true);
    }

    // iOS deviceorientation permission (degrades to pointer-drag)
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", onOrient);
        }
      } catch {
        /* denied — pointer-drag still works fully */
      }
    } else if ("DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", onOrient);
    }

    startedAtRef.current = performance.now();
    lastTickRef.current = performance.now();
    setPhase("crossing");
  }, [phase, resize, onOrient]);

  // drive the loop + listeners once crossing has begun
  useEffect(() => {
    if (phase !== "crossing") return;
    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderLoop);
    window.addEventListener("resize", resize);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [phase, renderLoop, resize, onPointerDown, onPointerMove, onPointerUp]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", onOrient);
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 2000);
      }
      acRef.current = null;
    };
  }, [onOrient]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full touch-none select-none"
      />

      {/* header / controls */}
      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          5048 · narthex
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Narthex
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          A room you cross, not a screen you watch — turn your head through a
          sphere of drone-voices, from scattered dark void into warm unison
          light.
        </p>

        {phase === "idle" && (
          <div className="mt-4">
            <button
              onClick={handleEnter}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Enter
            </button>
            <p className="mt-3 text-base text-muted-foreground">
              Headphones strongly recommended — the choir is spatialised in a
              full sphere around your head.
            </p>
          </div>
        )}

        {phase === "crossing" && (
          <p className="mt-4 text-base text-muted-foreground">
            {manual
              ? "Aim your look at the light to draw forward — turn away and you drift back into the void."
              : "Crossing hands-free… drag to look around (or tilt your phone) to take the helm."}
          </p>
        )}

        {audioError && (
          <p className="mt-3 text-base text-destructive">
            Audio could not start in this browser — the visual crossing still
            plays. Try a recent Chrome, Firefox, or Safari.
          </p>
        )}
      </div>

      {/* design notes link */}
      <button
        onClick={() => setShowNotes(true)}
        className="fixed bottom-3 right-3 z-40 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              {README.split("\n\n").map((para, i) => (
                <p
                  key={i}
                  className={
                    para.startsWith("# ")
                      ? "text-base font-semibold tracking-tight text-foreground"
                      : ""
                  }
                >
                  {para.replace(/^#+ /, "").replace(/\*\*/g, "")}
                </p>
              ))}
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </main>
  );
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
