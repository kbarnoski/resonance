"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";

// ════════════════════════════════════════════════════════════════════════════
// 1548 — Ink Bloom
//
// THE QUESTION: "What if drops of ink bloomed into concentric suminagashi rings
// that your breath stirred and boiled — rendered natively by the browser's CSS
// compositor?"
//
// state: hypnagogic ink-drift / suminagashi · pole: cosmic-ambient ↔ intense
//
// HEADLINE TECHNIQUE — CSS Houdini Paint API. The marbling is drawn by a Paint
// Worklet (`registerPaint('inkbloom', …)`) whose PaintRenderingContext2D is a
// pure VECTOR context (no per-pixel access). Every frame React writes typed,
// animatable custom properties (`--t`, `--energy`, `--drops`, `--boil`, `--hue`,
// `--px`, `--py`, `--stir`) on a full-bleed element that carries
// `background: paint(inkbloom)`; changing an input property is what triggers the
// compositor to repaint. The worklet then reconstructs the entire ink field
// DETERMINISTICALLY from those scalars.
//
// The suminagashi non-overlap transform is exact: when a drop of radius d lands
// at C, every prior point P moves to C + (P−C)·√(1 + d²/|P−C|²) — a point at
// distance r goes to √(r²+d²). Applied in birth order, drops nest into
// interlocking concentric contours.
//
// FALLBACK — the same pure `drawInk(ctx,w,h,state)` runs on a <canvas> rAF loop
// when Houdini is absent (Firefox / Safari / headless). Identical visuals both
// ways, so the novel Houdini path genuinely runs in Chromium AND the piece runs
// everywhere. See README.md for named references and the aperture / limits.
// ════════════════════════════════════════════════════════════════════════════

// ── shared vector context surface (the subset both paths use) ────────────────
interface InkGradient {
  addColorStop(offset: number, color: string): void;
}
interface InkCtx {
  fillStyle: string | InkGradient;
  strokeStyle: string | InkGradient;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  shadowBlur: number;
  shadowColor: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  save(): void;
  restore(): void;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): InkGradient;
}

interface InkState {
  t: number; // virtual clock, ms (already reduced-motion-scaled)
  energy: number; // 0..1 smoothed loudness
  drops: number; // total ink drops dropped (float; floored inside)
  boil: number; // 0..1 contour agitation
  hue: number; // base ink hue (violet ≈ 262)
  px: number; // pointer attractor x, normalized 0..1
  py: number; // pointer attractor y
  stir: number; // 0..1 pointer stir influence
}

// ─────────────────────────────────────────────────────────────────────────────
// drawInk — the ONE render function. It is intentionally self-contained (a local
// PRNG, all constants inline, zero references to module scope) so that its exact
// source can be `.toString()`-embedded inside the Paint Worklet AND called
// directly by the Canvas2D fallback. Uses ONLY vector ops available in
// PaintRenderingContext2D. No wall-clock and no ambient RNG — determinism comes
// from `seed` baked into the drop hash and the `t` handed in by the caller.
// ─────────────────────────────────────────────────────────────────────────────
function drawInk(ctx: InkCtx, w: number, h: number, s: InkState): void {
  const TAU = Math.PI * 2;
  const WINDOW = 22; // most-recent drops kept alive (bounds cost + renews sheet)
  const M = 56; // vertices per contour
  const SEED = 0x51ed7 >>> 0;
  const clamp = (x: number, lo: number, hi: number) =>
    x < lo ? lo : x > hi ? hi : x;
  const t = s.t * 0.001;
  const energy = clamp(s.energy, 0, 1);
  const boil = clamp(s.boil, 0, 1);
  const minDim = Math.min(w, h);

  // per-index deterministic PRNG (mulberry32) — lets us address any drop
  // directly without iterating from zero.
  const rngAt = (seed: number): (() => number) => {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  };

  const count = Math.floor(s.drops);
  const start = Math.max(0, count - WINDOW);

  // 1. resolve each live drop's centre + ink radius (with slow drift + pointer
  //    attraction — newest drops are pulled hardest toward where you stir).
  const cx: number[] = [];
  const cy: number[] = [];
  const cd: number[] = [];
  const cph: number[] = [];
  for (let i = start; i < count; i++) {
    const r = rngAt(SEED ^ Math.imul(i + 1, 0x9e3779b1));
    let bx = 0.14 + r() * 0.72;
    let by = 0.14 + r() * 0.72;
    const baseR = (0.045 + r() * 0.095) * minDim;
    const phase = r() * TAU;
    const dph = t * 0.05 + i * 0.7;
    bx += Math.cos(dph) * 0.03;
    by += Math.sin(dph * 1.1) * 0.03;
    const recency = clamp(1 - (count - 1 - i) / 8, 0, 1);
    const pull = clamp(s.stir, 0, 1) * recency * 0.85;
    bx += (s.px - bx) * pull;
    by += (s.py - by) * pull;
    cx.push(bx * w);
    cy.push(by * h);
    cd.push(baseR);
    cph.push(phase);
  }
  const n = cx.length;

  // 2. build contours, then apply the suminagashi displacement: each later drop
  //    pushes every earlier contour radially outward from its centre.
  const px: number[][] = [];
  const py: number[][] = [];
  for (let i = 0; i < n; i++) {
    const gi = start + i;
    const edge = rngAt(SEED ^ Math.imul(gi + 7, 0x85ebca6b));
    const boilAmp = cd[i] * 0.11 * boil;
    const xs: number[] = new Array(M);
    const ys: number[] = new Array(M);
    for (let m = 0; m < M; m++) {
      const ang = (m / M) * TAU;
      const wob = 0.86 + 0.28 * edge();
      // boil oscillates amplitude, never frequency → slow, non-strobe motion.
      const rr = cd[i] * wob + boilAmp * Math.sin(t * 1.9 + ang * 3 + cph[i]);
      xs[m] = cx[i] + Math.cos(ang) * rr;
      ys[m] = cy[i] + Math.sin(ang) * rr;
    }
    // displace by every later drop (j > i)
    for (let j = i + 1; j < n; j++) {
      const Cx = cx[j];
      const Cy = cy[j];
      const d2 = cd[j] * cd[j];
      for (let m = 0; m < M; m++) {
        const dx = xs[m] - Cx;
        const dy = ys[m] - Cy;
        let r2 = dx * dx + dy * dy;
        if (r2 < 1) r2 = 1;
        const f = Math.sqrt(1 + d2 / r2);
        xs[m] = Cx + dx * f;
        ys[m] = Cy + dy * f;
      }
    }
    px.push(xs);
    py.push(ys);
  }

  // 3. paint. Near-black base + violet vignette, then contours oldest→newest.
  ctx.fillStyle = "#04030a";
  ctx.fillRect(0, 0, w, h);
  const vg = ctx.createRadialGradient(
    w * 0.5,
    h * 0.5,
    minDim * 0.06,
    w * 0.5,
    h * 0.5,
    Math.max(w, h) * 0.72
  );
  vg.addColorStop(0, "rgba(38,20,74,0.42)");
  vg.addColorStop(1, "rgba(3,2,8,0)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  ctx.lineJoin = "round";
  for (let i = 0; i < n; i++) {
    const xs = px[i];
    const ys = py[i];
    const agefrac = n > 1 ? i / (n - 1) : 1; // 0 old … 1 newest
    // violet → warms toward jeweled magenta with loudness
    const hue = s.hue + energy * 42 + agefrac * 8;
    const sat = 68 + energy * 24;
    const light = 52 + agefrac * 14 + energy * 8;
    const alpha =
      clamp(0.13 + 0.5 * agefrac, 0, 1) * (0.55 + 0.45 * energy);
    const lw = 1 + agefrac * 1.3 + energy * 0.7;

    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (let m = 1; m < M; m++) ctx.lineTo(xs[m], ys[m]);
    ctx.closePath();

    // faint ink fill builds density where contours overlap
    ctx.fillStyle = `hsla(${hue},${sat}%,${Math.max(
      18,
      light - 30
    )}%,${(alpha * 0.10).toFixed(4)})`;
    ctx.fill();

    // the contour line — the suminagashi signature
    const glow = agefrac > 0.72 && energy > 0.25;
    if (glow) {
      ctx.shadowBlur = 5 + energy * 6;
      ctx.shadowColor = `hsla(${hue},90%,72%,0.55)`;
    }
    ctx.strokeStyle = `hsla(${hue},${sat}%,${light}%,${alpha.toFixed(4)})`;
    ctx.lineWidth = lw;
    ctx.stroke();
    if (glow) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    }

    // jeweled gold filigree only at high energy, only on the freshest contours
    if (energy > 0.6 && agefrac > 0.85) {
      ctx.strokeStyle = `hsla(46,90%,66%,${(
        (energy - 0.6) * 0.5
      ).toFixed(4)})`;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
}

// ── build the Paint Worklet source by serializing drawInk (identical code) ────
function buildWorkletSource(): string {
  return `const drawInk = ${drawInk.toString()};
registerPaint('inkbloom', class {
  static get inputProperties() {
    return ['--t','--energy','--drops','--boil','--hue','--px','--py','--stir'];
  }
  paint(ctx, size, props) {
    const g = (n) => props.get(n).value;
    drawInk(ctx, size.width, size.height, {
      t: g('--t'), energy: g('--energy'), drops: g('--drops'), boil: g('--boil'),
      hue: g('--hue'), px: g('--px'), py: g('--py'), stir: g('--stir')
    });
  }
});`;
}

// Houdini surface types (not in lib.dom) — accessed through a narrow cast.
interface HoudiniCSS {
  paintWorklet?: { addModule(url: string): Promise<void> };
  registerProperty?: (def: {
    name: string;
    syntax: string;
    inherits: boolean;
    initialValue: string;
  }) => void;
}

const PROP_DEFS: ReadonlyArray<[string, string]> = [
  ["--t", "0"],
  ["--energy", "0"],
  ["--drops", "0"],
  ["--boil", "0"],
  ["--hue", "262"],
  ["--px", "0.5"],
  ["--py", "0.5"],
  ["--stir", "0"],
];

const SEED = 0x51ed7 >>> 0;
const MAX_PLINK_VOICES = 5; // ×2 osc = 10, + 3 drone osc + 1 lfo ≤ 14 concurrent

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

type Mode = "idle" | "running";

export default function Page() {
  const paintElRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const vtRef = useRef<number>(0); // virtual (reduced-motion-scaled) clock, ms
  const reducedRef = useRef<boolean>(false);
  const houdiniActiveRef = useRef<boolean>(false);

  // simulation scalars
  const energyRef = useRef<number>(0.2);
  const boilRef = useRef<number>(0.1);
  const hueRef = useRef<number>(262);
  const dropsRef = useRef<number>(4);
  const dropClockRef = useRef<number>(0);
  const stirRef = useRef<number>(0);
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const pressedRef = useRef<boolean>(false);
  const idlePhasesRef = useRef<number[]>([]);
  const rngRef = useRef<() => number>(makeRng(SEED ^ 0x1234));

  // audio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const droneStopRef = useRef<(() => void) | null>(null);
  const voiceEndsRef = useRef<number[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Uint8Array | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micLiveRef = useRef<boolean>(false);

  const [mode, setMode] = useState<Mode>("idle");
  const [houdiniActive, setHoudiniActive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [micLive, setMicLive] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── a soft ink-drop plink, synced to a visual drop ─────────────────────────
  const spawnPlink = useCallback(() => {
    const ctx = audioCtxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const ends = voiceEndsRef.current;
    while (ends.length && ends[0] < now) ends.shift();
    if (ends.length >= MAX_PLINK_VOICES) return;
    const rng = rngRef.current;

    // pentatonic over a violet-mood root (F)
    const scale = [0, 2, 3, 5, 7, 10, 12];
    const deg = scale[Math.floor(rng() * scale.length)];
    const oct = rng() < 0.3 ? 12 : 0;
    const freq = 174.6 * Math.pow(2, (deg + oct) / 12);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * (1 + (rng() - 0.5) * 0.006);
    const partial = ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = freq * 2.01;
    const pg = ctx.createGain();
    pg.gain.value = 0.16;
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = (rng() - 0.5) * 1.2;

    osc.connect(g);
    partial.connect(pg).connect(g);
    g.connect(pan).connect(master);

    const dur = 0.9 + rng() * 1.6;
    const peak = 0.045 + 0.075 * energyRef.current;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.002, peak), now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.start(now);
    partial.start(now);
    osc.stop(now + dur + 0.05);
    partial.stop(now + dur + 0.05);
    ends.push(now + dur + 0.05);
  }, []);

  // ── mic loudness → 0..1 ────────────────────────────────────────────────────
  const readMicEnergy = useCallback((): number => {
    const a = analyserRef.current;
    const buf = timeBufRef.current;
    if (!a || !buf) return 0;
    a.getByteTimeDomainData(buf as unknown as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    return Math.min(1, rms * 4.5);
  }, []);

  // ── seeded idle self-demo envelope (never blank / never dead) ───────────────
  const idleEnergy = useCallback((tSec: number): number => {
    const p = idlePhasesRef.current;
    const e =
      0.3 +
      0.22 * Math.sin(tSec * 0.23 + p[0]) +
      0.14 * Math.sin(tSec * 0.57 + p[1]) +
      0.08 * Math.sin(tSec * 1.3 + p[2]);
    return Math.max(0.06, Math.min(0.82, e));
  }, []);

  // ── render one frame to the Canvas2D fallback ──────────────────────────────
  const drawCanvas = useCallback((state: InkState) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const rect = cvs.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(rect.width * dpr));
    const ch = Math.max(1, Math.round(rect.height * dpr));
    if (cvs.width !== cw) cvs.width = cw;
    if (cvs.height !== ch) cvs.height = ch;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawInk(ctx as unknown as InkCtx, rect.width, rect.height, state);
  }, []);

  // ── push scalars to the Houdini element (repaint trigger) ──────────────────
  const pushHoudini = useCallback((state: InkState) => {
    const el = paintElRef.current;
    if (!el) return;
    el.style.setProperty("--t", String(state.t));
    el.style.setProperty("--energy", state.energy.toFixed(4));
    el.style.setProperty("--drops", String(Math.floor(state.drops)));
    el.style.setProperty("--boil", state.boil.toFixed(4));
    el.style.setProperty("--hue", state.hue.toFixed(2));
    el.style.setProperty("--px", state.px.toFixed(4));
    el.style.setProperty("--py", state.py.toFixed(4));
    el.style.setProperty("--stir", state.stir.toFixed(4));
  }, []);

  // ── register props + load the Paint Worklet from a Blob URL (once) ──────────
  useEffect(() => {
    // reduced-motion
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onMq = (e: MediaQueryListEvent) => {
      reducedRef.current = e.matches;
    };
    mq.addEventListener("change", onMq);

    // seed the idle envelope phases deterministically
    const rng = makeRng(SEED ^ 0xa5a5);
    idlePhasesRef.current = [
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
    ];

    const houdini =
      typeof CSS !== "undefined" &&
      "paintWorklet" in CSS &&
      typeof (CSS as unknown as HoudiniCSS).registerProperty === "function";

    let cancelled = false;
    if (houdini) {
      const hcss = CSS as unknown as HoudiniCSS;
      for (const [name, initial] of PROP_DEFS) {
        try {
          hcss.registerProperty?.({
            name,
            syntax: "<number>",
            inherits: false,
            initialValue: initial,
          });
        } catch {
          /* already registered (HMR / remount) — fine */
        }
      }
      try {
        const url = URL.createObjectURL(
          new Blob([buildWorkletSource()], { type: "application/javascript" })
        );
        hcss.paintWorklet
          ?.addModule(url)
          .then(() => {
            URL.revokeObjectURL(url);
            if (cancelled) return;
            houdiniActiveRef.current = true;
            setHoudiniActive(true);
          })
          .catch(() => {
            /* fall through to canvas */
          });
      } catch {
        /* fall through to canvas */
      }
    }

    return () => {
      cancelled = true;
      mq.removeEventListener("change", onMq);
    };
  }, []);

  // ── the always-on visual loop (audio is layered on top via Begin) ──────────
  useEffect(() => {
    lastTimeRef.current = performance.now();
    const frame = () => {
      const now = performance.now();
      let dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      if (!(dt > 0) || dt > 0.1) dt = 0.016;
      const rm = reducedRef.current;

      // virtual clock — reduced-motion slows ALL drift/boil at once
      vtRef.current += dt * 1000 * (rm ? 0.5 : 1);
      const vt = vtRef.current;

      // energy: mic when live, else seeded self-demo
      const target = micLiveRef.current
        ? readMicEnergy()
        : idleEnergy(now * 0.001);
      const kE = rm ? 0.04 : 0.09;
      energyRef.current += (target - energyRef.current) * kE;
      boilRef.current += (energyRef.current - boilRef.current) * (rm ? 0.05 : 0.1);
      hueRef.current = 262 + Math.sin(now * 0.00003) * 7; // slow violet drift

      // pointer stir decays back to a settled sheet
      if (pressedRef.current) stirRef.current = 1;
      else stirRef.current *= rm ? 0.985 : 0.955;

      // drop spawning — rate rises with loudness
      const rate = (rm ? 1.1 : 2.6) * energyRef.current + 0.4;
      dropClockRef.current += rate * dt;
      while (dropClockRef.current >= 1) {
        dropClockRef.current -= 1;
        dropsRef.current += 1;
        spawnPlink();
      }

      const state: InkState = {
        t: vt,
        energy: energyRef.current,
        drops: dropsRef.current,
        boil: boilRef.current,
        hue: hueRef.current,
        px: pointerRef.current.x,
        py: pointerRef.current.y,
        stir: stirRef.current,
      };

      if (houdiniActiveRef.current) pushHoudini(state);
      else drawCanvas(state);

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [readMicEnergy, idleEnergy, spawnPlink, drawCanvas, pushHoudini]);

  // ── audio teardown ─────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    droneStopRef.current?.();
    droneStopRef.current = null;
    streamRef.current?.getTracks().forEach((tk) => tk.stop());
    streamRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    micLiveRef.current = false;
    setMicLive(false);
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    masterRef.current = null;
    voiceEndsRef.current = [];
    if (ctx) void ctx.close();
  }, []);

  // teardown on unmount
  useEffect(() => () => stopAudio(), [stopAudio]);

  // ── Begin: gesture-gated AudioContext + mic + drone ────────────────────────
  const begin = useCallback(async () => {
    if (mode === "running") return;
    setMode("running");
    setNotice(null);

    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    // master ≤ 0.2 through a limiter
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    master.connect(comp).connect(ctx.destination);
    master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.4);
    masterRef.current = master;

    // sustaining cosmic drone bed — never silent
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0001;
    droneGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 2.2);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 560;
    droneGain.connect(lp).connect(master);
    const droneFreqs = [87.3, 87.3 * 1.5, 87.3 * 2.006]; // F2 + fifth + octave
    const droneOscs = droneFreqs.map((f, k) => {
      const o = ctx.createOscillator();
      o.type = k === 0 ? "sine" : "triangle";
      o.frequency.value = f;
      const dg = ctx.createGain();
      dg.gain.value = k === 0 ? 0.6 : 0.2;
      o.connect(dg).connect(droneGain);
      o.start();
      return o;
    });
    // breathing filter LFO — well under 3 Hz, no strobe
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 150;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    droneStopRef.current = () => {
      try {
        droneOscs.forEach((o) => o.stop());
        lfo.stop();
      } catch {
        /* already stopped */
      }
    };

    // request the mic; degrade gracefully to the idle self-demo on denial
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser); // NOT to destination — no feedback
      analyserRef.current = analyser;
      timeBufRef.current = new Uint8Array(analyser.fftSize);
      micLiveRef.current = true;
      setMicLive(true);
    } catch {
      micLiveRef.current = false;
      setMicLive(false);
      setNotice(
        "Microphone unavailable — a seeded self-demo is stirring the ink instead."
      );
    }
  }, [mode]);

  const stop = useCallback(() => {
    stopAudio();
    setMode("idle");
    setNotice(null);
  }, [stopAudio]);

  // ── pointer stir ───────────────────────────────────────────────────────────
  const setPointerFromEvent = useCallback((e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pointerRef.current = {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      pressedRef.current = true;
      setPointerFromEvent(e);
      stirRef.current = 1;
      dropsRef.current += 1;
      spawnPlink();
    },
    [setPointerFromEvent, spawnPlink]
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pressedRef.current) return;
      setPointerFromEvent(e);
      stirRef.current = 1;
      if (rngRef.current() < 0.14) {
        dropsRef.current += 1;
        spawnPlink();
      }
    },
    [setPointerFromEvent, spawnPlink]
  );
  const onPointerUp = useCallback(() => {
    pressedRef.current = false;
  }, []);

  return (
    <main
      className="relative min-h-screen w-full touch-none overflow-hidden bg-background text-foreground"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* back-nav */}
      <a
        href="/dream"
        className="absolute left-4 top-4 z-20 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream
      </a>

      {/* Houdini surface — carries `background: paint(inkbloom)` */}
      <div
        ref={paintElRef}
        aria-hidden
        className={`absolute inset-0 ${houdiniActive ? "" : "hidden"}`}
        style={{ background: "paint(inkbloom)" }}
      />
      {/* Canvas2D fallback — identical drawInk, active when Houdini is absent */}
      <canvas
        ref={canvasRef}
        aria-hidden
        className={`absolute inset-0 h-full w-full ${
          houdiniActive ? "hidden" : ""
        }`}
      />

      {/* title + controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center px-6 pt-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] sm:text-3xl">
          1548 — Ink Bloom
        </h1>
        <p className="mt-2 max-w-md text-base text-muted-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
          Drops of ink bloom into concentric suminagashi rings. Your breath
          stirs and boils them — drawn by the browser&apos;s CSS compositor.
        </p>

        {mode === "idle" ? (
          <button
            type="button"
            onClick={begin}
            className="pointer-events-auto mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin — breath + sound
          </button>
        ) : (
          <div className="pointer-events-auto mt-6 flex flex-col items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {micLive ? "Listening — breathe, hum, speak" : "Idle self-demo"}
            </span>
            <button
              type="button"
              onClick={stop}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          </div>
        )}

        {notice && (
          <p className="pointer-events-none mt-3 max-w-md text-sm text-destructive drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
            {notice}
          </p>
        )}
      </div>

      {/* renderer indicator + design-notes toggle */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-3">
        <span className="text-xs text-muted-foreground/70">
          {houdiniActive ? "CSS Houdini Paint" : "Canvas 2D fallback"}
        </span>
        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {showNotes ? "Hide notes" : "Design notes"}
        </button>
      </div>

      {showNotes && (
        <div className="absolute bottom-4 right-4 z-20 max-w-sm rounded-md border border-border bg-background/85 p-4 backdrop-blur">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Suminagashi (Japanese floating-ink marbling) rendered by a CSS
            Houdini Paint Worklet. Each drop of radius d displaces every earlier
            point P to C + (P−C)·√(1 + d²/|P−C|²), so rings nest into
            interlocking contours. The worklet reconstructs the whole field
            deterministically from eight animatable custom properties React
            writes each frame; changing a property is what triggers the
            compositor to repaint. The same pure draw function backs a Canvas2D
            fallback where Houdini is absent, so visuals are identical
            everywhere. Breath loudness drives drop rate, boil and warmth; drag
            to stir ink toward the pointer. No strobe; honors reduced-motion.
          </p>
        </div>
      )}

      <PrototypeNav
        slugs={["1536-codec-melt", "1542-flow-tracer", "1548-ink-bloom"]}
      />
    </main>
  );
}
