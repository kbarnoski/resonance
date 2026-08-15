"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 13216-resonantrooms — EIGHT SONGS AS EIGHT ROOMS IN ONE BUILDING.
//
//   A blueprint floor-plan of eight connected rooms, each named for the ONE
//   song it plays — five from the Welcome Home album, all three from the
//   Snowflake EP — each with its own convolution-reverb character (close
//   bedroom → long stone hall) cast to fit its song. Walk the listener between
//   rooms by dragging or WASD. Inside a room, its recording loops through that
//   room's reverb; standing in a DOORWAY you hear both adjacent rooms at once,
//   equal-power-crossfaded by your position across the threshold — so the
//   building's acoustics tell you where you are.
//
//   Muted-06:30 stand-in: from mount, a seeded auto-tour glides the listener
//   room→doorway→room so the plan is visibly alive within ~1s with zero audio.
//   "Enter the building" starts the AudioContext and hands control to you.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { README } from "./readme-text";
import {
  ROOMS,
  DOORWAYS,
  WORLD,
  RoomEngine,
  computeRoomGains,
  tourPosition,
  doorwayPoint,
  roomCenter,
  clamp,
  clamp01,
  mulberry32,
} from "./building";

// Blueprint palette (canvas art only — never Tailwind chrome).
const INK = "#0a0713";
const WALL = "#7c74a8";
const WALL_HOT = "#c4b5fd";
const GRID = "#1c1633";
const LABEL = "#8a83b8";
const PRESENCE = "#a78bfa";

const ringRnd = mulberry32(0x13216);
const RING_PHASE = ROOMS.map(() => ringRnd() * Math.PI * 2);

interface Live {
  x: number;
  y: number;
  gains: number[];
  bleed: number;
}

export default function ResonantRoomsPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);
  const t0Ref = useRef<number>(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const engineRef = useRef<RoomEngine | null>(null);

  const startedRef = useRef(false);
  const draggingRef = useRef(false);
  const keysRef = useRef<Set<string>>(new Set());
  const posRef = useRef({ x: 155, y: 140 });
  const liveRef = useRef<Live>({ x: 155, y: 140, gains: ROOMS.map(() => 0), bleed: 0 });
  const viewRef = useRef({ scale: 1, ox: 0, oy: 0 });

  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [hud, setHud] = useState<{ here: string; also: string | null; unreachable: number[] }>({
    here: ROOMS[0].name,
    also: null,
    unreachable: [],
  });

  // ── pointer → world -------------------------------------------------------
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    const { scale, ox, oy } = viewRef.current;
    const wx = (clientX - rect.left - ox) / scale;
    const wy = (clientY - rect.top - oy) / scale;
    return {
      x: clamp(wx, WORLD.x0 + 8, WORLD.x1 - 8),
      y: clamp(wy, WORLD.y0 + 8, WORLD.y1 - 8),
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!startedRef.current) return;
      draggingRef.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const w = toWorld(e.clientX, e.clientY);
      if (w) posRef.current = w;
    },
    [toWorld],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current || !startedRef.current) return;
      const w = toWorld(e.clientX, e.clientY);
      if (w) posRef.current = w;
    },
    [toWorld],
  );
  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // ── keyboard (WASD) -------------------------------------------------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        keysRef.current.add(k);
        if (startedRef.current) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ── main loop -------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    let W = 0;
    let H = 0;
    let dpr = 1;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width;
      H = r.height;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      const pw = WORLD.x1 - WORLD.x0;
      const ph = WORLD.y1 - WORLD.y0;
      const scale = Math.min((W - 48) / pw, (H - 48) / ph);
      viewRef.current = {
        scale,
        ox: (W - pw * scale) / 2 - WORLD.x0 * scale,
        oy: (H - ph * scale) / 2 - WORLD.y0 * scale,
      };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    t0Ref.current = performance.now();
    let last = t0Ref.current;
    let hudTick = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0Ref.current) / 1000;

      // position: auto-tour before start; pointer/WASD after
      if (!startedRef.current) {
        posRef.current = tourPosition(t);
      } else {
        const keys = keysRef.current;
        const sp = 260 * dt;
        let { x, y } = posRef.current;
        if (keys.has("w") || keys.has("arrowup")) y -= sp;
        if (keys.has("s") || keys.has("arrowdown")) y += sp;
        if (keys.has("a") || keys.has("arrowleft")) x -= sp;
        if (keys.has("d") || keys.has("arrowright")) x += sp;
        posRef.current = {
          x: clamp(x, WORLD.x0 + 8, WORLD.x1 - 8),
          y: clamp(y, WORLD.y0 + 8, WORLD.y1 - 8),
        };
      }

      const { x, y } = posRef.current;
      const rg = computeRoomGains(x, y);
      liveRef.current = { x, y, gains: rg.gains, bleed: rg.bleed };

      const engine = engineRef.current;
      if (engine) {
        engine.moveListener(x, y);
        engine.apply(rg.gains);
      }

      draw(ctx2d, W, H, dpr, t, liveRef.current, engine);

      // throttle HUD state updates (~6/s) to keep the hot loop lean
      hudTick += dt;
      if (hudTick > 0.16) {
        hudTick = 0;
        const active = rg.gains
          .map((g, i) => ({ g, i }))
          .filter((o) => o.g > 0.02)
          .sort((a, b) => b.g - a.g);
        const here = active[0] ? ROOMS[active[0].i].name : ROOMS[rg.base].name;
        const also = active[1] ? ROOMS[active[1].i].name : null;
        const un = engine ? Array.from(engine.unreachable).sort() : [];
        setHud((prev) =>
          prev.here === here && prev.also === also && prev.unreachable.length === un.length
            ? prev
            : { here, also, unreachable: un },
        );
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── drawing ---------------------------------------------------------------
  const draw = (
    g: CanvasRenderingContext2D,
    W: number,
    H: number,
    dpr: number,
    t: number,
    live: Live,
    engine: RoomEngine | null,
  ) => {
    const { scale, ox, oy } = viewRef.current;
    g.save();
    g.scale(dpr, dpr);

    // ground
    g.fillStyle = INK;
    g.fillRect(0, 0, W, H);

    // faint drafting grid
    g.save();
    g.translate(ox, oy);
    g.scale(scale, scale);
    g.strokeStyle = GRID;
    g.lineWidth = 1 / scale;
    for (let gx = WORLD.x0; gx <= WORLD.x1; gx += 40) {
      g.beginPath();
      g.moveTo(gx, WORLD.y0);
      g.lineTo(gx, WORLD.y1);
      g.stroke();
    }
    for (let gy = WORLD.y0; gy <= WORLD.y1; gy += 40) {
      g.beginPath();
      g.moveTo(WORLD.x0, gy);
      g.lineTo(WORLD.x1, gy);
      g.stroke();
    }
    g.restore();

    const W2S = (wx: number, wy: number) => ({ x: ox + wx * scale, y: oy + wy * scale });

    // room fills tinted by how much they're sounding + reverb-tail rings
    for (const r of ROOMS) {
      const gain = live.gains[r.index];
      const p0 = W2S(r.x0, r.y0);
      const p1 = W2S(r.x1, r.y1);
      const rw = p1.x - p0.x;
      const rh = p1.y - p0.y;

      // interior wash — brighter when sounding
      g.fillStyle = `rgba(139,92,246,${0.03 + gain * 0.14})`;
      g.fillRect(p0.x, p0.y, rw, rh);

      // reverb-tail rings: spread encodes decay length (seconds); intensity = gain
      const c = roomCenter(r);
      const cs = W2S(c.x, c.y);
      const spread = (r.seconds / 5.2) * Math.min(rw, rh) * 0.62;
      const rings = 4;
      for (let k = 0; k < rings; k++) {
        const phase = (t * (0.16 + r.decay * 0.02) + RING_PHASE[r.index] + k / rings) % 1;
        const rad = 6 + phase * spread;
        const fade = (1 - phase) * (0.06 + gain * 0.5);
        g.beginPath();
        g.arc(cs.x, cs.y, rad, 0, Math.PI * 2);
        g.strokeStyle = `rgba(139,92,246,${fade})`;
        g.lineWidth = 1.2;
        g.stroke();
      }
    }

    // walls (drawn as segments that leave doorway gaps)
    drawWalls(g, W2S, scale, live);

    // presence pool around the listener
    const lp = W2S(live.x, live.y);
    const pr = 46 + live.bleed * 26;
    const grad = g.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, pr);
    grad.addColorStop(0, "rgba(167,139,250,0.42)");
    grad.addColorStop(0.5, "rgba(139,92,246,0.16)");
    grad.addColorStop(1, "rgba(139,92,246,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(lp.x, lp.y, pr, 0, Math.PI * 2);
    g.fill();

    // listener marker
    g.fillStyle = PRESENCE;
    g.beginPath();
    g.arc(lp.x, lp.y, 5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(237,233,254,0.9)";
    g.lineWidth = 1.5;
    g.stroke();

    // room labels
    for (const r of ROOMS) {
      const c = roomCenter(r);
      const cs = W2S(c.x, c.y);
      const p0 = W2S(r.x0, r.y0);
      const gain = live.gains[r.index];
      const unreachable = engine?.unreachable.has(r.index);
      g.textAlign = "center";
      g.fillStyle = gain > 0.02 ? WALL_HOT : LABEL;
      g.font = "600 13px ui-monospace, monospace";
      g.fillText(r.name.toUpperCase(), cs.x, p0.y + 20);
      g.fillStyle = LABEL;
      g.font = "10px ui-monospace, monospace";
      g.fillText(`${r.seconds.toFixed(1)}s · ${r.character}`, cs.x, p0.y + 36);
      if (unreachable) {
        g.fillStyle = "#f0637a";
        g.font = "10px ui-monospace, monospace";
        g.fillText("unreachable", cs.x, p0.y + 52);
      }
    }

    g.restore();
  };

  const drawWalls = (
    g: CanvasRenderingContext2D,
    W2S: (x: number, y: number) => { x: number; y: number },
    scale: number,
    live: Live,
  ) => {
    // draw each room outline, then punch doorway openings back out with the ink.
    for (const r of ROOMS) {
      const p0 = W2S(r.x0, r.y0);
      const p1 = W2S(r.x1, r.y1);
      const hot = Math.max(live.gains[r.index], 0);
      g.strokeStyle = hot > 0.02 ? WALL_HOT : WALL;
      g.lineWidth = 1.6 + hot * 1.2;
      g.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    }
    // openings: overpaint each doorway with ink + draw jamb ticks
    for (const d of DOORWAYS) {
      const p = doorwayPoint(d);
      if (d.axis === "v") {
        const a = W2S(d.at, d.door - d.span / 2);
        const b = W2S(d.at, d.door + d.span / 2);
        g.strokeStyle = INK;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      } else {
        const a = W2S(d.door - d.span / 2, d.at);
        const b = W2S(d.door + d.span / 2, d.at);
        g.strokeStyle = INK;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
      // threshold glow when the listener is bleeding through THIS opening
      const dist = Math.hypot(live.x - p.x, live.y - p.y);
      if (dist < 120 && live.bleed > 0.02) {
        const cs = W2S(p.x, p.y);
        const glow = clamp01(1 - dist / 120) * live.bleed;
        g.fillStyle = `rgba(196,181,253,${0.5 * glow})`;
        g.beginPath();
        g.arc(cs.x, cs.y, 4 + 4 * glow, 0, Math.PI * 2);
        g.fill();
      }
    }
  };

  // ── enter the building ----------------------------------------------------
  const onEnter = useCallback(async () => {
    if (startedRef.current) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      if (ctx.state === "suspended") await ctx.resume();
      const master = createSafeMaster(ctx);
      ctxRef.current = ctx;
      masterRef.current = master;
      engineRef.current = new RoomEngine(ctx, master);
      // hand control over at the tour's current spot so the walk is continuous
      startedRef.current = true;
      setStarted(true);
    } catch {
      setAudioError("Audio could not start on this device — the blueprint walk continues silently.");
    }
  }, []);

  // teardown on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      masterRef.current?.disconnect();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  const label = "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <div className="relative min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-5 pt-10 pb-4">
        <p className={label}>Dream 13216 · Resonant Rooms</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Eight songs, eight rooms, one building
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Every room is one song — five from Welcome Home, the full Snowflake EP — looping through
          its own reverb. Stand in a doorway and both rooms sound at once — equal-power-crossfaded
          by your position across the threshold, so the acoustics tell you where you are.
          Headphones recommended.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!started ? (
            <button
              type="button"
              onClick={onEnter}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Enter the building
            </button>
          ) : (
            <span className={`${label} text-foreground`}>
              In: {hud.here}
              {hud.also ? ` + ${hud.also} (doorway)` : ""}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
          {started ? (
            <span className={label}>drag or WASD to walk</span>
          ) : (
            <span className={label}>auto-tour running · muted</span>
          )}
        </div>

        {audioError ? <p className="mt-3 text-sm text-destructive">{audioError}</p> : null}
        {hud.unreachable.length > 0 ? (
          <p className="mt-2 text-sm text-destructive">
            Unreachable audio: {hud.unreachable.map((i) => ROOMS[i as number].name).join(", ")} — the
            walk continues.
          </p>
        ) : null}
      </div>

      <div
        ref={wrapRef}
        className="relative mx-auto h-[62vh] max-w-5xl px-0"
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-crosshair rounded-md border border-border"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>

      {showNotes ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className={label}>Design notes</p>
            <div className="mt-3 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
              {README}
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      <PrototypeNav slugs={["13216-resonantrooms"]} />
    </div>
  );
}
