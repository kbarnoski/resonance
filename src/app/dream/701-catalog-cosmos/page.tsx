"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 701-catalog-cosmos — Karel's whole catalog as a slow cosmos you can wander.
//
// Every one of his real recordings is a glowing body. Each collection (Welcome
// Home · Snowflake · 17th St · Folsom St · Sketches) is its own orbit, drifting
// at its own pace. Hover a body to read its title; click to let that piece play
// — it swells to a small sun and pulses with its own tamed audio, everything
// else dims to a hush. Nothing is abrupt; the field just keeps breathing.
//
// This is the hub for exploring the music: from here every track is one click
// from sound. Audio → createSafeMaster (ear-safety bus) → speakers.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

interface Body {
  id: string;
  title: string;
  collection: string;
  orbit: number; // ring index
  angle: number; // current angle
  speed: number; // rad/sec
  hue: number;
  x: number; // last screen pos
  y: number;
  r: number; // last screen radius
}

// warm-anchored base hue per collection
const COLLECTION_HUE: Record<string, number> = {
  "Welcome Home": 34,
  Snowflake: 200,
  "17th St": 280,
  "Folsom St": 150,
  Sketches: 12,
};

function buildBodies(): Body[] {
  const out: Body[] = [];
  COLLECTIONS.forEach((c, oi) => {
    const n = c.tracks.length;
    const baseHue = COLLECTION_HUE[c.name] ?? 40;
    c.tracks.forEach((t, i) => {
      out.push({
        id: t.id,
        title: t.title,
        collection: c.name,
        orbit: oi,
        angle: (i / n) * Math.PI * 2 + oi * 0.6,
        speed: (0.018 + oi * 0.004) * (oi % 2 === 0 ? 1 : -1),
        hue: baseHue + (i / n) * 26 - 13,
        x: 0,
        y: 0,
        r: 0,
      });
    });
  });
  return out;
}

export default function CatalogCosmosPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bodiesRef = useRef<Body[]>(buildBodies());
  const pointerRef = useRef({ x: -1, y: -1 });
  const rafRef = useRef(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);

  const [nowPlaying, setNowPlaying] = useState<{ id: string; title: string; collection: string } | null>(null);
  const [hovered, setHovered] = useState<Body | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const playingIdRef = useRef<string | null>(null);
  const hoveredIdRef = useRef<string | null>(null);

  const stopSource = useCallback(() => {
    const s = srcRef.current;
    if (s) {
      try { s.onended = null; s.stop(); } catch { /* stopped */ }
      srcRef.current = null;
    }
  }, []);

  const play = useCallback(async (b: Body) => {
    stopSource();
    setLoadingId(b.id);
    let ctx = ctxRef.current;
    if (!ctx) {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
      ctxRef.current = ctx;
      safeRef.current = createSafeMaster(ctx);
    }
    await ctx.resume().catch(() => {});
    try {
      const { buffer } = await loadRealTrackBuffer(ctx, b.id);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(safeRef.current!.input);
      src.onended = () => {
        if (srcRef.current === src) {
          srcRef.current = null;
          playingIdRef.current = null;
          setNowPlaying(null);
        }
      };
      srcRef.current = src;
      playingIdRef.current = b.id;
      src.start();
      setNowPlaying({ id: b.id, title: b.title, collection: b.collection });
    } catch {
      /* leave silent on failure */
    } finally {
      setLoadingId((cur) => (cur === b.id ? null : cur));
    }
  }, [stopSource]);

  useEffect(() => {
    return () => {
      stopSource();
      cancelAnimationFrame(rafRef.current);
      safeRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, [stopSource]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const freq = new Uint8Array(512);
    let last = performance.now();

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const unit = Math.min(W, H);

      g.fillStyle = "rgba(5, 6, 11, 0.28)";
      g.fillRect(0, 0, W, H);

      // audio energy of the playing track
      let energy = 0;
      const analyser = safeRef.current?.analyser;
      if (playingIdRef.current && analyser) {
        analyser.getByteFrequencyData(freq);
        let s = 0;
        for (let i = 0; i < 96; i++) s += freq[i];
        energy = s / (96 * 255);
      }

      const orbits = COLLECTIONS.length;
      const bodies = bodiesRef.current;
      const px = pointerRef.current.x * dpr;
      const py = pointerRef.current.y * dpr;
      let nearest: Body | null = null;
      let nearestD = Infinity;

      // faint orbit rings
      for (let o = 0; o < orbits; o++) {
        const rad = unit * (0.12 + (o / orbits) * 0.34);
        g.strokeStyle = "rgba(255,255,255,0.04)";
        g.lineWidth = dpr;
        g.beginPath();
        g.arc(cx, cy, rad, 0, Math.PI * 2);
        g.stroke();
      }

      for (const b of bodies) {
        b.angle += b.speed * dt;
        const rad = unit * (0.12 + (b.orbit / orbits) * 0.34);
        const bx = cx + Math.cos(b.angle) * rad;
        const by = cy + Math.sin(b.angle) * rad * 0.62; // slight ellipse
        b.x = bx;
        b.y = by;

        const isPlaying = playingIdRef.current === b.id;
        const pulse = isPlaying ? 1 + energy * 1.4 : 1;
        const baseR = unit * (isPlaying ? 0.018 : 0.008) * pulse;
        b.r = baseR;

        const dx = bx - px;
        const dy = by - py;
        const d = Math.hypot(dx, dy);
        if (d < nearestD) { nearestD = d; nearest = b; }
        const isHover = d < unit * 0.03;

        const dim = playingIdRef.current && !isPlaying ? 0.4 : 1;
        const light = (isPlaying ? 68 : 52) + (isHover ? 12 : 0);
        const alpha = (isPlaying ? 0.95 : isHover ? 0.9 : 0.6) * dim;

        // glow
        const glow = g.createRadialGradient(bx, by, 0, bx, by, baseR * (isPlaying ? 6 : 3.5));
        glow.addColorStop(0, `hsla(${b.hue}, 78%, ${light}%, ${alpha})`);
        glow.addColorStop(1, `hsla(${b.hue}, 78%, ${light}%, 0)`);
        g.fillStyle = glow;
        g.beginPath();
        g.arc(bx, by, baseR * (isPlaying ? 6 : 3.5), 0, Math.PI * 2);
        g.fill();

        // core
        g.fillStyle = `hsla(${b.hue}, 85%, ${light + 14}%, ${alpha})`;
        g.beginPath();
        g.arc(bx, by, baseR, 0, Math.PI * 2);
        g.fill();
      }

      // hover state (throttled by comparing id)
      if (nearest && nearestD < unit * 0.03) {
        if (hoveredIdRef.current !== nearest.id) {
          hoveredIdRef.current = nearest.id;
          setHovered(nearest);
        }
      } else if (hoveredIdRef.current !== null) {
        hoveredIdRef.current = null;
        setHovered(null);
      }

      // center sun when playing
      if (playingIdRef.current) {
        const sunR = unit * 0.05 * (1 + energy * 0.6);
        const sg = g.createRadialGradient(cx, cy, 0, cx, cy, sunR * 2.4);
        sg.addColorStop(0, `rgba(255, 226, 180, ${0.28 + energy * 0.4})`);
        sg.addColorStop(1, "rgba(255, 226, 180, 0)");
        g.fillStyle = sg;
        g.beginPath();
        g.arc(cx, cy, sunR * 2.4, 0, Math.PI * 2);
        g.fill();
      }
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const onMove = useCallback((e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onClick = useCallback(() => {
    const h = hovered;
    if (h) void play(h);
  }, [hovered, play]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#05060b] text-neutral-200">
      <canvas
        ref={canvasRef}
        onPointerMove={onMove}
        onPointerLeave={() => { pointerRef.current = { x: -1, y: -1 }; }}
        onClick={onClick}
        className={`absolute inset-0 h-full w-full ${hovered ? "cursor-pointer" : "cursor-default"}`}
      />

      {/* title / instruction */}
      <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500">
          the catalog · Karel Barnoski
        </div>
        {nowPlaying ? (
          <div className="mt-1 text-sm font-light tracking-wide text-amber-100">
            {nowPlaying.title}
            <span className="ml-2 text-[11px] text-amber-200/40">{nowPlaying.collection}</span>
          </div>
        ) : (
          <div className="mt-1 text-xs text-neutral-500">
            hover a light · click to let it sound
          </div>
        )}
      </div>

      {/* hovered label near cursor */}
      {hovered && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[12px] text-neutral-200 backdrop-blur-sm">
          {loadingId === hovered.id ? "loading… " : ""}
          <span className="text-amber-100">{hovered.title}</span>
          <span className="ml-2 text-neutral-500">{hovered.collection}</span>
        </div>
      )}
    </main>
  );
}
