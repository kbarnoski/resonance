// ─────────────────────────────────────────────────────────────────────────────
// WebGL2 fallback backends for the resonograph.
//
//   • "webgl" tier — grains are updated on the GPU via TRANSFORM FEEDBACK
//     (ping-pong vertex buffers, rasterizer discard), the same ψ-gradient
//     descent the WebGPU compute shader runs.
//   • "cpu" tier — the identical update in JS over fewer grains, uploaded each
//     frame; it reuses this file's plate + grain render programs.
//
// Both draw a warm brass plate (fragment evaluates ψ for shading) then the pale
// sand grains additively on top, so overlapping grains build bright nodal lines.
// ─────────────────────────────────────────────────────────────────────────────

import { psiGrad } from "./chladni";

export interface StepParams {
  m: number;
  n: number;
  /** Projection step toward the nodal line (0..1). */
  lr: number;
  /** Random-hop scale (vibration). */
  jitter: number;
  /** Strike impulse 0..1 — boosts jitter briefly after a mode change. */
  strike: number;
}

export interface Backend {
  kind: "webgpu" | "webgl" | "cpu";
  step(p: StepParams): void;
  destroy(): void;
}

const PLATE_VS = `#version 300 es
out vec2 v_uv;
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){ vec2 p = verts[gl_VertexID]; v_uv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;

const PLATE_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform float u_m, u_n;
#define PI 3.14159265
void main(){
  float x = v_uv.x, y = v_uv.y;
  float psi = cos(PI*u_m*x)*cos(PI*u_n*y) - cos(PI*u_n*x)*cos(PI*u_m*y);
  float amp = clamp(abs(psi)/2.0, 0.0, 1.0);
  vec3 brass = vec3(0.30, 0.205, 0.085);
  vec3 col = brass * (0.42 + 0.72*amp);
  col += vec3(0.06,0.035,0.0) * pow(amp, 3.0);
  vec2 d = v_uv - 0.5; col *= 1.0 - 0.5*dot(d,d);
  o = vec4(col, 1.0);
}`;

const GRAIN_VS = `#version 300 es
in vec2 a_pos;
uniform float u_size, u_m, u_n;
out float v_amp;
#define PI 3.14159265
void main(){
  gl_Position = vec4(a_pos*2.0-1.0, 0.0, 1.0);
  gl_PointSize = u_size;
  float psi = cos(PI*u_m*a_pos.x)*cos(PI*u_n*a_pos.y) - cos(PI*u_n*a_pos.x)*cos(PI*u_m*a_pos.y);
  v_amp = clamp(abs(psi)/2.0, 0.0, 1.0);
}`;

const GRAIN_FS = `#version 300 es
precision highp float;
in float v_amp; out vec4 o;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c,c);
  if (r > 0.25) discard;
  float a = 1.0 - r*4.0;
  vec3 sand = mix(vec3(0.96,0.90,0.74), vec3(0.72,0.62,0.42), v_amp);
  o = vec4(sand, a*0.5);
}`;

const UPDATE_VS = `#version 300 es
in vec2 a_pos;
uniform float u_m, u_n, u_lr, u_jitter, u_strike;
uniform uint u_frame;
out vec2 v_out;
#define PI 3.14159265
uint pcg(uint v){ v = v*747796405u + 2891336453u; uint s = ((v >> ((v >> 28u)+4u)) ^ v) * 277803737u; return (s >> 22u) ^ s; }
float u2f(uint u){ return float(u) / 4294967295.0; }
void main(){
  vec2 p = a_pos;
  float a = PI*u_m, b = PI*u_n;
  float cmx=cos(a*p.x), smx=sin(a*p.x);
  float cny=cos(b*p.y), sny=sin(b*p.y);
  float cnx=cos(b*p.x), snx=sin(b*p.x);
  float cmy=cos(a*p.y), smy=sin(a*p.y);
  float psi = cmx*cny - cnx*cmy;
  vec2 g = vec2(-a*smx*cny + b*snx*cmy, -b*cmx*sny + a*cnx*smy);
  float g2 = dot(g,g) + 1e-3;
  p -= u_lr * psi * g / g2;
  float amp = clamp(abs(psi)/2.0, 0.0, 1.0);
  uint id = uint(gl_VertexID);
  uint h1 = pcg(id*2u + u_frame*19349663u);
  uint h2 = pcg(id*2u + 1u + u_frame*83492791u);
  vec2 r = vec2(u2f(h1), u2f(h2))*2.0 - 1.0;
  p += r * (u_jitter*(amp+0.02)*(1.0 + u_strike*6.0));
  if (p.x < 0.0) p.x = -p.x; if (p.x > 1.0) p.x = 2.0 - p.x;
  if (p.y < 0.0) p.y = -p.y; if (p.y > 1.0) p.y = 2.0 - p.y;
  v_out = clamp(p, vec2(0.0), vec2(1.0));
  gl_Position = vec4(0.0,0.0,0.0,1.0);
}`;

const UPDATE_FS = `#version 300 es
precision highp float; out vec4 o; void main(){ o = vec4(0.0); }`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function link(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
  feedback?: string[],
): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  if (feedback) gl.transformFeedbackVaryings(p, feedback, gl.SEPARATE_ATTRIBS);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link: " + log);
  }
  return p;
}

interface Options {
  count: number;
  pointSize: number;
  gpuUpdate: boolean;
  rng: () => number;
}

export function makeWebglBackend(
  canvas: HTMLCanvasElement,
  opts: Options,
): Backend {
  const glMaybe = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!glMaybe) throw new Error("no WebGL2 context");
  const gl: WebGL2RenderingContext = glMaybe;

  const { count, pointSize, gpuUpdate, rng } = opts;

  // Initial scatter (deterministic).
  const init = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    init[i * 2] = rng();
    init[i * 2 + 1] = rng();
  }
  // CPU-tier working copy.
  const cpuPos = gpuUpdate ? null : new Float32Array(init);

  const plateProg = link(gl, PLATE_VS, PLATE_FS);
  const grainProg = link(gl, GRAIN_VS, GRAIN_FS);
  const updateProg = gpuUpdate ? link(gl, UPDATE_VS, UPDATE_FS, ["v_out"]) : null;

  // Ping-pong buffers.
  const bufA = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, bufA);
  gl.bufferData(gl.ARRAY_BUFFER, init, gpuUpdate ? gl.DYNAMIC_COPY : gl.DYNAMIC_DRAW);
  const bufB = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, bufB);
  gl.bufferData(gl.ARRAY_BUFFER, init.byteLength, gl.DYNAMIC_COPY);

  const tf = gpuUpdate ? gl.createTransformFeedback() : null;

  // Uniform locations.
  const plateM = gl.getUniformLocation(plateProg, "u_m");
  const plateN = gl.getUniformLocation(plateProg, "u_n");
  const grainSize = gl.getUniformLocation(grainProg, "u_size");
  const grainM = gl.getUniformLocation(grainProg, "u_m");
  const grainN = gl.getUniformLocation(grainProg, "u_n");
  const grainPosLoc = gl.getAttribLocation(grainProg, "a_pos");

  let uM = 0, uN = 0, uLr = 0, uJit = 0, uStr = 0, uFrame = 0, uPosLoc = -1;
  if (updateProg) {
    uM = gl.getUniformLocation(updateProg, "u_m") as unknown as number;
    uN = gl.getUniformLocation(updateProg, "u_n") as unknown as number;
    uLr = gl.getUniformLocation(updateProg, "u_lr") as unknown as number;
    uJit = gl.getUniformLocation(updateProg, "u_jitter") as unknown as number;
    uStr = gl.getUniformLocation(updateProg, "u_strike") as unknown as number;
    uFrame = gl.getUniformLocation(updateProg, "u_frame") as unknown as number;
    uPosLoc = gl.getAttribLocation(updateProg, "a_pos");
  }

  let src = bufA;
  let dst = bufB;
  let frame = 0;

  gl.disable(gl.DEPTH_TEST);

  function cpuStep(p: StepParams) {
    const pos = cpuPos!;
    const jitBase = p.jitter * (1 + p.strike * 6);
    for (let i = 0; i < count; i++) {
      let x = pos[i * 2];
      let y = pos[i * 2 + 1];
      const { psi, gx, gy } = psiGrad(p.m, p.n, x, y);
      const g2 = gx * gx + gy * gy + 1e-3;
      x -= (p.lr * psi * gx) / g2;
      y -= (p.lr * psi * gy) / g2;
      const amp = Math.min(1, Math.abs(psi) / 2);
      const hop = jitBase * (amp + 0.02);
      x += (rng() * 2 - 1) * hop;
      y += (rng() * 2 - 1) * hop;
      if (x < 0) x = -x; else if (x > 1) x = 2 - x;
      if (y < 0) y = -y; else if (y > 1) y = 2 - y;
      pos[i * 2] = x < 0 ? 0 : x > 1 ? 1 : x;
      pos[i * 2 + 1] = y < 0 ? 0 : y > 1 ? 1 : y;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, src);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
  }

  function gpuStep(p: StepParams) {
    frame += 1;
    gl.useProgram(updateProg);
    gl.uniform1f(uM as unknown as WebGLUniformLocation, p.m);
    gl.uniform1f(uN as unknown as WebGLUniformLocation, p.n);
    gl.uniform1f(uLr as unknown as WebGLUniformLocation, p.lr);
    gl.uniform1f(uJit as unknown as WebGLUniformLocation, p.jitter);
    gl.uniform1f(uStr as unknown as WebGLUniformLocation, p.strike);
    gl.uniform1ui(uFrame as unknown as WebGLUniformLocation, frame);

    gl.bindBuffer(gl.ARRAY_BUFFER, src);
    gl.enableVertexAttribArray(uPosLoc);
    gl.vertexAttribPointer(uPosLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, dst);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

    const t = src;
    src = dst;
    dst = t;
  }

  function render(p: StepParams) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(plateProg);
    gl.uniform1f(plateM, p.m);
    gl.uniform1f(plateN, p.n);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(grainProg);
    gl.uniform1f(grainSize, pointSize);
    gl.uniform1f(grainM, p.m);
    gl.uniform1f(grainN, p.n);
    gl.bindBuffer(gl.ARRAY_BUFFER, src);
    gl.enableVertexAttribArray(grainPosLoc);
    gl.vertexAttribPointer(grainPosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.disable(gl.BLEND);
  }

  const step = (p: StepParams) => {
    if (gpuUpdate) gpuStep(p);
    else cpuStep(p);
    render(p);
  };

  const destroy = () => {
    gl.deleteBuffer(bufA);
    gl.deleteBuffer(bufB);
    if (tf) gl.deleteTransformFeedback(tf);
    gl.deleteProgram(plateProg);
    gl.deleteProgram(grainProg);
    if (updateProg) gl.deleteProgram(updateProg);
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  };

  return { kind: gpuUpdate ? "webgl" : "cpu", step, destroy };
}
