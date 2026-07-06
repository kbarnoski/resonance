// ─────────────────────────────────────────────────────────────────────────────
// splat-gl.ts — TRUE 3D Gaussian splat rasterization on WebGL2 (EWA splatting).
//
// Each anisotropic 3D Gaussian carries a full 3×3 covariance Σ. Per frame, in
// the vertex shader we project Σ to a 2D screen conic via the Jacobian of the
// perspective projection (T = Wᵀ·J ; Σ2d = Tᵀ·Σ·T), find the ellipse axes from
// its eigenvalues, and emit a camera-facing quad. The fragment shader evaluates
// the projected Gaussian falloff exp(−‖d‖²)·opacity. Splats are depth-sorted
// back-to-front on the CPU and composited with premultiplied "over" alpha.
//
// Refs: Kerbl et al., "3D Gaussian Splatting for Real-Time Radiance Field
// Rendering", SIGGRAPH 2023; WebSplatter (arXiv 2602.03207, Feb 2026) for the
// browser-side projected-conic formulation used here.
// ─────────────────────────────────────────────────────────────────────────────

import { Mat4, viewZ } from "./mat";
import { Scene } from "./scene";

const STRIDE = 14; // floats per instance

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aQuad;      // corner in {-2,2}
layout(location=1) in vec3 aCenter;
layout(location=2) in vec3 aCov0;      // Sigma 00,01,02
layout(location=3) in vec3 aCov1;      // Sigma 11,12,22
layout(location=4) in vec3 aColor;
layout(location=5) in float aOpacity;
layout(location=6) in float aCluster;

uniform mat4 uView;
uniform mat4 uProj;
uniform vec2 uFocal;    // fx, fy (px)
uniform vec2 uViewport; // W,H (px)
uniform float uFlash[8];

out vec4 vColor;
out vec2 vPos;

void main() {
  vec4 cam = uView * vec4(aCenter, 1.0);
  vec4 clip = uProj * cam;
  float lim = 1.3 * clip.w;
  if (clip.w <= 0.0 || clip.z < -lim ||
      clip.x < -lim || clip.x > lim || clip.y < -lim || clip.y > lim) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0); // cull off-screen
    return;
  }

  mat3 Vrk = mat3(
    aCov0.x, aCov0.y, aCov0.z,
    aCov0.y, aCov1.x, aCov1.y,
    aCov0.z, aCov1.y, aCov1.z
  );

  // Jacobian of the perspective projection at the splat centre
  mat3 J = mat3(
    uFocal.x / cam.z, 0.0, -(uFocal.x * cam.x) / (cam.z * cam.z),
    0.0, -uFocal.y / cam.z, (uFocal.y * cam.y) / (cam.z * cam.z),
    0.0, 0.0, 0.0
  );
  mat3 W = transpose(mat3(uView));
  mat3 T = W * J;
  mat3 cov2d = transpose(T) * Vrk * T;

  // low-pass dilation: keep sub-pixel splats resolvable
  cov2d[0][0] += 0.3;
  cov2d[1][1] += 0.3;

  float mid = 0.5 * (cov2d[0][0] + cov2d[1][1]);
  float rad = length(vec2(0.5 * (cov2d[0][0] - cov2d[1][1]), cov2d[0][1]));
  float l1 = mid + rad;
  float l2 = mid - rad;
  if (l2 < 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }

  vec2 axis1 = normalize(vec2(cov2d[0][1], l1 - cov2d[0][0]));
  vec2 major = min(sqrt(2.0 * l1), 1024.0) * axis1;
  vec2 minor = min(sqrt(2.0 * l2), 1024.0) * vec2(axis1.y, -axis1.x);

  int ci = int(aCluster + 0.5);
  float flash = uFlash[ci];

  vColor = vec4(aColor * (1.0 + flash * 1.6), clamp(aOpacity * (1.0 + flash * 0.5), 0.0, 1.0));
  vPos = aQuad;

  vec2 center = clip.xy / clip.w;
  gl_Position = vec4(
    center + aQuad.x * major / uViewport + aQuad.y * minor / uViewport,
    0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vPos;
out vec4 frag;
void main() {
  float A = -dot(vPos, vPos);
  if (A < -4.0) discard;              // outside 2-sigma ellipse
  float a = exp(A) * vColor.a;        // projected Gaussian falloff
  frag = vec4(vColor.rgb * a, a);     // premultiplied for "over" blending
}`;

const BG_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const BG_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform float uShimmer;
void main() {
  // photographic light-box: soft neutral studio-gray sweep, brighter upper-centre
  float base = mix(0.15, 0.33, smoothstep(0.0, 1.0, vUv.y));
  vec2 c = vUv - vec2(0.5, 0.62);
  c.x *= 1.3;
  float hot = smoothstep(0.9, 0.0, length(c)) * 0.11;
  float lum = base + hot + uShimmer;
  vec3 col = vec3(lum) * vec3(0.985, 1.0, 1.035); // faint cool-neutral vitrine tint
  frag = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error("createProgram failed");
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error("program link: " + log);
  }
  return prog;
}

export class SplatRenderer {
  private gl: WebGL2RenderingContext;
  private scene: Scene;
  private prog: WebGLProgram;
  private bgProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private bgVao: WebGLVertexArrayObject;
  private quadBuf: WebGLBuffer;
  private instBuf: WebGLBuffer;
  private bgBuf: WebGLBuffer;

  private order: Uint32Array;
  private depths: Float32Array;
  private scratch: Float32Array;

  private uView: WebGLUniformLocation | null;
  private uProj: WebGLUniformLocation | null;
  private uFocal: WebGLUniformLocation | null;
  private uViewport: WebGLUniformLocation | null;
  private uFlash: WebGLUniformLocation | null;
  private uShimmer: WebGLUniformLocation | null;

  private lastSort = 0;
  private lastKey = Number.NaN;
  lost = false;

  constructor(gl: WebGL2RenderingContext, scene: Scene) {
    this.gl = gl;
    this.scene = scene;
    this.prog = link(gl, VERT, FRAG);
    this.bgProg = link(gl, BG_VERT, BG_FRAG);

    this.uView = gl.getUniformLocation(this.prog, "uView");
    this.uProj = gl.getUniformLocation(this.prog, "uProj");
    this.uFocal = gl.getUniformLocation(this.prog, "uFocal");
    this.uViewport = gl.getUniformLocation(this.prog, "uViewport");
    this.uFlash = gl.getUniformLocation(this.prog, "uFlash");
    this.uShimmer = gl.getUniformLocation(this.bgProg, "uShimmer");

    const n = scene.count;
    this.order = new Uint32Array(n);
    for (let i = 0; i < n; i++) this.order[i] = i;
    this.depths = new Float32Array(n);
    this.scratch = new Float32Array(n * STRIDE);

    // quad corners at ±2 std (triangle strip)
    const quad = new Float32Array([-2, -2, 2, -2, -2, 2, 2, 2]);
    this.quadBuf = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    this.instBuf = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.scratch.byteLength, gl.DYNAMIC_DRAW);

    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const sb = STRIDE * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    const setInst = (loc: number, size: number, off: number) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, sb, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    setInst(1, 3, 0); // center
    setInst(2, 3, 3); // cov0
    setInst(3, 3, 6); // cov1
    setInst(4, 3, 9); // color
    setInst(5, 1, 12); // opacity
    setInst(6, 1, 13); // cluster
    gl.bindVertexArray(null);

    // fullscreen background triangle
    this.bgBuf = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bgBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.bgVao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(this.bgVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** Depth-sort back-to-front and re-upload the interleaved instance buffer. */
  private sortAndUpload(view: Mat4) {
    const { positions, cov, colors, opacity, clusterId, count } = this.scene;
    const d = this.depths;
    for (let i = 0; i < count; i++) {
      d[i] = viewZ(view, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    }
    // ascending view-z: most negative (farthest, -z forward) first = back-to-front
    const ord = this.order;
    ord.sort((a, b) => d[a] - d[b]);

    const s = this.scratch;
    for (let i = 0; i < count; i++) {
      const src = ord[i];
      const o = i * STRIDE;
      s[o] = positions[src * 3];
      s[o + 1] = positions[src * 3 + 1];
      s[o + 2] = positions[src * 3 + 2];
      s[o + 3] = cov[src * 6];
      s[o + 4] = cov[src * 6 + 1];
      s[o + 5] = cov[src * 6 + 2];
      s[o + 6] = cov[src * 6 + 3];
      s[o + 7] = cov[src * 6 + 4];
      s[o + 8] = cov[src * 6 + 5];
      s[o + 9] = colors[src * 3];
      s[o + 10] = colors[src * 3 + 1];
      s[o + 11] = colors[src * 3 + 2];
      s[o + 12] = opacity[src];
      s[o + 13] = clusterId[src];
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, s);
  }

  /**
   * Draw one frame.
   * @param view column-major view matrix
   * @param proj column-major projection matrix
   * @param focalPx [fx, fy] in device pixels
   * @param flash per-cluster strike-flash (length ≤ 8)
   * @param shimmer tiny idle luminance drift for the backdrop
   * @param now performance.now() ms
   */
  frame(
    view: Mat4,
    proj: Mat4,
    focalPx: [number, number],
    flash: Float32Array,
    shimmer: number,
    now: number,
  ) {
    if (this.lost) return;
    const gl = this.gl;
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    gl.viewport(0, 0, W, H);

    // re-sort when the camera moved and enough time passed (coarse ordering ok)
    const key = view[2] + view[6] * 2 + view[10] * 3 + view[12] * 5 + view[14] * 7;
    const moved = Number.isNaN(this.lastKey) || Math.abs(key - this.lastKey) > 1e-4;
    if (moved && now - this.lastSort > 80) {
      this.sortAndUpload(view);
      this.lastSort = now;
      this.lastKey = key;
    }

    // ── background (opaque, no blend) ──
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.bgProg);
    gl.uniform1f(this.uShimmer, shimmer);
    gl.bindVertexArray(this.bgVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ── splats (premultiplied "over", back-to-front) ──
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uView, false, view);
    gl.uniformMatrix4fv(this.uProj, false, proj);
    gl.uniform2f(this.uFocal, focalPx[0], focalPx[1]);
    gl.uniform2f(this.uViewport, W, H);
    if (this.uFlash) gl.uniform1fv(this.uFlash, flash);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.scene.count);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    try {
      gl.deleteBuffer(this.quadBuf);
      gl.deleteBuffer(this.instBuf);
      gl.deleteBuffer(this.bgBuf);
      gl.deleteVertexArray(this.vao);
      gl.deleteVertexArray(this.bgVao);
      gl.deleteProgram(this.prog);
      gl.deleteProgram(this.bgProg);
    } catch {
      // context may already be gone
    }
  }
}
