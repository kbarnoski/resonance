// glmesh.ts — raw WebGL2 rendering of the deforming membrane. No three.js, no
// Canvas2D: hand-written GLSL, getContext("webgl2"), a dynamic vertex buffer we
// re-upload every frame from the physics positions, and a static index buffer.
//
// PALETTE: strictly achromatic. Per-vertex signed strain drives a grayscale
// strain-map — compression renders dark, tension renders bright/white, rest sits
// at a low mid-gray. A second pass overlays the lattice as faint dark lines so
// the deformation stays legible.

import { GRID } from "./physics";

const VERT_SRC = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;    // clip-space position
layout(location = 1) in float a_strain; // signed strain
uniform float u_scale;                  // 1 / running |strain| peak
out float v_s;
void main() {
  v_s = a_strain * u_scale;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in float v_s;
uniform int u_line;   // 0 = strain fill, 1 = lattice overlay
uniform float u_pulse; // 0..1 global audio pulse, lifts brightness slightly
out vec4 outColor;
void main() {
  if (u_line == 1) {
    // faint dark lattice line
    outColor = vec4(0.0, 0.0, 0.0, 0.28);
    return;
  }
  // signed strain, auto-scaled to roughly [-1, 1]
  float s = clamp(v_s, -1.2, 1.2);
  // rest → low mid-gray; tension → bright; compression → near black
  float g = 0.26 + s * 0.7;
  g += u_pulse * 0.06;
  g = clamp(g, 0.0, 1.0);
  // a gentle S-curve for punchier separation of taut vs slack
  g = smoothstep(0.0, 1.0, g);
  outColor = vec4(vec3(g), 1.0);
}`;

export interface MeshRig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  posVBO: WebGLBuffer;
  strainVBO: WebGLBuffer;
  triEBO: WebGLBuffer;
  lineEBO: WebGLBuffer;
  triCount: number;
  lineCount: number;
  vao: WebGLVertexArrayObject;
  u: { scale: WebGLUniformLocation | null; line: WebGLUniformLocation | null; pulse: WebGLUniformLocation | null };
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("membrane shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function makeMeshRig(canvas: HTMLCanvasElement): MeshRig | null {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("membrane link:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const n = GRID * GRID;
  const vao = gl.createVertexArray();
  const posVBO = gl.createBuffer();
  const strainVBO = gl.createBuffer();
  if (!vao || !posVBO || !strainVBO) return null;

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, posVBO);
  gl.bufferData(gl.ARRAY_BUFFER, n * 2 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, strainVBO);
  gl.bufferData(gl.ARRAY_BUFFER, n * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

  // static triangle indices
  const tri: number[] = [];
  const line: number[] = [];
  for (let row = 0; row < GRID - 1; row++) {
    for (let col = 0; col < GRID - 1; col++) {
      const i = row * GRID + col;
      const r = i + 1;
      const d = i + GRID;
      const dr = d + 1;
      tri.push(i, r, d, r, dr, d);
      // lattice: right + down edge of each cell
      line.push(i, r, i, d);
    }
  }
  // close the far border lines
  for (let col = 0; col < GRID - 1; col++) {
    const i = (GRID - 1) * GRID + col;
    line.push(i, i + 1);
  }
  for (let row = 0; row < GRID - 1; row++) {
    const i = row * GRID + (GRID - 1);
    line.push(i, i + GRID);
  }

  const triEBO = gl.createBuffer();
  const lineEBO = gl.createBuffer();
  if (!triEBO || !lineEBO) return null;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triEBO);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(tri), gl.STATIC_DRAW);
  // note: line indices live in their own buffer, rebound at draw time
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineEBO);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(line), gl.STATIC_DRAW);

  gl.useProgram(program);
  const u = {
    scale: gl.getUniformLocation(program, "u_scale"),
    line: gl.getUniformLocation(program, "u_line"),
    pulse: gl.getUniformLocation(program, "u_pulse"),
  };

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  return {
    gl,
    program,
    posVBO,
    strainVBO,
    triEBO,
    lineEBO,
    triCount: tri.length,
    lineCount: line.length,
    vao,
    u,
  };
}

export function resizeRig(rig: MeshRig, w: number, h: number, dpr: number) {
  const { gl } = rig;
  const cw = Math.floor(w * dpr);
  const ch = Math.floor(h * dpr);
  const c = gl.canvas as HTMLCanvasElement;
  if (c.width !== cw || c.height !== ch) {
    c.width = cw;
    c.height = ch;
  }
  gl.viewport(0, 0, cw, ch);
}

export function drawMembrane(
  rig: MeshRig,
  pos: Float32Array,
  strain: Float32Array,
  strainScale: number,
  pulse: number,
) {
  const { gl } = rig;
  gl.clearColor(0.02, 0.02, 0.025, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(rig.program);
  gl.bindVertexArray(rig.vao);

  gl.bindBuffer(gl.ARRAY_BUFFER, rig.posVBO);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
  gl.bindBuffer(gl.ARRAY_BUFFER, rig.strainVBO);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, strain);

  gl.uniform1f(rig.u.scale, strainScale);
  gl.uniform1f(rig.u.pulse, pulse);

  // pass 1: strain fill
  gl.uniform1i(rig.u.line, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rig.triEBO);
  gl.drawElements(gl.TRIANGLES, rig.triCount, gl.UNSIGNED_SHORT, 0);

  // pass 2: faint lattice overlay
  gl.uniform1i(rig.u.line, 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rig.lineEBO);
  gl.drawElements(gl.LINES, rig.lineCount, gl.UNSIGNED_SHORT, 0);

  gl.bindVertexArray(null);
}

export function disposeRig(rig: MeshRig) {
  const { gl } = rig;
  gl.deleteBuffer(rig.posVBO);
  gl.deleteBuffer(rig.strainVBO);
  gl.deleteBuffer(rig.triEBO);
  gl.deleteBuffer(rig.lineEBO);
  gl.deleteVertexArray(rig.vao);
  gl.deleteProgram(rig.program);
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}
