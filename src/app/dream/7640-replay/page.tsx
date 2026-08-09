"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import { screenToCortex, formConstant } from "../_shared/visionary/logpolar";
import { createSafeFlicker } from "../_shared/visionary/safeFlicker";
import {
  defaultMemory,
  resamplePath,
  keyboardEvent,
  KEY_DEGREE,
  type MemoryEvent,
} from "./memory";
import { makeReplayAudio, type ReplayAudio } from "./audio";

// ── the field the radial wave sweeps, in cortical (log-radius) space ──────────
const U_MIN = Math.log(0.035);
const U_MAX = Math.log(1.45);
const U_SPAN = U_MAX - U_MIN;

type Phase = "idle" | "running";

interface RtEvent extends MemoryEvent {
  u: number; // cortical log-radius (via screenToCortex)
  pe: number; // normalized position along the sweep, 0..1
  hot: number; // ignition envelope, decays each frame
}

function toRuntime(events: MemoryEvent[]): RtEvent[] {
  return events.map((e) => {
    const [u] = screenToCortex(e.x, e.y);
    const pe = Math.min(1, Math.max(0, (u - U_MIN) / U_SPAN));
    return { ...e, u, pe, hot: 0 };
  });
}

/** Did a monotonic-with-wrap phase step from `prev` to `now` cross `t`? */
function crossed(prev: number, now: number, t: number): boolean {
  if (now >= prev) return t > prev && t <= now;
  return t > prev || t <= now; // wrapped past 1.0
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function ReplayPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [dose, setDose] = useState(0.2);
  const [noCanvas, setNoCanvas] = useState(false);
  const [hasMemory, setHasMemory] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufsRef = useRef<HTMLCanvasElement[]>([]);
  const bufIdxRef = useRef(0);

  const memRef = useRef<RtEvent[]>(toRuntime(defaultMemory()));
  const rawPathRef = useRef<{ x: number; y: number }[]>([]);
  const drawingRef = useRef(false);
  const kbIndexRef = useRef(0);

  const audioRef = useRef<ReplayAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const flickerRef = useRef(createSafeFlicker({ defaultHz: 0.15, floor: 0.72 }));

  const clockRef = useRef(0);
  const lastRef = useRef(0);
  const wavePRef = useRef(0);
  const wallPhaseRef = useRef(0);
  const prevPfRef = useRef<number[]>([]);

  const phaseRef = useRef<Phase>("idle");
  const doseRef = useRef(0.2);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    doseRef.current = dose;
    audioRef.current?.setDose(dose);
  }, [dose]);

  // ── field-coordinate helpers (event stored y is UP-positive) ───────────────
  const eventToScreen = (
    e: { x: number; y: number },
    cx: number,
    cy: number,
    R: number,
  ): [number, number] => [cx + e.x * R, cy - e.y * R];

  // ── size the visible canvas + the two feedback buffers ─────────────────────
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    canvas.width = w;
    canvas.height = h;
    const bufs = bufsRef.current;
    for (let i = 0; i < 2; i++) {
      let b = bufs[i];
      if (!b) {
        b = document.createElement("canvas");
        bufs[i] = b;
      }
      b.width = w;
      b.height = h;
      const bc = b.getContext("2d");
      if (bc) {
        bc.fillStyle = "#02010a";
        bc.fillRect(0, 0, w, h);
      }
    }
  }, []);

  // ── one bloom (phosphor smear) at a screen position ────────────────────────
  const drawBloom = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    degree: number,
    intensity: number,
  ) => {
    const hue = 256 + degree * 9; // violet → magenta ramp
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `hsla(${hue}, 95%, ${72}%, ${0.9 * intensity})`);
    g.addColorStop(0.35, `hsla(${hue + 8}, 92%, 60%, ${0.5 * intensity})`);
    g.addColorStop(1, `hsla(${hue + 14}, 90%, 45%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  // ── the whole frame ────────────────────────────────────────────────────────
  const renderLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const vctx = canvas?.getContext("2d");
    const bufs = bufsRef.current;
    if (!canvas || !vctx || bufs.length < 2) {
      rafRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    const now = performance.now();
    let dt = (now - lastRef.current) / 1000;
    lastRef.current = now;
    if (!(dt > 0) || dt > 0.05) dt = Math.min(0.05, Math.max(0.0001, dt || 0.016));
    clockRef.current += dt;

    const d = doseRef.current;
    const running = phaseRef.current === "running";
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.5;

    const src = bufs[bufIdxRef.current];
    const dst = bufs[bufIdxRef.current ^ 1];
    const bctx = dst.getContext("2d");
    if (!bctx) {
      rafRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    // 1) FEEDBACK: repaint the base, then draw the previous frame slightly zoomed
    //    outward (+ a dose-scaled twist). Constant multiplicative zoom about the
    //    centre == constant velocity in log-radius == the accelerating tunnel.
    const zoom = 1.02 + d * 0.05;
    const twist = d * 0.01;
    const decay = lerp(0.95, 0.88, d);
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = "source-over";
    bctx.globalAlpha = 1;
    bctx.fillStyle = "#02010a";
    bctx.fillRect(0, 0, w, h);
    bctx.globalAlpha = decay;
    bctx.translate(cx, cy);
    bctx.rotate(twist);
    bctx.scale(zoom, zoom);
    bctx.translate(-cx, -cy);
    bctx.drawImage(src, 0, 0);
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalAlpha = 1;

    // luminance breathing routed through the safe (<=3Hz) engine
    const lum = flickerRef.current.value(clockRef.current);

    // 2) additive glow layer
    bctx.globalCompositeOperation = "lighter";

    // faint drifting tunnel-wall rings — cortical stripes seen under the warp
    wallPhaseRef.current += dt * (0.5 + d * 1.4);
    const wallFreq = 2.6 + d * 3.2;
    const NWALL = 9;
    for (let m = 0; m < NWALL; m++) {
      const u = U_MIN + (m / NWALL) * U_SPAN;
      const a = formConstant(u, 0, 0, wallFreq, -wallPhaseRef.current) * 0.06 * lum;
      if (a < 0.004) continue;
      const rr = Math.exp(u) * R;
      bctx.strokeStyle = `hsla(268, 80%, 62%, ${a})`;
      bctx.lineWidth = Math.max(1, R * 0.006);
      bctx.beginPath();
      bctx.arc(cx, cy, rr, 0, Math.PI * 2);
      bctx.stroke();
    }

    // advance the wave (only while running)
    const ringCount = 1 + (d >= 0.45 ? 1 : 0) + (d >= 0.8 ? 1 : 0);
    if (prevPfRef.current.length !== ringCount) {
      prevPfRef.current = new Array(ringCount).fill(-1);
    }
    if (running) {
      const cycleDur = lerp(6.5, 2.1, d);
      wavePRef.current = (wavePRef.current + dt / cycleDur) % 1;
    }
    const p = wavePRef.current;
    const mem = memRef.current;

    // 3) each ring: detect crossings (ignite) + draw the expanding wavefront
    for (let k = 0; k < ringCount; k++) {
      const off = k / ringCount;
      const pf = (p + off) % 1;
      const prev = prevPfRef.current[k];
      if (running && prev >= 0) {
        for (let i = 0; i < mem.length; i++) {
          const e = mem[i];
          if (crossed(prev, pf, e.pe)) {
            e.hot = 1;
            audioRef.current?.ignite(e.degree, e.pe);
          }
        }
      }
      prevPfRef.current[k] = pf;

      // the visible wavefront ring (glowing, expanding)
      const ru = U_MIN + pf * U_SPAN;
      const rr = Math.exp(ru) * R;
      const ringA = (k === 0 ? 0.22 : 0.12) * lum;
      bctx.strokeStyle = `hsla(280, 95%, 66%, ${ringA})`;
      bctx.lineWidth = Math.max(1.5, R * 0.01);
      bctx.beginPath();
      bctx.arc(cx, cy, rr, 0, Math.PI * 2);
      bctx.stroke();
    }

    // 4) ignited events bloom (feedback then smears them down the tunnel)
    for (let i = 0; i < mem.length; i++) {
      const e = mem[i];
      if (e.hot > 0.02) {
        const [sx, sy] = eventToScreen(e, cx, cy, R);
        const radius = R * (0.045 + 0.05 * e.hot) * (0.7 + 0.6 * e.pe);
        drawBloom(bctx, sx, sy, radius, e.degree, e.hot * lum);
        e.hot *= 0.86;
      }
    }

    // faint core throat glow
    const coreR = R * 0.14;
    const cg = bctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    cg.addColorStop(0, `hsla(275, 90%, 70%, ${0.18 * lum})`);
    cg.addColorStop(1, "hsla(275, 90%, 50%, 0)");
    bctx.fillStyle = cg;
    bctx.beginPath();
    bctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    bctx.fill();

    bctx.globalCompositeOperation = "source-over";

    // 5) blit buffer to the visible canvas
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.globalAlpha = 1;
    vctx.drawImage(dst, 0, 0);

    // 6) crisp overlay: the FIXED memory (dots + gesture line) + live draw path
    vctx.lineWidth = Math.max(1, R * 0.004);
    vctx.strokeStyle = "hsla(270, 60%, 70%, 0.28)";
    if (mem.length > 1) {
      const ordered = [...mem].sort((a, b) => a.tNorm - b.tNorm);
      vctx.beginPath();
      for (let i = 0; i < ordered.length; i++) {
        const [sx, sy] = eventToScreen(ordered[i], cx, cy, R);
        if (i === 0) vctx.moveTo(sx, sy);
        else vctx.lineTo(sx, sy);
      }
      vctx.stroke();
    }
    for (let i = 0; i < mem.length; i++) {
      const e = mem[i];
      const [sx, sy] = eventToScreen(e, cx, cy, R);
      const hue = 256 + e.degree * 9;
      vctx.fillStyle = `hsla(${hue}, 85%, ${70 + e.hot * 25}%, ${0.5 + e.hot * 0.5})`;
      vctx.beginPath();
      vctx.arc(sx, sy, Math.max(1.5, R * (0.007 + e.hot * 0.01)), 0, Math.PI * 2);
      vctx.fill();
    }

    // live gesture being drawn right now
    const raw = rawPathRef.current;
    if (drawingRef.current && raw.length > 1) {
      vctx.strokeStyle = "hsla(285, 90%, 75%, 0.8)";
      vctx.lineWidth = Math.max(1.5, R * 0.006);
      vctx.beginPath();
      for (let i = 0; i < raw.length; i++) {
        const sx = cx + raw[i].x * R;
        const sy = cy - raw[i].y * R;
        if (i === 0) vctx.moveTo(sx, sy);
        else vctx.lineTo(sx, sy);
      }
      vctx.stroke();
    }

    // advance audio drone
    audioRef.current?.step(dt);

    bufIdxRef.current ^= 1;
    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  // ── pointer authoring ──────────────────────────────────────────────────────
  const pointToField = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const R = Math.min(rect.width, rect.height) * 0.5;
    const x = (clientX - rect.left - rect.width / 2) / R;
    const y = (rect.top + rect.height / 2 - clientY) / R; // up positive
    return { x, y };
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (noCanvas) return;
    drawingRef.current = true;
    rawPathRef.current = [pointToField(e.clientX, e.clientY)];
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, [noCanvas]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    rawPathRef.current.push(pointToField(e.clientX, e.clientY));
  }, []);

  const commitDraw = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const events = resamplePath(rawPathRef.current);
    rawPathRef.current = [];
    if (events.length >= 2) {
      memRef.current = toRuntime(events);
      kbIndexRef.current = events.length;
      setHasMemory(true);
    }
  }, []);

  // ── keyboard authoring: play + drop a scale degree ─────────────────────────
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const key = ev.key.toLowerCase();
      if (!(key in KEY_DEGREE)) return;
      if (ev.repeat) return;
      const degree = KEY_DEGREE[key];
      const idx = kbIndexRef.current++;
      const me = keyboardEvent(idx, degree);
      const rt = toRuntime([me])[0];
      memRef.current = [...memRef.current, rt];
      setHasMemory(true);
      // immediate audible feedback if the engine is live
      audioRef.current?.ignite(rt.degree, rt.pe);
      rt.hot = 1;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Start: build audio inside the gesture, begin the sweep ─────────────────
  const handleStart = useCallback(async () => {
    if (phaseRef.current === "running") return;
    const canvas = canvasRef.current;
    if (!canvas || !canvas.getContext("2d")) {
      setNoCanvas(true);
      return;
    }
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new AC();
      await ac.resume();
      acRef.current = ac;
      audioRef.current = makeReplayAudio(ac, doseRef.current);
    } catch {
      /* audio unavailable — visuals still replay */
    }
    setPhase("running");
  }, []);

  const handleClear = useCallback(() => {
    memRef.current = [];
    kbIndexRef.current = 0;
    setHasMemory(false);
  }, []);

  // ── boot: enable safe luminance drift, size, run the loop ──────────────────
  useEffect(() => {
    flickerRef.current.enable();
    // ensure buffers exist before first frame
    if (!canvasRef.current?.getContext("2d")) {
      setNoCanvas(true);
    }
    resize();
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderLoop);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [resize, renderLoop]);

  // ── full teardown of audio on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 1200);
      }
      acRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={commitDraw}
        onPointerCancel={commitDraw}
        onPointerLeave={commitDraw}
        className="fixed inset-0 h-full w-full touch-none"
      />

      {noCanvas && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            This piece needs a 2D canvas, which is not available here. Try a
            recent desktop browser. Keyboard keys A–J still author and play the
            memory.
          </p>
        </div>
      )}

      {/* hero + controls */}
      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Replay
        </h1>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          A hallucination is a memory being replayed by a traveling wave. Draw a
          gesture across the field, then release — an expanding wave re-fires each
          remembered point as it passes, rushing outward down a log-polar tunnel.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {phase === "idle" ? (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start replay
            </button>
          ) : (
            <button
              onClick={handleClear}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Clear memory
            </button>
          )}
        </div>

        <div className="mt-4 max-w-xs">
          <label
            htmlFor="dose"
            className="flex items-center justify-between text-sm text-muted-foreground"
          >
            <span>Dose / entropy</span>
            <span className="font-mono text-primary">{dose.toFixed(2)}</span>
          </label>
          <input
            id="dose"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={dose}
            onChange={(e) => setDose(parseFloat(e.target.value))}
            className="mt-2 w-full accent-primary"
          />
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          {phase === "idle"
            ? "Press Start to hear it, or draw first. Keys A S D F G H J drop notes."
            : hasMemory
              ? "Replaying on loop. Draw again for a new memory; A–J adds notes."
              : "Memory cleared — draw a gesture or press A–J to author a new one."}
        </p>
      </div>

      <div className="fixed right-0 top-0 z-30 p-5 sm:p-7">
        <Link
          href="/dream/7640-replay/README.md"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Read the design notes
        </Link>
      </div>

      <PrototypeNav slugs={["7640-replay"]} />
    </main>
  );
}
