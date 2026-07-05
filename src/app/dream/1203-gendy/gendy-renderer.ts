// Renderer for the living GENDYN waveform.
//
// The breakpoint polygon is drawn every frame as a glowing filament (a
// ribbon triangle-strip so it reads as a fat, luminous oscilloscope
// trace, since GL line-width is capped at 1 in most browsers). A
// ping-pong feedback pass fades + blurs the previous frame so you SEE the
// random walk as a trailing afterimage field. Colour tracks the chaos
// level: calm = cool electric-violet, chaotic = hot amber, over a deep
// teal / near-charcoal ground with radial chiaroscuro.
//
// WebGL2 preferred; a dark chromatic Canvas2D path is the fallback.

export type RendererMode = "webgl2" | "canvas2d";

const GROUND: [number, number, number] = [0.022, 0.088, 0.098]; // deep teal-charcoal
const COOL: [number, number, number] = [0.55, 0.26, 0.96]; // electric violet (calm)
const HOT: [number, number, number] = [1.0, 0.52, 0.09]; // amber (chaotic)

interface WaveState {
  amp: Float32Array;
  dur: Float32Array;
  level: number;
  chaos: number;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
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
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc failed");
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link: " + log);
  }
  return p;
}

const FULLSCREEN_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FADE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uDecay;
out vec4 o;
void main() {
  vec4 c = texture(uTex, vUv) * 0.48;
  c += texture(uTex, vUv + vec2(uTexel.x, 0.0)) * 0.13;
  c += texture(uTex, vUv - vec2(uTexel.x, 0.0)) * 0.13;
  c += texture(uTex, vUv + vec2(0.0, uTexel.y)) * 0.13;
  c += texture(uTex, vUv - vec2(0.0, uTexel.y)) * 0.13;
  o = c * uDecay;
}`;

const RIBBON_VS = `#version 300 es
in vec2 aPos;
in float aSide;
in float aAlong;
out float vSide;
out float vAlong;
void main() {
  vSide = aSide;
  vAlong = aAlong;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const RIBBON_FS = `#version 300 es
precision highp float;
in float vSide;
in float vAlong;
uniform vec3 uCool;
uniform vec3 uHot;
uniform float uChaos;
uniform float uLevel;
out vec4 o;
void main() {
  float edge = 1.0 - abs(vSide);          // 1 at spine, 0 at ribbon edge
  float core = smoothstep(0.0, 1.0, edge);
  float glow = pow(edge, 0.6);
  vec3 col = mix(uCool, uHot, clamp(uChaos + vAlong * 0.12, 0.0, 1.0));
  col += vec3(0.55, 0.30, 0.02) * uChaos * pow(edge, 3.0); // amber spark
  float a = (core * 0.85 + glow * 0.34) * (0.45 + uLevel * 1.5);
  o = vec4(col * a, a);
}`;

const PRESENT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec3 uGround;
out vec4 o;
void main() {
  vec3 acc = texture(uTex, vUv).rgb;
  vec2 p = vUv * 2.0 - 1.0;
  float vig = 1.0 - 0.62 * dot(p, p);        // radial chiaroscuro
  vec3 ground = uGround * clamp(vig, 0.12, 1.0);
  vec3 col = ground + acc;                    // glow sits over the ground
  col = col / (col + vec3(0.82));             // reinhard tone map
  col = pow(col, vec3(0.86));
  o = vec4(col, 1.0);
}`;

export class GendyRenderer {
  readonly mode: RendererMode;
  private readonly canvas: HTMLCanvasElement;
  private dpr = 1;

  // wave state (smoothed by caller before handing in)
  private wave: WaveState = {
    amp: new Float32Array(12),
    dur: new Float32Array(12).fill(1),
    level: 0,
    chaos: 0.35,
  };

  // ── WebGL2 state ──
  private gl: WebGL2RenderingContext | null = null;
  private fadeProg: WebGLProgram | null = null;
  private ribbonProg: WebGLProgram | null = null;
  private presentProg: WebGLProgram | null = null;
  private tex: (WebGLTexture | null)[] = [null, null];
  private fbo: (WebGLFramebuffer | null)[] = [null, null];
  private src = 0;
  private ribbonVbo: WebGLBuffer | null = null;
  private emptyVao: WebGLVertexArrayObject | null = null;
  private ribbonVao: WebGLVertexArrayObject | null = null;
  private ribbonData = new Float32Array(0);
  private uni: Record<string, WebGLUniformLocation | null> = {};

  // ── Canvas2D state ──
  private c2d: CanvasRenderingContext2D | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (gl) {
      try {
        this.initGL(gl);
        this.mode = "webgl2";
      } catch {
        this.gl = null;
        this.mode = "canvas2d";
        this.initC2D();
      }
    } else {
      this.mode = "canvas2d";
      this.initC2D();
    }
    this.resize();
  }

  private initGL(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    this.fadeProg = link(gl, FULLSCREEN_VS, FADE_FS);
    this.ribbonProg = link(gl, RIBBON_VS, RIBBON_FS);
    this.presentProg = link(gl, FULLSCREEN_VS, PRESENT_FS);

    this.uni = {
      fadeTex: gl.getUniformLocation(this.fadeProg, "uTex"),
      fadeTexel: gl.getUniformLocation(this.fadeProg, "uTexel"),
      fadeDecay: gl.getUniformLocation(this.fadeProg, "uDecay"),
      ribCool: gl.getUniformLocation(this.ribbonProg, "uCool"),
      ribHot: gl.getUniformLocation(this.ribbonProg, "uHot"),
      ribChaos: gl.getUniformLocation(this.ribbonProg, "uChaos"),
      ribLevel: gl.getUniformLocation(this.ribbonProg, "uLevel"),
      presTex: gl.getUniformLocation(this.presentProg, "uTex"),
      presGround: gl.getUniformLocation(this.presentProg, "uGround"),
    };

    this.emptyVao = gl.createVertexArray();
    this.ribbonVao = gl.createVertexArray();
    this.ribbonVbo = gl.createBuffer();

    // ribbon vertex layout: aPos(2), aSide(1), aAlong(1) = 4 floats
    gl.bindVertexArray(this.ribbonVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ribbonVbo);
    const stride = 4 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 12);
    gl.bindVertexArray(null);
  }

  private initC2D(): void {
    this.c2d = this.canvas.getContext("2d");
  }

  private makeTarget(gl: WebGL2RenderingContext, w: number, h: number, i: number): void {
    if (this.tex[i]) gl.deleteTexture(this.tex[i]);
    if (this.fbo[i]) gl.deleteFramebuffer(this.fbo[i]);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.tex[i] = tex;
    this.fbo[i] = fbo;
  }

  resize(): void {
    const dpr = Math.min(1.5, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    this.dpr = dpr;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    const gl = this.gl;
    if (gl) {
      this.makeTarget(gl, w, h, 0);
      this.makeTarget(gl, w, h, 1);
      gl.viewport(0, 0, w, h);
    }
  }

  setWave(w: WaveState): void {
    this.wave = w;
  }

  // Build the ribbon triangle-strip from the current breakpoints.
  private buildRibbon(): number {
    const { amp, dur } = this.wave;
    const n = amp.length;
    // cumulative x positions from durations, mapped across the canvas
    let sum = 0;
    for (let i = 0; i < n; i++) sum += dur[i];
    if (sum < 1e-6) sum = n;
    const pts: number[] = [];
    let cx = 0;
    for (let i = 0; i < n; i++) {
      const x = (cx / sum) * 1.84 - 0.92;
      const y = amp[i] * 0.74;
      pts.push(x, y);
      cx += dur[i];
    }
    const halfW = 0.012 + this.wave.level * 0.03;
    const need = n * 2 * 4;
    if (this.ribbonData.length < need) this.ribbonData = new Float32Array(need);
    const out = this.ribbonData;
    let o = 0;
    for (let i = 0; i < n; i++) {
      const px = pts[i * 2];
      const py = pts[i * 2 + 1];
      // tangent from neighbours
      const ax = pts[Math.max(0, i - 1) * 2];
      const ay = pts[Math.max(0, i - 1) * 2 + 1];
      const bx = pts[Math.min(n - 1, i + 1) * 2];
      const by = pts[Math.min(n - 1, i + 1) * 2 + 1];
      let tx = bx - ax;
      let ty = by - ay;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty;
      const ny = tx;
      const along = i / (n - 1);
      out[o++] = px + nx * halfW; out[o++] = py + ny * halfW; out[o++] = 1; out[o++] = along;
      out[o++] = px - nx * halfW; out[o++] = py - ny * halfW; out[o++] = -1; out[o++] = along;
    }
    return n * 2;
  }

  private frameGL(gl: WebGL2RenderingContext): void {
    const dst = this.src ^ 1;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const decay = 0.9 + Math.min(0.06, this.wave.chaos * 0.06); // longer trails when calm

    // 1) fade + blur previous frame (src) into dst
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[dst]);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.fadeProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[this.src]);
    gl.uniform1i(this.uni.fadeTex, 0);
    gl.uniform2f(this.uni.fadeTexel, 1 / w, 1 / h);
    gl.uniform1f(this.uni.fadeDecay, decay);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2) draw the living filament additively on top of dst
    const count = this.buildRibbon();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ribbonVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.ribbonData, gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.ribbonProg);
    gl.uniform3fv(this.uni.ribCool, COOL);
    gl.uniform3fv(this.uni.ribHot, HOT);
    gl.uniform1f(this.uni.ribChaos, this.wave.chaos);
    gl.uniform1f(this.uni.ribLevel, Math.min(1.4, this.wave.level * 3.0));
    gl.bindVertexArray(this.ribbonVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, count);
    gl.disable(gl.BLEND);

    // 3) present dst to the screen over the ground
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.presentProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[dst]);
    gl.uniform1i(this.uni.presTex, 0);
    gl.uniform3fv(this.uni.presGround, GROUND);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    this.src = dst;
  }

  private frameC2D(ctx: CanvasRenderingContext2D): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    // trailing afterimage: veil the previous frame with the ground colour
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(${Math.round(GROUND[0] * 255)},${Math.round(
      GROUND[1] * 255,
    )},${Math.round(GROUND[2] * 255)},0.16)`;
    ctx.fillRect(0, 0, w, h);

    const { amp, dur, level, chaos } = this.wave;
    const n = amp.length;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += dur[i];
    if (sum < 1e-6) sum = n;

    const cr = Math.round((COOL[0] * (1 - chaos) + HOT[0] * chaos) * 255);
    const cg = Math.round((COOL[1] * (1 - chaos) + HOT[1] * chaos) * 255);
    const cb = Math.round((COOL[2] * (1 - chaos) + HOT[2] * chaos) * 255);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = `rgb(${cr},${cg},${cb})`;

    // draw the filament a few times with growing blur for a soft glow
    const passes = [
      { width: 1.5 * this.dpr, blur: 2 * this.dpr, alpha: 0.9 },
      { width: 3.5 * this.dpr, blur: 10 * this.dpr, alpha: 0.5 },
      { width: 7 * this.dpr, blur: 26 * this.dpr, alpha: 0.28 },
    ];
    for (const p of passes) {
      ctx.beginPath();
      let cx = 0;
      for (let i = 0; i < n; i++) {
        const x = ((cx / sum) * 0.92 + 0.04) * w;
        const y = h * 0.5 - amp[i] * 0.4 * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        cx += dur[i];
      }
      ctx.lineWidth = p.width;
      ctx.shadowBlur = p.blur;
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.35 + level * 1.4) * p.alpha})`;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
  }

  frame(): void {
    if (this.gl) this.frameGL(this.gl);
    else if (this.c2d) this.frameC2D(this.c2d);
  }

  dispose(): void {
    const gl = this.gl;
    if (gl) {
      if (this.fadeProg) gl.deleteProgram(this.fadeProg);
      if (this.ribbonProg) gl.deleteProgram(this.ribbonProg);
      if (this.presentProg) gl.deleteProgram(this.presentProg);
      for (const t of this.tex) if (t) gl.deleteTexture(t);
      for (const f of this.fbo) if (f) gl.deleteFramebuffer(f);
      if (this.ribbonVbo) gl.deleteBuffer(this.ribbonVbo);
      if (this.emptyVao) gl.deleteVertexArray(this.emptyVao);
      if (this.ribbonVao) gl.deleteVertexArray(this.ribbonVao);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    }
    this.gl = null;
    this.c2d = null;
    this.fadeProg = this.ribbonProg = this.presentProg = null;
    this.tex = [null, null];
    this.fbo = [null, null];
    this.ribbonVbo = this.emptyVao = this.ribbonVao = null;
  }
}
