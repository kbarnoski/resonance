"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  type Node,
  type FieldStats,
  makeNode,
  makeCpuSim,
  stepCpuAgents,
  diffuseCpu,
  statsCpu,
  drawCpuField,
  accrete,
  type CpuSim,
} from "./physarum";
import { WebGL2Physarum, MAX_NODES } from "./gl";
import {
  computeDegrees,
  candidateEdges,
  clusteringFromAdjacency,
} from "./graph";
import { createAudio, type AudioEngine, type NodeSnapshot, type EdgeSnapshot } from "./audio";
import { DESIGN_NOTES } from "./notes";

const GL_FIELD = 512;
const GL_AGENTDIM = 512; // 512² = 262,144 agents per species (×2 ≈ 0.52M)
const GL_READ = 128;
const CPU_FIELD = 256;
const CPU_AGENTS = 9_000;

const FIELD_THRESHOLD = 0.28; // normalised brightness a filament must exceed
const EDGE_ON = 0.6; // segment coverage to LIGHT an edge
const EDGE_OFF = 0.42; // drops below this to extinguish (hysteresis)
const EDGE_MAX_RANGE = 0.52; // max normalised node separation for an edge
const EDGE_MIN_RANGE = 0.045;

type Path = "webgl2" | "cpu";

interface EdgeState {
  on: boolean;
  cov: number;
  aId: number;
  bId: number;
  aTone: number;
  bTone: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  flashUntil: number; // seconds — new-edge flash window
}

// Pre-seeded cosmic nodes with distinct JI tones so the web sings on entry.
function seedNodes(): Node[] {
  return [
    makeNode(0.32, 0.36, 1.0, 1.0, 0),
    makeNode(0.66, 0.4, 0.9, 0.9, 4),
    makeNode(0.5, 0.64, 1.0, 1.1, 2),
    makeNode(0.27, 0.68, 0.75, 0.7, 6),
    makeNode(0.72, 0.7, 0.85, 0.8, 5),
  ];
}

const edgeKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

export default function FilamentLatticePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>(seedNodes());
  const edgesRef = useRef<Map<string, EdgeState>>(new Map());
  const statsRef = useRef<FieldStats>({ energy: 0, panX: 0.5, panY: 0.5 });
  const audioRef = useRef<AudioEngine | null>(null);

  const [path, setPath] = useState<Path | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState({ nodes: 0, sumDeg: 0, edges: 0, peakClust: 0, agents: 0 });

  // Tap-to-seed a node (discrete clicks/taps — NOT drag).
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const onTap = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      const list = nodesRef.current;
      const alive = list.filter((n) => n.alive);
      if (alive.length >= MAX_NODES) {
        const weak = alive.reduce((a, b) => (a.mass < b.mass ? a : b));
        weak.strength = Math.min(1.8, weak.strength + 0.4);
        weak.mass += 0.4;
      } else {
        list.push(makeNode(x, y, 1.1, 0.9));
      }
    };
    el.addEventListener("pointerdown", onTap);
    return () => el.removeEventListener("pointerdown", onTap);
  }, []);

  // Main simulation loop (WebGL2 primary, CPU fallback). Runs on mount so the
  // piece is alive within ~2s; audio is layered on the first user gesture.
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;

    let raf = 0;
    let cancelled = false;
    let gl: WebGL2Physarum | null = null;
    let cpu: CpuSim | null = null;
    let cpuCanvas: HTMLCanvasElement | null = null;
    let cpu2d: CanvasRenderingContext2D | null = null;
    let cpuImg: ImageData | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    const octx = overlay.getContext("2d");
    let frame = 0;
    let sinceSeed = 0;
    let sinceAccrete = 0;
    let lastT = performance.now();

    const fitCanvases = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.offsetWidth * dpr);
      const h = Math.round(canvas.offsetHeight * dpr);
      canvas.width = w;
      canvas.height = h;
      overlay.width = w;
      overlay.height = h;
    };

    // Autonomous accretion: gravity drifts + merges nodes; new wells condense.
    const evolve = (dt: number) => {
      const list = nodesRef.current;
      for (const n of list) if (n.alive) n.strength = Math.max(0.3, n.strength - dt * 0.01);
      sinceAccrete += dt;
      if (sinceAccrete > 0.1) {
        const merges = accrete(list, sinceAccrete, 0.9);
        sinceAccrete = 0;
        if (merges > 0) {
          const a = audioRef.current;
          if (a) {
            const aliveList = list.filter((n) => n.alive);
            const heavy = aliveList.reduce((p, c) => (c.mass > p.mass ? c : p), aliveList[0]);
            if (heavy) a.coalesce(heavy.x, heavy.mass);
          }
        }
      }
      sinceSeed += dt;
      if (sinceSeed > 9) {
        sinceSeed = 0;
        const alive = list.filter((n) => n.alive);
        if (alive.length < MAX_NODES) {
          list.push(
            makeNode(0.14 + Math.random() * 0.72, 0.14 + Math.random() * 0.72, 0.7 + Math.random() * 0.4, 0.6 + Math.random() * 0.4),
          );
        }
      }
      if (frame % 300 === 0) nodesRef.current = list.filter((n) => n.alive);
    };

    // Extract degree + edges + clustering from a normalised field, run
    // hysteresis, fire new-edge chimes. Identical for both render paths.
    const analyseField = (field: Float32Array, fw: number, fh: number, nowSec: number) => {
      const list = nodesRef.current;
      const alive = list.filter((n) => n.alive);
      const byId = new Map<number, Node>();
      for (const n of alive) byId.set(n.id, n);

      // Degree (radial ray-count) -> smoothed onto each node.
      const degs = computeDegrees(field, fw, fh, alive, FIELD_THRESHOLD);
      for (const n of alive) {
        const d = degs.get(n.id) ?? 0;
        n.degree = n.degree * 0.7 + d * 0.3;
      }

      // Candidate edges -> hysteresis -> active adjacency.
      const cands = candidateEdges(field, fw, fh, alive, {
        threshold: FIELD_THRESHOLD,
        maxRange: EDGE_MAX_RANGE,
        minRange: EDGE_MIN_RANGE,
      });
      const map = edgesRef.current;
      const seen = new Set<string>();
      const a = audioRef.current;
      for (const c of cands) {
        const key = edgeKey(c.a, c.b);
        seen.add(key);
        const prev = map.get(key);
        const wasOn = prev?.on ?? false;
        const nowOn = c.coverage >= (wasOn ? EDGE_OFF : EDGE_ON);
        let flashUntil = prev?.flashUntil ?? 0;
        if (nowOn && !wasOn) {
          flashUntil = nowSec + 1.0;
          const na = byId.get(c.a);
          const nb = byId.get(c.b);
          if (a && na && nb) a.edgeChime((c.ax + c.bx) / 2, na.tone, nb.tone);
        }
        const na = byId.get(c.a);
        const nb = byId.get(c.b);
        map.set(key, {
          on: nowOn,
          cov: c.coverage,
          aId: c.a,
          bId: c.b,
          aTone: na?.tone ?? 0,
          bTone: nb?.tone ?? 0,
          ax: c.ax,
          ay: c.ay,
          bx: c.bx,
          by: c.by,
          flashUntil,
        });
      }
      for (const key of [...map.keys()]) if (!seen.has(key)) map.delete(key);

      // Clustering coefficient from the active-edge adjacency.
      const adjacency = new Map<number, Set<number>>();
      for (const n of alive) adjacency.set(n.id, new Set());
      for (const [, e] of map) {
        if (!e.on) continue;
        adjacency.get(e.aId)?.add(e.bId);
        adjacency.get(e.bId)?.add(e.aId);
      }
      const clust = clusteringFromAdjacency(alive.map((n) => n.id), adjacency);
      for (const n of alive) {
        const cv = clust.get(n.id) ?? 0;
        n.clustering = n.clustering * 0.8 + cv * 0.2;
      }
    };

    // Shared 2D overlay: glowing edges (new ones flash) + node markers.
    const drawOverlay = (nowSec: number) => {
      if (!octx) return;
      const W = overlay.width;
      const H = overlay.height;
      octx.clearRect(0, 0, W, H);
      octx.globalCompositeOperation = "lighter";
      const map = edgesRef.current;
      for (const [, e] of map) {
        if (!e.on) continue;
        const x0 = e.ax * W;
        const y0 = e.ay * H;
        const x1 = e.bx * W;
        const y1 = e.by * H;
        const flash = Math.max(0, (e.flashUntil - nowSec) / 1.0);
        const baseA = 0.18 + e.cov * 0.4;
        octx.lineWidth = 1 + e.cov * 2 + flash * 3;
        if (flash > 0) {
          octx.strokeStyle = `rgba(${210 + flash * 45 | 0}, ${230}, 255, ${(baseA + flash * 0.6).toFixed(3)})`;
        } else {
          octx.strokeStyle = `rgba(150, 220, 255, ${baseA.toFixed(3)})`;
        }
        octx.beginPath();
        octx.moveTo(x0, y0);
        octx.lineTo(x1, y1);
        octx.stroke();
      }
      // Node markers: ring brightness ~ degree, warmth ~ clustering.
      for (const n of nodesRef.current) {
        if (!n.alive) continue;
        const cx = n.x * W;
        const cy = n.y * H;
        const rad = Math.min(9, 3 + Math.sqrt(n.mass) * 1.6) * (H / 640);
        const heat = Math.min(1, n.clustering);
        const g = octx.createRadialGradient(cx, cy, 0, cx, cy, rad * 3);
        g.addColorStop(0, `rgba(255, ${200 + heat * 55 | 0}, ${140 + heat * 60 | 0}, 0.9)`);
        g.addColorStop(1, "rgba(255,200,140,0)");
        octx.fillStyle = g;
        octx.beginPath();
        octx.arc(cx, cy, rad * 3, 0, Math.PI * 2);
        octx.fill();
      }
      octx.globalCompositeOperation = "source-over";
    };

    const pushAudio = (nowSec: number) => {
      const a = audioRef.current;
      if (!a) return;
      const alive = nodesRef.current.filter((n) => n.alive);
      const snaps: NodeSnapshot[] = alive.map((n) => ({
        id: n.id,
        x: n.x,
        tone: n.tone,
        degree: n.degree,
        clustering: n.clustering,
        mass: n.mass,
      }));
      const edgeSnaps: EdgeSnapshot[] = [];
      let sumDeg = 0;
      let peak = 0;
      for (const n of alive) {
        sumDeg += n.degree;
        if (n.clustering > peak) peak = n.clustering;
      }
      for (const [key, e] of edgesRef.current) {
        if (!e.on) continue;
        edgeSnaps.push({ key, aTone: e.aTone, bTone: e.bTone, x: (e.ax + e.bx) / 2, strength: e.cov });
      }
      a.update(snaps, edgeSnaps, statsRef.current.energy, sumDeg, peak, nowSec);
    };

    const refreshHud = () => {
      const alive = nodesRef.current.filter((n) => n.alive);
      let sumDeg = 0;
      let peak = 0;
      for (const n of alive) {
        sumDeg += n.degree;
        if (n.clustering > peak) peak = n.clustering;
      }
      let edges = 0;
      for (const [, e] of edgesRef.current) if (e.on) edges++;
      setHud({
        nodes: alive.length,
        sumDeg,
        edges,
        peakClust: peak,
        agents: gl ? gl.agentsPerSpecies * 2 : CPU_AGENTS * 2,
      });
    };

    const runGl = (g: WebGL2Physarum) => {
      const tick = (now: number) => {
        if (cancelled || !gl) return;
        const dt = Math.min((now - lastT) / 1000, 0.1);
        lastT = now;
        const nowSec = now * 0.001;
        evolve(dt);
        const alive = nodesRef.current.filter((n) => n.alive);
        g.step(alive, nowSec);
        g.render(alive, canvas.width, canvas.height);
        frame++;
        if (frame % 4 === 0) {
          const { field, w, h } = g.readNormalisedField();
          analyseField(field, w, h, nowSec);
          let s = 0;
          for (let i = 0; i < field.length; i++) s += field[i];
          statsRef.current.energy = Math.min(1, (s / field.length) * 2.2);
        }
        drawOverlay(nowSec);
        pushAudio(nowSec);
        if (frame % 12 === 0) refreshHud();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const runCpu = () => {
      cpu = makeCpuSim(CPU_FIELD, CPU_FIELD, CPU_AGENTS);
      cpuCanvas = document.createElement("canvas");
      cpuCanvas.width = CPU_FIELD;
      cpuCanvas.height = CPU_FIELD;
      cpu2d = cpuCanvas.getContext("2d");
      ctx2d = canvas.getContext("2d");
      if (!cpu2d || !ctx2d) {
        setErr("Canvas 2D unavailable on this machine.");
        return;
      }
      cpuImg = cpu2d.createImageData(CPU_FIELD, CPU_FIELD);

      const tick = (now: number) => {
        if (cancelled || !cpu || !cpu2d || !cpuImg || !ctx2d) return;
        const dt = Math.min((now - lastT) / 1000, 0.1);
        lastT = now;
        const nowSec = now * 0.001;
        evolve(dt);
        const nl = nodesRef.current.filter((n) => n.alive);
        stepCpuAgents(cpu, nl);
        diffuseCpu(cpu, nl);
        statsRef.current = statsCpu(cpu);
        if (frame % 3 === 0) analyseField(cpu.norm, cpu.w, cpu.h, nowSec);
        drawCpuField(cpu, cpuImg);
        cpu2d.putImageData(cpuImg, 0, 0);
        ctx2d.imageSmoothingEnabled = true;
        ctx2d.drawImage(cpuCanvas!, 0, 0, canvas.width, canvas.height);
        frame++;
        drawOverlay(nowSec);
        pushAudio(nowSec);
        if (frame % 8 === 0) refreshHud();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    fitCanvases();
    const onResize = () => fitCanvases();
    window.addEventListener("resize", onResize);

    // Try raw WebGL2 first; fall back to CPU on any failure.
    let started = false;
    const glCtx = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (glCtx) {
      try {
        gl = new WebGL2Physarum(glCtx, GL_FIELD, GL_AGENTDIM, GL_READ);
        setPath("webgl2");
        runGl(gl);
        started = true;
      } catch (e) {
        gl = null;
        setErr(e instanceof Error ? `WebGL2 unavailable — CPU fallback (${e.message})` : "WebGL2 failed; CPU fallback");
      }
    }
    if (!started) {
      setPath("cpu");
      runCpu();
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      if (gl) gl.dispose();
    };
  }, []);

  // Mute toggle.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const t = a.ctx.currentTime;
    a.master.gain.cancelScheduledValues(t);
    a.master.gain.setTargetAtTime(muted ? 0 : 0.85, t, 0.3);
  }, [muted]);

  // Teardown audio on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  const startAudio = useCallback(async () => {
    if (audioRef.current) return;
    try {
      const eng = createAudio();
      await eng.resume();
      audioRef.current = eng;
      setAudioOn(true);
    } catch {
      // headless / no audio device — the sim keeps running silently
      setAudioOn(true);
    }
  }, []);

  return (
    <div className="relative w-full bg-black" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ background: "#05030f" }}
      />
      <canvas
        ref={overlayRef}
        onPointerDown={startAudio}
        className="absolute inset-0 h-full w-full"
        style={{ cursor: "crosshair", touchAction: "none" }}
      />

      {/* Live title + HUD */}
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1 select-none">
        <span className="font-serif text-xl text-foreground">Filament Lattice</span>
        {path === "webgl2" && (
          <span className="font-mono text-base text-violet-300/95">● WebGL2 · {hud.agents.toLocaleString()} agents</span>
        )}
        {path === "cpu" && (
          <span className="font-mono text-base text-violet-300/95">● CPU fallback · {hud.agents.toLocaleString()} agents</span>
        )}
        {!path && <span className="font-mono text-base text-muted-foreground">initialising…</span>}
        <span className="font-mono text-base text-muted-foreground">
          {hud.nodes} nodes · Σ degree {hud.sumDeg.toFixed(1)} · {hud.edges} edges
        </span>
        <span className="font-mono text-base text-muted-foreground">peak clustering {hud.peakClust.toFixed(2)}</span>
      </div>

      {/* Controls */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2 select-none">
        {audioOn && (
          <button
            onClick={() => setMuted((m) => !m)}
            className="min-h-[44px] rounded-full border border-border px-4 py-2.5 text-base text-foreground transition hover:border-border hover:text-foreground"
          >
            {muted ? "unmute" : "mute"}
          </button>
        )}
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] px-2 py-2.5 text-base text-muted-foreground hover:text-foreground"
        >
          design notes ↗
        </button>
        <Link href="/dream" className="text-base text-muted-foreground hover:text-foreground">
          ← back
        </Link>
      </div>

      <p className="pointer-events-none absolute bottom-4 left-4 max-w-md select-none font-mono text-base text-muted-foreground">
        tap to seed a node · filaments bridge into edges (dyads) · gravity merges clusters · it evolves on its own
      </p>

      {err && (
        <p className="pointer-events-none absolute bottom-4 right-4 max-w-xs rounded border border-violet-300/40 px-3 py-2 text-base text-violet-300">
          {err}
        </p>
      )}

      {/* First-gesture audio affordance */}
      {!audioOn && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center pb-20">
          <button
            onClick={startAudio}
            className="pointer-events-auto min-h-[44px] rounded-full border border-violet-300/50 bg-violet-300/15 px-8 py-2.5 text-base font-medium text-foreground shadow-lg backdrop-blur transition hover:border-violet-300/90 hover:bg-violet-300/25"
          >
            ▶ begin — sound on
          </button>
        </div>
      )}

      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 px-4 py-8"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-violet-300/25 bg-[#0b0716] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="font-serif text-2xl text-foreground">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-full border border-border px-4 py-2.5 text-base text-foreground hover:border-border hover:text-foreground"
              >
                close
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-base leading-relaxed text-foreground">{DESIGN_NOTES}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
