// renderer.ts — WebGL2 additive glow renderer for the piano garden, with a
// Canvas2D fallback that draws the same seed + blooming singing flowers.
// Near-black garden, warm luminous palette. Self-contained; no shared imports.

export interface FlowerVisual {
  id: number;
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  color: [number, number, number]; // rgb 0..1
  born: number; // ms timestamp
  baseR: number; // base radius (0..1 of min dimension)
  pulse: number; // current pulse 0..1 (driven by audio activity)
  alive: boolean;
}

export interface TrailPoint {
  x: number;
  y: number;
  t: number; // ms
}

export interface Scene {
  seedX: number; // 0..1
  seedY: number; // 0..1
  trail: TrailPoint[];
  flowers: FlowerVisual[];
  now: number; // ms
}

// Warm/luminous flower palette: rose, amber, violet, emerald.
export const FLOWER_PALETTE: [number, number, number][] = [
  [1.0, 0.45, 0.62], // rose
  [1.0, 0.74, 0.35], // amber
  [0.72, 0.5, 1.0], // violet
  [0.3, 0.92, 0.66], // emerald
];

// ─── WebGL2 renderer ─────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Additive glow accumulation: a fullscreen pass sums soft radial blobs for the
// seed, its trail, and every flower (pulsing). Near-black background.
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_seed;
uniform vec2 u_trail[24];
uniform float u_trailA[24];
uniform int u_trailN;
uniform vec2 u_flowerPos[16];
uniform vec3 u_flowerCol[16];
uniform float u_flowerR[16];
uniform float u_flowerPulse[16];
uniform int u_flowerN;

float glow(vec2 p, vec2 c, float r) {
  float d = distance(p, c);
  float v = r / (d + 0.0008);
  return v * v * 0.00018;
}

void main() {
  // aspect-correct coordinates
  vec2 uv = v_uv;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  vec3 col = vec3(0.012, 0.016, 0.03); // near-black garden, faint cool floor

  // subtle vignette of warmth
  float vig = 1.0 - 0.6 * distance(uv, vec2(0.5));
  col += vec3(0.02, 0.015, 0.025) * vig;

  // flowers — pulsing additive bursts with soft petals
  for (int i = 0; i < 16; i++) {
    if (i >= u_flowerN) break;
    vec2 fc = vec2(u_flowerPos[i].x * aspect, u_flowerPos[i].y);
    float pulse = u_flowerPulse[i];
    float r = u_flowerR[i] * (0.85 + 0.45 * pulse);
    float g = glow(p, fc, r);
    // gentle petal ripple
    float ang = atan(p.y - fc.y, p.x - fc.x);
    float petals = 0.5 + 0.5 * sin(ang * 5.0 + u_time * 0.8);
    col += u_flowerCol[i] * g * (0.7 + 0.6 * petals) * (0.6 + 0.8 * pulse);
  }

  // trail — soft fading glowing path
  for (int i = 0; i < 24; i++) {
    if (i >= u_trailN) break;
    vec2 tc = vec2(u_trail[i].x * aspect, u_trail[i].y);
    float g = glow(p, tc, 0.018 * u_trailA[i]);
    col += vec3(1.0, 0.88, 0.7) * g * u_trailA[i] * 0.5;
  }

  // seed — bright warm marble
  vec2 sc = vec2(u_seed.x * aspect, u_seed.y);
  float sg = glow(p, sc, 0.05);
  col += vec3(1.0, 0.95, 0.8) * sg;
  // bright core
  float core = smoothstep(0.022, 0.0, distance(p, sc));
  col += vec3(1.0, 0.98, 0.92) * core * 1.2;

  // soft tone-map so additive sums never clip harshly
  col = col / (col + vec3(1.0));
  col = pow(col, vec3(0.85));
  outColor = vec4(col, 1.0);
}`;

interface GLLocs {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  seed: WebGLUniformLocation | null;
  trail: WebGLUniformLocation | null;
  trailA: WebGLUniformLocation | null;
  trailN: WebGLUniformLocation | null;
  flowerPos: WebGLUniformLocation | null;
  flowerCol: WebGLUniformLocation | null;
  flowerR: WebGLUniformLocation | null;
  flowerPulse: WebGLUniformLocation | null;
  flowerN: WebGLUniformLocation | null;
}

export class GardenRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private program: WebGLProgram | null = null;
  private locs: GLLocs | null = null;
  readonly usingWebGL: boolean;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
    });
    if (gl) {
      this.gl = gl;
      this.usingWebGL = this.initGL();
      if (!this.usingWebGL) {
        this.gl = null;
        this.ctx2d = canvas.getContext("2d");
      }
    } else {
      this.usingWebGL = false;
      this.ctx2d = canvas.getContext("2d");
    }
  }

  private compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl!;
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

  private initGL(): boolean {
    const gl = this.gl!;
    const vs = this.compile(gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    this.program = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.locs = {
      res: gl.getUniformLocation(prog, "u_res"),
      time: gl.getUniformLocation(prog, "u_time"),
      seed: gl.getUniformLocation(prog, "u_seed"),
      trail: gl.getUniformLocation(prog, "u_trail"),
      trailA: gl.getUniformLocation(prog, "u_trailA"),
      trailN: gl.getUniformLocation(prog, "u_trailN"),
      flowerPos: gl.getUniformLocation(prog, "u_flowerPos"),
      flowerCol: gl.getUniformLocation(prog, "u_flowerCol"),
      flowerR: gl.getUniformLocation(prog, "u_flowerR"),
      flowerPulse: gl.getUniformLocation(prog, "u_flowerPulse"),
      flowerN: gl.getUniformLocation(prog, "u_flowerN"),
    };
    return true;
  }

  resize(w: number, h: number, dpr: number) {
    const W = Math.floor(w * dpr);
    const H = Math.floor(h * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    if (this.gl) this.gl.viewport(0, 0, W, H);
  }

  render(scene: Scene) {
    if (this.gl && this.program && this.locs) {
      this.renderGL(scene);
    } else if (this.ctx2d) {
      this.render2D(scene);
    }
  }

  private renderGL(scene: Scene) {
    const gl = this.gl!;
    const l = this.locs!;
    gl.useProgram(this.program);
    gl.uniform2f(l.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(l.time, scene.now / 1000);
    gl.uniform2f(l.seed, scene.seedX, scene.seedY);

    // trail (max 24)
    const tn = Math.min(24, scene.trail.length);
    const tpos = new Float32Array(48);
    const ta = new Float32Array(24);
    for (let i = 0; i < tn; i++) {
      const p = scene.trail[scene.trail.length - tn + i];
      tpos[i * 2] = p.x;
      tpos[i * 2 + 1] = p.y;
      const age = (scene.now - p.t) / 1400;
      ta[i] = Math.max(0, 1 - age);
    }
    gl.uniform2fv(l.trail, tpos);
    gl.uniform1fv(l.trailA, ta);
    gl.uniform1i(l.trailN, tn);

    // flowers (max 16)
    const fn = Math.min(16, scene.flowers.length);
    const fpos = new Float32Array(32);
    const fcol = new Float32Array(48);
    const fr = new Float32Array(16);
    const fp = new Float32Array(16);
    for (let i = 0; i < fn; i++) {
      const f = scene.flowers[i];
      fpos[i * 2] = f.x;
      fpos[i * 2 + 1] = f.y;
      fcol[i * 3] = f.color[0];
      fcol[i * 3 + 1] = f.color[1];
      fcol[i * 3 + 2] = f.color[2];
      const age = (scene.now - f.born) / 900;
      const grow = Math.min(1, age); // bloom-in
      fr[i] = f.baseR * grow;
      fp[i] = f.pulse;
    }
    gl.uniform2fv(l.flowerPos, fpos);
    gl.uniform3fv(l.flowerCol, fcol);
    gl.uniform1fv(l.flowerR, fr);
    gl.uniform1fv(l.flowerPulse, fp);
    gl.uniform1i(l.flowerN, fn);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private render2D(scene: Scene) {
    const ctx = this.ctx2d!;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const minD = Math.min(W, H);

    // near-black garden
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#04050a";
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";

    // flowers
    for (const f of scene.flowers) {
      const age = (scene.now - f.born) / 900;
      const grow = Math.min(1, age);
      const r = f.baseR * minD * grow * (0.85 + 0.5 * f.pulse) * 6;
      const cx = f.x * W;
      const cy = f.y * H;
      const [cr, cg, cb] = f.color;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
      const a = 0.5 * (0.6 + 0.6 * f.pulse);
      g.addColorStop(0, `rgba(${cr * 255},${cg * 255},${cb * 255},${a})`);
      g.addColorStop(0.4, `rgba(${cr * 255},${cg * 255},${cb * 255},${a * 0.4})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
      ctx.fill();
    }

    // trail
    const tn = Math.min(24, scene.trail.length);
    for (let i = 0; i < tn; i++) {
      const p = scene.trail[scene.trail.length - tn + i];
      const ageA = Math.max(0, 1 - (scene.now - p.t) / 1400);
      if (ageA <= 0) continue;
      const r = 0.02 * minD * ageA;
      const cx = p.x * W;
      const cy = p.y * H;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
      g.addColorStop(0, `rgba(255,224,178,${0.4 * ageA})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
      ctx.fill();
    }

    // seed
    const sx = scene.seedX * W;
    const sy = scene.seedY * H;
    const sr = 0.045 * minD;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, "rgba(255,250,235,1)");
    sg.addColorStop(0.3, "rgba(255,240,210,0.7)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
  }

  dispose() {
    if (this.gl && this.program) {
      this.gl.deleteProgram(this.program);
      this.program = null;
    }
  }
}
