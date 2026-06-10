"use client";

/**
 * 474-kids-scan-bloom
 *
 * Scanned Synthesis flower for 4-year-olds.
 * Squeeze the glowing bloom — each petal's wobble rings the outline
 * and you HEAR the exact shape you see.
 *
 * Technique: Max V. Mathews, Bill Verplank, Rob Shaw —
 *   "Scanned Synthesis", Proceedings of the ICMC 2000, Berlin.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { bootBloomAudio, type BloomAudioEngine } from "./bloom-audio";
import { makeBloomGL, drawBloom, resizeGL, disposeGL, type BloomGLState } from "./bloom-renderer";

// ── Pitch table (C-major / Lydian pentatonic, C3–C5, consonant) ──────────────
const PETAL_HZ: number[] = [
  130.81,  // C3
  196.00,  // G3
  246.94,  // B3
  261.63,  // C4
  329.63,  // E4
  392.00,  // G4
];

// Corresponding warm petal colours [r,g,b] in 0..1
const PETAL_COLORS: Array<[number, number, number]> = [
  [0.75, 0.30, 0.95],  // violet  – C3
  [0.40, 0.55, 1.00],  // blue    – G3
  [0.30, 0.85, 0.80],  // cyan    – B3
  [0.50, 0.95, 0.45],  // green   – C4
  [1.00, 0.85, 0.25],  // yellow  – E4
  [1.00, 0.45, 0.35],  // rose    – G4
];

const N_PETALS = PETAL_HZ.length; // 6

// ── Auto-demo melody (petal indices + timing) ────────────────────────────────
const AUTO_DEMO_SEQ: Array<{ petIdx: number; delay: number }> = [
  { petIdx: 3, delay: 0    },  // C4
  { petIdx: 4, delay: 600  },  // E4
  { petIdx: 5, delay: 1200 },  // G4
  { petIdx: 2, delay: 2000 },  // B3
  { petIdx: 1, delay: 2700 },  // G3
  { petIdx: 0, delay: 3400 },  // C3
  { petIdx: 3, delay: 4400 },  // C4 again
];

type Phase = "idle" | "playing";

export default function KidsScanBloom() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const glStateRef   = useRef<BloomGLState | null>(null);
  const audioRef     = useRef<BloomAudioEngine | null>(null);
  const rafRef       = useRef<number>(0);
  const rBufRef      = useRef<Float32Array>(new Float32Array(128));
  const glowRef      = useRef<number>(0);          // 0..1 squeeze glow
  const colorIdxRef  = useRef<number>(3);          // current petal colour idx
  const timeRef      = useRef<number>(0);
  const autoTimersRef = useRef<number[]>([]);
  const autoDemoStartRef = useRef<number>(0);
  const autoDemoActiveRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [noWebGL, setNoWebGL] = useState(false);
  const [currentNote, setCurrentNote] = useState<number>(3);

  // ── Petal tap / squeeze handler ────────────────────────────────────────────
  const tapPetal = useCallback((petIdx: number, strength = 0.45) => {
    const eng = audioRef.current;
    if (!eng) return;

    colorIdxRef.current = petIdx;
    setCurrentNote(petIdx);

    eng.setPitch(PETAL_HZ[petIdx]);
    // Inject a squeeze at the petal's angular position on the 128-point ring
    const ringIndex = Math.round((petIdx / N_PETALS) * 128) % 128;
    eng.squeeze(ringIndex, strength);

    // Glow pulse
    glowRef.current = 1.0;
  }, []);

  // ── Auto demo sequence ─────────────────────────────────────────────────────
  const startAutoDemo = useCallback(() => {
    autoDemoActiveRef.current = true;
    autoDemoStartRef.current = performance.now();
    const timers: number[] = [];
    for (const step of AUTO_DEMO_SEQ) {
      const t = window.setTimeout(() => {
        if (autoDemoActiveRef.current) {
          tapPetal(step.petIdx, 0.35);
        }
      }, 3000 + step.delay);   // 3 s after first touch
      timers.push(t);
    }
    autoTimersRef.current = timers;
  }, [tapPetal]);

  const stopAutoDemo = useCallback(() => {
    autoDemoActiveRef.current = false;
    for (const t of autoTimersRef.current) window.clearTimeout(t);
    autoTimersRef.current = [];
  }, []);

  // ── Boot audio + GL ────────────────────────────────────────────────────────
  const startExperience = useCallback(async () => {
    setPhase("playing");

    // Boot audio
    const eng = await bootBloomAudio();
    audioRef.current = eng;
    eng.setPitch(PETAL_HZ[3]);   // start on C4

    // Register frame callback — worklet posts r[] ~33fps
    eng.onFrame((r) => {
      rBufRef.current = r;
    });

    // Boot GL
    const canvas = canvasRef.current;
    if (canvas) {
      const gl = makeBloomGL(canvas);
      if (!gl) {
        setNoWebGL(true);
      } else {
        glStateRef.current = gl;
      }
    }

    startTimeRef.current = performance.now();

    // Auto-demo after 3 s
    startAutoDemo();
  }, [startAutoDemo]);

  // ── Render loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;

    const canvas = canvasRef.current;
    const glState = glStateRef.current;

    // ── No-WebGL fallback: simple DOM animation ────────────────────────────
    if (noWebGL) {
      // Audio still runs; we skip GL entirely.
      return;
    }
    if (!canvas || !glState) return;

    // Resize canvas to CSS size
    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      resizeGL(glState, rect.width * devicePixelRatio, rect.height * devicePixelRatio);
    });
    observer.observe(canvas);
    const rect = canvas.getBoundingClientRect();
    resizeGL(glState, rect.width * devicePixelRatio, rect.height * devicePixelRatio);

    let lastTs = 0;
    const loop = (ts: number) => {
      const dt = (ts - (lastTs || ts)) / 1000;
      lastTs = ts;
      timeRef.current += dt;

      // Decay glow
      glowRef.current = Math.max(0, glowRef.current - dt * 1.4);

      const col = PETAL_COLORS[colorIdxRef.current] ?? PETAL_COLORS[3];
      drawBloom(glState, rBufRef.current, glowRef.current, col, timeRef.current);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [phase, noWebGL]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopAutoDemo();
      cancelAnimationFrame(rafRef.current);
      const gl = glStateRef.current;
      if (gl) disposeGL(gl);
      const eng = audioRef.current;
      if (eng) eng.dispose();
    };
  }, [stopAutoDemo]);

  // ── Pointer → petal hit detection ─────────────────────────────────────────
  const handlePointer = useCallback((clientX: number, clientY: number) => {
    // Stop auto-demo on first real touch
    if (autoDemoActiveRef.current) stopAutoDemo();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx   = rect.left + rect.width  / 2;
    const cy   = rect.top  + rect.height / 2;

    // Pick the petal whose angle is nearest the squeeze point, so a squeeze
    // anywhere on the bloom rings the petal you reached for (not always C4).
    // Petal i sits at angle (i/N)*2π − π/2 (top-aligned, matches the buttons).
    const ang = Math.atan2(clientY - cy, clientX - cx) + Math.PI / 2;
    const twoPi = Math.PI * 2;
    const frac = ((ang % twoPi) + twoPi) % twoPi / twoPi; // 0..1 around the ring
    const closest = Math.round(frac * N_PETALS) % N_PETALS;

    tapPetal(closest);
  }, [tapPetal, stopAutoDemo]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (phase !== "playing") return;
    e.preventDefault();
    handlePointer(e.clientX, e.clientY);
  }, [phase, handlePointer]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (phase !== "playing") return;
    if ((e.buttons & 1) === 0) return;
    e.preventDefault();
    handlePointer(e.clientX, e.clientY);
  }, [phase, handlePointer]);

  // ── Petal button positions (absolute, centred on bloom) ───────────────────
  // These are large tap-target overlays positioned around the bloom.
  const petalButtonStyle = (i: number): React.CSSProperties => {
    const theta = (i / N_PETALS) * Math.PI * 2 - Math.PI / 2;
    const r = 38; // % offset from centre (rough)
    return {
      position: "absolute",
      left:  `calc(50% + ${Math.cos(theta) * r}% - 36px)`,
      top:   `calc(50% + ${Math.sin(theta) * r}% - 36px)`,
      width:  72,
      height: 72,
      borderRadius: "50%",
      cursor: "pointer",
      background: "transparent",
      border: "none",
      touchAction: "none",
      WebkitTapHighlightColor: "transparent",
    };
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="relative w-full h-screen bg-[#0a0514] overflow-hidden flex flex-col items-center justify-center select-none">

      {/* ── Idle splash ─────────────────────────────────────────────────── */}
      {phase === "idle" && (
        <div className="flex flex-col items-center gap-6 z-10 px-6 text-center">
          <h1 className="text-3xl font-bold text-white/95 tracking-tight">
            Squeeze the Bloom
          </h1>
          <p className="text-base text-white/75 max-w-xs">
            Tap or squeeze the glowing flower.
            <br />
            Every petal you touch{" "}
            <span className="text-violet-300 font-semibold">sings its own note</span>{" "}
            — the shape you see is the sound you hear.
          </p>
          <button
            onClick={() => void startExperience()}
            className="mt-2 px-6 py-3 rounded-2xl bg-violet-500 hover:bg-violet-400 active:scale-95
                       text-white text-xl font-bold transition-all duration-150 min-w-[160px] min-h-[56px]"
            style={{ touchAction: "manipulation" }}
          >
            🌸 Start
          </button>
          <p className="text-sm text-white/40 mt-1">
            Best with headphones
          </p>
        </div>
      )}

      {/* ── Playing view ────────────────────────────────────────────────── */}
      {phase === "playing" && (
        <>
          {/* WebGL canvas */}
          {!noWebGL ? (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ touchAction: "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
            />
          ) : (
            /* DOM fallback bloom */
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="rounded-full blur-2xl animate-pulse"
                style={{
                  width: 260,
                  height: 260,
                  background: `radial-gradient(circle, ${
                    `rgba(${Math.round(PETAL_COLORS[currentNote][0]*255)},${Math.round(PETAL_COLORS[currentNote][1]*255)},${Math.round(PETAL_COLORS[currentNote][2]*255)},0.8)`
                  } 0%, transparent 70%)`,
                }}
              />
            </div>
          )}

          {/* Invisible petal tap buttons (≥64px touch targets) */}
          {PETAL_HZ.map((_, i) => (
            <button
              key={i}
              style={petalButtonStyle(i)}
              aria-label={`Petal ${i + 1}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                stopAutoDemo();
                tapPetal(i);
              }}
            />
          ))}

          {/* Current note indicator */}
          <div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none"
            style={{ zIndex: 10 }}
          >
            <div className="flex gap-2">
              {PETAL_HZ.map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-200"
                  style={{
                    width: 10,
                    height: 10,
                    background: i === currentNote
                      ? `rgb(${Math.round(PETAL_COLORS[i][0]*255)},${Math.round(PETAL_COLORS[i][1]*255)},${Math.round(PETAL_COLORS[i][2]*255)})`
                      : "rgba(255,255,255,0.2)",
                    boxShadow: i === currentNote
                      ? `0 0 8px rgb(${Math.round(PETAL_COLORS[i][0]*255)},${Math.round(PETAL_COLORS[i][1]*255)},${Math.round(PETAL_COLORS[i][2]*255)})`
                      : "none",
                    transform: i === currentNote ? "scale(1.4)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* No-WebGL notice */}
          {noWebGL && (
            <p className="absolute top-4 left-1/2 -translate-x-1/2 text-rose-300 text-base text-center px-4">
              WebGL2 not available — bloom is simplified, audio runs normally.
            </p>
          )}
        </>
      )}

      {/* ── Design notes link (always visible) ─────────────────────────── */}
      <Link
        href={`/dream/474-kids-scan-bloom/README.md`}
        target="_blank"
        rel="noopener"
        className="absolute bottom-3 right-4 text-sm text-white/35 hover:text-white/65 transition-colors z-20"
      >
        Read the design notes ↗
      </Link>
    </main>
  );
}
