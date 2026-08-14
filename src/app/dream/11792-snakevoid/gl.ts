// ─────────────────────────────────────────────────────────────────────────────
// 11792-snakevoid · gl.ts — WebGL2 STATIC-LUMINANCE illusion field.
//
//   A single full-screen fragment shader draws concentric rings of repeated
//   micro-elements, each element a 4-step ASYMMETRIC luminance sawtooth in the
//   classic Kitaoka order:  black → dark-gray(slate) → white(ivory) → light-gray,
//   then a sharp drop back to black. That asymmetry is the whole trick: the human
//   motion system reads the gradual-ramp / sharp-edge polarity as self-motion, so
//   the field appears to ROTATE and BREATHE while the pixels are (essentially)
//   STATIC — the "peripheral drift illusion" (Faubert & Herbert 1999; Kitaoka's
//   "Rotating Snakes"). Adjacent rings reverse element order so the bands curl in
//   opposite directions, the signature snakes look.
//
//   The ONLY real temporal change the shader receives is:
//     • uDriftA / uDriftR — a *sub-threshold* phase drift accumulated on the CPU
//       and hard-capped there (page.tsx). This nudges the illusory speed; it is
//       far too slow to be seen as real motion or to flicker.
//     • uBreath — a ≤3 Hz soft-sine luminance multiplier straight from the shared
//       SafeFlicker engine. Never a strobe.
//   Freeze both (reduced motion) and the piece is a still image that still
//   "moves". That static-ness is the safety win and the point of the work.
//
//   PALETTE lives ONLY here: ivory / slate on deep indigo micro-contrast.
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldParams {
  /** Normalized ring radial width (fraction of the short screen axis). */
  ringWidth: number;
  /** 0..1 element contrast (rides the swell). Higher = more INTENSE. */
  contrast: number;
  /** ≤1 luminance multiplier from SafeFlicker (soft breath). */
  breath: number;
  /** Accumulated angular drift phase, in element units (sub-threshold). */
  driftA: number;
  /** Accumulated radial drift phase, in ring units (sub-threshold breathing). */
  driftR: number;
}

export interface FieldRenderer {
  readonly ok: boolean;
  resize(w: number, h: number): void;
  render(p: FieldParams): void;
  dispose(): void;
}

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aP;
void main(){ gl_Position = vec4(aP, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uRingWidth;
uniform float uContrast;
uniform float uBreath;
uniform float uDriftA;
uniform float uDriftR;

#define TWO_PI 6.28318530718

// cheap 1-D hash — deterministic per-ring angular offset, no CPU cost.
float hash11(float p){
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

void main(){
  float minDim = min(uRes.x, uRes.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / minDim;  // centre origin
  float r = length(p);
  float a = atan(p.y, p.x);

  // ── palette: deep indigo ground, ivory / slate micro-contrast ──────────────
  vec3 bg     = vec3(0.030, 0.035, 0.090);
  vec3 cBlack = vec3(0.018, 0.022, 0.058);
  vec3 cDark  = vec3(0.235, 0.265, 0.375); // slate
  vec3 cWhite = vec3(0.965, 0.955, 0.905); // ivory
  vec3 cLight = vec3(0.560, 0.585, 0.680); // light-gray
  vec3 mean   = (cBlack + cDark + cWhite + cLight) * 0.25;

  // ── concentric rings (radial drift = the breathing component) ──────────────
  float ringF = r / uRingWidth + uDriftR;
  float ring  = floor(ringF);
  float rFrac = fract(ringF);
  float rMid  = (ring + 0.5) * uRingWidth;

  // constant-arc element count -> micro-elements stay ~square as radius grows.
  float nElem = max(8.0, floor((TWO_PI * rMid) / uRingWidth));
  // alternate rings reverse direction -> the snakes curl oppositely.
  float dir = mod(ring, 2.0) < 1.0 ? 1.0 : -1.0;

  float angOff = hash11(ring + 1.7);
  float u = a / TWO_PI + 0.5 + angOff;
  float phase = u * nElem + dir * uDriftA;
  float eFrac = fract(phase * dir);          // reversed order on odd rings

  // ── 4-step asymmetric sawtooth: black, dark, white, light (antialiased) ────
  float q  = eFrac * 4.0;                      // 0..4 across the 4 sub-elements
  float w4 = fwidth(q) * 0.75 + 1e-4;          // derivative-based edge softening
  vec3 col = cBlack;
  col = mix(col, cDark,  smoothstep(1.0 - w4, 1.0 + w4, q));
  col = mix(col, cWhite, smoothstep(2.0 - w4, 2.0 + w4, q));
  col = mix(col, cLight, smoothstep(3.0 - w4, 3.0 + w4, q));
  // (the sharp light->black wrap at the seam is intentional: it IS the asymmetry)

  // contrast: pull toward the ring mean when the swell is low, expand when high.
  col = mix(mean, col, uContrast);

  // ── radial window: soft gaps between ring bodies so they read as snakes ────
  float edge = 0.14;
  float band = smoothstep(0.0, edge, rFrac) * smoothstep(1.0, 1.0 - edge, rFrac);
  col = mix(bg, col, band);

  // fade the degenerate centre disc + a gentle field vignette to the edges.
  col = mix(bg, col, smoothstep(uRingWidth * 0.4, uRingWidth * 1.6, r));
  col *= smoothstep(0.92, 0.28, r) * 0.35 + 0.65;

  // soft breath — a ≤3 Hz SafeFlicker luminance drift, never a strobe.
  col *= uBreath;

  fragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("snakevoid shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("snakevoid link error:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

export function makeFieldRenderer(canvas: HTMLCanvasElement): FieldRenderer | null {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, depth: false });
  if (!gl) return null;

  const prog = link(gl, VERT, FRAG);
  if (!prog) return null;

  // full-screen triangle
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const loc = (n: string) => gl.getUniformLocation(prog, n);
  const uRes = loc("uRes");
  const uRingWidth = loc("uRingWidth");
  const uContrast = loc("uContrast");
  const uBreath = loc("uBreath");
  const uDriftA = loc("uDriftA");
  const uDriftR = loc("uDriftR");

  let width = canvas.width || 1;
  let height = canvas.height || 1;
  let disposed = false;

  return {
    ok: true,
    resize(w: number, h: number) {
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },
    render(p: FieldParams) {
      if (disposed) return;
      gl.useProgram(prog);
      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uRingWidth, p.ringWidth);
      gl.uniform1f(uContrast, p.contrast);
      gl.uniform1f(uBreath, p.breath);
      gl.uniform1f(uDriftA, p.driftA);
      gl.uniform1f(uDriftR, p.driftR);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        gl.deleteBuffer(buf);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(prog);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* context already gone */
      }
    },
  };
}
