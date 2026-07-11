"use client";

// Coral Tide — shake the tablet to grow a coral reef, and HEAR it get bigger.
//
// Shake (devicemotion) stirs a current; glowing plankton drift down and stick to
// a reef that accretes upward from the seabed via Diffusion-Limited Aggregation.
// The reef is split into horizontal depth bands; each band that holds coral
// sustains one held voice of a D-Dorian chord. As the reef climbs, the chord
// STACKS and thickens — a bare root+fifth grows into a shimmering Dm11.
//
// Input doors: (1) devicemotion shake [primary], (2) pointer-drag swish, (3)
// 3s-idle synthetic current so it self-grows hands-free. Canvas2D only.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CoralSim, BANDS } from "./dla";
import { ReefAudio } from "./audio";

// Names for the chord-stack indicator pips (bottom → top = D-Dorian stack).
const VOICE_NAMES = ["D", "A", "D", "E", "F", "A"];

type Mode = "idle" | "shake" | "touch";

export default function CoralTide() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<CoralSim | null>(null);
  const audioRef = useRef<ReefAudio | null>(null);
  const rafRef = useRef<number | null>(null);

  // live stir intensity (0..1) blended from shake / pointer / idle current
  const intensityRef = useRef(0);
  const lastInputRef = useRef(0); // timestamp of last real (non-idle) input
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const sunPhaseRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [activeBands, setActiveBands] = useState<boolean[]>(
    new Array(BANDS).fill(false)
  );
  const [noCanvas, setNoCanvas] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // ── Render + sim loop ────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    const audio = audioRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = sim.w;
    const h = sim.h;
    const now = performance.now();

    // Idle synthetic current: if no real input for 3s, gently stir on its own.
    const idle = now - lastInputRef.current > 3000;
    let target = intensityRef.current;
    if (idle) {
      // slow breathing current ~0.3..0.6 so the reef self-grows within ~2s
      const breath = 0.45 + 0.18 * Math.sin(now * 0.0011);
      target = breath;
    }
    // decay real input toward 0 so a single shake fades naturally
    intensityRef.current += (target - intensityRef.current) * 0.12;
    if (!idle) intensityRef.current *= 0.94;
    const I = Math.max(idle ? 0.3 : 0, Math.min(1, intensityRef.current));

    // Advance the DLA sim.
    const res = sim.step(I);
    if (audio) {
      audio.setBands(res.activeBands);
      for (const lk of res.locked) audio.ringBell(lk.band);
    }
    // Reflect active bands to the indicator (only when it changes).
    setActiveBands((prev) => {
      for (let i = 0; i < BANDS; i++) {
        if (!!prev[i] !== !!res.activeBands[i]) return res.activeBands.slice();
      }
      return prev;
    });

    // ── Draw ───────────────────────────────────────────────────────────
    // Warm reef background gradient (deep amber → coral, sandy at the floor).
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#2a160c");
    bg.addColorStop(0.45, "#4a2113");
    bg.addColorStop(0.82, "#7a3a18");
    bg.addColorStop(1, "#b8743a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Soft sunbeams from above (slowly drifting).
    sunPhaseRef.current += 0.0035;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const beams = 5;
    for (let i = 0; i < beams; i++) {
      const bx = ((i + 0.5) / beams) * w + Math.sin(sunPhaseRef.current + i) * w * 0.05;
      const g = ctx.createLinearGradient(bx, 0, bx + w * 0.12, h);
      g.addColorStop(0, "rgba(255, 224, 170, 0.10)");
      g.addColorStop(1, "rgba(255, 224, 170, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx - w * 0.04, 0);
      ctx.lineTo(bx + w * 0.04, 0);
      ctx.lineTo(bx + w * 0.16, h);
      ctx.lineTo(bx + w * 0.06, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Sandy seabed glow.
    const sg = ctx.createLinearGradient(0, sim.seabedY - 24, 0, h);
    sg.addColorStop(0, "rgba(255, 196, 120, 0)");
    sg.addColorStop(1, "rgba(255, 196, 120, 0.32)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, sim.seabedY - 24, w, h - (sim.seabedY - 24));

    // Drifting plankton (live walkers) — faint warm glow.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    sim.forEachWalker((px, py) => {
      ctx.fillStyle = "rgba(255, 236, 190, 0.5)";
      ctx.beginPath();
      ctx.arc(px, py, 1.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // The coral itself — colour drifts coral → gold → cream by band height.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of sim.stuck) {
      const t = s.band / Math.max(1, BANDS - 1);
      const hue = 12 + t * 36; // coral → gold
      const light = 52 + t * 26; // brighter toward the top (cream)
      const r = sim.stickR * 0.95;
      ctx.fillStyle = `hsla(${hue}, ${90 - t * 30}%, ${light}%, 0.9)`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  // ── Resize / DPR setup ───────────────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = parent.clientWidth;
    const cssH = parent.clientHeight;
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // (Re)build the sim at the new CSS size. Keep it simple: fresh reef on resize.
    simRef.current = new CoralSim(cssW, cssH);
  }, []);

  // ── Pointer-drag swish (fallback input) ──────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const prev = pointerRef.current;
    const x = e.clientX;
    const y = e.clientY;
    if (prev) {
      const dx = x - prev.x;
      const dy = y - prev.y;
      const speed = Math.sqrt(dx * dx + dy * dy);
      const add = Math.min(1, speed / 40);
      intensityRef.current = Math.min(1, intensityRef.current + add * 0.6);
      lastInputRef.current = performance.now();
      setMode((m) => (m === "shake" ? m : "touch"));
    }
    pointerRef.current = { x, y };
  }, []);

  const onPointerUp = useCallback(() => {
    pointerRef.current = null;
  }, []);

  // ── Start (the one user gesture: create audio, request motion perm) ──
  const onStart = useCallback(async () => {
    setNotice(null);

    // Canvas check
    const canvas = canvasRef.current;
    if (!canvas || !canvas.getContext("2d")) {
      setNoCanvas(true);
      return;
    }

    // Audio (silent-catch inside).
    const audio = new ReefAudio();
    const ok = await audio.start();
    audioRef.current = audio;
    if (!ok) setNotice("Audio could not start — the reef will still grow.");

    sizeCanvas();
    setStarted(true);
    lastInputRef.current = performance.now() - 4000; // start idle so it self-grows fast

    // DeviceMotion shake — primary input. Request permission inside the gesture.
    let shakeEnabled = false;
    const attachMotion = () => {
      let lastMag = 0;
      const onMotion = (ev: DeviceMotionEvent) => {
        const a =
          ev.accelerationIncludingGravity || ev.acceleration || null;
        if (!a) return;
        const mag = Math.sqrt(
          (a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2
        );
        // jerk = change in magnitude → that's a "shake", not gravity tilt.
        const jerk = Math.abs(mag - lastMag);
        lastMag = mag;
        if (jerk > 0.6) {
          intensityRef.current = Math.min(
            1,
            intensityRef.current + Math.min(1, jerk / 18)
          );
          lastInputRef.current = performance.now();
          setMode("shake");
          shakeEnabled = true;
        }
      };
      window.addEventListener("devicemotion", onMotion);
      return () => window.removeEventListener("devicemotion", onMotion);
    };

    try {
      const DME = window.DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (DME && typeof DME.requestPermission === "function") {
        const perm = await DME.requestPermission().catch(() => "denied");
        if (perm === "granted") {
          detachMotionRef.current = attachMotion();
        } else {
          setNotice(
            "Motion access was declined — drag a finger to swish the water, or just watch it grow."
          );
        }
      } else if ("ondevicemotion" in window) {
        detachMotionRef.current = attachMotion();
      } else {
        setNotice(
          "No shake sensor here — drag a finger to swish the water, or just watch it grow."
        );
      }
    } catch {
      setNotice(
        "Motion access was declined — drag a finger to swish the water, or just watch it grow."
      );
    }

    // Give the sensor a moment; if no shake arrived, fall back to touch label.
    setTimeout(() => {
      if (!shakeEnabled) setMode((m) => (m === "shake" ? m : "touch"));
    }, 1500);

    rafRef.current = requestAnimationFrame(runLoop);
  }, [runLoop, sizeCanvas]);

  const detachMotionRef = useRef<(() => void) | null>(null);

  // Resize listener.
  useEffect(() => {
    if (!started) return;
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [started, sizeCanvas]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (detachMotionRef.current) detachMotionRef.current();
      audioRef.current?.dispose();
      audioRef.current = null;
      simRef.current = null;
    };
  }, []);

  const voicesSounding = activeBands.filter(Boolean).length;

  return (
    <main className="min-h-screen bg-[#2a160c] text-foreground flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <Link
          href="/dream"
          className="text-base text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          ← back to dreams
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">
          Coral Tide 🪸
        </h1>
        <p className="mt-1 text-base text-foreground max-w-prose">
          Shake the tablet to stir the sea. Glowing plankton settle and grow a
          coral reef — and the taller it climbs, the richer the chord you hear.
        </p>
      </div>

      {/* Canvas stage */}
      <div className="relative flex-1 min-h-[60vh] mx-3 mb-3 rounded-2xl overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none"
          onPointerMove={started ? onPointerMove : undefined}
          onPointerUp={started ? onPointerUp : undefined}
          onPointerLeave={started ? onPointerUp : undefined}
        />

        {/* Start overlay */}
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/30 backdrop-blur-sm">
            {noCanvas ? (
              <p className="text-base text-violet-300 px-6 text-center max-w-prose">
                This device can&apos;t draw the reef (no Canvas 2D). Try a
                different browser.
              </p>
            ) : (
              <button
                onClick={onStart}
                className="min-w-[64px] min-h-[64px] px-8 py-4 rounded-full bg-violet-400 text-[#3a1c0c] text-xl font-bold shadow-lg active:scale-95 transition"
              >
                Start the tide 🌊
              </button>
            )}
          </div>
        )}

        {/* Provenance / mode label */}
        {started && (
          <div className="absolute top-3 left-3 flex items-center gap-2">
            {mode === "shake" ? (
              <span className="px-3 py-1.5 rounded-full bg-violet-500/25 text-violet-200 text-base font-medium">
                Shaking 🌊
              </span>
            ) : (
              <span className="px-3 py-1.5 rounded-full bg-violet-500/25 text-violet-200 text-base font-medium">
                Touch mode ✋
              </span>
            )}
          </div>
        )}

        {/* Chord-stack indicator (lit pips show which voices are sounding) */}
        {started && (
          <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1.5">
            <span className="text-base text-foreground font-medium">
              {voicesSounding} of {BANDS} voices
            </span>
            <div className="flex flex-col-reverse gap-1">
              {VOICE_NAMES.map((name, i) => {
                const on = !!activeBands[i];
                return (
                  <div key={i} className="flex items-center gap-2 justify-end">
                    <span
                      className={
                        on
                          ? "text-base text-foreground font-semibold"
                          : "text-base text-muted-foreground"
                      }
                    >
                      {name}
                    </span>
                    <span
                      aria-hidden
                      className={
                        on
                          ? "w-5 h-5 rounded-full bg-violet-300 shadow-[0_0_10px_rgba(253,224,160,0.9)]"
                          : "w-5 h-5 rounded-full bg-muted"
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer notices */}
      <div className="px-5 pb-6 space-y-1.5">
        {notice && <p className="text-base text-violet-300 max-w-prose">{notice}</p>}
        {started && (
          <p className="text-base text-muted-foreground max-w-prose">
            Hear it grow: each lit pip is one held voice of a D-Dorian chord. As
            the reef climbs into higher bands, more voices stack in.
          </p>
        )}
      </div>
    </main>
  );
}
