// ════════════════════════════════════════════════════════════════════════════
// render.ts — FibrationRenderer.
//
// WebGL2 draws the Hopf fibres as glowing additive LINE_LOOPs. The 4D rotation
// (two unit quaternions qL, qR) and the stereographic projection S³→R³ happen in
// the VERTEX SHADER, so the CPU only uploads a static S³ point cloud once and
// then hands the GPU two quaternions + a view-projection matrix per frame. A
// first full-screen pass paints the chromatic-chiaroscuro void (deep indigo /
// graphite field, luminous violet centre, exponential tunnel toward the light);
// the fibres bloom additively over it. Colour is by base-sphere latitude, into a
// ruby→amber→emerald→sapphire→amethyst jewel ramp. Depth fog dims far fibres.
//
// Fallback: no WebGL2 → a reduced Canvas2D projection of the same fibres (never
// blank). webglcontextlost is handled; dispose() tears everything down.
// prefers-reduced-motion is honoured upstream (slower rotation).
// ════════════════════════════════════════════════════════════════════════════

import {
  fibrePoint,
  rotate4,
  stereo,
  type BasePoint,
  type FibreGeometry,
  type Quat,
} from "./hopf";

// ── tiny column-major mat4 kit ──────────────────────────────────────────────
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
function mat4Perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fov / 2);
  const o = new Float32Array(16);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) / (near - far);
  o[11] = -1;
  o[14] = (2 * far * near) / (near - far);
  return o;
}
function mat4Translate(x: number, y: number, z: number): Float32Array {
  const o = new Float32Array(16);
  o[0] = o[5] = o[10] = o[15] = 1;
  o[12] = x;
  o[13] = y;
  o[14] = z;
  return o;
}
function mat4RotX(a: number): Float32Array {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const o = new Float32Array(16);
  o[0] = 1;
  o[5] = c;
  o[6] = s;
  o[9] = -s;
  o[10] = c;
  o[15] = 1;
  return o;
}
function mat4RotY(a: number): Float32Array {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const o = new Float32Array(16);
  o[0] = c;
  o[2] = -s;
  o[5] = 1;
  o[8] = s;
  o[10] = c;
  o[15] = 1;
  return o;
}

const RADIUS_CAP = 6.0;

const VERT = `#version 300 es
layout(location=0) in vec4 aPos;   // S³ point (a,b,c,d)
layout(location=1) in float aLat;  // base latitude in [-1,1]
uniform vec4 uQL;                  // left rotation quaternion (w,x,y,z)
uniform vec4 uQR;                  // right rotation quaternion
uniform mat4 uViewProj;
out vec3 vColor;
out float vFog;

vec4 qmul(vec4 a, vec4 b) {
  return vec4(
    a.x*b.x - a.y*b.y - a.z*b.z - a.w*b.w,
    a.x*b.y + a.y*b.x + a.z*b.w - a.w*b.z,
    a.x*b.z - a.y*b.w + a.z*b.x + a.w*b.y,
    a.x*b.w + a.y*b.z - a.z*b.y + a.w*b.x
  );
}

vec3 jewel(float l) {
  float u = clamp(l * 0.5 + 0.5, 0.0, 1.0);
  vec3 ruby     = vec3(0.86, 0.13, 0.30);
  vec3 amber    = vec3(0.95, 0.62, 0.16);
  vec3 emerald  = vec3(0.12, 0.80, 0.52);
  vec3 sapphire = vec3(0.20, 0.42, 0.95);
  vec3 amethyst = vec3(0.66, 0.34, 0.92);
  if (u < 0.25)      return mix(ruby, amber, u / 0.25);
  else if (u < 0.5)  return mix(amber, emerald, (u - 0.25) / 0.25);
  else if (u < 0.75) return mix(emerald, sapphire, (u - 0.5) / 0.25);
  else               return mix(sapphire, amethyst, (u - 0.75) / 0.25);
}

void main() {
  vec4 p = qmul(qmul(uQL, aPos), uQR);           // 4D rotation on S³
  vec3 r3 = p.xyz / (1.0 - p.w + 1e-4);          // stereographic S³→R³
  float len = length(r3);
  r3 *= ${RADIUS_CAP.toFixed(1)} / (${RADIUS_CAP.toFixed(1)} + len); // soft radial cap
  vec4 clip = uViewProj * vec4(r3, 1.0);
  gl_Position = clip;
  vColor = jewel(aLat);
  vFog = exp(-max(0.0, clip.w - 2.2) * 0.30);    // exponential depth fog
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vColor;
in float vFog;
out vec4 fragColor;
void main() {
  float glow = 0.32 + 0.42 * vFog;
  fragColor = vec4(vColor * glow * vFog, 1.0);
}`;

const BG_VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const BG_FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
out vec4 fragColor;
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float r = length(uv);
  float core = exp(-r * r * 2.2);                 // tunnel toward the light
  vec3 deep  = vec3(0.055, 0.055, 0.105);         // graphite / deep-indigo field
  vec3 mid   = vec3(0.125, 0.100, 0.245);         // indigo mid-tone
  vec3 light = vec3(0.42, 0.36, 0.64);            // luminous violet centre
  vec3 col = mix(deep, mid, smoothstep(1.15, 0.25, r));
  col = mix(col, light, core * 0.9);
  // slow chromatic drift so the field breathes — no strobe
  col += 0.028 * vec3(sin(uTime * 0.11 + uv.x * 2.0),
                      sin(uTime * 0.09 + uv.y * 2.0),
                      sin(uTime * 0.07));
  col *= 1.0 - 0.28 * smoothstep(0.55, 1.5, r);   // vignette
  fragColor = vec4(max(col, 0.0), 1.0);
}`;

type Mode = "webgl2" | "canvas2d";

// Jewel ramp mirrored in JS for the Canvas2D fallback.
function jewelCss(lat: number): string {
  const u = Math.max(0, Math.min(1, lat * 0.5 + 0.5));
  const stops: [number, number, number][] = [
    [219, 33, 77],
    [242, 158, 41],
    [31, 204, 133],
    [51, 107, 242],
    [168, 87, 235],
  ];
  const seg = u * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = stops[i];
  const b = stops[i + 1];
  const R = Math.round(a[0] + (b[0] - a[0]) * f);
  const G = Math.round(a[1] + (b[1] - a[1]) * f);
  const B = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${R},${G},${B})`;
}

export class FibrationRenderer {
  private canvas: HTMLCanvasElement;
  private mode: Mode = "webgl2";
  private disposed = false;
  private geo: FibreGeometry;

  private qL: Quat = [1, 0, 0, 0];
  private qR: Quat = [1, 0, 0, 0];
  private yaw = 0;
  private pitch = 0.34;
  private dist = 3.4;
  private time = 0;

  // WebGL2 state
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private bgProg: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private emptyVao: WebGLVertexArrayObject | null = null;
  private uQL: WebGLUniformLocation | null = null;
  private uQR: WebGLUniformLocation | null = null;
  private uVP: WebGLUniformLocation | null = null;
  private uBgRes: WebGLUniformLocation | null = null;
  private uBgTime: WebGLUniformLocation | null = null;

  // Canvas2D fallback state
  private ctx2d: CanvasRenderingContext2D | null = null;
  private fbBases: BasePoint[] = [];
  private fbSegments = 56;

  private onLost = (e: Event) => e.preventDefault();
  private onRestored = () => {
    if (!this.disposed) this.initGL();
  };

  constructor(canvas: HTMLCanvasElement, geo: FibreGeometry) {
    this.canvas = canvas;
    this.geo = geo;
    canvas.addEventListener("webglcontextlost", this.onLost, false);
    canvas.addEventListener("webglcontextrestored", this.onRestored, false);

    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (gl) {
      this.gl = gl;
      if (this.initGL()) {
        this.mode = "webgl2";
      } else {
        this.mode = "canvas2d";
        this.gl = null;
      }
    }
    if (!this.gl) {
      this.mode = "canvas2d";
      this.ctx2d = canvas.getContext("2d");
      // reduced fibre subset for the CPU path (every other fibre)
      this.fbBases = geo.bases.filter((_, i) => i % 2 === 0);
    }
    this.resize();
  }

  get rendererMode(): Mode {
    return this.mode;
  }

  private compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
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

  private link(gl: WebGL2RenderingContext, vsrc: string, fsrc: string): WebGLProgram | null {
    const vs = this.compile(gl, gl.VERTEX_SHADER, vsrc);
    const fs = this.compile(gl, gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  private initGL(): boolean {
    const gl = this.gl;
    if (!gl) return false;
    const prog = this.link(gl, VERT, FRAG);
    const bgProg = this.link(gl, BG_VERT, BG_FRAG);
    if (!prog || !bgProg) return false;
    this.prog = prog;
    this.bgProg = bgProg;

    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.geo.data, gl.STATIC_DRAW);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const stride = this.geo.stride * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 4 * 4);
    gl.bindVertexArray(null);

    this.emptyVao = gl.createVertexArray();

    this.uQL = gl.getUniformLocation(prog, "uQL");
    this.uQR = gl.getUniformLocation(prog, "uQR");
    this.uVP = gl.getUniformLocation(prog, "uViewProj");
    this.uBgRes = gl.getUniformLocation(bgProg, "uRes");
    this.uBgTime = gl.getUniformLocation(bgProg, "uTime");
    return true;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(1.75, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const w = Math.max(1, Math.floor((rect.width || this.canvas.clientWidth || 1) * dpr));
    const h = Math.max(1, Math.floor((rect.height || this.canvas.clientHeight || 1) * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.gl) this.gl.viewport(0, 0, w, h);
  }

  /** Feed the current 4D rotation + camera orbit from the input layer. */
  setState(qL: Quat, qR: Quat, yaw: number, pitch: number, dist: number): void {
    this.qL = qL;
    this.qR = qR;
    this.yaw = yaw;
    this.pitch = pitch;
    this.dist = dist;
  }

  private viewProj(): Float32Array {
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const persp = mat4Perspective((55 * Math.PI) / 180, aspect, 0.1, 100);
    const view = mat4Mul(
      mat4Translate(0, 0, -this.dist),
      mat4Mul(mat4RotX(this.pitch), mat4RotY(this.yaw)),
    );
    return mat4Mul(persp, view);
  }

  frame(dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    if (this.mode === "webgl2") this.drawGL();
    else this.draw2D();
  }

  private drawGL(): void {
    const gl = this.gl;
    if (!gl || !this.prog || !this.bgProg) return;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // background void
    gl.useProgram(this.bgProg);
    gl.bindVertexArray(this.emptyVao);
    if (this.uBgRes) gl.uniform2f(this.uBgRes, this.canvas.width, this.canvas.height);
    if (this.uBgTime) gl.uniform1f(this.uBgTime, this.time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // additive fibres
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    if (this.uQL) gl.uniform4f(this.uQL, this.qL[0], this.qL[1], this.qL[2], this.qL[3]);
    if (this.uQR) gl.uniform4f(this.uQR, this.qR[0], this.qR[1], this.qR[2], this.qR[3]);
    if (this.uVP) gl.uniformMatrix4fv(this.uVP, false, this.viewProj());
    for (const rng of this.geo.ranges) {
      gl.drawArrays(gl.LINE_LOOP, rng.start, rng.count);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  // ── Canvas2D fallback: reduced JS projection of the same fibres ──
  private draw2D(): void {
    const cx = this.ctx2d;
    if (!cx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cxp = w / 2;
    const cyp = h / 2;
    const scale = Math.min(w, h);

    // chromatic void background (deep indigo → luminous violet centre)
    const bg = cx.createRadialGradient(cxp, cyp, 0, cxp, cyp, scale * 0.75);
    bg.addColorStop(0, "#6b5aa0");
    bg.addColorStop(0.35, "#2a2350");
    bg.addColorStop(1, "#0f0f1c");
    cx.fillStyle = bg;
    cx.fillRect(0, 0, w, h);

    cx.globalCompositeOperation = "lighter";
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const f = scale * 0.9;

    for (const b of this.fbBases) {
      cx.beginPath();
      let started = false;
      for (let s = 0; s <= this.fbSegments; s++) {
        const t = (s / this.fbSegments) * Math.PI * 2;
        const q = fibrePoint(b.x, b.y, b.z, t);
        const rp = rotate4(q, this.qL, this.qR);
        let [x, y, z] = stereo(rp);
        const len = Math.hypot(x, y, z);
        const k = RADIUS_CAP / (RADIUS_CAP + len);
        x *= k;
        y *= k;
        z *= k;
        // rotateY then rotateX (mirror of the GL camera)
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        const y1 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        const zc = this.dist - z2;
        if (zc <= 0.1) {
          started = false;
          continue;
        }
        const sx = cxp + (f * x1) / zc;
        const syc = cyp - (f * y1) / zc;
        if (!started) {
          cx.moveTo(sx, syc);
          started = true;
        } else {
          cx.lineTo(sx, syc);
        }
      }
      const fog = 0.5;
      cx.strokeStyle = jewelCss(b.lat);
      cx.globalAlpha = 0.5 * fog + 0.25;
      cx.lineWidth = 1.4;
      cx.stroke();
    }
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = "source-over";
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    const gl = this.gl;
    if (gl) {
      if (this.prog) gl.deleteProgram(this.prog);
      if (this.bgProg) gl.deleteProgram(this.bgProg);
      if (this.vbo) gl.deleteBuffer(this.vbo);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.emptyVao) gl.deleteVertexArray(this.emptyVao);
      this.prog = null;
      this.bgProg = null;
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    }
    this.gl = null;
  }
}
