// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the DISSOLVE renderer. A WebGL2 fullscreen fragment-shader pipeline
// that un-forms a silhouette mask into a log-polar form-constant field.
//
//   Driven by TWO scalars from the page:
//     • uPrecision (0..1) — the felt self/not-self boundary. Motion → high.
//     • uDepth     (0..1) — long-form dissolution accrued over sustained stillness.
//
//   Per frame (all low-frequency → no strobe; SAFETY):
//     1) DISSOLVE pass → feedback buffer. The mask is sampled twice: once SHARP
//        (present body) and once WARPED OUTWARD through the inverse log-polar
//        exp() map (`_shared/visionary/logpolar.ts` — the retina→V1 cortical map is a
//        complex log, so the body edge un-forms into cortical stripes/hexagons).
//        A honeycomb + tunnel FORM-CONSTANT field (Bressloff–Cowan / Klüver) is
//        mixed in as dissolution deepens. A ping-pong FEEDBACK read drifts the
//        previous frame outward down the tunnel with a hue twist → visionary trails.
//     2) PRESENT pass → screen, with a vignette, a slow safe luminance drift, and
//        a bright central "present tone" bloom that grows with precision.
//
//   Raw hex / near-white live ONLY inside the shader + canvas (allowed); all page
//   chrome uses semantic tokens.
// ─────────────────────────────────────────────────────────────────────────────

import { LOGPOLAR_GLSL } from "../_shared/visionary/logpolar";
import { GRAB_W, GRAB_H } from "./silhouette";

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

uniform sampler2D uMask;   // silhouette mask (.r)
uniform sampler2D uFeed;   // previous frame (ping-pong)
uniform float uAspect;     // canvas w/h
uniform float uPrecision;  // 0..1 felt boundary sharpness
uniform float uDepth;      // 0..1 long-form dissolution
uniform float uTime;       // seconds

${LOGPOLAR_GLSL}

// centered aspect coords -> mask uv (already mirror-flipped upstream in the grab)
vec2 pToUv(vec2 p){
  return vec2(p.x / uAspect, p.y) + 0.5;
}
float sampleMask(vec2 p){
  vec2 uv = pToUv(p);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(uMask, uv).r;
}

// violet → magenta → near-white art ramp
vec3 ramp(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.03, 0.01, 0.08);
  vec3 c1 = vec3(0.28, 0.06, 0.50);
  vec3 c2 = vec3(0.62, 0.22, 0.95);
  vec3 c3 = vec3(0.98, 0.78, 1.00);
  vec3 col = mix(c0, c1, smoothstep(0.0, 0.35, t));
  col = mix(col, c2, smoothstep(0.30, 0.70, t));
  col = mix(col, c3, smoothstep(0.65, 1.00, t));
  return col;
}

void main(){
  vec2 p = vUv - 0.5;
  p.x *= uAspect;
  float rad = length(p);

  float dis = 1.0 - uPrecision;                    // 0 sharp .. 1 dissolved
  // dissolution un-forms from the edge OUTWARD; deepened over sustained stillness
  float radial = smoothstep(0.02, 0.85, rad);
  float edgeDis = clamp(dis * (0.30 + 0.70 * radial) * (0.35 + 0.65 * uDepth)
                        + dis * 0.12, 0.0, 1.0);

  // slow drift of the whole warped field (well under any flicker band)
  float drift = uTime * (0.12 + 0.45 * uDepth);

  // --- present body: sharp mask ---
  float bodySharp = sampleMask(p);

  // --- dissolved body: pulled from a SMALLER log-radius so the edge blooms
  //     outward through the exp() warp, sheared along theta = it un-forms ---
  vec2 cx = screenToCortex(p);
  vec2 cxW = vec2(
    cx.x - edgeDis * (1.1 + 1.4 * uDepth),
    cx.y + sin(cx.x * 2.0 - drift) * 0.18 * edgeDis
  );
  vec2 pW = cortexToScreen(cxW);
  float bodyDis = max(sampleMask(pW), sampleMask(pW * 1.18));

  float body = mix(bodySharp, bodyDis, edgeDis);

  // --- form-constant field in cortical space: tunnel + spokes → honeycomb ---
  float freq = 5.5 + 7.0 * uDepth;
  float tunnel = formConstant(cx, 0.0, freq, -drift * 3.0);
  float spokes = formConstant(cx, 1.5708, freq * 0.5, drift * 1.4);
  float hive   = honeycomb(cx, freq * 0.55, drift * 2.0);
  float field  = mix(tunnel * 0.6 + spokes * 0.4, hive,
                     smoothstep(0.30, 0.95, uDepth));
  field *= smoothstep(0.0, 0.45, rad);             // stronger toward periphery

  // --- compose ---
  float bodyLum = body * (0.55 + 0.95 * uPrecision);
  vec3 bodyCol = ramp(0.34 + 0.5 * bodyLum + 0.15 * uPrecision) * bodyLum;

  float fieldLum = field * (0.14 + 0.62 * edgeDis + 0.24 * dis);
  vec3 fieldCol = ramp(0.40 + 0.45 * field + 0.20 * uDepth) * fieldLum;

  // intense pole: sharp body sits inside a brighter breakthrough surround
  vec3 col = bodyCol
           + fieldCol * (0.55 + 0.85 * (1.0 - edgeDis) * uPrecision + 0.85 * edgeDis);

  // --- feedback (visionary trails): previous frame drifting outward down the tunnel ---
  float zoom = 1.0 + 0.02 + 0.05 * uDepth;
  vec2 fc = vUv - 0.5;
  fc /= zoom;
  float tw = 0.008 + 0.05 * uDepth;                // slow rotational twist
  float cs = cos(tw), sn = sin(tw);
  fc = vec2(fc.x * cs - fc.y * sn, fc.x * sn + fc.y * cs);
  vec2 fuv = fc + 0.5;
  vec3 fb = texture(uFeed, fuv).rgb;
  fb = mix(fb, fb.brg, 0.10 * uDepth);             // hue rotation on the trail

  // brightest-wins persistence: bounded, and trails fade a fixed % each frame
  float persist = 0.84 + 0.11 * dis;
  vec3 outc = max(col, fb * persist);

  fragColor = vec4(outc, 1.0);
}`;

const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform float uAspect;
uniform float uPrecision;
uniform float uLum;        // safe slow luminance drift, [floor,1]

void main(){
  vec3 col = texture(uTex, vUv).rgb;

  vec2 d = vUv - 0.5;
  d.x *= uAspect;
  float r = length(d);

  float vig = smoothstep(1.15, 0.15, r);
  col *= mix(0.22, 1.0, vig);

  // present tone: a bright violet central focus that grows with precision
  float focus = uPrecision * smoothstep(0.55, 0.0, r);
  col += vec3(0.85, 0.60, 1.00) * focus * 0.30;

  col *= uLum;
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

export class DissolveScene {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private container: HTMLElement;
  private dissolveProg: WebGLProgram;
  private presentProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private maskTex: WebGLTexture;
  private pp: [Target, Target];
  private write = 0;
  private rw = 2;
  private rh = 2;
  private time = 0;
  private dLoc: Record<string, WebGLUniformLocation | null> = {};
  private pLoc: Record<string, WebGLUniformLocation | null> = {};

  constructor(container: HTMLElement) {
    this.container = container;
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
      "uMask", "uFeed", "uAspect", "uPrecision", "uDepth", "uTime",
    ]) {
      this.dLoc[n] = gl.getUniformLocation(this.dissolveProg, n);
    }
    for (const n of ["uTex", "uAspect", "uPrecision", "uLum"]) {
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

    // Mask texture (uploaded from a CPU Uint8Array each frame).
    this.maskTex = this.makeTex();
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, GRAB_W, GRAB_H, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, null,
    );

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
    const scale = Math.min(1, 1280 / Math.max(w, h));
    this.rw = Math.max(2, Math.floor(w * scale));
    this.rh = Math.max(2, Math.floor(h * scale));
    for (const t of this.pp) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, this.rw, this.rh, 0, gl.RGBA,
        gl.UNSIGNED_BYTE, null,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Render one frame. `mask` is GRAB_W×GRAB_H RGBA; scalars 0..1; dt seconds. */
  render(
    mask: Uint8Array,
    precision: number,
    depth: number,
    lum: number,
    dt: number,
  ): void {
    const gl = this.gl;
    this.time += dt;
    const pr = Math.min(1, Math.max(0, precision));
    const dp = Math.min(1, Math.max(0, depth));
    const canvasAspect = this.canvas.width / this.canvas.height;

    // Upload the current mask.
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, GRAB_W, GRAB_H, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, mask,
    );

    const read = this.pp[this.write ^ 1];
    const target = this.pp[this.write];

    // ── DISSOLVE pass → feedback buffer ──────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, this.rw, this.rh);
    gl.useProgram(this.dissolveProg);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(this.dLoc.uMask, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.uniform1i(this.dLoc.uFeed, 1);

    gl.uniform1f(this.dLoc.uAspect, canvasAspect);
    gl.uniform1f(this.dLoc.uPrecision, pr);
    gl.uniform1f(this.dLoc.uDepth, dp);
    gl.uniform1f(this.dLoc.uTime, this.time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ── PRESENT pass → screen ────────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.presentProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.uniform1i(this.pLoc.uTex, 0);
    gl.uniform1f(this.pLoc.uAspect, canvasAspect);
    gl.uniform1f(this.pLoc.uPrecision, pr);
    gl.uniform1f(this.pLoc.uLum, lum);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    this.write ^= 1;
  }

  dispose(): void {
    const gl = this.gl;
    try {
      gl.deleteProgram(this.dissolveProg);
      gl.deleteProgram(this.presentProg);
      gl.deleteTexture(this.maskTex);
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
