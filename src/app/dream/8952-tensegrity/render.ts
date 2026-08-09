// render.ts — raw WebGL2 renderer for the tensegrity. Hand-written GLSL, no
// three.js. We draw REAL lit 3D geometry: struts as thick shaded steel bars
// (cylinders), node joints as faceted beads, and cables as thin tensioned
// tubes whose thickness AND glow track live tension — wire-white when slack,
// copper/amber when taut. Cool blueprint palette; the amber is the one warm
// accent. Explicitly a coherent 3D STRUCTURE, not a cloud of dots.
//
// A Canvas2D fallback (drawFallback2D) projects the same structure so the piece
// still works with no WebGL2. Both share the same camera math.

import type { World } from "./tensegrity";

const FOV = (45 * Math.PI) / 180;
const NEAR = 0.05;
const FAR = 100;

export interface Camera {
  azimuth: number;
  elevation: number;
  distance: number;
  target: [number, number, number];
}

export interface CamFrame {
  viewProj: Float32Array;
  eye: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
  worldPerPixel: number;
}

// ── minimal mat4 / vec3 (column-major, WebGL convention) ────────────────────
type M4 = Float32Array;

function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function perspective(fovy: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const o = new Float32Array(16);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) * nf;
  o[11] = -1;
  o[14] = 2 * far * near * nf;
  return o;
}

function sub3(a: number[], b: number[]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross3(a: number[], b: number[]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function norm3(a: number[]): [number, number, number] {
  const l = Math.hypot(a[0], a[1], a[2]) || 1e-6;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function lookAt(
  eye: number[],
  target: number[],
  upv: number[],
): { m: M4; right: [number, number, number]; up: [number, number, number] } {
  const z = norm3(sub3(eye, target)); // forward (points from target to eye)
  const x = norm3(cross3(upv, z)); // right
  const y = cross3(z, x); // true up
  const o = new Float32Array(16);
  o[0] = x[0];
  o[4] = x[1];
  o[8] = x[2];
  o[1] = y[0];
  o[5] = y[1];
  o[9] = y[2];
  o[2] = z[0];
  o[6] = z[1];
  o[10] = z[2];
  o[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  o[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  o[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  o[15] = 1;
  return { m: o, right: x, up: y };
}

export function computeFrame(cam: Camera, w: number, h: number): CamFrame {
  const ce = Math.cos(cam.elevation);
  const eye: [number, number, number] = [
    cam.target[0] + cam.distance * ce * Math.cos(cam.azimuth),
    cam.target[1] + cam.distance * Math.sin(cam.elevation),
    cam.target[2] + cam.distance * ce * Math.sin(cam.azimuth),
  ];
  const { m: view, right, up } = lookAt(eye, cam.target, [0, 1, 0]);
  const proj = perspective(FOV, w / Math.max(1, h), NEAR, FAR);
  const viewProj = mul(proj, view);
  const worldPerPixel = (2 * cam.distance * Math.tan(FOV / 2)) / Math.max(1, h);
  return { viewProj, eye, right, up, worldPerPixel };
}

export function worldToScreen(
  p: number[],
  vp: Float32Array,
  w: number,
  h: number,
): { x: number; y: number; depth: number; visible: boolean } {
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
  const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const z = vp[2] * p[0] + vp[6] * p[1] + vp[10] * p[2] + vp[14];
  const wc = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  if (wc <= 0) return { x: 0, y: 0, depth: 1, visible: false };
  return {
    x: (x / wc * 0.5 + 0.5) * w,
    y: (1 - (y / wc * 0.5 + 0.5)) * h,
    depth: z / wc,
    visible: true,
  };
}

// ── geometry builders (world-space; normals baked in) ───────────────────────
type Buf = number[];

function pushVert(
  buf: Buf,
  px: number,
  py: number,
  pz: number,
  nx: number,
  ny: number,
  nz: number,
  cr: number,
  cg: number,
  cb: number,
  emis: number,
): void {
  buf.push(px, py, pz, nx, ny, nz, cr, cg, cb, emis);
}

function pushTube(
  buf: Buf,
  a: number[],
  b: number[],
  radius: number,
  sides: number,
  col: [number, number, number],
  emis: number,
): void {
  const axis = norm3(sub3(b, a));
  const ref: number[] =
    Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm3(cross3(ref, axis));
  const v = cross3(axis, u);
  for (let i = 0; i < sides; i++) {
    const t0 = (i / sides) * Math.PI * 2;
    const t1 = ((i + 1) / sides) * Math.PI * 2;
    const c0 = Math.cos(t0);
    const s0 = Math.sin(t0);
    const c1 = Math.cos(t1);
    const s1 = Math.sin(t1);
    const n0: [number, number, number] = [
      u[0] * c0 + v[0] * s0,
      u[1] * c0 + v[1] * s0,
      u[2] * c0 + v[2] * s0,
    ];
    const n1: [number, number, number] = [
      u[0] * c1 + v[0] * s1,
      u[1] * c1 + v[1] * s1,
      u[2] * c1 + v[2] * s1,
    ];
    const a0 = [a[0] + n0[0] * radius, a[1] + n0[1] * radius, a[2] + n0[2] * radius];
    const a1 = [a[0] + n1[0] * radius, a[1] + n1[1] * radius, a[2] + n1[2] * radius];
    const b0 = [b[0] + n0[0] * radius, b[1] + n0[1] * radius, b[2] + n0[2] * radius];
    const b1 = [b[0] + n1[0] * radius, b[1] + n1[1] * radius, b[2] + n1[2] * radius];
    // two triangles
    pushVert(buf, a0[0], a0[1], a0[2], n0[0], n0[1], n0[2], col[0], col[1], col[2], emis);
    pushVert(buf, b0[0], b0[1], b0[2], n0[0], n0[1], n0[2], col[0], col[1], col[2], emis);
    pushVert(buf, a1[0], a1[1], a1[2], n1[0], n1[1], n1[2], col[0], col[1], col[2], emis);
    pushVert(buf, a1[0], a1[1], a1[2], n1[0], n1[1], n1[2], col[0], col[1], col[2], emis);
    pushVert(buf, b0[0], b0[1], b0[2], n0[0], n0[1], n0[2], col[0], col[1], col[2], emis);
    pushVert(buf, b1[0], b1[1], b1[2], n1[0], n1[1], n1[2], col[0], col[1], col[2], emis);
  }
}

function pushOcta(
  buf: Buf,
  c: number[],
  r: number,
  col: [number, number, number],
  emis: number,
): void {
  const px = [r, 0, 0];
  const nx = [-r, 0, 0];
  const py = [0, r, 0];
  const ny = [0, -r, 0];
  const pz = [0, 0, r];
  const nz = [0, 0, -r];
  const faces = [
    [px, pz, py],
    [pz, nx, py],
    [nx, nz, py],
    [nz, px, py],
    [pz, px, ny],
    [nx, pz, ny],
    [nz, nx, ny],
    [px, nz, ny],
  ];
  for (const f of faces) {
    const e1 = sub3(f[1], f[0]);
    const e2 = sub3(f[2], f[0]);
    const n = norm3(cross3(e1, e2));
    for (const p of f) {
      pushVert(buf, c[0] + p[0], c[1] + p[1], c[2] + p[2], n[0], n[1], n[2], col[0], col[1], col[2], emis);
    }
  }
}

// ── palette (art layer — raw values allowed here) ───────────────────────────
const STEEL: [number, number, number] = [0.5, 0.56, 0.66];
const WIRE: [number, number, number] = [0.62, 0.72, 0.86];
const AMBER: [number, number, number] = [1.0, 0.62, 0.28];
const NODE_COOL: [number, number, number] = [0.55, 0.68, 0.85];
const NODE_HOT: [number, number, number] = [1.0, 0.66, 0.32];

function mixc(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export interface DrawState {
  hover: number; // node index or -1
  drag: number; // node index or -1
}

// ── GLSL ────────────────────────────────────────────────────────────────────
const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec3 a_col;
layout(location=3) in float a_emis;
uniform mat4 u_viewProj;
out vec3 v_nrm;
out vec3 v_pos;
out vec3 v_col;
out float v_emis;
void main(){
  v_nrm = a_nrm;
  v_pos = a_pos;
  v_col = a_col;
  v_emis = a_emis;
  gl_Position = u_viewProj * vec4(a_pos, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 v_nrm;
in vec3 v_pos;
in vec3 v_col;
in float v_emis;
uniform vec3 u_eye;
uniform vec3 u_light;
out vec4 outColor;
void main(){
  vec3 N = normalize(v_nrm);
  vec3 L = normalize(u_light);
  vec3 V = normalize(u_eye - v_pos);
  float diff = max(dot(N, L), 0.0);
  // steel: soft key + cool fill + rim
  float fill = max(dot(N, vec3(-0.4, 0.2, -0.6)), 0.0) * 0.35;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5) * 0.6;
  vec3 spec = vec3(1.0) * pow(max(dot(reflect(-L, N), V), 0.0), 24.0) * 0.5;
  vec3 base = v_col * (0.18 + 0.85 * diff + fill) + spec;
  vec3 col = base + v_col * v_emis * 1.6 + vec3(0.02,0.04,0.07);
  col += rim * vec3(0.45,0.6,0.85);
  outColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export interface GLRenderer {
  render: (world: World, frame: CamFrame, st: DrawState, w: number, h: number, dpr: number) => void;
  dispose: () => void;
}

export function createGLRenderer(canvas: HTMLCanvasElement): GLRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("link:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const uViewProj = gl.getUniformLocation(prog, "u_viewProj");
  const uEye = gl.getUniformLocation(prog, "u_eye");
  const uLight = gl.getUniformLocation(prog, "u_light");

  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const STRIDE = 10 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE, 3 * 4);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, STRIDE, 6 * 4);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE, 9 * 4);
  gl.bindVertexArray(null);

  const cableBuf = gl.createBuffer();
  const cableVao = gl.createVertexArray();
  gl.bindVertexArray(cableVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cableBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE, 3 * 4);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, STRIDE, 6 * 4);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE, 9 * 4);
  gl.bindVertexArray(null);

  const render = (
    world: World,
    frame: CamFrame,
    st: DrawState,
    w: number,
    h: number,
    dpr: number,
  ) => {
    const pw = Math.max(1, Math.floor(w * dpr));
    const ph = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    gl.viewport(0, 0, pw, ph);
    gl.clearColor(0.02, 0.03, 0.05, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(prog);
    gl.uniformMatrix4fv(uViewProj, false, frame.viewProj);
    gl.uniform3fv(uEye, frame.eye);
    gl.uniform3f(uLight, 0.4, 0.85, 0.35);

    // ── opaque pass: struts + node beads ──
    const opaque: Buf = [];
    for (const bi of world.struts) {
      const bar = world.bars[bi];
      const a = world.nodes[bar.a];
      const b = world.nodes[bar.b];
      pushTube(opaque, [a.x, a.y, a.z], [b.x, b.y, b.z], 0.055, 7, STEEL, 0.05);
    }
    for (let i = 0; i < world.nodes.length; i++) {
      const n = world.nodes[i];
      const hot = i === st.drag ? 1 : i === st.hover ? 0.6 : 0;
      const col = mixc(NODE_COOL, NODE_HOT, hot);
      const r = n.pinned ? 0.05 : 0.075 + hot * 0.02;
      pushOcta(opaque, [n.x, n.y, n.z], r, col, 0.15 + hot * 0.7);
    }
    const oArr = new Float32Array(opaque);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, oArr, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, oArr.length / 10);

    // ── additive pass: glowing tension cables ──
    const cable: Buf = [];
    for (const bi of world.cables) {
      const bar = world.bars[bi];
      const a = world.nodes[bar.a];
      const b = world.nodes[bar.b];
      const tn = Math.min(1, bar.tension / world.maxTension);
      const col = mixc(WIRE, AMBER, tn * tn);
      const radius = 0.012 + tn * 0.03;
      const emis = 0.4 + tn * 1.6;
      pushTube(cable, [a.x, a.y, a.z], [b.x, b.y, b.z], radius, 5, col, emis);
    }
    const cArr = new Float32Array(cable);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.bindVertexArray(cableVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, cableBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cArr, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, cArr.length / 10);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  };

  const dispose = () => {
    gl.deleteBuffer(buf);
    gl.deleteBuffer(cableBuf);
    gl.deleteVertexArray(vao);
    gl.deleteVertexArray(cableVao);
    gl.deleteProgram(prog);
  };

  return { render, dispose };
}

// ── Canvas2D fallback ───────────────────────────────────────────────────────
export function drawFallback2D(
  ctx: CanvasRenderingContext2D,
  world: World,
  frame: CamFrame,
  w: number,
  h: number,
  st: DrawState,
): void {
  ctx.fillStyle = "rgb(5,8,13)";
  ctx.fillRect(0, 0, w, h);

  const pts = world.nodes.map((n) =>
    worldToScreen([n.x, n.y, n.z], frame.viewProj, w, h),
  );

  // cables sorted back-to-front by mid depth
  const cableDraw = world.cables
    .map((bi) => {
      const bar = world.bars[bi];
      const pa = pts[bar.a];
      const pb = pts[bar.b];
      const tn = Math.min(1, bar.tension / world.maxTension);
      return { pa, pb, tn, depth: (pa.depth + pb.depth) / 2 };
    })
    .sort((x, y) => y.depth - x.depth);

  for (const c of cableDraw) {
    if (!c.pa.visible || !c.pb.visible) continue;
    const t = c.tn * c.tn;
    const r = Math.round(158 + t * 97);
    const g = Math.round(184 - t * 26);
    const b = Math.round(220 - t * 148);
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.35 + t * 0.6})`;
    ctx.lineWidth = 1 + t * 4;
    ctx.beginPath();
    ctx.moveTo(c.pa.x, c.pa.y);
    ctx.lineTo(c.pb.x, c.pb.y);
    ctx.stroke();
  }

  // struts
  for (const bi of world.struts) {
    const bar = world.bars[bi];
    const pa = pts[bar.a];
    const pb = pts[bar.b];
    if (!pa.visible || !pb.visible) continue;
    ctx.strokeStyle = "rgb(150,168,196)";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  // nodes
  for (let i = 0; i < world.nodes.length; i++) {
    const p = pts[i];
    if (!p.visible) continue;
    const hot = i === st.drag ? 1 : i === st.hover ? 0.6 : 0;
    ctx.fillStyle = hot > 0 ? "rgb(255,168,82)" : "rgb(150,190,225)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, world.nodes[i].pinned ? 4 : 6 + hot * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
