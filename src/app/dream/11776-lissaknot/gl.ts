// ─────────────────────────────────────────────────────────────────────────────
// 11776-lissaknot · gl.ts — WebGL2 additive LINE vector-graphics: the electron
// beam.
//
//   Each frame the CPU hands us a fresh X-Y beam path (beam.ts). We:
//     1. draw a dim deep-indigo fade quad over the preserved buffer — the
//        phosphor decay, so a held figure persists and BLOOMS while a changing
//        one leaves a trailing ghost;
//     2. draw the path as additive glow POINTS (soft sprites) — the halo;
//     3. draw the same path as an additive gl.LINE_STRIP — the crisp beam core;
//   with a bright "beam head" sweeping the loop so it reads as a live trace, not
//   a static plot. Additive blending (SRC_ALPHA, ONE) means repeated frames of
//   the same knot accumulate to a steady glow — the lock made visible.
//
//   PALETTE lives ONLY here: a bone-white / ivory beam on deep indigo. When the
//   note is locked the beam warms to pure ivory; unlocked it cools toward a
//   pale indigo-white. No other hues.
// ─────────────────────────────────────────────────────────────────────────────

export interface BeamParams {
  /** Flat [x0,y0,x1,y1,…] path in scope space (~[-1,1]). */
  points: Float32Array;
  /** Number of vertices to draw from `points`. */
  count: number;
  /** 0..1 overall beam brightness (rides amplitude + a little lock). */
  bright: number;
  /** 0..1 lock — warms + tightens the beam. */
  lock: number;
  /** 0..1 onset whip — a brief brightness + size swell (never a full flash). */
  whip: number;
  /** 0..1 position of the sweeping beam head along the path. */
  head: number;
  /** Whole-figure rotation in radians (slow living drift). */
  rot: number;
  /** 0..1 fade-quad strength (persistence). Lower = longer trails. */
  fade: number;
}

export interface BeamRenderer {
  readonly ok: boolean;
  resize(w: number, h: number, dpr: number): void;
  render(p: BeamParams): void;
  dispose(): void;
}

/** Ceiling on beam samples per frame (buffer is sized to this). */
export const MAX_SAMPLES = 5200;

const BEAM_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in float aT;   // 0..1 along the path

uniform vec2  uScale;   // aspect fit
uniform float uRot;
uniform float uHead;
uniform float uBright;
uniform float uWhip;

out float vGlow;

void main(){
  // beam-head boost: a bright dot sweeping the loop (wrap distance in t)
  float dt = abs(aT - uHead);
  dt = min(dt, 1.0 - dt);
  float head = smoothstep(0.05, 0.0, dt);

  float glow = uBright * (0.55 + 0.9 * uWhip) * (0.75 + 1.5 * head);
  vGlow = glow;

  float c = cos(uRot), s = sin(uRot);
  vec2 r = vec2(aPos.x * c - aPos.y * s, aPos.x * s + aPos.y * c);
  float grow = 1.0 + 0.12 * uWhip; // the whip swells the figure a touch
  gl_Position = vec4(r * uScale * grow, 0.0, 1.0);
  gl_PointSize = (2.0 + 9.0 * head + 3.0 * uWhip);
}`;

const BEAM_FRAG_POINTS = `#version 300 es
precision highp float;
in float vGlow;
uniform float uLock;
out vec4 fragColor;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float a = smoothstep(0.5, 0.0, r);
  a *= a;
  // ivory when locked, cooler pale indigo-white when unlocked
  vec3 ivory = vec3(0.99, 0.965, 0.90);
  vec3 cool  = vec3(0.74, 0.80, 1.00);
  vec3 col = mix(cool, ivory, uLock);
  fragColor = vec4(col * vGlow * 0.6, a);
}`;

const BEAM_FRAG_LINE = `#version 300 es
precision highp float;
in float vGlow;
uniform float uLock;
out vec4 fragColor;
void main(){
  vec3 ivory = vec3(1.0, 0.98, 0.93);
  vec3 cool  = vec3(0.80, 0.85, 1.00);
  vec3 col = mix(cool, ivory, uLock);
  fragColor = vec4(col * vGlow, 0.85);
}`;

const FADE_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aP;
void main(){ gl_Position = vec4(aP, 0.0, 1.0); }`;

const FADE_FRAG = `#version 300 es
precision highp float;
uniform float uFade;
out vec4 c;
void main(){ c = vec4(0.028, 0.032, 0.085, uFade); }`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("lissaknot shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vsrc: string, fsrc: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vsrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("lissaknot link error:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

export function makeBeamRenderer(canvas: HTMLCanvasElement): BeamRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    depth: false,
    preserveDrawingBuffer: true, // keep the accumulation between frames (phosphor)
  });
  if (!gl) return null;

  const pointsProg = link(gl, BEAM_VERT, BEAM_FRAG_POINTS);
  const lineProg = link(gl, BEAM_VERT, BEAM_FRAG_LINE);
  const fadeProg = link(gl, FADE_VERT, FADE_FRAG);
  if (!pointsProg || !lineProg || !fadeProg) return null;

  // ── dynamic beam buffer: interleaved [x, y, t] per vertex ──────────────────
  const FLOATS_PER = 3;
  const STRIDE = FLOATS_PER * 4;
  const vertData = new Float32Array(MAX_SAMPLES * FLOATS_PER);

  const beamBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, beamBuf);
  gl.bufferData(gl.ARRAY_BUFFER, vertData.byteLength, gl.DYNAMIC_DRAW);

  const beamVAO = gl.createVertexArray();
  gl.bindVertexArray(beamVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, beamBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, STRIDE, 8);
  gl.bindVertexArray(null);

  // fullscreen fade quad
  const fadeVAO = gl.createVertexArray();
  gl.bindVertexArray(fadeVAO);
  const fadeBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, fadeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const uPts = {
    scale: loc(pointsProg, "uScale"),
    rot: loc(pointsProg, "uRot"),
    head: loc(pointsProg, "uHead"),
    bright: loc(pointsProg, "uBright"),
    whip: loc(pointsProg, "uWhip"),
    lock: loc(pointsProg, "uLock"),
  };
  const uLine = {
    scale: loc(lineProg, "uScale"),
    rot: loc(lineProg, "uRot"),
    head: loc(lineProg, "uHead"),
    bright: loc(lineProg, "uBright"),
    whip: loc(lineProg, "uWhip"),
    lock: loc(lineProg, "uLock"),
  };
  const uFadeLoc = loc(fadeProg, "uFade");

  let scaleX = 0.9;
  let scaleY = 0.9;
  let disposed = false;

  const clearIndigo = () => {
    gl.clearColor(0.028, 0.032, 0.085, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };
  clearIndigo();

  return {
    ok: true,
    resize(w: number, h: number) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      // keep the scope square regardless of aspect
      const base = 0.9;
      scaleX = base * Math.min(1, h / w);
      scaleY = base * Math.min(1, w / h);
      clearIndigo();
    },
    render(p: BeamParams) {
      if (disposed) return;
      const count = Math.min(p.count, MAX_SAMPLES) | 0;
      if (count < 2) return;

      // upload the path with a per-vertex t in [0,1]
      const inv = 1 / (count - 1);
      for (let i = 0; i < count; i++) {
        const o = i * FLOATS_PER;
        vertData[o] = p.points[i * 2];
        vertData[o + 1] = p.points[i * 2 + 1];
        vertData[o + 2] = i * inv;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, beamBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertData.subarray(0, count * FLOATS_PER));

      // 1. FADE — dim the previous frame toward deep indigo (phosphor decay)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(fadeProg);
      gl.uniform1f(uFadeLoc, p.fade);
      gl.bindVertexArray(fadeVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 2 + 3. additive beam: glow points, then the crisp line core
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.bindVertexArray(beamVAO);

      gl.useProgram(pointsProg);
      gl.uniform2f(uPts.scale, scaleX, scaleY);
      gl.uniform1f(uPts.rot, p.rot);
      gl.uniform1f(uPts.head, p.head);
      gl.uniform1f(uPts.bright, p.bright);
      gl.uniform1f(uPts.whip, p.whip);
      gl.uniform1f(uPts.lock, p.lock);
      gl.drawArrays(gl.POINTS, 0, count);

      gl.useProgram(lineProg);
      gl.uniform2f(uLine.scale, scaleX, scaleY);
      gl.uniform1f(uLine.rot, p.rot);
      gl.uniform1f(uLine.head, p.head);
      gl.uniform1f(uLine.bright, p.bright);
      gl.uniform1f(uLine.whip, p.whip);
      gl.uniform1f(uLine.lock, p.lock);
      gl.drawArrays(gl.LINE_STRIP, 0, count);

      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        gl.deleteBuffer(beamBuf);
        gl.deleteBuffer(fadeBuf);
        gl.deleteVertexArray(beamVAO);
        gl.deleteVertexArray(fadeVAO);
        gl.deleteProgram(pointsProg);
        gl.deleteProgram(lineProg);
        gl.deleteProgram(fadeProg);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* context already gone */
      }
    },
  };
}
