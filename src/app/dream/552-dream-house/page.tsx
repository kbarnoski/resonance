'use client';

/**
 * Dream House 552 — Self-Composing Just-Intonation Drone Pilgrimage
 *
 * A long-form (>12 min) autonomous generative drone piece. No interaction
 * required. Tap anywhere to "exhale" (reset chord to new region).
 *
 * Architecture:
 *  - Walker on 2-D harmonic lattice (u=fifths, v=thirds)
 *  - Sustained pure-ratio drones via DroneEngine (audio.ts)
 *  - SVG Tonnetz with comet trail, animated via requestAnimationFrame
 *  - Long-form arc: density / register / tuning-migration / brightness
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { TUNING_SYSTEMS, nodeFreq, foldFreq, ratioString } from './tuning';
import { createDroneEngine, DroneEngine } from './audio';

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_R = 18;
const GAP_X = 60;
const GAP_Y = 52;
const TRAIL_MAX = 80;        // comet trail length
const VISIT_MAX = 300;       // max visited ghost dots to render
const WALKER_MIN_MS = 4000;  // min step interval
const WALKER_MAX_MS = 8000;  // max step interval
const ARC_PERIOD_MS = 14 * 60 * 1000; // 14-minute full cycle

interface ArcPhase {
  t: number; label: string; density: number; filterHz: number; regCenter: number;
}
interface TuningSlot {
  t: number; idx: number;
}

// Phases of the long-form arc
const PHASES: ArcPhase[] = [
  { t: 0,    label: 'gathering',  density: 2, filterHz: 900,  regCenter: 0.0 },
  { t: 0.12, label: 'ascending',  density: 3, filterHz: 1800, regCenter: 0.5 },
  { t: 0.28, label: 'flowering',  density: 5, filterHz: 3200, regCenter: 1.0 },
  { t: 0.42, label: 'tritave',    density: 4, filterHz: 2400, regCenter: 0.7 },
  { t: 0.56, label: 'radiance',   density: 6, filterHz: 4800, regCenter: 0.5 },
  { t: 0.68, label: 'dissolving', density: 4, filterHz: 2000, regCenter: 0.3 },
  { t: 0.80, label: 'receding',   density: 3, filterHz: 1200, regCenter: -0.3 },
  { t: 0.92, label: 'stillness',  density: 2, filterHz: 700,  regCenter: -0.8 },
];

// Tuning migration schedule (fractions of arc period)
const TUNING_SCHEDULE: TuningSlot[] = [
  { t: 0,    idx: 0 }, // 5-limit JI
  { t: 0.33, idx: 1 }, // Bohlen–Pierce
  { t: 0.55, idx: 0 }, // back to 5-JI
  { t: 0.72, idx: 2 }, // 19-EDO
  { t: 0.90, idx: 0 }, // return home
];

// ─── Lattice helpers ──────────────────────────────────────────────────────────

interface LatticeNode {
  u: number;
  v: number;
  id: string;
}

function nodeId(u: number, v: number): string {
  return `${u},${v}`;
}

function neighbors(u: number, v: number): LatticeNode[] {
  return [
    { u: u + 1, v, id: nodeId(u + 1, v) },
    { u: u - 1, v, id: nodeId(u - 1, v) },
    { u, v: v + 1, id: nodeId(u, v + 1) },
    { u, v: v - 1, id: nodeId(u, v - 1) },
  ];
}

function dist2(u1: number, v1: number, u2: number, v2: number): number {
  return (u1 - u2) ** 2 + (v1 - v2) ** 2;
}

/** Pick next walker step — biased toward unvisited nodes */
function stepWalker(
  cu: number,
  cv: number,
  visited: Map<string, number>,
  tuningIdx: number
): LatticeNode {
  const t = TUNING_SYSTEMS[tuningIdx];
  const [uMin, uMax] = t.uRange;
  const [vMin, vMax] = t.vRange;
  const ns = neighbors(cu, cv).filter(
    (n) => n.u >= uMin && n.u <= uMax && n.v >= vMin && n.v <= vMax
  );

  // Score: prefer unvisited, penalize recently visited
  const scores = ns.map((n) => {
    const visits = visited.get(n.id) ?? 0;
    return visits === 0 ? 10 : 1 / (visits + 1);
  });
  const total = scores.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < ns.length; i++) {
    r -= scores[i];
    if (r <= 0) return ns[i];
  }
  return ns[ns.length - 1];
}

/** Compute chord nodes: walker + nearest neighbors */
function computeChordNodes(
  wu: number,
  wv: number,
  density: number
): LatticeNode[] {
  const result: LatticeNode[] = [{ u: wu, v: wv, id: nodeId(wu, wv) }];
  const candidates = neighbors(wu, wv);
  // Sort by harmonic simplicity (distance from origin)
  candidates.sort((a, b) => dist2(a.u, a.v, 0, 0) - dist2(b.u, b.v, 0, 0));
  const needed = Math.max(0, density - 1);
  for (let i = 0; i < Math.min(needed, candidates.length); i++) {
    result.push(candidates[i]);
  }
  return result;
}

// ─── SVG projection ───────────────────────────────────────────────────────────

function gridToSvg(
  u: number,
  v: number,
  svgW: number,
  svgH: number,
  panX: number,
  panY: number
): [number, number] {
  const x = svgW / 2 + (u + panX) * GAP_X;
  const y = svgH / 2 - (v + panY) * GAP_Y;
  return [x, y];
}

// ─── Arc math ─────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Get interpolated arc state at normalized time t ∈ [0,1] */
function computeArcState(t: number): {
  density: number;
  filterHz: number;
  regCenter: number;
  label: string;
  tuningIdx: number;
} {
  // Phase interpolation
  let phaseA = PHASES[PHASES.length - 1];
  let phaseB = PHASES[0];
  let alpha = 0;
  for (let i = 0; i < PHASES.length - 1; i++) {
    if (t >= PHASES[i].t && t < PHASES[i + 1].t) {
      phaseA = PHASES[i];
      phaseB = PHASES[i + 1];
      alpha = smoothstep((t - phaseA.t) / (phaseB.t - phaseA.t));
      break;
    }
  }
  if (t >= PHASES[PHASES.length - 1].t) {
    phaseA = PHASES[PHASES.length - 1];
    phaseB = PHASES[0];
    alpha = smoothstep((t - phaseA.t) / (1 - phaseA.t));
  }

  const density = Math.round(lerp(phaseA.density, phaseB.density, alpha));
  const filterHz = lerp(phaseA.filterHz, phaseB.filterHz, alpha);
  const regCenter = lerp(phaseA.regCenter, phaseB.regCenter, alpha);
  const label = alpha < 0.5 ? phaseA.label : phaseB.label;

  // Tuning index
  let tuningIdx = TUNING_SCHEDULE[0].idx;
  for (let i = 0; i < TUNING_SCHEDULE.length; i++) {
    if (t >= TUNING_SCHEDULE[i].t) tuningIdx = TUNING_SCHEDULE[i].idx;
  }

  return { density, filterHz, regCenter, label, tuningIdx };
}

/** Per-voice gain based on voice count */
function perVoiceGain(count: number): number {
  // Ensure total output stays safe; empirical: max 0.22 / voice, scaled by count
  return Math.min(0.22, 0.55 / Math.max(1, count));
}

// ─── Elapsed time formatter ───────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

// ─── Render helpers (direct SVG DOM mutation, called from rAF) ───────────────

interface DrawState {
  walkerU: number;
  walkerV: number;
  trail: Array<[number, number]>;
  visitedList: Array<[number, number]>;
  chordIds: Set<string>;
  chordNodes: LatticeNode[];
  panX: number;
  panY: number;
  svgW: number;
  svgH: number;
  tuningIdx: number;
  phase: string;
  elapsed: number;
  voiceCount: number;
  rootFreq: number;
  filterHz: number;
}

function drawFrame(svgEl: SVGSVGElement, state: DrawState): void {
  const { walkerU, walkerV, trail, visitedList, chordNodes,
          panX, panY, svgW, svgH, tuningIdx, phase, elapsed,
          voiceCount, rootFreq, filterHz } = state;

  const tuning = TUNING_SYSTEMS[tuningIdx];
  const hue = tuning.id === 'bp' ? 155 : tuning.id === '19edo' ? 38 : 265;

  // Update trail polyline
  const trailEl = svgEl.querySelector('#dh-trail') as SVGPolylineElement | null;
  if (trailEl && trail.length > 1) {
    const pts = trail.map(([u, v]) => {
      const [x, y] = gridToSvg(u, v, svgW, svgH, panX, panY);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    trailEl.setAttribute('points', pts);
  }

  // Update visited ghost group
  const visitedG = svgEl.querySelector('#dh-visited') as SVGGElement | null;
  if (visitedG) {
    const toShow = visitedList.slice(-VISIT_MAX);
    // Add/update circles
    const existing = visitedG.querySelectorAll('circle');
    // Remove excess
    for (let i = toShow.length; i < existing.length; i++) {
      existing[i].remove();
    }
    toShow.forEach(([u, v], i) => {
      const [cx, cy] = gridToSvg(u, v, svgW, svgH, panX, panY);
      let c = existing[i] as SVGCircleElement | undefined;
      if (!c) {
        c = document.createElementNS('http://www.w3.org/2000/svg', 'circle') as SVGCircleElement;
        visitedG.appendChild(c);
      }
      c.setAttribute('cx', cx.toFixed(1));
      c.setAttribute('cy', cy.toFixed(1));
      c.setAttribute('r', '4');
      // Fade older visits
      const age = (toShow.length - i) / toShow.length;
      c.setAttribute('fill', `hsla(${hue},30%,40%,${(0.12 + 0.08 * (1 - age)).toFixed(3)})`);
    });
  }

  // Update chord node circles
  const chordG = svgEl.querySelector('#dh-chord') as SVGGElement | null;
  if (chordG) {
    // Build map of what should be there
    const needed = new Map(chordNodes.map((n) => [n.id, n]));
    const existing = Array.from(chordG.querySelectorAll('g[data-nid]'));

    // Remove stale
    existing.forEach((g) => {
      const nid = g.getAttribute('data-nid');
      if (!nid || !needed.has(nid)) g.remove();
    });

    // Add/update
    needed.forEach((node) => {
      const [cx, cy] = gridToSvg(node.u, node.v, svgW, svgH, panX, panY);
      const isWalker = node.u === walkerU && node.v === walkerV;
      const r = isWalker ? NODE_R * 1.4 : NODE_R;

      let g = chordG.querySelector(`g[data-nid="${node.id}"]`) as SVGGElement | null;
      if (!g) {
        g = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
        g.setAttribute('data-nid', node.id);

        // Glow circle
        const glowC = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        glowC.setAttribute('class', 'dh-glow');
        glowC.setAttribute('fill', `hsla(${hue},70%,65%,0.18)`);
        g.appendChild(glowC);

        // Main circle
        const mainC = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        mainC.setAttribute('class', 'dh-main');
        g.appendChild(mainC);

        // Label text
        const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('class', 'dh-label');
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('dominant-baseline', 'middle');
        txt.setAttribute('font-size', '9');
        txt.setAttribute('font-family', 'monospace');
        txt.setAttribute('fill', 'rgba(255,255,255,0.7)');
        txt.setAttribute('style', 'pointer-events:none;user-select:none;');
        g.appendChild(txt);

        chordG.appendChild(g);
      }

      g.setAttribute('transform', `translate(${cx.toFixed(1)},${cy.toFixed(1)})`);

      const glow = g.querySelector('.dh-glow') as SVGCircleElement;
      if (glow) {
        glow.setAttribute('r', (r + 14).toFixed(1));
        glow.setAttribute('fill', `hsla(${hue},70%,65%,${isWalker ? 0.22 : 0.10})`);
      }

      const main = g.querySelector('.dh-main') as SVGCircleElement;
      if (main) {
        main.setAttribute('r', r.toFixed(1));
        main.setAttribute('fill', `hsla(${hue},${isWalker ? 72 : 52}%,${isWalker ? 62 : 42}%,0.92)`);
        main.setAttribute('stroke', `hsla(${hue},80%,78%,${isWalker ? 0.9 : 0.45})`);
        main.setAttribute('stroke-width', isWalker ? '2.5' : '1.5');
      }

      const label = g.querySelector('.dh-label') as SVGTextElement;
      if (label) {
        label.textContent = `(${node.u},${node.v})`;
      }
    });
  }

  // Update walker freq/ratio label
  const walkerLabel = svgEl.querySelector('#dh-walker-label') as SVGTextElement | null;
  if (walkerLabel) {
    const [wx, wy] = gridToSvg(walkerU, walkerV, svgW, svgH, panX, panY);
    walkerLabel.setAttribute('x', wx.toFixed(1));
    walkerLabel.setAttribute('y', (wy - NODE_R * 1.4 - 16).toFixed(1));
    walkerLabel.textContent = `${rootFreq.toFixed(1)} Hz  ${ratioString(walkerU, walkerV)}`;
  }

  // Update HUD
  const phaseEl = svgEl.querySelector('#dh-phase') as SVGTextElement | null;
  if (phaseEl) phaseEl.textContent = phase;

  const elapsedEl = svgEl.querySelector('#dh-elapsed') as SVGTextElement | null;
  if (elapsedEl) elapsedEl.textContent = formatElapsed(elapsed);

  const voicesEl = svgEl.querySelector('#dh-voices') as SVGTextElement | null;
  if (voicesEl) voicesEl.textContent = `${voiceCount}v`;

  const tuningEl = svgEl.querySelector('#dh-tuning') as SVGTextElement | null;
  if (tuningEl) tuningEl.textContent = tuning.shortName;

  const filterEl = svgEl.querySelector('#dh-filter') as SVGTextElement | null;
  if (filterEl) filterEl.textContent = `${Math.round(filterHz)} Hz`;

  // Pan SVG viewBox to follow walker (smooth by updating the group offset attribute)
  const mainG = svgEl.querySelector('#dh-main-g') as SVGGElement | null;
  if (mainG) {
    // Already handled via panX/panY in coordinate transform
    // Nothing to do here — all positions recalculated each frame
  }

  // Pulsing glow animation on walker — update filter feStdDeviation
  const pulseFilter = svgEl.querySelector('#dh-pulse-blur feGaussianBlur') as SVGFEGaussianBlurElement | null;
  if (pulseFilter) {
    const beat = 6 + 4 * Math.sin(Date.now() / 800);
    pulseFilter.setAttribute('stdDeviation', beat.toFixed(2));
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DreamHousePage() {
  const [started, setStarted] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [svgSize, setSvgSize] = useState({ w: 800, h: 500 });

  // All mutable state lives in refs to avoid re-render churn
  const engineRef = useRef<DroneEngine | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Walker state
  const walkerRef = useRef({ u: 0, v: 0 });
  const visitedRef = useRef<Map<string, number>>(new Map());
  const trailRef = useRef<Array<[number, number]>>([]);
  const visitedListRef = useRef<Array<[number, number]>>([]);
  const walkerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Arc state
  const startTimeRef = useRef<number>(0);
  const arcStateRef = useRef({ density: 2, filterHz: 900, regCenter: 0, label: 'gathering', tuningIdx: 0 });
  const lastTuningIdxRef = useRef(0);
  const panRef = useRef({ x: 0, y: 0 });
  const targetPanRef = useRef({ x: 0, y: 0 });

  // Chord state
  const chordNodesRef = useRef<LatticeNode[]>([]);
  const chordIdsRef = useRef<Set<string>>(new Set());

  // ── Resize observer ──────────────────────────────────────────────────────
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

  // ── Walker step logic ─────────────────────────────────────────────────────
  const stepWalkerNow = useCallback((exhale = false) => {
    const { density, tuningIdx } = arcStateRef.current;
    const engine = engineRef.current;

    if (exhale) {
      // Jump to a new random region
      const t = TUNING_SYSTEMS[tuningIdx];
      const [uMin, uMax] = t.uRange;
      const [vMin, vMax] = t.vRange;
      walkerRef.current = {
        u: Math.round(lerp(uMin, uMax, 0.2 + Math.random() * 0.6)),
        v: Math.round(lerp(vMin, vMax, 0.2 + Math.random() * 0.6)),
      };
    } else {
      const next = stepWalker(
        walkerRef.current.u,
        walkerRef.current.v,
        visitedRef.current,
        tuningIdx
      );
      walkerRef.current = { u: next.u, v: next.v };
    }

    const { u, v } = walkerRef.current;

    // Record visit
    const id = nodeId(u, v);
    visitedRef.current.set(id, (visitedRef.current.get(id) ?? 0) + 1);

    // Update trail
    trailRef.current.push([u, v]);
    if (trailRef.current.length > TRAIL_MAX) {
      trailRef.current.shift();
    }

    // Update visited list (unique positions for ghost dots)
    if (!visitedListRef.current.some(([pu, pv]) => pu === u && pv === v)) {
      visitedListRef.current.push([u, v]);
    }

    // Update chord
    const newChordNodes = computeChordNodes(u, v, density);
    chordNodesRef.current = newChordNodes;
    chordIdsRef.current = new Set(newChordNodes.map((n) => n.id));

    // Update pan target to follow walker
    targetPanRef.current = { x: -u, y: -v };

    // Update audio
    if (engine) {
      const tuning = TUNING_SYSTEMS[tuningIdx];
      const { regCenter: rc } = arcStateRef.current;
      // Register band: 90–600 Hz center, slow sine breathe
      const regShift = Math.pow(2, rc * 0.4); // ±0.4 octave shift
      const loHz = 80 * regShift;
      const hiHz = 520 * regShift;

      const pvg = perVoiceGain(newChordNodes.length);
      const keepIds = new Set<string>();

      for (const node of newChordNodes) {
        const rawFreq = nodeFreq(tuning, node.u, node.v);
        const foldedFreq = foldFreq(rawFreq, loHz, hiHz);
        engine.upsertVoice(node.id, foldedFreq, pvg);
        keepIds.add(node.id);
      }
      engine.pruneVoices(keepIds);
    }

    // Schedule next step
    if (walkerTimerRef.current) clearTimeout(walkerTimerRef.current);
    const delay = WALKER_MIN_MS + Math.random() * (WALKER_MAX_MS - WALKER_MIN_MS);
    walkerTimerRef.current = setTimeout(() => stepWalkerNow(), delay);
  }, []);

  // ── Arc update (called from rAF loop, every ~1s is fine) ─────────────────
  const lastArcUpdateRef = useRef(0);

  const updateArc = useCallback((now: number) => {
    if (now - lastArcUpdateRef.current < 1000) return;
    lastArcUpdateRef.current = now;

    const elapsed = now - startTimeRef.current;
    const t = (elapsed % ARC_PERIOD_MS) / ARC_PERIOD_MS;
    const arc = computeArcState(t);
    arcStateRef.current = arc;

    const engine = engineRef.current;
    if (!engine) return;

    // Apply filter drift
    engine.setFilterCutoff(arc.filterHz, 8);

    // If tuning changed, reload chord after a beat
    if (arc.tuningIdx !== lastTuningIdxRef.current) {
      lastTuningIdxRef.current = arc.tuningIdx;
      // Force a step to update voices with new tuning
      if (walkerTimerRef.current) clearTimeout(walkerTimerRef.current);
      walkerTimerRef.current = setTimeout(() => stepWalkerNow(), 500);
    }
  }, [stepWalkerNow]);

  // ── rAF loop ──────────────────────────────────────────────────────────────
  const drawLoop = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) {
      rafRef.current = requestAnimationFrame(drawLoop);
      return;
    }

    const now = performance.now();
    updateArc(now);

    // Smooth pan
    panRef.current.x += (targetPanRef.current.x - panRef.current.x) * 0.03;
    panRef.current.y += (targetPanRef.current.y - panRef.current.y) * 0.03;

    const elapsed = now - startTimeRef.current;
    const arc = arcStateRef.current;
    const { u, v } = walkerRef.current;
    const tuning = TUNING_SYSTEMS[arc.tuningIdx];
    const rawFreq = nodeFreq(tuning, u, v);
    const regShift = Math.pow(2, arc.regCenter * 0.4);
    const foldedFreq = foldFreq(rawFreq, 80 * regShift, 520 * regShift);

    drawFrame(svg, {
      walkerU: u,
      walkerV: v,
      trail: trailRef.current,
      visitedList: visitedListRef.current,
      chordIds: chordIdsRef.current,
      chordNodes: chordNodesRef.current,
      panX: panRef.current.x,
      panY: panRef.current.y,
      svgW: svgSize.w,
      svgH: svgSize.h,
      tuningIdx: arc.tuningIdx,
      phase: arc.label,
      elapsed,
      voiceCount: engineRef.current?.voices.size ?? 0,
      rootFreq: foldedFreq,
      filterHz: arc.filterHz,
    });

    rafRef.current = requestAnimationFrame(drawLoop);
  }, [svgSize, updateArc]);

  // ── Start ─────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    setStarted(true);

    // Create audio engine
    const engine = createDroneEngine();
    if (!engine) {
      setAudioError(true);
    } else {
      engineRef.current = engine;
      // Fade in master gain
      engine.setMasterGain(0.82, 3);
    }

    startTimeRef.current = performance.now();
    arcStateRef.current = computeArcState(0);

    // Initial walker position
    walkerRef.current = { u: 0, v: 0 };
    visitedRef.current.set('0,0', 1);
    trailRef.current = [[0, 0]];
    visitedListRef.current = [[0, 0]];

    // Initial step after a short pause
    setTimeout(() => stepWalkerNow(), 1200);
  }, [stepWalkerNow]);

  // ── rAF start/stop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    rafRef.current = requestAnimationFrame(drawLoop);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [started, drawLoop]);

  // ── Exhale on tap ─────────────────────────────────────────────────────────
  const handleExhale = useCallback(() => {
    if (!started) return;
    // Fade out current chord briefly, then bloom new one
    const engine = engineRef.current;
    if (engine) {
      engine.pruneVoices(new Set()); // fade all voices out
      setTimeout(() => stepWalkerNow(true), 1500);
    } else {
      stepWalkerNow(true);
    }
  }, [started, stepWalkerNow]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (walkerTimerRef.current) clearTimeout(walkerTimerRef.current);
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.close();
    };
  }, []);

  // ─── Lattice grid lines (static, rendered once via React) ─────────────────
  // We pre-compute a grid within the visible range for the current tuning
  const staticGridLines: React.ReactNode[] = [];
  const gridTuning = TUNING_SYSTEMS[0]; // static grid uses 5-limit ranges
  const [uMin, uMax] = gridTuning.uRange;
  const [vMin, vMax] = gridTuning.vRange;

  // Generate lattice edges for the background grid
  for (let u = uMin; u <= uMax; u++) {
    for (let v = vMin; v <= vMax; v++) {
      // Horizontal edges (u axis)
      if (u < uMax) {
        staticGridLines.push(
          <line
            key={`h-${u}-${v}`}
            x1={svgSize.w / 2 + u * GAP_X}
            y1={svgSize.h / 2 - v * GAP_Y}
            x2={svgSize.w / 2 + (u + 1) * GAP_X}
            y2={svgSize.h / 2 - v * GAP_Y}
            stroke="rgba(99,102,241,0.10)"
            strokeWidth="1"
          />
        );
      }
      // Vertical edges (v axis)
      if (v < vMax) {
        staticGridLines.push(
          <line
            key={`v-${u}-${v}`}
            x1={svgSize.w / 2 + u * GAP_X}
            y1={svgSize.h / 2 - v * GAP_Y}
            x2={svgSize.w / 2 + u * GAP_X}
            y2={svgSize.h / 2 - (v + 1) * GAP_Y}
            stroke="rgba(139,92,246,0.08)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        );
      }
    }
  }

  // ─── Splash screen ────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-full gap-8 text-center px-6 py-16 bg-[#04040a]">
        <div className="max-w-lg space-y-4">
          <p className="text-violet-300/70 text-xs font-mono tracking-widest uppercase">
            dream house · 552
          </p>
          <h1 className="text-3xl font-serif text-white/95 leading-tight">
            The Drone Pilgrimage
          </h1>
          <p className="text-base text-white/75 leading-relaxed">
            A self-composing{' '}
            <span className="text-violet-300">just-intonation</span> drone
            installation. No interaction required — press Start and leave it
            running. A harmonic walker traverses an infinite{' '}
            <span className="text-violet-300">Tonnetz lattice</span>, never
            repeating, never returning home.
          </p>
          <p className="text-sm text-white/55 leading-relaxed">
            After 12 minutes the piece will sound entirely different in
            register, density, tuning, and colour — that long arc is the music.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleStart}
            className="min-h-[44px] px-8 py-2.5 rounded-full bg-violet-600/25 border border-violet-400/40 text-violet-200 text-base hover:bg-violet-500/35 transition-colors"
          >
            Start Dream House
          </button>
          <p className="text-xs text-white/40">
            Tap anywhere after starting to exhale — bloom a new constellation
          </p>
        </div>

        {audioError && (
          <p className="text-rose-300 text-sm">
            Web Audio unavailable — visuals only
          </p>
        )}

        <a
          href="/dream/552-dream-house/README.md"
          className="absolute bottom-4 right-4 text-xs text-white/35 hover:text-white/60 transition-colors"
        >
          Read the design notes ↗
        </a>
      </div>
    );
  }

  // ─── Main view ────────────────────────────────────────────────────────────
  return (
    <div
      className="relative flex flex-col w-full h-full bg-[#04040a] overflow-hidden"
      onClick={handleExhale}
      style={{ cursor: 'crosshair' }}
    >
      <style>{`
        @keyframes dhPulse {
          0%, 100% { opacity: 0.75; }
          50%       { opacity: 1.0; }
        }
        .dh-walker-pulse { animation: dhPulse 2.4s ease-in-out infinite; }
      `}</style>

      {/* ── SVG ─────────────────────────────────────────────────────────── */}
      <div ref={containerRef} className="absolute inset-0">
        <svg
          ref={svgRef}
          width={svgSize.w}
          height={svgSize.h}
          viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
          className="absolute inset-0"
          style={{ touchAction: 'none' }}
        >
          <defs>
            {/* Radial bg gradient */}
            <radialGradient id="dh-bg" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="#090614" />
              <stop offset="100%" stopColor="#04040a" />
            </radialGradient>

            {/* Glow filter for active nodes */}
            <filter id="dh-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Animated pulse filter for walker */}
            <filter id="dh-pulse-blur" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="6" />
            </filter>

            {/* Trail gradient */}
            <linearGradient id="dh-trail-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(139,92,246,0)" />
              <stop offset="100%" stopColor="rgba(167,139,250,0.6)" />
            </linearGradient>
          </defs>

          {/* Background */}
          <rect width={svgSize.w} height={svgSize.h} fill="url(#dh-bg)" />

          {/* Static grid lines (behind everything) */}
          <g id="dh-grid" opacity="1">
            {staticGridLines}
          </g>

          {/* Visited ghost dots */}
          <g id="dh-visited" />

          {/* Comet trail polyline */}
          <polyline
            id="dh-trail"
            points=""
            fill="none"
            stroke="rgba(167,139,250,0.45)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Active chord nodes */}
          <g id="dh-chord" filter="url(#dh-glow)" />

          {/* Walker frequency label */}
          <text
            id="dh-walker-label"
            x={svgSize.w / 2}
            y={svgSize.h / 2 - 50}
            textAnchor="middle"
            fontSize="9"
            fontFamily="monospace"
            fill="rgba(167,139,250,0.65)"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          />

          {/* HUD — top-left */}
          <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {/* Phase word */}
            <text
              id="dh-phase"
              x="14"
              y="24"
              fontSize="13"
              fontFamily="serif"
              fill="rgba(255,255,255,0.55)"
              className="dh-walker-pulse"
            >
              gathering
            </text>

            {/* Elapsed clock */}
            <text
              id="dh-elapsed"
              x="14"
              y="40"
              fontSize="10"
              fontFamily="monospace"
              fill="rgba(255,255,255,0.30)"
            >
              0:00
            </text>

            {/* Tuning + voices + filter — bottom-left */}
            <text
              id="dh-tuning"
              x="14"
              y={svgSize.h - 36}
              fontSize="10"
              fontFamily="monospace"
              fill="rgba(167,139,250,0.55)"
            >
              5-JI
            </text>
            <text
              id="dh-voices"
              x="14"
              y={svgSize.h - 22}
              fontSize="10"
              fontFamily="monospace"
              fill="rgba(255,255,255,0.30)"
            >
              0v
            </text>
            <text
              id="dh-filter"
              x="14"
              y={svgSize.h - 8}
              fontSize="10"
              fontFamily="monospace"
              fill="rgba(255,255,255,0.22)"
            >
              –
            </text>
          </g>

          {/* Axis labels (faint) */}
          <text
            x={svgSize.w - 10}
            y={svgSize.h / 2 + 12}
            textAnchor="end"
            fontSize="8"
            fontFamily="monospace"
            fill="rgba(255,255,255,0.12)"
            style={{ pointerEvents: 'none' }}
          >
            ← fifths (3/2) →
          </text>
          <text
            x={svgSize.w / 2 + 4}
            y={12}
            textAnchor="middle"
            fontSize="8"
            fontFamily="monospace"
            fill="rgba(255,255,255,0.12)"
            style={{ pointerEvents: 'none' }}
          >
            thirds (5/4) ↑
          </text>
        </svg>
      </div>

      {/* ── Top bar readout ──────────────────────────────────────────────── */}
      <div className="relative z-10 flex-shrink-0 flex items-center justify-between px-4 py-2 bg-black/30 backdrop-blur-sm border-b border-white/5">
        <span className="text-base font-serif text-white/80">
          Dream House
        </span>
        <span className="text-xs font-mono text-white/35">
          tap anywhere to exhale
        </span>
        <a
          href="/dream/552-dream-house/README.md"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-white/30 hover:text-white/55 transition-colors"
        >
          notes ↗
        </a>
      </div>

      {/* ── Audio error banner ───────────────────────────────────────────── */}
      {audioError && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded bg-black/70 text-rose-300 text-sm pointer-events-none">
          Web Audio unavailable — visuals only
        </div>
      )}
    </div>
  );
}
