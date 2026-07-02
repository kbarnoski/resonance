// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the dark mirror. A WebGL2 pipeline that turns a face (webcam or the
// autonomous pseudo-face) into a Caputo strange-face dissolution.
//
//   Per frame, driven by ONE scalar `dissolve` (0 = clear, 1 = fully dissolved),
//   which the page raises the longer you hold still and snaps back on motion:
//
//     1) SOURCE   → the current face frame uploaded to a texture.
//     2) DISSOLVE → a fragment pass that (a) folds the image into N-fold radial
//        mirror symmetry (kaleidoscope; fold strength grows with `dissolve`),
//        (b) applies TROXLER FADING — the periphery is progressively blurred and
//        desaturated while the centre stays sharp — and (c) blends in the
//        previous frame through a slowly zooming, warping, hue-drifting optical
//        FEEDBACK loop (ping-pong). Weights sum to 1 so mean brightness is held
//        roughly constant (no strobing).
//     3) PRESENT  → the feedback buffer to screen, mirror-flipped like a real
//        reflection, under a soft vignette.
//
//   No strobe: `dissolve` moves slowly, the hue drift and warp are low-frequency,
//   and the feedback IIR is energy-preserving. Reduced-motion damps spin/warp.
// ─────────────────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const DISSOLVE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSrc;
uniform sampler2D uFeed;
uniform float uCanvasAspect;   // canvas w/h
uniform float uSrcAspect;      // source w/h
uniform float uDissolve;       // 0..1
uniform float uFoldMix;        // 0..1  how much the kaleidoscope fold applies
uniform float uFolds;          // radial symmetry order
uniform float uSpin;           // slow kaleidoscope rotation (radians)
uniform float uFeedMix;        // 0..1  feedback weight
uniform float uFeedZoom;       // per-frame zoom of the feedback tunnel
uniform float uWarpAmp;        // feedback warp amplitude
uniform float uHue;            // accumulated hue rotation (radians)
uniform float uTime;

const float TAU = 6.2831853;

// Cover-sample the source (uv in 0..1) so it fills the canvas without stretching.
vec3 coverSample(vec2 uv){
  vec2 t = uv - 0.5;
  if (uCanvasAspect > uSrcAspect) t.y *= uSrcAspect / uCanvasAspect;
  else t.x *= uCanvasAspect / uSrcAspect;
  vec2 s = t + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) return vec3(0.0);
  return texture(uSrc, s).rgb;
}

// A small ring blur of the source, radius in uv units.
vec3 blurSample(vec2 uv, float radius){
  vec3 sum = coverSample(uv);
  float wsum = 1.0;
  for (int i = 0; i < 8; i++){
    float a = float(i) / 8.0 * TAU;
    vec2 o = vec2(cos(a), sin(a)) * radius;
    sum += coverSample(uv + o) * 0.7;
    wsum += 0.7;
  }
  return sum / wsum;
}

vec3 hueRotate(vec3 c, float a){
  const vec3 k = vec3(0.57735);
  float cosA = cos(a);
  return c * cosA + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cosA);
}

void main(){
  // Aspect-correct centred coords so the fold is circular.
  vec2 c = vUv - 0.5;
  c.x *= uCanvasAspect;

  float rad = length(c);
  float ang = atan(c.y, c.x);

  // N-fold mirror kaleidoscope.
  float seg = TAU / max(uFolds, 1.0);
  float fa = mod(ang - uSpin, seg);
  fa = abs(fa - seg * 0.5);
  fa += uSpin;
  vec2 cFold = vec2(cos(fa), sin(fa)) * rad;
  vec2 cMix = mix(c, cFold, uFoldMix);

  // Back to uv for source sampling.
  vec2 uvSrc = vec2(cMix.x / uCanvasAspect, cMix.y) + 0.5;

  // TROXLER: periphery blurs + desaturates with dissolve; centre stays sharp.
  float periph = smoothstep(0.08, 0.62, rad) * uDissolve;
  vec3 sharp = coverSample(uvSrc);
  vec3 soft = blurSample(uvSrc, 0.006 + periph * 0.03);
  vec3 face = mix(sharp, soft, periph);
  float luma = dot(face, vec3(0.299, 0.587, 0.114));
  face = mix(face, vec3(luma), periph * 0.85);

  // Optical FEEDBACK: previous frame, zoomed in (tunnel), warped, hue-drifted.
  vec2 fuv = (vUv - 0.5) * (1.0 - uFeedZoom) + 0.5;
  fuv += uWarpAmp * vec2(
    sin(vUv.y * 6.2831 + uTime * 0.27),
    cos(vUv.x * 6.2831 + uTime * 0.31)
  );
  vec3 fb = texture(uFeed, fuv).rgb;
  fb = hueRotate(fb, uHue);

  // Energy-preserving blend (weights sum to 1) → stable mean brightness.
  vec3 col = mix(face, fb, uFeedMix);

  fragColor = vec4(col, 1.0);
}`;

const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform float uDissolve;

void main(){
  // Mirror-flip horizontally like a real reflection.
  vec2 uv = vec2(1.0 - vUv.x, vUv.y);
  vec3 col = texture(uTex, uv).rgb;

  // Soft vignette (constant, not modulated by dissolve → no flashing).
  vec2 d = vUv - 0.5;
  float vig = smoothstep(0.95, 0.35, length(d) * 1.25);
  col *= mix(0.28, 1.0, vig);

  // A faint cool cast in the shadows deepens the derealization as it dissolves.
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 tint = mix(col, col * vec3(0.82, 0.86, 1.08), (1.0 - luma) * uDissolve * 0.6);
  col = tint;

  fragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
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
  gl.bindAttribLocation(p, 0, "aPos");
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("program link failed: " + log);
  }
  return p;
}

interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
}

export class StrangeScene {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private container: HTMLElement;
  private dissolveProg: WebGLProgram;
  private presentProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private srcTex: WebGLTexture;
  private pp: [Target, Target];
  private write = 0;
  private rw = 0;
  private rh = 0;
  private hue = 0;
  private time = 0;
  private reduced: boolean;
  private dLoc: Record<string, WebGLUniformLocation | null> = {};
  private pLoc: Record<string, WebGLUniformLocation | null> = {};

  constructor(container: HTMLElement, reducedMotion: boolean) {
    this.container = container;
    this.reduced = reducedMotion;
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    container.appendChild(canvas);
    this.canvas = canvas;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    this.dissolveProg = link(gl, VERT, DISSOLVE_FRAG);
    this.presentProg = link(gl, VERT, PRESENT_FRAG);

    for (const n of [
      "uCanvasAspect", "uSrcAspect", "uDissolve", "uFoldMix", "uFolds",
      "uSpin", "uFeedMix", "uFeedZoom", "uWarpAmp", "uHue", "uTime",
      "uSrc", "uFeed",
    ]) {
      this.dLoc[n] = gl.getUniformLocation(this.dissolveProg, n);
    }
    for (const n of ["uTex", "uDissolve"]) {
      this.pLoc[n] = gl.getUniformLocation(this.presentProg, n);
    }

    // Fullscreen triangle.
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("vao alloc failed");
    this.vao = vao;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.srcTex = this.makeTex();
    this.rw = 2;
    this.rh = 2;
    this.pp = [this.makeTarget(), this.makeTarget()];
    this.resize();
  }

  private makeTex(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    if (!t) throw new Error("texture alloc failed");
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  private makeTarget(): Target {
    const gl = this.gl;
    const tex = this.makeTex();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, this.rw, this.rh, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, null,
    );
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error("fbo alloc failed");
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex };
  }

  resize(): void {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.max(2, Math.floor(this.container.clientWidth * dpr));
    const h = Math.max(2, Math.floor(this.container.clientHeight * dpr));
    if (w === this.canvas.width && h === this.canvas.height) return;
    this.canvas.width = w;
    this.canvas.height = h;
    // Internal feedback resolution capped for performance.
    const scale = Math.min(1, 1280 / Math.max(w, h));
    this.rw = Math.max(2, Math.floor(w * scale));
    this.rh = Math.max(2, Math.floor(h * scale));
    for (const t of this.pp) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, this.rw, this.rh, 0, gl.RGBA,
        gl.UNSIGNED_BYTE, null,
      );
      // Clear to black so the first feedback read is clean.
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private uploadSource(source: HTMLVideoElement | HTMLCanvasElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    try {
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source,
      );
    } catch {
      /* source not ready this frame — keep last upload */
    }
  }

  /** Render one frame. `dissolve` 0..1; dt in seconds. */
  render(
    source: HTMLVideoElement | HTMLCanvasElement,
    srcAspect: number,
    dissolve: number,
    dt: number,
  ): void {
    const gl = this.gl;
    this.time += dt;
    const d = Math.min(1, Math.max(0, dissolve));

    // Slow, energy-preserving parameter ramps (all low-frequency → no strobe).
    const rm = this.reduced ? 0.3 : 1;
    const foldMix = smoothstep(0.12, 0.55, d);
    const folds = 1 + d * 5; // 1 → 6-fold
    const spin = this.time * 0.05 * rm * (0.15 + d * 0.6);
    const feedMix = 0.35 + d * 0.5; // 0.35 → 0.85
    const feedZoom = (0.002 + d * 0.01) * rm;
    const warpAmp = d * 0.012 * rm;
    this.hue += dt * (0.02 + d * 0.16) * rm;

    this.uploadSource(source);

    const read = this.pp[this.write ^ 1];
    const target = this.pp[this.write];
    const canvasAspect = this.canvas.width / this.canvas.height;

    // ── DISSOLVE pass → feedback buffer ─────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, this.rw, this.rh);
    gl.useProgram(this.dissolveProg);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.uniform1i(this.dLoc.uSrc, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.uniform1i(this.dLoc.uFeed, 1);

    gl.uniform1f(this.dLoc.uCanvasAspect, canvasAspect);
    gl.uniform1f(this.dLoc.uSrcAspect, srcAspect > 0 ? srcAspect : 1);
    gl.uniform1f(this.dLoc.uDissolve, d);
    gl.uniform1f(this.dLoc.uFoldMix, foldMix);
    gl.uniform1f(this.dLoc.uFolds, folds);
    gl.uniform1f(this.dLoc.uSpin, spin);
    gl.uniform1f(this.dLoc.uFeedMix, feedMix);
    gl.uniform1f(this.dLoc.uFeedZoom, feedZoom);
    gl.uniform1f(this.dLoc.uWarpAmp, warpAmp);
    gl.uniform1f(this.dLoc.uHue, this.hue);
    gl.uniform1f(this.dLoc.uTime, this.time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ── PRESENT pass → screen ───────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.presentProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.uniform1i(this.pLoc.uTex, 0);
    gl.uniform1f(this.pLoc.uDissolve, d);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    this.write ^= 1;
  }

  dispose(): void {
    const gl = this.gl;
    try {
      gl.deleteProgram(this.dissolveProg);
      gl.deleteProgram(this.presentProg);
      gl.deleteTexture(this.srcTex);
      for (const t of this.pp) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
      gl.deleteVertexArray(this.vao);
    } catch {
      /* context already lost */
    }
    if (this.canvas.parentElement === this.container) {
      this.container.removeChild(this.canvas);
    }
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
