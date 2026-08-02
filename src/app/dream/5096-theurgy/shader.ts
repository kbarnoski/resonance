// ─────────────────────────────────────────────────────────────────────────────
// 5096 — Theurgy · shader.ts
// A WebGL2 fragment-shader "living plasma": domain-warped fBm crossed with
// concentric wave-interference sources fed from the fingertips. A kaleidoscopic
// angular fold gives the Klüver-style radial/spiral "form constant" geometry.
//
// Deliberately NOT a log-polar / exp() warp (that trick is over-used in the lab).
// The warp here is additive domain-warping of value noise plus a mirror fold.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_EMITTERS = 10;

export interface FieldParams {
  time: number;
  /** Flat [x0,y0, x1,y1, …] in normalized 0..1 frame space, length MAX_EMITTERS*2. */
  emitters: Float32Array;
  /** Per-emitter strength 0..1, length MAX_EMITTERS. */
  strengths: Float32Array;
  count: number;
  /** Kaleidoscope order (1 = chaotic, up to ~8 = highly ordered). */
  symmetry: number;
  /** Hue drift -1..1 inside the violet band. */
  hue: number;
  /** Overall energy 0..1. */
  intensity: number;
  /** Inward zoom, 1 = none. */
  zoom: number;
  /** Zoom / focus centre in normalized 0..1 frame space. */
  center: [number, number];
  /** Slow luminance multiplier (photosensitive-safe drift), ~0.7..1. */
  luma: number;
}

export interface FieldRenderer {
  resize(w: number, h: number): void;
  render(p: FieldParams): void;
  dispose(): void;
}

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;
uniform int   uCount;
uniform vec2  uEmit[${MAX_EMITTERS}];
uniform float uStr[${MAX_EMITTERS}];
uniform float uSym;
uniform float uHue;
uniform float uIntensity;
uniform float uZoom;
uniform vec2  uCenter;
uniform float uLuma;

// ---- value noise + fbm ------------------------------------------------------
float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for(int i = 0; i < 5; i++){
    v += a * vnoise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

// Mirror-fold a point into a wedge of size 2PI/sym — the kaleidoscope.
vec2 kfold(vec2 p, float sym){
  if(sym < 1.5) return p;
  float a = atan(p.y, p.x);
  float r = length(p);
  float w = 6.28318530718 / sym;
  a = mod(a, w);
  a = abs(a - w * 0.5);
  return vec2(cos(a), sin(a)) * r;
}

vec3 hsv2rgb(vec3 c){
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z * mix(vec3(1.0), rgb, c.y);
}

void main(){
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;

  // pinch zoom toward the focus centre
  vec2 c = vec2((uCenter.x * 2.0 - 1.0) * aspect, 1.0 - uCenter.y * 2.0);
  uv = (uv - c) / uZoom + c;

  vec2 fuv = kfold(uv, uSym);

  // domain-warped fBm plasma (additive warp, no log-polar)
  float t = uTime * 0.08;
  vec2 q = vec2(fbm(fuv * 1.4 + vec2(0.0, t)), fbm(fuv * 1.4 + vec2(5.2, -t)));
  vec2 r = vec2(
    fbm(fuv * 1.4 + 2.2 * q + vec2(1.7, 9.2) + t * 0.6),
    fbm(fuv * 1.4 + 2.2 * q + vec2(8.3, 2.8) - t * 0.6)
  );
  float base = fbm(fuv * 1.1 + 2.6 * r);

  // wave-interference + hot cores from each fingertip emitter
  float wave = 0.0;
  float glow = 0.0;
  for(int i = 0; i < ${MAX_EMITTERS}; i++){
    if(i >= uCount) break;
    float s = uStr[i];
    if(s <= 0.001) continue;
    vec2 e = uEmit[i];
    vec2 euv = vec2((e.x * 2.0 - 1.0) * aspect, 1.0 - e.y * 2.0);
    euv = kfold(euv, uSym);
    float dist = length(fuv - euv);
    wave += s * sin(dist * 26.0 - uTime * 2.4) / (1.0 + dist * 7.0);
    glow += s * 0.018 / (dist * dist + 0.004);
  }
  glow = min(glow, 2.2);

  float field = base + wave * (0.35 + 0.4 * uIntensity) + r.x * 0.25;

  // violet-band colour; hand height nudges hue, energy raises saturation/value
  float hue = 0.74 + uHue * 0.10 + 0.05 * sin(field * 3.0 + uTime * 0.13);
  float sat = clamp(0.9 - glow * 0.45 - uIntensity * 0.1, 0.25, 1.0);
  float val = clamp(0.12 + field * (0.35 + 0.35 * uIntensity) + glow * 0.6, 0.0, 1.0);
  vec3 col = hsv2rgb(vec3(hue, sat, val));

  // hot white-violet cores where fingertips concentrate energy
  col += glow * vec3(0.55, 0.35, 0.85);

  // gentle vignette to seat the field
  float vig = smoothstep(2.1, 0.2, length(uv));
  col *= 0.35 + 0.65 * vig;

  col *= uLuma;                       // slow, photosensitive-safe luminance drift
  col = pow(col, vec3(0.85));         // lift the low end for glow
  fragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    // Surface the error to the console but never crash the page.
    console.error("Theurgy shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function makeFieldRenderer(canvas: HTMLCanvasElement): FieldRenderer | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Theurgy program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  // fullscreen triangle
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(prog);

  const loc = (n: string) => gl.getUniformLocation(prog, n);
  const uResolution = loc("uResolution");
  const uTime = loc("uTime");
  const uCount = loc("uCount");
  const uEmit = loc("uEmit[0]");
  const uStr = loc("uStr[0]");
  const uSym = loc("uSym");
  const uHue = loc("uHue");
  const uIntensity = loc("uIntensity");
  const uZoom = loc("uZoom");
  const uCenter = loc("uCenter");
  const uLuma = loc("uLuma");

  return {
    resize(w: number, h: number) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },
    render(p: FieldParams) {
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, p.time);
      gl.uniform1i(uCount, p.count);
      gl.uniform2fv(uEmit, p.emitters);
      gl.uniform1fv(uStr, p.strengths);
      gl.uniform1f(uSym, p.symmetry);
      gl.uniform1f(uHue, p.hue);
      gl.uniform1f(uIntensity, p.intensity);
      gl.uniform1f(uZoom, p.zoom);
      gl.uniform2f(uCenter, p.center[0], p.center[1]);
      gl.uniform1f(uLuma, p.luma);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      try {
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        const ext = gl.getExtension("WEBGL_lose_context");
        ext?.loseContext();
      } catch {
        /* noop */
      }
    },
  };
}
