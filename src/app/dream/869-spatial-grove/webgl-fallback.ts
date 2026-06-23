// webgl-fallback.ts — WebGL2 grove for devices without WebGPU.
//
// Same mapping as the WebGPU path (particles clustered into per-tree canopies,
// nearest/near tree brightens), but the swirl is integrated on the CPU over a
// few thousand particles and uploaded each frame. Lighter, never a dead screen.

import { TREE_COUNT } from "./audio";
import { hueToRgb } from "./gpu";

const PER_TREE = 360;
const FB_COUNT = TREE_COUNT * PER_TREE;

const VERT_GLSL = `#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aCol;
in float aGlow;
uniform mat4 uMvp;
uniform float uSize;
out vec3 vCol;
out float vGlow;
void main() {
  gl_Position = uMvp * vec4(aPos, 1.0);
  gl_PointSize = (uSize * (0.6 + aGlow * 0.9)) / max(gl_Position.w, 0.1);
  vCol = aCol;
  vGlow = aGlow;
}`;

const FRAG_GLSL = `#version 300 es
precision highp float;
in vec3 vCol;
in float vGlow;
out vec4 frag;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float g = 1.0 - smoothstep(0.04, 0.5, d);
  float a = g * (0.08 + vGlow * 0.30);
  vec3 warm = mix(vCol, vec3(1.0, 0.82, 0.5), vGlow * g * 0.6);
  frag = vec4(warm * a, a);
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

export interface GlTreeView {
  x: number;
  y: number;
  z: number;
  hue: number;
  glow: number; // brightness / bloom combined 0..1
}

export interface GlCtx {
  count: number;
  step(trees: GlTreeView[], dt: number, time: number): void;
  draw(mvp: Float32Array): void;
  destroy(): void;
}

export function buildGl(
  canvas: HTMLCanvasElement,
  trees: { x: number; y: number; z: number }[],
): GlCtx {
  const glOrNull = canvas.getContext("webgl2", { alpha: false, antialias: false });
  if (!glOrNull) throw new Error("no-webgl2");
  const gl: WebGL2RenderingContext = glOrNull;

  const prog = gl.createProgram();
  if (!prog) throw new Error("program");
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_GLSL);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_GLSL);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.bindAttribLocation(prog, 1, "aCol");
  gl.bindAttribLocation(prog, 2, "aGlow");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(prog));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const uMvp = gl.getUniformLocation(prog, "uMvp");
  const uSize = gl.getUniformLocation(prog, "uSize");

  // CPU state: pos(3), vel(3), homeTree index, seed.
  const pos = new Float32Array(FB_COUNT * 3);
  const vel = new Float32Array(FB_COUNT * 3);
  const tree = new Int32Array(FB_COUNT);
  const seed = new Float32Array(FB_COUNT);
  // interleaved upload: pos(3) + col(3) + glow(1) = 7 floats
  const upload = new Float32Array(FB_COUNT * 7);

  let n = 0;
  for (let ti = 0; ti < trees.length; ti++) {
    const T = trees[ti];
    for (let k = 0; k < PER_TREE; k++) {
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      const rad = Math.pow(Math.random(), 0.5) * 1.5;
      pos[n * 3] = T.x + rad * Math.sin(phi) * Math.cos(theta);
      pos[n * 3 + 1] = T.y + 0.9 + rad * Math.sin(phi) * Math.sin(theta) * 1.1;
      pos[n * 3 + 2] = T.z + rad * Math.cos(phi);
      tree[n] = ti;
      seed[n] = Math.random();
      n++;
    }
  }

  const homes = trees.map((t) => ({ x: t.x, y: t.y + 0.9, z: t.z }));

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, upload.byteLength, gl.DYNAMIC_DRAW);
  const stride = 28; // 7 floats × 4 bytes
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24);
  gl.bindVertexArray(null);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);

  function step(views: GlTreeView[], dt: number, time: number) {
    const rgbCache: [number, number, number][] = views.map((v) => hueToRgb(v.hue));
    for (let i = 0; i < FB_COUNT; i++) {
      const ti = tree[i];
      const view = views[ti];
      const home = homes[ti];
      const glow = view ? view.glow : 0.2;
      const o = i * 3;
      let px = pos[o];
      let py = pos[o + 1];
      let pz = pos[o + 2];
      const ox = px - home.x;
      const oy = py - home.y;
      const oz = pz - home.z;
      const r = Math.hypot(ox, oy, oz) + 1e-4;

      const t = time * 0.25 + seed[i] * 6.2831;
      const swirlScale = 0.15 + glow * 0.5;
      const sx = Math.sin(oy * 1.6 + t) * swirlScale;
      const sy = Math.sin(oz * 1.5 - t * 0.9) * swirlScale;
      const sz = Math.sin(ox * 1.7 + t * 1.1) * swirlScale;

      const targetR = 1.5 * (0.55 + glow * 0.55);
      const dir = 1 / r;
      const restore = (targetR - r) * 1.4;
      const rx = ox * dir * restore;
      const ry = oy * dir * restore;
      const rz = oz * dir * restore;

      let vx = vel[o] + (sx + rx) * dt;
      let vy = vel[o + 1] + (sy + ry + 0.08) * dt;
      let vz = vel[o + 2] + (sz + rz) * dt;
      vx *= 0.9;
      vy *= 0.9;
      vz *= 0.9;

      px += vx * dt;
      py += vy * dt;
      pz += vz * dt;

      pos[o] = px;
      pos[o + 1] = py;
      pos[o + 2] = pz;
      vel[o] = vx;
      vel[o + 1] = vy;
      vel[o + 2] = vz;

      const rgb = rgbCache[ti] ?? [0.4, 0.2, 0.7];
      const u = i * 7;
      upload[u] = px;
      upload[u + 1] = py;
      upload[u + 2] = pz;
      upload[u + 3] = rgb[0];
      upload[u + 4] = rgb[1];
      upload[u + 5] = rgb[2];
      upload[u + 6] = glow;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, upload);
  }

  function draw(mvp: Float32Array) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.015, 0.012, 0.03, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(uMvp, false, mvp);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    gl.uniform1f(uSize, 26 * dpr);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, FB_COUNT);
    gl.bindVertexArray(null);
  }

  function destroy() {
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(prog);
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
  }

  return { count: FB_COUNT, step, draw, destroy };
}
