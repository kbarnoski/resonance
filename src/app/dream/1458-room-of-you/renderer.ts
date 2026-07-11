// ─────────────────────────────────────────────────────────────────────────────
// renderer.ts — the you-shaped cathedral, rendered as a luminous standing-wave
// volume in WebGL2 (hand-rolled, no three.js). A single fullscreen-triangle
// fragment shader:
//
//   • samples the 80×60 silhouette texture with a soft multi-tap blur → a glow
//     in the shape of your body;
//   • fills that shape with a slow standing-wave interference field emanating
//     from the presence centroid (two sources → visible nodes);
//   • sends an expanding ring through the room on every acoustic strike;
//   • cathedral-dim violet/aqua palette, breathing slowly, vignetted.
//
//   If WebGL2 is unavailable it degrades to a simple Canvas2D render so the
//   piece is still audio-VISUAL (never blank), and the caller keeps the audio.
// ─────────────────────────────────────────────────────────────────────────────

import type { Presence } from "./vision";

export interface RenderState {
  motion: number;
  size: number;
  bright: number;
  centroidX: number;
  centroidY: number;
  /** seconds since the last strike (drives the expanding ring). */
  strikeAge: number;
  /** intensity 0..1 of the last strike. */
  strikeAmp: number;
  reduced: boolean;
}

export interface RendererHandle {
  kind: "webgl2" | "canvas2d";
  resize(w: number, h: number): void;
  draw(p: Presence, s: RenderState, tSec: number): void;
  dispose(): void;
}

const VS = `#version 300 es
precision highp float;
void main() {
  // fullscreen triangle
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
out vec4 frag;
uniform vec2 uRes;
uniform float uTime;
uniform sampler2D uSil;
uniform vec2 uCentroid;   // 0..1, y-down
uniform float uMotion;
uniform float uSize;
uniform float uBright;
uniform float uStrikeAge;  // seconds
uniform float uStrikeAmp;  // 0..1
uniform float uReduced;

// soft blurred silhouette sample (kernel in sil-uv space)
float silBlur(vec2 uv, float rad) {
  float s = 0.0;
  s += texture(uSil, uv).r * 0.25;
  s += texture(uSil, uv + vec2( rad, 0.0)).r * 0.125;
  s += texture(uSil, uv + vec2(-rad, 0.0)).r * 0.125;
  s += texture(uSil, uv + vec2(0.0,  rad)).r * 0.125;
  s += texture(uSil, uv + vec2(0.0, -rad)).r * 0.125;
  s += texture(uSil, uv + vec2( rad,  rad)).r * 0.0625;
  s += texture(uSil, uv + vec2(-rad,  rad)).r * 0.0625;
  s += texture(uSil, uv + vec2( rad, -rad)).r * 0.0625;
  s += texture(uSil, uv + vec2(-rad, -rad)).r * 0.0625;
  return s;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;

  // sil is 4:3, y-down. Map screen uv → sil uv with a "cover" fit.
  float silAspect = 4.0 / 3.0;
  vec2 c = uv - 0.5;
  if (aspect > silAspect) c.y *= aspect / silAspect; else c.x *= silAspect / aspect;
  vec2 silUV = vec2(c.x + 0.5, 0.5 - c.y); // flip y (sil is top-down)

  float body = silBlur(silUV, 0.02);
  float halo = silBlur(silUV, 0.06);
  body = clamp(body * 1.3, 0.0, 1.0);
  halo = clamp(halo * 0.9, 0.0, 1.0);

  // interference sources anchored at the presence centroid
  vec2 cc = vec2(uCentroid.x - 0.5, uCentroid.y - 0.5);
  // two interference sources, offset horizontally by size
  float off = 0.06 + uSize * 0.14;
  vec2 s1 = vec2(cc.x - off, cc.y);
  vec2 s2 = vec2(cc.x + off, cc.y);
  vec2 fp = vec2(silUV.x - 0.5, silUV.y - 0.5);
  float d1 = length(fp - s1);
  float d2 = length(fp - s2);

  float spd = uReduced > 0.5 ? 0.25 : 0.7;
  float k = 40.0 - uSize * 16.0; // bigger room → longer wavelength
  float w1 = sin(d1 * k - uTime * spd);
  float w2 = sin(d2 * k - uTime * spd * 1.03);
  float standing = 0.5 + 0.5 * (w1 * w2); // interference → visible nodes

  // expanding strike ring
  float ringSpeed = uReduced > 0.5 ? 0.10 : 0.16;
  float rr = uStrikeAge * ringSpeed;
  float dc = length(fp);
  float ring = exp(-pow((dc - rr) / 0.045, 2.0)) * exp(-uStrikeAge * 0.9) * uStrikeAmp;

  // palette: aqua → violet by brightness, dim cathedral base
  vec3 aqua = vec3(0.45, 0.85, 0.92);
  vec3 violet = vec3(0.66, 0.52, 0.95);
  vec3 tint = mix(aqua, violet, clamp(uBright, 0.0, 1.0));

  // body glow modulated by the standing-wave field + a little motion shimmer
  float shimmer = 0.7 + 0.3 * uMotion;
  float glow = body * (0.35 + 0.65 * standing) * shimmer;
  vec3 col = tint * glow * 1.35;
  col += tint * halo * 0.28;          // soft bloom around the body
  col += vec3(0.8, 0.9, 1.0) * ring * 1.2; // luminous strike ring

  // cathedral background: dark radial nave, faint vertical light columns
  float vign = 1.0 - smoothstep(0.5, 1.15, length(uv - 0.5) * 1.6);
  vec3 bg = mix(vec3(0.015, 0.012, 0.03), vec3(0.05, 0.05, 0.09), vign);
  float columns = 0.5 + 0.5 * sin(uv.x * 22.0);
  bg += vec3(0.02, 0.02, 0.04) * columns * vign;
  col += bg;

  // slow breathing luminance (safe: sub-Hz, soft)
  float breathe = 0.86 + 0.14 * sin(uTime * 0.32);
  col *= breathe;

  // gentle tone-map + vignette
  col = col / (col + vec3(0.85));
  col *= 0.55 + 0.45 * vign;

  frag = vec4(col, 1.0);
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

function buildGL(canvas: HTMLCanvasElement): RendererHandle | null {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const u = {
    res: gl.getUniformLocation(prog, "uRes"),
    time: gl.getUniformLocation(prog, "uTime"),
    sil: gl.getUniformLocation(prog, "uSil"),
    centroid: gl.getUniformLocation(prog, "uCentroid"),
    motion: gl.getUniformLocation(prog, "uMotion"),
    size: gl.getUniformLocation(prog, "uSize"),
    bright: gl.getUniformLocation(prog, "uBright"),
    strikeAge: gl.getUniformLocation(prog, "uStrikeAge"),
    strikeAmp: gl.getUniformLocation(prog, "uStrikeAmp"),
    reduced: gl.getUniformLocation(prog, "uReduced"),
  };

  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.uniform1i(u.sil, 0);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  let texW = 0,
    texH = 0;

  const resize = (w: number, h: number) => {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  };

  const draw = (p: Presence, s: RenderState, tSec: number) => {
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (texW !== p.w || texH !== p.h) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, p.w, p.h, 0, gl.RED, gl.UNSIGNED_BYTE, p.silhouette);
      texW = p.w;
      texH = p.h;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, p.w, p.h, gl.RED, gl.UNSIGNED_BYTE, p.silhouette);
    }
    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.time, tSec);
    gl.uniform2f(u.centroid, s.centroidX, s.centroidY);
    gl.uniform1f(u.motion, s.motion);
    gl.uniform1f(u.size, s.size);
    gl.uniform1f(u.bright, s.bright);
    gl.uniform1f(u.strikeAge, s.strikeAge);
    gl.uniform1f(u.strikeAmp, s.strikeAmp);
    gl.uniform1f(u.reduced, s.reduced ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const dispose = () => {
    try {
      gl.deleteTexture(tex);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    } catch {
      /* ignore */
    }
  };

  return { kind: "webgl2", resize, draw, dispose };
}

// Canvas2D fallback — simple luminous silhouette + centroid ring. Keeps the
// piece audio-visual when WebGL2 is unavailable.
function buildCanvas2D(canvas: HTMLCanvasElement): RendererHandle {
  const ctx = canvas.getContext("2d")!;
  const resize = (w: number, h: number) => {
    canvas.width = w;
    canvas.height = h;
  };
  const draw = (p: Presence, s: RenderState, tSec: number) => {
    const w = canvas.width,
      h = canvas.height;
    ctx.fillStyle = "#05040c";
    ctx.fillRect(0, 0, w, h);
    const cw = w / p.w,
      ch = h / p.h;
    const breathe = 0.85 + 0.15 * Math.sin(tSec * 0.32);
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const v = p.silhouette[y * p.w + x] / 255;
        if (v > 0.08) {
          const b = v * breathe;
          const r = Math.floor(120 + s.bright * 60);
          const g = Math.floor(140 + (1 - s.bright) * 60);
          ctx.fillStyle = `rgba(${r},${g},240,${b * 0.8})`;
          ctx.fillRect(x * cw, y * ch, cw + 1, ch + 1);
        }
      }
    }
    // strike ring
    if (s.strikeAmp > 0.01) {
      const rr = s.strikeAge * 0.16 * Math.min(w, h);
      ctx.strokeStyle = `rgba(200,220,255,${Math.max(0, 0.5 - s.strikeAge * 0.4) * s.strikeAmp})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.centroidX * w, s.centroidY * h, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
  };
  const dispose = () => {
    /* nothing to free */
  };
  return { kind: "canvas2d", resize, draw, dispose };
}

export function createRenderer(canvas: HTMLCanvasElement): RendererHandle {
  const gl = buildGL(canvas);
  if (gl) return gl;
  return buildCanvas2D(canvas);
}
