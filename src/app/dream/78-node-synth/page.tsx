"use client";

import { useEffect, useRef, useCallback, useReducer, useState } from "react";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────────────────

type NodeKind = "oscillator" | "gain" | "filter" | "delay" | "destination";

interface NodeDef {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  params: Record<string, number | string>;
}

interface Wire {
  id: string;
  fromId: string;
  toId: string;
}

interface GraphState {
  nodes: NodeDef[];
  wires: Wire[];
  nextId: number;
}

type Action =
  | { type: "ADD_NODE"; kind: NodeKind; x: number; y: number }
  | { type: "MOVE_NODE"; id: string; x: number; y: number }
  | { type: "SET_PARAM"; id: string; key: string; value: number | string }
  | { type: "ADD_WIRE"; fromId: string; toId: string }
  | { type: "REMOVE_WIRE"; id: string }
  | { type: "REMOVE_NODE"; id: string };

// ─── Port layout ─────────────────────────────────────────────────────────────

const CARD_W = 180;
const PORT_R = 7;

function portPos(node: NodeDef, side: "out" | "in") {
  const cy = node.y + 56; // vertical center of card body
  if (side === "out") return { x: node.x + CARD_W, y: cy };
  return { x: node.x, y: cy };
}

// ─── Default params ───────────────────────────────────────────────────────────

function defaultParams(kind: NodeKind): Record<string, number | string> {
  switch (kind) {
    case "oscillator": return { freq: 220, type: "sine", detune: 0 };
    case "gain":       return { gain: 0.5 };
    case "filter":     return { freq: 1000, q: 1, type: "lowpass" };
    case "delay":      return { time: 0.25, feedback: 0.4 };
    case "destination":return {};
  }
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: GraphState, action: Action): GraphState {
  switch (action.type) {
    case "ADD_NODE": {
      const id = `n${state.nextId}`;
      const node: NodeDef = {
        id, kind: action.kind,
        x: action.x, y: action.y,
        params: defaultParams(action.kind),
      };
      return { ...state, nodes: [...state.nodes, node], nextId: state.nextId + 1 };
    }
    case "MOVE_NODE":
      return {
        ...state,
        nodes: state.nodes.map(n => n.id === action.id ? { ...n, x: action.x, y: action.y } : n),
      };
    case "SET_PARAM":
      return {
        ...state,
        nodes: state.nodes.map(n =>
          n.id === action.id ? { ...n, params: { ...n.params, [action.key]: action.value } } : n
        ),
      };
    case "ADD_WIRE": {
      // prevent duplicates
      const exists = state.wires.some(w => w.fromId === action.fromId && w.toId === action.toId);
      if (exists) return state;
      const id = `w${state.nextId}`;
      return {
        ...state,
        wires: [...state.wires, { id, fromId: action.fromId, toId: action.toId }],
        nextId: state.nextId + 1,
      };
    }
    case "REMOVE_WIRE":
      return { ...state, wires: state.wires.filter(w => w.id !== action.id) };
    case "REMOVE_NODE":
      return {
        ...state,
        nodes: state.nodes.filter(n => n.id !== action.id),
        wires: state.wires.filter(w => w.fromId !== action.id && w.toId !== action.id),
      };
    default:
      return state;
  }
}

const INITIAL: GraphState = {
  nextId: 10,
  nodes: [
    { id: "n1", kind: "oscillator", x: 60,  y: 160, params: { freq: 220, type: "sine", detune: 0 } },
    { id: "n2", kind: "gain",       x: 320, y: 160, params: { gain: 0.4 } },
    { id: "n3", kind: "destination",x: 580, y: 160, params: {} },
  ],
  wires: [
    { id: "w1", fromId: "n1", toId: "n2" },
    { id: "w2", fromId: "n2", toId: "n3" },
  ],
};

// ─── Node colors ─────────────────────────────────────────────────────────────

const KIND_COLOR: Record<NodeKind, string> = {
  oscillator:  "#7c3aed",
  gain:        "#0891b2",
  filter:      "#059669",
  delay:       "#b45309",
  destination: "#be185d",
};

const KIND_LABEL: Record<NodeKind, string> = {
  oscillator:  "Oscillator",
  gain:        "Gain",
  filter:      "Filter",
  delay:       "Delay",
  destination: "Speakers",
};

// ─── Wire canvas overlay ──────────────────────────────────────────────────────

function drawWires(
  ctx: CanvasRenderingContext2D,
  nodes: NodeDef[],
  wires: Wire[],
  pendingFrom: { id: string; x: number; y: number } | null,
  mouseX: number,
  mouseY: number,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));

  for (const w of wires) {
    const from = byId[w.fromId];
    const to = byId[w.toId];
    if (!from || !to) continue;
    const p1 = portPos(from, "out");
    const p2 = portPos(to, "in");
    drawBezier(ctx, p1.x, p1.y, p2.x, p2.y, KIND_COLOR[from.kind], false);
  }

  if (pendingFrom) {
    const from = byId[pendingFrom.id];
    if (from) {
      const p1 = portPos(from, "out");
      drawBezier(ctx, p1.x, p1.y, mouseX, mouseY, KIND_COLOR[from.kind], true);
    }
  }
}

function drawBezier(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  color: string,
  dashed: boolean,
) {
  const cx = (x1 + x2) / 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(cx, y1, cx, y2, x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = dashed ? 2 : 2.5;
  ctx.globalAlpha = dashed ? 0.55 : 0.85;
  if (dashed) ctx.setLineDash([6, 4]);
  else ctx.setLineDash([]);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NodeSynth() {
  const [graph, dispatch] = useReducer(reducer, INITIAL);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio engine refs
  const acRef = useRef<AudioContext | null>(null);
  const audioNodes = useRef<Map<string, AudioNode>>(new Map());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  // ── Build / sync audio graph ─────────────────────────────────────────────

  const syncAudio = useCallback((g: GraphState) => {
    const ac = acRef.current;
    if (!ac || !running) return;

    // Rebuild all nodes that don't exist yet
    for (const nd of g.nodes) {
      if (!audioNodes.current.has(nd.id)) {
        let an: AudioNode;
        if (nd.kind === "oscillator") {
          const osc = ac.createOscillator();
          osc.type = (nd.params.type ?? "sine") as OscillatorType;
          osc.frequency.value = Number(nd.params.freq ?? 220);
          osc.detune.value = Number(nd.params.detune ?? 0);
          osc.start();
          an = osc;
        } else if (nd.kind === "gain") {
          const g2 = ac.createGain();
          g2.gain.value = Number(nd.params.gain ?? 0.5);
          an = g2;
        } else if (nd.kind === "filter") {
          const f = ac.createBiquadFilter();
          f.type = (nd.params.type ?? "lowpass") as BiquadFilterType;
          f.frequency.value = Number(nd.params.freq ?? 1000);
          f.Q.value = Number(nd.params.q ?? 1);
          an = f;
        } else if (nd.kind === "delay") {
          const d = ac.createDelay(4.0);
          d.delayTime.value = Number(nd.params.time ?? 0.25);
          // feedback gain
          const fb = ac.createGain();
          fb.gain.value = Number(nd.params.feedback ?? 0.4);
          d.connect(fb);
          fb.connect(d);
          audioNodes.current.set(`${nd.id}_fb`, fb);
          an = d;
        } else {
          // destination
          an = ac.destination;
        }
        audioNodes.current.set(nd.id, an);
      }
    }

    // Remove stale nodes
    for (const [id, an] of audioNodes.current) {
      if (id.endsWith("_fb")) continue;
      if (!g.nodes.find(n => n.id === id)) {
        if (an instanceof OscillatorNode) an.stop();
        try { an.disconnect(); } catch { /* ok */ }
        audioNodes.current.delete(id);
      }
    }

    // Re-wire: disconnect everything, reconnect per wires list
    for (const [id, an] of audioNodes.current) {
      if (id.endsWith("_fb")) continue;
      if (an !== acRef.current!.destination) {
        try { an.disconnect(); } catch { /* ok */ }
      }
    }
    // Reconnect delay feedbacks
    for (const nd of g.nodes) {
      if (nd.kind === "delay") {
        const d = audioNodes.current.get(nd.id) as DelayNode | undefined;
        const fb = audioNodes.current.get(`${nd.id}_fb`) as GainNode | undefined;
        if (d && fb) {
          try { d.connect(fb); fb.connect(d); } catch { /* ok */ }
        }
      }
    }
    // Wires
    for (const w of g.wires) {
      const src = audioNodes.current.get(w.fromId);
      const dst = audioNodes.current.get(w.toId);
      if (src && dst) {
        try { src.connect(dst); } catch { /* already connected */ }
      }
    }

    // Update params on existing nodes
    for (const nd of g.nodes) {
      const an = audioNodes.current.get(nd.id);
      if (!an) continue;
      if (an instanceof OscillatorNode) {
        an.frequency.setTargetAtTime(Number(nd.params.freq), ac.currentTime, 0.02);
        an.detune.setTargetAtTime(Number(nd.params.detune), ac.currentTime, 0.02);
        if (an.type !== nd.params.type) an.type = nd.params.type as OscillatorType;
      } else if (an instanceof GainNode) {
        an.gain.setTargetAtTime(Number(nd.params.gain), ac.currentTime, 0.02);
      } else if (an instanceof BiquadFilterNode) {
        an.frequency.setTargetAtTime(Number(nd.params.freq), ac.currentTime, 0.02);
        an.Q.setTargetAtTime(Number(nd.params.q), ac.currentTime, 0.02);
        if (an.type !== nd.params.type) an.type = nd.params.type as BiquadFilterType;
      } else if (an instanceof DelayNode) {
        an.delayTime.setTargetAtTime(Number(nd.params.time), ac.currentTime, 0.02);
        const fb = audioNodes.current.get(`${nd.id}_fb`) as GainNode | undefined;
        if (fb) fb.gain.setTargetAtTime(Number(nd.params.feedback), ac.currentTime, 0.02);
      }
    }
  }, [running]);

  useEffect(() => { syncAudio(graph); }, [graph, syncAudio]);

  // ── Start audio ──────────────────────────────────────────────────────────

  const startAudio = useCallback(async () => {
    try {
      const ac = new AudioContext();
      acRef.current = ac;
      setRunning(true);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    return () => {
      acRef.current?.close();
      audioNodes.current.clear();
    };
  }, []);

  // ── Wire canvas: draw on every render ────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const board = boardRef.current;
    if (!canvas || !board) return;
    const rect = board.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pf = pendingFrom ? graph.nodes.find(n => n.id === pendingFrom) || null : null;
    drawWires(ctx, graph.nodes, graph.wires, pf ? { id: pf.id, x: pf.x, y: pf.y } : null, mouse.x, mouse.y);
  });

  // ── Drag node ────────────────────────────────────────────────────────────

  const dragging = useRef<{ id: string; ox: number; oy: number } | null>(null);

  const onPointerDownNode = useCallback((e: React.PointerEvent, id: string) => {
    if ((e.target as HTMLElement).closest("[data-control]")) return;
    e.stopPropagation();
    const node = graph.nodes.find(n => n.id === id);
    if (!node) return;
    dragging.current = { id, ox: e.clientX - node.x, oy: e.clientY - node.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [graph.nodes]);

  const onPointerMoveBoard = useCallback((e: React.PointerEvent) => {
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (dragging.current) {
      dispatch({ type: "MOVE_NODE", id: dragging.current.id, x: e.clientX - dragging.current.ox, y: e.clientY - dragging.current.oy });
    }
  }, []);

  const onPointerUpBoard = useCallback(() => {
    dragging.current = null;
  }, []);

  // ── Port interaction ─────────────────────────────────────────────────────

  const onClickOutPort = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPendingFrom(id);
  }, []);

  const onClickInPort = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!pendingFrom || pendingFrom === id) { setPendingFrom(null); return; }
    dispatch({ type: "ADD_WIRE", fromId: pendingFrom, toId: id });
    setPendingFrom(null);
  }, [pendingFrom]);

  const onClickBoard = useCallback(() => { setPendingFrom(null); }, []);

  // ── Add node from toolbar ────────────────────────────────────────────────

  const addNode = useCallback((kind: NodeKind) => {
    dispatch({ type: "ADD_NODE", kind, x: 60 + Math.random() * 300, y: 60 + Math.random() * 300 });
  }, []);

  // ── Remove wire on click ─────────────────────────────────────────────────

  const removeWire = useCallback((id: string) => {
    dispatch({ type: "REMOVE_WIRE", id });
  }, []);

  const hasDestination = graph.nodes.some(n => n.kind === "destination");

  return (
    <div className="min-h-screen bg-black text-foreground flex flex-col" style={{ userSelect: "none" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">Node Synth</h1>
          <p className="text-muted-foreground text-base mt-0.5">
            Patch oscillators, filters, and effects into a live sound.
          </p>
        </div>
        <Link href="/dream" className="text-muted-foreground text-sm hover:text-foreground transition-colors">
          ← dream
        </Link>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-border flex-wrap">
        {!running ? (
          <button
            onClick={startAudio}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded text-foreground text-sm font-mono transition-colors min-h-[44px]"
          >
            ▶ Start audio
          </button>
        ) : (
          <span className="px-3 py-1 bg-violet-500/20 text-violet-300/95 rounded text-sm font-mono">
            ● playing
          </span>
        )}
        <span className="text-muted-foreground/70 text-xs font-mono mx-1">add:</span>
        {(["oscillator", "gain", "filter", "delay"] as NodeKind[]).map(k => (
          <button
            key={k}
            onClick={() => addNode(k)}
            className="px-3 py-1.5 rounded text-foreground text-sm font-mono hover:text-foreground transition-colors min-h-[36px]"
            style={{ background: KIND_COLOR[k] + "33", border: `1px solid ${KIND_COLOR[k]}66` }}
          >
            + {KIND_LABEL[k]}
          </button>
        ))}
        {!hasDestination && (
          <button
            onClick={() => addNode("destination")}
            className="px-3 py-1.5 rounded text-foreground text-sm font-mono hover:text-foreground transition-colors min-h-[36px]"
            style={{ background: KIND_COLOR.destination + "33", border: `1px solid ${KIND_COLOR.destination}66` }}
          >
            + Speakers
          </button>
        )}
        <span className="text-muted-foreground/70 text-xs font-mono ml-auto">
          {pendingFrom ? "click an input port to connect →" : "click output port ● to start a wire"}
        </span>
      </div>

      {error && (
        <div className="px-5 py-2 text-violet-300 text-sm font-mono bg-violet-500/10">{error}</div>
      )}

      {/* Instructions */}
      {!running && (
        <div className="px-5 py-3 text-muted-foreground text-sm font-mono border-b border-border">
          Press <span className="text-violet-300">▶ Start audio</span> to hear the patch.
          Drag node cards to rearrange. Click a <span className="text-muted-foreground">right port</span> then a <span className="text-muted-foreground">left port</span> to wire them.
          Click a wire label to remove it.
        </div>
      )}

      {/* Canvas board */}
      <div
        ref={boardRef}
        className="flex-1 relative overflow-hidden"
        style={{ minHeight: 480 }}
        onPointerMove={onPointerMoveBoard}
        onPointerUp={onPointerUpBoard}
        onClick={onClickBoard}
      >
        {/* Wire canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 1 }}
        />

        {/* Wire remove buttons — rendered mid-wire */}
        {graph.wires.map(w => {
          const from = graph.nodes.find(n => n.id === w.fromId);
          const to = graph.nodes.find(n => n.id === w.toId);
          if (!from || !to) return null;
          const p1 = portPos(from, "out");
          const p2 = portPos(to, "in");
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          return (
            <button
              key={w.id}
              onClick={e => { e.stopPropagation(); removeWire(w.id); }}
              title="Remove wire"
              className="absolute w-5 h-5 rounded-full text-xs flex items-center justify-center hover:bg-violet-500/80 bg-violet-500/40 text-violet-200 transition-colors"
              style={{ left: mx - 10, top: my - 10, zIndex: 3 }}
            >
              ×
            </button>
          );
        })}

        {/* Node cards */}
        {graph.nodes.map(node => (
          <NodeCard
            key={node.id}
            node={node}
            pending={pendingFrom}
            onPointerDown={onPointerDownNode}
            onClickOut={onClickOutPort}
            onClickIn={onClickInPort}
            onParam={(key, val) => dispatch({ type: "SET_PARAM", id: node.id, key, value: val })}
            onRemove={node.kind !== "destination" ? () => dispatch({ type: "REMOVE_NODE", id: node.id }) : undefined}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-2 border-t border-border flex justify-between items-center">
        <span className="text-muted-foreground/70 text-xs font-mono">
          {graph.nodes.length} nodes · {graph.wires.length} wires
        </span>
        <Link href="/dream/78-node-synth/README.md" className="text-muted-foreground/70 text-xs hover:text-muted-foreground transition-colors">
          design notes ↗
        </Link>
      </div>
    </div>
  );
}

// ─── NodeCard ─────────────────────────────────────────────────────────────────

interface CardProps {
  node: NodeDef;
  pending: string | null;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onClickOut: (e: React.MouseEvent, id: string) => void;
  onClickIn: (e: React.MouseEvent, id: string) => void;
  onParam: (key: string, value: number | string) => void;
  onRemove?: () => void;
}

function NodeCard({ node, pending, onPointerDown, onClickOut, onClickIn, onParam, onRemove }: CardProps) {
  const color = KIND_COLOR[node.kind];
  const isSource = pending === node.id;

  return (
    <div
      className="absolute rounded-lg border select-none"
      style={{
        left: node.x,
        top: node.y,
        width: CARD_W,
        zIndex: 2,
        background: "#111",
        borderColor: color + "88",
        boxShadow: isSource ? `0 0 0 2px ${color}` : undefined,
        cursor: "grab",
      }}
      onPointerDown={e => onPointerDown(e, node.id)}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-2.5 py-1.5 rounded-t-lg text-xs font-mono font-bold"
        style={{ background: color + "33", borderBottom: `1px solid ${color}44` }}
      >
        <span style={{ color }}>{KIND_LABEL[node.kind]}</span>
        {onRemove && (
          <button
            data-control="true"
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="text-muted-foreground/70 hover:text-violet-300 transition-colors leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Params */}
      <div className="px-2.5 py-2 space-y-1.5" data-control="true">
        {node.kind === "oscillator" && (
          <>
            <ParamSlider label="freq" value={Number(node.params.freq)} min={40} max={2000} log onChange={v => onParam("freq", v)} unit="Hz" />
            <ParamSlider label="detune" value={Number(node.params.detune)} min={-1200} max={1200} onChange={v => onParam("detune", v)} unit="¢" />
            <ParamSelect label="wave" value={String(node.params.type)} options={["sine","triangle","sawtooth","square"]} onSelect={v => onParam("type", v)} />
          </>
        )}
        {node.kind === "gain" && (
          <ParamSlider label="gain" value={Number(node.params.gain)} min={0} max={1} step={0.01} onChange={v => onParam("gain", v)} />
        )}
        {node.kind === "filter" && (
          <>
            <ParamSlider label="freq" value={Number(node.params.freq)} min={80} max={18000} log onChange={v => onParam("freq", v)} unit="Hz" />
            <ParamSlider label="Q" value={Number(node.params.q)} min={0.1} max={20} step={0.1} onChange={v => onParam("q", v)} />
            <ParamSelect label="type" value={String(node.params.type)} options={["lowpass","highpass","bandpass","notch","peaking"]} onSelect={v => onParam("type", v)} />
          </>
        )}
        {node.kind === "delay" && (
          <>
            <ParamSlider label="time" value={Number(node.params.time)} min={0.01} max={2} step={0.01} onChange={v => onParam("time", v)} unit="s" />
            <ParamSlider label="feedback" value={Number(node.params.feedback)} min={0} max={0.95} step={0.01} onChange={v => onParam("feedback", v)} />
          </>
        )}
        {node.kind === "destination" && (
          <p className="text-muted-foreground text-xs font-mono">audio output</p>
        )}
      </div>

      {/* Ports */}
      {/* Input port (left) — all nodes except oscillator can receive */}
      {node.kind !== "oscillator" && (
        <div
          className="absolute"
          style={{ left: -PORT_R, top: 48, width: PORT_R * 2, height: PORT_R * 2, zIndex: 5 }}
        >
          <svg
            width={PORT_R * 2} height={PORT_R * 2}
            onClick={e => onClickIn(e, node.id)}
            style={{ cursor: "crosshair", display: "block" }}
          >
            <circle
              cx={PORT_R} cy={PORT_R} r={PORT_R - 1}
              fill={pending && pending !== node.id ? "#333" : "#222"}
              stroke={color}
              strokeWidth={2}
            />
          </svg>
        </div>
      )}

      {/* Output port (right) — all nodes except destination */}
      {node.kind !== "destination" && (
        <div
          className="absolute"
          style={{ right: -PORT_R, top: 48, width: PORT_R * 2, height: PORT_R * 2, zIndex: 5 }}
        >
          <svg
            width={PORT_R * 2} height={PORT_R * 2}
            onClick={e => onClickOut(e, node.id)}
            style={{ cursor: "crosshair", display: "block" }}
          >
            <circle
              cx={PORT_R} cy={PORT_R} r={PORT_R - 1}
              fill={isSource ? color : "#222"}
              stroke={color}
              strokeWidth={2}
            />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Param controls ───────────────────────────────────────────────────────────

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  log?: boolean;
  unit?: string;
  onChange: (v: number) => void;
}

function ParamSlider({ label, value, min, max, step = 1, log, unit, onChange }: SliderProps) {
  // For log sliders, convert to/from log scale for the <input range>
  const toSlider = (v: number) => log ? Math.log(v) : v;
  const fromSlider = (s: number) => log ? Math.exp(s) : s;
  const sliderMin = log ? Math.log(min) : min;
  const sliderMax = log ? Math.log(max) : max;
  const sliderStep = log ? (sliderMax - sliderMin) / 200 : step;

  const display = value < 10 ? value.toFixed(2) : Math.round(value).toString();

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-xs font-mono w-12 shrink-0">{label}</span>
      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={sliderStep}
        value={toSlider(value)}
        onChange={e => onChange(fromSlider(Number(e.target.value)))}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        className="flex-1 h-1 accent-violet-500"
      />
      <span className="text-muted-foreground text-xs font-mono w-14 text-right shrink-0">
        {display}{unit ?? ""}
      </span>
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
}

function ParamSelect({ label, value, options, onSelect }: SelectProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-xs font-mono w-12 shrink-0">{label}</span>
      <select
        value={value}
        onChange={e => onSelect(e.target.value)}
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        className="flex-1 bg-black/60 border border-border rounded text-foreground text-xs font-mono px-1 py-0.5"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
