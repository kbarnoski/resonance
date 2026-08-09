// gl.ts — raw WebGL2 renderer for the room-mode instrument.
//
// No three.js, no external 3D lib. We hand-roll a 4x4 matrix stack, a
// perspective camera that orbits the room, and one vertex/fragment shader
// pair. The scene is REAL 3D geometry drawn in perspective:
//
//   • the room as a wireframe box (12 edges);
//   • the mode's flat nodal planes as translucent, additively-blended cyan
//     sheets slicing through the room;
//   • a voxel field of solid, face-shaded cubes at the sampling grid whose
//     size + brightness track |pressure| (the antinodes bloom into blocks).
//
// Everything is rebuilt on the CPU whenever the mode / dimensions change and
// uploaded once; per frame we only push the camera matrix.

import {
  type Dims,
  type Mode,
  nodalPositions,
  pressureNorm,
} from "./modes";

// ---------------------------------------------------------------------------
// tiny column-major mat4 helpers
// ---------------------------------------------------------------------------

export type Mat4 = Float32Array;

export function mat4Perspective(
  fovyRad: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function normalize3(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross3(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function mat4LookAt(
  eye: [number, number, number],
  center: [number, number, number],
  up: [number, number, number],
): Mat4 {
  const z = normalize3([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  const m = new Float32Array(16);
  m[0] = x[0]; m[1] = y[0]; m[2] = z[0]; m[3] = 0;
  m[4] = x[1]; m[5] = y[1]; m[6] = z[1]; m[7] = 0;
  m[8] = x[2]; m[9] = y[2]; m[10] = z[2]; m[11] = 0;
  m[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  m[15] = 1;
  return m;
}

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[r + 4] * b[c * 4 + 1] +
        a[r + 8] * b[c * 4 + 2] +
        a[r + 12] * b[c * 4 + 3];
    }
  }
  return o;
}

/** Eye position from orbit angles (azimuth, elevation, radius). */
export function orbitEye(
  az: number,
  el: number,
  radius: number,
): [number, number, number] {
  const ce = Math.cos(el);
  return [
    radius * ce * Math.sin(az),
    radius * Math.sin(el),
    radius * ce * Math.cos(az),
  ];
}

// ---------------------------------------------------------------------------
// shaders — vertex format: aPos(vec3) aNormal(vec3) aColor(vec4)
// ---------------------------------------------------------------------------

const VERT_SRC = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aColor;
uniform mat4 uMVP;
uniform float uLit;
uniform vec3 uLightDir;
out vec4 vColor;
void main(){
  vec3 rgb = aColor.rgb;
  if (uLit > 0.5) {
    float d = max(dot(normalize(aNormal), uLightDir), 0.0);
    rgb *= 0.42 + 0.58 * d;
  }
  vColor = vec4(rgb, aColor.a);
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outColor;
void main(){ outColor = vColor; }`;

// ---------------------------------------------------------------------------
// rig
// ---------------------------------------------------------------------------

interface Group {
  buffer: WebGLBuffer;
  count: number; // vertex count
}

export interface Rig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uMVP: WebGLUniformLocation | null;
  uLit: WebGLUniformLocation | null;
  uLightDir: WebGLUniformLocation | null;
  cubes: Group;
  planes: Group;
  edges: Group;
}

const STRIDE = 10 * 4; // 10 floats/vertex

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("shader compile:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function makeRig(canvas: HTMLCanvasElement): Rig | null {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("link:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const mk = (): Group => ({ buffer: gl.createBuffer(), count: 0 });
  return {
    gl,
    program,
    uMVP: gl.getUniformLocation(program, "uMVP"),
    uLit: gl.getUniformLocation(program, "uLit"),
    uLightDir: gl.getUniformLocation(program, "uLightDir"),
    cubes: mk(),
    planes: mk(),
    edges: mk(),
  };
}

// ---------------------------------------------------------------------------
// geometry building
// ---------------------------------------------------------------------------

/** Half-extents of the drawn box; largest room dimension maps to 0.9. */
function halfExtents(d: Dims): [number, number, number] {
  const maxD = Math.max(d.lx, d.ly, d.lz);
  const s = 0.9 / maxD;
  return [d.lx * s, d.ly * s, d.lz * s];
}

// unit-cube face definitions: 6 faces, each 2 triangles, with outward normal
const CUBE_FACES: { n: [number, number, number]; v: [number, number, number][] }[] = [
  { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, -1, -1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
];

export interface SceneOpts {
  mode: Mode;
  dims: Dims;
  emphasis: number; // 0=x, 1=y, 2=z axis emphasized
  resolution: number; // voxel grid per axis
}

/** Build + upload all geometry for the current mode. */
export function buildScene(rig: Rig, o: SceneOpts): void {
  const { gl } = rig;
  const [hx, hy, hz] = halfExtents(o.dims);
  const R = o.resolution;

  // ---- voxel cubes (solid, lit) --------------------------------------
  const cube: number[] = [];
  const sx = ((2 * hx) / R) * 0.5;
  const sy = ((2 * hy) / R) * 0.5;
  const sz = ((2 * hz) / R) * 0.5;
  for (let i = 0; i < R; i++) {
    const u = (i + 0.5) / R;
    const cx = (u - 0.5) * 2 * hx;
    for (let j = 0; j < R; j++) {
      const v = (j + 0.5) / R;
      const cy = (v - 0.5) * 2 * hy;
      for (let k = 0; k < R; k++) {
        const w = (k + 0.5) / R;
        const p = pressureNorm(o.mode, u, v, w);
        const a = Math.abs(p);
        if (a < 0.08) continue;
        const cz = (w - 0.5) * 2 * hz;
        const grow = 0.3 + 0.62 * a;
        const bright = 0.34 + 0.66 * a;
        // positive pressure -> bright cyan, negative -> deep teal
        let r: number, g: number, b: number;
        if (p >= 0) {
          r = 0.36 * bright; g = 0.92 * bright; b = 1.0 * bright;
        } else {
          r = 0.05 * bright; g = 0.5 * bright; b = 0.86 * bright;
        }
        for (const face of CUBE_FACES) {
          for (const vert of face.v) {
            cube.push(
              cx + vert[0] * sx * grow,
              cy + vert[1] * sy * grow,
              cz + vert[2] * sz * grow,
              face.n[0], face.n[1], face.n[2],
              r, g, b, 1,
            );
          }
        }
      }
    }
  }
  uploadGroup(gl, rig.cubes, cube);

  // ---- nodal planes (translucent, additive) --------------------------
  const plane: number[] = [];
  const inset = 0.985;
  const pushQuad = (
    corners: [number, number, number][],
    col: [number, number, number, number],
  ) => {
    const order = [0, 1, 2, 0, 2, 3];
    for (const idx of order) {
      const c = corners[idx];
      plane.push(c[0], c[1], c[2], 0, 0, 0, col[0], col[1], col[2], col[3]);
    }
  };
  const baseA = 0.12;
  const emphA = 0.28;
  // planes perpendicular to X
  for (const t of nodalPositions(o.mode.nx)) {
    const x = (t - 0.5) * 2 * hx;
    const a = o.emphasis === 0 ? emphA : baseA;
    pushQuad(
      [
        [x, -hy * inset, -hz * inset],
        [x, hy * inset, -hz * inset],
        [x, hy * inset, hz * inset],
        [x, -hy * inset, hz * inset],
      ],
      [0.45, 0.95, 1.0, a],
    );
  }
  for (const t of nodalPositions(o.mode.ny)) {
    const y = (t - 0.5) * 2 * hy;
    const a = o.emphasis === 1 ? emphA : baseA;
    pushQuad(
      [
        [-hx * inset, y, -hz * inset],
        [hx * inset, y, -hz * inset],
        [hx * inset, y, hz * inset],
        [-hx * inset, y, hz * inset],
      ],
      [0.3, 0.85, 1.0, a],
    );
  }
  for (const t of nodalPositions(o.mode.nz)) {
    const z = (t - 0.5) * 2 * hz;
    const a = o.emphasis === 2 ? emphA : baseA;
    pushQuad(
      [
        [-hx * inset, -hy * inset, z],
        [hx * inset, -hy * inset, z],
        [hx * inset, hy * inset, z],
        [-hx * inset, hy * inset, z],
      ],
      [0.55, 0.9, 0.95, a],
    );
  }
  uploadGroup(gl, rig.planes, plane);

  // ---- room wireframe box (lines) ------------------------------------
  const edge: number[] = [];
  const c: [number, number, number, number] = [0.5, 0.85, 0.95, 0.9];
  const corner = (i: number, j: number, k: number): [number, number, number] => [
    i * hx, j * hy, k * hz,
  ];
  const edgesIdx: [number, number, number, number, number, number][] = [
    // bottom rectangle (y=-)
    [-1, -1, -1, 1, -1, -1], [1, -1, -1, 1, -1, 1], [1, -1, 1, -1, -1, 1], [-1, -1, 1, -1, -1, -1],
    // top rectangle (y=+)
    [-1, 1, -1, 1, 1, -1], [1, 1, -1, 1, 1, 1], [1, 1, 1, -1, 1, 1], [-1, 1, 1, -1, 1, -1],
    // verticals
    [-1, -1, -1, -1, 1, -1], [1, -1, -1, 1, 1, -1], [1, -1, 1, 1, 1, 1], [-1, -1, 1, -1, 1, 1],
  ];
  for (const e of edgesIdx) {
    const a = corner(e[0], e[1], e[2]);
    const b = corner(e[3], e[4], e[5]);
    edge.push(a[0], a[1], a[2], 0, 0, 0, c[0], c[1], c[2], c[3]);
    edge.push(b[0], b[1], b[2], 0, 0, 0, c[0], c[1], c[2], c[3]);
  }
  uploadGroup(gl, rig.edges, edge);
}

function uploadGroup(
  gl: WebGL2RenderingContext,
  group: Group,
  data: number[],
): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
  group.count = data.length / 10;
}

function bindAttribs(gl: WebGL2RenderingContext, group: Group): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE, 24);
}

// ---------------------------------------------------------------------------
// per-frame draw
// ---------------------------------------------------------------------------

export function drawScene(rig: Rig, mvp: Mat4): void {
  const { gl } = rig;
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0.016, 0.03, 0.05, 1); // deep ink
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(rig.program);
  gl.uniformMatrix4fv(rig.uMVP, false, mvp);
  const ld = normalize3([0.45, 0.8, 0.55]);
  gl.uniform3f(rig.uLightDir, ld[0], ld[1], ld[2]);
  gl.disable(gl.CULL_FACE);

  // 1) solid voxel cubes — opaque, depth write on
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.uniform1f(rig.uLit, 1);
  if (rig.cubes.count > 0) {
    bindAttribs(gl, rig.cubes);
    gl.drawArrays(gl.TRIANGLES, 0, rig.cubes.count);
  }

  // 2) nodal planes — additive glow, depth-tested but no depth write
  gl.uniform1f(rig.uLit, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.depthMask(false);
  if (rig.planes.count > 0) {
    bindAttribs(gl, rig.planes);
    gl.drawArrays(gl.TRIANGLES, 0, rig.planes.count);
  }

  // 3) room wireframe — additive lines
  if (rig.edges.count > 0) {
    bindAttribs(gl, rig.edges);
    gl.drawArrays(gl.LINES, 0, rig.edges.count);
  }
  gl.depthMask(true);
}

export function disposeRig(rig: Rig): void {
  const { gl } = rig;
  gl.deleteBuffer(rig.cubes.buffer);
  gl.deleteBuffer(rig.planes.buffer);
  gl.deleteBuffer(rig.edges.buffer);
  gl.deleteProgram(rig.program);
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}

// ---------------------------------------------------------------------------
// Canvas2D fallback — a single nodal-plane cross-section (z = mid)
// ---------------------------------------------------------------------------

export function drawCrossSection2D(
  ctx: CanvasRenderingContext2D,
  mode: Mode,
  w: number,
  h: number,
): void {
  ctx.fillStyle = "#04080d";
  ctx.fillRect(0, 0, w, h);
  const N = 90;
  const cw = w / N;
  const ch = h / N;
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;
    for (let j = 0; j < N; j++) {
      const v = (j + 0.5) / N;
      const p = pressureNorm(mode, u, v, 0.5);
      const a = Math.abs(p);
      if (p >= 0) {
        ctx.fillStyle = `rgba(90,230,255,${(a * 0.9).toFixed(3)})`;
      } else {
        ctx.fillStyle = `rgba(20,120,220,${(a * 0.9).toFixed(3)})`;
      }
      ctx.fillRect(i * cw, j * ch, cw + 1, ch + 1);
    }
  }
  // nodal lines
  ctx.strokeStyle = "rgba(150,240,255,0.85)";
  ctx.lineWidth = 1.5;
  for (const t of nodalPositions(mode.nx)) {
    ctx.beginPath();
    ctx.moveTo(t * w, 0);
    ctx.lineTo(t * w, h);
    ctx.stroke();
  }
  for (const t of nodalPositions(mode.ny)) {
    ctx.beginPath();
    ctx.moveTo(0, t * h);
    ctx.lineTo(w, t * h);
    ctx.stroke();
  }
}
