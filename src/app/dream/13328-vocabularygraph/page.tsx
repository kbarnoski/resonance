"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 13328 · Vocabulary Graph — a living map of Karel's harmonic mind.
//
//   "What if listening to his ENTIRE catalog grew a force-directed constellation
//    where every distinct chord becomes a persistent node, every chord-to-chord
//    move thickens an edge, and node size grows with how CENTRAL that chord is to
//    his whole body of work (PageRank on the transition graph) — so over an hour
//    you watch the shape of how HE thinks harmonically self-organize?"
//
// Long-form MEMORY piece. All 16 verified tracks play back-to-back with a gapless
// equal-power crossfade. As his real chords stream by we accrete a directed
// chord-transition graph that is NEVER reset: nodes = distinct chords, edges =
// observed transitions (weight = count), node radius ∝ running PageRank
// centrality (damping 0.85, power iteration — the vega-mir method, live), layout
// = Fruchterman–Reingold-lite. The currently-sounding chord pulses.
//
// Renderer: raw WebGL2 (hand-written point + line shaders), Canvas2D fallback.
// Audio: Karel's real recordings only, through the ear-safety master bus.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  pitchClassHue,
  type TrackAnalysis,
  type TrackChord,
} from "../_shared/trackAnalysis";

const SEED = 0x13328;
const CROSSFADE = 2.0; // seconds of equal-power overlap between tracks
const DEMO_STEP_MS = 430; // seeded muted pre-warm pace
const PAGERANK_MS = 650; // how often PageRank re-runs over the graph
const STATS_MS = 240; // HUD refresh throttle
const DAMPING = 0.85; // PageRank damping factor

// ── seeded PRNG (mulberry32) — all layout jitter comes from here ─────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── HSL → linear-ish RGB (0..1) ──────────────────────────────────────────────
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

// ── the graph engine — the intellectual core ─────────────────────────────────
interface GNode {
  key: string;
  count: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pc: number;
  hasPc: boolean;
  minor: boolean;
  rank: number; // PageRank centrality
  radius: number; // px, derived from rank
}
interface GEdge {
  from: string;
  to: string;
  weight: number;
}

class GraphEngine {
  nodes = new Map<string, GNode>();
  edges = new Map<string, GEdge>();
  order: string[] = [];
  transitions = 0;
  private lastKey: string | null = null;
  private rand: () => number;

  constructor(seed: number) {
    this.rand = mulberry32(seed);
  }

  // Collapse slash inversions so "A#maj9/F" and "A#maj9" share one node.
  private normalize(symbol: string): string {
    return symbol.split("/")[0].trim();
  }

  /** Ingest one sounding chord; returns its node key (or null if unparseable). */
  ingest(symbol: string): string | null {
    const key = this.normalize(symbol);
    if (!key) return null;
    let n = this.nodes.get(key);
    if (!n) {
      const pc = chordRoot(key);
      const a = this.rand() * Math.PI * 2;
      const r = 0.04 + this.rand() * 0.16; // seeded spawn near center
      n = {
        key,
        count: 0,
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        vx: 0,
        vy: 0,
        pc: pc ?? 0,
        hasPc: pc !== null,
        minor: chordIsMinor(key),
        rank: 0,
        radius: 6,
      };
      this.nodes.set(key, n);
      this.order.push(key);
    }
    n.count += 1;
    // Directed edge on a genuine chord-to-chord MOVE (skip self-repeats).
    if (this.lastKey && this.lastKey !== key) {
      const ek = `${this.lastKey}${key}`;
      let e = this.edges.get(ek);
      if (!e) {
        e = { from: this.lastKey, to: key, weight: 0 };
        this.edges.set(ek, e);
      }
      e.weight += 1;
      this.transitions += 1;
    }
    this.lastKey = key;
    return key;
  }

  /** Power-iteration PageRank over the transition matrix (damping DAMPING). */
  computePageRank(): void {
    const N = this.order.length;
    if (N === 0) return;
    const outw = new Map<string, number>();
    this.edges.forEach((e) => outw.set(e.from, (outw.get(e.from) ?? 0) + e.weight));

    let pr = new Map<string, number>();
    this.order.forEach((k) => pr.set(k, 1 / N));

    for (let iter = 0; iter < 8; iter++) {
      let dangling = 0;
      this.order.forEach((k) => {
        if (!outw.has(k)) dangling += pr.get(k) ?? 0;
      });
      const base = (1 - DAMPING) / N + (DAMPING * dangling) / N;
      const next = new Map<string, number>();
      this.order.forEach((k) => next.set(k, base));
      this.edges.forEach((e) => {
        const share = DAMPING * (pr.get(e.from) ?? 0) * (e.weight / (outw.get(e.from) ?? 1));
        next.set(e.to, (next.get(e.to) ?? 0) + share);
      });
      pr = next;
    }

    let mx = 0;
    pr.forEach((v) => {
      if (v > mx) mx = v;
    });
    this.order.forEach((k) => {
      const n = this.nodes.get(k);
      if (!n) return;
      n.rank = pr.get(k) ?? 0;
      n.radius = 5 + 27 * Math.sqrt((pr.get(k) ?? 0) / (mx || 1));
    });
  }

  /** One Fruchterman–Reingold-lite integration step (velocity + damping). */
  stepLayout(): void {
    const N = this.order.length;
    if (N < 2) return;
    const k = 0.9 * Math.sqrt(4 / N); // ideal edge length in world units
    const nodes = this.order.map((key) => this.nodes.get(key)!);

    const fx = new Float64Array(N);
    const fy = new Float64Array(N);

    // Repulsion between all pairs (O(n²) — his vocabulary is < 100 chords).
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d = Math.hypot(dx, dy);
        if (d < 1e-3) {
          // coincident: nudge apart with seeded jitter
          dx = (this.rand() - 0.5) * 1e-2;
          dy = (this.rand() - 0.5) * 1e-2;
          d = Math.hypot(dx, dy) || 1e-3;
        }
        const rep = (k * k) / d;
        const ux = dx / d;
        const uy = dy / d;
        fx[i] += ux * rep;
        fy[i] += uy * rep;
        fx[j] -= ux * rep;
        fy[j] -= uy * rep;
      }
    }

    // Attraction along transition edges (spring, stronger with weight).
    const idx = new Map<string, number>();
    this.order.forEach((key, i) => idx.set(key, i));
    this.edges.forEach((e) => {
      const ia = idx.get(e.from);
      const ib = idx.get(e.to);
      if (ia === undefined || ib === undefined) return;
      const a = nodes[ia];
      const b = nodes[ib];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-3;
      const att = ((d * d) / k) * (1 + 0.35 * Math.log2(e.weight + 1));
      const ux = dx / d;
      const uy = dy / d;
      fx[ia] += ux * att;
      fy[ia] += uy * att;
      fx[ib] -= ux * att;
      fy[ib] -= uy * att;
    });

    // Mild gravity to center + seeded jitter, then integrate with damping.
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      fx[i] += -n.x * 0.9 + (this.rand() - 0.5) * 0.02;
      fy[i] += -n.y * 0.9 + (this.rand() - 0.5) * 0.02;
      n.vx = (n.vx + fx[i] * 0.02) * 0.82;
      n.vy = (n.vy + fy[i] * 0.02) * 0.82;
      const sp = Math.hypot(n.vx, n.vy);
      const cap = 0.05;
      if (sp > cap) {
        n.vx = (n.vx / sp) * cap;
        n.vy = (n.vy / sp) * cap;
      }
      n.x += n.vx;
      n.y += n.vy;
    }
  }

  /** The most-recently ingested node key (carried across the demo → live handoff). */
  lastKeyPublic(): string | null {
    return this.lastKey;
  }

  /** Top-N node keys by PageRank (for the HUD "central vocabulary" readout). */
  topKeys(n: number): string[] {
    return [...this.order]
      .sort((a, b) => (this.nodes.get(b)?.rank ?? 0) - (this.nodes.get(a)?.rank ?? 0))
      .slice(0, n);
  }
}

// ── WebGL2 shader helpers ────────────────────────────────────────────────────
function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile: ${log}`);
  }
  return sh;
}
function linkProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("createProgram failed");
  const v = compileShader(gl, gl.VERTEX_SHADER, vs);
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`program link: ${log}`);
  }
  return p;
}

const NODE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in float a_size;
layout(location=2) in vec3 a_color;
layout(location=3) in float a_pulse;
out vec3 v_color; out float v_pulse;
void main(){
  gl_Position = vec4(a_pos, 0.0, 1.0);
  gl_PointSize = a_size * (1.0 + 0.55 * a_pulse);
  v_color = a_color; v_pulse = a_pulse;
}`;
const NODE_FS = `#version 300 es
precision highp float;
in vec3 v_color; in float v_pulse; out vec4 o;
void main(){
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  float disc = smoothstep(1.0, 0.72, r);
  if (disc <= 0.0) discard;
  vec3 violet = vec3(0.49, 0.36, 1.0);       // restrained brand accent = live
  vec3 col = mix(v_color, violet, v_pulse * 0.7) + v_pulse * 0.18;
  float rim = smoothstep(0.72, 1.0, r);
  col *= (1.0 - 0.28 * rim);                  // graphite rim for ink-on-paper read
  o = vec4(col, disc);
}`;
const EDGE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_color;
out vec4 v_color;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); v_color = a_color; }`;
const EDGE_FS = `#version 300 es
precision highp float;
in vec4 v_color; out vec4 o;
void main(){ o = v_color; }`;

interface View {
  cx: number;
  cy: number;
  s: number;
}

interface GLRenderer {
  draw(g: GraphEngine, view: View, dpr: number, w: number, h: number, live: string | null, pulse: number): void;
  dispose(): void;
}

function makeGLRenderer(gl: WebGL2RenderingContext): GLRenderer {
  const nodeProg = linkProgram(gl, NODE_VS, NODE_FS);
  const edgeProg = linkProgram(gl, EDGE_VS, EDGE_FS);
  const nodeVao = gl.createVertexArray()!;
  const edgeVao = gl.createVertexArray()!;
  const nodeBuf = gl.createBuffer()!;
  const edgeBuf = gl.createBuffer()!;
  const maxPoint = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1] || 64;

  // node VAO: interleaved [x,y, size, r,g,b, pulse] stride 7
  gl.bindVertexArray(nodeVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuf);
  const NST = 7 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, NST, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, NST, 2 * 4);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, NST, 3 * 4);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, NST, 6 * 4);

  // edge VAO: interleaved [x,y, r,g,b,a] stride 6
  gl.bindVertexArray(edgeVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuf);
  const EST = 6 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, EST, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, EST, 2 * 4);
  gl.bindVertexArray(null);

  let nodeArr = new Float32Array(0);
  let edgeArr = new Float32Array(0);

  const draw: GLRenderer["draw"] = (g, view, dpr, w, h, live, pulse) => {
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.066, 0.07, 0.086, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const aspect = w / h;
    const w2cx = (x: number) => (x - view.cx) * view.s / aspect;
    const w2cy = (y: number) => (y - view.cy) * view.s;

    // ── edges as thin quads (2 triangles) — thickness & alpha ∝ weight ──────
    const ecount = g.edges.size;
    const need = ecount * 6 * 6;
    if (edgeArr.length < need) edgeArr = new Float32Array(need);
    let ei = 0;
    g.edges.forEach((e) => {
      const a = g.nodes.get(e.from);
      const b = g.nodes.get(e.to);
      if (!a || !b) return;
      const ax = w2cx(a.x);
      const ay = w2cy(a.y);
      const bx = w2cx(b.x);
      const by = w2cy(b.y);
      // perpendicular in pixel space so thickness is uniform on screen
      let dx = (bx - ax) * (w / 2);
      let dy = (by - ay) * (h / 2);
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      const halfPx = Math.min(4, 0.6 + 0.55 * Math.log2(e.weight + 1)) * dpr * 0.5;
      const ox = (-dy * halfPx) / (w / 2);
      const oy = (dx * halfPx) / (h / 2);
      const isLive = e.from === live || e.to === live;
      let r = 0.42;
      let gg = 0.45;
      let bb = 0.52;
      let al = Math.min(0.5, 0.05 + 0.11 * Math.log2(e.weight + 1));
      if (isLive) {
        r = 0.49;
        gg = 0.4;
        bb = 1.0;
        al = Math.min(0.8, al + 0.3);
      }
      const push = (x: number, y: number) => {
        edgeArr[ei++] = x;
        edgeArr[ei++] = y;
        edgeArr[ei++] = r;
        edgeArr[ei++] = gg;
        edgeArr[ei++] = bb;
        edgeArr[ei++] = al;
      };
      push(ax + ox, ay + oy);
      push(ax - ox, ay - oy);
      push(bx + ox, by + oy);
      push(ax - ox, ay - oy);
      push(bx - ox, by - oy);
      push(bx + ox, by + oy);
    });
    if (ei > 0) {
      gl.useProgram(edgeProg);
      gl.bindVertexArray(edgeVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, edgeArr.subarray(0, ei), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, ei / 6);
    }

    // ── nodes as points (soft discs, size ∝ PageRank) ──────────────────────
    const ncount = g.nodes.size;
    const nneed = ncount * 7;
    if (nodeArr.length < nneed) nodeArr = new Float32Array(nneed);
    let ni = 0;
    g.nodes.forEach((n) => {
      const [r, gg, bb] = n.hasPc
        ? hslToRgb(pitchClassHue(n.pc), n.minor ? 0.14 : 0.26, 0.8)
        : [0.72, 0.73, 0.77];
      const size = Math.min(maxPoint, Math.max(5, n.radius) * 2 * dpr);
      nodeArr[ni++] = w2cx(n.x);
      nodeArr[ni++] = w2cy(n.y);
      nodeArr[ni++] = size;
      nodeArr[ni++] = r;
      nodeArr[ni++] = gg;
      nodeArr[ni++] = bb;
      nodeArr[ni++] = n.key === live ? pulse : 0;
    });
    if (ni > 0) {
      gl.useProgram(nodeProg);
      gl.bindVertexArray(nodeVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, nodeArr.subarray(0, ni), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.POINTS, 0, ncount);
    }
    gl.bindVertexArray(null);
  };

  const dispose = () => {
    gl.deleteProgram(nodeProg);
    gl.deleteProgram(edgeProg);
    gl.deleteVertexArray(nodeVao);
    gl.deleteVertexArray(edgeVao);
    gl.deleteBuffer(nodeBuf);
    gl.deleteBuffer(edgeBuf);
  };

  return { draw, dispose };
}

// ── Canvas2D fallback — same node-link graph, discs + lines ──────────────────
function makeCanvasRenderer(ctx: CanvasRenderingContext2D): GLRenderer {
  const draw: GLRenderer["draw"] = (g, view, dpr, w, h, live, pulse) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, w, h);
    const aspect = w / h;
    const px = (x: number) => (((x - view.cx) * view.s) / aspect * 0.5 + 0.5) * w;
    const py = (y: number) => (1 - ((y - view.cy) * view.s * 0.5 + 0.5)) * h;

    g.edges.forEach((e) => {
      const a = g.nodes.get(e.from);
      const b = g.nodes.get(e.to);
      if (!a || !b) return;
      const isLive = e.from === live || e.to === live;
      ctx.lineWidth = Math.min(4, 0.6 + 0.55 * Math.log2(e.weight + 1)) * dpr;
      const al = Math.min(0.5, 0.05 + 0.11 * Math.log2(e.weight + 1));
      ctx.strokeStyle = isLive
        ? `rgba(126,92,255,${Math.min(0.8, al + 0.3)})`
        : `rgba(107,115,133,${al})`;
      ctx.beginPath();
      ctx.moveTo(px(a.x), py(a.y));
      ctx.lineTo(px(b.x), py(b.y));
      ctx.stroke();
    });

    g.nodes.forEach((n) => {
      const [r, gg, bb] = n.hasPc
        ? hslToRgb(pitchClassHue(n.pc), n.minor ? 0.14 : 0.26, 0.8)
        : [0.72, 0.73, 0.77];
      const isLive = n.key === live;
      const rad = Math.max(4, n.radius) * dpr * (isLive ? 1 + 0.35 * pulse : 1);
      ctx.beginPath();
      ctx.arc(px(n.x), py(n.y), rad, 0, Math.PI * 2);
      if (isLive) {
        const t = pulse * 0.7;
        ctx.fillStyle = `rgb(${Math.round((r * (1 - t) + 0.49 * t) * 255)},${Math.round(
          (gg * (1 - t) + 0.36 * t) * 255,
        )},${Math.round((bb * (1 - t) + 1.0 * t) * 255)})`;
      } else {
        ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(gg * 255)},${Math.round(bb * 255)})`;
      }
      ctx.fill();
    });
  };
  return { draw, dispose: () => {} };
}

// ── playback voice ───────────────────────────────────────────────────────────
interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  start: number; // ctx time
  buffer: AudioBuffer;
  index: number;
  chords: TrackChord[];
  ptr: number;
  fading: boolean;
  stopAt: number;
}
interface Prefetch {
  buffer: AudioBuffer;
  analysis: TrackAnalysis | null;
  index: number;
  title: string;
}

interface Stats {
  mode: "demo" | "playing" | "complete";
  index: number;
  title: string;
  elapsed: number;
  nodes: number;
  transitions: number;
  live: string | null;
  top: string[];
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function VocabularyGraphPage() {
  const [started, setStarted] = useState(false);
  const [renderMode, setRenderMode] = useState<"webgl2" | "canvas2d" | "">("");
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stats, setStats] = useState<Stats>({
    mode: "demo",
    index: 0,
    title: "",
    elapsed: 0,
    nodes: 0,
    transitions: 0,
    live: null,
    top: [],
  });

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cpuCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const rendererRef = useRef<GLRenderer | null>(null);
  const modeRef = useRef<"webgl2" | "canvas2d" | "">("");
  const engineRef = useRef<GraphEngine>(new GraphEngine(SEED));
  const viewRef = useRef<View>({ cx: 0, cy: 0, s: 1.4 });

  const rafRef = useRef(0);
  const liveKeyRef = useRef<string | null>(null);
  const energyRef = useRef(0);
  const playingRef = useRef(false);
  const completeRef = useRef(false);

  // muted demo pre-warm state
  const demoRef = useRef<{ chords: TrackChord[]; ptr: number; acc: number } | null>(null);

  // audio / playback state
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const voicesRef = useRef<Voice[]>([]);
  const prefetchRef = useRef<Prefetch | null>(null);
  const prefetchPromiseRef = useRef<Promise<Prefetch | null> | null>(null);
  const prefetchingRef = useRef(false);
  const fadeInRef = useRef<Float32Array | null>(null);
  const fadeOutRef = useRef<Float32Array | null>(null);

  // ── load the next PLAYABLE track (skipping any that fail) ─────────────────
  const loadNextPlayable = useCallback(async (from: number): Promise<Prefetch | null> => {
    const ctx = ctxRef.current;
    if (!ctx) return null;
    for (let i = from; i < REAL_TRACKS.length; i++) {
      const id = REAL_TRACKS[i].id;
      try {
        const [buf, analysis] = await Promise.all([
          loadRealTrackBuffer(ctx, id),
          loadTrackAnalysis(id).catch(() => null),
        ]);
        return { buffer: buf.buffer, analysis, index: i, title: REAL_TRACKS[i].title };
      } catch {
        // track failed to load — degrade gracefully, try the next one
        continue;
      }
    }
    return null;
  }, []);

  const kickPrefetch = useCallback(
    (fromIndex: number) => {
      if (prefetchingRef.current) return;
      prefetchingRef.current = true;
      prefetchRef.current = null;
      const p = loadNextPlayable(fromIndex).then((pf) => {
        prefetchRef.current = pf;
        prefetchingRef.current = false;
        return pf;
      });
      prefetchPromiseRef.current = p;
    },
    [loadNextPlayable],
  );

  // ── make + start a voice for a prefetched track ───────────────────────────
  const makeVoice = useCallback((pf: Prefetch): Voice => {
    const ctx = ctxRef.current!;
    const master = masterRef.current!;
    const gain = ctx.createGain();
    const source = ctx.createBufferSource();
    source.buffer = pf.buffer;
    source.connect(gain);
    gain.connect(master.input);
    return {
      source,
      gain,
      start: 0,
      buffer: pf.buffer,
      index: pf.index,
      chords: pf.analysis?.chords ?? [],
      ptr: 0,
      fading: false,
      stopAt: Infinity,
    };
  }, []);

  // ── Play: swap the muted demo for real, gapless catalog playback ──────────
  const handlePlay = useCallback(async () => {
    if (started) return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      await ctx.resume();
    } catch {
      setError("Could not start audio on this device.");
      return;
    }
    ctxRef.current = ctx;
    masterRef.current = createSafeMaster(ctx);
    analyserDataRef.current = new Uint8Array(
      new ArrayBuffer(masterRef.current.analyser.fftSize),
    );

    // equal-power crossfade curves
    const CN = 64;
    const fin = new Float32Array(CN);
    const fout = new Float32Array(CN);
    for (let i = 0; i < CN; i++) {
      const t = i / (CN - 1);
      fin[i] = Math.sin((t * Math.PI) / 2);
      fout[i] = Math.cos((t * Math.PI) / 2);
    }
    fadeInRef.current = fin;
    fadeOutRef.current = fout;

    setNotice("Loading Karel's catalog…");
    const first = await loadNextPlayable(0);
    if (!first) {
      setError("None of Karel's tracks could be loaded right now.");
      try {
        masterRef.current?.disconnect();
        await ctx.close();
      } catch {
        /* noop */
      }
      ctxRef.current = null;
      return;
    }
    setNotice("");

    const voice = makeVoice(first);
    const now = ctx.currentTime;
    voice.gain.gain.setValueAtTime(0, now);
    voice.gain.gain.linearRampToValueAtTime(1, now + 0.05); // click-free entry
    voice.source.start(now);
    voice.start = now;
    voicesRef.current = [voice];

    // demo hands off to real audio; graph is NEVER reset (demo pre-warmed it)
    demoRef.current = null;
    liveKeyRef.current = engineRef.current.lastKeyPublic();
    playingRef.current = true;
    completeRef.current = false;
    kickPrefetch(first.index + 1);
    setStarted(true);
  }, [started, loadNextPlayable, makeVoice, kickPrefetch]);

  // ── mount: build renderer, start the persistent loop, pre-warm demo ───────
  useEffect(() => {
    const wrap = wrapRef.current;
    const glCanvas = glCanvasRef.current;
    if (!wrap || !glCanvas) return;

    // renderer selection
    let mode: "webgl2" | "canvas2d" = "canvas2d";
    const gl = glCanvas.getContext("webgl2", { antialias: true, alpha: false });
    if (gl) {
      try {
        rendererRef.current = makeGLRenderer(gl);
        glRef.current = gl;
        mode = "webgl2";
      } catch {
        rendererRef.current = null;
      }
    }
    if (mode !== "webgl2") {
      const cpu = cpuCanvasRef.current?.getContext("2d");
      if (cpu) {
        rendererRef.current = makeCanvasRenderer(cpu);
        setNotice("WebGL2 unavailable — drawing the same graph on Canvas2D.");
      }
    }
    modeRef.current = mode;
    setRenderMode(mode);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const doResize = () => {
      const r = wrap.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width * dpr));
      const h = Math.max(1, Math.floor(r.height * dpr));
      if (glCanvas) {
        glCanvas.width = w;
        glCanvas.height = h;
      }
      const cpu = cpuCanvasRef.current;
      if (cpu) {
        cpu.width = w;
        cpu.height = h;
      }
    };
    doResize();
    const ro = new ResizeObserver(doResize);
    ro.observe(wrap);

    // seeded muted demo: pre-fetch track 0 analysis and stream its chords in
    let demoCancelled = false;
    loadTrackAnalysis(REAL_TRACKS[0].id)
      .then((a) => {
        if (demoCancelled || !a || a.chords.length === 0) return;
        if (playingRef.current) return; // user already pressed Play
        demoRef.current = { chords: a.chords, ptr: 0, acc: 0 };
      })
      .catch(() => {
        /* demo is optional; the real graph grows on Play */
      });

    let lastT = performance.now();
    let prAcc = 0;
    let statAcc = 0;

    const readEnergy = (): number => {
      const master = masterRef.current;
      const data = analyserDataRef.current;
      if (!master || !data) return 0;
      master.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / data.length);
    };

    const advanceDemo = (dtMs: number) => {
      const d = demoRef.current;
      if (!d) return;
      d.acc += dtMs;
      while (d.acc >= DEMO_STEP_MS && d.ptr < d.chords.length) {
        d.acc -= DEMO_STEP_MS;
        const key = engineRef.current.ingest(d.chords[d.ptr].chord);
        if (key) liveKeyRef.current = key;
        d.ptr += 1;
      }
    };

    const advancePlayback = () => {
      const ctx = ctxRef.current;
      const voices = voicesRef.current;
      if (!ctx || voices.length === 0) return;
      const nowC = ctx.currentTime;
      const primary = voices[voices.length - 1];

      // stream this track's chords against playback position
      const elapsed = nowC - primary.start;
      while (primary.ptr < primary.chords.length && primary.chords[primary.ptr].time <= elapsed) {
        const key = engineRef.current.ingest(primary.chords[primary.ptr].chord);
        if (key) liveKeyRef.current = key;
        primary.ptr += 1;
      }

      // begin the equal-power crossfade ~CROSSFADE before the track ends
      if (!primary.fading && elapsed >= primary.buffer.duration - CROSSFADE) {
        const pf = prefetchRef.current;
        if (pf && pf.buffer) {
          const next = makeVoice(pf);
          const T0 = ctx.currentTime;
          next.gain.gain.setValueAtTime(0, T0);
          next.gain.gain.setValueCurveAtTime(fadeInRef.current!, T0, CROSSFADE);
          next.source.start(T0);
          next.start = T0;
          primary.gain.gain.setValueCurveAtTime(fadeOutRef.current!, T0, CROSSFADE);
          primary.source.stop(T0 + CROSSFADE + 0.05);
          primary.fading = true;
          primary.stopAt = T0 + CROSSFADE;
          voices.push(next);
          prefetchRef.current = null;
          kickPrefetch(pf.index + 1);
        } else if (!prefetchingRef.current && prefetchPromiseRef.current === null) {
          // nothing left to load — let the track finish, then we're complete
        }
      }

      // retire finished fading voices
      voicesRef.current = voices.filter((v) => {
        if (v.fading && nowC >= v.stopAt) {
          try {
            v.source.disconnect();
            v.gain.disconnect();
          } catch {
            /* already gone */
          }
          return false;
        }
        return true;
      });

      // end-of-catalog detection
      const last = voicesRef.current[voicesRef.current.length - 1];
      if (
        last &&
        !last.fading &&
        nowC - last.start >= last.buffer.duration &&
        !prefetchRef.current &&
        !prefetchingRef.current
      ) {
        if (!completeRef.current) {
          completeRef.current = true;
          playingRef.current = false;
        }
      }
    };

    const fit = () => {
      // auto-fit the view to the current graph, smoothed (calm re-centering)
      const eng = engineRef.current;
      if (eng.order.length === 0) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      eng.nodes.forEach((n) => {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x;
        if (n.y > maxY) maxY = n.y;
      });
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const halfW = Math.max(0.5, (maxX - minX) / 2 + 0.2);
      const halfH = Math.max(0.5, (maxY - minY) / 2 + 0.2);
      const w = glCanvasRef.current?.width || 1;
      const h = glCanvasRef.current?.height || 1;
      const aspect = w / h;
      const s = Math.min((0.9 * aspect) / halfW, 0.9 / halfH);
      const v = viewRef.current;
      v.cx += (cx - v.cx) * 0.05;
      v.cy += (cy - v.cy) * 0.05;
      v.s += (s - v.s) * 0.05;
    };

    const loop = () => {
      const now = performance.now();
      const dt = now - lastT;
      lastT = now;
      const t = now / 1000;

      // energy → pulse of the live node (real analyser, or seeded demo pulse)
      let energy: number;
      if (playingRef.current) energy = readEnergy() * 2.2;
      else energy = 0.32 + 0.28 * (0.5 + 0.5 * Math.sin(t * 2.4));
      energyRef.current += (Math.min(1, energy) - energyRef.current) * 0.2;

      if (playingRef.current) advancePlayback();
      else advanceDemo(dt);

      // PageRank re-runs periodically over the accreted transition matrix
      prAcc += dt;
      if (prAcc >= PAGERANK_MS) {
        prAcc = 0;
        engineRef.current.computePageRank();
      }

      engineRef.current.stepLayout();
      fit();

      const renderer = rendererRef.current;
      const w = glCanvasRef.current?.width || 1;
      const h = glCanvasRef.current?.height || 1;
      if (renderer) {
        renderer.draw(
          engineRef.current,
          viewRef.current,
          dpr,
          w,
          h,
          liveKeyRef.current,
          energyRef.current,
        );
      }

      // HUD stats (throttled)
      statAcc += dt;
      if (statAcc >= STATS_MS) {
        statAcc = 0;
        const eng = engineRef.current;
        const voices = voicesRef.current;
        const primary = voices[voices.length - 1];
        let mode2: Stats["mode"] = "demo";
        let index = 0;
        let title = REAL_TRACKS[0].title;
        let elapsed = 0;
        if (completeRef.current) {
          mode2 = "complete";
          if (primary) {
            index = primary.index;
            title = REAL_TRACKS[primary.index]?.title ?? title;
          }
        } else if (playingRef.current && primary) {
          mode2 = "playing";
          index = primary.index;
          title = REAL_TRACKS[primary.index]?.title ?? title;
          elapsed = (ctxRef.current?.currentTime ?? 0) - primary.start;
        }
        setStats({
          mode: mode2,
          index,
          title,
          elapsed,
          nodes: eng.nodes.size,
          transitions: eng.transitions,
          live: liveKeyRef.current,
          top: eng.topKeys(3),
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      demoCancelled = true;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [kickPrefetch, makeVoice]);

  // ── full teardown on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      voicesRef.current.forEach((v) => {
        try {
          v.source.stop();
          v.source.disconnect();
          v.gain.disconnect();
        } catch {
          /* already stopped */
        }
      });
      voicesRef.current = [];
      try {
        masterRef.current?.disconnect();
      } catch {
        /* noop */
      }
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
      ctxRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      const gl = glRef.current;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      glRef.current = null;
    };
  }, []);

  const readout =
    stats.mode === "demo"
      ? `demo · pre-warming · ${stats.nodes} chords · ${stats.transitions} transitions`
      : `track ${stats.index + 1}/${REAL_TRACKS.length} · "${stats.title}" · ${fmtTime(
          stats.elapsed,
        )} · ${stats.nodes} chords · ${stats.transitions} transitions${
          stats.mode === "complete" ? " · catalog complete" : ""
        }`;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Vocabulary Graph
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          His entire catalog, played back-to-back, grows a living map of his harmonic
          vocabulary — every chord a node, every move an edge, sized by PageRank
          centrality as the network self-organizes.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={handlePlay}
            disabled={started}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {started ? "Playing the catalog" : "Play the whole catalog"}
          </button>
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* graph stage */}
        <div
          ref={wrapRef}
          className="relative mt-5 aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-[#111318] sm:aspect-[16/10]"
        >
          <canvas ref={glCanvasRef} className="absolute inset-0 h-full w-full" />
          {renderMode === "canvas2d" && (
            <canvas ref={cpuCanvasRef} className="absolute inset-0 h-full w-full" />
          )}

          {/* live readout */}
          <div className="pointer-events-none absolute left-3 top-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {readout}
          </div>
          {stats.live && (
            <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-xs">
              <span className="uppercase tracking-[0.18em] text-muted-foreground">now </span>
              <span className="text-primary">{stats.live}</span>
            </div>
          )}
          {stats.top.length > 0 && (
            <div className="pointer-events-none absolute bottom-3 right-3 text-right font-mono text-xs">
              <span className="uppercase tracking-[0.18em] text-muted-foreground">central </span>
              <span className="text-foreground">{stats.top.join(" · ")}</span>
            </div>
          )}
        </div>

        {notice && !error && (
          <p className="mt-3 text-base text-muted-foreground">{notice}</p>
        )}
        {error && <p className="mt-3 text-base text-destructive">{error}</p>}
        {!error && (
          <p className="mt-3 text-base text-muted-foreground">
            {renderMode === "webgl2"
              ? "Raw WebGL2 node-link graph · PageRank (damping 0.85) + Fruchterman–Reingold layout, accreting and never reset."
              : "Canvas2D node-link graph · PageRank + force-directed layout, accreting and never reset."}
          </p>
        )}

        <div className="mt-6">
          <a
            href="/dream"
            className="text-base text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            ← back to the dream lab
          </a>
        </div>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              PageRank on his harmony
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Every distinct chord in Karel&apos;s analyzed catalog becomes a persistent
                node; each consecutive chord-to-chord move adds or thickens a directed edge.
                Nothing is ever reset across the 16 tracks — the memory is the whole accreted
                network.
              </p>
              <p>
                Node size is running{" "}
                <span className="text-foreground">PageRank centrality</span> (power iteration,
                damping 0.85) over the live transition matrix, re-computed roughly once a
                second, so the chords he leans on and returns to most swell largest. This is
                exactly the harmonic-graph method of{" "}
                <span className="text-foreground">
                  vega-mir, &ldquo;An information-theoretic toolkit for symbolic music&rdquo;
                  (arXiv:2605.16539)
                </span>
                , applied live to his real recordings.
              </p>
              <p>
                The constellation self-organizes with a{" "}
                <span className="text-foreground">Fruchterman–Reingold</span> force layout
                (all-pairs repulsion, edge springs weighted by transition count, mild gravity,
                seeded jitter). It sits in the lineage of the{" "}
                <span className="text-foreground">Tonnetz / Euler tonal network</span>. The
                currently-sounding chord pulses to the master-bus energy; color follows each
                chord&apos;s pitch-class hue, desaturated for minor.
              </p>
              <p>
                Rendered in raw WebGL2 (hand-written point + line shaders), with a Canvas2D
                fallback. Full method, references and honest limitations in{" "}
                <span className="text-foreground">README.md</span>.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["13328-vocabularygraph"]} />
    </main>
  );
}
