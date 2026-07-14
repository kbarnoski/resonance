"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1628-chladni-choir
// "What if you could drive a physical vibrating plate with a tone and WATCH the
//  sand collect on the silent nodal lines — and the pattern you see IS the chord
//  you hear, in both directions?"
//
// Idealized square-plate Chladni eigenfunctions
//   f(x,y) = Σ a_k · [ cos(mπx)cos(nπy) − cos(nπx)cos(mπy) ]
// are drawn as a live standing-wave field in a WebGL2 fragment shader (bright
// antinodes over dark brushed steel). Thousands of GL-point "sand" grains take a
// damped Newton step down the gradient of the field toward the nearest zero, so
// they physically migrate onto the silent nodal lines and reorganize whenever the
// pattern changes. Each resonant (m,n) mode is a partial in an additive synth at
// f ∝ √(m²+n²) (plate modal scaling); the ratio between the two loudest partials
// is named as a musical interval — the pattern you see is the chord you hear.
//
// Seeded by arxiv 2605.09846 "ChladniSonify" (May 2026). Fully deterministic:
// all jitter / idle sweep come from a mulberry32 PRNG on a constant seed and
// performance.now(); no Math.random / Date in executable code.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── deterministic PRNG ──────────────────────────────────────────────────────
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

const SEED = 0x1628c401;

// ── plate mode table (ordered by modal number q = √(m²+n²)) ─────────────────
type Mode = { m: number; n: number; q: number };
const MODE_PAIRS: Array<[number, number]> = [
  [1, 2], [1, 3], [2, 3], [1, 4], [2, 4], [3, 4], [1, 5], [2, 5],
  [3, 5], [1, 6], [4, 5], [2, 6], [3, 6], [1, 7], [4, 6], [5, 6],
];
const MODES: Mode[] = MODE_PAIRS.map(([m, n]) => ({ m, n, q: Math.sqrt(m * m + n * n) }))
  .sort((a, b) => a.q - b.q);

const Q_MIN = MODES[0].q;
const Q_MAX = MODES[MODES.length - 1].q;
const BASE_HZ = 55; // partial frequency = BASE_HZ * q  (plate modal scaling)
const MAX_FIELD_MODES = 4; // top-weighted modes used for field + sand

// ── interval naming (bidirectional pattern → chord) ─────────────────────────
const JUST: Array<{ name: string; r: number }> = [
  { name: "minor 2nd", r: 16 / 15 },
  { name: "major 2nd", r: 9 / 8 },
  { name: "minor 3rd", r: 6 / 5 },
  { name: "major 3rd", r: 5 / 4 },
  { name: "perfect 4th", r: 4 / 3 },
  { name: "tritone", r: 7 / 5 },
  { name: "perfect 5th", r: 3 / 2 },
  { name: "minor 6th", r: 8 / 5 },
  { name: "major 6th", r: 5 / 3 },
  { name: "minor 7th", r: 16 / 9 },
  { name: "major 7th", r: 15 / 8 },
];
function nameInterval(qa: number, qb: number): string {
  const hi = Math.max(qa, qb);
  const lo = Math.min(qa, qb);
  let ratio = hi / lo;
  let octs = 0;
  while (ratio >= 1.9999) {
    ratio /= 2;
    octs++;
  }
  const suffix = octs > 0 ? ` +${octs} oct` : "";
  const cents = (r: number) => Math.abs(1200 * Math.log2(ratio / r));
  if (cents(1) < 22) return octs > 0 ? `${octs} octave${octs > 1 ? "s" : ""}` : "unison";
  let best = JUST[0];
  let bestC = cents(JUST[0].r);
  for (const j of JUST) {
    const c = cents(j.r);
    if (c < bestC) {
      bestC = c;
      best = j;
    }
  }
  return bestC < 40 ? best.name + suffix : "cluster" + suffix;
}

// ── field evaluation (analytic value + gradient) for sand migration ─────────
const PI = Math.PI;
function evalField(
  m: Float32Array,
  n: Float32Array,
  a: Float32Array,
  count: number,
  x: number,
  y: number,
): { f: number; gx: number; gy: number } {
  let f = 0, gx = 0, gy = 0;
  for (let i = 0; i < count; i++) {
    const mi = m[i], ni = n[i], ai = a[i];
    const cmx = Math.cos(mi * PI * x), cnx = Math.cos(ni * PI * x);
    const cmy = Math.cos(mi * PI * y), cny = Math.cos(ni * PI * y);
    const smx = Math.sin(mi * PI * x), snx = Math.sin(ni * PI * x);
    const smy = Math.sin(mi * PI * y), sny = Math.sin(ni * PI * y);
    f += ai * (cmx * cny - cnx * cmy);
    gx += ai * (-mi * PI * smx * cny + ni * PI * snx * cmy);
    gy += ai * (cmx * -ni * PI * sny - cnx * -mi * PI * smy);
  }
  return { f, gx, gy };
}

// ── shaders ─────────────────────────────────────────────────────────────────
const FIELD_VS = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(gl_VertexID == 2 ? 3.0 : -1.0, gl_VertexID == 1 ? 3.0 : -1.0);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FIELD_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform vec3 uModes[${MAX_FIELD_MODES}];
uniform int uCount;
uniform float uPulse;
const float PI = 3.141592653589793;
void main(){
  vec2 uv = vUv;
  float v = 0.0;
  for (int i = 0; i < ${MAX_FIELD_MODES}; i++){
    if (i >= uCount) break;
    float m = uModes[i].x, n = uModes[i].y, a = uModes[i].z;
    v += a * (cos(m*PI*uv.x)*cos(n*PI*uv.y) - cos(n*PI*uv.x)*cos(m*PI*uv.y));
  }
  float amp = pow(clamp(abs(v) * 0.5, 0.0, 1.0), 0.82) * uPulse;
  // brushed-steel base: fine horizontal grain, monochrome graphite
  float brush = 0.022*sin(uv.y*820.0) + 0.014*sin(uv.y*331.0 + 1.7)
              + 0.010*sin(uv.y*1490.0 + 4.1);
  vec3 steel = vec3(0.085, 0.092, 0.104) + brush;
  vec3 bone  = vec3(0.64, 0.615, 0.565);
  vec3 col = mix(steel, bone, amp);
  vec2 d = uv - 0.5;
  col *= 1.0 - 0.55 * dot(d, d);       // gentle vignette
  frag = vec4(col, 1.0);
}`;

const PART_VS = `#version 300 es
in vec2 aPos;
uniform float uSize;
void main(){
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = uSize;
}`;

const PART_FS = `#version 300 es
precision highp float;
out vec4 frag;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.05, length(c));
  frag = vec4(vec3(0.92, 0.885, 0.80) * a, a); // warm-white sand, additive
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}
function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc");
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link: " + log);
  }
  return p;
}

// ── additive modal-synth voice bank ─────────────────────────────────────────
class Choir {
  ctx: AudioContext;
  master: GainNode;
  comp: DynamicsCompressorNode;
  gains: GainNode[] = [];
  oscs: OscillatorNode[] = [];
  constructor() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.comp = this.ctx.createDynamicsCompressor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.14; // ≤ 0.15 master
    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);
    for (const mode of MODES) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = BASE_HZ * mode.q;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(this.master);
      osc.start();
      this.oscs.push(osc);
      this.gains.push(g);
    }
  }
  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }
  update(weights: Float32Array) {
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.gains.length; i++) {
      this.gains[i].gain.setTargetAtTime(0.55 * weights[i], t, 0.05);
    }
  }
  dispose() {
    for (const o of this.oscs) {
      try { o.stop(); } catch { /* already stopped */ }
      o.disconnect();
    }
    for (const g of this.gains) g.disconnect();
    this.master.disconnect();
    this.comp.disconnect();
    void this.ctx.close();
  }
}

const PARTICLES = 6500;

type Status = "pending" | "webgl" | "unsupported";

export default function ChladniChoirPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<Status>("pending");
  const [running, setRunning] = useState(false);
  const [readout, setReadout] = useState<{ m: number; n: number; hz: number; interval: string; touching: boolean } | null>(null);

  const runningRef = useRef(false);
  const choirRef = useRef<Choir | null>(null);
  const rafRef = useRef(0);

  // interaction state (touch overrides idle sweep)
  const dragRef = useRef(false);
  const qTouchRef = useRef((Q_MIN + Q_MAX) / 2);
  const exTouchRef = useRef(0.5);

  const handleStart = useCallback(async () => {
    if (!choirRef.current) choirRef.current = new Choir();
    try {
      await choirRef.current.resume();
      runningRef.current = true;
      setRunning(true);
    } catch {
      /* gesture needed again */
    }
  }, []);

  const pointerFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    qTouchRef.current = Q_MIN + Math.min(1, Math.max(0, nx)) * (Q_MAX - Q_MIN); // x → frequency
    exTouchRef.current = Math.min(1, Math.max(0, 1 - ny)); // up → more excitation
  }, []);

  const onDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!runningRef.current) void handleStart();
    pointerFromEvent(e);
  }, [handleStart, pointerFromEvent]);
  const onMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) pointerFromEvent(e);
  }, [pointerFromEvent]);
  const onUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const gl = cv.getContext("webgl2", { alpha: false, antialias: true, preserveDrawingBuffer: false });
    if (!gl) {
      setStatus("unsupported");
      return;
    }

    let fieldProg: WebGLProgram;
    let partProg: WebGLProgram;
    try {
      fieldProg = link(gl, FIELD_VS, FIELD_FS);
      partProg = link(gl, PART_VS, PART_FS);
    } catch {
      setStatus("unsupported");
      return;
    }
    setStatus("webgl");

    const uModes = gl.getUniformLocation(fieldProg, "uModes");
    const uCount = gl.getUniformLocation(fieldProg, "uCount");
    const uPulse = gl.getUniformLocation(fieldProg, "uPulse");
    const uSize = gl.getUniformLocation(partProg, "uSize");
    const aPos = gl.getAttribLocation(partProg, "aPos");

    const emptyVao = gl.createVertexArray();

    // sand particles — seeded initial scatter + per-grain jitter phase
    const rng = mulberry32(SEED);
    const pos = new Float32Array(PARTICLES * 2);
    const phase = new Float32Array(PARTICLES);
    for (let i = 0; i < PARTICLES; i++) {
      pos[i * 2] = 0.04 + rng() * 0.92;
      pos[i * 2 + 1] = 0.04 + rng() * 0.92;
      phase[i] = rng() * Math.PI * 2;
    }
    const partBuf = gl.createBuffer();
    const partVao = gl.createVertexArray();
    gl.bindVertexArray(partVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // scratch buffers for the top-N active modes
    const fm = new Float32Array(MAX_FIELD_MODES);
    const fn = new Float32Array(MAX_FIELD_MODES);
    const fa = new Float32Array(MAX_FIELD_MODES);
    const modeUniform = new Float32Array(MAX_FIELD_MODES * 3);
    const weights = new Float32Array(MODES.length);
    const order = MODES.map((_, i) => i);

    // deterministic idle-sweep LFO constants
    const lfo = {
      p1: rng() * Math.PI * 2, p2: rng() * Math.PI * 2, p3: rng() * Math.PI * 2,
    };

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const sweepScale = reduced ? 0.06 : 1;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const side = Math.floor(cv.clientWidth * dpr);
      if (side > 0 && (cv.width !== side || cv.height !== side)) {
        cv.width = side;
        cv.height = side;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const t0 = performance.now();
    let frame = 0;

    const tick = () => {
      const t = (performance.now() - t0) / 1000;

      // ── drive parameters: touch overrides the seeded idle sweep ──
      let qTarget: number, excite: number;
      const touching = dragRef.current;
      if (touching) {
        qTarget = qTouchRef.current;
        excite = exTouchRef.current;
      } else {
        const center = (Q_MIN + Q_MAX) / 2;
        qTarget = center
          + 2.1 * Math.sin(t * 0.11 * sweepScale + lfo.p1)
          + 0.7 * Math.sin(t * 0.037 * sweepScale + lfo.p2);
        excite = 0.5 + 0.35 * Math.sin(t * 0.05 * sweepScale + lfo.p3);
      }
      qTarget = Math.min(Q_MAX, Math.max(Q_MIN, qTarget));
      excite = Math.min(1, Math.max(0, excite));
      const sigma = 0.22 + 0.5 * excite; // wider resonance → richer chord

      // ── modal weights (Gaussian around qTarget) for the whole voice bank ──
      for (let i = 0; i < MODES.length; i++) {
        const d = MODES[i].q - qTarget;
        weights[i] = Math.exp(-(d * d) / (2 * sigma * sigma));
      }
      if (choirRef.current && runningRef.current) choirRef.current.update(weights);

      // ── top-N modes drive the field + sand (renormalized) ──
      order.sort((a, b) => weights[b] - weights[a]);
      let topSum = 0;
      const count = Math.min(MAX_FIELD_MODES, MODES.length);
      for (let i = 0; i < count; i++) topSum += weights[order[i]];
      topSum = topSum || 1;
      for (let i = 0; i < count; i++) {
        const md = MODES[order[i]];
        fm[i] = md.m;
        fn[i] = md.n;
        fa[i] = weights[order[i]] / topSum;
        modeUniform[i * 3] = md.m;
        modeUniform[i * 3 + 1] = md.n;
        modeUniform[i * 3 + 2] = fa[i];
      }

      // ── sand migration: damped Newton step toward nearest node f=0 ──
      const relax = reduced ? 0.22 : 0.5;
      const jit = (reduced ? 0.0006 : 0.0016) * (0.4 + excite);
      const wander = reduced ? 0.0006 : 0.0016;
      for (let i = 0; i < PARTICLES; i++) {
        const x = pos[i * 2], y = pos[i * 2 + 1];
        const { f, gx, gy } = evalField(fm, fn, fa, count, x, y);
        const g2 = gx * gx + gy * gy + 1e-4;
        const s = (-relax * f) / g2;
        let dx = s * gx, dy = s * gy;
        // clamp Newton step for smooth, visible migration
        const mag = Math.hypot(dx, dy);
        const cap = 0.03;
        if (mag > cap) { dx = (dx / mag) * cap; dy = (dy / mag) * cap; }
        // tangential wander along the nodal line + seeded jitter
        const gl2 = Math.sqrt(g2);
        const tx = -gy / gl2, ty = gx / gl2;
        const ph = phase[i];
        dx += tx * wander * Math.sin(t * 0.9 + ph) + Math.cos(ph * 1.7 + t * 0.3) * jit;
        dy += ty * wander * Math.sin(t * 0.9 + ph) + Math.sin(ph * 2.3 + t * 0.3) * jit;
        let nx = x + dx, ny = y + dy;
        // reflect at plate edges
        if (nx < 0.008) nx = 0.008 + (0.008 - nx);
        if (nx > 0.992) nx = 0.992 - (nx - 0.992);
        if (ny < 0.008) ny = 0.008 + (0.008 - ny);
        if (ny > 0.992) ny = 0.992 - (ny - 0.992);
        pos[i * 2] = Math.min(0.996, Math.max(0.004, nx));
        pos[i * 2 + 1] = Math.min(0.996, Math.max(0.004, ny));
      }

      // ── render: field, then additive sand ──
      gl.viewport(0, 0, cv.width, cv.height);
      gl.disable(gl.BLEND);
      gl.useProgram(fieldProg);
      gl.uniform3fv(uModes, modeUniform);
      gl.uniform1i(uCount, count);
      const dom = MODES[order[0]];
      const pulseOmega = reduced ? 0 : 1.6;
      gl.uniform1f(uPulse, reduced ? 1 : 0.6 + 0.4 * Math.sin(t * pulseOmega));
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(partProg);
      gl.uniform1f(uSize, Math.max(1.5, 2.1 * dpr));
      gl.bindVertexArray(partVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
      gl.drawArrays(gl.POINTS, 0, PARTICLES);
      gl.bindVertexArray(null);

      // ── low-rate UI readout ──
      frame++;
      if (frame % 10 === 0) {
        const secQ = MODES[order[1]].q;
        setReadout({
          m: dom.m,
          n: dom.n,
          hz: Math.round(BASE_HZ * dom.q),
          interval: weights[order[1]] / (weights[order[0]] || 1) > 0.15
            ? nameInterval(dom.q, secQ)
            : "single mode",
          touching,
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      gl.deleteBuffer(partBuf);
      gl.deleteVertexArray(partVao);
      gl.deleteVertexArray(emptyVao);
      gl.deleteProgram(fieldProg);
      gl.deleteProgram(partProg);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      choirRef.current?.dispose();
      choirRef.current = null;
      runningRef.current = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-black text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Chladni Choir
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Drag across the steel plate to sweep the driving tone — the sand migrates
          onto the silent nodal lines, and the pattern you see is the chord you hear.
        </p>

        {status === "unsupported" ? (
          <p className="mt-6 text-base text-destructive">
            This piece needs WebGL2, which this browser or device does not provide.
            Try a recent desktop Chrome, Firefox, or Safari.
          </p>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {running ? "Sounding" : "Start"}
              </button>

              <span className="font-mono text-xs text-muted-foreground">
                {readout
                  ? `${readout.touching ? "TOUCH" : "IDLE SWEEP"} · mode (${readout.m},${readout.n}) · ${readout.hz} Hz`
                  : "warming up…"}
              </span>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-border bg-black">
              <canvas
                ref={canvasRef}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                className="block aspect-square w-full touch-none cursor-crosshair"
              />
            </div>

            <p className="mt-3 text-base text-foreground">
              Interval:{" "}
              <span className="font-mono">{readout ? readout.interval : "…"}</span>
              <span className="text-muted-foreground">
                {" "}— the two loudest plate modes, named as what you hear.
              </span>
            </p>
            <p className="mt-2 text-base text-muted-foreground">
              Drag horizontally to raise the frequency (finer patterns, higher modes);
              drag up for more excitation (a wider resonance rings more modes into a
              chord). Left idle, a seeded sweep keeps the plate singing on its own.
            </p>
          </>
        )}
      </div>
      <PrototypeNav slugs={["1628-chladni-choir"]} />
    </main>
  );
}
