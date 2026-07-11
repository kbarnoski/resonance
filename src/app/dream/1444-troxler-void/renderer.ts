// ─────────────────────────────────────────────────────────────────────────────
// renderer.ts · draws the ultra-low-contrast Ganzfeld field for 1444-troxler-void.
//
// Two implementations behind one interface:
//   • WebGL2 — a full-viewport fragment shader. A slow fbm colour-drift rides
//     over a near-uniform mean field; the drift's amplitude and saturation in
//     each region are scaled DOWN by that region's adaptation (sampled from the
//     field's N×N texture), so still regions decay to the flat void colour while
//     freshly-touched regions keep their faint structure. A soft pointer bloom
//     re-brightens under the cursor. Value-noise dither kills banding.
//   • Canvas2D — a low-res software fallback that computes the same idea per
//     pixel into a small ImageData and upscales it with smoothing, giving the
//     same soft Ganzfeld glow when WebGL2 is unavailable.
//
// Palette: cosmic-ambient — indigo / violet / warm-grey over near-black. No hard
// edges, no bright flashes; only sub-Hz luminance drift (photosensitive-safe).
// ─────────────────────────────────────────────────────────────────────────────

import type { AdaptField } from "./field";

export interface FieldRenderer {
  readonly mode: "webgl2" | "canvas2d";
  resize(w: number, h: number): void;
  draw(f: AdaptField, timeSec: number, reduced: boolean): void;
  dispose(): void;
}

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime;
uniform sampler2D uAdapt;   // N×N adaptation, R channel 0..1
uniform vec2  uPointer;     // normalised, top-left origin
uniform float uEnergy;      // pointer bloom 0..1
uniform float uReduced;     // 1.0 if prefers-reduced-motion

// hash + value noise + fbm — cheap, no textures.
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = p * 2.02 + vec2(11.7, 3.1);
    amp *= 0.5;
  }
  return v;
}

void main() {
  // Top-left origin uv so pointer + adapt texture agree with the CPU field.
  vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
  float aspect = uRes.x / uRes.y;

  float adapt = texture(uAdapt, uv).r;

  // Slow drifting field coordinates — sub-Hz, doubly slow under reduced motion.
  float sp = mix(1.0, 0.4, uReduced);
  vec2 q = vec2(uv.x * aspect, uv.y) * 3.0;
  float t = uTime * 0.05 * sp;
  float n1 = fbm(q + vec2(t, -t * 0.6));
  float n2 = fbm(q * 0.6 - vec2(t * 0.4, t) + 21.0);

  // The near-uniform mean field: a warm-grey indigo over near-black.
  vec3 nearBlack = vec3(0.018, 0.017, 0.030);
  vec3 mean      = vec3(0.085, 0.072, 0.125);   // indigo Ganzfeld glow
  vec3 indigo    = vec3(0.115, 0.090, 0.210);
  vec3 violet    = vec3(0.165, 0.095, 0.180);
  vec3 warmGrey  = vec3(0.140, 0.120, 0.120);

  // Faint chromatic structure from the drift (this is what fades away).
  vec3 tint = mix(indigo, violet, n1);
  tint = mix(tint, warmGrey, n2 * 0.7);
  float lum = (n1 * 0.6 + n2 * 0.4 - 0.5);        // signed luminance deviation

  // Region contrast collapses toward the flat mean as adaptation rises.
  float contrast = pow(1.0 - adapt, 1.6);          // Troxler fade
  vec3 field = mean + (tint - mean) * (0.55 * contrast) + lum * 0.09 * contrast;

  // Pointer bloom — the touched region re-forms: brighter, more saturated.
  vec2 pd = (uv - uPointer) * vec2(aspect, 1.0);
  float bloom = exp(-dot(pd, pd) * 11.0) * uEnergy;
  field += (tint - mean) * bloom * 0.5;
  field += vec3(0.05, 0.045, 0.075) * bloom;

  // Ganzfeld vignette — the periphery sinks toward near-black (aids the fade).
  vec2 cc = (uv - 0.5) * vec2(aspect, 1.0);
  float vig = smoothstep(0.95, 0.30, length(cc) * 1.15);
  vec3 col = mix(nearBlack, field, 0.35 + 0.65 * vig);

  // Dither to defeat 8-bit banding in the very dark, very flat field.
  float dither = (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  col += dither;

  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
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

function makeWebglRenderer(
  gl: WebGL2RenderingContext,
  n: number,
): FieldRenderer | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }

  // Full-viewport triangle pair.
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, n, n, 0, gl.RED, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uAdapt = gl.getUniformLocation(prog, "uAdapt");
  const uPointer = gl.getUniformLocation(prog, "uPointer");
  const uEnergy = gl.getUniformLocation(prog, "uEnergy");
  const uReduced = gl.getUniformLocation(prog, "uReduced");

  let vw = 1;
  let vh = 1;

  return {
    mode: "webgl2",
    resize(w, h) {
      vw = w;
      vh = h;
      gl.viewport(0, 0, w, h);
    },
    draw(f, timeSec, reduced) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        f.n,
        f.n,
        gl.RED,
        gl.UNSIGNED_BYTE,
        f.tex,
      );
      gl.uniform1i(uAdapt, 0);
      gl.uniform2f(uRes, vw, vh);
      gl.uniform1f(uTime, timeSec);
      gl.uniform2f(uPointer, f.pointerX, f.pointerY);
      const bloom = Math.max(f.energy, f.bloom * 0.4);
      gl.uniform1f(uEnergy, Math.min(1, bloom));
      gl.uniform1f(uReduced, reduced ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(prog);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteTexture(tex);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    },
  };
}

// ── Canvas2D fallback ─────────────────────────────────────────────────────────
// Same recipe, computed per pixel into a small buffer then upscaled softly.
function hash2d(x: number, y: number): number {
  let px = ((x * 123.34) % 1 + 1) % 1;
  let py = ((y * 345.45) % 1 + 1) % 1;
  const d = px * (px + 34.345) + py * (py + 34.345);
  px = (px + d) % 1;
  py = (py + d) % 1;
  return ((px * py * 4096) % 1 + 1) % 1;
}

function makeCanvasRenderer(
  ctx: CanvasRenderingContext2D,
): FieldRenderer {
  const LW = 96; // low-res buffer width (upscaled with smoothing → soft)
  let LH = 96;
  let img = ctx.createImageData(LW, LH);
  let vw = 1;
  let vh = 1;
  // one persistent offscreen buffer, re-sized with the field (no per-frame alloc)
  const tmp = document.createElement("canvas");
  tmp.width = LW;
  tmp.height = LH;

  return {
    mode: "canvas2d",
    resize(w, h) {
      vw = w;
      vh = h;
      LH = Math.max(24, Math.round((LW * h) / Math.max(1, w)));
      img = ctx.createImageData(LW, LH);
      tmp.height = LH;
    },
    draw(f, timeSec, reduced) {
      const sp = reduced ? 0.4 : 1;
      const t = timeSec * 0.05 * sp;
      const n = f.n;
      const data = img.data;
      const aspect = vw / vh;
      for (let py = 0; py < LH; py++) {
        const uy = (py + 0.5) / LH;
        for (let px = 0; px < LW; px++) {
          const ux = (px + 0.5) / LW;
          // nearest-cell adaptation (bilinear not needed — upscale smooths it)
          const ci = Math.min(n - 1, (ux * n) | 0);
          const cj = Math.min(n - 1, (uy * n) | 0);
          const adapt = f.adapt[cj * n + ci];

          const qx = ux * aspect * 3;
          const qy = uy * 3;
          const nA = hash2d(qx + t, qy - t * 0.6);
          const nB = hash2d(qx * 0.6 - t * 0.4 + 2.1, qy - t + 2.1);
          const contrast = Math.pow(1 - adapt, 1.6);

          // indigo→violet→warm-grey around the mean
          const mr = 0.085, mg = 0.072, mb = 0.125;
          const tr = 0.115 + nA * 0.05 + nB * 0.02;
          const tg = 0.09 + nA * 0.005;
          const tb = 0.21 - nA * 0.03;
          let r = mr + (tr - mr) * 0.55 * contrast;
          let g = mg + (tg - mg) * 0.55 * contrast;
          let b = mb + (tb - mb) * 0.55 * contrast;

          // pointer / idle bloom
          const pdx = (ux - f.pointerX) * aspect;
          const pdy = uy - f.pointerY;
          const bloomAmt =
            Math.exp(-(pdx * pdx + pdy * pdy) * 11) *
            Math.min(1, Math.max(f.energy, f.bloom * 0.4));
          r += (tr - mr) * bloomAmt * 0.5 + 0.05 * bloomAmt;
          g += (tg - mg) * bloomAmt * 0.5 + 0.045 * bloomAmt;
          b += (tb - mb) * bloomAmt * 0.5 + 0.075 * bloomAmt;

          // vignette toward near-black
          const cx = (ux - 0.5) * aspect;
          const cy = uy - 0.5;
          const vd = Math.sqrt(cx * cx + cy * cy) * 1.15;
          const vig = Math.min(1, Math.max(0, (0.95 - vd) / 0.65));
          const mixv = 0.35 + 0.65 * vig;
          r = 0.018 + (r - 0.018) * mixv;
          g = 0.017 + (g - 0.017) * mixv;
          b = 0.03 + (b - 0.03) * mixv;

          const o = (py * LW + px) * 4;
          data[o] = Math.min(255, Math.max(0, r * 255));
          data[o + 1] = Math.min(255, Math.max(0, g * 255));
          data[o + 2] = Math.min(255, Math.max(0, b * 255));
          data[o + 3] = 255;
        }
      }
      // Paint the low-res buffer, then upscale it smoothly over the full canvas.
      const tctx = tmp.getContext("2d");
      if (!tctx) return;
      tctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, vw, vh);
      ctx.drawImage(tmp, 0, 0, vw, vh);
    },
    dispose() {
      /* nothing retained */
    },
  };
}

/** Build the best available renderer for the canvas. Prefers WebGL2, falls back
 *  to Canvas2D. Returns null only if neither context is obtainable. */
export function makeRenderer(
  canvas: HTMLCanvasElement,
  n: number,
): FieldRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    powerPreference: "low-power",
  });
  if (gl) {
    const r = makeWebglRenderer(gl, n);
    if (r) return r;
  }
  const ctx = canvas.getContext("2d");
  if (ctx) return makeCanvasRenderer(ctx);
  return null;
}
