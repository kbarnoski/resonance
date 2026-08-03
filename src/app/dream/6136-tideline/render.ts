// ─────────────────────────────────────────────────────────────────────────
// Render — a luminous tide. A deep indigo-to-violet sea and sky whose horizon
// RISES as you inhale and falls as you exhale, with a warm glow at the water
// line, a subtle layered wave texture, and a soft "pace ring" that expands and
// contracts on the guided breath so you can entrain to it.
//
// WebGL2 fragment shader is the primary path; a Canvas2D fallback draws the
// same idea (gradient + rising sea line + glow + ring) more simply.
// All motion is slow luminance/level drift on the breath timescale — no flash.
// ─────────────────────────────────────────────────────────────────────────

export type TideFrame = {
  time: number; // seconds
  breath: number; // 0..1 actual breath level -> sea height
  target: number; // 0..1 guided pace phase -> ring radius
  glow: number; // 0..1 horizon glow intensity
};

export interface TideRenderer {
  resize(w: number, h: number, dpr: number): void;
  draw(f: TideFrame): void;
  dispose(): void;
  readonly kind: "webgl2" | "canvas2d";
}

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uTime;
uniform float uBreath;  // 0..1 sea height
uniform float uTarget;  // 0..1 pace ring radius
uniform float uGlow;    // 0..1 horizon glow

// palette: deep indigo -> violet, with a warm horizon
const vec3 SKY_TOP  = vec3(0.035, 0.030, 0.086);
const vec3 SKY_HORZ = vec3(0.14, 0.09, 0.24);
const vec3 SEA_NEAR = vec3(0.10, 0.07, 0.20);
const vec3 SEA_DEEP = vec3(0.015, 0.012, 0.05);
const vec3 GLOW_COL = vec3(1.0, 0.62, 0.42); // warm horizon
const vec3 RING_COL = vec3(0.72, 0.60, 1.0); // violet guide

float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

// slow layered swell -> a wave displacement of the sea line, in uv units
float swell(float x, float t, float amp){
  float w = 0.0;
  w += sin(x * 3.1 + t * 0.22) * 0.55;
  w += sin(x * 6.7 - t * 0.15) * 0.28;
  w += sin(x * 11.3 + t * 0.31) * 0.14;
  return w * amp;
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uRes;              // 0..1, y up
  float aspect = uRes.x / uRes.y;

  // Sea line height rises with the breath. Rest ~0.34, peak ~0.62.
  float base = mix(0.34, 0.62, uBreath);
  float xw = (uv.x - 0.5) * aspect;
  float line = base + swell(xw, uTime, 0.018 + 0.014 * uBreath);

  // Soft transition across the water line.
  float edge = 0.006 + 0.010 * (1.0 - uBreath);
  float sea = smoothstep(line + edge, line - edge, uv.y); // 1 in sea, 0 in sky

  // Sky gradient (brighter toward the horizon).
  float sg = clamp((uv.y - line) / (1.0 - line + 0.001), 0.0, 1.0);
  vec3 sky = mix(SKY_HORZ, SKY_TOP, pow(sg, 0.8));

  // Sea gradient (darker toward the bottom) + shimmer streaks that follow
  // the breath: gentle bright ripples on the water just below the line.
  float depth = clamp((line - uv.y) / (line + 0.001), 0.0, 1.0);
  vec3 water = mix(SEA_NEAR, SEA_DEEP, pow(depth, 0.7));
  float streak = sin((uv.y * 60.0) - uTime * 0.8 + sin(xw * 4.0) * 2.0);
  streak = smoothstep(0.6, 1.0, streak) * exp(-depth * 5.0);
  water += streak * (0.05 + 0.12 * uBreath) * GLOW_COL * 0.6;

  vec3 col = mix(sky, water, sea);

  // Warm horizon glow band, intensity swells with the breath.
  float d = abs(uv.y - line);
  float halo = exp(-d * d / (2.0 * 0.010 * 0.010));
  float glowAmt = 0.25 + 0.75 * uGlow;
  col += GLOW_COL * halo * glowAmt * (0.5 + 0.9 * uBreath);
  // A wider, softer bloom above the water.
  float bloom = exp(-max(uv.y - line, 0.0) * 6.0) * step(line, uv.y);
  col += GLOW_COL * bloom * 0.10 * glowAmt;

  // ── Pace ring: a soft luminous annulus centred a little above the middle.
  vec2 c = vec2(0.5 * aspect, 0.60);
  vec2 pp = vec2(uv.x * aspect, uv.y);
  float r = length(pp - c);
  float rr = mix(0.055, 0.150, uTarget);      // radius follows the guide
  float ring = exp(-pow((r - rr) / 0.010, 2.0)); // thin glowing ring
  float core = exp(-pow(r / (rr * 0.9), 2.0)) * 0.06; // faint inner fill
  col += RING_COL * ring * 0.30;
  col += RING_COL * core;

  // subtle film grain to avoid banding on the gradient
  float g = (hash(fc + uTime) - 0.5) * 0.012;
  col += g;

  // gentle vignette
  vec2 q = uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.55;

  fragColor = vec4(max(col, 0.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

class WebGLTide implements TideRenderer {
  readonly kind = "webgl2" as const;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private u: Record<string, WebGLUniformLocation | null>;

  constructor(private canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("link failed: " + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.prog = prog;

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;

    gl.useProgram(prog);
    this.u = {
      uRes: gl.getUniformLocation(prog, "uRes"),
      uTime: gl.getUniformLocation(prog, "uTime"),
      uBreath: gl.getUniformLocation(prog, "uBreath"),
      uTarget: gl.getUniformLocation(prog, "uTarget"),
      uGlow: gl.getUniformLocation(prog, "uGlow"),
    };
  }

  resize(w: number, h: number, dpr: number) {
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(f: TideFrame) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.uTime, f.time);
    gl.uniform1f(this.u.uBreath, f.breath);
    gl.uniform1f(this.u.uTarget, f.target);
    gl.uniform1f(this.u.uGlow, f.glow);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteVertexArray(this.vao);
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }
}

// ── Canvas2D fallback ──────────────────────────────────────────────────────
class Canvas2DTide implements TideRenderer {
  readonly kind = "canvas2d" as const;
  private w = 1;
  private h = 1;
  private dpr = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
  ) {}

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(f: TideFrame) {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    // sea line y (screen coords, 0 top). breath raises it.
    const lineN = 0.34 + f.breath * 0.28; // fraction from bottom
    const lineY = h * (1 - lineN);

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, lineY);
    sky.addColorStop(0, "#08070f");
    sky.addColorStop(1, "#241640");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, lineY);

    // sea
    const sea = ctx.createLinearGradient(0, lineY, 0, h);
    sea.addColorStop(0, "#1a1236");
    sea.addColorStop(1, "#04030d");
    ctx.fillStyle = sea;
    // wavy top edge
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    for (let x = 0; x <= w; x += 8) {
      const xw = (x / w - 0.5) * 3.1;
      const dy =
        (Math.sin(xw * 3.1 + f.time * 0.22) * 0.55 +
          Math.sin(xw * 6.7 - f.time * 0.15) * 0.28) *
        (0.018 + 0.014 * f.breath) *
        h;
      ctx.lineTo(x, lineY - dy);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // horizon glow
    const glowAmt = 0.25 + 0.75 * f.glow;
    const g = ctx.createLinearGradient(0, lineY - h * 0.08, 0, lineY + h * 0.05);
    g.addColorStop(0, "rgba(255,158,107,0)");
    g.addColorStop(0.5, `rgba(255,158,107,${(0.35 * glowAmt).toFixed(3)})`);
    g.addColorStop(1, "rgba(255,158,107,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, lineY - h * 0.08, w, h * 0.13);

    // pace ring
    const cx = w * 0.5;
    const cy = h * 0.4;
    const rr = (0.055 + f.target * 0.095) * Math.min(w, h) * 1.4;
    ctx.strokeStyle = `rgba(184,153,255,${(0.35 + 0.35 * f.target).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  dispose() {}
}

export function createTideRenderer(canvas: HTMLCanvasElement): TideRenderer {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  });
  if (gl) {
    try {
      return new WebGLTide(canvas, gl);
    } catch {
      // fall through to canvas2d
    }
  }
  const ctx2d = canvas.getContext("2d");
  if (ctx2d) return new Canvas2DTide(canvas, ctx2d);
  throw new Error("no 2d or webgl2 context available");
}
