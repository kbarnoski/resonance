"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { type BrushId, makeAudioState, resumeAudio, startAmbientBed, fireFoley, teardownAudio } from "./audio";
import { drawMark, getStampSize, type StampMark } from "./scene";

// ---- BRUSH DEFINITIONS -------------------------------------------------------

interface BrushDef {
  id: BrushId;
  label: string;
  icon: string;      // emoji glyph used as icon (no reading required)
  bgColor: string;   // swatch background
  description: string; // accessible label
}

const BRUSHES: BrushDef[] = [
  { id: "crunch",  label: "Crunch",  icon: "🌿", bgColor: "#f59e0b", description: "Crunchy leaves and gravel" },
  { id: "pop",     label: "Pop",     icon: "🫧", bgColor: "#a78bfa", description: "Soft poppy bubbles" },
  { id: "tap",     label: "Tap",     icon: "🪵", bgColor: "#34d399", description: "Dry woody knock" },
  { id: "scratch", label: "Scratch", icon: "⚡", bgColor: "#f472b6", description: "Rough scratch and scrape" },
  { id: "splash",  label: "Splash",  icon: "💧", bgColor: "#38bdf8", description: "Water drip and splash" },
];

// ---- MIN DISTANCE BETWEEN DRAG EVENTS (px) -----------------------------------
const DRAG_SPACING = 22;

// ---- AUTO-DEMO SCRIPT --------------------------------------------------------
interface DemoStep {
  brushIdx: number;
  x: number; // 0–1 fractional
  y: number; // 0–1 fractional
  type: "dab" | "drag";
  count?: number; // for drag, number of steps
}

const DEMO_STEPS: DemoStep[] = [
  { brushIdx: 0, x: 0.20, y: 0.38, type: "dab" },
  { brushIdx: 0, x: 0.25, y: 0.42, type: "dab" },
  { brushIdx: 0, x: 0.18, y: 0.45, type: "dab" },
  { brushIdx: 2, x: 0.55, y: 0.30, type: "dab" },
  { brushIdx: 2, x: 0.60, y: 0.26, type: "drag", count: 5 },
  { brushIdx: 1, x: 0.40, y: 0.60, type: "dab" },
  { brushIdx: 1, x: 0.45, y: 0.56, type: "dab" },
  { brushIdx: 3, x: 0.72, y: 0.55, type: "drag", count: 6 },
  { brushIdx: 4, x: 0.30, y: 0.72, type: "dab" },
  { brushIdx: 4, x: 0.35, y: 0.68, type: "dab" },
  { brushIdx: 4, x: 0.38, y: 0.75, type: "dab" },
];

// ---- COMPONENT ---------------------------------------------------------------

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioStateRef = useRef<ReturnType<typeof makeAudioState> | null>(null);
  const activeBrushRef = useRef<BrushId>("crunch");
  const lastDragPos = useRef<Map<number, { x: number; y: number }>>(new Map());
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasInteracted = useRef(false);
  const seedCounter = useRef(0);

  const [activeBrush, setActiveBrush] = useState<BrushId>("crunch");
  const [audioReady, setAudioReady] = useState(false);
  const [showTapPrompt, setShowTapPrompt] = useState(false);

  // ---- STAMP A MARK ON CANVAS ------------------------------------------------
  const stampMark = useCallback((x: number, y: number, pressure = 0.6) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const brushId = activeBrushRef.current;
    const mark: StampMark = {
      brushId,
      x,
      y,
      size: getStampSize(brushId, pressure),
      rotation: (Math.random() - 0.5) * Math.PI * 0.5,
      alpha: 0.75 + Math.random() * 0.25,
      seed: (seedCounter.current++ * 6271 + 1013) % 65521,
    };
    drawMark(ctx, mark);
  }, []);

  // ---- FIRE AUDIO + STAMP (unified event) ------------------------------------
  const fireEvent = useCallback((x: number, y: number, pressure = 0.6) => {
    stampMark(x, y, pressure);
    if (audioStateRef.current) {
      fireFoley(audioStateRef.current, activeBrushRef.current);
    }
  }, [stampMark]);

  // ---- AUDIO INIT ------------------------------------------------------------
  const initAudio = useCallback(async () => {
    if (audioStateRef.current) {
      await resumeAudio(audioStateRef.current);
      return;
    }
    const state = makeAudioState();
    audioStateRef.current = state;
    await resumeAudio(state);
    startAmbientBed(state);
    setAudioReady(true);
    setShowTapPrompt(false);
  }, []);

  // ---- AUTO-DEMO -------------------------------------------------------------
  const runAutoDemo = useCallback(() => {
    if (hasInteracted.current) return;

    let stepIdx = 0;

    const runStep = async () => {
      if (hasInteracted.current) return;
      if (stepIdx >= DEMO_STEPS.length) {
        stepIdx = 0; // loop demo
      }
      const step = DEMO_STEPS[stepIdx++];
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Switch brush
      const brushId = BRUSHES[step.brushIdx].id;
      activeBrushRef.current = brushId;
      setActiveBrush(brushId);

      // Init audio on first demo step
      if (!audioStateRef.current) {
        try {
          await initAudio();
        } catch {
          // autoplay blocked — show prompt
          setShowTapPrompt(true);
          return;
        }
      }

      const cx = step.x * canvas.width;
      const cy = step.y * canvas.height;

      if (step.type === "dab") {
        fireEvent(cx, cy, 0.7);
      } else if (step.type === "drag" && step.count) {
        for (let i = 0; i < step.count; i++) {
          setTimeout(() => {
            if (hasInteracted.current) return;
            const dx = cx + i * DRAG_SPACING * 1.2 * (0.5 + Math.random() * 0.5);
            const dy = cy + (Math.random() - 0.5) * DRAG_SPACING;
            fireEvent(dx, dy, 0.65);
          }, i * 70);
        }
      }
    };

    demoIntervalRef.current = setInterval(runStep, 520);
  }, [initAudio, fireEvent]);

  // ---- POINTER HANDLERS ------------------------------------------------------
  const handlePointerDown = useCallback(async (e: PointerEvent) => {
    e.preventDefault();

    if (!hasInteracted.current) {
      hasInteracted.current = true;
      // Stop demo
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      demoTimerRef.current = null;
      demoIntervalRef.current = null;
    }

    await initAudio();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 0.6;

    fireEvent(x, y, pressure);
    lastDragPos.current.set(e.pointerId, { x, y });

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, [initAudio, fireEvent]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    e.preventDefault();
    const last = lastDragPos.current.get(e.pointerId);
    if (!last) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = x - last.x;
    const dy = y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= DRAG_SPACING) {
      const pressure = e.pressure > 0 ? e.pressure : 0.6;
      fireEvent(x, y, pressure);
      lastDragPos.current.set(e.pointerId, { x, y });
    }
  }, [fireEvent]);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    lastDragPos.current.delete(e.pointerId);
  }, []);

  // ---- CLEAR CANVAS ----------------------------------------------------------
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // ---- RESIZE CANVAS ---------------------------------------------------------
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Save current painting
    const offscreen = document.createElement("canvas");
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const offCtx = offscreen.getContext("2d");
    offCtx?.drawImage(canvas, 0, 0);

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Restore painting
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(offscreen, 0, 0);
  }, []);

  // ---- MOUNT -----------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initial sizing
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Attach pointer events
    canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
    canvas.addEventListener("pointermove", handlePointerMove, { passive: false });
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);

    // Resize observer
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(canvas);

    // Auto-demo after 1.8s
    demoTimerRef.current = setTimeout(() => {
      if (!hasInteracted.current) runAutoDemo();
    }, 1800);

    // Show tap prompt if audio context likely blocked
    const tapPromptTimer = setTimeout(() => {
      if (!audioStateRef.current) setShowTapPrompt(true);
    }, 3000);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      ro.disconnect();
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      clearTimeout(tapPromptTimer);
      if (audioStateRef.current) {
        teardownAudio(audioStateRef.current);
        audioStateRef.current = null;
      }
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp, resizeCanvas, runAutoDemo]);

  // ---- BRUSH CHANGE ----------------------------------------------------------
  const selectBrush = useCallback((id: BrushId) => {
    activeBrushRef.current = id;
    setActiveBrush(id);
  }, []);

  // ---- TAP-TO-START (iOS safe) -----------------------------------------------
  const handleTapToStart = useCallback(async () => {
    hasInteracted.current = true;
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
    setShowTapPrompt(false);
    await initAudio();
  }, [initAudio]);

  const activeBrushDef = BRUSHES.find(b => b.id === activeBrush)!;

  return (
    <div className="relative w-full h-screen bg-zinc-950 flex flex-col select-none overflow-hidden touch-none">

      {/* ---- HEADER ---- */}
      <div className="flex-none flex items-center justify-between px-4 pt-3 pb-1 z-10">
        <div>
          <h1 className="text-foreground text-2xl font-bold leading-tight tracking-tight">
            Texture Paint
          </h1>
          <p className="text-muted-foreground text-base leading-snug">
            Tap or drag to paint &amp; hear!
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {audioReady && (
            <span className="text-muted-foreground/70 text-sm">
              🔊
            </span>
          )}
          <button
            onClick={clearCanvas}
            aria-label="Clear canvas"
            className="text-muted-foreground hover:text-foreground text-base font-medium min-h-[44px] px-4 py-2.5 rounded-xl bg-muted hover:bg-accent active:bg-muted transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* ---- CANVAS ---- */}
      <div className="flex-1 relative min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          style={{ touchAction: "none" }}
          aria-label="Painting canvas — tap or drag to paint"
        />

        {/* TAP TO START overlay */}
        {showTapPrompt && (
          <button
            onClick={handleTapToStart}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm z-20"
            aria-label="Tap to start audio"
          >
            <span className="text-5xl">👆</span>
            <span className="text-foreground text-2xl font-bold">Tap to Start!</span>
            <span className="text-muted-foreground text-base">Touch anywhere to wake up the sounds</span>
          </button>
        )}
      </div>

      {/* ---- BRUSH PICKER ---- */}
      <div
        className="flex-none bg-zinc-900/90 backdrop-blur border-t border-border px-3 py-3 z-10"
        role="toolbar"
        aria-label="Choose a texture brush"
      >
        <div className="flex gap-2 justify-around max-w-2xl mx-auto">
          {BRUSHES.map((brush) => {
            const isActive = activeBrush === brush.id;
            return (
              <button
                key={brush.id}
                onClick={() => selectBrush(brush.id)}
                aria-label={brush.description}
                aria-pressed={isActive}
                style={{
                  background: isActive ? brush.bgColor + "cc" : brush.bgColor + "33",
                  borderColor: isActive ? brush.bgColor : "transparent",
                  boxShadow: isActive ? `0 0 16px 2px ${brush.bgColor}66` : "none",
                }}
                className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 min-h-[64px] rounded-2xl border-2 transition-all duration-150 active:scale-95"
              >
                <span className="text-2xl leading-none" aria-hidden="true">
                  {brush.icon}
                </span>
                <span
                  className="text-foreground text-xs font-semibold leading-none tracking-wide"
                  aria-hidden="true"
                >
                  {brush.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active brush label (big enough for kids) */}
        <p className="text-center text-foreground text-base mt-2 leading-none">
          {activeBrushDef.description}
        </p>
      </div>

      {/* ---- DESIGN NOTES LINK ---- */}
      <div className="flex-none px-4 pb-2 text-right z-10">
        <a
          href="#readme"
          className="text-muted-foreground hover:text-foreground text-sm underline transition-colors"
          aria-label="Read the design notes"
          onClick={(e) => {
            e.preventDefault();
            alert(
              "Texture Paint — design notes\n\n" +
              "Each brush = an impulse+resonator foley event:\n" +
              "Crunch: noise crackle cluster through inharmonic bandpass.\n" +
              "Pop: band-filtered noise blip, bouba shape.\n" +
              "Tap: click through short damped resonance, dry knock.\n" +
              "Scratch: highpass friction noise sweep, kiki shape.\n" +
              "Splash: noise burst + filtered drip tail.\n\n" +
              "Zero pitched notes — only noise & timbre.\n" +
              "Bouba/kiki cross-modal: round shapes ↔ soft sounds; spiky ↔ sharp.\n\n" +
              "Refs: Köhler (1929) bouba/kiki; Farnell Designing Sound (2010); Cook PhISM."
            );
          }}
        >
          Design notes
        </a>
      </div>

    </div>
  );
}
