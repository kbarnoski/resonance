"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  makeGamelanAudio,
  larasCents,
  centsToRatio,
  ROOT_HZ,
  type GamelanAudio,
  type Laras,
} from "./synth";
import { makeGlRenderer, type GlRenderer, type KeyView } from "./gl";

// Each bronze key tracks its laras pitch, live bend, spring-back, and glow.
interface KeyState {
  cents: number; // laras pitch for current tuning
  baseHz: number;
  bend: number; // live bend in cents (drag), springs back to 0
  targetBend: number; // where the finger is dragging it
  glow: number; // strike glow, decays
  pointerId: number | null;
}

const KEY_COUNT = 5;
const BEND_RANGE = 300; // +-cents over a full key-height drag

export default function GamelanBendPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const audioRef = useRef<GamelanAudio | null>(null);
  const glRef = useRef<GlRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const keysRef = useRef<KeyState[]>([]);
  const larasRef = useRef<Laras>("slendro");
  const unlockedRef = useRef(false);
  const demoRef = useRef({ next: 0, idx: 0 });

  const [laras, setLaras] = useState<Laras>("slendro");
  const [unlocked, setUnlocked] = useState(false);
  const [fallback, setFallback] = useState(false);

  // Build key states for a tuning.
  const applyLaras = useCallback((next: Laras) => {
    const cents = larasCents(next);
    const arr = keysRef.current;
    for (let i = 0; i < KEY_COUNT; i++) {
      const c = cents[i];
      if (!arr[i]) {
        arr[i] = {
          cents: c,
          baseHz: ROOT_HZ * centsToRatio(c),
          bend: 0,
          targetBend: 0,
          glow: 0,
          pointerId: null,
        };
      } else {
        arr[i].cents = c;
        arr[i].baseHz = ROOT_HZ * centsToRatio(c);
      }
    }
    larasRef.current = next;
  }, []);

  // First-gesture audio unlock (iOS-safe).
  const unlock = useCallback(async () => {
    if (unlockedRef.current) return;
    if (!audioRef.current) audioRef.current = makeGamelanAudio();
    await audioRef.current.resume();
    audioRef.current.setDroneFreq(
      ROOT_HZ,
      audioRef.current.ctx.currentTime,
      larasRef.current,
    );
    unlockedRef.current = true;
    setUnlocked(true);
  }, []);

  const strikeKey = useCallback((i: number, velocity = 0.7) => {
    const k = keysRef.current[i];
    if (!k) return;
    k.glow = 1;
    if (audioRef.current && unlockedRef.current) {
      audioRef.current.strike(k.baseHz, k.bend, velocity);
    }
  }, []);

  const toggleLaras = useCallback(() => {
    void unlock();
    const next: Laras = larasRef.current === "slendro" ? "pelog" : "slendro";
    applyLaras(next);
    setLaras(next);
    // re-tune the drone audibly with the laras flip
    if (audioRef.current) {
      audioRef.current.setDroneFreq(
        ROOT_HZ,
        audioRef.current.ctx.currentTime,
        next,
      );
      // gentle shimmer sweep so the mass re-tune is felt, not just heard
      if (unlockedRef.current) {
        keysRef.current.forEach((_, i) =>
          setTimeout(() => strikeKey(i, 0.5), i * 90),
        );
      }
    }
  }, [applyLaras, strikeKey, unlock]);

  // Map a pointer Y within a key cell to a bend in cents.
  const pointerToBend = (clientY: number, cellTop: number, cellH: number) => {
    const rel = (clientY - cellTop) / cellH; // 0 top .. 1 bottom
    // top = sharper(+), bottom = flatter(-)
    return (0.5 - rel) * 2 * BEND_RANGE;
  };

  useEffect(() => {
    applyLaras("slendro");
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;

    const gl = makeGlRenderer(canvas);
    glRef.current = gl;
    if (!gl) setFallback(true);
    const ctx2d = gl ? null : canvas.getContext("2d");

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.floor(r.width * dpr);
      h = Math.floor(r.height * dpr);
      if (gl) gl.resize(w, h);
      else {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Layout of keys in normalized [0..1] space (matches both renderers).
    const keyLayout = (i: number) => {
      const margin = 0.06;
      const gap = 0.02;
      const cellW = (1 - margin * 2 - gap * (KEY_COUNT - 1)) / KEY_COUNT;
      const cx = margin + cellW * (i + 0.5) + gap * i;
      // taller bars toward the left (lower notes) for a metallophone look
      const hh = 0.26 - i * 0.012;
      return { cx, cyBase: 0.52, hw: cellW * 0.42, hh };
    };

    const drawFallback = (t: number) => {
      const c = ctx2d!;
      c.fillStyle = "#0a0807";
      c.fillRect(0, 0, w, h);
      // shimmer ground
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#100a04");
      g.addColorStop(1, "#06100f");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      keysRef.current.forEach((k, i) => {
        const L = keyLayout(i);
        const px = L.cx * w;
        const bendPx = -(k.bend / BEND_RANGE) * 0.16 * h;
        const py = L.cyBase * h + bendPx;
        const bw = L.hw * 2 * w;
        const bh = L.hh * 2 * h;
        const tune = 1 - Math.min(1, Math.abs(k.bend) / BEND_RANGE);
        c.save();
        c.shadowBlur = 30 + k.glow * 60;
        c.shadowColor = `rgba(255,${170 + tune * 50},80,${0.4 + k.glow * 0.5})`;
        const grad = c.createLinearGradient(0, py - bh / 2, 0, py + bh / 2);
        grad.addColorStop(0, "#9c6c28");
        grad.addColorStop(0.5, `rgba(${158 + tune * 40},110,40,1)`);
        grad.addColorStop(1, "#5c3c14");
        c.fillStyle = grad;
        const x = px - bw / 2;
        const y = py - bh / 2;
        const r = Math.min(bw, bh) * 0.18;
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + bw, y, x + bw, y + bh, r);
        c.arcTo(x + bw, y + bh, x, y + bh, r);
        c.arcTo(x, y + bh, x, y, r);
        c.arcTo(x, y, x + bw, y, r);
        c.fill();
        c.restore();
        void t;
      });
    };

    const tick = (ms: number) => {
      const t = ms / 1000;
      const arr = keysRef.current;

      // physics: spring bend back toward target/0, decay glow
      for (let i = 0; i < arr.length; i++) {
        const k = arr[i];
        if (k.pointerId !== null) {
          k.bend += (k.targetBend - k.bend) * 0.5; // follow finger snappily
        } else {
          k.bend += (0 - k.bend) * 0.045; // slow spring back to laras
          if (Math.abs(k.bend) < 0.05) k.bend = 0;
        }
        k.glow *= 0.94;
      }

      // auto-demo: gentle scripted shimmer-strikes once unlocked, only when
      // nothing is being touched, so a silent glance still feels alive.
      const anyTouch = arr.some((k) => k.pointerId !== null);
      const dm = demoRef.current;
      if (unlockedRef.current && !anyTouch) {
        if (t > dm.next) {
          strikeKey(dm.idx % KEY_COUNT, 0.4);
          dm.idx++;
          dm.next = t + 1.6 + Math.random() * 1.4;
        }
      } else if (!unlockedRef.current) {
        // before audio: keep glow flickering so visuals move
        if (t > dm.next) {
          arr[dm.idx % KEY_COUNT].glow = Math.max(
            arr[dm.idx % KEY_COUNT].glow,
            0.5,
          );
          dm.idx++;
          dm.next = t + 0.9;
        }
      }

      if (gl) {
        const views: KeyView[] = arr.map((k, i) => {
          const L = keyLayout(i);
          const bendNorm = (k.bend / BEND_RANGE) * 0.16; // visual lift
          const tune = 1 - Math.min(1, Math.abs(k.bend) / BEND_RANGE);
          return {
            cx: L.cx,
            cy: 1 - L.cyBase + bendNorm, // GL y is bottom-up
            hw: L.hw,
            hh: L.hh,
            bend: bendNorm,
            glow: k.glow,
            tune,
          };
        });
        gl.render(views, t, larasRef.current === "pelog" ? 1 : 0, w, h);
      } else {
        drawFallback(t);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // ---- pointer handling on the wrap element ----
    const hitKey = (clientX: number, rect: DOMRect) => {
      const nx = (clientX - rect.left) / rect.width;
      for (let i = 0; i < KEY_COUNT; i++) {
        const L = keyLayout(i);
        if (Math.abs(nx - L.cx) <= L.hw + 0.012) return i;
      }
      return -1;
    };

    const onDown = (e: PointerEvent) => {
      void unlock();
      const rect = wrap.getBoundingClientRect();
      const i = hitKey(e.clientX, rect);
      if (i < 0) return;
      const k = keysRef.current[i];
      k.pointerId = e.pointerId;
      const L = keyLayout(i);
      const cellTop = rect.top + (L.cyBase - 0.28) * rect.height;
      const cellH = 0.56 * rect.height;
      k.targetBend = pointerToBend(e.clientY, cellTop, cellH);
      k.bend = k.targetBend; // start bent where grabbed (usually ~0)
      strikeKey(i, 0.85);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      for (let i = 0; i < KEY_COUNT; i++) {
        const k = keysRef.current[i];
        if (k.pointerId === e.pointerId) {
          const L = keyLayout(i);
          const cellTop = rect.top + (L.cyBase - 0.28) * rect.height;
          const cellH = 0.56 * rect.height;
          k.targetBend = Math.max(
            -BEND_RANGE,
            Math.min(BEND_RANGE, pointerToBend(e.clientY, cellTop, cellH)),
          );
        }
      }
    };
    const onUp = (e: PointerEvent) => {
      for (let i = 0; i < KEY_COUNT; i++) {
        const k = keysRef.current[i];
        if (k.pointerId === e.pointerId) {
          k.pointerId = null;
          k.targetBend = 0; // spring back toward laras pitch
          // re-strike softly at the released pitch so the "settle" is audible
          strikeKey(i, 0.35);
        }
      }
    };

    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      glRef.current?.dispose();
      glRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [applyLaras, strikeKey, unlock]);

  return (
    <main className="min-h-screen w-full bg-[#070504] text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Bronze Bend
          </h1>
          <p className="font-mono text-sm text-white/75">
            grab a bar · slide up &amp; down · bend it back into tune
          </p>
        </header>

        {/* The instrument: WebGL2 bronze field (Canvas2D fallback) */}
        <div
          ref={wrapRef}
          className="relative aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-2xl border border-amber-900/40 bg-black"
          style={{ touchAction: "none" }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full"
          />
          {!unlocked && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <span className="rounded-full bg-black/50 px-4 py-2 font-mono text-base text-white/95 backdrop-blur">
                touch a glowing bar to wake the bronze
              </span>
            </div>
          )}
        </div>

        {/* The big LARAS toggle (kids tap target, icon + colour, not just a word) */}
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={toggleLaras}
            aria-label={`Switch tuning, currently ${laras}`}
            className={`flex min-h-[96px] min-w-[200px] items-center justify-center gap-3 rounded-3xl px-8 py-5 text-2xl font-bold shadow-lg transition-transform active:scale-95 ${
              laras === "slendro"
                ? "bg-gradient-to-br from-amber-500 to-amber-700 text-black"
                : "bg-gradient-to-br from-teal-400 to-cyan-700 text-black"
            }`}
          >
            <span aria-hidden className="text-4xl">
              {laras === "slendro" ? "☀" : "🌙"}
            </span>
            <span className="capitalize">{laras}</span>
          </button>
        </div>

        <p className="text-center text-base text-white/75">
          Tap the big sun/moon to re-tune the whole instrument.{" "}
          <span className="text-amber-300">Slendro</span> sounds open and
          floating; <span className="text-teal-300">pélog</span> sounds tense,
          with a close half-step.
        </p>

        {fallback && (
          <p className="text-center text-base text-rose-300">
            WebGL2 unavailable — running the Canvas2D fallback. It still
            shimmers and sings.
          </p>
        )}

        <footer className="mt-2 text-center font-mono text-sm text-white/75">
          design notes:{" "}
          <span className="text-white/95">
            src/app/dream/662-kids-gamelan-bend/README.md
          </span>
        </footer>
      </div>
    </main>
  );
}
