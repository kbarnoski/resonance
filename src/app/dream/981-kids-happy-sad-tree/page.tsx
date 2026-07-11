"use client";

/**
 * 981-kids-happy-sad-tree — "Can a 4-year-old FEEL major vs minor by flipping
 * one switch?"
 *
 * A glowing musical tree under a living sky. Tap big fruit to pluck diatonic
 * melody notes over an always-on I–vi–IV–V pad. A giant sun/moon button flips
 * the whole world between parallel C major and C natural minor: the held chord
 * voice-leads to the new mode (~400ms) and the sky crossfades gold<->indigo
 * (~600ms). Idle auto-player demos it hands-free.
 *
 * See README.md for design notes + references (Hevner 1935–37; 2026 child-mode
 * findings).
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { makeSky, type SkyRenderer } from "./gl";
import { TreeAudio, FRUIT_COUNT, type Mode } from "./audio";

interface Fruit {
  // normalized position on the tree canopy (0..1 of canvas w/h)
  nx: number;
  ny: number;
  hueMajor: string;
  hueMinor: string;
  pop: number; // 0..1 animated tap response
}

// Seven fruit hung across the canopy. Warm storybook colors (gold world);
// they cool slightly in minor via crossfade. Bright, friendly, high-contrast.
const FRUIT_LAYOUT: Array<Omit<Fruit, "pop">> = [
  { nx: 0.18, ny: 0.46, hueMajor: "#ff5d73", hueMinor: "#c06fb0" },
  { nx: 0.34, ny: 0.34, hueMajor: "#ffb13d", hueMinor: "#8c8fe0" },
  { nx: 0.5, ny: 0.28, hueMajor: "#ffe14d", hueMinor: "#9aa6ef" },
  { nx: 0.66, ny: 0.34, hueMajor: "#7ee06b", hueMinor: "#86c0e6" },
  { nx: 0.82, ny: 0.46, hueMajor: "#4fd6c4", hueMinor: "#7fb0e8" },
  { nx: 0.4, ny: 0.52, hueMajor: "#ff8a5c", hueMinor: "#b08ad8" },
  { nx: 0.62, ny: 0.52, hueMajor: "#ffd23d", hueMinor: "#9fb0f0" },
];

const IDLE_MS = 3000; // start ghost player after 3s idle
const BREATHE_MS = 8000; // ghost flips mode every ~8s
const SESSION_CAP_MS = 15 * 60 * 1000;

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

export default function KidsHappySadTree() {
  const skyRef = useRef<HTMLCanvasElement>(null);
  const treeRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<TreeAudio | null>(null);
  const skyR = useRef<SkyRenderer | null>(null);

  const fruitsRef = useRef<Fruit[]>(FRUIT_LAYOUT.map((f) => ({ ...f, pop: 0 })));
  const modeTargetRef = useRef(0); // 0 major .. 1 minor (eased into modeVisRef)
  const modeVisRef = useRef(0);
  const lastInteractRef = useRef(0);
  const ghostStepRef = useRef(0);
  const ghostNextRef = useRef(0);
  const ghostBreatheRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>("major");
  const [webgl, setWebgl] = useState(true);
  const [capped, setCapped] = useState(false);

  // ---- mode flip --------------------------------------------------------------
  const flip = useCallback((next?: Mode) => {
    const a = audioRef.current;
    if (!a) return;
    const target = next ?? (a.getMode() === "major" ? "minor" : "major");
    a.setMode(target);
    setMode(target);
    modeTargetRef.current = target === "minor" ? 1 : 0;
    lastInteractRef.current = performance.now();
  }, []);

  // ---- tap a fruit ------------------------------------------------------------
  const tapAt = useCallback((clientX: number, clientY: number, isHuman: boolean) => {
    const canvas = treeRef.current;
    const a = audioRef.current;
    if (!canvas || !a) return;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const fruits = fruitsRef.current;
    const R = Math.max(40, Math.min(rect.width, rect.height) * 0.085); // hit radius
    let hit = -1;
    let best = Infinity;
    for (let i = 0; i < fruits.length; i++) {
      const fx = fruits[i].nx * rect.width;
      const fy = fruits[i].ny * rect.height;
      const d2 = (fx - px) * (fx - px) + (fy - py) * (fy - py);
      if (d2 < R * R && d2 < best) { best = d2; hit = i; }
    }
    if (hit >= 0) {
      a.pluck(hit % FRUIT_COUNT);
      fruits[hit].pop = 1;
      if (isHuman) lastInteractRef.current = performance.now();
    }
  }, []);

  const triggerFruit = useCallback((idx: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.pluck(idx % FRUIT_COUNT);
    fruitsRef.current[idx % fruitsRef.current.length].pop = 1;
  }, []);

  // ---- start (user gesture) ---------------------------------------------------
  const handleStart = useCallback(async () => {
    if (audioRef.current) return;
    const a = new TreeAudio();
    audioRef.current = a;
    await a.start();
    lastInteractRef.current = performance.now();
    ghostNextRef.current = performance.now() + IDLE_MS;
    ghostBreatheRef.current = performance.now() + IDLE_MS + BREATHE_MS;
    setStarted(true);
  }, []);

  // ---- main loop + canvases ---------------------------------------------------
  useEffect(() => {
    if (!started) return;
    const sky = skyRef.current;
    const tree = treeRef.current;
    if (!sky || !tree) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const renderer = makeSky(sky, dpr);
    skyR.current = renderer;
    setWebgl(renderer.isWebGL2);

    const tctx = tree.getContext("2d");
    if (!tctx) return;

    const resize = () => {
      tree.width = Math.max(1, Math.floor(tree.offsetWidth * dpr));
      tree.height = Math.max(1, Math.floor(tree.offsetHeight * dpr));
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderer.resize();
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const t0 = performance.now();

    const ghostPhrase = [2, 4, 2, 0, 4, 6, 4, 2]; // a gentle up/down phrase

    const frame = (now: number) => {
      const tSec = (now - t0) / 1000;
      const a = audioRef.current;

      // session cap -> gentle fade once
      if (a && !capped && a.elapsed() * 1000 > SESSION_CAP_MS) {
        a.fadeOut(5);
        setCapped(true);
      }

      // ease the sky mode value (~600ms feel)
      const target = modeTargetRef.current;
      modeVisRef.current += (target - modeVisRef.current) * 0.06;

      // ---- idle ghost auto-player ----
      if (a && !capped) {
        const idle = now - lastInteractRef.current;
        if (idle > IDLE_MS) {
          if (now >= ghostNextRef.current) {
            const idx = ghostPhrase[ghostStepRef.current % ghostPhrase.length];
            triggerFruit(idx);
            ghostStepRef.current++;
            ghostNextRef.current = now + 620; // ~one note every 0.62s
          }
          if (now >= ghostBreatheRef.current) {
            flip(); // breathe between major/minor; flip() resets lastInteract...
            lastInteractRef.current = now - IDLE_MS - 1; // ...so keep ghost alive
            ghostBreatheRef.current = now + BREATHE_MS;
          }
        }
      }

      // ---- draw sky ----
      renderer.draw(tSec, modeVisRef.current);

      // ---- draw tree + fruit ----
      const w = tree.offsetWidth;
      const h = tree.offsetHeight;
      tctx.clearRect(0, 0, w, h);

      drawTree(tctx, w, h, modeVisRef.current, tSec);

      const fruits = fruitsRef.current;
      for (let i = 0; i < fruits.length; i++) {
        const f = fruits[i];
        f.pop *= 0.9; // decay tap pop
        drawFruit(tctx, f, w, h, modeVisRef.current, tSec, i);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      skyR.current = null;
    };
  }, [started, capped, flip, triggerFruit]);

  // ---- teardown audio on unmount ---------------------------------------------
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-neutral-950 text-foreground">
      {/* sky (WebGL2 or 2D fallback) */}
      <canvas ref={skyRef} className="absolute inset-0 h-full w-full" />
      {/* tree + fruit overlay */}
      <canvas
        ref={treeRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={(e) => {
          e.preventDefault();
          tapAt(e.clientX, e.clientY, true);
        }}
      />

      {/* tap-to-begin affordance (no audio until gesture) */}
      {!started && (
        <button
          onClick={handleStart}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-neutral-950/70 backdrop-blur-sm"
          aria-label="Tap to begin the music tree"
        >
          <span className="text-7xl" aria-hidden>🌳</span>
          <span className="text-xl font-medium text-foreground">Tap to begin</span>
          <span className="text-4xl" aria-hidden>👆</span>
        </button>
      )}

      {/* GIANT sun / moon mode toggle */}
      {started && (
        <button
          onClick={() => flip()}
          aria-label={mode === "major" ? "Switch to the tender night world" : "Switch to the happy day world"}
          className="absolute right-5 top-5 z-20 flex h-20 w-20 items-center justify-center rounded-full bg-muted text-5xl shadow-lg ring-2 ring-border backdrop-blur-md transition active:scale-95"
        >
          <span aria-hidden>{mode === "major" ? "☀️" : "🌙"}</span>
        </button>
      )}

      {/* fallback / cap notices (kids: minimal text, color-led) */}
      {started && !webgl && (
        <p className="absolute left-5 top-6 z-20 text-base text-muted-foreground">
          Simple sky mode
        </p>
      )}
      {capped && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/60">
          <span className="text-6xl" aria-hidden>😴</span>
        </div>
      )}

      {/* design-notes corner link (nice-to-have) */}
      <a
        href="/dream/981-kids-happy-sad-tree/README.md"
        className="absolute bottom-3 left-4 z-20 text-base text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Read the design notes
      </a>
    </main>
  );
}

// ---- drawing helpers (named draw* so React doesn't treat them as hooks) ------

function drawTree(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  modeVis: number,
  tSec: number,
) {
  const cx = w * 0.5;
  const baseY = h * 0.96;
  const topY = h * 0.26;

  // trunk color warms (gold world) -> cools (indigo world)
  const trunk = mix("#7a4a24", "#3c3a5c", modeVis);
  const canopy = mix("#2f8f3a", "#3a4a86", modeVis);
  const canopyHi = mix("#5fd06a", "#6c84d6", modeVis);

  // trunk (slightly swaying)
  const sway = Math.sin(tSec * 0.6) * w * 0.004;
  ctx.strokeStyle = trunk;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(14, w * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx, baseY);
  ctx.quadraticCurveTo(cx + sway, (baseY + topY) / 2, cx + sway * 2, topY + h * 0.12);
  ctx.stroke();

  // canopy — three soft overlapping blobs
  const blobs: Array<[number, number, number]> = [
    [cx + sway * 2, topY + h * 0.06, w * 0.26],
    [cx - w * 0.14 + sway, topY + h * 0.14, w * 0.18],
    [cx + w * 0.14 + sway, topY + h * 0.14, w * 0.18],
  ];
  for (const [bx, by, r] of blobs) {
    const g = ctx.createRadialGradient(bx, by - r * 0.3, r * 0.1, bx, by, r);
    g.addColorStop(0, canopyHi);
    g.addColorStop(1, canopy);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // grassy ground hint
  const ground = mix("#3aa84a", "#43508c", modeVis);
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.ellipse(cx, baseY + h * 0.02, w * 0.4, h * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFruit(
  ctx: CanvasRenderingContext2D,
  f: Fruit,
  w: number,
  h: number,
  modeVis: number,
  tSec: number,
  i: number,
) {
  const x = f.nx * w;
  const bob = Math.sin(tSec * 1.2 + i * 0.9) * h * 0.006;
  const y = f.ny * h + bob;
  const base = Math.max(34, Math.min(w, h) * 0.066); // big round targets (>=68px diameter)
  const r = base * (1 + f.pop * 0.35);
  const col = mix(f.hueMajor, f.hueMinor, modeVis);

  // glow halo
  const halo = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.1);
  halo.addColorStop(0, withAlpha(col, 0.45 + f.pop * 0.4));
  halo.addColorStop(1, withAlpha(col, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.1, 0, Math.PI * 2);
  ctx.fill();

  // fruit body
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.25, lighten(col));
  g.addColorStop(1, col);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // little leaf stem
  ctx.fillStyle = mix("#2f8f3a", "#5a68b0", modeVis);
  ctx.beginPath();
  ctx.ellipse(x + r * 0.4, y - r * 0.95, r * 0.28, r * 0.14, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

function withAlpha(rgb: string, a: number): string {
  const m = rgb.match(/\d+/g);
  if (!m) return rgb;
  return `rgba(${m[0]},${m[1]},${m[2]},${a})`;
}

function lighten(rgb: string): string {
  const m = rgb.match(/\d+/g);
  if (!m) return rgb;
  const r = Math.min(255, parseInt(m[0]) + 60);
  const g = Math.min(255, parseInt(m[1]) + 60);
  const b = Math.min(255, parseInt(m[2]) + 60);
  return `rgb(${r},${g},${b})`;
}
