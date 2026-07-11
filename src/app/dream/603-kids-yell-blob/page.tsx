"use client";

// 603 — Kids Yell Blob
// A big wobbly cartoon blob you YELL at. Louder = bigger, bouncier, goofier,
// and it HONKS your own voice back. Mic loudness inflates + jiggles the
// soft-body; rough pitch tints the hue and bends the honk. Idle auto-demo
// keeps it alive; click/hold or press a key to "yell" if there's no mic.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  makeGL,
  drawClear,
  drawFan,
  type GL,
} from "./gl";
import {
  makeBlob,
  popBlob,
  stepBlob,
  buildFan,
  buildCircle,
  type Blob,
} from "./blob";
import {
  makeEngine,
  rampMaster,
  attachMic,
  readMic,
  honk,
  type Engine,
} from "./audio";

// HSV -> RGB, all 0..1. Used to tint the blob from rough pitch.
function makeHueRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const m = i % 6;
  if (m === 0) return [v, t, p];
  if (m === 1) return [q, v, p];
  if (m === 2) return [p, v, t];
  if (m === 3) return [p, q, v];
  if (m === 4) return [t, p, v];
  return [v, p, q];
}

export default function KidsYellBlob() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<GL | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const rafRef = useRef<number>(0);

  // input state shared across the rAF loop
  const fakeYellRef = useRef(0); // 0..1 from pointer/keyboard
  const lastInputAtRef = useRef(0); // ms of last REAL (mic or fake) loud input
  const lastHonkAtRef = useRef(0);
  const hueRef = useRef(0.55); // smoothed hue 0..1
  const demoPhaseRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [loudUi, setLoudUi] = useState(0); // for the on-screen meter

  // Begin: create audio engine + try mic. Must be from a user gesture.
  const runStart = useCallback(async () => {
    if (started) return;
    let engine: Engine;
    try {
      engine = makeEngine();
    } catch {
      setMicError("Audio is unavailable in this browser. The blob still wobbles.");
      setStarted(true);
      return;
    }
    engineRef.current = engine;
    await engine.ctx.resume().catch(() => {});
    rampMaster(engine, 0.9, 0.4);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      attachMic(engine, stream);
      setMicError(null);
    } catch {
      setMicError(
        "No microphone — that's OK! Click, hold, or press any key to YELL at the blob.",
      );
    }
    setStarted(true);
  }, [started]);

  // A "fake yell" — pointer/keyboard input when there's no mic (or for fun).
  const runFakeYell = useCallback((amount: number) => {
    fakeYellRef.current = Math.max(fakeYellRef.current, amount);
  }, []);

  // Main render + physics loop.
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const g = makeGL(canvas);
    if (!g) {
      setGlError("WebGL2 isn't available here, so the blob can't draw. Try a newer browser.");
      return;
    }
    glRef.current = g;

    let last = performance.now();
    lastInputAtRef.current = last;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const baseR = Math.min(w, h) * 0.28;
      if (!blobRef.current) {
        blobRef.current = makeBlob(w / 2, h / 2, baseR);
      } else {
        blobRef.current.cx = w / 2;
        blobRef.current.cy = h / 2;
        blobRef.current.baseR = baseR;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = canvas.width;
      const h = canvas.height;
      const b = blobRef.current!;
      const engine = engineRef.current;

      // ---- gather input loudness + pitch ----
      let loud = 0;
      let pitchNorm = 0.5;
      if (engine && engine.micOn) {
        const r = readMic(engine);
        loud = r.rms;
        pitchNorm = r.pitchNorm;
      }
      // fake yell adds in (and decays)
      if (fakeYellRef.current > 0.001) {
        loud = Math.max(loud, fakeYellRef.current);
        // pointer yells get a random-ish pitch so honks vary
        pitchNorm = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(now * 0.004));
        fakeYellRef.current *= Math.exp(-dt * 2.2);
      }

      const realInput = loud > 0.12;
      if (realInput) lastInputAtRef.current = now;

      // ---- idle auto-demo: ~2.5s after load, ~5s after last input ----
      const idleFor = (now - lastInputAtRef.current) / 1000;
      let demoLoud = 0;
      let demoPitch = 0.5;
      if (idleFor > 2.5) {
        demoPhaseRef.current += dt;
        const p = demoPhaseRef.current;
        // a scripted "fake yells" loop: bursts every ~1.4s, varying size+pitch
        const cycle = p % 1.4;
        const burst = cycle < 0.18 ? 1 - cycle / 0.18 : 0;
        demoLoud = burst * (0.5 + 0.45 * Math.abs(Math.sin(p * 0.9)));
        demoPitch = 0.5 + 0.45 * Math.sin(p * 0.7);
        if (demoLoud > loud) {
          loud = demoLoud;
          pitchNorm = demoPitch;
        }
      } else {
        demoPhaseRef.current = 0;
      }

      // ---- onset / pop detection -> honk ----
      // Fire a honk on a loud rising edge, rate-limited so it's "honk honk"
      // not a buzz. Demo uses its own burst timing already inside `loud`.
      const since = now - lastHonkAtRef.current;
      const loudEnough = loud > 0.22;
      if (loudEnough && since > 180) {
        lastHonkAtRef.current = now;
        if (b) popBlob(b, Math.min(1, loud) * 0.9);
        if (engine) honk(engine, Math.min(1, loud), pitchNorm);
      }

      // ---- physics ----
      stepBlob(b, dt, loud);

      // smooth hue toward pitch: low voice -> warm pink/orange, high -> cyan
      const targetHue = 0.95 - pitchNorm * 0.55; // ~0.95 (pink) .. 0.40 (cyan)
      hueRef.current += (targetHue - hueRef.current) * Math.min(1, dt * 4);
      const [cr, cg, cb] = makeHueRgb(
        (hueRef.current + 1) % 1,
        0.62,
        0.95,
      );

      // ---- draw ----
      drawClear(g, w, h);

      // body
      const fan = buildFan(b, w, h);
      drawFan(g, fan, cr, cg, cb, 0);

      // a darker inner shadow blob for depth (slightly smaller, offset down)
      // reuse buildCircle for a soft belly highlight done as a brighter circle
      const bellyR = (b.restR + Math.min(...b.rad)) * 0.55;
      const belly = buildCircle(
        b.cx,
        b.cy + b.restR * 0.18 * b.squashY,
        Math.max(8, bellyR),
        w,
        h,
        b.squashX,
        b.squashY,
      );
      drawFan(g, belly, Math.min(1, cr + 0.18), Math.min(1, cg + 0.18), Math.min(1, cb + 0.18), 0);

      // ---- googly eyes: squash WITH the body, pupils drift with loudness ----
      const eyeSep = b.restR * 0.42 * b.squashX;
      const eyeY = b.cy - b.restR * 0.22 * b.squashY;
      const eyeR = b.restR * 0.26 * (0.9 + loud * 0.25);
      const pupilR = eyeR * 0.45;
      // pupils bounce up when loud (wide-eyed surprise)
      const pupilDy = -loud * eyeR * 0.45 + Math.sin(now * 0.003) * eyeR * 0.12;
      const pupilDx = Math.sin(now * 0.0021) * eyeR * 0.15;
      for (const sx of [-1, 1]) {
        const ex = b.cx + sx * eyeSep;
        const white = buildCircle(ex, eyeY, eyeR, w, h, 1, 0.9 + loud * 0.2);
        drawFan(g, white, 0, 0, 0, 1);
        const pupil = buildCircle(
          ex + pupilDx,
          eyeY + pupilDy,
          pupilR,
          w,
          h,
        );
        drawFan(g, pupil, 0, 0, 0, 2);
        // little shine dot
        const shine = buildCircle(
          ex + pupilDx - pupilR * 0.4,
          eyeY + pupilDy - pupilR * 0.5,
          pupilR * 0.4,
          w,
          h,
        );
        drawFan(g, shine, 0, 0, 0, 3);
      }

      // UI meter (throttled-ish; React state is cheap enough here)
      setLoudUi(loud);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

  // pointer + keyboard "yell" wiring (works whether or not mic is live)
  useEffect(() => {
    if (!started) return;
    let holding = false;
    let holdRaf = 0;
    const holdPump = () => {
      if (holding) {
        runFakeYell(0.85);
        holdRaf = requestAnimationFrame(holdPump);
      }
    };
    const down = () => {
      holding = true;
      runFakeYell(0.9);
      holdPump();
    };
    const up = () => {
      holding = false;
      cancelAnimationFrame(holdRaf);
    };
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      runFakeYell(0.9);
    };
    const c = canvasRef.current;
    c?.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    return () => {
      c?.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
      cancelAnimationFrame(holdRaf);
    };
  }, [started, runFakeYell]);

  // tear down audio on unmount
  useEffect(() => {
    return () => {
      const e = engineRef.current;
      if (e) void e.ctx.close().catch(() => {});
    };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0d0916] text-foreground select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="A big wobbly cartoon blob that reacts to your voice"
      />

      {/* Title + instructions */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 p-5 sm:p-7">
        <h1 className="text-3xl font-black tracking-tight text-foreground drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] sm:text-4xl">
          YELL AT THE BLOB!
        </h1>
        <p className="mt-1 text-base text-foreground drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)] sm:text-lg">
          Roar, sing, or shout — louder makes it bigger, bouncier, and it HONKS you back.
        </p>
      </div>

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#0d0916]/80 px-6 text-center backdrop-blur-sm">
          <p className="text-2xl font-bold text-foreground sm:text-3xl">
            Ready to make some noise?
          </p>
          <button
            type="button"
            onClick={runStart}
            className="min-h-[72px] rounded-3xl bg-gradient-to-b from-violet-400 to-violet-500 px-10 py-5 text-2xl font-black text-foreground shadow-[0_8px_0_rgba(0,0,0,0.35)] transition-transform active:translate-y-1 active:shadow-[0_4px_0_rgba(0,0,0,0.35)] sm:text-3xl"
          >
            START YELLING 📣
          </button>
          <p className="max-w-sm text-base text-muted-foreground">
            We&apos;ll ask for your microphone. No mic? No problem — tap or press a key to yell.
          </p>
        </div>
      )}

      {/* Mic failure notice — must be clearly visible */}
      {started && micError && (
        <div className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2 px-6 text-center">
          <p className="rounded-2xl bg-black/45 px-4 py-2.5 text-base font-semibold text-violet-300 drop-shadow">
            {micError}
          </p>
        </div>
      )}

      {/* WebGL failure notice */}
      {glError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center px-6 text-center">
          <p className="max-w-md rounded-2xl bg-black/60 px-5 py-4 text-base font-semibold text-violet-300">
            {glError}
          </p>
        </div>
      )}

      {/* Big loudness meter + tap hint along the bottom */}
      {started && !glError && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <span className="text-base font-bold text-foreground">quiet</span>
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-300 via-violet-300 to-violet-400 transition-[width] duration-75"
                style={{ width: `${Math.min(100, Math.round(loudUi * 100))}%` }}
              />
            </div>
            <span className="text-base font-bold text-foreground">LOUD!</span>
          </div>
          <p className="mt-2 text-center text-base text-muted-foreground">
            Tip: hold the screen or mash a key to fake a yell.
          </p>
        </div>
      )}

      {/* corner tag + design-notes pointer */}
      <div className="pointer-events-none absolute bottom-2 right-3 z-10">
        <span className="text-sm text-muted-foreground">
          603 · design notes in README.md
        </span>
      </div>
    </main>
  );
}
