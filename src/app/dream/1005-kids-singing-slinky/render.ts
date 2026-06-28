// ─────────────────────────────────────────────────────────────────────────────
// render.ts · True-3D WebGL2 renderer for the rainbow slinky.
//
// The coil is drawn as a chain of glowing beads (instanced-ish point sprites)
// positioned on a 3D helix. Each coil's position along the helix axis is
// nudged by its longitudinal displacement u_i, so compression visibly bunches
// coils up / stretches them apart. A dark playground ground grid grounds it.
// All matrices come from mat4.ts; nothing imported beyond that.
// ─────────────────────────────────────────────────────────────────────────────

import { Mat4, perspective, lookAt, Vec3 } from "./mat4";

const BEAD_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in float aHue;     // 0..1 rainbow
layout(location=2) in float aGlow;    // extra brightness from local compression
uniform mat4 uProj;
uniform mat4 uView;
uniform float uPointScale;
out float vHue;
out float vGlow;
void main() {
  vec4 viewPos = uView * vec4(aPos, 1.0);
  gl_Position = uProj * viewPos;
  float dist = -viewPos.z;
  gl_PointSize = uPointScale / max(dist, 0.1);
  vHue = aHue;
  vGlow = aGlow;
}`;

const BEAD_FRAG = `#version 300 es
precision highp float;
in float vHue;
in float vGlow;
out vec4 outColor;
vec3 hsv2rgb(float h){
  vec3 p = abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return clamp(p - 1.0, 0.0, 1.0);
}
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 2.2);          // soft glowing bead
  vec3 col = hsv2rgb(vHue);
  col = mix(col, vec3(1.0), 0.25 + 0.55 * vGlow); // brighten with compression
  float a = core * (0.8 + 0.2 * vGlow);
  outColor = vec4(col * (1.2 + vGlow), a);
}`;

const GRID_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
void main(){ gl_Position = uProj * uView * vec4(aPos, 1.0); }`;

const GRID_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
void main(){ outColor = vec4(0.16, 0.20, 0.34, 1.0); }`;

function buildShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function buildProgram(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
): WebGLProgram | null {
  const v = buildShader(gl, gl.VERTEX_SHADER, vs);
  const f = buildShader(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

export interface Renderer {
  draw(
    positions: Float32Array, // n*3 helix positions
    hues: Float32Array, // n
    glows: Float32Array, // n
    n: number,
    camAngle: number,
    camHeight: number,
    aspect: number,
  ): void;
  dispose(): void;
}

export function makeRenderer(gl: WebGL2RenderingContext): Renderer | null {
  const beadProg = buildProgram(gl, BEAD_VERT, BEAD_FRAG);
  const gridProg = buildProgram(gl, GRID_VERT, GRID_FRAG);
  if (!beadProg || !gridProg) return null;
  const prog = beadProg; // non-null aliases for nested closures
  const grid = gridProg;

  // bead buffers
  const posBuf = gl.createBuffer();
  const hueBuf = gl.createBuffer();
  const glowBuf = gl.createBuffer();

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, hueBuf);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, glowBuf);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // ground grid lines on the y = -2.2 plane
  const gridVerts: number[] = [];
  const span = 9;
  const yg = -2.2;
  for (let i = -span; i <= span; i++) {
    gridVerts.push(i, yg, -span, i, yg, span);
    gridVerts.push(-span, yg, i, span, yg, i);
  }
  const gridArr = new Float32Array(gridVerts);
  const gridBuf = gl.createBuffer();
  const gridVao = gl.createVertexArray();
  gl.bindVertexArray(gridVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
  gl.bufferData(gl.ARRAY_BUFFER, gridArr, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const uProj = gl.getUniformLocation(prog, "uProj");
  const uView = gl.getUniformLocation(prog, "uView");
  const uScale = gl.getUniformLocation(prog, "uPointScale");
  const gProj = gl.getUniformLocation(grid, "uProj");
  const gView = gl.getUniformLocation(grid, "uView");

  function makeView(camAngle: number, camHeight: number): Mat4 {
    const radius = 9.5;
    const eye: Vec3 = [
      Math.sin(camAngle) * radius,
      camHeight,
      Math.cos(camAngle) * radius,
    ];
    const center: Vec3 = [0, 0, 0];
    return lookAt(eye, center, [0, 1, 0]);
  }

  function draw(
    positions: Float32Array,
    hues: Float32Array,
    glows: Float32Array,
    n: number,
    camAngle: number,
    camHeight: number,
    aspect: number,
  ): void {
    gl.clearColor(0.04, 0.05, 0.09, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    const proj = perspective((48 * Math.PI) / 180, aspect, 0.1, 100);
    const view = makeView(camAngle, camHeight);

    // ground grid
    gl.useProgram(grid);
    gl.uniformMatrix4fv(gProj, false, proj);
    gl.uniformMatrix4fv(gView, false, view);
    gl.bindVertexArray(gridVao);
    gl.drawArrays(gl.LINES, 0, gridArr.length / 3);

    // glowing beads — additive blend, no depth write so glow stacks nicely
    gl.useProgram(prog);
    gl.uniformMatrix4fv(uProj, false, proj);
    gl.uniformMatrix4fv(uView, false, view);
    gl.uniform1f(uScale, 1100);

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, hueBuf);
    gl.bufferData(gl.ARRAY_BUFFER, hues, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, glowBuf);
    gl.bufferData(gl.ARRAY_BUFFER, glows, gl.DYNAMIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  function dispose(): void {
    gl.deleteProgram(prog);
    gl.deleteProgram(grid);
    gl.deleteBuffer(posBuf);
    gl.deleteBuffer(hueBuf);
    gl.deleteBuffer(glowBuf);
    gl.deleteBuffer(gridBuf);
    gl.deleteVertexArray(vao);
    gl.deleteVertexArray(gridVao);
  }

  return { draw, dispose };
}
