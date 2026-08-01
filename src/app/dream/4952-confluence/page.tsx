"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 4952 · Confluence — the meeting of the waters
//
//   ONE QUESTION — When two rivers meet, their waters don't instantly blend: a
//   coherent mixing interface (a shear layer) persists downstream for a long way
//   before the two identities finally merge. Can you SEE two watersheds erode
//   themselves, meet at a confluence, and HEAR the two river-voices flow
//   side-by-side and only gradually braid into one?
//
//   A shared droplet hydraulic-erosion engine (Musgrave/Beyer) carves a seeded
//   two-peak heightfield in real time. This face renders it as a Canvas2D
//   shaded-relief cartographic map (hillshade + glowing rivers). Two basins cut
//   their own dendritic trees; both drain to a shared spillway where a downstream
//   MIXING-INTERFACE model braids their two tinted threads into one — the seam
//   persisting further when the two basins are more unequal (Jiang et al. 2026).
//
//   INPUT   pointer / touch drag on the map = "rain here" (carves a starter
//           valley under your finger). Buttons: Start (rain, with sound) ·
//           Reseed · contrast slider. No keyboard, no mic.
//   OUTPUT  Canvas2D shaded-relief raster only (no SVG, no WebGL). AUDIO: two
//           panned marimba voices that converge to one as the interface resolves.
//   REF     Musgrave, Kolb & Mace (SIGGRAPH 1989); Mei, Decaudin & Hu (PG 2007);
//           Jiang et al. (Water Resources Research 2026). See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  makeTerrain,
  erode,
  DEFAULT_ERODE,
  mulberry32,
  drainageMaturity,
  type TerrainField,
  type ErodeParams,
} from "../_shared/erosion/engine";

// ── grid + view geometry ─────────────────────────────────────────────────────
const N = 120; // terrain grid
const VIEW = 720; // canvas internal resolution (square)
const SC = VIEW / (N - 1); // grid-cell → canvas px
const REDRAW_EVERY = 3; // recompute relief + network every N sim frames
const STEPS = 14; // resampled length of each spine melody loop
const BASE_SEED = 0x4952;

// dome (mountain) centres, in normalised map coords — one basin each.
const DOME_A = { u: 0.3, v: 0.36 };
const DOME_B = { u: 0.7, v: 0.36 };

// ── cartographic relief ramp (violet, low → high; art only) ──────────────────
const RELIEF_RAMP: [number, number, number][] = [
  [21, 10, 36],
  [36, 17, 71],
  [52, 31, 107],
  [69, 42, 148],
  [91, 46, 201],
  [122, 88, 236],
  [151, 123, 244],
  [180, 161, 248],
  [216, 204, 255],
];

// basin identities on the on-brand violet ramp: A cool, B warm/magenta, mid merged.
const COOL_A: [number, number, number] = [109, 92, 240]; // basin A voice colour
const WARM_B: [number, number, number] = [192, 92, 240]; // basin B voice colour
const MID_MIX: [number, number, number] = [154, 108, 242]; // fully-blended trunk

// ── musical scales (altitude → pitch) ────────────────────────────────────────
const PENTA = [0, 2, 4, 7, 9]; // major pentatonic — settled, mature
const SEARCH = [0, 2, 3, 5, 7, 9, 10]; // wider — early, searching
function buildScale(intervals: number[], base: number, octaves: number): number[] {
  const out: number[] = [];
  for (let o = 0; o < octaves; o++) for (const iv of intervals) out.push(base + o * 12 + iv);
  return out;
}
const SCALE_MATURE = buildScale(PENTA, 48, 4);
const SCALE_EARLY = buildScale(SEARCH, 48, 4);

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
function clampi(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function smooth01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}
function gauss(u: number, v: number, cu: number, cv: number, su: number, sv: number): number {
  const du = (u - cu) / su;
  const dv = (v - cv) / sv;
  return Math.exp(-0.5 * (du * du + dv * dv));
}

// ── two-basin terrain ────────────────────────────────────────────────────────
// The shared engine builds ONE central dome. We recover its fractal-ridge texture
// (the dome term is a known closed form) and re-mould it into TWO source peaks
// with a fading central divide and a shared bottom-centre spillway, so both
// basins carve their own tree and meet at one confluence before draining off-map.
function installTwoBasins(field: TerrainField, contrast: number): void {
  const { size, height } = field;
  const ampA = 0.64 + 0.2 * contrast; // taller peak
  const ampB = 0.64 - 0.2 * contrast; // shorter peak → unequal basins
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / (size - 1);
      const v = y / (size - 1);
      // recover the engine's fractal ridge texture by subtracting its dome bias.
      const cx = u - 0.5;
      const cy = v - 0.5;
      const d = Math.sqrt(cx * cx + cy * cy) * 1.414;
      const domeEngine = (0.62 - d) * 0.75;
      const noise = Math.max(0, (height[i] - domeEngine) / 0.7);
      // two source mountains
      const domeA = ampA * gauss(u, v, DOME_A.u, DOME_A.v, 0.17, 0.2);
      const domeB = ampB * gauss(u, v, DOME_B.u, DOME_B.v, 0.17, 0.2);
      // central divide ridge upstream, faded away before the confluence
      const divideFade = smooth01((0.62 - v) / 0.5);
      const dv = (u - 0.5) / 0.045;
      const divide = 0.42 * Math.exp(-0.5 * dv * dv) * divideFade;
      // bottom-centre spillway trench (the shared outlet channel)
      const tv = (u - 0.5) / 0.06;
      const trench = 0.5 * Math.exp(-0.5 * tv * tv) * smooth01((v - 0.58) / 0.4);
      // containment rims so the ONLY exit is the trench mouth at bottom-centre
      const rimX =
        (u < 0.5 ? smooth01((0.1 - u) / 0.1) : smooth01((u - 0.9) / 0.1)) * 0.26;
      const rimTop = smooth01((0.06 - v) / 0.06) * 0.22;
      const rimBottom =
        v > 0.9 && Math.abs(u - 0.5) > 0.12
          ? smooth01((v - 0.9) / 0.1) * smooth01((Math.abs(u - 0.5) - 0.12) / 0.1) * 0.34
          : 0;
      let h = noise * 0.2 + domeA + domeB + divide - 0.3 * v - trench;
      h += rimX + rimTop + rimBottom;
      height[i] = Math.max(0, h) + 0.02;
    }
  }
}

// gentle rainfall carved under the pointer — biases WHERE it rains. Edits the
// shared heightfield with a soft brush; the imported droplet physics still runs.
function applyRainBrush(
  field: TerrainField,
  gx: number,
  gy: number,
  radius: number,
  strength: number,
): void {
  const { size, height, water } = field;
  const cx = Math.round(gx);
  const cy = Math.round(gy);
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd > radius) continue;
      const fall = 1 - dd / radius;
      const i = y * size + x;
      height[i] = Math.max(0, height[i] - strength * fall * fall);
      water[i] = Math.min(1, water[i] + 0.5 * fall);
    }
  }
}

// steepest-descent walk from (sx,sy) to a river mouth, collecting cells + heights.
type PathPt = { x: number; y: number; h: number };
function descend(height: Float32Array, size: number, sx: number, sy: number): PathPt[] {
  const path: PathPt[] = [];
  let cx = sx;
  let cy = sy;
  for (let step = 0; step < 400; step++) {
    path.push({ x: cx, y: cy, h: height[cy * size + cx] });
    let bh = height[cy * size + cx];
    let bx = cx;
    let by = cy;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const nh = height[ny * size + nx];
        if (nh < bh) {
          bh = nh;
          bx = nx;
          by = ny;
        }
      }
    }
    if (bx === cx && by === cy) break; // local pit
    cx = bx;
    cy = by;
    if (cy >= size - 2 || cx <= 1 || cx >= size - 2) {
      path.push({ x: cx, y: cy, h: height[cy * size + cx] });
      break; // reached the map edge = mouth
    }
  }
  return path;
}

// highest cell within a radius of a normalised centre — the channel head/summit.
function summitCell(
  height: Float32Array,
  size: number,
  cu: number,
  cv: number,
  radCells: number,
): { x: number; y: number } {
  const ccx = Math.round(cu * (size - 1));
  const ccy = Math.round(cv * (size - 1));
  let best = -Infinity;
  let bx = ccx;
  let by = ccy;
  const r = Math.round(radCells);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = ccx + dx;
      const y = ccy + dy;
      if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
      if (dx * dx + dy * dy > r * r) continue;
      const h = height[y * size + x];
      if (h > best) {
        best = h;
        bx = x;
        by = y;
      }
    }
  }
  return { x: bx, y: by };
}

// resample a list of heights to STEPS normalised (0..1) melody values.
function resampleSpine(alts: number[], mn: number, span: number): number[] {
  if (alts.length < 2) return [];
  const out: number[] = [];
  for (let i = 0; i < STEPS; i++) {
    const t = (i / (STEPS - 1)) * (alts.length - 1);
    const i0 = Math.floor(t);
    const i1 = Math.min(alts.length - 1, i0 + 1);
    const f = t - i0;
    const h = alts[i0] * (1 - f) + alts[i1] * f;
    out.push(clampi((h - mn) / span, 0, 1));
  }
  return out;
}

// the emergent river network: two basin spines + the shared braided trunk.
type Network = {
  spineA: number[]; // resampled altitudes 0..1 (basin A voice)
  spineB: number[]; // resampled altitudes 0..1 (basin B voice)
  trunk: { x: number; y: number; s: number }[]; // trunk centreline (px) + downstream 0..1
  confluence: { x: number; y: number } | null; // px
};

function computeNetwork(field: TerrainField, mn: number, span: number): Network {
  const { size, height } = field;
  const headA = summitCell(height, size, DOME_A.u, DOME_A.v, size * 0.14);
  const headB = summitCell(height, size, DOME_B.u, DOME_B.v, size * 0.14);
  const pathA = descend(height, size, headA.x, headA.y);
  const pathB = descend(height, size, headB.x, headB.y);

  // find the confluence: first point on A within 2 cells of any point on B.
  let confIdxA = -1;
  let confIdxB = -1;
  outer: for (let i = 0; i < pathA.length; i++) {
    for (let j = 0; j < pathB.length; j++) {
      const dx = pathA[i].x - pathB[j].x;
      const dy = pathA[i].y - pathB[j].y;
      if (dx * dx + dy * dy <= 4) {
        confIdxA = i;
        confIdxB = j;
        break outer;
      }
    }
  }

  let confluence: { x: number; y: number } | null = null;
  let trunkCells: PathPt[];
  let altsA: number[];
  let altsB: number[];
  if (confIdxA >= 0) {
    const a = pathA[confIdxA];
    confluence = { x: a.x * SC, y: a.y * SC };
    trunkCells = pathA.slice(confIdxA);
    altsA = pathA.slice(0, confIdxA + 1).map((p) => p.h);
    altsB = pathB.slice(0, confIdxB + 1).map((p) => p.h);
  } else {
    // fallback (very early frames): treat the lower third of A as trunk.
    const cut = Math.floor(pathA.length * 0.66);
    trunkCells = pathA.slice(cut);
    altsA = pathA.map((p) => p.h);
    altsB = pathB.map((p) => p.h);
  }

  // trunk centreline with cumulative downstream distance normalised to 0..1.
  const trunk: { x: number; y: number; s: number }[] = [];
  let acc = 0;
  for (let i = 0; i < trunkCells.length; i++) {
    const px = trunkCells[i].x * SC;
    const py = trunkCells[i].y * SC;
    if (i > 0) {
      const dx = px - trunk[i - 1].x;
      const dy = py - trunk[i - 1].y;
      acc += Math.hypot(dx, dy);
    }
    trunk.push({ x: px, y: py, s: acc });
  }
  const total = acc > 1e-3 ? acc : 1;
  for (const t of trunk) t.s /= total;

  return {
    spineA: resampleSpine(altsA, mn, span),
    spineB: resampleSpine(altsB, mn, span),
    trunk,
    confluence,
  };
}

export default function ConfluencePage() {
  const [seed, setSeed] = useState(20260979);
  const [audioOn, setAudioOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contrast, setContrast] = useState(0.55);

  // ── live simulation refs (never trigger React re-renders) ──────────────────
  const fieldRef = useRef<TerrainField | null>(null);
  const rngRef = useRef<() => number>(mulberry32(BASE_SEED));
  const audioRngRef = useRef<() => number>(mulberry32(977));
  const minHRef = useRef(0);
  const spanRef = useRef(1);
  const matRef = useRef(0);
  const contrastRef = useRef(0.55);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const rainingRef = useRef(false);
  const rainPtRef = useRef<{ x: number; y: number } | null>(null);
  const netRef = useRef<Network | null>(null);

  // ── canvas refs ────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reliefRef = useRef<HTMLCanvasElement | null>(null); // offscreen N×N hillshade
  const reliefDataRef = useRef<ImageData | null>(null);
  const matLabelRef = useRef<HTMLSpanElement | null>(null);

  // ── audio refs ─────────────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const droneGainRef = useRef<GainNode | null>(null);
  const audioOnRef = useRef(false);
  const nextNoteRef = useRef(0);
  const melIdxRef = useRef(0);
  const voicesRef = useRef(0);
  const lastAccentRef = useRef(0);

  // ── vector rivers (tinted by basin) + the braided mixing-interface trunk ────
  const drawRivers = useCallback((ctx: CanvasRenderingContext2D, field: TerrainField) => {
    const { size, height, water } = field;
    const coolPath = new Path2D(); // basin A rivers (left, cool)
    const warmPath = new Path2D(); // basin B rivers (right, warm/magenta)
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        const ww = water[i];
        if (ww < 0.07) continue;
        let bh = height[i];
        let bx = x;
        let by = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nh = height[(y + dy) * size + (x + dx)];
            if (nh < bh) {
              bh = nh;
              bx = x + dx;
              by = y + dy;
            }
          }
        }
        if (bx === x && by === y) continue;
        const p = x < size / 2 ? coolPath : warmPath;
        p.moveTo(x * SC, y * SC);
        p.lineTo(bx * SC, by * SC);
      }
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // glow underlay
    ctx.save();
    ctx.shadowColor = "rgba(150,110,245,0.9)";
    ctx.shadowBlur = 10;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(${COOL_A[0]},${COOL_A[1]},${COOL_A[2]},0.55)`;
    ctx.lineWidth = 3.2;
    ctx.stroke(coolPath);
    ctx.strokeStyle = `rgba(${WARM_B[0]},${WARM_B[1]},${WARM_B[2]},0.55)`;
    ctx.stroke(warmPath);
    ctx.restore();
    // bright cores
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(${COOL_A[0]},${COOL_A[1]},${COOL_A[2]},0.85)`;
    ctx.lineWidth = 1.4;
    ctx.stroke(coolPath);
    ctx.strokeStyle = `rgba(${WARM_B[0]},${WARM_B[1]},${WARM_B[2]},0.85)`;
    ctx.stroke(warmPath);
    ctx.restore();

    // ── the mixing interface: two tinted threads that braid into one ──────────
    const net = netRef.current;
    if (net && net.trunk.length > 2) {
      const persist = 0.12 + 0.5 * contrastRef.current; // contrast → longer seam
      const halfW = 11; // px half-separation at the confluence
      const trunk = net.trunk;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      // draw both threads as coloured segments; separation + colour resolve with s
      for (let pass = 0; pass < 2; pass++) {
        const glow = pass === 0;
        ctx.shadowBlur = glow ? 12 : 0;
        ctx.shadowColor = "rgba(150,110,245,0.8)";
        ctx.lineWidth = glow ? 6 : 3;
        for (let i = 1; i < trunk.length; i++) {
          const a = trunk[i - 1];
          const b = trunk[i];
          let tx = b.x - a.x;
          let ty = b.y - a.y;
          const tl = Math.hypot(tx, ty) || 1;
          tx /= tl;
          ty /= tl;
          const nx = -ty; // perpendicular
          const ny = tx;
          const s = (a.s + b.s) * 0.5;
          const sep = Math.exp(-s / persist); // 1 at confluence → 0 downstream
          const off = halfW * sep;
          const alpha = glow ? 0.4 : 0.9;
          // thread A (cool), offset -normal, colour lerps toward the merged mid
          drawSeg(ctx, a, b, -nx * off, -ny * off, COOL_A, 1 - sep, alpha);
          // thread B (warm), offset +normal
          drawSeg(ctx, a, b, nx * off, ny * off, WARM_B, 1 - sep, alpha);
        }
      }
      ctx.restore();

      // a soft glowing node at the confluence itself
      if (net.confluence) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const rad = 9;
        const grad = ctx.createRadialGradient(
          net.confluence.x,
          net.confluence.y,
          0,
          net.confluence.x,
          net.confluence.y,
          rad,
        );
        grad.addColorStop(0, "rgba(220,205,255,0.95)");
        grad.addColorStop(1, "rgba(150,110,245,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(net.confluence.x, net.confluence.y, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // rain indicator
    const rp = rainPtRef.current;
    if (rainingRef.current && rp) {
      ctx.save();
      ctx.strokeStyle = "rgba(221,214,254,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rp.x * SC, rp.y * SC, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  // ── shaded-relief hillshade → offscreen ImageData, drawn scaled to canvas ───
  const drawRelief = useCallback(
    (field: TerrainField) => {
    const { size, height, water } = field;
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < height.length; i++) {
      const h = height[i];
      if (h < mn) mn = h;
      if (h > mx) mx = h;
    }
    if (mx - mn < 1e-4) mx = mn + 1e-4;
    minHRef.current = mn;
    spanRef.current = mx - mn;
    const span = mx - mn;

    let off = reliefRef.current;
    if (!off) {
      off = document.createElement("canvas");
      off.width = size;
      off.height = size;
      reliefRef.current = off;
    }
    const octx = off.getContext("2d");
    if (!octx) return;
    let img = reliefDataRef.current;
    if (!img || img.width !== size) {
      img = octx.createImageData(size, size);
      reliefDataRef.current = img;
    }
    const data = img.data;
    const zScale = 26; // relief exaggeration
    // light from the upper-left, elevated (classic cartographic hillshade)
    const lx = -0.55;
    const ly = -0.62;
    const lz = 0.56;
    const ll = Math.hypot(lx, ly, lz);
    const lnx = lx / ll;
    const lny = ly / ll;
    const lnz = lz / ll;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const xl = x > 0 ? height[i - 1] : height[i];
        const xr = x < size - 1 ? height[i + 1] : height[i];
        const yt = y > 0 ? height[i - size] : height[i];
        const yb = y < size - 1 ? height[i + size] : height[i];
        const gx = (xr - xl) * zScale;
        const gy = (yb - yt) * zScale;
        // surface normal (-gx,-gy,1) dotted with the light
        const nl = Math.hypot(gx, gy, 1);
        const dot = (-gx * lnx - gy * lny + lnz) / nl;
        const shade = 0.32 + 0.78 * Math.max(0, dot);
        // hypsometric base colour
        const t = clampi((height[i] - mn) / span, 0, 1) * (RELIEF_RAMP.length - 1);
        const c0 = RELIEF_RAMP[Math.floor(t)];
        const c1 = RELIEF_RAMP[Math.min(RELIEF_RAMP.length - 1, Math.floor(t) + 1)];
        const f = t - Math.floor(t);
        let r = (c0[0] + (c1[0] - c0[0]) * f) * shade;
        let g = (c0[1] + (c1[1] - c0[1]) * f) * shade;
        let b = (c0[2] + (c1[2] - c0[2]) * f) * shade;
        // faint water sheen from the flow field (rivers pop as vectors on top)
        const w = water[i];
        if (w > 0.05) {
          const glow = Math.min(1, w) * 0.5;
          r = r * (1 - glow) + 150 * glow;
          g = g * (1 - glow) + 120 * glow;
          b = b * (1 - glow) + 250 * glow;
        }
        const p = i * 4;
        data[p] = clampi(r, 0, 255);
        data[p + 1] = clampi(g, 0, 255);
        data[p + 2] = clampi(b, 0, 255);
        data[p + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(off, 0, 0, size, size, 0, 0, VIEW, VIEW);
    drawRivers(ctx, field);

    matRef.current = drainageMaturity(field);
    if (matLabelRef.current) matLabelRef.current.textContent = matRef.current.toFixed(2);
    },
    [drawRivers],
  );

  // ── main loop (sim always runs; audio only after Start) ────────────────────
  useEffect(() => {
    const field = makeTerrain(N, seed);
    installTwoBasins(field, contrastRef.current);
    fieldRef.current = field;
    rngRef.current = mulberry32(BASE_SEED ^ seed);
    audioRngRef.current = mulberry32(977 ^ seed);
    frameRef.current = 0;
    netRef.current = null;

    // seeded auto-demo: pre-warm so two trees, a confluence and the braid are
    // already visible within the first paint (hands-free story).
    const warmParams: ErodeParams = { ...DEFAULT_ERODE, droplets: 220 };
    for (let k = 0; k < 70; k++) erode(field, warmParams, rngRef.current);
    drawRelief(field);
    netRef.current = computeNetwork(field, minHRef.current, spanRef.current);
    drawRelief(field);

    const loop = () => {
      const f = fieldRef.current;
      if (!f) return;
      const rng = rngRef.current;
      const params: ErodeParams = {
        ...DEFAULT_ERODE,
        droplets: rainingRef.current ? 190 : 110,
      };
      if (rainingRef.current && rainPtRef.current) {
        applyRainBrush(f, rainPtRef.current.x, rainPtRef.current.y, 4.5, 0.014);
      }
      const events = erode(f, params, rng);

      // ── audio ───────────────────────────────────────────────────────────────
      const ctx = ctxRef.current;
      if (audioOnRef.current && ctx) {
        const t0 = ctx.currentTime;
        while (nextNoteRef.current < t0 + 0.12) {
          scheduleStep(nextNoteRef.current);
          const interval = 0.34 - 0.16 * matRef.current + (audioRngRef.current() - 0.5) * 0.02;
          nextNoteRef.current += Math.max(0.09, interval);
        }
        // largest carve → a bright accent, panned to its basin's side
        let big: (typeof events)[number] | null = null;
        for (const e of events) if (!big || e.erosion > big.erosion) big = e;
        if (big && big.erosion > 0.02 && t0 - lastAccentRef.current > 0.17 && voicesRef.current < 8) {
          const tt = clampi((big.height - minHRef.current) / spanRef.current, 0, 1);
          const scale = SCALE_MATURE;
          const note = scale[clampi(Math.round(tt * (scale.length - 1)), 0, scale.length - 1)] + 24;
          const pan = clampi((big.x / N - 0.5) * 1.6, -1, 1);
          ping(midiToFreq(note), t0 + 0.02, 0.038 + big.speed * 0.03, pan);
          lastAccentRef.current = t0;
        }
        const dg = droneGainRef.current;
        if (dg) dg.gain.setTargetAtTime(0.03 * matRef.current, t0, 0.4);
      }

      frameRef.current++;
      if (frameRef.current % REDRAW_EVERY === 0) {
        netRef.current = computeNetwork(f, minHRef.current, spanRef.current);
        drawRelief(f);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // scheduleStep / ping are stable ref-based callbacks declared below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, drawRelief]);

  // ── unmount: tear down audio ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioOnRef.current = false;
      const ctx = ctxRef.current;
      if (ctx) ctx.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  // ── audio voices ─────────────────────────────────────────────────────────
  const pluck = useCallback(
    (freq: number, time: number, gain: number, decay: number, pan: number, cutoff: number) => {
      const ctx = ctxRef.current;
      const master = masterRef.current;
      if (!ctx || !master) return;
      const o1 = ctx.createOscillator();
      o1.type = "sine";
      o1.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = "triangle";
      o2.frequency.value = freq * 2.01;
      const g = ctx.createGain();
      const g2 = ctx.createGain();
      g2.gain.value = 0.22;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = cutoff;
      const pn = ctx.createStereoPanner();
      pn.pan.value = clampi(pan, -1, 1);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(gain, time + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
      o1.connect(g);
      o2.connect(g2);
      g2.connect(g);
      g.connect(lp);
      lp.connect(pn);
      pn.connect(master);
      voicesRef.current++;
      o1.onended = () => {
        voicesRef.current = Math.max(0, voicesRef.current - 1);
      };
      o1.start(time);
      o2.start(time);
      o1.stop(time + decay + 0.05);
      o2.stop(time + decay + 0.05);
    },
    [],
  );

  const ping = useCallback((freq: number, time: number, gain: number, pan: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    const g = ctx.createGain();
    const pn = ctx.createStereoPanner();
    pn.pan.value = clampi(pan, -1, 1);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
    o.connect(g);
    g.connect(pn);
    pn.connect(master);
    voicesRef.current++;
    o.onended = () => {
      voicesRef.current = Math.max(0, voicesRef.current - 1);
    };
    o.start(time);
    o.stop(time + 0.18);
  }, []);

  // schedule ONE step: basin-A voice (left, dark) + basin-B voice (right, bright).
  // As the interface resolves (convergence → 1) they pan to centre, rise to the
  // same octave and play the merged loop — two voices becoming one.
  const scheduleStep = useCallback(
    (time: number) => {
      const net = netRef.current;
      if (!net || net.spineA.length === 0 || net.spineB.length === 0) return;
      const mat = matRef.current;
      const rng = audioRngRef.current;
      // early = sparse & searching, mature = a continuous loop
      if (rng() > 0.4 + 0.55 * mat) {
        melIdxRef.current++;
        return;
      }
      const idx =
        mat > 0.5 ? melIdxRef.current % STEPS : Math.floor(rng() * STEPS) % STEPS;
      melIdxRef.current++;

      // contrast lengthens the interface → slows the two-becoming-one convergence
      const c = clampi(mat * (1.25 - 0.7 * contrastRef.current) - 0.05, 0, 1);

      const tA = net.spineA[idx];
      const tB = net.spineB[idx];
      const tMerge = (tA + tB) * 0.5;
      const tAeff = lerp(tA, tMerge, c);
      const tBeff = lerp(tB, tMerge, c);
      const scale = mat > 0.5 ? SCALE_MATURE : SCALE_EARLY;
      const li = scale.length - 1;
      // A darker: one octave below early, converging up to unison as c→1
      const noteA = scale[clampi(Math.round(tAeff * li), 0, li)] - Math.round(12 * (1 - c));
      const noteB = scale[clampi(Math.round(tBeff * li), 0, li)];
      let freqA = midiToFreq(noteA);
      let freqB = midiToFreq(noteB);
      if (mat < 0.5) {
        freqA *= 1 + (rng() - 0.5) * 0.03; // searching detune
        freqB *= 1 + (rng() - 0.5) * 0.03;
      }
      const panA = -0.75 * (1 - c);
      const panB = 0.75 * (1 - c);
      // A brightens toward B as it converges
      const cutA = freqA * (2.5 + 4 * c) + 500;
      const cutB = freqB * 6 + 900;
      const gain = 0.09 * (0.6 + 0.4 * mat);
      if (voicesRef.current < 6) pluck(freqA, time, gain, 0.34 + 0.5 * (1 - tA), panA, cutA);
      if (voicesRef.current < 6) pluck(freqB, time, gain, 0.34 + 0.5 * (1 - tB), panB, cutB);
    },
    [pluck],
  );

  // ── Start: unlock audio on a user gesture ──────────────────────────────────
  const handleStart = useCallback(async () => {
    if (audioOn) {
      audioOnRef.current = false;
      const dg = droneGainRef.current;
      const ctx = ctxRef.current;
      if (dg && ctx) dg.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
      setAudioOn(false);
      return;
    }
    try {
      const AC: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) throw new Error("no AudioContext");
      if (!ctxRef.current) {
        const ctx = new AC();
        const master = ctx.createGain();
        master.gain.value = 0.85;
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(ctx.destination);
        // soft ambience
        const delay = ctx.createDelay(0.5);
        delay.delayTime.value = 0.21;
        const fb = ctx.createGain();
        fb.gain.value = 0.28;
        const wet = ctx.createGain();
        wet.gain.value = 0.16;
        master.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(wet);
        wet.connect(comp);
        // maturity drone (the merged river's low voice)
        const drone = ctx.createOscillator();
        drone.type = "sine";
        drone.frequency.value = midiToFreq(36);
        const droneGain = ctx.createGain();
        droneGain.gain.value = 0.0001;
        drone.connect(droneGain);
        droneGain.connect(master);
        drone.start();
        ctxRef.current = ctx;
        masterRef.current = master;
        droneGainRef.current = droneGain;
      }
      await ctxRef.current.resume();
      nextNoteRef.current = ctxRef.current.currentTime + 0.1;
      audioOnRef.current = true;
      setAudioOn(true);
      setError(null);
    } catch {
      setError("Audio is unavailable here — the two basins still carve themselves in silence.");
    }
  }, [audioOn]);

  const handleReseed = useCallback(() => {
    const r = mulberry32(seed);
    setSeed((Math.floor(r() * 0xffffffff) >>> 0) || 1);
  }, [seed]);

  const onContrast = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value) / 100;
    contrastRef.current = v;
    setContrast(v);
  }, []);

  // ── pointer → grid mapping for "rain here" ─────────────────────────────────
  const ptToGrid = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const gx = clampi(((clientX - rect.left) / rect.width) * (N - 1), 0, N - 1);
    const gy = clampi(((clientY - rect.top) / rect.height) * (N - 1), 0, N - 1);
    return { x: gx, y: gy };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const g = ptToGrid(e.clientX, e.clientY);
      if (!g) return;
      rainingRef.current = true;
      rainPtRef.current = g;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [ptToGrid],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!rainingRef.current) return;
      const g = ptToGrid(e.clientX, e.clientY);
      if (!g) return;
      rainPtRef.current = g;
    },
    [ptToGrid],
  );
  const endRain = useCallback(() => {
    rainingRef.current = false;
    rainPtRef.current = null;
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 pb-24 pt-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          4952 · Confluence
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Two watersheds meet — and their waters braid into one.
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Droplets erode two seeded mountains in real time, rendered as a shaded-relief map. Both
          basins cut their own river tree and meet at a shared confluence, where a{" "}
          <span className="text-primary">mixing interface</span> keeps the two waters flowing
          side-by-side — cool thread and warm thread — before they finally blend downstream. The
          more unequal the two basins, the further the seam survives. Drag on the map to rain there.
        </p>

        {/* the shaded-relief cartographic map */}
        <div className="mt-5 overflow-hidden rounded-lg border border-border bg-[#0b0713]">
          <canvas
            ref={canvasRef}
            width={VIEW}
            height={VIEW}
            className="block w-full touch-none select-none"
            style={{ aspectRatio: "1 / 1" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endRain}
            onPointerLeave={endRain}
            onPointerCancel={endRain}
          />
        </div>

        {/* HUD */}
        <div className="mt-3 flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>
            drainage maturity <span ref={matLabelRef} className="text-primary">0.00</span>
          </span>
          <span>{audioOn ? "● two voices braiding" : "○ silent demo"}</span>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {/* controls */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {audioOn ? "Silence" : "Start · rain with sound"}
          </button>
          <button
            type="button"
            onClick={handleReseed}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Reseed
          </button>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* basin-contrast slider — the research knob */}
        <div className="mt-5">
          <label
            htmlFor="contrast"
            className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
          >
            <span>basin contrast · interface persistence</span>
            <span className="text-primary">{contrast.toFixed(2)}</span>
          </label>
          <input
            id="contrast"
            type="range"
            min={0}
            max={100}
            value={Math.round(contrast * 100)}
            onChange={onContrast}
            className="mt-2 w-full accent-primary"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            Higher contrast makes the two mountains more unequal — the mixing seam survives further
            downstream, and the two voices take longer to resolve into one (Reseed rebuilds the
            terrain at the current contrast).
          </p>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          The map begins eroding the moment it loads — silent until you press Start (browser
          autoplay policy). Give it minutes: the channels deepen, the confluence sharpens, and the
          braided seam lengthens and slowly resolves. Minute five looks and sounds nothing like
          minute one.
        </p>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Two basins
                </span>
                <br />A shared droplet hydraulic-erosion engine carves a seeded heightfield. We
                re-mould its fractal texture into two source mountains split by a central divide that
                fades before a bottom-centre spillway, so each basin grows its own dendritic river
                tree and both meet at one confluence before draining off the map.
              </p>
              <p>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Shaded relief
                </span>
                <br />
                The map is a Canvas2D hillshade: a light from the upper-left is dotted with each
                cell&apos;s surface normal, tinted by a hypsometric violet ramp. Rivers are pulled
                from the live flow-accumulation field and drawn as glowing threads — cool for basin
                A (left), warm/magenta for basin B (right).
              </p>
              <p>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  The mixing interface
                </span>
                <br />
                Downstream of the confluence the trunk is drawn as two tinted threads whose
                separation and colour follow a 1-D relaxation, sep(s) = e^(−s/L): a sharp A|B seam at
                the confluence that braids into one mid-violet ribbon over a persistence length L set
                by the basin contrast. Bigger contrast → longer seam, exactly as the density/velocity
                contrast governs mixing at the real Negro/Solimões confluence.
              </p>
              <p>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Two voices, becoming one
                </span>
                <br />
                Each basin&apos;s spine is sampled by altitude into a marimba loop — A darker and
                panned left, B brighter and panned right. As the interface resolves the voices pan to
                centre, rise to the same octave and play the merged loop. Contrast slows that
                convergence; drainage maturity moves both loops from sparse and searching to a
                settled pentatonic over a low drone.
              </p>
              <p>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  References
                </span>
                <br />
                Musgrave, Kolb &amp; Mace (SIGGRAPH 1989); Mei, Decaudin &amp; Hu (Pacific Graphics
                2007); Jiang et al., Negro/Solimões confluence mixing (Water Resources Research 2026,
                doi:10.1029/2025WR041934).
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// draw one offset trunk segment, colour lerped from a basin tint toward the merged
// mid-violet by `blend` (0 at the confluence → 1 fully mixed downstream).
function drawSeg(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  ox: number,
  oy: number,
  base: [number, number, number],
  blend: number,
  alpha: number,
): void {
  const r = Math.round(lerp(base[0], MID_MIX[0], blend));
  const g = Math.round(lerp(base[1], MID_MIX[1], blend));
  const bl = Math.round(lerp(base[2], MID_MIX[2], blend));
  ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha})`;
  ctx.beginPath();
  ctx.moveTo(a.x + ox, a.y + oy);
  ctx.lineTo(b.x + ox, b.y + oy);
  ctx.stroke();
}
