"use client";

/**
 * 325 · Kids Paper Boat — a long-form, remembered musical voyage.
 *
 * A glowing paper boat drifts down a gently auto-scrolling night river
 * (parallax: stars · far hills · near reeds) through dusk → deep night →
 * dawn. The child DRAGS the boat across the river's width; its lateral
 * lane chooses the chord voicing and which singing lily-pad "gates" it
 * passes through (each lane = a different register/timbre, all quantized
 * to the current mode so nothing is ever wrong). The music evolves through
 * a real harmonic arc, so minute 6 sounds genuinely different from minute 1.
 * The path is remembered; at the river's mouth the voyage sings itself back.
 * Progress + path persist to localStorage (wall-clock), so reopening resumes.
 *
 * Renderer: inline SVG with parallax layers (no Canvas2D / three.js / WebGL).
 * Audio: Web Audio API (see audio.ts). Zero dependencies.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ACTS, createBoatAudio, type BoatAudio } from "./audio";
import {
  actAtProgress,
  clearState,
  darknessAtProgress,
  freshState,
  hueAtProgress,
  loadState,
  progress as progressOf,
  saveState,
  VOYAGE_MS,
  type MemoryNote,
  type VoyageState,
} from "./voyage";

// ── Layout constants (SVG viewBox is 1000 × 600, scaled responsively) ───────
const VB_W = 1000;
const VB_H = 600;
const RIVER_TOP = 230; // y where the water begins
const RIVER_BOTTOM = 560; // y of the near bank
const LANE_COUNT = 4; // four singing lanes across the river
const BOAT_R = 42; // big drag handle (≥64px on screen at most sizes)
const SCROLL_PX_PER_SEC = 46; // forward voyage motion

// A floating gate (lily-pad / lantern) the boat can chime by passing through.
interface Gate {
  id: number;
  x: number; // world-x (scrolls left)
  lane: number; // 0..LANE_COUNT-1 (vertical band of the river)
  chimed: boolean;
  glow: number; // 0..1 visual pulse after chiming
}

let _gid = 1;

function laneY(lane: number): number {
  const usable = RIVER_BOTTOM - RIVER_TOP;
  const step = usable / (LANE_COUNT + 1);
  return RIVER_TOP + step * (lane + 1);
}

export default function PaperBoatVoyage() {
  const [started, setStarted] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState(ACTS[0].label);
  const [arrived, setArrived] = useState(false);

  // refs for the rAF loop (no React re-render per frame)
  const svgRef = useRef<SVGSVGElement | null>(null);
  const audioRef = useRef<BoatAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<VoyageState>(freshState());
  const lastTickRef = useRef<number>(0);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // boat position in viewBox coords; x is fixed-ish, child drags within river
  const boatRef = useRef({ x: VB_W * 0.32, y: laneY(1), targetX: VB_W * 0.32, targetY: laneY(1) });
  const draggingRef = useRef(false);
  const gatesRef = useRef<Gate[]>([]);
  const worldScrollRef = useRef(0); // total px scrolled
  const lastActRef = useRef(-1);
  const nextGateXRef = useRef(0);

  // element refs we mutate each frame
  const els = useRef<{
    skyTop?: SVGStopElement;
    skyBot?: SVGStopElement;
    starsG?: SVGGElement;
    hillsG?: SVGGElement;
    reedsG?: SVGGElement;
    gatesG?: SVGGElement;
    boatG?: SVGGElement;
    riverFill?: SVGRectElement;
    progFill?: SVGRectElement;
  }>({});

  // detect saved voyage on mount
  useEffect(() => {
    const saved = loadState();
    if (saved && saved.elapsedMs > 1500 && !saved.finished) setHasSaved(true);
  }, []);

  // ── spawn gates ahead of the boat ──────────────────────────────────────
  const spawnGatesIfNeeded = useCallback(() => {
    const scroll = worldScrollRef.current;
    // keep gates roughly every 230px of world; create until ~1400px ahead
    const ahead = scroll + VB_W + 400;
    while (nextGateXRef.current < ahead) {
      const lane = Math.floor(Math.random() * LANE_COUNT);
      gatesRef.current.push({
        id: _gid++,
        x: nextGateXRef.current,
        lane,
        chimed: false,
        glow: 0,
      });
      nextGateXRef.current += 200 + Math.random() * 90;
    }
    // drop gates well behind
    gatesRef.current = gatesRef.current.filter((g: Gate) => g.x - scroll > -120);
  }, []);

  // ── the closing replay: sing the remembered path back ──────────────────
  const playReplay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const path = stateRef.current.path;
    audio.toLullaby();
    if (path.length === 0) {
      // never passed a gate — sing the home chord softly instead
      const home = ACTS[ACTS.length - 1];
      home.chord.forEach((tone, i) => {
        audio.playMemory(home.rootMidi + tone + 12, i * 0.5, 2.2, 0.1);
      });
      return;
    }
    // take the last ~24 remembered notes, sing them as a gentle melody
    const notes = path.slice(-24);
    const spacing = 0.42;
    notes.forEach((m: MemoryNote, i: number) => {
      audio.playMemory(m.midi, i * spacing, spacing * 1.6, 0.12);
    });
    // soft resolving home chord at the end
    const endAt = notes.length * spacing + 0.6;
    const home = ACTS[ACTS.length - 1];
    home.chord.forEach((tone, i) => {
      audio.playMemory(home.rootMidi + tone + 12, endAt + i * 0.18, 3, 0.09);
    });
  }, []);

  // ── arrival at home/dawn ───────────────────────────────────────────────
  const arriveHome = useCallback(() => {
    if (stateRef.current.finished) return;
    stateRef.current.finished = true;
    setArrived(true);
    saveState(stateRef.current);
    playReplay();
  }, [playReplay]);

  // ── pointer handling: drag the boat ────────────────────────────────────
  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * VB_W;
    const y = ((clientY - rect.top) / rect.height) * VB_H;
    return { x, y };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const p = svgPoint(e.clientX, e.clientY);
      if (!p) return;
      draggingRef.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      boatRef.current.targetX = Math.max(VB_W * 0.12, Math.min(VB_W * 0.72, p.x));
      boatRef.current.targetY = Math.max(RIVER_TOP + 10, Math.min(RIVER_BOTTOM - 10, p.y));
    },
    [svgPoint]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const p = svgPoint(e.clientX, e.clientY);
      if (!p) return;
      boatRef.current.targetX = Math.max(VB_W * 0.12, Math.min(VB_W * 0.72, p.x));
      boatRef.current.targetY = Math.max(RIVER_TOP + 10, Math.min(RIVER_BOTTOM - 10, p.y));
    },
    [svgPoint]
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // ── main rAF loop ──────────────────────────────────────────────────────
  const frame = useCallback(
    (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const audio = audioRef.current;
      if (!audio) return;

      if (lastTickRef.current === 0) lastTickRef.current = ts;
      let dt = (ts - lastTickRef.current) / 1000;
      lastTickRef.current = ts;
      if (dt > 0.1) dt = 0.1; // clamp after tab-away

      const st = stateRef.current;
      const wasFinished = st.finished;
      if (!wasFinished) st.elapsedMs = Math.min(VOYAGE_MS, st.elapsedMs + dt * 1000);
      const prog = progressOf(st.elapsedMs);

      // advance world scroll (slows gently near home)
      const slow = wasFinished ? 0.15 : 1 - 0.4 * Math.max(0, prog - 0.85) / 0.15;
      worldScrollRef.current += SCROLL_PX_PER_SEC * dt * Math.max(0.15, slow);
      const scroll = worldScrollRef.current;

      spawnGatesIfNeeded();

      // ease boat toward target (instant-feeling but smooth)
      const b = boatRef.current;
      b.x += (b.targetX - b.x) * Math.min(1, dt * 14);
      b.y += (b.targetY - b.y) * Math.min(1, dt * 14);

      // current act + lane voicing
      const { index: actIdx } = actAtProgress(prog);
      const voicingX = (b.x - VB_W * 0.12) / (VB_W * 0.6); // 0..1 lateral
      // fullness: 1 mid-river, 0 near a bank (vertical position)
      const midY = (RIVER_TOP + RIVER_BOTTOM) / 2;
      const halfSpan = (RIVER_BOTTOM - RIVER_TOP) / 2;
      const fullness = 1 - Math.min(1, Math.abs(b.y - midY) / halfSpan);

      if (actIdx !== lastActRef.current) {
        lastActRef.current = actIdx;
        audio.setAct(actIdx, voicingX);
        setPhaseLabel(ACTS[actIdx].label);
      }
      audio.steer(voicingX, fullness);

      // boat's lane = nearest lane band by y
      let boatLane = 0;
      let best = Infinity;
      for (let l = 0; l < LANE_COUNT; l++) {
        const d = Math.abs(b.y - laneY(l));
        if (d < best) {
          best = d;
          boatLane = l;
        }
      }

      // chime gates the boat passes through
      const boatScreenX = b.x;
      for (const g of gatesRef.current) {
        const gx = g.x - scroll;
        if (!g.chimed && g.lane === boatLane && Math.abs(gx - boatScreenX) < 34) {
          g.chimed = true;
          g.glow = 1;
          if (!wasFinished) {
            const midi = audio.chime(actIdx, g.lane, LANE_COUNT);
            st.path.push({ t: st.elapsedMs, midi, lane: g.lane, act: actIdx });
            if (st.path.length > 420) st.path.shift();
          }
        }
        if (g.glow > 0) g.glow = Math.max(0, g.glow - dt * 1.4);
      }

      // arrival
      if (prog >= 1 && !st.finished) arriveHome();

      // ── render: mutate SVG attributes only ──
      renderFrame(prog, scroll, b, boatLane);
    },
    [spawnGatesIfNeeded, arriveHome]
  );

  // imperative SVG writer
  const renderFrame = useCallback(
    (prog: number, scroll: number, b: { x: number; y: number }, boatLane: number) => {
      const e = els.current;
      const hue = hueAtProgress(prog);
      const dark = darknessAtProgress(prog);
      const sat = 55;
      const topL = 8 + (1 - dark) * 26;
      const botL = 14 + (1 - dark) * 24;

      if (e.skyTop) e.skyTop.setAttribute("stop-color", `hsl(${hue} ${sat}% ${topL}%)`);
      if (e.skyBot)
        e.skyBot.setAttribute("stop-color", `hsl(${(hue + 24) % 360} ${sat + 8}% ${botL}%)`);
      if (e.riverFill)
        e.riverFill.setAttribute("fill", `hsl(${(hue + 200) % 360} 40% ${10 + (1 - dark) * 14}%)`);

      // parallax: stars slowest, hills medium, reeds fastest
      if (e.starsG)
        e.starsG.setAttribute("transform", `translate(${-((scroll * 0.06) % 400)} 0)`);
      if (e.hillsG)
        e.hillsG.setAttribute("transform", `translate(${-((scroll * 0.22) % 600)} 0)`);
      if (e.reedsG)
        e.reedsG.setAttribute("transform", `translate(${-((scroll * 0.85) % 300)} 0)`);

      // star brightness with night darkness
      if (e.starsG) e.starsG.setAttribute("opacity", String(0.15 + dark * 0.85));

      // gates
      if (e.gatesG) {
        const parts: string[] = [];
        for (const g of gatesRef.current) {
          const gx = g.x - scroll;
          if (gx < -80 || gx > VB_W + 80) continue;
          const gy = laneY(g.lane);
          const ringHue = (hue + 60 + g.lane * 30) % 360;
          const lit = g.chimed ? 0.35 : 0.9;
          const pulse = 1 + g.glow * 0.5;
          const r = 26 * pulse;
          const glowOp = 0.25 + g.glow * 0.55;
          parts.push(
            `<g transform="translate(${gx.toFixed(1)} ${gy.toFixed(1)})">` +
              `<ellipse cx="0" cy="0" rx="${(r * 1.5).toFixed(1)}" ry="${(r * 0.7).toFixed(
                1
              )}" fill="hsl(${ringHue} 80% 65%)" opacity="${glowOp.toFixed(2)}"/>` +
              `<ellipse cx="0" cy="0" rx="${r.toFixed(1)}" ry="${(r * 0.5).toFixed(
                1
              )}" fill="hsl(${ringHue} 70% ${30 + g.glow * 25}%)" opacity="${lit}"/>` +
              `<ellipse cx="0" cy="-3" rx="${(r * 0.5).toFixed(1)}" ry="${(r * 0.24).toFixed(
                1
              )}" fill="hsl(${ringHue} 90% 80%)" opacity="${(0.5 + g.glow * 0.5).toFixed(2)}"/>` +
              `</g>`
          );
        }
        e.gatesG.innerHTML = parts.join("");
      }

      // boat
      if (e.boatG) {
        const tilt = (b.x - VB_W * 0.32) * 0.02;
        const wob = Math.sin(scroll * 0.05) * 3;
        e.boatG.setAttribute(
          "transform",
          `translate(${b.x.toFixed(1)} ${(b.y + wob).toFixed(1)}) rotate(${tilt.toFixed(2)})`
        );
      }

      // progress bar
      if (e.progFill) e.progFill.setAttribute("width", String(prog * 180));
    },
    []
  );

  // ── start / resume ─────────────────────────────────────────────────────
  const handleStart = useCallback(
    (resume: boolean) => {
      const audio = createBoatAudio();
      if (!audio) {
        setUnsupported(true);
        return;
      }
      audioRef.current = audio;
      // create/resume inside the gesture (iOS-safe)
      void audio.ctx.resume();

      if (resume) {
        const saved = loadState();
        stateRef.current = saved ?? freshState();
        worldScrollRef.current = (stateRef.current.elapsedMs / 1000) * SCROLL_PX_PER_SEC * 0.7;
      } else {
        clearState();
        stateRef.current = freshState();
        worldScrollRef.current = 0;
      }
      setArrived(stateRef.current.finished);

      // seed pad
      lastActRef.current = -1;
      lastTickRef.current = 0;
      nextGateXRef.current = worldScrollRef.current;
      gatesRef.current = [];
      const { index } = actAtProgress(progressOf(stateRef.current.elapsedMs));
      audio.setAct(index, 0.5);
      setPhaseLabel(ACTS[index].label);

      setStarted(true);

      // periodic persistence (wall-clock)
      saveTimerRef.current = setInterval(() => {
        saveState(stateRef.current);
      }, 3000);

      rafRef.current = requestAnimationFrame(frame);

      // if resuming an already-finished voyage, sing it back again
      if (stateRef.current.finished) {
        replayTimerRef.current = setTimeout(() => playReplay(), 800);
      }
    },
    [frame, playReplay]
  );

  const handleBeginAgain = useCallback(() => {
    clearState();
    stateRef.current = freshState();
    worldScrollRef.current = 0;
    nextGateXRef.current = 0;
    gatesRef.current = [];
    lastActRef.current = -1;
    lastTickRef.current = 0;
    setArrived(false);
    const audio = audioRef.current;
    if (audio) {
      audio.setAct(0, 0.5);
      setPhaseLabel(ACTS[0].label);
    }
  }, []);

  // ── teardown ───────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
      if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
      try {
        saveState(stateRef.current);
      } catch {
        /* ignore */
      }
      void audioRef.current?.destroy();
      audioRef.current = null;
    };
  }, []);

  // collect element refs once SVG mounts
  const collectRefs = useCallback((node: SVGSVGElement | null) => {
    svgRef.current = node;
    if (!node) return;
    els.current = {
      skyTop: node.querySelector("#pb-sky-top") as SVGStopElement,
      skyBot: node.querySelector("#pb-sky-bot") as SVGStopElement,
      starsG: node.querySelector("#pb-stars") as SVGGElement,
      hillsG: node.querySelector("#pb-hills") as SVGGElement,
      reedsG: node.querySelector("#pb-reeds") as SVGGElement,
      gatesG: node.querySelector("#pb-gates") as SVGGElement,
      boatG: node.querySelector("#pb-boat") as SVGGElement,
      riverFill: node.querySelector("#pb-river") as SVGRectElement,
      progFill: node.querySelector("#pb-prog") as SVGRectElement,
    };
  }, []);

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05060c] text-white">
      {/* corner design-notes link */}
      <Link
        href="/dream/325-kids-paper-boat/README.md"
        className="absolute right-3 top-3 z-30 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white/75 backdrop-blur hover:text-white"
      >
        Read the design notes
      </Link>

      {/* header */}
      <div className="pointer-events-none absolute left-0 top-0 z-20 p-5 sm:p-7">
        <h1 className="font-serif text-2xl text-white sm:text-3xl">Paper Boat</h1>
        <p className="mt-1 max-w-md text-base text-white/75">
          Steer the little boat down the night river. Glide into the glowing
          lily-pads to make them sing.
        </p>
      </div>

      {/* the SVG stage */}
      <div className="absolute inset-0">
        <svg
          ref={collectRefs}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid slice"
          className="h-full w-full touch-none select-none"
          onPointerDown={started ? onPointerDown : undefined}
          onPointerMove={started ? onPointerMove : undefined}
          onPointerUp={started ? onPointerUp : undefined}
          onPointerCancel={started ? onPointerUp : undefined}
        >
          <defs>
            <linearGradient id="pb-sky" x1="0" y1="0" x2="0" y2="1">
              <stop id="pb-sky-top" offset="0" stopColor="hsl(250 55% 18%)" />
              <stop id="pb-sky-bot" offset="1" stopColor="hsl(274 63% 16%)" />
            </linearGradient>
            <radialGradient id="pb-boat-glow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff7d6" stopOpacity="0.9" />
              <stop offset="0.5" stopColor="#ffd98a" stopOpacity="0.4" />
              <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* sky */}
          <rect x="0" y="0" width={VB_W} height={RIVER_TOP + 40} fill="url(#pb-sky)" />

          {/* stars (slow parallax) — duplicated so it tiles while scrolling */}
          <g id="pb-stars" opacity="0.6">
            {Array.from({ length: 2 }).flatMap((_, tile) =>
              Array.from({ length: 40 }).map((__, i) => {
                const x = (i * 53.3) % 400 + tile * 400;
                const y = ((i * 71.7) % (RIVER_TOP - 30)) + 8;
                const r = 0.6 + ((i * 7) % 5) * 0.35;
                return (
                  <circle
                    key={`${tile}-${i}`}
                    cx={x}
                    cy={y}
                    r={r}
                    fill="#fffbe8"
                    opacity={0.4 + ((i * 13) % 6) * 0.1}
                  />
                );
              })
            )}
          </g>

          {/* far hills (medium parallax) */}
          <g id="pb-hills" opacity="0.85">
            {Array.from({ length: 2 }).flatMap((_, tile) =>
              [0, 1, 2].map((i) => {
                const baseX = tile * 600 + i * 230;
                return (
                  <path
                    key={`${tile}-${i}`}
                    d={`M ${baseX - 120} ${RIVER_TOP + 20}
                        Q ${baseX} ${RIVER_TOP - 70 - i * 12} ${baseX + 160} ${RIVER_TOP + 20} Z`}
                    fill={`hsl(255 30% ${10 + i * 3}%)`}
                  />
                );
              })
            )}
          </g>

          {/* river water */}
          <rect
            id="pb-river"
            x="0"
            y={RIVER_TOP}
            width={VB_W}
            height={VB_H - RIVER_TOP}
            fill="hsl(210 40% 14%)"
          />
          {/* soft moon/light streak on water */}
          <ellipse
            cx={VB_W * 0.62}
            cy={(RIVER_TOP + RIVER_BOTTOM) / 2}
            rx={VB_W * 0.5}
            ry={26}
            fill="#dfe8ff"
            opacity="0.05"
          />

          {/* gates (lily-pads / lanterns) drawn imperatively */}
          <g id="pb-gates" />

          {/* boat */}
          <g id="pb-boat">
            <ellipse cx="0" cy="0" rx={BOAT_R * 2.0} ry={BOAT_R * 1.1} fill="url(#pb-boat-glow)" />
            {/* paper boat body */}
            <path
              d={`M ${-BOAT_R} 10 L ${BOAT_R} 10 L ${BOAT_R * 0.6} 26 L ${-BOAT_R * 0.6} 26 Z`}
              fill="#fef3da"
            />
            <path d={`M ${-BOAT_R} 10 L 0 10 L 0 -30 Z`} fill="#fff8e8" />
            <path d={`M 0 10 L ${BOAT_R} 10 L 0 -30 Z`} fill="#f4e3bf" />
            <path d={`M 0 -30 L 0 10`} stroke="#d9c79a" strokeWidth="1.5" />
            {/* tiny warm lantern dot */}
            <circle cx="0" cy="-6" r="3.5" fill="#ffd98a" />
          </g>

          {/* near reeds (fast parallax, foreground) */}
          <g id="pb-reeds" opacity="0.92">
            {Array.from({ length: 2 }).flatMap((_, tile) =>
              Array.from({ length: 10 }).map((__, i) => {
                const x = tile * 300 + i * 31 + ((i * 17) % 12);
                const h = 40 + ((i * 23) % 50);
                const onTop = i % 2 === 0;
                const baseY = onTop ? RIVER_TOP + 6 : RIVER_BOTTOM + 30;
                const dir = onTop ? 1 : -1;
                return (
                  <path
                    key={`${tile}-${i}`}
                    d={`M ${x} ${baseY} q 6 ${-dir * h * 0.5} 2 ${-dir * h}`}
                    stroke={`hsl(150 25% ${10 + (i % 3) * 4}%)`}
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                  />
                );
              })
            )}
          </g>

          {/* progress / phase HUD (visual + small label) */}
          <g transform={`translate(${VB_W - 210} ${VB_H - 30})`}>
            <rect x="0" y="0" width="180" height="8" rx="4" fill="#ffffff" opacity="0.12" />
            <rect id="pb-prog" x="0" y="0" width="0" height="8" rx="4" fill="#ffd98a" opacity="0.8" />
          </g>
        </svg>
      </div>

      {/* phase label */}
      {started && (
        <div className="pointer-events-none absolute bottom-4 left-5 z-20 text-sm uppercase tracking-[0.2em] text-violet-300">
          {arrived ? "dawn · home" : phaseLabel}
        </div>
      )}

      {/* arrival / begin-again overlay */}
      {started && arrived && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center pb-20">
          <button
            onClick={handleBeginAgain}
            className="pointer-events-auto min-h-[44px] rounded-full bg-amber-200/90 px-6 py-3 text-base font-medium text-[#3a2a08] shadow-lg shadow-amber-300/30 transition hover:bg-amber-100"
          >
            ☀ Begin a new voyage
          </button>
        </div>
      )}

      {/* start screen */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-black/55 backdrop-blur-sm">
          {unsupported ? (
            <p className="max-w-sm px-6 text-center text-base text-rose-300">
              Sound isn&apos;t available in this browser, so the voyage can&apos;t
              sing. Try a recent Chrome, Safari, or Firefox.
            </p>
          ) : (
            <>
              <p className="max-w-sm px-6 text-center text-base text-white/75">
                A long, slow river ride from dusk to dawn. Drag the paper boat to
                steer. Glide into the lily-pads to make them sing.
              </p>
              <button
                onClick={() => handleStart(false)}
                className="min-h-[44px] rounded-full bg-violet-400 px-8 py-3.5 text-lg font-medium text-[#10081f] shadow-lg shadow-violet-500/30 transition hover:bg-violet-300"
              >
                ▶ Begin the voyage
              </button>
              {hasSaved && (
                <button
                  onClick={() => handleStart(true)}
                  className="min-h-[44px] rounded-full border border-white/25 px-6 py-3 text-base text-white/85 transition hover:bg-white/10"
                >
                  ↻ Continue your river
                </button>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}
