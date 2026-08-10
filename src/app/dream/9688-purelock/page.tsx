"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";

// ─────────────────────────────────────────────────────────────────────────────
// PURELOCK — a walkable just-intonation lattice where acoustic beating between
// the root drone and the walked interval is rendered as a raw-WebGL2 moiré
// interference field. Land a pure small-integer ratio → the two gratings LOCK
// and the field goes still and near-white. Drift (walk to a complex ratio, or
// A/B to 12-TET) → the coinciding harmonics fall out of phase, the field THROBS
// at the audible beat rate, and red banding blooms (Plomp–Levelt roughness made
// visible). Palette is Ikeda: near-black ground, clean white lock, red throb.
// ─────────────────────────────────────────────────────────────────────────────

// Seeded PRNG for the auto-walker (deterministic — the lab bans nondeterminism).
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

const F_ROOT = 146.83; // D3 drone (Hz), fixed root the interval sounds against
const NH_ANALYSIS = 8; // partials per tone for the beat / roughness model
const AUDIO_HARM = 6; // partials per audible voice (shared partials → real beats)

// 7-limit lattice bounds: a = just fifths (3/2), b = just thirds (5/4),
// c = septimal axis (7/4). Kept small so displayed ratios stay legible.
const A_MIN = -4, A_MAX = 4;
const B_MIN = -3, B_MAX = 3;
const C_MIN = -1, C_MAX = 1;

interface Lattice { a: number; b: number; c: number }

// Exact rational for a lattice node, octave-reduced into [1, 2).
// value = 3^a · 5^b · 7^c · 2^e2, with e2 chosen so value ∈ [1,2).
function ratioFraction(n: Lattice): { num: number; den: number; value: number; cents: number } {
  const e3 = n.a;
  const e5 = n.b;
  const e7 = n.c;
  let e2 = -n.a - 2 * n.b - 2 * n.c; // from the /2 in 3/2 and the /4 in 5/4, 7/4
  const primePow = (base: number, exp: number) => Math.pow(base, exp);
  let value = primePow(2, e2) * primePow(3, e3) * primePow(5, e5) * primePow(7, e7);
  // octave-reduce into [1,2)
  while (value >= 2) { value /= 2; e2 -= 1; }
  while (value < 1) { value *= 2; e2 += 1; }
  const num = primePow(2, Math.max(e2, 0)) * primePow(3, Math.max(e3, 0)) *
    primePow(5, Math.max(e5, 0)) * primePow(7, Math.max(e7, 0));
  const den = primePow(2, Math.max(-e2, 0)) * primePow(3, Math.max(-e3, 0)) *
    primePow(5, Math.max(-e5, 0)) * primePow(7, Math.max(-e7, 0));
  const cents = 1200 * Math.log2(value);
  return { num: Math.round(num), den: Math.round(den), value, cents };
}

// Voice frequency for the current node, in just or nearest-12-TET tuning.
function voiceFreq(value: number, tet: boolean): number {
  if (!tet) return F_ROOT * value;
  const cents = 1200 * Math.log2(value);
  const semis = Math.round(cents / 100);
  return F_ROOT * Math.pow(2, semis / 12);
}

// Plomp–Levelt / Sethares analysis of the two sounding tones.
//   R      : normalized sensory roughness (0 = smooth, 1 = maximally rough)
//   beatHz : the slowest strong partial-pair difference — the audible throb.
//            Zero when a low harmonic pair coincides exactly (pure lock).
function analyze(fRoot: number, fVoice: number): { R: number; beatHz: number } {
  let rRaw = 0;
  let beat = Infinity;
  for (let n = 1; n <= NH_ANALYSIS; n++) {
    const fr = n * fRoot;
    const ar = Math.pow(0.8, n - 1);
    for (let m = 1; m <= NH_ANALYSIS; m++) {
      const fv = m * fVoice;
      const av = Math.pow(0.8, m - 1);
      const df = Math.abs(fr - fv);
      const fmin = Math.min(fr, fv);
      const a = ar * av;
      // Sethares dissonance curve for this partial pair.
      const s = 0.24 / (0.0207 * fmin + 18.96);
      rRaw += a * (Math.exp(-3.5 * s * df) - Math.exp(-5.75 * s * df));
      // Slowest audible beat among the strong pairs (this is the throb rate).
      if (a >= 0.02 && df < beat) beat = df;
    }
  }
  const R = Math.min(1, Math.max(0, rRaw / 0.22));
  return { R, beatHz: Number.isFinite(beat) ? beat : 0 };
}

// ── raw WebGL2 interference shader ───────────────────────────────────────────
const VERT_SRC = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2  uRes;
uniform float uRough;     // 0..1 sensory roughness → grating detune + red
uniform float uBeatPhase; // accumulated temporal phase (rad); advances at beatHz
uniform float uReduced;   // 1 = reduced motion (freeze the crawl)
uniform float uSpatial;   // base grating frequency (cycles across height)
uniform float uAngle;     // base grating angle (rad)
const float TAU = 6.28318530718;
void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float rough = clamp(uRough, 0.0, 1.0);
  float ph = (uReduced > 0.5) ? 0.0 : uBeatPhase;

  // Two overlaid gratings. At lock (rough→0) they are identical → the moiré
  // envelope vanishes and the field is a calm, still near-white. As roughness
  // grows the second grating detunes in frequency AND angle → broad moiré
  // fringes appear, and the whole pattern crawls at the audio beat rate (ph).
  float ang = uAngle;
  vec2 d1 = vec2(cos(ang), sin(ang));
  vec2 d2 = vec2(cos(ang + 0.09 * rough), sin(ang + 0.09 * rough));
  float f1 = uSpatial;
  float f2 = uSpatial * (1.0 + 0.05 * rough);
  float g1 = sin(TAU * f1 * dot(p, d1));
  float g2 = sin(TAU * f2 * dot(p, d2) + ph);
  float m = 0.5 + 0.5 * g1 * g2; // moiré envelope, 0..1

  float lock = 1.0 - smoothstep(0.02, 0.20, rough);

  // Ikeda palette: near-black ground, clean white constructive, red destructive.
  vec3 ground = vec3(0.035, 0.030, 0.030);
  vec3 white  = vec3(0.96, 0.95, 0.93);
  vec3 col = mix(ground, white, m);
  float darkband = smoothstep(0.5, 0.0, m);
  col = mix(col, vec3(0.86, 0.07, 0.06), darkband * rough);

  // Locked look: serene near-white with only a faint static fringe, no red.
  vec3 lockCol = mix(vec3(0.80, 0.80, 0.78), vec3(0.97, 0.97, 0.95), m);
  col = mix(col, lockCol, lock);

  // Slow, safe global throb — depth scales with roughness, rate is the beat
  // (clamped on the CPU to <= 2.5 Hz), so nothing ever strobes.
  if (uReduced < 0.5) {
    col *= 1.0 - 0.22 * rough * (0.5 + 0.5 * sin(ph));
  } else {
    col *= 1.0 - 0.12 * rough;
  }
  outColor = vec4(col, 1.0);
}`;

interface Rig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  u: {
    res: WebGLUniformLocation | null;
    rough: WebGLUniformLocation | null;
    beatPhase: WebGLUniformLocation | null;
    reduced: WebGLUniformLocation | null;
    spatial: WebGLUniformLocation | null;
    angle: WebGLUniformLocation | null;
  };
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("purelock shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function makeRig(canvas: HTMLCanvasElement): Rig | null {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "low-power" });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("purelock link:", gl.getProgramInfoLog(program));
    return null;
  }
  const buffer = gl.createBuffer();
  const vao = gl.createVertexArray();
  if (!buffer || !vao) return null;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // full-screen quad (two triangles)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return {
    gl,
    program,
    vao,
    buffer,
    u: {
      res: gl.getUniformLocation(program, "uRes"),
      rough: gl.getUniformLocation(program, "uRough"),
      beatPhase: gl.getUniformLocation(program, "uBeatPhase"),
      reduced: gl.getUniformLocation(program, "uReduced"),
      spatial: gl.getUniformLocation(program, "uSpatial"),
      angle: gl.getUniformLocation(program, "uAngle"),
    },
  };
}

// ── audio: an additive bank so the two tones share partials and really beat ──
interface Bank { out: GainNode; oscs: { o: OscillatorNode; n: number }[] }

function buildBank(ctx: AudioContext, dest: AudioNode, base: number, level: number): Bank {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(dest);
  const oscs: { o: OscillatorNode; n: number }[] = [];
  for (let n = 1; n <= AUDIO_HARM; n++) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = base * n;
    const g = ctx.createGain();
    g.gain.value = Math.pow(0.62, n - 1) / AUDIO_HARM;
    o.connect(g);
    g.connect(out);
    o.start();
    oscs.push({ o, n });
  }
  out.gain.setTargetAtTime(level, ctx.currentTime, 0.35);
  return { out, oscs };
}

function retuneBank(bank: Bank, base: number, ctx: AudioContext) {
  for (const { o, n } of bank.oscs) {
    o.frequency.setTargetAtTime(base * n, ctx.currentTime, 0.05);
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const SPATIAL = 22.0;
const ANGLE = 0.45;

// grid of nodes shown in the lattice mini-map (centered on current node)
const MAP_R = 2; // ±2 fifths × ±2 thirds

export default function PureLockPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<Rig | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef<number>(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const rootBankRef = useRef<Bank | null>(null);
  const voiceBankRef = useRef<Bank | null>(null);

  const posRef = useRef<Lattice>({ a: 0, b: 1, c: 0 }); // start on a just major third
  const tetRef = useRef<boolean>(false);
  const interactedRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);

  // smoothed visual targets driven by the analysis
  const targetRoughRef = useRef<number>(0);
  const targetBeatRef = useRef<number>(0);
  const curRoughRef = useRef<number>(0);
  const curBeatRef = useRef<number>(0);
  const phaseRef = useRef<number>(0);

  // walker bookkeeping
  const rngRef = useRef<() => number>(mulberry32(0x9688));
  const lastStepRef = useRef<number>(0);

  // React-mirrored display state (UI chrome only)
  const [audioOn, setAudioOn] = useState(false);
  const [tet, setTet] = useState(false);
  const [autoOn, setAutoOn] = useState(true);
  const [noGL, setNoGL] = useState(false);
  const [readout, setReadout] = useState(() => {
    const f = ratioFraction({ a: 0, b: 1, c: 0 });
    const an = analyze(F_ROOT, voiceFreq(f.value, false));
    return { a: 0, b: 1, c: 0, num: f.num, den: f.den, cents: f.cents, beatHz: an.beatHz, R: an.R };
  });

  // Land a node: update refs, retune audio, push visual targets + readout.
  const landNode = useCallback((next: Lattice, tetMode: boolean) => {
    const a = clamp(next.a, A_MIN, A_MAX);
    const b = clamp(next.b, B_MIN, B_MAX);
    const c = clamp(next.c, C_MIN, C_MAX);
    posRef.current = { a, b, c };
    const frac = ratioFraction({ a, b, c });
    const fVoice = voiceFreq(frac.value, tetMode);
    const an = analyze(F_ROOT, fVoice);
    targetRoughRef.current = an.R;
    targetBeatRef.current = an.beatHz;
    if (ctxRef.current && voiceBankRef.current) {
      retuneBank(voiceBankRef.current, fVoice, ctxRef.current);
    }
    setReadout({ a, b, c, num: frac.num, den: frac.den, cents: frac.cents, beatHz: an.beatHz, R: an.R });
  }, []);

  // Create the AudioContext + banks on the first user gesture (browser rule).
  const ensureAudio = useCallback(() => {
    if (ctxRef.current) {
      void ctxRef.current.resume();
      return;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    void ctx.resume();
    const master = createSafeMaster(ctx, { gain: 0.16 });
    ctxRef.current = ctx;
    masterRef.current = master;
    rootBankRef.current = buildBank(ctx, master.input, F_ROOT, 0.5);
    const frac = ratioFraction(posRef.current);
    voiceBankRef.current = buildBank(ctx, master.input, voiceFreq(frac.value, tetRef.current), 0.5);
    setAudioOn(true);
  }, []);

  // First real key/click hands control from the auto-walker to the user.
  const takeControl = useCallback(() => {
    if (!interactedRef.current) {
      interactedRef.current = true;
      setAutoOn(false);
    }
    ensureAudio();
  }, [ensureAudio]);

  const move = useCallback((da: number, db: number, dc: number) => {
    takeControl();
    const p = posRef.current;
    landNode({ a: p.a + da, b: p.b + db, c: p.c + dc }, tetRef.current);
  }, [landNode, takeControl]);

  const jumpTo = useCallback((a: number, b: number) => {
    takeControl();
    landNode({ a, b, c: posRef.current.c }, tetRef.current);
  }, [landNode, takeControl]);

  const toggleTet = useCallback(() => {
    takeControl();
    const next = !tetRef.current;
    tetRef.current = next;
    setTet(next);
    landNode(posRef.current, next);
  }, [landNode, takeControl]);

  // ── mount: rig, listeners, render + walker loop ────────────────────────────
  useEffect(() => {
    const reduced = prefersReducedMotion();
    reducedRef.current = reduced;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rig = makeRig(canvas);
    if (rig) {
      rigRef.current = rig;
    } else {
      setNoGL(true);
      ctx2dRef.current = canvas.getContext("2d");
    }

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    // prime the very first node so the shader has real targets on frame 1
    landNode(posRef.current, false);
    curRoughRef.current = targetRoughRef.current;
    curBeatRef.current = targetBeatRef.current;

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const k = e.key;
      if (k === "ArrowRight") { e.preventDefault(); move(1, 0, 0); }
      else if (k === "ArrowLeft") { e.preventDefault(); move(-1, 0, 0); }
      else if (k === "ArrowUp") { e.preventDefault(); move(0, 1, 0); }
      else if (k === "ArrowDown") { e.preventDefault(); move(0, -1, 0); }
      else if (k === "x" || k === "X") { move(0, 0, 1); }
      else if (k === "z" || k === "Z") { move(0, 0, -1); }
      else if (k === "t" || k === "T") { toggleTet(); }
    };
    window.addEventListener("keydown", onKey);

    // Deterministic seeded walker: steps node→node so a muted phone sees
    // consonance breathing (freeze on pure ratios, throb on complex ones).
    const moves: [number, number, number][] = [
      [1, 0, 0], [-1, 0, 0], [1, 0, 0], [-1, 0, 0], // fifths (weighted)
      [0, 1, 0], [0, -1, 0], [0, 1, 0], [0, -1, 0], // thirds (weighted)
      [0, 0, 1], [0, 0, -1], // septimal (rare)
    ];
    const stepInterval = reduced ? 4200 : 2500;

    const walkerStep = (now: number) => {
      if (interactedRef.current) return;
      if (now - lastStepRef.current < stepInterval) return;
      lastStepRef.current = now;
      const rng = rngRef.current;
      const mv = moves[Math.floor(rng() * moves.length)];
      const p = posRef.current;
      let na = p.a + mv[0], nb = p.b + mv[1], nc = p.c + mv[2];
      // reflect off the lattice bounds so the walk keeps wandering the interior
      if (na < A_MIN || na > A_MAX) na = p.a - mv[0];
      if (nb < B_MIN || nb > B_MAX) nb = p.b - mv[1];
      if (nc < C_MIN || nc > C_MAX) nc = p.c - mv[2];
      landNode({ a: na, b: nb, c: nc }, tetRef.current);
    };

    let prev = performance.now();
    lastStepRef.current = prev;

    const frame = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;

      walkerStep(now);

      // ease visual params toward their targets so nodes morph, not snap
      const kEase = reducedRef.current ? 0.06 : 0.12;
      curRoughRef.current += (targetRoughRef.current - curRoughRef.current) * kEase;
      curBeatRef.current += (targetBeatRef.current - curBeatRef.current) * kEase;

      // advance temporal phase at the (clamped, safe) beat rate
      const visBeat = clamp(curBeatRef.current, 0, 2.5);
      if (!reducedRef.current) phaseRef.current += 6.28318530718 * visBeat * dt;

      const r = rigRef.current;
      if (r) {
        const { gl } = r;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.useProgram(r.program);
        gl.bindVertexArray(r.vao);
        gl.uniform2f(r.u.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.uniform1f(r.u.rough, curRoughRef.current);
        gl.uniform1f(r.u.beatPhase, phaseRef.current);
        gl.uniform1f(r.u.reduced, reducedRef.current ? 1 : 0);
        gl.uniform1f(r.u.spatial, SPATIAL);
        gl.uniform1f(r.u.angle, ANGLE);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
      } else if (ctx2dRef.current) {
        drawFallback(ctx2dRef.current, canvas, curRoughRef.current, phaseRef.current, reducedRef.current);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      const r = rigRef.current;
      if (r) {
        const { gl } = r;
        gl.deleteProgram(r.program);
        gl.deleteBuffer(r.buffer);
        gl.deleteVertexArray(r.vao);
        const lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
        rigRef.current = null;
      }
      if (masterRef.current) masterRef.current.disconnect();
      if (ctxRef.current) ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
      masterRef.current = null;
      rootBankRef.current = null;
      voiceBankRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // lattice mini-map cells (each node colored by its own just roughness)
  const mapCells = useMemo(() => {
    const cells: { a: number; b: number; num: number; den: number; R: number; here: boolean }[] = [];
    for (let db = MAP_R; db >= -MAP_R; db--) {
      for (let da = -MAP_R; da <= MAP_R; da++) {
        const a = readout.a + da;
        const b = readout.b + db;
        const frac = ratioFraction({ a, b, c: readout.c });
        const an = analyze(F_ROOT, F_ROOT * frac.value);
        cells.push({ a, b, num: frac.num, den: frac.den, R: an.R, here: da === 0 && db === 0 });
      }
    }
    return cells;
  }, [readout.a, readout.b, readout.c]);

  const consonanceLabel =
    readout.R < 0.12 ? "locked · pure" : readout.R < 0.4 ? "gentle beating" : "rough · throbbing";

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="WebGL interference field: still and white when the interval is a pure just ratio, throbbing red when it is rough."
      />

      {/* hero */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight">PURELOCK</h1>
          <p className="mt-1 max-w-md text-base text-muted-foreground">
            See consonance. Walk a just-intonation lattice against a fixed drone —
            the acoustic beating between the voices becomes a moiré field that
            freezes into stillness on a pure ratio and throbs when you drift off it.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!audioOn ? (
              <button
                type="button"
                onClick={takeControl}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Play sound
              </button>
            ) : (
              <span className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 py-3 font-mono text-xs text-muted-foreground">
                sound live
              </span>
            )}
            <button
              type="button"
              onClick={toggleTet}
              aria-pressed={tet}
              className={
                tet
                  ? "min-h-[44px] rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  : "min-h-[44px] rounded-md border border-border bg-background/60 px-5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              }
            >
              {tet ? "12-TET (rough) — A/B to just" : "Just — A/B to 12-TET"}
            </button>
          </div>
          {autoOn && (
            <p className="mt-2 font-mono text-[11px] text-muted-foreground/80">
              auto-walking (seeded) · press an arrow or tap a node to take over
            </p>
          )}
        </div>
      </div>

      {/* readout */}
      <div className="pointer-events-none absolute right-5 top-5 z-10 sm:right-8 sm:top-8">
        <div className="rounded-lg border border-border bg-background/70 px-4 py-3 text-right backdrop-blur-sm">
          <div className="font-mono text-3xl font-semibold tracking-tight text-foreground tabular-nums">
            {readout.num}/{readout.den}
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
            {readout.cents.toFixed(1)} cents · {tet ? "12-TET" : "just"}
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            <span className={readout.R < 0.12 ? "text-primary" : "text-destructive"}>
              beat {readout.beatHz.toFixed(2)} Hz
            </span>
            <span className="text-muted-foreground/70"> · {consonanceLabel}</span>
          </div>
        </div>
      </div>

      {/* lattice mini-map (clickable neighbours) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-center px-4 sm:bottom-16">
        <div className="pointer-events-auto w-full max-w-2xl rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Just-intonation lattice">
                {mapCells.map((cell) => (
                  <button
                    key={`${cell.a},${cell.b}`}
                    type="button"
                    onClick={() => jumpTo(cell.a, cell.b)}
                    title={`${cell.num}/${cell.den}`}
                    aria-label={`ratio ${cell.num} over ${cell.den}`}
                    className={
                      "flex h-11 w-11 items-center justify-center rounded-md border font-mono text-[10px] tabular-nums transition-colors " +
                      (cell.here
                        ? "border-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                    style={{
                      // node fill encodes consonance: near-white lock → red rough
                      backgroundColor: cell.here
                        ? "rgb(139,92,246)"
                        : `rgb(${Math.round(230 - cell.R * 90)}, ${Math.round(230 - cell.R * 200)}, ${Math.round(228 - cell.R * 205)})`,
                      color: cell.here ? "#fff" : cell.R > 0.45 ? "#fff" : "#26252b",
                    }}
                  >
                    {cell.num}/{cell.den}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-[180px] font-mono text-[11px] leading-relaxed text-muted-foreground/85">
              <p>←/→ = ±fifth (3/2) · ↑/↓ = ±third (5/4)</p>
              <p>z / x = ±septimal (7/4) · axis c = {readout.c}</p>
              <p className="mt-1">tap any node to jump · t = A/B tuning</p>
              <p className="mt-1 text-muted-foreground/60">
                map fill: white = consonant, red = rough
              </p>
            </div>
          </div>
        </div>
      </div>

      {noGL && (
        <div className="pointer-events-none absolute inset-x-0 top-40 z-10 flex justify-center px-4">
          <p className="rounded-md border border-border bg-background/80 px-4 py-2 text-sm text-destructive backdrop-blur-sm">
            WebGL2 unavailable — showing a Canvas2D interference fallback that still throbs.
          </p>
        </div>
      )}

      <PrototypeNav slugs={["9688-purelock"]} />
    </main>
  );
}

// ── Canvas2D fallback: two overlapping translucent gratings that beat ────────
function drawFallback(
  g: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rough: number,
  phase: number,
  reduced: boolean,
) {
  const w = canvas.width;
  const h = canvas.height;
  g.fillStyle = "#0a0808";
  g.fillRect(0, 0, w, h);
  const throb = reduced ? 0 : 0.5 + 0.5 * Math.sin(phase);
  const spacing = 14;
  const shift = rough * 6; // second grating detune in pixels
  const drift = reduced ? 0 : (phase * 6) % spacing;
  // grating 1 (white)
  g.globalAlpha = 0.5;
  g.fillStyle = "#f4f2ee";
  for (let x = 0; x < w; x += spacing) g.fillRect(x, 0, spacing * 0.5, h);
  // grating 2 (white, detuned + drifting) → moiré where they overlap
  g.globalAlpha = 0.5;
  for (let x = drift; x < w; x += spacing + shift) g.fillRect(x, 0, spacing * 0.5, h);
  // red banding on the beat when rough
  if (rough > 0.05) {
    g.globalAlpha = rough * (0.25 + 0.35 * throb);
    g.fillStyle = "#db1010";
    const band = spacing / Math.max(0.5, shift);
    for (let x = (phase * 20) % (band * spacing); x < w; x += band * spacing) {
      g.fillRect(x, 0, band * spacing * 0.5, h);
    }
  }
  g.globalAlpha = 1;
}
