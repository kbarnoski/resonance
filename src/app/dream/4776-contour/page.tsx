"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 4776 · Contour — the living topographic map
//
//   ONE QUESTION — If a mountain drained itself in front of you, top-down and
//   drawn only as contour lines, could you hear the drainage network being born
//   — its main channel singing a slow marimba loop that settles into consonance
//   as the river tree matures?
//
//   A shared droplet hydraulic-erosion engine (Musgrave/Beyer) carves a seeded
//   heightfield in real time. THIS face renders it as a cartographic contour map
//   (marching squares over the live heightmap) with the emergent rivers overlaid
//   as glowing violet threads pulled from the flow-accumulation field. The
//   strongest channel — "the spine" — is sampled by altitude and arpeggiated on
//   a soft mallet voice that moves from sparse/searching to a settled loop as
//   drainageMaturity() rises.
//
//   INPUT   pointer / touch drag on the map = "rain here" (carves valleys under
//           your finger). Buttons: Start (rain, with sound) · Reseed. Phone
//           bonus: deviceorientation tilt tips the ambient rainfall. No keyboard.
//   OUTPUT  inline SVG only (no Canvas2D, no WebGL). Paths mutated per frame via
//           refs. AUDIO: Web Audio marimba spine-melody + sparse carve accents.
//   REF     Musgrave, Kolb & Mace (SIGGRAPH 1989); Mei, Decaudin & Hu (PG 2007);
//           Beyer (droplet method, 2015). See README.
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
import { PrototypeNav } from "../_shared/prototype-nav";

// ── grid + view geometry ─────────────────────────────────────────────────────
const N = 96; // terrain grid (kept small for SVG marching-squares perf)
const VIEW = 960; // SVG viewBox is VIEW×VIEW
const SC = VIEW / (N - 1); // grid-cell → viewBox px
const LEVELS = 9; // iso-elevation contour lines
const REDRAW_EVERY = 4; // recompute contours every N sim frames

// contour colours: low land → deep violet, high land → soft violet (art only).
const CONTOUR_COLORS = [
  "#241147",
  "#341f6b",
  "#452a94",
  "#5b2ec9",
  "#7a58ec",
  "#977bf4",
  "#b4a1f8",
  "#cdbdfb",
  "#e3ddfd",
];

// ── musical scales (altitude → pitch) ────────────────────────────────────────
const PENTA = [0, 2, 4, 7, 9]; // major pentatonic — consonant, mature loop
const SEARCH = [0, 2, 3, 5, 7, 9, 10]; // wider set — early searching colour
function buildScale(intervals: number[], base: number, octaves: number): number[] {
  const out: number[] = [];
  for (let o = 0; o < octaves; o++) for (const iv of intervals) out.push(base + o * 12 + iv);
  return out;
}
const SCALE_MATURE = buildScale(PENTA, 48, 4); // C3 upward
const SCALE_EARLY = buildScale(SEARCH, 48, 4);
const SPINE_STEPS = 16; // resampled length of the spine melody loop

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
function clampi(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// marching-squares case → edge-pair list. Edge ids: T=0,R=1,B=2,L=3.
const MS: number[][] = [
  [], // 0
  [3, 2], // 1  L-B
  [2, 1], // 2  B-R
  [3, 1], // 3  L-R
  [0, 1], // 4  T-R
  [0, 1, 3, 2], // 5  saddle
  [0, 2], // 6  T-B
  [0, 3], // 7  T-L
  [0, 3], // 8  T-L
  [0, 2], // 9  T-B
  [0, 3, 2, 1], // 10 saddle
  [0, 1], // 11 T-R
  [3, 1], // 12 L-R
  [2, 1], // 13 B-R
  [3, 2], // 14 L-B
  [], // 15
];

export default function ContourPage() {
  const [seed, setSeed] = useState(20240979);
  const [audioOn, setAudioOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── live simulation refs (never trigger React re-renders) ──────────────────
  const fieldRef = useRef<TerrainField | null>(null);
  const rngRef = useRef<() => number>(mulberry32(4776));
  const audioRngRef = useRef<() => number>(mulberry32(977));
  const minHRef = useRef(0);
  const maxHRef = useRef(1);
  const matRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const rainingRef = useRef(false);
  const rainPtRef = useRef<{ x: number; y: number } | null>(null);
  const tiltRef = useRef<{ x: number; y: number } | null>(null);
  const spineRef = useRef<number[]>([]); // resampled altitudes 0..1 along spine

  // ── svg element refs (mutated directly) ────────────────────────────────────
  const svgRef = useRef<SVGSVGElement | null>(null);
  const contourRefs = useRef<(SVGPathElement | null)[]>([]);
  const riverGlowRef = useRef<SVGPathElement | null>(null);
  const riverBandRefs = useRef<(SVGPathElement | null)[]>([]);
  const spinePathRef = useRef<SVGPathElement | null>(null);
  const rainRingRef = useRef<SVGCircleElement | null>(null);
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

  // gentle rainfall carved under the pointer (biases WHERE it rains). This edits
  // the shared heightfield with a soft brush — it does not reimplement the
  // droplet physics, which the imported engine still performs every frame.
  const rainBrush = useCallback(
    (field: TerrainField, gx: number, gy: number, radius: number, strength: number) => {
      const { size, height, water } = field;
      const cx = Math.round(gx);
      const cy = Math.round(gy);
      const r = Math.ceil(radius);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > radius) continue;
          const fall = 1 - d / radius;
          const i = y * size + x;
          height[i] = Math.max(0, height[i] - strength * fall * fall);
          water[i] = Math.min(1, water[i] + 0.5 * fall);
        }
      }
    },
    [],
  );

  // recompute contour paths + river threads + the singing spine, set on the DOM.
  const redraw = useCallback((field: TerrainField) => {
    const { size, height, water } = field;

    // dynamic elevation range → evenly spaced iso levels
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < height.length; i++) {
      const h = height[i];
      if (h < mn) mn = h;
      if (h > mx) mx = h;
    }
    if (mx - mn < 1e-4) mx = mn + 1e-4;
    minHRef.current = mn;
    maxHRef.current = mx;
    const span = mx - mn;

    const segs: string[][] = [];
    for (let l = 0; l < LEVELS; l++) segs.push([]);
    const isos: number[] = [];
    for (let l = 0; l < LEVELS; l++) isos.push(mn + ((l + 1) / (LEVELS + 1)) * span);

    for (let y = 0; y < size - 1; y++) {
      const row = y * size;
      for (let x = 0; x < size - 1; x++) {
        const i = row + x;
        const va = height[i];
        const vb = height[i + 1];
        const vc = height[i + size + 1];
        const vd = height[i + size];
        for (let l = 0; l < LEVELS; l++) {
          const iso = isos[l];
          const ci =
            (va > iso ? 8 : 0) | (vb > iso ? 4 : 0) | (vc > iso ? 2 : 0) | (vd > iso ? 1 : 0);
          if (ci === 0 || ci === 15) continue;
          const pairs = MS[ci];
          for (let k = 0; k < pairs.length; k += 2) {
            const p1 = edgePoint(pairs[k], x, y, va, vb, vc, vd, iso);
            const p2 = edgePoint(pairs[k + 1], x, y, va, vb, vc, vd, iso);
            segs[l].push(
              `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)}L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`,
            );
          }
        }
      }
    }
    for (let l = 0; l < LEVELS; l++) {
      contourRefs.current[l]?.setAttribute("d", segs[l].join(""));
    }

    // ── rivers: connect each wet cell to its downhill neighbour ───────────────
    const bands: string[][] = [[], [], []];
    const glow: string[] = [];
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        const ww = water[i];
        if (ww < 0.06) continue;
        // steepest-descent 8-neighbour
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
        const seg = `M${(x * SC).toFixed(1)} ${(y * SC).toFixed(1)}L${(bx * SC).toFixed(1)} ${(
          by * SC
        ).toFixed(1)}`;
        glow.push(seg);
        const b = ww > 0.5 ? 2 : ww > 0.22 ? 1 : 0;
        bands[b].push(seg);
      }
    }
    riverGlowRef.current?.setAttribute("d", glow.join(""));
    for (let b = 0; b < 3; b++) riverBandRefs.current[b]?.setAttribute("d", bands[b].join(""));

    // ── the spine: strongest channel, climbed to source then walked to mouth ──
    let maxW = 0;
    let mi = 0;
    for (let i = 0; i < water.length; i++)
      if (water[i] > maxW) {
        maxW = water[i];
        mi = i;
      }
    let sx = mi % size;
    let sy = (mi / size) | 0;
    // climb upstream toward the source (highest wet, higher ground)
    for (let step = 0; step < 120; step++) {
      let best = -1;
      let bxx = sx;
      let byy = sy;
      const curH = height[sy * size + sx];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = sx + dx;
          const ny = sy + dy;
          if (nx < 1 || ny < 1 || nx >= size - 1 || ny >= size - 1) continue;
          const ni = ny * size + nx;
          if (height[ni] <= curH) continue; // must go uphill
          const score = water[ni] + height[ni] * 0.15;
          if (score > best) {
            best = score;
            bxx = nx;
            byy = ny;
          }
        }
      }
      if (bxx === sx && byy === sy) break;
      sx = bxx;
      sy = byy;
    }
    // descend to the mouth, collecting altitudes + coordinates
    const alts: number[] = [];
    const coords: string[] = [];
    let cx = sx;
    let cy = sy;
    for (let step = 0; step < 260; step++) {
      const ci = cy * size + cx;
      alts.push(height[ci]);
      coords.push(`${(cx * SC).toFixed(1)} ${(cy * SC).toFixed(1)}`);
      let bh = height[ci];
      let bxx = cx;
      let byy = cy;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 1 || ny < 1 || nx >= size - 1 || ny >= size - 1) continue;
          const nh = height[ny * size + nx];
          if (nh < bh) {
            bh = nh;
            bxx = nx;
            byy = ny;
          }
        }
      }
      if (bxx === cx && byy === cy) break;
      cx = bxx;
      cy = byy;
    }
    if (coords.length > 1) {
      spinePathRef.current?.setAttribute("d", `M${coords.join("L")}`);
    }
    // resample altitudes → normalised spine melody
    if (alts.length >= 2) {
      const spine: number[] = [];
      for (let i = 0; i < SPINE_STEPS; i++) {
        const t = (i / (SPINE_STEPS - 1)) * (alts.length - 1);
        const i0 = Math.floor(t);
        const i1 = Math.min(alts.length - 1, i0 + 1);
        const f = t - i0;
        const h = alts[i0] * (1 - f) + alts[i1] * f;
        spine.push(clampi((h - mn) / span, 0, 1));
      }
      spineRef.current = spine;
    }

    matRef.current = drainageMaturity(field);
    if (matLabelRef.current) matLabelRef.current.textContent = matRef.current.toFixed(2);
  }, []);

  // ── audio voices ───────────────────────────────────────────────────────────
  const pluck = useCallback(
    (freq: number, time: number, gain: number, decay: number) => {
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
      lp.frequency.value = freq * 5 + 900;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(gain, time + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
      o1.connect(g);
      o2.connect(g2);
      g2.connect(g);
      g.connect(lp);
      lp.connect(master);
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

  const ping = useCallback((freq: number, time: number, gain: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
    o.connect(g);
    g.connect(master);
    voicesRef.current++;
    o.onended = () => {
      voicesRef.current = Math.max(0, voicesRef.current - 1);
    };
    o.start(time);
    o.stop(time + 0.18);
  }, []);

  // schedule one melody step at `time` (rest-aware, voice-capped)
  const scheduleMelody = useCallback(
    (time: number) => {
      const spine = spineRef.current;
      if (!spine || spine.length === 0) return;
      const mat = matRef.current;
      const rng = audioRngRef.current;
      // early = sparse/searching, mature = continuous loop
      if (rng() > 0.35 + 0.6 * mat) {
        melIdxRef.current++;
        return; // rest
      }
      const idx = mat > 0.5 ? melIdxRef.current % spine.length : Math.floor(rng() * spine.length);
      melIdxRef.current++;
      const t = spine[idx];
      const scale = mat > 0.5 ? SCALE_MATURE : SCALE_EARLY;
      const note = scale[clampi(Math.round(t * (scale.length - 1)), 0, scale.length - 1)];
      let freq = midiToFreq(note);
      if (mat < 0.5) freq *= 1 + (rng() - 0.5) * 0.02; // searching detune
      if (voicesRef.current >= 6) return;
      pluck(freq, time, 0.1 * (0.55 + 0.45 * mat), 0.32 + 0.5 * (1 - t));
    },
    [pluck],
  );

  // ── main loop (sim always runs; audio only after Start) ────────────────────
  useEffect(() => {
    const field = makeTerrain(N, seed);
    fieldRef.current = field;
    rngRef.current = mulberry32(4776 ^ seed);
    audioRngRef.current = mulberry32(977 ^ seed);
    frameRef.current = 0;
    spineRef.current = [];
    redraw(field);

    const loop = () => {
      const f = fieldRef.current;
      if (!f) return;
      const rng = rngRef.current;

      // rain harder while the visitor is dragging
      const params: ErodeParams = {
        ...DEFAULT_ERODE,
        droplets: rainingRef.current ? 180 : 100,
      };

      // biased rainfall under the pointer
      if (rainingRef.current && rainPtRef.current) {
        rainBrush(f, rainPtRef.current.x, rainPtRef.current.y, 4.5, 0.014);
      }
      // ambient tilt-driven drizzle (phone bonus, degrades to nothing)
      const tilt = tiltRef.current;
      if (tilt && frameRef.current % 4 === 0) {
        const gx = N / 2 + tilt.x * (N * 0.35);
        const gy = N / 2 + tilt.y * (N * 0.35);
        rainBrush(f, gx, gy, 3.5, 0.004);
      }

      const events = erode(f, params, rng);

      // ── audio: melody scheduler + sparse carve accents ─────────────────────
      const ctx = ctxRef.current;
      if (audioOnRef.current && ctx) {
        const t0 = ctx.currentTime;
        while (nextNoteRef.current < t0 + 0.12) {
          scheduleMelody(nextNoteRef.current);
          const mat = matRef.current;
          const interval = 0.36 - 0.19 * mat + (audioRngRef.current() - 0.5) * 0.02;
          nextNoteRef.current += Math.max(0.09, interval);
        }
        // largest carve this frame → a bright, rate-limited accent
        let big: (typeof events)[number] | null = null;
        for (const e of events) if (!big || e.erosion > big.erosion) big = e;
        if (
          big &&
          big.erosion > 0.02 &&
          t0 - lastAccentRef.current > 0.16 &&
          voicesRef.current < 8
        ) {
          const span = maxHRef.current - minHRef.current || 1e-4;
          const tt = clampi((big.height - minHRef.current) / span, 0, 1);
          const note = SCALE_MATURE[clampi(Math.round(tt * (SCALE_MATURE.length - 1)), 0, SCALE_MATURE.length - 1)] + 24;
          ping(midiToFreq(note), t0 + 0.02, 0.04 + big.speed * 0.03);
          lastAccentRef.current = t0;
        }
        // consonant drone swells in as the network matures
        const dg = droneGainRef.current;
        if (dg) dg.gain.setTargetAtTime(0.03 * matRef.current, t0, 0.4);
      }

      frameRef.current++;
      if (frameRef.current % REDRAW_EVERY === 0) redraw(f);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [seed, redraw, rainBrush, scheduleMelody, ping]);

  // ── unmount: tear down audio ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioOnRef.current = false;
      const ctx = ctxRef.current;
      if (ctx) ctx.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  // ── Start: unlock audio on a user gesture ──────────────────────────────────
  const handleStart = useCallback(async () => {
    if (audioOn) {
      // toggle to silent (sim keeps running)
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
        master.gain.value = 0.9;
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(ctx.destination);
        // soft ambience
        const delay = ctx.createDelay(0.5);
        delay.delayTime.value = 0.19;
        const fb = ctx.createGain();
        fb.gain.value = 0.28;
        const wet = ctx.createGain();
        wet.gain.value = 0.16;
        master.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(wet);
        wet.connect(comp);
        // maturity drone
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
      enableTilt();
    } catch {
      setError("Audio is unavailable here — the map still carves itself in silence.");
    }
    // enableTilt is a stable ref-based callback declared below; omitting it is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioOn]);

  const enableTilt = useCallback(() => {
    if (typeof window === "undefined") return;
    const DOE = (
      window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
      }
    ).DeviceOrientationEvent;
    const onTilt = (e: DeviceOrientationEvent) => {
      tiltRef.current = {
        x: clampi((e.gamma ?? 0) / 45, -1, 1),
        y: clampi(((e.beta ?? 0) - 45) / 45, -1, 1),
      };
    };
    const add = () => window.addEventListener("deviceorientation", onTilt);
    if (DOE && typeof DOE.requestPermission === "function") {
      DOE.requestPermission()
        .then((s) => {
          if (s === "granted") add();
        })
        .catch(() => {});
    } else {
      add();
    }
  }, []);

  const handleReseed = useCallback(() => {
    // deterministic next seed from a seeded PRNG — no Math.random / Date
    const r = mulberry32(seed);
    setSeed((Math.floor(r() * 0xffffffff) >>> 0) || 1);
  }, [seed]);

  // ── pointer → grid mapping for "rain here" ─────────────────────────────────
  const ptToGrid = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const gx = clampi(((clientX - rect.left) / rect.width) * (N - 1), 0, N - 1);
    const gy = clampi(((clientY - rect.top) / rect.height) * (N - 1), 0, N - 1);
    return { x: gx, y: gy };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const g = ptToGrid(e.clientX, e.clientY);
      if (!g) return;
      rainingRef.current = true;
      rainPtRef.current = g;
      e.currentTarget.setPointerCapture(e.pointerId);
      const ring = rainRingRef.current;
      if (ring) {
        ring.setAttribute("cx", (g.x * SC).toFixed(1));
        ring.setAttribute("cy", (g.y * SC).toFixed(1));
        ring.setAttribute("opacity", "1");
      }
    },
    [ptToGrid],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!rainingRef.current) return;
      const g = ptToGrid(e.clientX, e.clientY);
      if (!g) return;
      rainPtRef.current = g;
      const ring = rainRingRef.current;
      if (ring) {
        ring.setAttribute("cx", (g.x * SC).toFixed(1));
        ring.setAttribute("cy", (g.y * SC).toFixed(1));
      }
    },
    [ptToGrid],
  );
  const endRain = useCallback(() => {
    rainingRef.current = false;
    rainPtRef.current = null;
    rainRingRef.current?.setAttribute("opacity", "0");
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 pb-24 pt-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          4776 · Contour
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          A watershed that draws — and sings — itself.
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Droplets carve a seeded mountain in real time. You see it top-down as a contour map;
          its strongest channel — <span className="text-primary">the spine</span> — is sampled by
          altitude into a slow marimba loop that settles toward consonance as the drainage network
          matures. Drag on the map to rain there.
        </p>

        {/* the living topographic map */}
        <div className="mt-5 overflow-hidden rounded-lg border border-border bg-[#0b0713]">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className="block w-full touch-none select-none"
            style={{ aspectRatio: "1 / 1" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endRain}
            onPointerLeave={endRain}
            onPointerCancel={endRain}
          >
            <defs>
              <filter id="riverGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
            </defs>
            <rect x="0" y="0" width={VIEW} height={VIEW} fill="#0b0713" />

            {/* contour lines (iso-elevation) */}
            <g fill="none" strokeLinecap="round" strokeLinejoin="round">
              {CONTOUR_COLORS.map((c, l) => (
                <path
                  key={l}
                  ref={(el) => {
                    contourRefs.current[l] = el;
                  }}
                  stroke={c}
                  strokeWidth={1.25}
                  strokeOpacity={0.55 + 0.05 * l}
                />
              ))}
            </g>

            {/* emergent rivers from the flow field */}
            <path
              ref={riverGlowRef}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth={6}
              strokeOpacity={0.4}
              strokeLinecap="round"
              filter="url(#riverGlow)"
            />
            {[
              { c: "#8b5cf6", w: 1.8 },
              { c: "#a78bfa", w: 2.6 },
              { c: "#c4b5fd", w: 3.6 },
            ].map((b, i) => (
              <path
                key={i}
                ref={(el) => {
                  riverBandRefs.current[i] = el;
                }}
                fill="none"
                stroke={b.c}
                strokeWidth={b.w}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {/* the singing spine — brightest thread */}
            <path
              ref={spinePathRef}
              fill="none"
              stroke="#ede9fe"
              strokeWidth={2.4}
              strokeOpacity={0.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#riverGlow)"
            />

            {/* rain indicator */}
            <circle
              ref={rainRingRef}
              r={26}
              fill="none"
              stroke="#ddd6fe"
              strokeWidth={2}
              opacity={0}
            />
          </svg>
        </div>

        {/* HUD */}
        <div className="mt-3 flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>
            drainage maturity <span ref={matLabelRef} className="text-primary">0.00</span>
          </span>
          <span>{audioOn ? "● raining · sound on" : "○ silent demo"}</span>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {/* controls */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {audioOn ? "Silence" : "Start · rain with sound"}
          </button>
          <button
            type="button"
            onClick={handleReseed}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Reseed
          </button>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          The map begins eroding the moment it loads — silent until you press Start (browser
          autoplay policy). Give it a few minutes: valleys deepen, contours pinch into V-shapes,
          and the river tree branches into a mature dendritic network.
        </p>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-popover p-6 text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm text-muted-foreground">
              <p>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  The technique
                </span>
                <br />A shared hydraulic-erosion engine simulates thousands of water droplets that
                pick up sediment on steep ground and drop it on flat ground, carving channels and
                depositing deltas. Each frame it mutates a heightfield and a flow-accumulation
                field.
              </p>
              <p>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  The map
                </span>
                <br />
                Marching squares traces {LEVELS} iso-elevation contours over the live heightmap
                (redrawn every {REDRAW_EVERY} frames). The rivers are the brightest cells of the
                flow field, drawn as violet threads flowing to their steepest-descent neighbour.
              </p>
              <p>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  The spine sings
                </span>
                <br />
                The strongest channel is walked from source to mouth and sampled by altitude — high
                land, high pitch — into a 16-step marimba loop. Early on it is sparse and searching;
                as <span className="text-primary">drainage maturity</span> rises the loop settles
                into a consonant pentatonic with a low drone. Individual carve events add sparse,
                rate-limited accents.
              </p>
              <p>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  References
                </span>
                <br />
                Musgrave, Kolb &amp; Mace (SIGGRAPH 1989); Mei, Decaudin &amp; Hu (Pacific Graphics
                2007); Beyer (droplet method, 2015).
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["4776-contour"]} />
    </main>
  );
}

// interpolate the iso-crossing point on one edge of a marching-squares cell.
// edge ids: T=0, R=1, B=2, L=3. corners: a=(x,y) b=(x+1,y) c=(x+1,y+1) d=(x,y+1).
function edgePoint(
  edge: number,
  x: number,
  y: number,
  va: number,
  vb: number,
  vc: number,
  vd: number,
  iso: number,
): [number, number] {
  let px = x;
  let py = y;
  if (edge === 0) {
    const t = safeT(iso, va, vb);
    px = x + t;
    py = y;
  } else if (edge === 1) {
    const t = safeT(iso, vb, vc);
    px = x + 1;
    py = y + t;
  } else if (edge === 2) {
    const t = safeT(iso, vd, vc);
    px = x + t;
    py = y + 1;
  } else {
    const t = safeT(iso, va, vd);
    px = x;
    py = y + t;
  }
  return [px * SC, py * SC];
}
function safeT(iso: number, a: number, b: number): number {
  const d = b - a;
  if (Math.abs(d) < 1e-9) return 0.5;
  const t = (iso - a) / d;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
