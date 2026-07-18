"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSystem,
  seedLaplaceChain,
  stepSystem,
  postStep,
  applyCaptureAssist,
  detectLocks,
  periodOf,
  phaseOf,
  smaOf,
  angleOf,
  MU,
  SOFT,
  TILT_ACCEL,
  R_MAX,
  AMIN,
  AMAX,
  type Body,
  type Lock,
} from "./nbody";
import {
  OrreryVoices,
  glideFreqForPeriod,
  snapToJI,
  MAX_CRYSTALS,
  type VoiceState,
} from "./audio";
import {
  placeCrystal,
  relaxTuning,
  chordDriftCents,
  maxTemperCents,
  freqOf,
  type TunedCrystal,
} from "./tuning";
import { PrototypeNav } from "../_shared/prototype-nav";
import { README } from "./readme-text";

// ════════════════════════════════════════════════════════════════════════════
// 1930 — Harmonices III  (cycle 3 of 1930-harmonices — the lab's first 3-cycle piece)
//
// Orbital resonance as an instrument you play by TILTING. A symplectic N-body
// orrery under real gravity; tilt biases the gravity field; when two planets
// capture into a small-integer period ratio, a JUST-INTONATION dyad of exactly
// that ratio sounds. Still device → the orbits circularize toward a lone drone.
//
// CYCLE-3 deepening (the comma pump, made playable — see tuning.ts):
//   • ADAPTIVE-JI TUNING TOGGLE. Crystallized captures chain PURE intervals from
//     a moving pivot, so the chord's centre DRIFTS off the star (STRICT: you hear
//     it beat) — a real-time relaxation spreads the accumulated syntonic comma
//     across the voices to LOCK it back (ADAPTIVE: beating dies, small temper
//     paid). Flip live and the whole chord glides in/out of lock. Drift meter +
//     drift/retuned cents readouts. Stange–Wick / Pivotuner in miniature.
//
// CYCLE-2 substrate it tunes:
//   1. CHORD CRYSTALLIZATION — hold a lock ≥3.5 s and its exact interval is
//      engraved into a persistent chord stack (≤6 tones) that keeps sounding
//      after the planets drift apart, then slowly decays (~32 s) unless renewed.
//   2. CONJUNCTION BELLS — a bright chime when two planets cross the same
//      heliocentric sight-line, with a sight-line flash.
//   3. WARPED GRAVITY-WELL FIELD + a Laplace-chain seed preset.
// ════════════════════════════════════════════════════════════════════════════

const TWO_PI = Math.PI * 2;

const CRYSTALLIZE_TIME = 3.5; // seconds a lock must hold before it crystallizes
const CRYSTAL_MAXLIFE = 32; // seconds a crystal survives without renewal
const CONJ_TOL = 0.055; // radians: sight-line alignment tolerance
const CONJ_REARM = 0.16; // radians: must separate past this to re-arm the pair
const FLASH_LIFE = 0.5; // seconds a conjunction sight-line flash lasts

type InputMode = "waiting" | "sensor" | "pointer";

interface HudLock {
  p: number;
  q: number;
  strength: number;
  age: number;
}
interface HudCrystal {
  p: number;
  q: number;
  life01: number;
}
type TuningMode = "strict" | "adaptive";
interface Hud {
  locks: HudLock[];
  crystals: HudCrystal[];
  tilt: { x: number; y: number };
  calm: number;
  drift: number; // signed tonal-centre drift vs the star, cents
  temper: number; // largest interval temper the retune imposed, cents
}

/** A crystallized (persistent) interval on the chord stack. */
interface Crystal {
  id: string; // `${p}:${q}` — one crystal per distinct interval
  p: number;
  q: number;
  baseFreq: number;
  life: number; // seconds of life remaining
  bloom: number; // 0..1 etch-in flash
  seq: number; // creation order (oldest = smallest → dropped first)
  angle: number; // engraving label angle on the plate
  rf: number; // engraving ring radius factor
}

interface Flash {
  i: number;
  j: number;
  t0: number; // performance.now() of the conjunction
}

const INTERVAL_NAMES: Record<string, string> = {
  "2:1": "octave",
  "3:2": "perfect fifth",
  "4:3": "perfect fourth",
  "5:3": "major sixth",
  "5:4": "major third",
  "3:1": "octave + fifth",
  "5:2": "octave + third",
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Wrap an angle difference to [-π, π]. */
function wrapPi(d: number): number {
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}

/** Build per-planet voice states, then override captured pairs to exact JI. */
function computeVoices(bodies: Body[], locks: Lock[]): VoiceState[] {
  const voices: VoiceState[] = bodies.map((b) => {
    const ph = phaseOf(b);
    return {
      freq: glideFreqForPeriod(periodOf(b)),
      gain: 0.055 + 0.05 * (1 - ph),
    };
  });
  const sorted = [...locks].sort((a, b) => b.strength - a.strength);
  const anchored = new Set<number>();
  for (const l of sorted) {
    const lowF = anchored.has(l.i)
      ? voices[l.i].freq
      : snapToJI(voices[l.i].freq);
    voices[l.i].freq = lowF;
    voices[l.j].freq = lowF * (l.p / l.q); // exact just interval above
    anchored.add(l.i);
    anchored.add(l.j);
    voices[l.i].gain = Math.min(0.34, voices[l.i].gain + 0.2 * l.strength);
    voices[l.j].gain = Math.min(0.34, voices[l.j].gain + 0.2 * l.strength);
  }
  return voices;
}

function guideRadius(b: Body): number {
  const a = smaOf(b);
  return clamp(isFinite(a) ? a : AMAX, AMIN, AMAX);
}

/** CYCLE-2: warped equipotential contour field — the "membrane" the marbles
 *  roll on. Each ring is a true equipotential of Φ = -μ/√(r²+ε²) + tilt·r, so
 *  the whole field visibly leans when you tilt. Canvas2D, phone-cheap. */
function drawWellField(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  tilt: { x: number; y: number },
  reduced: boolean,
): void {
  const tx = reduced ? 0 : tilt.x;
  const ty = reduced ? 0 : tilt.y;
  const baseRadii = [0.42, 0.62, 0.85, 1.12, 1.45, 1.85, 2.35, 2.95];
  const N = 72;
  ctx.lineWidth = 1;
  for (let ri = 0; ri < baseRadii.length; ri++) {
    const r0 = baseRadii[ri];
    const C = -MU / Math.sqrt(r0 * r0 + SOFT * SOFT); // target potential level
    ctx.beginPath();
    for (let k = 0; k <= N; k++) {
      const th = (k / N) * TWO_PI;
      const ct = Math.cos(th);
      const st = Math.sin(th);
      const aTh = TILT_ACCEL * (tx * ct + ty * st); // linear tilt slope
      // Newton-solve Φ(r,θ) = C for r along this ray
      let r = r0;
      for (let it = 0; it < 6; it++) {
        const s2 = r * r + SOFT * SOFT;
        const f = -MU / Math.sqrt(s2) + aTh * r - C;
        const fp = (MU * r) / (s2 * Math.sqrt(s2)) + aTh;
        if (Math.abs(fp) < 1e-6) break;
        r -= f / fp;
        if (!isFinite(r) || r < 0.05) {
          r = r0;
          break;
        }
      }
      r = Math.min(R_MAX * 1.05, r);
      const px = cx + r * ct * scale;
      const py = cy + r * st * scale;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    // fainter toward the rim so it never fights the orbits
    const alpha = 0.075 * (1 - ri / (baseRadii.length + 1));
    ctx.strokeStyle = `rgba(120,86,40,${alpha.toFixed(3)})`;
    ctx.stroke();
  }
}

/** CYCLE-2: engrave each crystallized interval permanently onto the plate — a
 *  fine brass ratio-ring plus its label, brightening in a bloom the instant it
 *  sets, and fading with the crystal's remaining life. */
function drawCrystalEngravings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  crystals: Crystal[],
  time: number,
): void {
  for (const c of crystals) {
    const life01 = clamp(c.life / CRYSTAL_MAXLIFE, 0, 1);
    const radius = R_MAX * scale * c.rf;
    const aLine = 0.16 + 0.5 * life01;
    // engraved groove: dark line + a light highlight offset for depth
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = hexA("#4a3014", aLine);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TWO_PI);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = hexA("#fff4d2", aLine * 0.35);
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1.1, 0, TWO_PI);
    ctx.stroke();

    // etch-bloom the instant it crystallizes
    if (c.bloom > 0.01) {
      ctx.lineWidth = 1 + 5 * c.bloom;
      ctx.strokeStyle = hexA("#c98a2e", 0.55 * c.bloom);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TWO_PI);
      ctx.stroke();
    }

    // ratio label seated in a small parchment cartouche on the ring
    const lx = cx + Math.cos(c.angle) * radius;
    const ly = cy + Math.sin(c.angle) * radius;
    const label = `${c.p}:${c.q}`;
    ctx.font = "600 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = hexA("#efe1bf", 0.55 + 0.35 * life01);
    ctx.beginPath();
    ctx.roundRect(lx - w / 2, ly - 9, w, 18, 4);
    ctx.fill();
    ctx.strokeStyle = hexA("#8a5f28", 0.4 + 0.4 * life01);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = hexA("#5a3c16", 0.6 + 0.35 * life01);
    ctx.fillText(label, lx, ly + 0.5);
    // faint life pulse on the label so a fading crystal reads as fading
    if (life01 < 0.5) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.004);
      ctx.fillStyle = hexA("#9e2b25", (0.5 - life01) * 0.4 * pulse);
      ctx.beginPath();
      ctx.arc(lx + w / 2 + 4, ly, 2, 0, TWO_PI);
      ctx.fill();
    }
  }
}

/** CYCLE-2: brief sight-line flash across a conjunct pair. */
function drawConjunctionFlashes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  bodies: Body[],
  flashes: Flash[],
  now: number,
): void {
  for (const f of flashes) {
    const age = (now - f.t0) / 1000;
    if (age < 0 || age > FLASH_LIFE) continue;
    const a = 1 - age / FLASH_LIFE;
    const bi = bodies[f.i];
    const bj = bodies[f.j];
    if (!bi || !bj) continue;
    const ix = cx + bi.x * scale;
    const iy = cy + bi.y * scale;
    const jx = cx + bj.x * scale;
    const jy = cy + bj.y * scale;
    // extend the sight-line a touch past both bodies
    const dx = jx - ix;
    const dy = jy - iy;
    ctx.strokeStyle = hexA("#fff4ce", 0.75 * a);
    ctx.lineWidth = 0.6 + 2.2 * a;
    ctx.beginPath();
    ctx.moveTo(ix - dx * 0.12, iy - dy * 0.12);
    ctx.lineTo(jx + dx * 0.12, jy + dy * 0.12);
    ctx.stroke();
  }
}

/** Render one frame of the brass-on-parchment orrery. */
function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  dpr: number,
  bodies: Body[],
  locks: Lock[],
  crystals: Crystal[],
  flashes: Flash[],
  tilt: { x: number; y: number },
  calm: number,
  reduced: boolean,
  grain: number[][],
  time: number,
): void {
  const w = W / dpr;
  const h = H / dpr;
  ctx.save();
  ctx.scale(dpr, dpr);

  // ── parchment ground ──
  const bg = ctx.createRadialGradient(
    w / 2,
    h / 2,
    10,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  bg.addColorStop(0, "#f4e9cf");
  bg.addColorStop(1, "#e0cca1");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  if (!reduced && grain.length) {
    ctx.fillStyle = "rgba(92,64,28,0.045)";
    for (const g of grain) {
      ctx.beginPath();
      ctx.arc(g[0] * w, g[1] * h, g[2], 0, TWO_PI);
      ctx.fill();
    }
  }

  const cx = w / 2;
  const cy = h / 2;
  const SCALE = (Math.min(w, h) * 0.44) / R_MAX;

  // ── warped gravity-well membrane (under everything) ──
  drawWellField(ctx, cx, cy, SCALE, tilt, reduced);

  // ── engraved plate: outer rings + ticks ──
  ctx.strokeStyle = "rgba(120,86,40,0.4)";
  ctx.lineWidth = 1.2;
  for (const m of [1.03, 0.985]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R_MAX * SCALE * m, 0, TWO_PI);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(120,86,40,0.3)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TWO_PI;
    const r1 = R_MAX * SCALE * (i % 6 === 0 ? 0.93 : 0.965);
    const r2 = R_MAX * SCALE * 1.0;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();
  }

  // ── crystallized chord engravings (part of the permanent plate) ──
  drawCrystalEngravings(ctx, cx, cy, SCALE, crystals, time);

  // ── orbit guide rings (dashed, at each planet's current semi-major axis) ──
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = "rgba(120,86,40,0.22)";
  ctx.lineWidth = 1;
  for (const b of bodies) {
    ctx.beginPath();
    ctx.arc(cx, cy, guideRadius(b) * SCALE, 0, TWO_PI);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── glowing trails ──
  for (const b of bodies) {
    const t = b.trail;
    if (t.length < 4) continue;
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = hexA(b.hue, 0.32);
    ctx.beginPath();
    ctx.moveTo(cx + t[0] * SCALE, cy + t[1] * SCALE);
    for (let k = 2; k < t.length; k += 2) {
      ctx.lineTo(cx + t[k] * SCALE, cy + t[k + 1] * SCALE);
    }
    ctx.stroke();
    // brighter head segment
    const n = t.length;
    if (n >= 8) {
      ctx.strokeStyle = hexA(b.hue, 0.7);
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(cx + t[n - 8] * SCALE, cy + t[n - 7] * SCALE);
      for (let k = n - 6; k < n; k += 2) {
        ctx.lineTo(cx + t[k] * SCALE, cy + t[k + 1] * SCALE);
      }
      ctx.stroke();
    }
  }

  // ── conjunction sight-line flashes (bright, over trails) ──
  drawConjunctionFlashes(ctx, cx, cy, SCALE, bodies, flashes, time);

  // set of planets currently in any lock (for red rings)
  const locked = new Set<number>();
  for (const l of locks) {
    locked.add(l.i);
    locked.add(l.j);
  }

  // ── resonance lock arcs (deep red) + ratio labels ──
  for (const l of locks) {
    const a = bodies[l.i];
    const b = bodies[l.j];
    const ax = cx + a.x * SCALE;
    const ay = cy + a.y * SCALE;
    const bx = cx + b.x * SCALE;
    const by = cy + b.y * SCALE;
    const pulse = 0.55 + 0.45 * Math.sin(time * 0.006 + l.age * 4);
    // arc brightens as it approaches the crystallization threshold
    const ripe = clamp(l.age / CRYSTALLIZE_TIME, 0, 1);
    ctx.strokeStyle = hexA("#9e2b25", (0.35 + 0.5 * l.strength) * pulse);
    ctx.lineWidth = 1 + 3.4 * l.strength + 1.6 * ripe;
    // bowed connector through the star region
    const mx = (ax + bx) / 2 + (cx - (ax + bx) / 2) * 0.35;
    const my = (ay + by) / 2 + (cy - (ay + by) / 2) * 0.35;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();
    // a "ripening" halo as the hold nears crystallization
    if (ripe > 0.35 && ripe < 1) {
      ctx.strokeStyle = hexA("#c98a2e", 0.4 * ripe * pulse);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    // label
    ctx.fillStyle = hexA("#7c1f1a", 0.92);
    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${l.p}:${l.q}`, mx, my - 2);
  }

  // ── planets ──
  bodies.forEach((b, i) => {
    const sx = cx + b.x * SCALE;
    const sy = cy + b.y * SCALE;
    const rad = 4.6 + i * 0.5;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad * 3.2);
    glow.addColorStop(0, hexA(b.hue, 0.5));
    glow.addColorStop(1, hexA(b.hue, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, rad * 3.2, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = b.hue;
    ctx.beginPath();
    ctx.arc(sx, sy, rad, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = "rgba(60,38,14,0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (locked.has(i)) {
      ctx.strokeStyle = hexA("#9e2b25", 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, rad + 3.5, 0, TWO_PI);
      ctx.stroke();
    }
  });

  // ── the star ──
  const starPulse = 1 + 0.05 * Math.sin(time * 0.002) + calm * 0.35;
  const sr = 13 * starPulse;
  const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr * 4);
  sg.addColorStop(0, "rgba(255,244,206,0.95)");
  sg.addColorStop(0.4, "rgba(214,164,74,0.7)");
  sg.addColorStop(1, "rgba(214,164,74,0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(cx, cy, sr * 4, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = "#fff4ce";
  ctx.beginPath();
  ctx.arc(cx, cy, sr * 0.5, 0, TWO_PI);
  ctx.fill();

  // ── tilt compass (bottom-left) ──
  const gcx = 40;
  const gcy = h - 40;
  const gr = 24;
  ctx.strokeStyle = "rgba(120,86,40,0.55)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(gcx, gcy, gr, 0, TWO_PI);
  ctx.stroke();
  ctx.fillStyle = "rgba(120,86,40,0.5)";
  ctx.beginPath();
  ctx.arc(gcx, gcy, 2, 0, TWO_PI);
  ctx.fill();
  const tmag = Math.min(1, Math.hypot(tilt.x, tilt.y));
  ctx.strokeStyle = hexA("#9e2b25", 0.5 + 0.5 * tmag);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(gcx, gcy);
  ctx.lineTo(gcx + tilt.x * gr, gcy + tilt.y * gr);
  ctx.stroke();

  ctx.restore();
}

export default function HarmonicesTwoPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bodiesRef = useRef<Body[]>([]);
  const locksRef = useRef<Lock[]>([]);
  const crystalsRef = useRef<Crystal[]>([]);
  const crystalSeqRef = useRef(0);
  const tunedRef = useRef<TunedCrystal[]>([]); // cycle-3: per-crystal JI tuning
  const tuningModeRef = useRef<TuningMode>("strict");
  const flashesRef = useRef<Flash[]>([]);
  const armedRef = useRef<boolean[][]>([]);
  const tiltRef = useRef({ x: 0, y: 0 });
  const smoothTiltRef = useRef({ x: 0, y: 0 });
  const calmRef = useRef(0);
  const calmTimerRef = useRef(0);
  const synthRef = useRef<OrreryVoices | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const sensorSeenRef = useRef(false);
  const inputModeRef = useRef<InputMode>("waiting");
  const reducedRef = useRef(false);
  const grainRef = useRef<number[][]>([]);

  const [phase, setPhase] = useState<"idle" | "playing">("idle");
  const [inputMode, setInputMode] = useState<InputMode>("waiting");
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [tuningMode, setTuningMode] = useState<TuningMode>("strict");
  const [hud, setHud] = useState<Hud>({
    locks: [],
    crystals: [],
    tilt: { x: 0, y: 0 },
    calm: 0,
    drift: 0,
    temper: 0,
  });

  // one-time init: system, paper grain, reduced-motion
  useEffect(() => {
    bodiesRef.current = createSystem();
    const n = bodiesRef.current.length;
    armedRef.current = Array.from({ length: n }, () =>
      Array.from({ length: n }, () => true),
    );
    const grain: number[][] = [];
    let s = 0x1930;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 220; i++) grain.push([rnd(), rnd(), 0.4 + rnd() * 1.1]);
    grainRef.current = grain;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onMq = (e: MediaQueryListEvent) => {
      reducedRef.current = e.matches;
    };
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  const applyOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.gamma === null && e.beta === null) return;
    tiltRef.current = {
      x: clamp((e.gamma ?? 0) / 32, -1.2, 1.2),
      y: clamp((e.beta ?? 0) / 32, -1.2, 1.2),
    };
    if (!sensorSeenRef.current) {
      sensorSeenRef.current = true;
      inputModeRef.current = "sensor";
      setInputMode("sensor");
    }
  }, []);

  const applyPointer = useCallback((e: PointerEvent) => {
    if (inputModeRef.current === "sensor") return;
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    tiltRef.current = {
      x: clamp(nx * 1.1, -1.2, 1.2),
      y: clamp(ny * 1.1, -1.2, 1.2),
    };
  }, []);

  const seedChain = useCallback(() => {
    seedLaplaceChain(bodiesRef.current);
    locksRef.current = [];
    flashesRef.current = [];
    calmTimerRef.current = 0;
    calmRef.current = 0;
    const n = bodiesRef.current.length;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) armedRef.current[i][j] = true;
  }, []);

  const toggleTuning = useCallback(() => {
    const next: TuningMode =
      tuningModeRef.current === "strict" ? "adaptive" : "strict";
    tuningModeRef.current = next;
    setTuningMode(next);
  }, []);

  const startPlay = useCallback(
    async (seed: boolean) => {
      if (phase === "playing") {
        if (seed) seedChain();
        return;
      }
      // audio inside the user gesture
      try {
        const synth = new OrreryVoices(bodiesRef.current.length);
        await synth.start();
        synthRef.current = synth;
      } catch {
        setAudioNotice(
          "Web Audio is unavailable in this browser — the orrery runs silent.",
        );
      }
      // orientation permission (iOS) inside the same gesture
      sensorSeenRef.current = false;
      inputModeRef.current = "waiting";
      setInputMode("waiting");
      try {
        const DOE = window.DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<"granted" | "denied">;
        };
        if (DOE && typeof DOE.requestPermission === "function") {
          const res = await DOE.requestPermission();
          if (res === "granted")
            window.addEventListener("deviceorientation", applyOrientation);
        } else if ("DeviceOrientationEvent" in window) {
          window.addEventListener("deviceorientation", applyOrientation);
        }
      } catch {
        /* no sensor — pointer carries it */
      }
      window.addEventListener("pointermove", applyPointer);
      // desktop fallback: no sensor within ~1s → pointer = tilt
      window.setTimeout(() => {
        if (!sensorSeenRef.current) {
          inputModeRef.current = "pointer";
          setInputMode("pointer");
        }
      }, 1000);
      if (seed) seedChain();
      setPhase("playing");
    },
    [phase, applyOrientation, applyPointer, seedChain],
  );

  // main loop — runs only while playing
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    lastRef.current = performance.now();
    let hudT = 0;

    const loop = () => {
      if (cancelled) return;
      const now = performance.now();
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      dt = clamp(dt, 0, 0.05);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (
        canvas.width !== Math.floor(cw * dpr) ||
        canvas.height !== Math.floor(ch * dpr)
      ) {
        canvas.width = Math.floor(cw * dpr);
        canvas.height = Math.floor(ch * dpr);
      }

      // smooth the tilt input
      const raw = tiltRef.current;
      const st = smoothTiltRef.current;
      const kS = Math.min(1, dt * 8);
      st.x += (raw.x - st.x) * kS;
      st.y += (raw.y - st.y) * kS;
      const tmag = Math.hypot(st.x, st.y);

      // calm accumulator → lone drone
      if (tmag < 0.06) calmTimerRef.current += dt;
      else calmTimerRef.current = 0;
      const targetCalm =
        calmTimerRef.current > 2
          ? Math.min(1, (calmTimerRef.current - 2) / 3)
          : 0;
      calmRef.current += (targetCalm - calmRef.current) * Math.min(1, dt * 1.5);
      const calm = calmRef.current;

      // integrate (2 symplectic substeps)
      const bodies = bodiesRef.current;
      const sub = 2;
      const sdt = dt / sub;
      for (let k = 0; k < sub; k++) {
        stepSystem(bodies, sdt, st.x * TILT_ACCEL, st.y * TILT_ACCEL);
        applyCaptureAssist(bodies, locksRef.current, sdt);
        postStep(bodies, sdt, calm);
      }

      // resonance detection + new-lock pings
      const prev = locksRef.current;
      const locks = detectLocks(bodies, prev, dt);
      const voices = computeVoices(bodies, locks);
      for (const l of locks) {
        const existed = prev.some(
          (p) =>
            (p.i === l.i && p.j === l.j) || (p.i === l.j && p.j === l.i),
        );
        if (!existed) synthRef.current?.ping(voices[l.j].freq);
      }
      locksRef.current = locks;
      synthRef.current?.update(voices, calm);

      // ── CYCLE-2 (1): chord crystallization ──
      const crystals = crystalsRef.current;
      // decay every crystal's life first
      for (const c of crystals) {
        c.life -= dt;
        c.bloom *= Math.exp(-dt * 2.2);
      }
      // a lock held past the threshold crystallizes (or refreshes) its interval
      for (const l of locks) {
        if (l.age < CRYSTALLIZE_TIME) continue;
        const id = `${l.p}:${l.q}`;
        const found = crystals.find((c) => c.id === id);
        if (found) {
          found.life = CRYSTAL_MAXLIFE; // renew — holding keeps it alive
          continue;
        }
        // new interval: make room (drop the oldest), then deposit it
        if (crystals.length >= MAX_CRYSTALS) {
          let oldestIdx = 0;
          for (let k = 1; k < crystals.length; k++)
            if (crystals[k].seq < crystals[oldestIdx].seq) oldestIdx = k;
          const dropped = crystals.splice(oldestIdx, 1)[0];
          synthRef.current?.removeCrystal(dropped.id);
          const ti = tunedRef.current.findIndex((t) => t.id === dropped.id);
          if (ti >= 0) tunedRef.current.splice(ti, 1);
        }
        const seq = crystalSeqRef.current++;
        // CYCLE-3: place this capture on the adaptive-JI lattice. The first
        // crystal snaps to the star's grid; later ones chain a PURE interval
        // from the nearest sounding tone — that pure chain is where the comma
        // enters, and the retuner below decides whether it drifts or locks.
        const tuned = placeCrystal(
          tunedRef.current,
          voices[l.i].freq,
          l.p,
          l.q,
        );
        tunedRef.current.push(tuned);
        const baseFreq = freqOf(tuned.lo);
        const born =
          synthRef.current?.crystallize(id, baseFreq, l.p / l.q) ?? true;
        crystals.push({
          id,
          p: l.p,
          q: l.q,
          baseFreq,
          life: CRYSTAL_MAXLIFE,
          bloom: born ? 1 : 0.4,
          seq,
          angle: -Math.PI / 2 + seq * 2.39996,
          rf: 0.52 + (seq % 3) * 0.115,
        });
      }
      // push levels and reap dead crystals
      for (let k = crystals.length - 1; k >= 0; k--) {
        const c = crystals[k];
        if (c.life <= 0) {
          synthRef.current?.removeCrystal(c.id);
          crystals.splice(k, 1);
          const ti = tunedRef.current.findIndex((t) => t.id === c.id);
          if (ti >= 0) tunedRef.current.splice(ti, 1);
          continue;
        }
        synthRef.current?.setCrystalLevel(c.id, c.life / CRYSTAL_MAXLIFE);
      }

      // ── CYCLE-3: adaptive-JI retune. STRICT holds each capture's pure ratio
      //   and lets the chord centre drift against the fixed star drone; ADAPTIVE
      //   spreads the accumulated comma across every voice so the centre locks
      //   back. Relax a fraction each frame → the lock GLIDES when you toggle. ──
      const tuned = tunedRef.current;
      if (tuned.length) {
        relaxTuning(tuned, tuningModeRef.current, Math.min(1, dt * 2.4));
        for (const tc of tuned) {
          synthRef.current?.setCrystalFreqs(
            tc.id,
            freqOf(tc.lo),
            freqOf(tc.lo + tc.iv),
          );
        }
      }

      // ── CYCLE-2 (2): conjunction bells + sight-line flashes ──
      if (calm < 0.6) {
        const angles = bodies.map(angleOf);
        const armed = armedRef.current;
        for (let i = 0; i < bodies.length; i++) {
          for (let j = i + 1; j < bodies.length; j++) {
            const d = Math.abs(wrapPi(angles[i] - angles[j]));
            if (d > CONJ_REARM) {
              armed[i][j] = true;
            } else if (d < CONJ_TOL && armed[i][j]) {
              armed[i][j] = false;
              // bell pitch: a just degree of the star lattice from the faster
              const faster = periodOf(bodies[i]) <= periodOf(bodies[j]) ? i : j;
              const bf = snapToJI(glideFreqForPeriod(periodOf(bodies[faster])));
              synthRef.current?.bell(bf);
              flashesRef.current.push({ i, j, t0: now });
            }
          }
        }
      }
      // reap old flashes
      flashesRef.current = flashesRef.current.filter(
        (f) => now - f.t0 < FLASH_LIFE * 1000,
      );

      // trails
      const maxTrail = reducedRef.current ? 36 : 110;
      for (const b of bodies) {
        b.trail.push(b.x, b.y);
        const excess = b.trail.length - maxTrail * 2;
        if (excess > 0) b.trail.splice(0, excess);
      }

      drawScene(
        ctx,
        canvas.width,
        canvas.height,
        dpr,
        bodies,
        locks,
        crystals,
        flashesRef.current,
        st,
        calm,
        reducedRef.current,
        grainRef.current,
        now,
      );

      if (now - hudT > 90) {
        hudT = now;
        setHud({
          locks: locks.map((l) => ({
            p: l.p,
            q: l.q,
            strength: l.strength,
            age: l.age,
          })),
          crystals: crystals
            .slice()
            .sort((a, b) => a.seq - b.seq)
            .map((c) => ({
              p: c.p,
              q: c.q,
              life01: clamp(c.life / CRYSTAL_MAXLIFE, 0, 1),
            })),
          tilt: { x: st.x, y: st.y },
          calm,
          drift: chordDriftCents(tunedRef.current),
          temper: maxTemperCents(tunedRef.current),
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  // unmount teardown
  useEffect(() => {
    return () => {
      window.removeEventListener("deviceorientation", applyOrientation);
      window.removeEventListener("pointermove", applyPointer);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      synthRef.current?.stop();
      synthRef.current = null;
    };
  }, [applyOrientation, applyPointer]);

  const modeLabel =
    inputMode === "sensor"
      ? "device tilt"
      : inputMode === "pointer"
        ? "pointer = tilt"
        : "listening for sensor…";

  const alive = hud.calm < 0.5;

  return (
    <main className="min-h-[calc(100vh-3rem)] w-full bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <header className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Harmonices III
              </h1>
              <p className="mt-1 max-w-xl text-base text-muted-foreground">
                Play orbital resonance by tilting. Hold a lock and its pure
                interval crystallizes into a growing chord you compose — then
                choose its intonation: <span className="text-foreground">strict</span>{" "}
                lets the pure chord drift off the star and beat;{" "}
                <span className="text-foreground">adaptive</span> spreads the comma
                and locks it back. The 300-year-old comma pump, made playable.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Design notes
            </button>
          </div>
        </header>

        <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-lg border border-border shadow-lg">
          <canvas
            ref={canvasRef}
            className="block h-full w-full touch-none"
            aria-label="An antique orrery: a star and five planets orbiting under gravity, with resonance lock arcs and a crystallized chord engraved on the plate."
          />
          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#efe4cb]/85 backdrop-blur-sm">
              <p className="max-w-xs px-6 text-center text-base text-[#5a4326]">
                Tilt your phone — or move the pointer on a laptop — to steer the
                gravity field and pump planets into resonance. Hold a lock to
                crystallize its interval into the chord.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => startPlay(false)}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Tilt to play
                </button>
                <button
                  onClick={() => startPlay(true)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Start with a resonant chain
                </button>
              </div>
            </div>
          )}
        </div>

        {audioNotice && (
          <p className="mt-3 text-sm text-destructive">{audioNotice}</p>
        )}

        {phase === "playing" && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                input: {modeLabel}
              </span>
              <span className="text-muted-foreground">·</span>
              <span
                className={`font-mono text-xs uppercase tracking-[0.18em] ${
                  alive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {alive ? "orbits alive" : "decaying to drone — tilt to revive"}
              </span>
              <span className="grow" />
              <button
                onClick={() => seedChain()}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Seed a resonant chain
              </button>
            </div>

            {/* harmonic ledger — the crystallized chord stack */}
            <div className="mt-3">
              <div className="mb-1.5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                harmonic ledger
                {hud.crystals.length > 0
                  ? ` · ${hud.crystals.length}/${MAX_CRYSTALS}`
                  : ""}
              </div>
              {hud.crystals.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  No crystals yet — hold a lock steady for {CRYSTALLIZE_TIME}s and
                  its interval sets into the chord.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {hud.crystals.map((c, idx) => {
                    const key = `${c.p}:${c.q}`;
                    return (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
                        style={{ opacity: 0.45 + 0.55 * c.life01 }}
                      >
                        <span className="font-mono font-semibold text-foreground">
                          {key}
                        </span>
                        <span className="text-muted-foreground">
                          {INTERVAL_NAMES[key] ?? "just interval"}
                        </span>
                        <span
                          aria-hidden
                          className="h-1.5 w-8 overflow-hidden rounded-full bg-border"
                        >
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${Math.round(c.life01 * 100)}%` }}
                          />
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* CYCLE-3: adaptive-JI intonation — strict drifts, adaptive locks */}
            <div className="mt-3 rounded-md border border-border bg-background/40 p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  intonation
                </span>
                <div className="inline-flex overflow-hidden rounded-md border border-border">
                  <button
                    onClick={() => tuningMode !== "strict" && toggleTuning()}
                    aria-pressed={tuningMode === "strict"}
                    className={`min-h-[44px] px-4 text-sm transition-colors ${
                      tuningMode === "strict"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    Strict physics
                  </button>
                  <button
                    onClick={() => tuningMode !== "adaptive" && toggleTuning()}
                    aria-pressed={tuningMode === "adaptive"}
                    className={`min-h-[44px] border-l border-border px-4 text-sm transition-colors ${
                      tuningMode === "adaptive"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    Adaptive pure
                  </button>
                </div>
                <span className="font-mono text-sm text-foreground tabular-nums">
                  drift {hud.drift >= 0 ? "+" : "−"}
                  {Math.abs(hud.drift).toFixed(1)}¢
                </span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  retuned ±{hud.temper.toFixed(1)}¢
                </span>
              </div>
              {/* drift meter: needle vs the star's fixed centre (0¢) over ±30¢ */}
              <div
                className="relative mt-2.5 h-2 w-full max-w-xs overflow-hidden rounded-full bg-border"
                aria-hidden
              >
                <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-muted-foreground/50" />
                <span
                  className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary transition-[left] duration-150"
                  style={{
                    left: `${clamp(50 + (hud.drift / 30) * 50, 2, 98)}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {tuningMode === "strict"
                  ? "Strict keeps every captured ratio pure — so the chord's centre drifts off the star and you hear it beat. The syntonic comma, made audible."
                  : "Adaptive spreads the accumulated comma across every voice, so the centre locks back to the star. The retune is the price of anchored, pure-sounding harmony."}
              </p>
            </div>

            {/* transient resonance locks */}
            <div className="mt-3 min-h-[2.5rem]">
              {hud.locks.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  Seeking resonance — nudge two orbits toward a whole-number
                  ratio (3:2, 2:1, 4:3, 5:3, 5:4).
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {hud.locks.map((l, idx) => {
                    const key = `${l.p}:${l.q}`;
                    const ripe = clamp(l.age / CRYSTALLIZE_TIME, 0, 1);
                    return (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                        style={{
                          borderColor: "rgba(158,43,37,0.5)",
                          backgroundColor: `rgba(158,43,37,${0.06 + 0.14 * l.strength})`,
                          color: "#7c1f1a",
                        }}
                      >
                        <span className="font-mono font-semibold">{key}</span>
                        <span className="text-[#7c1f1a]/80">
                          {INTERVAL_NAMES[key] ?? "just interval"}
                        </span>
                        <span className="font-mono text-xs text-[#7c1f1a]/70">
                          {ripe >= 1 ? "set" : `${Math.round(ripe * 100)}%`}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-tight">
                Design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <pre className="mt-4 whitespace-pre-wrap font-sans text-base leading-relaxed text-muted-foreground">
              {README}
            </pre>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1930-harmonices"]} />
    </main>
  );
}
