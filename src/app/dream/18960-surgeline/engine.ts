// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — 18960 · Surgeline
//
// Pure, framework-free pieces of the journey engine:
//   • the slow/fast motion-energy band decomposition + leaky-integrator arc
//     (the long-form tension envelope, Dyna2Music arXiv:2610.00726 inverted),
//   • the autonomous demo + pointer energy sources,
//   • the raw WebGL2 "stormglass" field renderer and its Canvas2D fallback.
//
// No React, no Web Audio here — page.tsx owns the AudioContext lifecycle and
// wires these together. Everything is deterministic given its inputs so the
// demo, pointer and live paths all run the IDENTICAL arc + visual chain.
// ─────────────────────────────────────────────────────────────────────────────

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── arc / band decomposition ─────────────────────────────────────────────────
//
// `inst` is an instantaneous whole-body motion ENERGY (summed landmark velocity
// magnitude, normalized units per second). We split it into a heavily-smoothed
// SLOW band (the long-form build) and a lightly-smoothed FAST band (the
// high-pass flicker that sparks articulation), then integrate the slow band
// into the arc with a leak that drains faster the higher the arc sits.

const SLOW_TAU = 0.8; // s — slow-band smoothing time constant
const FAST_TAU = 0.12; // s — fast-band smoothing time constant
const SLOW_THRESH = 0.5; // units/s a seated person clears with sustained arm motion
const FILL_RATE = 0.085; // how fast sustained slow energy fills the arc
const LEAK_RATE = 0.05; // how fast the arc drains (scaled by 0.4 + arc)

export interface ArcState {
  arc: number;
  slow: number;
  fast: number;
}

export function makeArcState(seed = 0.08): ArcState {
  return { arc: seed, slow: 0, fast: 0 };
}

/** Advance the band decomposition + leaky integrator by `dt` seconds. */
export function stepArc(s: ArcState, inst: number, dt: number): void {
  const aSlow = 1 - Math.exp(-dt / SLOW_TAU);
  s.slow += (inst - s.slow) * aSlow;

  const hp = inst - s.slow; // high-pass component of the velocity
  const aFast = 1 - Math.exp(-dt / FAST_TAU);
  s.fast += (Math.abs(hp) - s.fast) * aFast;

  s.arc += Math.max(0, s.slow - SLOW_THRESH) * FILL_RATE * dt;
  s.arc -= LEAK_RATE * (0.4 + s.arc) * dt;
  s.arc = clamp01(s.arc);
}

/** Map the arc to a short, human phase label for the readout. */
export function arcPhase(arc: number): string {
  if (arc < 0.15) return "stillness";
  if (arc < 0.4) return "gathering";
  if (arc < 0.7) return "building";
  if (arc < 0.9) return "surge";
  return "crest";
}

// ── autonomous demo energy ───────────────────────────────────────────────────
//
// A ~150 s journey: ramp a sustained build, hold near the peak, recede to near
// stillness, loop. Superimposed sharp bumps so the FAST band picks up
// articulation even with no camera. Returns a motion ENERGY (units/s), fed into
// the SAME stepArc() as a live body.

const DEMO_CYCLE = 150; // s

export function demoEnergy(tSec: number): number {
  const u = (tSec % DEMO_CYCLE) / DEMO_CYCLE; // 0..1
  let base: number;
  if (u < 0.34) base = u / 0.34; // ramp up
  else if (u < 0.6) base = 1; // hold near peak
  else if (u < 0.86) base = 1 - (u - 0.6) / 0.26; // recede
  else base = 0.04; // stillness before the loop
  base = Math.max(0, base);

  // broad organic undulation + periodic sharp bumps (-> fast articulation)
  const undulate = 0.8 + 0.2 * Math.sin(tSec * 0.7);
  const bump = Math.pow(Math.max(0, Math.sin(tSec * 3.1)), 10) * 1.1;
  return base * 2.3 * undulate + base * bump;
}

// ── pointer energy ───────────────────────────────────────────────────────────
//
// Holding the pointer down injects a sustained slow energy (a broad "lean in");
// moving it fast injects fast flicker. `speed` is normalized pointer speed
// (fraction of the viewport diagonal per second).

export function pointerEnergy(held: boolean, speed: number): number {
  const sustained = held ? 1.4 : 0;
  return sustained + Math.min(6, speed * 3.2);
}

// ── renderer abstraction ─────────────────────────────────────────────────────

export interface FieldRenderer {
  readonly kind: "gl" | "2d";
  draw(arc: number, rms: number, spark: number, timeSec: number): void;
  resize(cssW: number, cssH: number): void;
  dispose(): void;
}

// ── GLSL (raw WebGL2) ────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 u_res;
uniform float u_time;
uniform float u_arc;   // 0..1 long-form journey
uniform float u_rms;   // 0..1 live audio level
uniform float u_spark; // 0..1 recent articulation

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 6; i++) {
    v += amp * noise(p);
    p = p * 2.02 + vec2(37.1, 11.7);
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - 0.5 * u_res) / u_res.y; // aspect-correct, centered
  float yb = fc.y / u_res.y;             // 0 bottom .. 1 top
  float arc = u_arc;

  // domain-warped oceanic flow; turbulence + drift grow with the arc
  float t = u_time * (0.05 + 0.13 * arc);
  vec2 q = p * (1.5 + 1.5 * arc);
  float warp = fbm(q + vec2(0.0, -t * 1.6));
  float flow = fbm(q * 1.3 + vec2(warp * 1.6, warp * 1.2 - t));
  float field = fbm(q * 0.85 + flow * (0.6 + 0.9 * arc));

  // the luminous field rises from the floor and fills the frame as the arc climbs
  float reach = mix(0.18, 1.18, arc);
  float lum = field * smoothstep(reach, reach - 0.95, yb);
  lum = lum * (0.35 + 0.95 * arc) + 0.045;
  lum += u_rms * 0.28 * field; // his piano shimmers the field

  // stormglass palette
  vec3 ground = vec3(0.014, 0.027, 0.034); // graphite-black
  vec3 ocean  = vec3(0.030, 0.170, 0.190); // deep oceanic blue-green
  vec3 jade   = vec3(0.560, 0.950, 0.780); // pale luminous jade crest

  float jadeMix = smoothstep(0.35, 1.0, arc) * smoothstep(0.2, 0.9, lum);
  vec3 col = ground + mix(ocean, jade, jadeMix) * lum;

  // thin warm-amber rimlight ONLY near the climax
  float climax = smoothstep(0.8, 1.0, arc);
  float rim = pow(max(0.0, flow), 3.0);
  col += vec3(1.0, 0.72, 0.34) * rim * climax * 0.65;

  // fast-motion articulation sparks
  float spark = u_spark * pow(max(0.0, fbm(q * 4.0 + t * 3.0) - 0.6), 2.0) * 3.2;
  col += mix(ocean, jade, 0.7) * spark;

  // vignette back toward graphite at the edges
  float vig = smoothstep(1.35, 0.2, length(p));
  col *= mix(0.6, 1.0, vig);

  // gentle tone-map
  col = col / (1.0 + col * 0.6);
  col = pow(max(col, vec3(0.0)), vec3(0.85));
  fragColor = vec4(col, 1.0);
}`;

function compileProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const build = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const vs = build(gl.VERTEX_SHADER, VERT);
  const fs = build(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

const DPR_CAP = 2;

/** Raw WebGL2 fragment-field renderer. Returns null if WebGL2 is unavailable. */
export function createGLRenderer(canvas: HTMLCanvasElement): FieldRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const prog = compileProgram(gl);
  if (!prog) return null;

  const vao = gl.createVertexArray();
  const quad = gl.createBuffer();
  if (!vao || !quad) return null;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]), // one big triangle covers the clip
    gl.STATIC_DRAW,
  );
  const aLoc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  gl.useProgram(prog);
  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uArc = gl.getUniformLocation(prog, "u_arc");
  const uRms = gl.getUniformLocation(prog, "u_rms");
  const uSpark = gl.getUniformLocation(prog, "u_spark");

  let pxW = 1;
  let pxH = 1;

  return {
    kind: "gl",
    resize(cssW: number, cssH: number) {
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
      pxW = Math.max(1, Math.round(cssW * dpr));
      pxH = Math.max(1, Math.round(cssH * dpr));
      canvas.width = pxW;
      canvas.height = pxH;
      gl.viewport(0, 0, pxW, pxH);
    },
    draw(arc: number, rms: number, spark: number, timeSec: number) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(uRes, pxW, pxH);
      gl.uniform1f(uTime, timeSec);
      gl.uniform1f(uArc, arc);
      gl.uniform1f(uRms, rms);
      gl.uniform1f(uSpark, spark);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },
    dispose() {
      try {
        gl.deleteProgram(prog);
        gl.deleteBuffer(quad);
        gl.deleteVertexArray(vao);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* ignore */
      }
    },
  };
}

// ── Canvas2D fallback ────────────────────────────────────────────────────────
//
// Same stormglass palette + arc behavior, cheaper: a rising vertical gradient
// from graphite through oceanic to jade, a few drifting luminous blobs that
// brighten with the arc, and a thin amber rim arc near the climax.

interface Blob {
  phaseX: number;
  phaseY: number;
  speedX: number;
  speedY: number;
  size: number;
}

export function createCanvas2DRenderer(canvas: HTMLCanvasElement): FieldRenderer {
  const ctx = canvas.getContext("2d");
  let w = 1;
  let h = 1;
  const blobs: Blob[] = Array.from({ length: 7 }, (_, i) => ({
    phaseX: (i * 2.399) % (Math.PI * 2),
    phaseY: (i * 1.317) % (Math.PI * 2),
    speedX: 0.07 + 0.05 * ((i * 7) % 5) / 5,
    speedY: 0.05 + 0.04 * ((i * 3) % 4) / 4,
    size: 0.22 + 0.14 * ((i * 11) % 6) / 6,
  }));

  return {
    kind: "2d",
    resize(cssW: number, cssH: number) {
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
      w = Math.max(1, Math.round(cssW * dpr));
      h = Math.max(1, Math.round(cssH * dpr));
      canvas.width = w;
      canvas.height = h;
    },
    draw(arc: number, rms: number, spark: number, timeSec: number) {
      if (!ctx) return;
      const reach = mix(0.2, 1.1, arc);
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      const jadeMix = smoothstep(0.35, 1.0, arc);
      const r0 = Math.round(mix(8, mix(30, 143, jadeMix), arc * reach));
      const g0 = Math.round(mix(14, mix(140, 242, jadeMix), arc * reach));
      const b0 = Math.round(mix(17, mix(150, 199, jadeMix), arc * reach));
      grad.addColorStop(0, `rgb(${r0}, ${g0}, ${b0})`);
      grad.addColorStop(Math.min(0.95, 0.25 + reach * 0.6), "rgb(8, 36, 40)");
      grad.addColorStop(1, "rgb(4, 7, 9)");
      ctx.fillStyle = "rgb(4, 7, 9)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";
      const bright = 0.1 + 0.6 * arc + 0.2 * rms;
      for (const bl of blobs) {
        const cx = (0.5 + 0.42 * Math.sin(timeSec * bl.speedX + bl.phaseX)) * w;
        const cy = (0.72 - 0.5 * arc * Math.abs(Math.sin(timeSec * bl.speedY + bl.phaseY))) * h;
        const rad = bl.size * Math.min(w, h);
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        const jm = smoothstep(0.4, 1.0, arc);
        const cr = Math.round(mix(20, 143, jm) * bright);
        const cg = Math.round(mix(120, 242, jm) * bright);
        const cb = Math.round(mix(130, 199, jm) * bright);
        rg.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.5)`);
        rg.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // articulation spark flash
      if (spark > 0.02) {
        ctx.fillStyle = `rgba(190, 245, 210, ${0.18 * spark})`;
        ctx.fillRect(0, 0, w, h);
      }

      // thin amber rim near the climax
      const climax = smoothstep(0.8, 1.0, arc);
      if (climax > 0.01) {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(255, 184, 87, ${0.5 * climax})`;
        ctx.lineWidth = Math.max(1, 2 * (window.devicePixelRatio || 1));
        ctx.strokeRect(
          ctx.lineWidth,
          ctx.lineWidth,
          w - ctx.lineWidth * 2,
          h - ctx.lineWidth * 2,
        );
      }
      ctx.globalCompositeOperation = "source-over";
    },
    dispose() {
      /* nothing persistent to release */
    },
  };
}
