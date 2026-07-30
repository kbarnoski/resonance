// ════════════════════════════════════════════════════════════════════════════
// MOSAIC (3808) — WebGL2 GPU point-cloud renderer with a LIVE PATH.
//
// The corpus is drawn as a dim glowing field of point sprites (each = one grain,
// placed by timbre, coloured on the violet ramp). On top we draw the LIVE
// reconstruction path so you SEE the phrase being traced:
//   • a fading TRAIL of the recently-chosen corpus grains (a comet tail),
//   • a bright PLAYHEAD at the grain sounding right now,
//   • a cooler TARGET marker showing where the observation wants to be — when
//     coherence pulls the playhead off the target, you watch continuity win.
//
// Raw WebGL2 gl.POINTS, additive SRC_ALPHA/ONE blending. Adapted (self-contained,
// NOT imported) from 3608-atlas's point-cloud renderer.
// ════════════════════════════════════════════════════════════════════════════

const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in float aT;
layout(location=2) in float aFade;
uniform vec2 uFit;
uniform float uPointScale;
uniform float uTime;
uniform int uMode;        // 0 cloud, 1 trail, 2 marker
uniform vec2 uPlayhead;   // for cloud brightening
uniform vec2 uMarkPos;
uniform float uMarkT;
uniform float uMarkSize;
uniform float uMarkKind;  // 0 playhead (crisp), 1 target (soft ring)
out float vT;
out float vBright;
out float vKind;
void main(){
  if (uMode == 2) {
    gl_Position = vec4(uMarkPos * uFit, 0.0, 1.0);
    gl_PointSize = uMarkSize * uPointScale;
    vT = uMarkT;
    vBright = 1.0;
    vKind = uMarkKind < 0.5 ? 2.0 : 3.0;
  } else if (uMode == 1) {
    gl_Position = vec4(aPos * uFit, 0.0, 1.0);
    gl_PointSize = (7.0 + 16.0 * aFade) * uPointScale;
    vT = clamp(aT + 0.15, 0.0, 1.0);
    vBright = 0.25 + 1.3 * aFade;
    vKind = 1.0;
  } else {
    vec2 p = aPos * uFit;
    gl_Position = vec4(p, 0.0, 1.0);
    float d = distance(aPos, uPlayhead);
    float near = smoothstep(0.30, 0.0, d);
    float twinkle = 0.86 + 0.14 * sin(uTime * 1.7 + aT * 40.0);
    gl_PointSize = (3.2 + aFade * 15.0) * (1.0 + near * 1.6) * uPointScale;
    vT = clamp(aT + near * 0.2, 0.0, 1.0);
    vBright = (0.10 + aFade * 0.34 + near * 0.7) * twinkle;
    vKind = 0.0;
  }
}`;

const FRAG = `#version 300 es
precision highp float;
in float vT;
in float vBright;
in float vKind;
out vec4 fragColor;
vec3 dreamPalette(float t){
  vec3 deep    = vec3(0.075, 0.045, 0.145);
  vec3 indigo  = vec3(0.388, 0.400, 0.945);
  vec3 violet  = vec3(0.545, 0.361, 0.965);
  vec3 magenta = vec3(0.690, 0.263, 0.878);
  vec3 light   = vec3(0.867, 0.839, 0.996);
  t = clamp(t, 0.0, 1.0);
  if (t < 0.33) return mix(deep, indigo, t / 0.33);
  if (t < 0.66) return mix(indigo, violet, (t - 0.33) / 0.33);
  return mix(violet, mix(magenta, light, (t - 0.66) / 0.34), 1.0);
}
void main(){
  vec2 pc = gl_PointCoord - 0.5;
  float r = length(pc);
  float a;
  vec3 col;
  if (vKind > 2.5) {
    // target marker — a soft cool ring (indigo)
    float ring = smoothstep(0.5, 0.34, r) * smoothstep(0.16, 0.30, r);
    a = ring * 0.9;
    col = vec3(0.45, 0.5, 0.98) * vBright;
  } else if (vKind > 1.5) {
    // playhead — crisp bright core with a halo
    float core = smoothstep(0.5, 0.0, r);
    a = pow(core, 1.2);
    col = mix(dreamPalette(vT), vec3(0.94, 0.90, 1.0), 0.5) * vBright;
  } else {
    a = smoothstep(0.5, 0.0, r);
    a = pow(a, 1.5);
    col = dreamPalette(vT) * vBright;
  }
  fragColor = vec4(col * a, a);
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

const TRAIL_MAX = 96;

export class MosaicRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private prog: WebGLProgram;
  private cloudVao: WebGLVertexArrayObject;
  private posBuf: WebGLBuffer;
  private tBuf: WebGLBuffer;
  private loudBuf: WebGLBuffer;
  private trailVao: WebGLVertexArrayObject;
  private trailPosBuf: WebGLBuffer;
  private trailTBuf: WebGLBuffer;
  private trailFadeBuf: WebGLBuffer;
  private markVao: WebGLVertexArrayObject;
  private n = 0;
  private dpr = 1;
  private fitX = 1;
  private fitY = 1;
  private u: Record<string, WebGLUniformLocation | null> = {};

  // Trail ring buffer (JS side).
  private trailPos = new Float32Array(TRAIL_MAX * 2);
  private trailT = new Float32Array(TRAIL_MAX);
  private trailAge = new Float32Array(TRAIL_MAX); // frames since added
  private trailCount = 0;
  private trailHead = 0;

  private constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement, prog: WebGLProgram) {
    this.gl = gl;
    this.canvas = canvas;
    this.prog = prog;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    for (const name of [
      "uFit",
      "uPointScale",
      "uTime",
      "uMode",
      "uPlayhead",
      "uMarkPos",
      "uMarkT",
      "uMarkSize",
      "uMarkKind",
    ]) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }

    this.cloudVao = gl.createVertexArray()!;
    this.posBuf = gl.createBuffer()!;
    this.tBuf = gl.createBuffer()!;
    this.loudBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.cloudVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.loudBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

    this.trailVao = gl.createVertexArray()!;
    this.trailPosBuf = gl.createBuffer()!;
    this.trailTBuf = gl.createBuffer()!;
    this.trailFadeBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.trailVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailPosBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailTBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailFadeBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

    // Marker VAO — a single point whose attributes come from uniforms.
    this.markVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.markVao);

    gl.bindVertexArray(null);

    gl.clearColor(0, 0, 0, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  }

  static create(canvas: HTMLCanvasElement): MosaicRenderer | null {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) return null;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    return new MosaicRenderer(gl, canvas, prog);
  }

  setCorpus(positions: Float32Array, colorT: Float32Array, loud: Float32Array, n: number): void {
    const gl = this.gl;
    this.n = n;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colorT, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.loudBuf);
    gl.bufferData(gl.ARRAY_BUFFER, loud, gl.STATIC_DRAW);
    // A new corpus invalidates the old path.
    this.trailCount = 0;
    this.trailHead = 0;
  }

  /** Record a newly-chosen grain into the fading trail. */
  pushTrail(x: number, y: number, t: number): void {
    const h = this.trailHead;
    this.trailPos[h * 2] = x;
    this.trailPos[h * 2 + 1] = y;
    this.trailT[h] = t;
    this.trailAge[h] = 0;
    this.trailHead = (h + 1) % TRAIL_MAX;
    if (this.trailCount < TRAIL_MAX) this.trailCount++;
  }

  resize(): void {
    const gl = this.gl;
    const w = Math.floor(this.canvas.clientWidth * this.dpr);
    const h = Math.floor(this.canvas.clientHeight * this.dpr);
    if (w > 0 && h > 0 && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const cw = this.canvas.width || 1;
    const ch = this.canvas.height || 1;
    if (cw > ch) {
      this.fitX = (ch / cw) * 0.92;
      this.fitY = 0.92;
    } else {
      this.fitX = 0.92;
      this.fitY = (cw / ch) * 0.92;
    }
  }

  render(
    playhead: [number, number],
    targetPos: [number, number],
    active: number,
    timeSec: number,
  ): void {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.n === 0) return;
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uFit, this.fitX, this.fitY);
    gl.uniform1f(this.u.uPointScale, this.dpr);
    gl.uniform1f(this.u.uTime, timeSec);
    gl.uniform2f(this.u.uPlayhead, playhead[0], playhead[1]);

    // 1) Corpus cloud.
    gl.uniform1i(this.u.uMode, 0);
    gl.bindVertexArray(this.cloudVao);
    gl.drawArrays(gl.POINTS, 0, this.n);

    // 2) Fading trail — age the ring, pack live points, upload, draw.
    if (this.trailCount > 0) {
      const posArr = new Float32Array(this.trailCount * 2);
      const tArr = new Float32Array(this.trailCount);
      const fadeArr = new Float32Array(this.trailCount);
      let w = 0;
      // Walk the ring from oldest to newest.
      const start = this.trailCount < TRAIL_MAX ? 0 : this.trailHead;
      for (let k = 0; k < this.trailCount; k++) {
        const idx = (start + k) % TRAIL_MAX;
        this.trailAge[idx] += 1;
        const fade = Math.max(0, 1 - this.trailAge[idx] / 90);
        if (fade <= 0.001) continue;
        posArr[w * 2] = this.trailPos[idx * 2];
        posArr[w * 2 + 1] = this.trailPos[idx * 2 + 1];
        tArr[w] = this.trailT[idx];
        fadeArr[w] = fade;
        w++;
      }
      if (w > 0) {
        gl.uniform1i(this.u.uMode, 1);
        gl.bindVertexArray(this.trailVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.trailPosBuf);
        gl.bufferData(gl.ARRAY_BUFFER, posArr.subarray(0, w * 2), gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.trailTBuf);
        gl.bufferData(gl.ARRAY_BUFFER, tArr.subarray(0, w), gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.trailFadeBuf);
        gl.bufferData(gl.ARRAY_BUFFER, fadeArr.subarray(0, w), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.POINTS, 0, w);
      }
    }

    // 3) Markers — target (cool ring), then playhead (bright core).
    gl.bindVertexArray(this.markVao);
    gl.uniform1i(this.u.uMode, 2);

    gl.uniform2f(this.u.uMarkPos, targetPos[0], targetPos[1]);
    gl.uniform1f(this.u.uMarkT, 0.4);
    gl.uniform1f(this.u.uMarkSize, 34 + 10 * active);
    gl.uniform1f(this.u.uMarkKind, 1);
    gl.drawArrays(gl.POINTS, 0, 1);

    gl.uniform2f(this.u.uMarkPos, playhead[0], playhead[1]);
    gl.uniform1f(this.u.uMarkT, 0.85);
    gl.uniform1f(this.u.uMarkSize, (18 + 26 * active) * (0.9 + 0.1 * Math.sin(timeSec * 6)));
    gl.uniform1f(this.u.uMarkKind, 0);
    gl.drawArrays(gl.POINTS, 0, 1);

    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
