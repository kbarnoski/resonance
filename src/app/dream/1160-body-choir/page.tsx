"use client";

// ── Body Choir ───────────────────────────────────────────────────────────────
// "What if you could conduct a luminous choir with your whole body — no
//  controller, no touchscreen, just movement in front of your webcam?"
//
// Camera input · Canvas2D bright high-key composite · self-contained
// frame-differencing optical flow · warm just-intonation choral pad.
// Reference: Myron Krueger — Videoplace (1975); the Golan Levin / Camille
// Utterback lineage of camera-driven audiovisual instruments.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createFlow,
  updateFromCamera,
  depositPointer,
  depositIdle,
  type FlowState,
} from "./flow";
import { createChoir, type Choir } from "./choir";

const GW = 32;
const GH = 24;

// Deterministic PRNG for static mote positions (no Math.random / Date seeding).
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Mode = "idle" | "camera" | "pointer";

// Hue by vertical band: top (hands high, upper voices) = sky-blue/gold,
// bottom (bass) = coral/rose. Returned as an "r,g,b" string.
function colorForY(ny: number): [number, number, number] {
  // ny: 0 top .. 1 bottom
  if (ny < 0.5) {
    // gold -> sky-blue up top
    const k = ny / 0.5;
    const r = 255 - k * 120;
    const g = 210 - k * 40;
    const b = 130 + k * 120;
    return [r, g, b];
  }
  // gold -> coral toward the bottom
  const k = (ny - 0.5) / 0.5;
  const r = 255;
  const g = 210 - k * 90;
  const b = 130 - k * 60;
  return [r, g, b];
}

export default function BodyChoir() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [started, setStarted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // refs mirror state so the RAF loop (set up once) always sees the latest
  const modeRef = useRef<Mode>("idle");
  const flowRef = useRef<FlowState>(createFlow(GW, GH));
  const choirRef = useRef<Choir | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);

  // pointer state
  const ptr = useRef({ x: 0.5, y: 0.5, vel: 0, last: -1 });

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ── The always-on render + drive loop (visual from mount, no audio yet) ────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setNotice("Canvas2D isn't available in this browser.");
      return;
    }

    reducedRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // offscreen downsample buffer for the camera frame differencing
    const ds = document.createElement("canvas");
    ds.width = GW;
    ds.height = GH;
    const dsCtx = ds.getContext("2d", { willReadFrequently: true });

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // static daylit motes (deterministic)
    const rnd = mulberry32(0x1160);
    const motes = Array.from({ length: 44 }, () => ({
      x: rnd(),
      y: rnd(),
      r: 1 + rnd() * 2.2,
      ph: rnd() * Math.PI * 2,
    }));

    const start = performance.now();

    const frame = (nowMs: number) => {
      const t = (nowMs - start) / 1000;
      const reduced = reducedRef.current;
      const flow = flowRef.current;
      const m = modeRef.current;

      // ── drive the motion field ──
      if (m === "camera" && videoRef.current && videoRef.current.readyState >= 2 && dsCtx) {
        // draw the (mirrored) video into the tiny grid, then diff it
        dsCtx.save();
        dsCtx.scale(-1, 1);
        dsCtx.drawImage(videoRef.current, -GW, 0, GW, GH);
        dsCtx.restore();
        const img = dsCtx.getImageData(0, 0, GW, GH).data;
        updateFromCamera(flow, img, reduced);
      } else if (m === "pointer") {
        const p = ptr.current;
        if (p.last >= 0 && nowMs - p.last < 200) {
          depositPointer(flow, p.x, p.y, p.vel, reduced);
          p.vel *= 0.9; // let velocity settle -> choir eases to a drone
        } else {
          depositIdle(flow, t, reduced);
        }
      } else {
        depositIdle(flow, t, reduced);
      }

      // ── audio ──
      if (choirRef.current) choirRef.current.update(flow.field, reduced);

      // ── visual: high-key daylit composite ──
      drawScene(ctx, W, H, flow, t, reduced, m, motes, videoRef.current);

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ── teardown everything on unmount ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((tk) => tk.stop());
        streamRef.current = null;
      }
      if (choirRef.current) {
        choirRef.current.stop();
        choirRef.current = null;
      }
    };
  }, []);

  const ensureAudio = useCallback(() => {
    if (!choirRef.current) {
      choirRef.current = createChoir();
      choirRef.current.start();
    } else if (choirRef.current.ctx.state === "suspended") {
      void choirRef.current.ctx.resume();
    }
    setStarted(true);
  }, []);

  const startCamera = useCallback(async () => {
    ensureAudio();
    setNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.muted = true;
        await v.play().catch(() => {});
      }
      setMode("camera");
    } catch {
      setNotice(
        "Camera unavailable or permission denied — conduct the choir with your mouse instead. Move fast to swell it, high to lift the voices.",
      );
      setMode("pointer");
    }
  }, [ensureAudio]);

  const startMouse = useCallback(() => {
    ensureAudio();
    setNotice(null);
    // stop camera if it was running
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tk) => tk.stop());
      streamRef.current = null;
    }
    setMode("pointer");
  }, [ensureAudio]);

  // pointer -> field (only meaningful in pointer mode, harmless otherwise)
  const onPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const p = ptr.current;
    const now = performance.now();
    if (p.last >= 0) {
      const dtms = Math.max(1, now - p.last);
      const dx = nx - p.x;
      const dy = ny - p.y;
      const v = (Math.hypot(dx, dy) / dtms) * 1000; // units/sec
      p.vel = Math.min(1, p.vel * 0.5 + v * 0.5);
    }
    p.x = Math.min(1, Math.max(0, nx));
    p.y = Math.min(1, Math.max(0, ny));
    p.last = now;
  }, []);

  return (
    <main className="min-h-screen w-full bg-[#fdf4ea] text-slate-900">
      <div className="mx-auto max-w-5xl px-5 py-6">
        <header className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-serif text-2xl sm:text-3xl text-slate-900">
              Body Choir
            </h1>
            <Link
              href="/dream"
              className="text-base text-slate-600 hover:text-slate-900 underline underline-offset-4"
            >
              ← lab
            </Link>
          </div>
          <p className="mt-2 text-base text-slate-700 max-w-2xl">
            Conduct a luminous choir with your whole body — no controller, no
            touchscreen. Move in front of your webcam and your motion paints
            light and lifts the voices.
          </p>
        </header>

        <div className="relative w-full overflow-hidden rounded-2xl shadow-lg ring-1 ring-amber-900/10">
          <canvas
            ref={canvasRef}
            onPointerMove={onPointer}
            className="block h-[62vh] min-h-[380px] w-full touch-none"
          />
          {/* faint hidden source video (drawn into canvas as a thumbnail) */}
          <video ref={videoRef} playsInline muted className="hidden" />

          {!started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/25 backdrop-blur-[1px]">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={startCamera}
                  className="min-h-[44px] rounded-full bg-slate-900 px-6 py-2.5 text-base font-medium text-white shadow hover:bg-slate-800"
                >
                  Start camera
                </button>
                <button
                  onClick={startMouse}
                  className="min-h-[44px] rounded-full bg-white/80 px-6 py-2.5 text-base font-medium text-slate-800 shadow ring-1 ring-slate-900/10 hover:bg-white"
                >
                  Play with your mouse
                </button>
              </div>
              <p className="text-base text-slate-700/90">
                Hands high lift the upper voices · move fast to swell the light.
              </p>
            </div>
          )}
        </div>

        {notice && (
          <p className="mt-3 text-base text-rose-300 bg-rose-950/70 rounded-lg px-4 py-2.5">
            {notice}
          </p>
        )}

        {started && (
          <p className="mt-3 text-base text-slate-700">
            {mode === "camera"
              ? "Camera live. Raise your hands to lift the voices, sweep side to side to pan the shimmer. Be still and the choir settles to a calm drone."
              : "Mouse mode. Move high for the upper voices, fast to swell the light; rest and it settles to a calm drone."}
          </p>
        )}

        <button
          onClick={() => setShowNotes((s) => !s)}
          className="mt-4 min-h-[44px] rounded-lg px-4 py-2.5 text-base text-slate-700 underline underline-offset-4 hover:text-slate-900"
        >
          {showNotes ? "Hide design notes" : "Design notes"}
        </button>

        {showNotes && (
          <div className="mt-2 rounded-xl bg-white/70 p-4 text-base text-slate-800 ring-1 ring-slate-900/10">
            <p className="mb-2">
              The instrument computes its own motion field — no ML model, no
              library. Each frame is shrunk to a {GW}×{GH} grid; per-cell
              brightness is compared to the previous frame (frame-differencing
              optical flow). That gives a live field: where you move, how fast,
              and the energy-weighted centroid.
            </p>
            <p className="mb-2">
              Mapping — total energy → loudness &amp; the lowpass opening;
              centroid height → which choral voice sits in the light (hands high
              = upper voices, low = bass, a warm just-intonation G voicing);
              centroid X → stereo pan of the shimmer; speed → an attack
              brightness lift; stillness → a restful sustained drone.
            </p>
            <p className="text-slate-600">
              After Myron Krueger&apos;s <em>Videoplace</em> (1975) and the
              Golan Levin / Camille Utterback lineage of camera-driven
              audiovisual instruments. Brightness changes drift smoothly (well
              under 3 Hz) — no strobing.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// ── High-key daylit composite ────────────────────────────────────────────────
function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  flow: FlowState,
  t: number,
  reduced: boolean,
  mode: Mode,
  motes: { x: number; y: number; r: number; ph: number }[],
  video: HTMLVideoElement | null,
) {
  const field = flow.field;

  // warm ivory -> peach gradient background (opaque; trails live in the field)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#fff7ec");
  bg.addColorStop(0.55, "#fdeede");
  bg.addColorStop(1, "#fbe2cf");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const cw = W / GW;
  const chh = H / GH;

  // additive light-ribbon aura from the motion field
  ctx.globalCompositeOperation = "lighter";
  const aAmp = reduced ? 0.5 : 0.8;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const e = field.cell[y * GW + x];
      if (e < 0.06) continue;
      const px = (x + 0.5) * cw;
      const py = (y + 0.5) * chh;
      const [r, g, b] = colorForY(y / (GH - 1));
      const rad = cw * (1.4 + e * 1.6);
      const a = Math.min(0.55, e * 0.55) * aAmp;
      const grd = ctx.createRadialGradient(px, py, 0, px, py, rad);
      grd.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},${a})`);
      grd.addColorStop(1, `rgba(${r | 0},${g | 0},${b | 0},0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // bright conductor halo at the centroid, colored by height
  const hx = field.cx * W;
  const hy = field.cy * H;
  const [cr, cg, cb] = colorForY(field.cy);
  const halo = 60 + field.energy * (reduced ? 90 : 160);
  const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, halo);
  const ha = (0.18 + field.energy * 0.4) * (reduced ? 0.6 : 1);
  hg.addColorStop(0, `rgba(${cr | 0},${cg | 0},${cb | 0},${ha})`);
  hg.addColorStop(0.4, `rgba(255,240,210,${ha * 0.5})`);
  hg.addColorStop(1, "rgba(255,240,210,0)");
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(hx, hy, halo, 0, Math.PI * 2);
  ctx.fill();

  // drifting daylit motes that brighten with overall energy (soft, < 3 Hz)
  const moteA = (0.12 + field.energy * 0.35) * (reduced ? 0.5 : 1);
  for (const mo of motes) {
    const mx = ((mo.x + 0.02 * Math.sin(t * 0.3 + mo.ph)) % 1) * W;
    const my = ((mo.y + 0.02 * Math.cos(t * 0.25 + mo.ph)) % 1) * H;
    const tw = 0.6 + 0.4 * Math.sin(t * 0.9 + mo.ph);
    ctx.fillStyle = `rgba(255,246,224,${moteA * tw})`;
    ctx.beginPath();
    ctx.arc(mx, my, mo.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";

  // faint mirrored camera thumbnail so you can see yourself conducting
  if (mode === "camera" && video && video.readyState >= 2) {
    const tw = Math.min(180, W * 0.26);
    const th = tw * 0.75;
    const pad = 14;
    const tx = W - tw - pad;
    const ty = H - th - pad;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.translate(tx + tw, ty);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, tw, th);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(120,90,60,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(tx, ty, tw, th);
  }
}
