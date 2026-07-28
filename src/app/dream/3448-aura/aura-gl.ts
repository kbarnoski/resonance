// ════════════════════════════════════════════════════════════════════════════
// aura-gl.ts — raw WebGL2 (#version 300 es) glow-aura renderer for 3448-aura.
//
// Takes the silhouette as an R8 mask texture and renders a golden-spiral / bloom
// glow around the shape on the Resonance violet ramp. The raw camera frame is
// NEVER uploaded — only the derived binary mask. A slow luminance drift (<=0.11
// Hz, no strobe) breathes the whole field; prefers-reduced-motion flattens it.
//
// The shader source is a plain template literal with NO nested backticks and no
// ${} interpolation except the palette helper (whose value contains no
// backticks), so the template can never be broken by the GLSL text.
// ════════════════════════════════════════════════════════════════════════════

import { PALETTE_GLSL } from "../_shared/palette";
import { MASK_W, MASK_H } from "./silhouette";

const VERT_SRC = `#version 300 es
precision highp float;
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG_SRC =
  `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uMask;   // R8 silhouette, .r in [0,1]
uniform vec2  uRes;        // canvas pixel size
uniform float uTime;       // seconds
uniform float uArea;       // 0..1
uniform float uComplexity; // 0..1 (brightness)
uniform float uReach;      // 0..1
uniform vec2  uCentroid;   // 0..1, y=0 top
uniform float uReduce;     // 1.0 = reduced motion

const float TAU = 6.28318530718;
const float GOLDEN = 2.39996322973; // golden angle in radians
` +
  PALETTE_GLSL +
  `
// Multi-ring blur of the mask → a soft glow field. Sampling the small R8 mask
// with LINEAR filtering already softens edges; a few rings extend the halo.
float glowField(vec2 uv) {
  float acc = texture(uMask, uv).r * 1.4;
  float wsum = 1.4;
  // aspect-correct offsets so the halo is round, not squashed.
  vec2 px = vec2(1.0) / vec2(float(MASK_W_C), float(MASK_H_C));
  for (int ring = 1; ring <= 3; ring++) {
    float rad = float(ring) * 2.4;
    float w = 1.0 / (1.0 + float(ring) * float(ring) * 0.9);
    for (int k = 0; k < 8; k++) {
      float a = (float(k) / 8.0) * TAU;
      vec2 off = vec2(cos(a), sin(a)) * rad * px;
      acc += texture(uMask, uv + off).r * w;
      wsum += w;
    }
  }
  return acc / wsum;
}

void main() {
  // uv with y=0 at TOP so it matches the mask + centroid convention.
  vec2 uv = gl_FragCoord.xy / uRes;
  uv.y = 1.0 - uv.y;

  float m = texture(uMask, uv).r;      // inside-body membership (soft)
  float g = glowField(uv);             // spreading halo

  // Golden-spiral modulation around the centroid — faint radiant streaks.
  vec2 d = uv - uCentroid;
  d.x *= uRes.x / uRes.y;              // aspect-correct the spiral
  float ang = atan(d.y, d.x);
  float rad = length(d);
  float drift = uReduce > 0.5 ? 0.0 : uTime;
  float spiral = 0.5 + 0.5 * sin(ang * 3.0 + rad * 22.0 - GOLDEN * 2.0 + drift * 0.4);
  float streaks = 0.5 + 0.5 * sin(ang * GOLDEN * 3.0 - rad * 30.0 + drift * 0.25);

  // Compose intensity: bright rim, gentle interior fill, spreading outer bloom.
  float rim = smoothstep(0.35, 0.62, g) * (1.0 - smoothstep(0.72, 0.98, m));
  float fill = m * (0.28 + 0.22 * uArea);
  float halo = pow(g, 1.6) * (0.5 + 0.5 * spiral) * (0.7 + 0.5 * uReach);
  float intensity = fill + rim * 1.15 + halo * 0.9;
  intensity += halo * streaks * 0.18;  // golden filaments in the bloom
  intensity = clamp(intensity, 0.0, 1.6);

  // Colour position along the violet ramp: complexity/brightness pushes it up.
  float tone = 0.2 + uComplexity * 0.55 + intensity * 0.28 + uReach * 0.08;
  vec3 col = dreamPalette(clamp(tone, 0.0, 1.0)) * intensity;

  // Deep-violet backdrop so empty space is never flat black.
  vec3 backdrop = vec3(0.028, 0.018, 0.05);
  col += backdrop * (1.0 - clamp(intensity, 0.0, 1.0));

  // Slow, safe luminance drift (<=0.11 Hz). Frozen under reduced motion.
  float lum = uReduce > 0.5 ? 1.0 : (0.9 + 0.1 * sin(uTime * TAU * 0.09));
  col *= lum;

  // Soft radial vignette to seat the aura in the frame.
  float vig = smoothstep(1.25, 0.2, length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0)));
  col *= mix(0.55, 1.0, vig);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export interface AuraGL {
  render(opts: {
    mask: Uint8Array;
    time: number;
    area: number;
    complexity: number;
    reach: number;
    cx: number;
    cy: number;
    reduceMotion: boolean;
  }): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "unknown";
    gl.deleteShader(sh);
    throw new Error("shader compile error: " + log);
  }
  return sh;
}

/** Build the aura renderer. Returns null if WebGL2 is unavailable. */
export function createAuraGL(canvas: HTMLCanvasElement): AuraGL | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) return null;

  // Inject the mask dimensions as compile-time constants.
  const fragWithDims = FRAG_SRC.replace(/MASK_W_C/g, String(MASK_W)).replace(
    /MASK_H_C/g,
    String(MASK_H),
  );

  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragWithDims);
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "unknown";
    throw new Error("program link error: " + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.useProgram(prog);

  // Fullscreen triangle.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const uMask = gl.getUniformLocation(prog, "uMask");
  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uArea = gl.getUniformLocation(prog, "uArea");
  const uComplexity = gl.getUniformLocation(prog, "uComplexity");
  const uReach = gl.getUniformLocation(prog, "uReach");
  const uCentroid = gl.getUniformLocation(prog, "uCentroid");
  const uReduce = gl.getUniformLocation(prog, "uReduce");

  // R8 mask texture, LINEAR so the low-res silhouette upscales smoothly.
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, MASK_W, MASK_H, 0, gl.RED, gl.UNSIGNED_BYTE, null);
  gl.uniform1i(uMask, 0);

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cssW = canvas.clientWidth || 640;
  let cssH = canvas.clientHeight || 480;

  function applySize() {
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    gl!.viewport(0, 0, canvas.width, canvas.height);
  }
  applySize();

  return {
    render({ mask, time, area, complexity, reach, cx, cy, reduceMotion }) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MASK_W, MASK_H, gl.RED, gl.UNSIGNED_BYTE, mask);

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uArea, area);
      gl.uniform1f(uComplexity, complexity);
      gl.uniform1f(uReach, reach);
      gl.uniform2f(uCentroid, cx, cy);
      gl.uniform1f(uReduce, reduceMotion ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize(w: number, h: number) {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = w;
      cssH = h;
      applySize();
    },
    dispose() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    },
  };
}
