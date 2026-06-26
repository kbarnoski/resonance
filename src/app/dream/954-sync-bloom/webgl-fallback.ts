// webgl-fallback.ts — when WebGPU is unavailable.
//
// We run the SAME Kuramoto physics on the CPU (kuramoto.ts::cpuStep) and draw
// the field with a raw WebGL2 instanced-point shader: hue = phase, brightness =
// global order. Identical mechanism, just on the CPU and GL2 instead of WGSL
// compute. Phase data lives on the CPU here, so chord readback is free.

import { cpuStep, type FieldConfig } from "./kuramoto";

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;   // quad corner -1..1
layout(location=1) in float aPhase;   // per-instance phase
layout(location=2) in float aGridIdx; // per-instance grid index
uniform float uGridW;
uniform float uGridH;
uniform float uAspect;
uniform float uPointSize;
out vec2 vUv;
out float vPh;
void main(){
  float gx = mod(aGridIdx, uGridW);
  float gy = floor(aGridIdx / uGridW);
  float nx = (gx + 0.5) / uGridW;
  float ny = (gy + 0.5) / uGridH;
  float cx = (nx * 2.0 - 1.0) * 0.94;
  float cy = (ny * 2.0 - 1.0) * 0.94;
  if (uAspect > 1.0) { cx /= uAspect; } else { cy *= uAspect; }
  vUv = aCorner;
  vPh = aPhase;
  gl_Position = vec4(cx + aCorner.x * uPointSize, cy + aCorner.y * uPointSize, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in float vPh;
uniform float uOrderR;
out vec4 frag;
vec3 phaseColor(float ph){
  float h = ph / 6.28318530718;
  vec3 a = vec3(0.10,0.85,0.80);
  vec3 b = vec3(0.45,0.30,0.95);
  vec3 c = vec3(0.98,0.35,0.62);
  vec3 d = vec3(1.00,0.72,0.40);
  float t = h * 4.0;
  if (t < 1.0) return mix(a,b,t);
  else if (t < 2.0) return mix(b,c,t-1.0);
  else if (t < 3.0) return mix(c,d,t-2.0);
  else return mix(d,a,t-3.0);
}
void main(){
  float d = length(vUv);
  if (d > 1.0) discard;
  float glow = pow(1.0 - d, 1.8);
  vec3 col = phaseColor(vPh);
  float bright = 0.35 + 0.9 * uOrderR;
  float a = glow * (0.18 + 0.42 * uOrderR);
  frag = vec4(col * bright * glow, a);
}`;

export interface SyncGl {
  readonly kind: "webgl2";
  /** integrate the field on CPU; returns global order parameter r. */
  step(
    phase: Float32Array,
    omega: Float32Array,
    kLocal: Float32Array,
    kGlobal: number,
    dt: number,
  ): number;
  render(phase: Float32Array, orderR: number, pointSize: number): void;
  resize(): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) ?? "compile");
  }
  return sh;
}

export function initSyncGl(
  canvas: HTMLCanvasElement,
  cfg: FieldConfig,
): SyncGl | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    premultipliedAlpha: false,
  });
  if (!gl) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    return null;
  }

  const n = cfg.n;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const sizeCanvas = () => {
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  sizeCanvas();

  // quad corners (2 triangles)
  const corners = new Float32Array([
    -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
  ]);
  const cornerBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);

  // per-instance grid index (static)
  const idx = new Float32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ARRAY_BUFFER, idx, gl.STATIC_DRAW);

  // per-instance phase (dynamic)
  const phaseBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, phaseBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(n), gl.DYNAMIC_DRAW);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  // corner (loc 0), not instanced
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  // phase (loc 1), instanced
  gl.bindBuffer(gl.ARRAY_BUFFER, phaseBuf);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);
  // grid index (loc 2), instanced
  gl.bindBuffer(gl.ARRAY_BUFFER, idxBuf);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);

  const uGridW = gl.getUniformLocation(prog, "uGridW");
  const uGridH = gl.getUniformLocation(prog, "uGridH");
  const uAspect = gl.getUniformLocation(prog, "uAspect");
  const uPointSize = gl.getUniformLocation(prog, "uPointSize");
  const uOrderR = gl.getUniformLocation(prog, "uOrderR");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE); // additive

  return {
    kind: "webgl2",
    step(phase, omega, kLocal, kGlobal, dt) {
      return cpuStep(phase, omega, kLocal, kGlobal, dt);
    },
    render(phase, orderR, pointSize) {
      sizeCanvas();
      const aspect = canvas.width / Math.max(1, canvas.height);
      const bg = 0.015 + orderR * 0.01;
      gl.clearColor(bg, bg * 0.9, bg * 1.2, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, phaseBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, phase);

      gl.uniform1f(uGridW, cfg.gridW);
      gl.uniform1f(uGridH, cfg.gridH);
      gl.uniform1f(uAspect, aspect);
      gl.uniform1f(uPointSize, pointSize);
      gl.uniform1f(uOrderR, orderR);

      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
      gl.bindVertexArray(null);
    },
    resize() {
      sizeCanvas();
    },
    dispose() {
      try {
        gl.deleteBuffer(cornerBuf);
        gl.deleteBuffer(idxBuf);
        gl.deleteBuffer(phaseBuf);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(prog);
      } catch {
        /* noop */
      }
    },
  };
}
