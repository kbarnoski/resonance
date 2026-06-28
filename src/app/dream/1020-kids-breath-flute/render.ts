// ─────────────────────────────────────────────────────────────────────────
// render.ts — the glowing aurora "air column".
//
// A soft vertical column of light that breathes and brightens with the flute.
// WebGL2 fragment-shader aurora (teal → violet → gold) modulated by the
// output RMS (how loud) and brightness (how hard the breath), with a Canvas2D
// fallback that paints the same idea with stacked radial gradients.
//
// The component owns the recorder-holes overlay; this module only animates the
// living column so the page stays focused on interaction + layout.
// ─────────────────────────────────────────────────────────────────────────

export interface ColumnState {
  /** Smoothed output loudness 0..1 — sets column height / glow. */
  level: number;
  /** Smoothed brightness 0..1 — pushes the palette toward gold and adds shimmer. */
  bright: number;
  /** Normalized active pitch 0..1 (low→high) — shifts hue and wobble speed. */
  pitch: number;
}

export interface ColumnRenderer {
  draw(state: ColumnState, timeSec: number): void;
  resize(w: number, h: number, dpr: number): void;
  readonly usingWebGL: boolean;
  dispose(): void;
}

const VERT = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_res;
uniform float u_time;
uniform float u_level;
uniform float u_bright;
uniform float u_pitch;

// cheap value noise
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x),
             mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;        // 0..1
  vec2 c = uv; c.x -= 0.5;                   // center x
  float t = u_time;

  // The column sways gently; sway grows a little with pitch.
  float sway = sin(uv.y*3.0 + t*(0.7 + u_pitch*0.6)) * 0.05 * (0.6 + u_pitch*0.6);
  float dx = abs(c.x - sway);

  // Column width breathes with level.
  float width = 0.10 + 0.06*u_level;
  float column = smoothstep(width, 0.0, dx);

  // Vertical "air" turbulence rising with breath.
  float flow = fbm(vec2(uv.x*4.0, uv.y*6.0 - t*(0.6 + u_level*1.4)));
  float shimmer = 0.55 + 0.7*flow*(0.4 + u_bright);

  // Height: the column fills from the bottom as it sounds.
  float fill = smoothstep(1.0, 0.05, uv.y);          // brighter low, tapering up
  float reach = smoothstep(0.0, 0.85, u_level + 0.12); // how high it climbs
  float body = column * shimmer * mix(0.25, 1.0, fill*reach);

  // Palette: teal -> violet -> gold. Position in the gradient is driven by
  // height, pitch and brightness (harder breath = warmer / more gold).
  float g = clamp(uv.y*0.55 + u_pitch*0.25 + u_bright*0.4, 0.0, 1.0);
  vec3 teal   = vec3(0.10, 0.85, 0.78);
  vec3 violet = vec3(0.55, 0.32, 0.92);
  vec3 gold   = vec3(1.00, 0.80, 0.32);
  vec3 col = g < 0.5 ? mix(teal, violet, g*2.0) : mix(violet, gold, (g-0.5)*2.0);

  // Glow core.
  float core = smoothstep(width*0.5, 0.0, dx) * (0.5 + 0.7*u_level);
  vec3 rgb = col * body + col * core * 0.6 + vec3(0.9,0.95,1.0)*core*0.25*u_bright;

  // Subtle floor ambience so the scene is never fully black.
  rgb += vec3(0.02, 0.03, 0.05) * (1.0 - uv.y);

  outColor = vec4(rgb, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

class WebGLColumn implements ColumnRenderer {
  readonly usingWebGL = true;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null>;
  private w = 1;
  private h = 1;

  constructor(private canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!prog) throw new Error("program");
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {
      res: gl.getUniformLocation(prog, "u_res"),
      time: gl.getUniformLocation(prog, "u_time"),
      level: gl.getUniformLocation(prog, "u_level"),
      bright: gl.getUniformLocation(prog, "u_bright"),
      pitch: gl.getUniformLocation(prog, "u_pitch"),
    };
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = Math.max(1, Math.floor(w * dpr));
    this.h = Math.max(1, Math.floor(h * dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.gl.viewport(0, 0, this.w, this.h);
  }

  draw(s: ColumnState, t: number): void {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.res, this.w, this.h);
    gl.uniform1f(this.u.time, t);
    gl.uniform1f(this.u.level, s.level);
    gl.uniform1f(this.u.bright, s.bright);
    gl.uniform1f(this.u.pitch, s.pitch);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
  }
}

class CanvasColumn implements ColumnRenderer {
  readonly usingWebGL = false;
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  resize(w: number, h: number, dpr: number): void {
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
  }

  draw(s: ColumnState, t: number): void {
    const ctx = this.ctx;
    const W = this.w;
    const H = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Dim background wash.
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2 + Math.sin(t * 0.8) * 10 * (0.4 + s.pitch);
    const width = (0.12 + 0.06 * s.level) * W;
    const reach = Math.min(1, s.level + 0.12);
    const top = H * (1 - 0.85 * reach);

    // Stacked vertical gradient teal→violet→gold.
    const grad = ctx.createLinearGradient(0, H, 0, top);
    grad.addColorStop(0, `rgba(26,217,199,${0.5 + 0.4 * s.level})`);
    grad.addColorStop(0.5, `rgba(140,82,235,${0.45 + 0.4 * s.level})`);
    grad.addColorStop(1, `rgba(255,205,82,${0.3 + 0.5 * s.bright})`);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Soft column via several blurred ellipses.
    const bands = 9;
    for (let i = 0; i < bands; i++) {
      const yy = H - (i / bands) * (H - top);
      const wob = Math.sin(yy * 0.03 + t * (1 + s.pitch)) * 14 * (0.4 + s.pitch);
      const rg = ctx.createRadialGradient(cx + wob, yy, 0, cx + wob, yy, width);
      const a = (0.16 + 0.18 * s.level) * (1 - i / (bands + 2));
      rg.addColorStop(0, `rgba(180,235,255,${a})`);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(cx + wob, yy, width, width * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Bright core.
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.55 + 0.35 * s.level;
    ctx.beginPath();
    ctx.moveTo(cx - width * 0.35, H);
    ctx.lineTo(cx + width * 0.35, H);
    ctx.lineTo(cx + width * 0.12, top);
    ctx.lineTo(cx - width * 0.12, top);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  dispose(): void {
    /* nothing to free */
  }
}

/** Build the best available renderer for the canvas. */
export function createColumnRenderer(canvas: HTMLCanvasElement): ColumnRenderer {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    premultipliedAlpha: false,
  });
  if (gl) {
    try {
      return new WebGLColumn(canvas, gl);
    } catch {
      /* fall through to canvas2d */
    }
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  return new CanvasColumn(canvas, ctx);
}
