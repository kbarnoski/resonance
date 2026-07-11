"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  makeMarble,
  stepMarble,
  wellAt,
  wellById,
  WELLS,
  TILT_SENSITIVITY,
  type Marble,
  type WellId,
} from "./physics";
import { HarmonyEngine } from "./audio";

// Visual palette — warm daytime meadow (gold / green / amber). No cosmic dark.
const WELL_STYLE: Record<WellId, { glow: string; core: string; label: string }> = {
  tonic: { glow: "250,205,90", core: "255,236,160", label: "Home" }, // gold
  subdominant: { glow: "120,200,110", core: "190,240,170", label: "Away" }, // green
  dominant: { glow: "250,150,70", core: "255,200,140", label: "Pull" }, // orange
};

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  hue: number;
}

interface Flower {
  x: number;
  y: number;
  bloom: number; // 0..1
  seed: number;
}

type SensorState = "unknown" | "tilt" | "fallback";

export default function KidsTiltCadence() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<HarmonyEngine | null>(null);
  const marbleRef = useRef<Marble>(makeMarble());
  const gravityRef = useRef<{ gx: number; gy: number }>({ gx: 0, gy: 0 });
  const sparksRef = useRef<Spark[]>([]);
  const flowersRef = useRef<Flower[]>([]);
  const rafRef = useRef<number>(0);
  const lastWellRef = useRef<WellId | null>("tonic");
  const lastInteractRef = useRef<number>(performance.now());
  const autoDemoRef = useRef<{ active: boolean; phase: number; t: number }>({
    active: false,
    phase: 0,
    t: 0,
  });
  // fallback tilt-pad puck (normalized -1..1)
  const puckRef = useRef<{ x: number; y: number; dragging: boolean }>({
    x: 0,
    y: 0,
    dragging: false,
  });
  const keysRef = useRef<Set<string>>(new Set());

  const [started, setStarted] = useState(false);
  const [sensor, setSensor] = useState<SensorState>("unknown");
  const [sensorNote, setSensorNote] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);
  const [cadenceFlash, setCadenceFlash] = useState(false);

  // --- Device tilt handler ---
  const onOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    // beta: front-back tilt (-180..180), gamma: left-right (-90..90)
    const gx = (e.gamma ?? 0) / TILT_SENSITIVITY;
    const gy = (e.beta ?? 0) / TILT_SENSITIVITY;
    gravityRef.current = {
      gx: Math.max(-1.5, Math.min(1.5, gx)),
      gy: Math.max(-1.5, Math.min(1.5, gy)),
    };
    lastInteractRef.current = performance.now();
    autoDemoRef.current.active = false;
  }, []);

  // --- Spark / flower bursts on the magic cadence ---
  const burstCadence = useCallback(() => {
    const m = marbleRef.current;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + Math.random();
      const sp = 0.004 + Math.random() * 0.006;
      sparksRef.current.push({
        x: m.x,
        y: m.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        hue: 45 + Math.random() * 40,
      });
    }
    const home = wellById("tonic");
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      flowersRef.current.push({
        x: home.x + Math.cos(a) * 0.11,
        y: home.y + Math.sin(a) * 0.11,
        bloom: 0,
        seed: Math.random(),
      });
    }
    setCadenceFlash(true);
    window.setTimeout(() => setCadenceFlash(false), 650);
  }, []);

  // --- Main loop ---
  const runFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      rafRef.current = requestAnimationFrame(runFrame);
      return;
    }
    const W = canvas.width;
    const H = canvas.height;
    const m = marbleRef.current;

    // gravity from active input source
    let { gx, gy } = gravityRef.current;

    // keyboard nudges (laptop fallback)
    const keys = keysRef.current;
    if (keys.size > 0) {
      if (keys.has("ArrowLeft")) gx -= 0.8;
      if (keys.has("ArrowRight")) gx += 0.8;
      if (keys.has("ArrowUp")) gy -= 0.8;
      if (keys.has("ArrowDown")) gy += 0.8;
      lastInteractRef.current = performance.now();
      autoDemoRef.current.active = false;
    }
    // tilt-pad puck (laptop / no-sensor fallback)
    if (puckRef.current.dragging || puckRef.current.x !== 0 || puckRef.current.y !== 0) {
      gx += puckRef.current.x;
      gy += puckRef.current.y;
    }

    // --- hands-free auto-demo: untouched ~3s -> roll T->S->D->I in ~1s ---
    const idle = performance.now() - lastInteractRef.current;
    const demo = autoDemoRef.current;
    if (!demo.active && idle > 3000) {
      demo.active = true;
      demo.phase = 0;
      demo.t = 0;
    }
    if (demo.active) {
      // steer gravity toward a scripted sequence of well targets
      const seq: WellId[] = ["subdominant", "dominant", "tonic"];
      const target = wellById(seq[Math.min(demo.phase, seq.length - 1)]);
      const dx = target.x - m.x;
      const dy = target.y - m.y;
      gx = dx * 9;
      gy = dy * 9;
      demo.t += 1 / 60;
      if (Math.hypot(dx, dy) < 0.05 && demo.t > 0.28) {
        demo.phase += 1;
        demo.t = 0;
        if (demo.phase >= seq.length) {
          demo.active = false;
          lastInteractRef.current = performance.now() - 1200; // re-arm soon
        }
      }
    }

    stepMarble(m, gx, gy, 1);

    // tension hint while approaching the dominant well
    const dom = wellById("dominant");
    const dDom = Math.hypot(m.x - dom.x, m.y - dom.y);
    engineRef.current?.setTension(Math.max(0, 1 - dDom * 3));

    // well transitions drive the chord machine
    const w = wellAt(m);
    if (w && w !== lastWellRef.current) {
      const cadence = lastWellRef.current === "dominant" && w === "tonic";
      engineRef.current?.enterWell(w);
      if (cadence) burstCadence();
      lastWellRef.current = w;
    } else if (!w) {
      // leaving the well — keep current chord id so re-entry is detected
    }

    // ---------- RENDER (warm meadow) ----------
    // sky-to-grass vertical wash
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#bfe39a");
    bg.addColorStop(0.5, "#9fd07e");
    bg.addColorStop(1, "#7cbb5f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // soft sun glow top-right
    const sun = ctx.createRadialGradient(W * 0.82, H * 0.16, 0, W * 0.82, H * 0.16, W * 0.5);
    sun.addColorStop(0, "rgba(255,250,210,0.55)");
    sun.addColorStop(1, "rgba(255,250,210,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";

    // wells (additive warm glow basins)
    for (const well of WELLS) {
      const st = WELL_STYLE[well.id];
      const cx = well.x * W;
      const cy = well.y * H;
      const r = Math.min(W, H) * 0.2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const isHome = well.id === lastWellRef.current;
      const a = isHome ? 0.55 : 0.34;
      g.addColorStop(0, `rgba(${st.core},${a})`);
      g.addColorStop(0.4, `rgba(${st.glow},${a * 0.6})`);
      g.addColorStop(1, `rgba(${st.glow},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // ring
      ctx.strokeStyle = `rgba(${st.core},0.5)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(W, H) * 0.075, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";

    // well labels (big, readable, no reading required to PLAY but nice for adults)
    ctx.textAlign = "center";
    ctx.font = `700 ${Math.round(Math.min(W, H) * 0.032)}px ui-sans-serif, system-ui`;
    for (const well of WELLS) {
      const st = WELL_STYLE[well.id];
      ctx.fillStyle = "rgba(60,45,15,0.85)";
      ctx.fillText(st.label, well.x * W, well.y * H + Math.min(W, H) * 0.115);
    }

    // flowers blooming around home
    flowersRef.current = flowersRef.current.filter((f) => {
      f.bloom = Math.min(1, f.bloom + 0.05);
      const fx = f.x * W;
      const fy = f.y * H;
      const pr = Math.min(W, H) * 0.018 * f.bloom;
      for (let p = 0; p < 6; p++) {
        const ang = (p / 6) * Math.PI * 2 + f.seed * 6;
        ctx.fillStyle = `rgba(255,${200 + f.seed * 40},${120},0.9)`;
        ctx.beginPath();
        ctx.ellipse(
          fx + Math.cos(ang) * pr,
          fy + Math.sin(ang) * pr,
          pr * 0.7,
          pr * 0.4,
          ang,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,235,120,1)";
      ctx.beginPath();
      ctx.arc(fx, fy, pr * 0.6, 0, Math.PI * 2);
      ctx.fill();
      return true; // flowers persist (home keeps blooming)
    });
    if (flowersRef.current.length > 80) {
      flowersRef.current.splice(0, flowersRef.current.length - 80);
    }

    // sparks (additive)
    ctx.globalCompositeOperation = "lighter";
    sparksRef.current = sparksRef.current.filter((s) => {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.0002;
      s.life -= 0.02;
      if (s.life <= 0) return false;
      ctx.fillStyle = `hsla(${s.hue},90%,70%,${s.life})`;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, 4 * s.life + 1, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });

    // the marble (glowing)
    const mx = m.x * W;
    const my = m.y * H;
    const mr = Math.min(W, H) * 0.028;
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 3);
    mg.addColorStop(0, "rgba(255,255,235,0.95)");
    mg.addColorStop(0.3, "rgba(255,225,150,0.8)");
    mg.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#fffef0";
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();

    rafRef.current = requestAnimationFrame(runFrame);
  }, [burstCadence]);

  // --- Start (the primary action; sets up audio + sensor permission) ---
  const handleStart = useCallback(async () => {
    if (!engineRef.current) {
      engineRef.current = new HarmonyEngine();
    }
    await engineRef.current.resume();
    engineRef.current.enterWell("tonic");
    lastWellRef.current = "tonic";

    // iOS permission must be requested inside this user gesture.
    let granted = false;
    const dev = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (dev && typeof dev.requestPermission === "function") {
      try {
        const res = await dev.requestPermission();
        granted = res === "granted";
      } catch {
        granted = false;
      }
    } else if (typeof window.DeviceOrientationEvent !== "undefined") {
      granted = true; // android / non-iOS — listener will confirm
    }

    if (granted) {
      window.addEventListener("deviceorientation", onOrientation);
      // confirm we actually receive readings; if not, fall back after 1.2s
      let got = false;
      const probe = () => {
        got = true;
        window.removeEventListener("deviceorientation", probe);
      };
      window.addEventListener("deviceorientation", probe);
      window.setTimeout(() => {
        if (got) {
          setSensor("tilt");
        } else {
          setSensor("fallback");
          setSensorNote("No tilt readings — use the pad or arrow keys.");
        }
      }, 1200);
    } else {
      setSensor("fallback");
      setSensorNote(
        "Tilt sensor unavailable or blocked — drag the pad or use arrow keys."
      );
    }

    setStarted(true);
    lastInteractRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [onOrientation, runFrame]);

  // canvas sizing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // keyboard fallback listeners
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.startsWith("Arrow")) {
        keysRef.current.add(e.key);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", onOrientation);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [onOrientation]);

  // --- tilt-pad puck drag handlers (fallback control) ---
  const padRef = useRef<HTMLDivElement>(null);
  const setPuckFromEvent = useCallback((clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const r = pad.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = ((clientY - r.top) / r.height) * 2 - 1;
    puckRef.current.x = Math.max(-1, Math.min(1, nx));
    puckRef.current.y = Math.max(-1, Math.min(1, ny));
    lastInteractRef.current = performance.now();
    autoDemoRef.current.active = false;
  }, []);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-neutral-950 text-foreground">
      {/* Play surface */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Tilt cadence meadow"
      />

      {/* Header chrome */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4">
        <div className="pointer-events-auto rounded-2xl bg-black/35 px-4 py-2.5 backdrop-blur-sm">
          <h1 className="font-mono text-xl font-semibold text-foreground sm:text-2xl">
            Tilt the marble home
          </h1>
          <p className="mt-1 text-base text-foreground">
            Roll from <span className="text-violet-300">Pull</span> to{" "}
            <span className="text-violet-200">Home</span> to feel it resolve.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dream"
            className="pointer-events-auto flex min-h-[44px] items-center rounded-2xl bg-black/35 px-4 py-2.5 text-base text-foreground backdrop-blur-sm hover:text-foreground"
          >
            ← Lab
          </Link>
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="pointer-events-auto flex min-h-[44px] items-center rounded-2xl bg-black/35 px-4 py-2.5 text-base text-muted-foreground backdrop-blur-sm hover:text-foreground"
          >
            Design notes
          </button>
        </div>
      </div>

      {/* Cadence "Home!" flash */}
      {cadenceFlash && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="animate-pulse rounded-3xl bg-violet-300/20 px-8 py-4 text-5xl font-extrabold text-violet-100 drop-shadow-lg">
            ✦ Home! ✦
          </span>
        </div>
      )}

      {/* Sensor fallback note */}
      {started && sensor === "fallback" && (
        <p className="absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-xl bg-black/45 px-4 py-2 text-center text-base text-violet-300 backdrop-blur-sm">
          {sensorNote}
        </p>
      )}

      {/* Fallback tilt-pad (shown when no sensor) */}
      {started && sensor === "fallback" && (
        <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
          <p className="mb-2 text-center text-base text-foreground">
            Drag to tilt · or use arrow keys
          </p>
          <div
            ref={padRef}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              puckRef.current.dragging = true;
              setPuckFromEvent(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (puckRef.current.dragging) setPuckFromEvent(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              puckRef.current.dragging = false;
              puckRef.current.x = 0;
              puckRef.current.y = 0;
              (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            }}
            className="relative h-40 w-40 touch-none rounded-full border-2 border-border bg-black/30 backdrop-blur-sm"
          >
            <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted" />
            <span className="absolute left-1/2 top-2 -translate-x-1/2 text-base text-muted-foreground">
              ↑
            </span>
          </div>
        </div>
      )}

      {/* Start overlay (primary action -> sound + motion immediately) */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-violet-900/70 to-violet-900/60 p-6 text-center backdrop-blur-sm">
          <h2 className="max-w-xl text-3xl font-bold text-foreground sm:text-4xl">
            Tilt the glowing marble back home
          </h2>
          <p className="mt-4 max-w-md text-lg text-foreground">
            Tip your tablet to roll the marble between three glowing wells. Bring
            it from the restless orange <b>Pull</b> into the gold <b>Home</b> and
            hear the music settle.
          </p>
          <button
            onClick={handleStart}
            className="mt-8 min-h-[64px] rounded-full bg-violet-300 px-10 py-4 text-2xl font-extrabold text-violet-950 shadow-lg transition hover:bg-violet-200 active:scale-95"
          >
            ▶ Start playing
          </button>
          <p className="mt-4 text-base text-muted-foreground">
            Sound plays right away. Works with tilt, drag-pad, or arrow keys.
          </p>
        </div>
      )}

      {/* Design notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6">
          <div className="max-h-[80vh] max-w-lg overflow-auto rounded-2xl bg-neutral-900 p-6 text-base leading-relaxed text-foreground">
            <h3 className="text-2xl font-bold text-foreground">Design notes</h3>
            <p className="mt-3">
              A 4-year-old tilts the device to roll a damped point-mass marble
              across a height field of three Gaussian wells. The wells literally
              are Hugo Riemann&apos;s harmonic functions:{" "}
              <b className="text-violet-200">Tonic (I) = Home</b>,{" "}
              <b className="text-violet-300">Subdominant (IV) = Away</b>,{" "}
              <b className="text-violet-300">Dominant 7th (V7) = Pull</b>.
            </p>
            <p className="mt-3">
              Sitting in a well sounds its chord over an always-on tonic drone.
              The payoff: rolling from V7 into I fires a real authentic cadence —
              the leading tone resolves up a semitone, the chordal 7th down — with
              sparks and blooming flowers. Tension to home, learned in the hands.
            </p>
            <p className="mt-3 text-muted-foreground">
              References: Riemann functional harmony · Toca Boca tilt-toys ·
              BeSound · CHI 2026 &ldquo;From Movement to Sound and Back.&rdquo;
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-xl bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
