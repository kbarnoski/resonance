"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { makeEngine, type Engine, JI_RATIOS } from "./audio";
import {
  type SceneObject,
  type ChimeStone,
  sunPosition,
  castShadow,
  distToShadow,
  skyColors,
} from "./shadows";

// ---- scene constants ----
const GROUND_BAND = 0.7; // ground band top as fraction of height
const STRIKE_RADIUS = 26; // px: how close a shadow tip/edge must be to ring a stone
const RESTRIKE_MS = 280; // per-stone debounce so a hovering shadow doesn't buzz
const MAX_OBJECTS = 8;
const IDLE_MS = 2500; // start auto-demo after this much quiet

type Ripple = { x: number; y: number; r: number; a: number; hue: number };

// Starting objects + chime stones laid out so a single sun sweep makes an arpeggio.
function makeStartObjects(): SceneObject[] {
  return [
    { x: 0.22, groundY: 0.74, height: 0.18, kind: "tree", hue: 140 },
    { x: 0.5, groundY: 0.78, height: 0.13, kind: "rock", hue: 30 },
    { x: 0.74, groundY: 0.75, height: 0.2, kind: "crystal", hue: 280 },
  ];
}

function makeStartStones(): ChimeStone[] {
  const xs = [0.12, 0.3, 0.42, 0.58, 0.66, 0.82, 0.9];
  return xs.map((x, i) => ({
    x,
    y: 0.8 + (i % 2) * 0.06,
    note: i % JI_RATIOS.length,
    flash: 0,
  }));
}

// stable object hues by kind for newly planted objects
const KIND_CYCLE: SceneObject["kind"][] = ["tree", "rock", "crystal"];
const KIND_HUE: Record<SceneObject["kind"], number> = {
  tree: 140,
  rock: 30,
  crystal: 280,
};

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);

  // mutable scene state lives in refs so the single rAF loop can read it
  const engineRef = useRef<Engine | null>(null);
  const objectsRef = useRef<SceneObject[]>(makeStartObjects());
  const stonesRef = useRef<ChimeStone[]>(makeStartStones());
  const ripplesRef = useRef<Ripple[]>([]);
  const sunTRef = useRef(0.18);
  const draggingRef = useRef(false);
  const lastInputRef = useRef(0);
  const lastStrikeRef = useRef<number[]>([]); // per-stone timestamps
  const demoDirRef = useRef(1);
  const plantCountRef = useRef(0);
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });

  // map a pointer's horizontal position to a sun t value along the arc
  function pointerToSunT(px: number): number {
    const { w, h } = sizeRef.current;
    const cx = w * 0.5;
    const radius = Math.min(w * 0.46, h * 0.72);
    const norm = (px - cx) / radius; // -1..1
    const clamped = Math.max(-1, Math.min(1, norm));
    const angle = Math.acos(clamped); // 0..PI
    return 1 - angle / Math.PI;
  }

  function nearSun(px: number, py: number): boolean {
    const { w, h } = sizeRef.current;
    const sun = sunPosition(sunTRef.current, w, h);
    return Math.hypot(px - sun.x, py - sun.y) < 64;
  }

  function plantObject(px: number, py: number) {
    if (objectsRef.current.length >= MAX_OBJECTS) return;
    const { w, h } = sizeRef.current;
    const kind = KIND_CYCLE[plantCountRef.current % KIND_CYCLE.length];
    plantCountRef.current += 1;
    objectsRef.current = [
      ...objectsRef.current,
      {
        x: Math.max(0.05, Math.min(0.95, px / w)),
        groundY: Math.max(GROUND_BAND + 0.02, Math.min(0.9, py / h)),
        height: 0.12 + Math.random() * 0.1,
        kind,
        hue: KIND_HUE[kind],
      },
    ];
  }

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    lastInputRef.current = performance.now();
    lastStrikeRef.current = stonesRef.current.map(() => 0);

    function resize() {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      sizeRef.current = { w, h, dpr };
    }
    resize();
    window.addEventListener("resize", resize);

    function markInput() {
      lastInputRef.current = performance.now();
    }

    function getPos(e: PointerEvent): { x: number; y: number } {
      const c = canvasRef.current!;
      const rect = c.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onDown(e: PointerEvent) {
      markInput();
      const { x, y } = getPos(e);
      const { h } = sizeRef.current;
      if (nearSun(x, y) || y < h * GROUND_BAND) {
        draggingRef.current = true;
        sunTRef.current = pointerToSunT(x);
        canvasRef.current?.setPointerCapture(e.pointerId);
      } else {
        // tap on the ground -> plant a shadow-caster
        plantObject(x, y);
      }
    }
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      markInput();
      const { x } = getPos(e);
      sunTRef.current = pointerToSunT(x);
    }
    function onUp(e: PointerEvent) {
      draggingRef.current = false;
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    // optional tilt: nudge the sun, but pointer works without it (feature-detected)
    let tiltHandler: ((e: DeviceOrientationEvent) => void) | null = null;
    if (typeof window.DeviceOrientationEvent !== "undefined") {
      tiltHandler = (e: DeviceOrientationEvent) => {
        if (draggingRef.current) return;
        if (e.gamma == null) return;
        // only nudge while a real tilt is happening; counts as input
        const g = Math.max(-45, Math.min(45, e.gamma));
        const target = (g + 45) / 90; // 0..1
        sunTRef.current += (target - sunTRef.current) * 0.04;
        if (Math.abs(g) > 6) markInput();
      };
      window.addEventListener("deviceorientation", tiltHandler);
    }

    let prevTimeMs = performance.now();

    function frame(now: number) {
      const dt = Math.min(0.05, (now - prevTimeMs) / 1000);
      prevTimeMs = now;
      const engine = engineRef.current;
      const { w, h } = sizeRef.current;

      // idle auto-demo: drift the sun back and forth
      if (now - lastInputRef.current > IDLE_MS && !draggingRef.current) {
        sunTRef.current += demoDirRef.current * dt * 0.12;
        if (sunTRef.current > 0.9) {
          sunTRef.current = 0.9;
          demoDirRef.current = -1;
        } else if (sunTRef.current < 0.1) {
          sunTRef.current = 0.1;
          demoDirRef.current = 1;
        }
      }

      const t = sunTRef.current;
      const sun = sunPosition(t, w, h);

      // drive the pad toward dusk when the sun is low
      if (engine) engine.setDusk(1 - sun.height01);

      // ---- compute shadows + detect strikes ----
      const shadows = objectsRef.current.map((o) => castShadow(o, sun, w, h));
      const stones = stonesRef.current;
      for (let i = 0; i < stones.length; i++) {
        const s = stones[i];
        const sx = s.x * w;
        const sy = s.y * h;
        let hit = false;
        for (const sh of shadows) {
          if (distToShadow(sx, sy, sh) < STRIKE_RADIUS) {
            hit = true;
            break;
          }
        }
        if (hit && now - lastStrikeRef.current[i] > RESTRIKE_MS) {
          lastStrikeRef.current[i] = now;
          s.flash = 1;
          ripplesRef.current.push({ x: sx, y: sy, r: 8, a: 0.9, hue: 40 + s.note * 18 });
          if (engine) {
            // velocity gentle; brightness from sun height keeps noon airier
            engine.strike(s.note, 0.5 + sun.height01 * 0.4, sun.height01);
          }
        }
        s.flash *= 0.9;
      }

      drawScene(ctx!, now);
      raf = requestAnimationFrame(frame);
    }

    function drawScene(c: CanvasRenderingContext2D, now: number) {
      const { w, h, dpr } = sizeRef.current;
      c.save();
      c.scale(dpr, dpr);

      const t = sunTRef.current;
      const sun = sunPosition(t, w, h);
      const sky = skyColors(t, sun.height01);

      // ---- sky ----
      const g = c.createLinearGradient(0, 0, 0, h * GROUND_BAND);
      g.addColorStop(0, sky.top);
      g.addColorStop(0.6, sky.mid);
      g.addColorStop(1, sky.bottom);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h * GROUND_BAND);

      // ---- ground ----
      const gg = c.createLinearGradient(0, h * GROUND_BAND, 0, h);
      gg.addColorStop(0, mixWarmGround(sun.height01, 0));
      gg.addColorStop(1, mixWarmGround(sun.height01, 1));
      c.fillStyle = gg;
      c.fillRect(0, h * GROUND_BAND, w, h - h * GROUND_BAND);

      // ---- sun glow ----
      drawSun(c, sun.x, sun.y, sun.height01);

      // ---- shadows (drawn under objects + stones) ----
      const shadows = objectsRef.current.map((o) => castShadow(o, sun, w, h));
      c.save();
      c.globalCompositeOperation = "multiply";
      shadows.forEach((sh) => drawShadow(c, sh));
      c.restore();

      // ---- chime stones ----
      stonesRef.current.forEach((s) => drawStone(c, s.x * w, s.y * h, s.flash, s.note));

      // ---- objects ----
      objectsRef.current.forEach((o) => drawObject(c, o, w, h));

      // ---- ripples ----
      const next: Ripple[] = [];
      for (const rp of ripplesRef.current) {
        rp.r += 1.6;
        rp.a *= 0.94;
        if (rp.a > 0.04) {
          c.beginPath();
          c.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
          c.strokeStyle = `hsla(${rp.hue}, 80%, 70%, ${rp.a})`;
          c.lineWidth = 2;
          c.stroke();
          next.push(rp);
        }
      }
      ripplesRef.current = next;

      // gentle vignette
      const vg = c.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.28)");
      c.fillStyle = vg;
      c.fillRect(0, 0, w, h);

      // hint glow around the sun handle so kids know to grab it
      const pulse = 0.5 + 0.5 * Math.sin(now / 600);
      c.beginPath();
      c.arc(sun.x, sun.y, 46 + pulse * 6, 0, Math.PI * 2);
      c.strokeStyle = `rgba(255,240,200,${0.18 + pulse * 0.12})`;
      c.lineWidth = 2;
      c.stroke();

      c.restore();
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (tiltHandler) window.removeEventListener("deviceorientation", tiltHandler);
    };
  }, [started]);

  function start() {
    if (!engineRef.current) {
      engineRef.current = makeEngine();
    }
    void engineRef.current.ctx.resume();
    setStarted(true);
  }

  function clearObjects() {
    objectsRef.current = makeStartObjects();
    plantCountRef.current = 0;
    lastInputRef.current = performance.now();
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#140b22] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ touchAction: "none" }}
      />

      {/* header */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 px-5 pt-4">
        <h1 className="font-serif text-2xl text-foreground sm:text-3xl">Move the Sun</h1>
        <p className="mt-1 max-w-xl text-base text-muted-foreground">
          Drag the big sun across the sky. The long shadows it throws sweep over the
          glowing stones and make them sing.
        </p>
      </div>

      {/* read the design notes */}
      <Link
        href="/dream/593-kids-sun-shadows/README.md"
        className="pointer-events-auto absolute right-3 top-3 z-20 rounded-full bg-muted px-4 py-2.5 text-base text-muted-foreground backdrop-blur hover:text-foreground"
      >
        Read the design notes
      </Link>

      {/* clear button */}
      {started && (
        <button
          onClick={clearObjects}
          className="pointer-events-auto absolute bottom-5 right-5 z-20 flex min-h-[44px] items-center gap-2 rounded-full bg-muted px-4 py-2.5 text-base text-foreground backdrop-blur hover:bg-accent"
          aria-label="Clear planted objects"
        >
          <span aria-hidden>↺</span> Reset
        </button>
      )}

      {/* start gate (creates AudioContext on the gesture) */}
      {!started && (
        <button
          onClick={start}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#140b22]/60 backdrop-blur-sm"
          aria-label="Start"
        >
          <span className="mb-5 inline-flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-b from-violet-200 to-violet-400 text-5xl shadow-[0_0_70px_20px_rgba(255,190,120,0.55)]">
            ☀
          </span>
          <span className="text-xl text-foreground">Tap to begin</span>
          <span className="mt-1 text-base text-muted-foreground">then drag the sun</span>
        </button>
      )}
    </main>
  );
}

// ---------- drawing helpers ----------

function mixWarmGround(height01: number, depth: number): string {
  // dark warm earth; a touch lighter at the top of the ground band
  const top = 18 + height01 * 16;
  const lum = top - depth * 12;
  return `hsl(${28 - height01 * 4}, 30%, ${Math.max(6, lum)}%)`;
}

function drawSun(c: CanvasRenderingContext2D, x: number, y: number, height01: number) {
  const r = 30;
  const glowR = 150;
  const warm = 30 + height01 * 14; // hue: warmer/redder low, paler gold high
  const grd = c.createRadialGradient(x, y, 0, x, y, glowR);
  grd.addColorStop(0, `hsla(${warm + 12}, 100%, 75%, 0.95)`);
  grd.addColorStop(0.15, `hsla(${warm}, 95%, 65%, 0.55)`);
  grd.addColorStop(0.5, `hsla(${warm}, 90%, 55%, 0.18)`);
  grd.addColorStop(1, `hsla(${warm}, 90%, 55%, 0)`);
  c.fillStyle = grd;
  c.beginPath();
  c.arc(x, y, glowR, 0, Math.PI * 2);
  c.fill();

  // solid disc
  const disc = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  disc.addColorStop(0, "#fff6df");
  disc.addColorStop(1, `hsl(${warm}, 95%, 68%)`);
  c.fillStyle = disc;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function drawShadow(
  c: CanvasRenderingContext2D,
  sh: { baseX: number; baseY: number; tipX: number; tipY: number; length: number },
) {
  // a soft tapering shadow from base (wide) to tip (narrow)
  const dx = sh.tipX - sh.baseX;
  const dy = sh.tipY - sh.baseY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const baseW = 14;
  const tipW = 4;

  c.beginPath();
  c.moveTo(sh.baseX + nx * baseW, sh.baseY + ny * baseW);
  c.lineTo(sh.baseX - nx * baseW, sh.baseY - ny * baseW);
  c.lineTo(sh.tipX - nx * tipW, sh.tipY - ny * tipW);
  c.lineTo(sh.tipX + nx * tipW, sh.tipY + ny * tipW);
  c.closePath();

  const grd = c.createLinearGradient(sh.baseX, sh.baseY, sh.tipX, sh.tipY);
  grd.addColorStop(0, "rgba(20,10,30,0.55)");
  grd.addColorStop(1, "rgba(20,10,30,0.05)");
  c.fillStyle = grd;
  c.fill();
}

function drawStone(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  flash: number,
  note: number,
) {
  const hue = 40 + note * 18;
  const r = 10;
  // glow rises with flash
  const glowR = r + 6 + flash * 22;
  const grd = c.createRadialGradient(x, y, 0, x, y, glowR);
  grd.addColorStop(0, `hsla(${hue}, 90%, 75%, ${0.5 + flash * 0.5})`);
  grd.addColorStop(1, `hsla(${hue}, 90%, 60%, 0)`);
  c.fillStyle = grd;
  c.beginPath();
  c.arc(x, y, glowR, 0, Math.PI * 2);
  c.fill();

  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = `hsl(${hue}, 80%, ${55 + flash * 25}%)`;
  c.fill();
}

function drawObject(
  c: CanvasRenderingContext2D,
  o: SceneObject,
  w: number,
  h: number,
) {
  const x = o.x * w;
  const baseY = o.groundY * h;
  const ph = o.height * h;

  if (o.kind === "tree") {
    c.strokeStyle = "#4a2e1a";
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(x, baseY);
    c.lineTo(x, baseY - ph * 0.55);
    c.stroke();
    c.beginPath();
    c.arc(x, baseY - ph * 0.7, ph * 0.42, 0, Math.PI * 2);
    c.fillStyle = `hsl(${o.hue}, 45%, 38%)`;
    c.fill();
  } else if (o.kind === "rock") {
    c.beginPath();
    c.moveTo(x - ph * 0.5, baseY);
    c.lineTo(x - ph * 0.2, baseY - ph * 0.7);
    c.lineTo(x + ph * 0.25, baseY - ph * 0.6);
    c.lineTo(x + ph * 0.5, baseY);
    c.closePath();
    c.fillStyle = `hsl(${o.hue}, 18%, 40%)`;
    c.fill();
  } else {
    // crystal — glowing prism
    c.beginPath();
    c.moveTo(x, baseY - ph);
    c.lineTo(x + ph * 0.28, baseY - ph * 0.4);
    c.lineTo(x, baseY);
    c.lineTo(x - ph * 0.28, baseY - ph * 0.4);
    c.closePath();
    const grd = c.createLinearGradient(x, baseY - ph, x, baseY);
    grd.addColorStop(0, `hsla(${o.hue}, 80%, 80%, 0.95)`);
    grd.addColorStop(1, `hsla(${o.hue}, 70%, 45%, 0.85)`);
    c.fillStyle = grd;
    c.fill();
  }
}
