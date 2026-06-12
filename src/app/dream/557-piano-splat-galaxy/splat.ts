// splat.ts — raw WebGL2 additive Gaussian-splat renderer + CPU particle pool
// for #557 Piano Splat Galaxy.
//
// Each note births a *bloom* of Gaussian splats spawned from a point with
// outward velocities. We integrate the pool on the CPU (pos += vel*dt; vel *=
// drag; + cheap procedural curl-noise) and upload per-instance attributes with
// bufferSubData each frame. The GPU draws one unit quad instanced N times; the
// vertex shader billboards it to face the camera; the fragment shader applies a
// radial Gaussian alpha = exp(-4*r^2). ADDITIVE blending, depth test OFF →
// order-independent, no depth sort, glowing volumetric radiance.
//
// References: Kerbl et al. 2023, "3D Gaussian Splatting for Real-Time Radiance
// Field Rendering" (SIGGRAPH); Refik Anadol's volumetric particle sculptures.
//
// No three.js, no WebGPU, no npm math libs — own mat4 perspective + lookAt.

export const MAX_SPLATS = 13000;

// Per-instance float layout: pos(3) color(3) size(1) alpha(1) = 8 floats.
const STRIDE = 8;

// ─── A spawn request from the audio layer (one musical onset). ────────────────
export interface BloomSpec {
  hue: number; // 0..1
  loudness: number; // 0..1 → count + size
  brightness: number; // 0..1 → tight (bright) vs diffuse (dark)
}

// ─── mat4 helpers (column-major, no deps) ─────────────────────────────────────

function makePerspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function makeLookAt(eye: [number, number, number], center: [number, number, number]): Float32Array {
  const up = [0, 1, 0];
  let zx = eye[0] - center[0];
  let zy = eye[1] - center[1];
  let zz = eye[2] - center[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl;
  zy /= zl;
  zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
  m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
  m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

// ─── hue → rgb ────────────────────────────────────────────────────────────────
function hueToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

// ─── cheap curl-ish noise (deterministic, no deps) ────────────────────────────
function noise3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 1.7 + y * 2.3 + z * 0.9);
  const c = Math.cos(y * 1.3 - z * 2.1 + x * 0.6);
  return s * c;
}

// ─── shaders ──────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;   // unit quad corner in [-1,1]
layout(location=1) in vec3 aPos;       // instance world position
layout(location=2) in vec3 aColor;     // instance color
layout(location=3) in float aSize;     // instance world size
layout(location=4) in float aAlpha;    // instance alpha
uniform mat4 uView;
uniform mat4 uProj;
out vec2 vUv;
out vec3 vColor;
out float vAlpha;
void main() {
  // Billboard: take the camera right/up from the view matrix rows.
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 up    = vec3(uView[0][1], uView[1][1], uView[2][1]);
  vec3 world = aPos + (right * aCorner.x + up * aCorner.y) * aSize;
  gl_Position = uProj * uView * vec4(world, 1.0);
  vUv = aCorner;
  vColor = aColor;
  vAlpha = aAlpha;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vColor;
in float vAlpha;
out vec4 frag;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float g = exp(-4.0 * r2);          // radial Gaussian falloff
  frag = vec4(vColor * g, g * vAlpha);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
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

// ─── renderer ─────────────────────────────────────────────────────────────────

export interface SplatRenderer {
  spawn: (spec: BloomSpec, energy: number) => void;
  frame: (dt: number) => void;
  resize: () => void;
  orbit: (dx: number, dy: number) => void;
  zoom: (factor: number) => void;
  liveCount: () => number;
  dispose: () => void;
}

export function makeRenderer(canvas: HTMLCanvasElement): SplatRenderer | null {
  const glRaw = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!glRaw) return null;
  const gl: WebGL2RenderingContext = glRaw;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const uView = gl.getUniformLocation(prog, "uView");
  const uProj = gl.getUniformLocation(prog, "uProj");

  // Unit quad (two triangles).
  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const quadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Instance buffer (interleaved).
  const instData = new Float32Array(MAX_SPLATS * STRIDE);
  const instBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferData(gl.ARRAY_BUFFER, instData.byteLength, gl.DYNAMIC_DRAW);
  const fb = STRIDE * 4;
  // pos
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, fb, 0);
  gl.vertexAttribDivisor(1, 1);
  // color
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, fb, 12);
  gl.vertexAttribDivisor(2, 1);
  // size
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, fb, 24);
  gl.vertexAttribDivisor(3, 1);
  // alpha
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 1, gl.FLOAT, false, fb, 28);
  gl.vertexAttribDivisor(4, 1);

  gl.bindVertexArray(null);

  // ── CPU particle pool (struct-of-arrays) ──
  const px = new Float32Array(MAX_SPLATS);
  const py = new Float32Array(MAX_SPLATS);
  const pz = new Float32Array(MAX_SPLATS);
  const vx = new Float32Array(MAX_SPLATS);
  const vy = new Float32Array(MAX_SPLATS);
  const vz = new Float32Array(MAX_SPLATS);
  const cr = new Float32Array(MAX_SPLATS);
  const cg = new Float32Array(MAX_SPLATS);
  const cb = new Float32Array(MAX_SPLATS);
  const baseSize = new Float32Array(MAX_SPLATS);
  const life = new Float32Array(MAX_SPLATS); // remaining seconds
  const maxLife = new Float32Array(MAX_SPLATS);
  let head = 0; // recycling ring cursor
  let alive = 0;

  // ── orbit camera state ──
  let yaw = 0.6;
  let pitch = 0.35;
  let dist = 9;
  let autoYaw = 0;

  function spawn(spec: BloomSpec, energy: number) {
    const count = Math.round(80 + spec.loudness * 220);
    // Brightness → tightness: bright onsets make a tight dense core, dark ones
    // a diffuse cloud. Loudness → shell speed + splat size.
    const tightness = 0.4 + spec.brightness * 0.9;
    const speed = (0.6 + spec.loudness * 2.2) / tightness;
    const sizeBase = 0.05 + spec.loudness * 0.16 + (1 - spec.brightness) * 0.06;

    // Spawn origin: drift onto a ring so the galaxy gets arms, not a blob.
    const ringR = 1.2 + Math.random() * 2.6 + energy * 1.5;
    const ringA = (head / MAX_SPLATS) * Math.PI * 2 * 7 + spec.hue * 6.28;
    const ox = Math.cos(ringA) * ringR;
    const oy = (Math.random() - 0.5) * 0.9;
    const oz = Math.sin(ringA) * ringR;

    const [r, g, b] = hueToRgb(spec.hue, 0.7, 1.0);

    for (let n = 0; n < count; n++) {
      const i = head;
      head = (head + 1) % MAX_SPLATS;
      if (alive < MAX_SPLATS) alive++;

      // Outward shell direction (random on sphere, slightly flattened to disk).
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const sq = Math.sqrt(1 - u * u);
      const dx = sq * Math.cos(a);
      const dy = u * 0.4; // flatten toward galactic plane
      const dz = sq * Math.sin(a);
      const sp = speed * (0.5 + Math.random() * 0.8);

      px[i] = ox + dx * 0.1;
      py[i] = oy + dy * 0.1;
      pz[i] = oz + dz * 0.1;
      vx[i] = dx * sp;
      vy[i] = dy * sp;
      vz[i] = dz * sp;
      // colour jitter for nebula richness
      const j = 0.85 + Math.random() * 0.3;
      cr[i] = r * j;
      cg[i] = g * j;
      cb[i] = b * j;
      baseSize[i] = sizeBase * (0.6 + Math.random() * 0.9);
      const ml = 4 + Math.random() * 6 + spec.loudness * 4;
      life[i] = ml;
      maxLife[i] = ml;
    }
  }

  function frame(dt: number) {
    const w = canvas.width;
    const h = canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.015, 0.012, 0.03, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Integrate pool + pack instance data for alive splats.
    autoYaw += dt * 0.05; // slow hands-off auto-rotate
    const drag = Math.pow(0.55, dt);
    let written = 0;
    const t = performance.now() * 0.0002;
    for (let i = 0; i < MAX_SPLATS; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        alive = Math.max(0, alive - 1);
        continue;
      }
      // curl-ish turbulence so the cloud swirls
      const nx = noise3(py[i] * 0.5, pz[i] * 0.5 + t, 0.0);
      const ny = noise3(pz[i] * 0.5, px[i] * 0.5 + t, 1.7);
      const nz = noise3(px[i] * 0.5, py[i] * 0.5 + t, 3.3);
      vx[i] += nx * dt * 0.6;
      vy[i] += ny * dt * 0.3;
      vz[i] += nz * dt * 0.6;
      // gentle differential rotation (galactic shear) about Y
      const r = Math.hypot(px[i], pz[i]) + 0.001;
      const omega = 0.25 / r;
      const ang = omega * dt;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      const nxp = px[i] * cs - pz[i] * sn;
      const nzp = px[i] * sn + pz[i] * cs;
      px[i] = nxp;
      pz[i] = nzp;

      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;
      vx[i] *= drag;
      vy[i] *= drag;
      vz[i] *= drag;

      const lifeFrac = life[i] / maxLife[i];
      // fade in fast, fade out slow (bell-ish)
      const alpha = Math.min(1, lifeFrac * 1.6) * Math.min(1, (1 - lifeFrac) * 6 + 0.15) * 0.5;

      const o = written * STRIDE;
      instData[o] = px[i];
      instData[o + 1] = py[i];
      instData[o + 2] = pz[i];
      instData[o + 3] = cr[i];
      instData[o + 4] = cg[i];
      instData[o + 5] = cb[i];
      instData[o + 6] = baseSize[i] * (0.7 + lifeFrac * 0.6);
      instData[o + 7] = alpha;
      written++;
    }
    alive = written;

    // camera
    const eYaw = yaw + autoYaw;
    const cp = Math.cos(pitch);
    const eye: [number, number, number] = [
      Math.sin(eYaw) * cp * dist,
      Math.sin(pitch) * dist,
      Math.cos(eYaw) * cp * dist,
    ];
    const view = makeLookAt(eye, [0, 0, 0]);
    const proj = makePerspective(1.0, w / Math.max(1, h), 0.1, 200);

    gl.useProgram(prog);
    gl.uniformMatrix4fv(uView, false, view);
    gl.uniformMatrix4fv(uProj, false, proj);

    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instData, 0, written * STRIDE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive
    gl.disable(gl.DEPTH_TEST);

    gl.bindVertexArray(vao);
    if (written > 0) gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, written);
    gl.bindVertexArray(null);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function orbit(dx: number, dy: number) {
    yaw -= dx * 0.005;
    pitch = Math.max(-1.4, Math.min(1.4, pitch + dy * 0.005));
  }

  function zoom(factor: number) {
    dist = Math.max(3, Math.min(40, dist * factor));
  }

  function dispose() {
    gl.deleteBuffer(quadBuf);
    gl.deleteBuffer(instBuf);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(prog);
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  }

  return {
    spawn,
    frame,
    resize,
    orbit,
    zoom,
    liveCount: () => alive,
    dispose,
  };
}
