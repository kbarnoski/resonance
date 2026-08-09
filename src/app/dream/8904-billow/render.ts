// ─────────────────────────────────────────────────────────────────────────────
// render.ts — draws the cloth as a LIT 3D SURFACE.
//   Primary path : WebGPU (triangle mesh, per-vertex normals, diffuse shading).
//   Fallback path: Canvas2D (painter's-algorithm shaded quads, identical camera).
// Both consume the same CPU cloth positions and the same view/projection matrix.
// ─────────────────────────────────────────────────────────────────────────────

import { NX, NY } from "./cloth";

// Warm daylight palette (art strings only; chrome uses semantic tokens).
const LINEN: [number, number, number] = [0.92, 0.86, 0.72]; // parchment front
const INDIGO: [number, number, number] = [0.24, 0.29, 0.5]; // indigo-thread back
const BG: [number, number, number] = [0.075, 0.066, 0.05]; // warm night ground
const LIGHT = norm3([-0.42, 0.78, 0.55]); // upper-left key light

export interface Renderer {
  readonly mode: "webgpu" | "canvas2d";
  render(pos: Float32Array): void;
  resize(cssW: number, cssH: number, dpr: number): void;
  destroy(): void;
}

// ── tiny mat/vec helpers ─────────────────────────────────────────────────────
function norm3(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function mat4Mul(a: Float32Array, b: Float32Array): Float32Array {
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

function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function lookAt(
  eye: [number, number, number],
  ctr: [number, number, number],
  up: [number, number, number],
): Float32Array {
  const z = norm3([eye[0] - ctr[0], eye[1] - ctr[1], eye[2] - ctr[2]]);
  const x = norm3([up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]]);
  const y: [number, number, number] = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const m = new Float32Array(16);
  m[0] = x[0]; m[4] = x[1]; m[8] = x[2]; m[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  m[1] = y[0]; m[5] = y[1]; m[9] = y[2]; m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  m[2] = z[0]; m[6] = z[1]; m[10] = z[2]; m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  m[15] = 1;
  return m;
}

const CTR: [number, number, number] = [0, -0.05, 0];
const FOV = (40 * Math.PI) / 180;
// live eye position — pushed back on narrow (portrait) screens so the whole
// sheet stays framed. Shared by the projection AND the Canvas2D facing test.
let VIEW_EYE: [number, number, number] = [0.05, 0, 3.1];

function makeVP(aspect: number): Float32Array {
  // half-width visible = z*tan(fov/2)*aspect must clear the ~0.95 cloth half-span
  const half = Math.tan(FOV / 2);
  const zFit = Math.max(3.1, 1.0 / (half * Math.max(aspect, 0.35)));
  VIEW_EYE = [0.05, 0, zFit];
  const proj = perspective(FOV, aspect, 0.1, 40);
  const view = lookAt(VIEW_EYE, CTR, [0, 1, 0]);
  return mat4Mul(proj, view);
}

// index buffer (two triangles per quad), cullMode "none" so both faces shade
function buildIndices(): Uint32Array {
  const idx: number[] = [];
  for (let j = 0; j < NY - 1; j++) {
    for (let i = 0; i < NX - 1; i++) {
      const v00 = j * NX + i;
      const v10 = j * NX + i + 1;
      const v01 = (j + 1) * NX + i;
      const v11 = (j + 1) * NX + i + 1;
      idx.push(v00, v01, v11, v00, v11, v10);
    }
  }
  return Uint32Array.from(idx);
}

// per-vertex normals accumulated from adjacent faces (shared by both paths)
function computeNormals(pos: Float32Array, idx: Uint32Array, out: Float32Array): void {
  out.fill(0);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const v of [idx[t], idx[t + 1], idx[t + 2]]) {
      out[v * 3] += nx; out[v * 3 + 1] += ny; out[v * 3 + 2] += nz;
    }
  }
  for (let v = 0; v < out.length; v += 3) {
    const l = Math.hypot(out[v], out[v + 1], out[v + 2]) || 1;
    out[v] /= l; out[v + 1] /= l; out[v + 2] /= l;
  }
}

// ── WebGPU renderer ──────────────────────────────────────────────────────────
const WGSL = /* wgsl */ `
struct U {
  vp: mat4x4<f32>,
  light: vec4<f32>,
  frontCol: vec4<f32>,
  backCol: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: U;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) nrm: vec3<f32>,
};

@vertex
fn vs(@location(0) p: vec3<f32>, @location(1) n: vec3<f32>) -> VSOut {
  var o: VSOut;
  o.clip = u.vp * vec4<f32>(p, 1.0);
  o.nrm = n;
  return o;
}

@fragment
fn fs(in: VSOut, @builtin(front_facing) ff: bool) -> @location(0) vec4<f32> {
  var n = normalize(in.nrm);
  if (!ff) { n = -n; }
  let l = normalize(u.light.xyz);
  let diff = max(dot(n, l), 0.0);
  let amb = 0.28;
  // soft wrap term so the draped folds keep some form in shadow
  let wrap = max(dot(n, l) * 0.5 + 0.5, 0.0) * 0.25;
  let base = select(u.backCol.rgb, u.frontCol.rgb, ff);
  let shade = amb + 0.85 * diff + wrap;
  return vec4<f32>(base * shade, 1.0);
}
`;

async function makeWebGPU(canvas: HTMLCanvasElement): Promise<Renderer | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  let device: GPUDevice;
  let ctx: GPUCanvasContext;
  let format: GPUTextureFormat;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
    const c = canvas.getContext("webgpu");
    if (!c) return null;
    ctx = c;
    format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "opaque" });
  } catch {
    return null;
  }

  const indices = buildIndices();
  const vertData = new Float32Array(NX * NY * 6); // pos.xyz + nrm.xyz interleaved
  const normals = new Float32Array(NX * NY * 3);

  const vbuf = device.createBuffer({
    size: vertData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const ibuf = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(ibuf, 0, indices.buffer as ArrayBuffer, indices.byteOffset, indices.byteLength);

  const ubuf = device.createBuffer({
    size: 16 * 4 + 4 * 4 * 3, // mat4 + 3 vec4
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const shaderMod = device.createShaderModule({ code: WGSL });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shaderMod,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 12, format: "float32x3" },
          ],
        },
      ],
    },
    fragment: { module: shaderMod, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });

  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: ubuf } }],
  });

  let depthTex: GPUTexture | null = null;
  let vp = makeVP(1);

  const uni = new Float32Array(16 + 4 * 3);
  const writeUni = () => {
    uni.set(vp, 0);
    uni[16] = LIGHT[0]; uni[17] = LIGHT[1]; uni[18] = LIGHT[2]; uni[19] = 0;
    uni[20] = LINEN[0]; uni[21] = LINEN[1]; uni[22] = LINEN[2]; uni[23] = 1;
    uni[24] = INDIGO[0]; uni[25] = INDIGO[1]; uni[26] = INDIGO[2]; uni[27] = 1;
    device.queue.writeBuffer(ubuf, 0, uni.buffer as ArrayBuffer, 0, uni.byteLength);
  };

  return {
    mode: "webgpu",
    resize(cssW, cssH, dpr) {
      const w = Math.max(1, Math.floor(cssW * dpr));
      const h = Math.max(1, Math.floor(cssH * dpr));
      canvas.width = w;
      canvas.height = h;
      vp = makeVP(w / h);
      if (depthTex) depthTex.destroy();
      depthTex = device.createTexture({
        size: [w, h],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      writeUni();
    },
    render(pos) {
      if (!depthTex) return;
      computeNormals(pos, indices, normals);
      for (let v = 0; v < NX * NY; v++) {
        vertData[v * 6] = pos[v * 3];
        vertData[v * 6 + 1] = pos[v * 3 + 1];
        vertData[v * 6 + 2] = pos[v * 3 + 2];
        vertData[v * 6 + 3] = normals[v * 3];
        vertData[v * 6 + 4] = normals[v * 3 + 1];
        vertData[v * 6 + 5] = normals[v * 3 + 2];
      }
      device.queue.writeBuffer(vbuf, 0, vertData.buffer as ArrayBuffer, 0, vertData.byteLength);
      writeUni();

      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            clearValue: { r: BG[0], g: BG[1], b: BG[2], a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        depthStencilAttachment: {
          view: depthTex.createView(),
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.setVertexBuffer(0, vbuf);
      pass.setIndexBuffer(ibuf, "uint32");
      pass.drawIndexed(indices.length);
      pass.end();
      device.queue.submit([enc.finish()]);
    },
    destroy() {
      if (depthTex) depthTex.destroy();
      vbuf.destroy();
      ibuf.destroy();
      ubuf.destroy();
      device.destroy();
    },
  };
}

// ── Canvas2D fallback (identical model, painter's-algorithm shaded quads) ─────
function makeCanvas2D(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d")!;
  const indices = buildIndices();
  const normals = new Float32Array(NX * NY * 3);
  let W2 = 1, H2 = 1;
  let vp = makeVP(1);

  const rgb = (c: [number, number, number], s: number) =>
    `rgb(${Math.round(Math.min(255, c[0] * s * 255))},${Math.round(Math.min(255, c[1] * s * 255))},${Math.round(Math.min(255, c[2] * s * 255))})`;

  return {
    mode: "canvas2d",
    resize(cssW, cssH, dpr) {
      W2 = Math.max(1, Math.floor(cssW * dpr));
      H2 = Math.max(1, Math.floor(cssH * dpr));
      canvas.width = W2;
      canvas.height = H2;
      vp = makeVP(W2 / H2);
    },
    render(pos) {
      computeNormals(pos, indices, normals);
      ctx.fillStyle = rgb(BG, 1);
      ctx.fillRect(0, 0, W2, H2);

      // project all vertices once
      const sx = new Float32Array(NX * NY);
      const sy = new Float32Array(NX * NY);
      const sw = new Float32Array(NX * NY);
      for (let v = 0; v < NX * NY; v++) {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
        const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
        const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
        const iw = 1 / (cw || 1e-6);
        sx[v] = (cx * iw * 0.5 + 0.5) * W2;
        sy[v] = (1 - (cy * iw * 0.5 + 0.5)) * H2;
        sw[v] = cw;
      }

      // gather quads with a view-depth key, then paint far → near
      const quads: { d: number; a: number; b: number; c2: number; e: number; shade: number; front: boolean }[] = [];
      const camDir = norm3([VIEW_EYE[0] - CTR[0], VIEW_EYE[1] - CTR[1], VIEW_EYE[2] - CTR[2]]);
      for (let j = 0; j < NY - 1; j++) {
        for (let i = 0; i < NX - 1; i++) {
          const v00 = j * NX + i, v10 = j * NX + i + 1, v01 = (j + 1) * NX + i, v11 = (j + 1) * NX + i + 1;
          if (sw[v00] <= 0 || sw[v11] <= 0) continue;
          // face normal from the quad centre (average of the 4 vertex normals)
          let nx = 0, ny = 0, nz = 0;
          for (const v of [v00, v10, v11, v01]) { nx += normals[v * 3]; ny += normals[v * 3 + 1]; nz += normals[v * 3 + 2]; }
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl; ny /= nl; nz /= nl;
          const front = nx * camDir[0] + ny * camDir[1] + nz * camDir[2] >= 0;
          if (!front) { nx = -nx; ny = -ny; nz = -nz; }
          const diff = Math.max(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], 0);
          const wrap = Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) * 0.5 + 0.5) * 0.25;
          const shade = 0.28 + 0.85 * diff + wrap;
          const d = (sw[v00] + sw[v11] + sw[v10] + sw[v01]) * 0.25;
          quads.push({ d, a: v00, b: v10, c2: v11, e: v01, shade, front });
        }
      }
      quads.sort((p, q) => q.d - p.d); // far first
      for (const qd of quads) {
        const col = qd.front ? LINEN : INDIGO;
        ctx.fillStyle = rgb(col, qd.shade);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx[qd.a], sy[qd.a]);
        ctx.lineTo(sx[qd.b], sy[qd.b]);
        ctx.lineTo(sx[qd.c2], sy[qd.c2]);
        ctx.lineTo(sx[qd.e], sy[qd.e]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke(); // hairline seals cracks between quads
      }
    },
    destroy() {
      /* nothing device-level to release for Canvas2D */
    },
  };
}

export async function makeRenderer(canvas: HTMLCanvasElement): Promise<Renderer> {
  const gpu = await makeWebGPU(canvas);
  if (gpu) return gpu;
  return makeCanvas2D(canvas);
}
