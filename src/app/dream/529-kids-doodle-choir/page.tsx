'use client';

/**
 * 529 — Kids: Doodle Choir
 *
 * Draw a doodle → a real in-browser neural net (TensorFlow.js + DoodleNet)
 * recognizes what you drew → the creature animates and SINGS its motif.
 * Each drawing joins a living, looping choir. Pure delight for 4-year-olds.
 *
 * Headline technique: TensorFlow.js real-time semantic sketch classification.
 * References:
 *   - Quick, Draw! (Jongejan, Ha, et al., Google 2016)
 *   - DoodleNet by yining1023: CNN trained on Quick, Draw! 345-category dataset,
 *     ported to TensorFlow.js. https://github.com/yining1023/doodlenet
 *
 * "Quick, Draw! that sings."
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { buildChoirAudio, type ChoirAudio } from './audio';
import {
  loadClassifier,
  classifyDrawing,
  getClassifierMode,
  type Archetype,
} from './classify';

// ── Creature visual config ────────────────────────────────────────────────────

interface CreatureConfig {
  label: string;
  emoji: string;
  bgColor: string;
  strokeColor: string;
  glowColor: string;
}

const CREATURE_CONFIG: Record<Archetype, CreatureConfig> = {
  sun:     { label: 'Sun',    emoji: '☀️',  bgColor: '#fbbf24', strokeColor: '#f59e0b', glowColor: '#fde68a' },
  fish:    { label: 'Fish',   emoji: '🐟',  bgColor: '#38bdf8', strokeColor: '#0284c7', glowColor: '#bae6fd' },
  bird:    { label: 'Bird',   emoji: '🐦',  bgColor: '#34d399', strokeColor: '#059669', glowColor: '#a7f3d0' },
  plant:   { label: 'Plant',  emoji: '🌸',  bgColor: '#a78bfa', strokeColor: '#7c3aed', glowColor: '#ddd6fe' },
  cloud:   { label: 'Cloud',  emoji: '☁️',  bgColor: '#e0f2fe', strokeColor: '#7dd3fc', glowColor: '#f0f9ff' },
  star:    { label: 'Star',   emoji: '⭐',  bgColor: '#fcd34d', strokeColor: '#d97706', glowColor: '#fef3c7' },
  critter: { label: 'Critter',emoji: '🐛',  bgColor: '#fb923c', strokeColor: '#ea580c', glowColor: '#fed7aa' },
  home:    { label: 'Home',   emoji: '🏠',  bgColor: '#f9a8d4', strokeColor: '#db2777', glowColor: '#fce7f3' },
};

// ── Creature animation state ──────────────────────────────────────────────────

interface CreatureState {
  id: number;
  archetype: Archetype;
  x: number;        // canvas x (0..1 normalized)
  y: number;        // canvas y (0..1 normalized)
  phase: number;    // animation phase (radians, slowly advancing)
  scale: number;    // 0→1 birth animation
  born: number;     // timestamp
  singing: number;  // 0..1 glow intensity (decays)
  strokePoints: { x: number; y: number }[]; // original drawing
}

// ── Auto-demo sequences ───────────────────────────────────────────────────────

const DEMO_SEQUENCE: Archetype[] = [
  'sun', 'fish', 'bird', 'plant', 'star', 'critter', 'cloud', 'home',
];

// Ghost strokes for each demo archetype (normalized 0–1 coords)
// These are simple shapes that suggest each creature
const DEMO_STROKES: Record<Archetype, { x: number; y: number }[]> = {
  sun: (() => {
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push({ x: 0.5 + Math.cos(a) * 0.12, y: 0.5 + Math.sin(a) * 0.12 });
    }
    return pts;
  })(),
  fish: [
    { x: 0.30, y: 0.5 }, { x: 0.35, y: 0.44 }, { x: 0.45, y: 0.42 },
    { x: 0.55, y: 0.44 }, { x: 0.63, y: 0.5 },  { x: 0.55, y: 0.56 },
    { x: 0.45, y: 0.58 }, { x: 0.35, y: 0.56 }, { x: 0.30, y: 0.5 },
  ],
  bird: [
    { x: 0.35, y: 0.5 }, { x: 0.40, y: 0.42 }, { x: 0.50, y: 0.45 },
    { x: 0.60, y: 0.42 }, { x: 0.65, y: 0.50 }, { x: 0.60, y: 0.58 },
    { x: 0.50, y: 0.55 }, { x: 0.40, y: 0.58 }, { x: 0.35, y: 0.5 },
  ],
  plant: [
    { x: 0.50, y: 0.72 }, { x: 0.50, y: 0.38 },
    { x: 0.42, y: 0.52 }, { x: 0.50, y: 0.52 },
    { x: 0.58, y: 0.52 }, { x: 0.50, y: 0.52 },
  ],
  cloud: [
    { x: 0.35, y: 0.52 }, { x: 0.38, y: 0.46 }, { x: 0.44, y: 0.43 },
    { x: 0.50, y: 0.46 }, { x: 0.56, y: 0.43 }, { x: 0.62, y: 0.46 },
    { x: 0.65, y: 0.52 }, { x: 0.62, y: 0.56 }, { x: 0.50, y: 0.58 },
    { x: 0.38, y: 0.56 }, { x: 0.35, y: 0.52 },
  ],
  star: (() => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 0.12 : 0.06;
      pts.push({ x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r });
    }
    return pts;
  })(),
  critter: [
    { x: 0.35, y: 0.50 }, { x: 0.40, y: 0.44 }, { x: 0.48, y: 0.43 },
    { x: 0.56, y: 0.44 }, { x: 0.62, y: 0.48 }, { x: 0.64, y: 0.55 },
    { x: 0.58, y: 0.60 }, { x: 0.42, y: 0.60 }, { x: 0.35, y: 0.55 },
    { x: 0.35, y: 0.50 },
  ],
  home: [
    { x: 0.38, y: 0.60 }, { x: 0.38, y: 0.48 }, { x: 0.50, y: 0.38 },
    { x: 0.62, y: 0.48 }, { x: 0.62, y: 0.60 }, { x: 0.38, y: 0.60 },
  ],
};

// ── Drawing canvas ────────────────────────────────────────────────────────────

function drawCreatureOnCanvas(
  ctx: CanvasRenderingContext2D,
  creature: CreatureState,
  cw: number,
  ch: number,
  now: number,
): void {
  const cfg = CREATURE_CONFIG[creature.archetype];
  const age = (now - creature.born) / 1000;
  const t = age * 1.2; // animation time
  const scale = Math.min(1, creature.scale);
  const cx = creature.x * cw;
  const cy = creature.y * ch;
  const radius = Math.min(cw, ch) * 0.055 * scale;
  const singing = creature.singing;

  ctx.save();
  ctx.translate(cx, cy);

  // Archetype-specific animation
  let offsetX = 0;
  let offsetY = 0;
  let extraScale = 1;

  switch (creature.archetype) {
    case 'sun':
      // Pulses and rises slightly
      extraScale = 1 + Math.sin(t * 1.8) * 0.08;
      offsetY = Math.sin(t * 0.6) * 4;
      break;
    case 'fish':
      // Wiggles horizontally and bobs
      offsetX = Math.sin(t * 2.0) * 8;
      offsetY = Math.sin(t * 1.3) * 4;
      break;
    case 'bird':
      // Flutters (quick bob) + drifts
      offsetY = Math.sin(t * 4.0) * 6;
      offsetX = Math.sin(t * 0.8) * 5;
      extraScale = 1 + Math.abs(Math.sin(t * 4.0)) * 0.06;
      break;
    case 'plant':
      // Gentle sway
      offsetX = Math.sin(t * 0.9) * 4;
      extraScale = 1 + Math.sin(t * 1.2) * 0.05;
      break;
    case 'cloud':
      // Drifts slowly
      offsetX = Math.sin(t * 0.4) * 10;
      offsetY = Math.sin(t * 0.3) * 3;
      break;
    case 'star':
      // Twinkles (scale pulse)
      extraScale = 1 + Math.sin(t * 3.0) * 0.15;
      break;
    case 'critter':
      // Walking bounce
      offsetX = Math.sin(t * 2.5) * 5;
      offsetY = Math.abs(Math.sin(t * 5.0)) * -4;
      break;
    case 'home':
      // Gentle breath
      extraScale = 1 + Math.sin(t * 1.0) * 0.04;
      break;
  }

  ctx.translate(offsetX, offsetY);
  ctx.scale(extraScale, extraScale);

  // Singing glow ring
  if (singing > 0.01) {
    const glowR = radius * (1.5 + singing * 0.8);
    const grad = ctx.createRadialGradient(0, 0, radius * 0.5, 0, 0, glowR);
    grad.addColorStop(0, cfg.glowColor + Math.round(singing * 180).toString(16).padStart(2, '0'));
    grad.addColorStop(1, cfg.glowColor + '00');
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Main creature body (circle with color)
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = cfg.bgColor + 'cc';
  ctx.strokeStyle = cfg.strokeColor;
  ctx.lineWidth = 2.5;
  ctx.fill();
  ctx.stroke();

  // Emoji label
  const emojiSize = radius * 1.0;
  ctx.font = `${emojiSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cfg.emoji, 0, 0);

  ctx.restore();

  // Draw the child's original stroke (faintly, in creature color)
  if (creature.strokePoints.length > 1 && scale > 0.5) {
    ctx.save();
    ctx.globalAlpha = 0.25 * scale;
    ctx.strokeStyle = cfg.strokeColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < creature.strokePoints.length; i++) {
      const p = creature.strokePoints[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Warm storybook sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1a1040');
  grad.addColorStop(0.5, '#2d1b6e');
  grad.addColorStop(1, '#1e3a5f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Starfield (static)
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let s = 0; s < 60; s++) {
    const sx = ((s * 137.508) % 1) * w;
    const sy = ((s * 89.31) % 1) * h * 0.65;
    const r = 0.5 + (s % 3) * 0.4;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ground strip
  const groundGrad = ctx.createLinearGradient(0, h * 0.78, 0, h);
  groundGrad.addColorStop(0, '#1a4a1a');
  groundGrad.addColorStop(1, '#0d2e0d');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, h * 0.78, w, h * 0.22);
}

// ── Drawing canvas helper ─────────────────────────────────────────────────────

function clearDrawingCanvas(drawCtx: CanvasRenderingContext2D, w: number, h: number): void {
  drawCtx.clearRect(0, 0, w, h);
  drawCtx.fillStyle = '#0a0820';
  drawCtx.fillRect(0, 0, w, h);
}

// ── Ghost finger auto-demo helper ─────────────────────────────────────────────

function drawGhostCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
): void {
  const r = 18 + Math.sin(progress * Math.PI * 6) * 4;
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 220, 100, 0.3)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 220, 100, 0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // inner dot
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 220, 100, 0.95)';
  ctx.fill();
  ctx.restore();
}

// ── Main component ────────────────────────────────────────────────────────────

type Phase = 'start' | 'running';

let creatureIdCounter = 0;

export default function KidsDoodleChoir() {
  const [phase, setPhase] = useState<Phase>('start');
  const [classifierStatus, setClassifierStatus] = useState<string>('');
  const [creatureCount, setCreatureCount] = useState(0);

  // Canvas refs
  const sceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef  = useRef<HTMLCanvasElement | null>(null);

  // Animation refs
  const rafRef         = useRef<number>(0);
  const creaturesRef   = useRef<CreatureState[]>([]);
  const audioRef       = useRef<ChoirAudio | null>(null);

  // Drawing state
  const isDrawingRef   = useRef(false);
  const currentPtsRef  = useRef<{ x: number; y: number }[]>([]);
  const drawCtxRef     = useRef<CanvasRenderingContext2D | null>(null);

  // Auto-demo state
  const demoRef = useRef({
    active: true,
    seqIdx: 0,
    ptIdx: 0,
    phase: 'drawing' as 'drawing' | 'pausing' | 'done',
    timer: 0,
    lastUserInput: 0,
    ghostX: 0,
    ghostY: 0,
  });
  const lastUserInputRef = useRef(0);

  // Classifier load
  const classifierLoadedRef = useRef(false);

  // ── Spawn a creature at a canvas position ───────────────────────────────────

  const spawnCreature = useCallback((
    archetype: Archetype,
    xNorm: number,
    yNorm: number,
    strokePoints: { x: number; y: number }[],
  ) => {
    const creature: CreatureState = {
      id: creatureIdCounter++,
      archetype,
      x: xNorm,
      y: yNorm,
      phase: Math.random() * Math.PI * 2,
      scale: 0,
      born: performance.now(),
      singing: 1.0,
      strokePoints,
    };
    creaturesRef.current.push(creature);
    setCreatureCount(creaturesRef.current.length);

    // Play the motif
    audioRef.current?.sing(archetype);

    // Add to choir after a short delay
    setTimeout(() => {
      audioRef.current?.addToChoir(archetype);
    }, 1200);
  }, []);

  // ── Handle a completed drawing stroke ───────────────────────────────────────

  const handleStrokeComplete = useCallback(async (
    points: { x: number; y: number }[],
    sceneW: number,
    sceneH: number,
    drawW: number,
    drawH: number,
  ) => {
    if (points.length < 3) return;

    // Where was the centroid of the stroke?
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const xNorm = cx / drawW;
    const yNorm = Math.min(0.75, cy / drawH); // keep above ground

    // Record stroke points (normalized to scene canvas)
    const sceneStroke = points.map(p => ({
      x: p.x * (sceneW / drawW),
      y: p.y * (sceneH / drawH),
    }));

    // Run classifier
    let archetype: Archetype;
    const drawCanvas = drawCanvasRef.current;
    if (drawCanvas) {
      archetype = await classifyDrawing(drawCanvas);
    } else {
      archetype = 'home';
    }

    // Update classifier status
    const mode = getClassifierMode();
    setClassifierStatus(mode === 'ml' ? '✦ AI recognizing' : '◈ shape matching');

    // Spawn!
    spawnCreature(archetype, xNorm, yNorm * 0.75, sceneStroke);

    // Clear draw canvas
    const drawCtx = drawCtxRef.current;
    if (drawCtx && drawCanvas) {
      clearDrawingCanvas(drawCtx, drawCanvas.width, drawCanvas.height);
    }
  }, [spawnCreature]);

  // ── Auto-demo ────────────────────────────────────────────────────────────────

  const runDemoStep = useCallback((now: number, sceneW: number, sceneH: number) => {
    const demo = demoRef.current;
    const idle = now - lastUserInputRef.current > 4000;

    // Resume demo after 4s idle
    if (!idle) {
      demo.active = false;
      return;
    }
    if (!demo.active) {
      demo.active = true;
      demo.phase = 'drawing';
      demo.ptIdx = 0;
      demo.timer = now;
    }

    if (demo.phase === 'drawing') {
      const archetype = DEMO_SEQUENCE[demo.seqIdx % DEMO_SEQUENCE.length];
      const rawPts = DEMO_STROKES[archetype];
      const ptIdx = demo.ptIdx;

      // How far along the stroke are we? (advance based on time)
      const elapsed = now - demo.timer;
      const targetPtIdx = Math.min(rawPts.length - 1, Math.floor(elapsed / 60));

      // Draw ghost stroke incrementally on draw canvas
      const drawCanvas = drawCanvasRef.current;
      const drawCtx = drawCtxRef.current;
      if (drawCanvas && drawCtx) {
        if (targetPtIdx > ptIdx) {
          for (let i = Math.max(1, ptIdx); i <= targetPtIdx; i++) {
            const prev = rawPts[i - 1];
            const curr = rawPts[i];
            drawCtx.beginPath();
            drawCtx.moveTo(prev.x * sceneW, prev.y * sceneH);
            drawCtx.lineTo(curr.x * sceneW, curr.y * sceneH);
            drawCtx.strokeStyle = 'rgba(255,220,100,0.85)';
            drawCtx.lineWidth = 5;
            drawCtx.lineCap = 'round';
            drawCtx.stroke();
          }
          demo.ptIdx = targetPtIdx;

          // Update ghost cursor position
          const cur = rawPts[targetPtIdx];
          demo.ghostX = cur.x * sceneW;
          demo.ghostY = cur.y * sceneH;
        }
      }

      // Done drawing this shape?
      if (targetPtIdx >= rawPts.length - 1) {
        demo.phase = 'pausing';
        demo.timer = now;

        // Spawn the creature using bypass (no async classifier — use archetype directly)
        const strokePts = rawPts.map(p => ({
          x: p.x * sceneW,
          y: p.y * sceneH,
        }));
        const cx = rawPts.reduce((s, p) => s + p.x, 0) / rawPts.length;
        const cy = rawPts.reduce((s, p) => s + p.y, 0) / rawPts.length;
        spawnCreature(archetype, cx, Math.min(0.72, cy * 0.75), strokePts);

        // Clear draw canvas
        if (drawCanvas && drawCtx) {
          clearDrawingCanvas(drawCtx, drawCanvas.width, drawCanvas.height);
        }
      }
    } else if (demo.phase === 'pausing') {
      if (now - demo.timer > 2800) {
        // Advance to next archetype
        demo.seqIdx++;
        demo.ptIdx = 0;
        demo.phase = 'drawing';
        demo.timer = now;

        // Cap choir at 6 creatures for performance
        if (creaturesRef.current.length > 6) {
          creaturesRef.current.splice(0, creaturesRef.current.length - 6);
          setCreatureCount(creaturesRef.current.length);
        }
      }
    }
  }, [spawnCreature]);

  // ── Main animation loop ───────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'running') return;

    const sceneCanvas = sceneCanvasRef.current;
    const drawCanvasRaw = drawCanvasRef.current;
    if (!sceneCanvas || !drawCanvasRaw) return;

    const sceneCtx = sceneCanvas.getContext('2d');
    const drawCtxRaw = drawCanvasRaw.getContext('2d');
    if (!sceneCtx || !drawCtxRaw) return;

    // Capture as non-null locals so inner closures can use them safely
    const drawCanvas: HTMLCanvasElement = drawCanvasRaw;
    const drawCtx: CanvasRenderingContext2D = drawCtxRaw;

    drawCtxRef.current = drawCtx;

    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;

      sceneCanvas.width  = w * dpr;
      sceneCanvas.height = h * dpr;
      sceneCanvas.style.width  = `${w}px`;
      sceneCanvas.style.height = `${h}px`;
      sceneCtx.scale(dpr, dpr);

      drawCanvas.width  = w * dpr;
      drawCanvas.height = h * dpr;
      drawCanvas.style.width  = `${w}px`;
      drawCanvas.style.height = `${h}px`;
      drawCtx.scale(dpr, dpr);

      clearDrawingCanvas(drawCtx, w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    // ── Pointer events ─────────────────────────────────────────────────────────

    function onPointerDown(e: PointerEvent) {
      e.preventDefault();
      drawCanvas.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;
      currentPtsRef.current = [];
      lastUserInputRef.current = performance.now();
      demoRef.current.active = false;

      // Resume AudioContext if suspended (iOS)
      if (audioRef.current?.ctx.state === 'suspended') {
        audioRef.current.ctx.resume();
      }

      const rect = drawCanvas.getBoundingClientRect();
      const dpr = drawCanvas.width / rect.width;
      const px = (e.clientX - rect.left) * dpr;
      const py = (e.clientY - rect.top)  * dpr;
      currentPtsRef.current.push({ x: px, y: py });

      // Start drawing stroke on drawCanvas
      drawCtx.beginPath();
      drawCtx.moveTo(px / dpr * dpr, py / dpr * dpr); // already in scaled coords
    }

    function onPointerMove(e: PointerEvent) {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      lastUserInputRef.current = performance.now();

      const rect = drawCanvas.getBoundingClientRect();
      const dpr = drawCanvas.width / rect.width;
      const px = (e.clientX - rect.left) * dpr;
      const py = (e.clientY - rect.top)  * dpr;

      const pts = currentPtsRef.current;
      if (pts.length > 0) {
        const last = pts[pts.length - 1];
        if (Math.hypot(px - last.x, py - last.y) < 4) return;
      }
      pts.push({ x: px, y: py });

      // Draw stroke on draw canvas
      drawCtx.strokeStyle = 'rgba(255, 255, 255, 0.90)';
      drawCtx.lineWidth = 5;
      drawCtx.lineCap = 'round';
      drawCtx.lineJoin = 'round';
      if (pts.length >= 2) {
        const prev = pts[pts.length - 2];
        drawCtx.beginPath();
        drawCtx.moveTo(prev.x, prev.y);
        drawCtx.lineTo(px, py);
        drawCtx.stroke();
      }
    }

    function onPointerUp(e: PointerEvent) {
      e.preventDefault();
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      lastUserInputRef.current = performance.now();

      const pts = currentPtsRef.current;
      currentPtsRef.current = [];

      if (pts.length >= 3) {
        handleStrokeComplete(pts, w, h, w, h);
      } else {
        clearDrawingCanvas(drawCtx, w, h);
      }
    }

    drawCanvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    drawCanvas.addEventListener('pointermove', onPointerMove, { passive: false });
    drawCanvas.addEventListener('pointerup', onPointerUp);
    drawCanvas.addEventListener('pointercancel', onPointerUp);

    // ── Render loop ────────────────────────────────────────────────────────────

    const render = (now: number) => {
      if (!sceneCanvas.isConnected) return;

      // Scene
      drawBackground(sceneCtx, w, h);

      // Animate creatures
      for (const c of creaturesRef.current) {
        const age = now - c.born;
        c.scale = Math.min(1, age / 600);
        c.singing = Math.max(0, c.singing - 0.008);
        drawCreatureOnCanvas(sceneCtx, c, w, h, now);
      }

      // Auto-demo
      if (!isDrawingRef.current) {
        runDemoStep(now, w, h);
      }

      // Draw ghost cursor if demo is drawing
      const demo = demoRef.current;
      if (demo.active && demo.phase === 'drawing' && demo.ghostX > 0) {
        drawGhostCursor(sceneCtx, demo.ghostX, demo.ghostY, now * 0.003);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      drawCanvas.removeEventListener('pointerdown', onPointerDown);
      drawCanvas.removeEventListener('pointermove', onPointerMove);
      drawCanvas.removeEventListener('pointerup', onPointerUp);
      drawCanvas.removeEventListener('pointercancel', onPointerUp);
    };
  }, [phase, handleStrokeComplete, runDemoStep]);

  // ── Load classifier on start ──────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'running' || classifierLoadedRef.current) return;
    classifierLoadedRef.current = true;
    setClassifierStatus('loading AI…');
    loadClassifier().then(() => {
      const mode = getClassifierMode();
      setClassifierStatus(mode === 'ml' ? '✦ AI ready' : '◈ shape matching');
    });
  }, [phase]);

  // ── Start button handler ──────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    try {
      const audio = buildChoirAudio();
      audioRef.current = audio;
    } catch {
      // AudioContext unavailable — continue without audio
    }
    setPhase('running');
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
    };
  }, []);

  // ── Start screen ──────────────────────────────────────────────────────────

  if (phase === 'start') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-6"
        style={{ background: 'linear-gradient(180deg, #1a1040 0%, #2d1b6e 50%, #1e3a5f 100%)' }}>

        {/* Stars */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-card"
              style={{
                width: 1 + (i % 3),
                height: 1 + (i % 3),
                left: `${(i * 137.508) % 100}%`,
                top: `${(i * 89.31) % 55}%`,
                opacity: 0.3 + (i % 3) * 0.15,
              }}
            />
          ))}
        </div>

        <div className="relative text-center space-y-6 max-w-sm">
          {/* Hero */}
          <div className="text-5xl mb-2">🎨🎵✨</div>
          <h1 className="text-3xl font-bold text-foreground leading-tight">
            Doodle Choir
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            Draw something — a sun, a fish, a bird — and watch it
            <span className="text-violet-300"> come alive </span>
            and sing!
          </p>

          <div className="grid grid-cols-4 gap-3 py-2">
            {(['sun','fish','bird','plant','cloud','star','critter','home'] as Archetype[]).map(a => (
              <div key={a}
                className="flex flex-col items-center gap-1 bg-muted rounded-xl py-2 px-1">
                <span className="text-2xl">{CREATURE_CONFIG[a].emoji}</span>
                <span className="text-muted-foreground text-xs">{CREATURE_CONFIG[a].label}</span>
              </div>
            ))}
          </div>

          <button
            onPointerDown={handleStart}
            className="w-full bg-violet-400 hover:bg-violet-300 active:scale-95 text-gray-900 font-bold text-xl rounded-2xl px-8 py-4 min-h-[64px] transition-all shadow-lg"
          >
            Let&apos;s Draw! 🎨
          </button>

          <p className="text-muted-foreground text-sm">
            Finger-drawing works on phones &amp; tablets
          </p>
        </div>

        <Link
          href="/dream"
          className="fixed bottom-5 left-5 text-muted-foreground text-sm hover:text-foreground font-mono"
        >
          ← dream
        </Link>
      </div>
    );
  }

  // ── Running screen ────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 overflow-hidden touch-none select-none"
      style={{ background: '#1a1040' }}>

      {/* Scene canvas (background + creatures) */}
      <canvas
        ref={sceneCanvasRef}
        className="absolute inset-0"
        style={{ zIndex: 1 }}
      />

      {/* Draw canvas (user strokes + demo overlay) */}
      <canvas
        ref={drawCanvasRef}
        className="absolute inset-0 touch-none"
        style={{ zIndex: 2, opacity: 0.85 }}
      />

      {/* HUD — top right */}
      <div className="absolute top-4 right-4 text-right space-y-1 pointer-events-none select-none"
        style={{ zIndex: 10 }}>
        {classifierStatus && (
          <div className={`font-mono text-xs px-2 py-1 rounded ${
            classifierStatus.includes('AI ready') || classifierStatus.includes('AI recognizing')
              ? 'text-violet-300 bg-black/40'
              : classifierStatus.includes('shape')
                ? 'text-violet-300 bg-black/40'
                : 'text-muted-foreground bg-black/30'
          }`}>
            {classifierStatus}
          </div>
        )}
        {creatureCount > 0 && (
          <div className="font-mono text-xs text-muted-foreground bg-black/30 px-2 py-1 rounded">
            {creatureCount} singing {creatureCount === 1 ? 'friend' : 'friends'}
          </div>
        )}
      </div>

      {/* Instruction hint — fades after first creature */}
      {creatureCount === 0 && (
        <div className="absolute bottom-20 left-0 right-0 flex justify-center pointer-events-none"
          style={{ zIndex: 10 }}>
          <div className="bg-black/50 text-muted-foreground text-base font-medium px-5 py-3 rounded-2xl">
            ✏️ Draw anything!
          </div>
        </div>
      )}

      {/* Clear button */}
      <button
        onPointerDown={() => {
          creaturesRef.current = [];
          setCreatureCount(0);
          const drawCtx = drawCtxRef.current;
          const drawCanvas = drawCanvasRef.current;
          if (drawCtx && drawCanvas) {
            clearDrawingCanvas(drawCtx, drawCanvas.width, drawCanvas.height);
          }
          demoRef.current.seqIdx = 0;
          demoRef.current.ptIdx = 0;
          demoRef.current.phase = 'drawing';
          demoRef.current.timer = performance.now();
        }}
        className="absolute bottom-5 right-5 bg-black/50 hover:bg-black/70 border border-border
          text-muted-foreground text-sm font-mono px-4 py-2.5 rounded-lg min-h-[44px] transition-colors"
        style={{ zIndex: 10 }}
      >
        ✕ Clear
      </button>

      <Link
        href="/dream"
        className="absolute top-4 left-4 text-muted-foreground text-sm hover:text-foreground font-mono"
        style={{ zIndex: 10 }}
      >
        ← dream
      </Link>

      <Link
        href="/dream/529-kids-doodle-choir/README.md"
        className="absolute bottom-5 left-5 text-muted-foreground/70 text-xs hover:text-muted-foreground font-mono"
        style={{ zIndex: 10 }}
      >
        design notes
      </Link>
    </div>
  );
}
