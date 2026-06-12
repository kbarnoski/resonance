"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  TUNING_SYSTEMS,
  TuningSystem,
  buildLattice,
  LatticeNode,
  nodeFreq,
} from "./tuning";
import { createAudioEngine, AudioEngine } from "./audio";

// ─── Layout constants ──────────────────────────────────────────────────────
const NODE_R = 22;    // base node circle radius (px)
const NODE_GAP_X = 68; // horizontal spacing between node centres
const NODE_GAP_Y = 58; // vertical spacing between node centres

// ─── Ghost-finger demo paths ───────────────────────────────────────────────
const DEMO_PATHS: Record<string, [number, number][]> = {
  "5limit": [
    [0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1],
    [-1, 1], [-1, 0], [0, 0], [1, -1], [2, -1],
    [1, 0], [0, 0], [-1, -1], [-2, 0], [-1, 0], [0, 0],
  ],
  bp: [
    [0, 0], [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [0, 0], [0, -1], [1, -1], [1, 0], [0, 0],
  ],
  "19edo": [
    [0, 0], [1, 0], [2, 0], [2, 1], [1, 1],
    [0, 0], [-1, 0], [-2, 0], [-1, -1], [0, 0],
  ],
};

// ─── Grid → SVG projection ─────────────────────────────────────────────────
function gridToSvg(
  u: number,
  v: number,
  svgW: number,
  svgH: number,
  offsetX: number,
  offsetY: number
): [number, number] {
  const x = svgW / 2 + (u + offsetX) * NODE_GAP_X;
  const y = svgH / 2 - (v + offsetY) * NODE_GAP_Y;
  return [x, y];
}

// ─── Edge renderer ─────────────────────────────────────────────────────────
interface EdgeProps {
  nodes: LatticeNode[];
  svgW: number;
  svgH: number;
  panOffset: { x: number; y: number };
}

function LatticeEdges({ nodes, svgW, svgH, panOffset }: EdgeProps) {
  const nodeMap = new Map(nodes.map((n) => [`${n.u},${n.v}`, n]));
  const lines: ReactNode[] = [];

  for (const node of nodes) {
    for (const [du, dv, isV] of [
      [1, 0, false],
      [0, 1, true],
    ] as [number, number, boolean][]) {
      const nb = nodeMap.get(`${node.u + du},${node.v + dv}`);
      if (!nb) continue;
      const [x1, y1] = gridToSvg(
        node.u, node.v, svgW, svgH, panOffset.x, panOffset.y
      );
      const [x2, y2] = gridToSvg(
        nb.u, nb.v, svgW, svgH, panOffset.x, panOffset.y
      );
      lines.push(
        <line
          key={`${node.u},${node.v}-${du},${dv}`}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={isV ? "rgba(139,92,246,0.22)" : "rgba(99,102,241,0.16)"}
          strokeWidth={1.5}
          strokeDasharray={isV ? "4 3" : undefined}
        />
      );
    }
  }
  return <>{lines}</>;
}

// ─── Node renderer ─────────────────────────────────────────────────────────
interface NodeProps {
  tuning: TuningSystem;
  nodes: LatticeNode[];
  activeIds: Set<string>;
  ghostId: string | null;
  svgW: number;
  svgH: number;
  panOffset: { x: number; y: number };
  pointerDownIds: Set<string>;
  onNodePointerDown: (id: string, freq: number) => void;
  onNodePointerEnter: (id: string, freq: number) => void;
  onNodePointerUp: (id: string) => void;
  onNodePointerLeave: (id: string) => void;
}

function LatticeNodes({
  tuning,
  nodes,
  activeIds,
  ghostId,
  svgW,
  svgH,
  panOffset,
  pointerDownIds,
  onNodePointerDown,
  onNodePointerEnter,
  onNodePointerUp,
  onNodePointerLeave,
}: NodeProps) {
  const baseHue = tuning.id === "bp" ? 155 : tuning.id === "19edo" ? 38 : 255;

  return (
    <>
      {nodes.map((node) => {
        const id = `${node.u},${node.v}`;
        const [cx, cy] = gridToSvg(
          node.u, node.v, svgW, svgH, panOffset.x, panOffset.y
        );
        const isRoot = node.u === 0 && node.v === 0;
        const isActive = activeIds.has(id);
        const isGhost = ghostId === id;
        const held = pointerDownIds.has(id);

        const scale = isActive || held ? 1.45 : isGhost ? 1.18 : 1;
        const posHue = ((node.u * 17 + node.v * 29) % 360 + 360) % 360;
        const hue = (baseHue * 0.8 + posHue * 0.2) % 360;
        const sat = isActive ? 88 : isGhost ? 72 : 52;
        const lit = isActive ? 70 : isGhost ? 62 : isRoot ? 52 : 42;
        const alpha = isActive ? 1 : isGhost ? 0.85 : 0.72;

        return (
          <g
            key={id}
            transform={`translate(${cx},${cy})`}
            style={{ cursor: "pointer" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onNodePointerDown(id, node.freq);
            }}
            onPointerEnter={(e) => {
              e.stopPropagation();
              onNodePointerEnter(id, node.freq);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              onNodePointerUp(id);
            }}
            onPointerLeave={(e) => {
              e.stopPropagation();
              onNodePointerLeave(id);
            }}
          >
            {/* Glow ring */}
            {(isActive || isGhost) && (
              <circle
                r={NODE_R * scale + 10}
                fill={`hsla(${hue},${sat}%,${lit + 10}%,0.10)`}
                style={{
                  filter: `blur(${isActive ? 14 : 7}px)`,
                  transition: "r 0.15s",
                }}
              />
            )}
            {/* Main circle */}
            <circle
              r={NODE_R * scale}
              fill={`hsla(${hue},${sat}%,${lit}%,${alpha})`}
              stroke={
                isActive
                  ? `hsla(${hue},90%,82%,0.95)`
                  : isRoot
                  ? `hsla(${hue},75%,68%,0.7)`
                  : `hsla(${hue},50%,62%,0.35)`
              }
              strokeWidth={isActive ? 2.5 : isRoot ? 2 : 1.5}
              style={{ transition: "r 0.12s, fill 0.12s, stroke-width 0.12s" }}
            />
            {/* Label text */}
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={isActive ? 11 : 10}
              fontFamily="monospace"
              fill={`rgba(255,255,255,${isActive ? 0.95 : 0.62})`}
              style={{
                userSelect: "none",
                pointerEvents: "none",
                transition: "font-size 0.12s",
              }}
            >
              {node.label}
            </text>
            {/* Frequency sub-label when active */}
            {isActive && (
              <text
                y={NODE_R * scale + 14}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={9}
                fontFamily="monospace"
                fill="rgba(255,255,255,0.5)"
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {node.freq.toFixed(1)} Hz
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

// ─── Ghost cursor ──────────────────────────────────────────────────────────
function GhostCursor({
  u, v, svgW, svgH, panOffset, tuningId,
}: {
  u: number; v: number;
  svgW: number; svgH: number;
  panOffset: { x: number; y: number };
  tuningId: string;
}) {
  const [cx, cy] = gridToSvg(u, v, svgW, svgH, panOffset.x, panOffset.y);
  const hue = tuningId === "bp" ? 155 : tuningId === "19edo" ? 38 : 265;
  return (
    <g
      transform={`translate(${cx},${cy})`}
      style={{ pointerEvents: "none" }}
    >
      {/* Animated ripple ring */}
      <circle
        r={NODE_R + 20}
        fill="none"
        stroke={`hsla(${hue},70%,65%,0.45)`}
        strokeWidth={2}
        style={{
          animationName: "xenGhostRipple",
          animationDuration: "1.6s",
          animationTimingFunction: "ease-out",
          animationIterationCount: "infinite",
          transformOrigin: "center",
        }}
      />
      {/* Centre dot */}
      <circle
        r={6}
        fill={`hsla(${hue},80%,78%,0.75)`}
        style={{
          filter: `drop-shadow(0 0 8px hsla(${hue},90%,82%,0.9))`,
        }}
      />
    </g>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function XenharmonicLatticePage() {
  const [started, setStarted] = useState(false);
  const [tuningIdx, setTuningIdx] = useState(0);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [pointerDownIds, setPointerDownIds] = useState<Set<string>>(new Set());
  const [ghostId, setGhostId] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [svgSize, setSvgSize] = useState({ w: 800, h: 500 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<LatticeNode | null>(null);

  const engineRef = useRef<AudioEngine | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoActiveRef = useRef(false);
  const demoStepRef = useRef(0);
  const tuningIdxRef = useRef(tuningIdx);
  const dragStartRef = useRef<{
    x: number; y: number; px: number; py: number;
  } | null>(null);
  const pointerPressedRef = useRef(false);

  // Keep tuningIdx in a ref so demo closures see fresh value
  useEffect(() => { tuningIdxRef.current = tuningIdx; }, [tuningIdx]);

  // ── Resize observer ──────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) setSvgSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Audio engine ─────────────────────────────────────────────────────
  const initAudio = useCallback(() => {
    if (engineRef.current) return;
    const eng = createAudioEngine();
    if (!eng) { setAudioError(true); return; }
    engineRef.current = eng;
  }, []);

  // ── Note control ─────────────────────────────────────────────────────
  const playNote = useCallback((id: string, freq: number) => {
    engineRef.current?.startNote(id, freq);
    setActiveIds((p) => new Set([...p, id]));
  }, []);

  const releaseNote = useCallback((id: string) => {
    engineRef.current?.stopNote(id);
    setActiveIds((p) => { const n = new Set(p); n.delete(id); return n; });
  }, []);

  const releaseAll = useCallback(() => {
    engineRef.current?.stopAll();
    setActiveIds(new Set());
  }, []);

  // ── Demo control ─────────────────────────────────────────────────────
  const stopDemo = useCallback(() => {
    demoActiveRef.current = false;
    setIsDemo(false);
    if (demoTimerRef.current) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    setGhostId(null);
    releaseAll();
  }, [releaseAll]);

  // Forward-declared in ref to avoid circular dependency
  const runDemoStepRef = useRef<() => void>(() => undefined);

  const scheduleIdleResume = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (demoActiveRef.current) return;
      demoActiveRef.current = true;
      setIsDemo(true);
      demoStepRef.current = 0;
      runDemoStepRef.current();
    }, 4000);
  }, []);

  // Assign the real step function
  useEffect(() => {
    runDemoStepRef.current = () => {
      if (!demoActiveRef.current) return;
      const tidx = tuningIdxRef.current;
      const ts = TUNING_SYSTEMS[tidx];
      const path = DEMO_PATHS[ts.id] ?? DEMO_PATHS["5limit"];
      const step = demoStepRef.current % path.length;
      const [u, v] = path[step];
      releaseAll();
      const freq = nodeFreq(ts, u, v);
      const id = `${u},${v}`;
      playNote(id, freq);
      setGhostId(id);
      demoStepRef.current += 1;
      demoTimerRef.current = setTimeout(runDemoStepRef.current, 1400);
    };
  }, [releaseAll, playNote]);

  const startDemo = useCallback(() => {
    if (demoActiveRef.current) return;
    demoActiveRef.current = true;
    setIsDemo(true);
    demoStepRef.current = 0;
    // Slight delay so AudioContext is ready
    demoTimerRef.current = setTimeout(runDemoStepRef.current, 200);
  }, []);

  // ── Begin tap ────────────────────────────────────────────────────────
  const handleBegin = useCallback(() => {
    setStarted(true);
    initAudio();
  }, [initAudio]);

  // ── Auto-demo on start ───────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const t = setTimeout(startDemo, 700);
    return () => clearTimeout(t);
    // startDemo is stable; intentionally omitting it to run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // ── Tuning switch ────────────────────────────────────────────────────
  const handleTuningSwitch = useCallback(
    (idx: number) => {
      stopDemo();
      releaseAll();
      setPointerDownIds(new Set());
      setPanOffset({ x: 0, y: 0 });
      setTuningIdx(idx);
      // Resume demo after short pause (not "user interaction")
      setTimeout(() => { startDemo(); }, 400);
    },
    [stopDemo, releaseAll, startDemo]
  );

  // ── User interaction ─────────────────────────────────────────────────
  const handleUserInteract = useCallback(() => {
    stopDemo();
    scheduleIdleResume();
  }, [stopDemo, scheduleIdleResume]);

  // ── Cleanup ──────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      engineRef.current?.close();
    };
  }, []);

  // ── Node interaction ─────────────────────────────────────────────────
  const nodes = useMemo(
    () => buildLattice(TUNING_SYSTEMS[tuningIdx]),
    [tuningIdx]
  );

  const handleNodePointerDown = useCallback(
    (id: string, freq: number) => {
      handleUserInteract();
      pointerPressedRef.current = true;
      playNote(id, freq);
      setPointerDownIds((p) => new Set([...p, id]));
      setHoveredNode(nodes.find((n) => `${n.u},${n.v}` === id) ?? null);
    },
    [handleUserInteract, playNote, nodes]
  );

  const handleNodePointerEnter = useCallback(
    (id: string, freq: number) => {
      setHoveredNode(nodes.find((n) => `${n.u},${n.v}` === id) ?? null);
      // Only sound on hover if pointer is pressed (drag-strum)
      if (pointerPressedRef.current) {
        playNote(id, freq);
        setPointerDownIds((p) => new Set([...p, id]));
      }
    },
    [playNote, nodes]
  );

  const handleNodePointerUp = useCallback(
    (id: string) => {
      releaseNote(id);
      setPointerDownIds((p) => { const n = new Set(p); n.delete(id); return n; });
    },
    [releaseNote]
  );

  const handleNodePointerLeave = useCallback(
    (id: string) => {
      releaseNote(id);
      setPointerDownIds((p) => { const n = new Set(p); n.delete(id); return n; });
      setHoveredNode(null);
    },
    [releaseNote]
  );

  // Global pointer-up to reset press state
  useEffect(() => {
    if (!started) return;
    const onUp = () => {
      pointerPressedRef.current = false;
      releaseAll();
      setPointerDownIds(new Set());
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [started, releaseAll]);

  // ── SVG pan drag ─────────────────────────────────────────────────────
  const handleSvgPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (e.target !== svgRef.current) return;
      dragStartRef.current = {
        x: e.clientX, y: e.clientY,
        px: panOffset.x, py: panOffset.y,
      };
      setIsDragging(true);
      (e.target as SVGSVGElement).setPointerCapture(e.pointerId);
    },
    [panOffset]
  );

  const handleSvgPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!dragStartRef.current) return;
      const dx = (e.clientX - dragStartRef.current.x) / NODE_GAP_X;
      const dy = -(e.clientY - dragStartRef.current.y) / NODE_GAP_Y;
      setPanOffset({
        x: dragStartRef.current.px + dx,
        y: dragStartRef.current.py + dy,
      });
    },
    []
  );

  const handleSvgPointerUp = useCallback(() => {
    dragStartRef.current = null;
    setIsDragging(false);
  }, []);

  const tuning = TUNING_SYSTEMS[tuningIdx];

  // ── Splash ───────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-full gap-6 text-center px-6 py-12 bg-[#07070f]">
        <div className="max-w-lg">
          <p className="text-violet-300/80 text-xs font-mono tracking-widest uppercase mb-3">
            xenharmonic lattice
          </p>
          <h1 className="text-2xl font-serif text-white/95 leading-snug mb-4">
            Tunings the Piano Cannot Play
          </h1>
          <p className="text-base text-white/75 leading-relaxed">
            A navigable harmonic lattice in{" "}
            <span className="text-violet-300">just intonation</span> and{" "}
            <span className="text-emerald-300">Bohlen–Pierce</span> — exact
            rational frequency ratios. Hover or tap nodes to hear the pure
            tuning. The tension lives in the intervals themselves.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {TUNING_SYSTEMS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setTuningIdx(i)}
              className={`min-h-[36px] px-3 py-1.5 rounded-full text-sm border transition-all ${
                tuningIdx === i
                  ? t.id === "bp"
                    ? "border-emerald-400/50 text-emerald-200 bg-emerald-500/15"
                    : t.id === "19edo"
                    ? "border-amber-400/50 text-amber-200 bg-amber-500/15"
                    : "border-violet-400/50 text-violet-200 bg-violet-500/15"
                  : "border-white/10 text-white/55 hover:text-white/80"
              }`}
            >
              {t.shortName}
            </button>
          ))}
        </div>

        <button
          onClick={handleBegin}
          className="min-h-[44px] px-8 py-2.5 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 text-base hover:bg-violet-500/35 transition-colors"
        >
          Begin Exploration
        </button>

        {audioError && (
          <p className="text-rose-300 text-sm">
            Web Audio unavailable — visuals only.
          </p>
        )}

        <p className="text-white/55 text-sm max-w-xs">
          Tap or drag across nodes to play. Ghost-finger auto-demo plays on
          load. Resumes after 4s idle.
        </p>

        <a
          href="/dream/538-xenharmonic-lattice/README.md"
          className="absolute bottom-4 right-4 text-xs text-white/40 hover:text-white/60 transition-colors"
        >
          design notes ↗
        </a>
      </div>
    );
  }

  // ── Main lattice view ─────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col w-full h-full bg-[#07070f] overflow-hidden">
      {/* Inline keyframes for ghost ripple */}
      <style>{`
        @keyframes xenGhostRipple {
          0%   { transform: scale(0.85); opacity: 0.8; }
          70%  { transform: scale(1.35); opacity: 0.15; }
          100% { transform: scale(1.5);  opacity: 0; }
        }
      `}</style>

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/5 bg-black/20 z-10">
        <div className="flex items-center gap-3">
          <span className="text-xl font-serif text-white/90 hidden sm:inline">
            Xenharmonic Lattice
          </span>
          <span className="text-white/20 hidden sm:inline">—</span>
          <div className="flex gap-1.5">
            {TUNING_SYSTEMS.map((t, i) => (
              <button
                key={t.id}
                onClick={() => handleTuningSwitch(i)}
                className={`min-h-[36px] px-3 py-1 rounded text-sm border transition-all ${
                  tuningIdx === i
                    ? t.id === "bp"
                      ? "border-emerald-400/50 text-emerald-200 bg-emerald-500/15"
                      : t.id === "19edo"
                      ? "border-amber-400/50 text-amber-200 bg-amber-500/15"
                      : "border-violet-400/50 text-violet-200 bg-violet-500/15"
                    : "border-white/10 text-white/45 hover:text-white/75"
                }`}
              >
                {t.shortName}
              </button>
            ))}
          </div>
        </div>

        {/* Hovered node readout */}
        <div className="text-xs font-mono text-right leading-tight">
          {hoveredNode ? (
            <span>
              <span className="text-white/80">{hoveredNode.label}</span>
              <span className="text-white/25 mx-1">·</span>
              <span className="text-white/55">{hoveredNode.ratioLabel}</span>
              <span className="text-white/25 mx-1">·</span>
              <span className="text-white/55">{hoveredNode.freq.toFixed(2)} Hz</span>
            </span>
          ) : (
            <span className="text-white/30">hover a node</span>
          )}
        </div>
      </div>

      {/* ── SVG Canvas ──────────────────────────────────────────────── */}
      <div ref={containerRef} className="relative flex-1 min-h-0">
        <svg
          ref={svgRef}
          width={svgSize.w}
          height={svgSize.h}
          viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
          className="absolute inset-0"
          style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerCancel={handleSvgPointerUp}
        >
          {/* Background gradient */}
          <defs>
            <radialGradient id="xenBgGrad" cx="50%" cy="50%" r="60%">
              <stop
                offset="0%"
                stopColor={
                  tuning.id === "bp"
                    ? "#091611"
                    : tuning.id === "19edo"
                    ? "#120e06"
                    : "#09060f"
                }
              />
              <stop offset="100%" stopColor="#07070f" />
            </radialGradient>
          </defs>
          <rect width={svgSize.w} height={svgSize.h} fill="url(#xenBgGrad)" />

          {/* Axis labels */}
          <text
            x={svgSize.w - 10}
            y={svgSize.h / 2 + 14}
            textAnchor="end"
            fontSize={9}
            fontFamily="monospace"
            fill="rgba(255,255,255,0.18)"
          >
            {tuning.uLabel}
          </text>
          <text
            x={svgSize.w / 2 + 4}
            y={12}
            textAnchor="middle"
            fontSize={9}
            fontFamily="monospace"
            fill="rgba(255,255,255,0.18)"
          >
            {tuning.vLabel}
          </text>

          {/* Edges */}
          <LatticeEdges
            nodes={nodes}
            svgW={svgSize.w}
            svgH={svgSize.h}
            panOffset={panOffset}
          />

          {/* Nodes */}
          <LatticeNodes
            tuning={tuning}
            nodes={nodes}
            activeIds={activeIds}
            ghostId={ghostId}
            svgW={svgSize.w}
            svgH={svgSize.h}
            panOffset={panOffset}
            pointerDownIds={pointerDownIds}
            onNodePointerDown={handleNodePointerDown}
            onNodePointerEnter={handleNodePointerEnter}
            onNodePointerUp={handleNodePointerUp}
            onNodePointerLeave={handleNodePointerLeave}
          />

          {/* Ghost cursor overlay */}
          {ghostId && (
            <GhostCursor
              u={parseInt(ghostId.split(",")[0], 10)}
              v={parseInt(ghostId.split(",")[1], 10)}
              svgW={svgSize.w}
              svgH={svgSize.h}
              panOffset={panOffset}
              tuningId={tuning.id}
            />
          )}
        </svg>

        {/* Demo indicator */}
        {isDemo && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 text-xs text-white/40 pointer-events-none select-none">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400/60 animate-pulse" />
            auto-demo · tap to explore
          </div>
        )}
      </div>

      {/* ── Bottom info bar ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-white/5 bg-black/20 flex items-center justify-between gap-2 text-xs font-mono">
        <span className="text-white/55 shrink-0">{tuning.name}</span>
        <span className="text-white/30 hidden md:block truncate max-w-xs">
          {tuning.description}
        </span>
        <a
          href="/dream/538-xenharmonic-lattice/README.md"
          className="text-white/30 hover:text-white/55 transition-colors shrink-0"
        >
          notes ↗
        </a>
      </div>

      {/* Audio unavailable notice */}
      {audioError && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded bg-black/70 text-rose-300 text-sm pointer-events-none">
          Web Audio unavailable — visuals only
        </div>
      )}
    </div>
  );
}
