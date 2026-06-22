// webgl-fallback.ts — WebGL2 particle bloom for devices without WebGPU.
//
// No compute shaders here: positions are advected on the CPU in a typed array
// (a few thousand particles) using the same FFT-band → force idea as the WebGPU
// path (bass swells the core, highs scatter the rim, onset blooms outward), then
// uploaded once per frame and drawn as additive glow points. Lighter, but never
// a dead screen — the piece always has a living visual.

import type { AudioFrame } from "./audio";

const FB_COUNT = 6000;

const VERT_GLSL = `#version 300 es
precision highp float;
in vec3 aPos;
in float aSpd;
uniform mat4 uMvp;
uniform float uSize;
out float vSpd;
void main() {
  gl_Position = uMvp * vec4(aPos, 1.0);
  gl_PointSize = uSize / max(gl_Position.w, 0.1);
  vSpd = aSpd;
}`;

const FRAG_GLSL = `#version 300 es
precision highp float;
in float vSpd;
out vec4 frag;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float glow = 1.0 - smoothstep(0.05, 0.5, d);
  float a = glow * 0.3;
  vec3 c0 = vec3(0.16, 0.10, 0.42);
  vec3 c1 = vec3(0.45, 0.18, 0.78);
  vec3 c2 = vec3(0.88, 0.30, 0.66);
  vec3 c3 = vec3(1.0, 0.78, 0.45);
  float t = clamp(vSpd, 0.0, 1.0);
  vec3 col = mix(c0, c1, smoothstep(0.0, 0.4, t));
  col = mix(col, c2, smoothstep(0.35, 0.7, t));
  col = mix(col, c3, smoothstep(0.7, 1.0, t));
  frag = vec4(col * a, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

export interface GlCtx {
  count: number;
  step(frame: AudioFrame | null, dt: number, time: number): void;
  draw(mvp: Float32Array): void;
  destroy(): void;
}

export function buildGl(canvas: HTMLCanvasElement): GlCtx {
  const glOrNull = canvas.getContext("webgl2", { alpha: false, antialias: false });
  if (!glOrNull) throw new Error("no-webgl2");
  const gl: WebGL2RenderingContext = glOrNull;

  const prog = gl.createProgram();
  if (!prog) throw new Error("program");
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_GLSL);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_GLSL);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  // bind names explicitly to avoid relying on layout for non-const indices
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.bindAttribLocation(prog, 1, "aSpd");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(prog));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const uMvp = gl.getUniformLocation(prog, "uMvp");
  const uSize = gl.getUniformLocation(prog, "uSize");

  // CPU particle state: pos(3) + vel(3); interleaved upload buffer pos(3)+spd(1).
  const pos = new Float32Array(FB_COUNT * 3);
  const vel = new Float32Array(FB_COUNT * 3);
  const upload = new Float32Array(FB_COUNT * 4); // x,y,z,spd
  for (let i = 0; i < FB_COUNT; i++) {
    const theta = 2 * Math.PI * Math.random();
    const phi = Math.acos(2 * Math.random() - 1);
    const rad = 0.5 + Math.pow(Math.random(), 0.6) * 1.4;
    pos[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = rad * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = rad * Math.cos(phi);
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, upload.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
  gl.bindVertexArray(null);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);

  function hash(i: number, s: number): number {
    return (Math.sin(i * 12.9898 + s * 78.233) * 43758.5453) % 1;
  }

  function step(frame: AudioFrame | null, dt: number, time: number) {
    const bands = frame ? frame.bands : null;
    const energy = frame ? frame.energy : 0.15 + 0.1 * Math.sin(time * 0.4);
    const bloom = frame ? frame.onsetEnv : 0;
    const b0 = bands ? bands[0] : 0.2;
    const b1 = bands ? bands[1] : 0.15;
    const b2 = bands ? bands[2] : 0.1;
    const b5 = bands ? bands[5] ?? 0 : 0.05;
    const b6 = bands ? bands[6] ?? 0 : 0.05;

    for (let i = 0; i < FB_COUNT; i++) {
      const o = i * 3;
      let px = pos[o];
      let py = pos[o + 1];
      let pz = pos[o + 2];
      const r = Math.hypot(px, py, pz) + 1e-4;
      const dx = px / r;
      const dy = py / r;
      const dz = pz / r;

      // curl-noise-ish swirl (cheap analytic flow)
      const fx = Math.sin(py * 1.7 + time * 0.3) * (0.4 + energy);
      const fy = Math.sin(pz * 1.5 - time * 0.27) * (0.4 + energy);
      const fz = Math.sin(px * 1.9 + time * 0.21) * (0.4 + energy);

      const coreSwell = Math.max(0, 2.4 - r) * (b0 * 1.3 + b1 * 0.9);
      const gravity = -(0.6 + b2 * 0.4) * Math.max(0, Math.min(1, (r - 0.6) / 2));
      const rim = Math.max(0, Math.min(1, (r - 1.2) / 1.2));
      const sct = (b5 * 0.9 + b6 * 1.2) * rim;

      const accX = fx * 0.4 + dx * (coreSwell + gravity + bloom * 2.0) + (hash(i, 1) - 0.5) * sct;
      const accY = fy * 0.4 + dy * (coreSwell + gravity + bloom * 2.0) + (hash(i, 2) - 0.5) * sct;
      const accZ = fz * 0.4 + dz * (coreSwell + gravity + bloom * 2.0) + (hash(i, 3) - 0.5) * sct;

      let vx = vel[o] + accX * dt;
      let vy = vel[o + 1] + accY * dt;
      let vz = vel[o + 2] + accZ * dt;
      const damp = 0.96 - energy * 0.02;
      vx *= damp;
      vy *= damp;
      vz *= damp;

      px += vx * dt;
      py += vy * dt;
      pz += vz * dt;
      const rr = Math.hypot(px, py, pz);
      if (rr > 3.2) {
        const k = 3.2 / rr;
        px *= k;
        py *= k;
        pz *= k;
        vx *= 0.5;
        vy *= 0.5;
        vz *= 0.5;
      }

      pos[o] = px;
      pos[o + 1] = py;
      pos[o + 2] = pz;
      vel[o] = vx;
      vel[o + 1] = vy;
      vel[o + 2] = vz;

      const u = i * 4;
      upload[u] = px;
      upload[u + 1] = py;
      upload[u + 2] = pz;
      upload[u + 3] = Math.min(1, Math.hypot(vx, vy, vz) * 0.9);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, upload);
  }

  function draw(mvp: Float32Array) {
    const w = canvas.width;
    const h = canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(uMvp, false, mvp);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    gl.uniform1f(uSize, 9 * dpr);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, FB_COUNT);
    gl.bindVertexArray(null);
  }

  function destroy() {
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(prog);
  }

  return { count: FB_COUNT, step, draw, destroy };
}
