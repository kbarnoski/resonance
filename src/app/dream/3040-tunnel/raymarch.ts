// ─────────────────────────────────────────────────────────────────────────────
// 3040 · tunnel — raymarch.ts
//
// A single full-screen WebGL2 fragment shader that sphere-traces a camera flying
// down an INFINITE tube SDF on a slow Lissajous path — an endless wormhole with:
//
//   • a being-of-light core far down the tube that blooms as you approach,
//   • exponential depth fog that thins toward the light,
//   • fake gravitational light-bending — each march step nudges the ray toward
//     the core, so the geometry "pulls" (a lensing feel; the browser
//     black-hole-lensing raymarch lineage), harder as you commit,
//   • an animated tunnel-vision vignette that constricts the periphery,
//   • tube walls textured with cheap drifting striations / caustics (procedural
//     value noise in GLSL — no textures).
//
// The camera Z (travel) and the striation clock are integrated in JS with the
// time-dilated dt, so when the pilot goes still the flight AND the wall drift
// slow together. Colour is drawn from the shared brand violet ramp.
//
// Degrades to a Canvas2D concentric-tunnel (makeTunnelFallback) that answers the
// same uniforms when WebGL2 is unavailable or the shader fails to compile.
// ─────────────────────────────────────────────────────────────────────────────

import { PALETTE_GLSL } from "../_shared/palette";

export interface TunnelUniforms {
  /** Striation clock, seconds (already time-dilated by the caller). */
  time: number;
  /** Accumulated travel down the tube (already time-dilated by the caller). */
  camZ: number;
  /** Heading offset from steering, each component ~[-1, 1]. */
  heading: [number, number];
  /** Commitment toward the light, 0 (void) .. 1 (blooming). */
  approach: number;
  /** prefers-reduced-motion — disables the clarity/bloom snap, softens vignette. */
  reduced: boolean;
}

export interface TunnelHandle {
  render: (u: TunnelUniforms) => void;
  resize: () => void;
  dispose: () => void;
}

const VERT = `#version 300 es
precision highp float;
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main() { gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uCamZ;
uniform vec2  uHeading;
uniform float uApproach;
uniform float uReduced;

${PALETTE_GLSL}

const int   STEPS   = 96;
const float TUBE_R  = 3.2;
const float PI      = 3.14159265359;

// ── cheap procedural value noise (no textures) ──────────────────────────────
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  vec4 lo = mix(vec4(n000, n010, n001, n011), vec4(n100, n110, n101, n111), f.x);
  vec2 y  = mix(lo.xz, lo.yw, f.y);
  return mix(y.x, y.y, f.z);
}
float fbm(vec3 p) {
  float a = 0.0;
  float w = 0.5;
  for (int i = 0; i < 3; i++) {
    a += w * vnoise(p);
    p *= 2.02;
    w *= 0.5;
  }
  return a;
}

// The tube centreline — a slow Lissajous wander so the wormhole never repeats.
vec2 path(float z) {
  return vec2(
    sin(z * 0.09) * 2.1 + sin(z * 0.037) * 1.2,
    cos(z * 0.062) * 1.9 + sin(z * 0.021) * 1.0
  );
}

// Signed distance to the tube wall (>0 inside the tube). Cheap animated wobble
// gives the walls organic ridges without a full noise call per march step.
float mapTunnel(vec3 p) {
  vec2 c = path(p.z);
  vec2 rel = p.xy - c;
  float r = length(rel);
  float ang = atan(rel.y, rel.x);
  float wob = 0.24 * sin(ang * 5.0 + p.z * 0.6)
            + 0.14 * sin(ang * 9.0 - p.z * 0.35 + uTime * 0.25);
  return (TUBE_R + wob) - r;
}

// Wall shading — drifting striations + caustic sheen on the brand violet ramp.
vec3 shadeWall(vec3 p) {
  vec2 c = path(p.z);
  vec2 rel = p.xy - c;
  float ang = atan(rel.y, rel.x);
  float n = fbm(vec3(ang * 1.6, p.z * 0.5 - uTime * 0.35, 0.0));
  float stri = 0.5 + 0.5 * sin(ang * 7.0 + p.z * 0.7 + n * 3.0);
  float t = clamp(0.24 + 0.5 * n + 0.18 * stri, 0.0, 1.0);
  vec3 base = dreamPalette(t);
  base += 0.16 * stri * vec3(0.5, 0.4, 0.72); // caustic sheen
  return base;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uRes) / uRes.y;

  float approach = clamp(uApproach, 0.0, 1.0);
  float reduced = clamp(uReduced, 0.0, 1.0);

  // Camera rides the centreline; forward is the path tangent.
  float camZ = uCamZ;
  vec3 ro = vec3(path(camZ), camZ);
  vec2 dp = path(camZ + 0.5) - path(camZ - 0.5);
  vec3 fwd = normalize(vec3(dp, 1.0));
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);

  // Steering tilts the aim; screen uv fans the rays out from it.
  vec3 aim = normalize(fwd + right * uHeading.x * 0.85 + up * uHeading.y * 0.85);
  vec3 rd = normalize(aim * 1.35 + right * uv.x + up * uv.y);

  // The being-of-light core sits down the tube on the path. It draws nearer and
  // burns brighter as you commit toward it.
  float coreDist = mix(27.0, 7.5, approach);
  float coreZ = camZ + coreDist;
  vec3 core = vec3(path(coreZ), coreZ);

  float bend = 0.35 + approach * 1.7;          // gravitational pull, harder near light
  float fogDensity = mix(0.055, 0.02, approach); // fog thins toward the light

  vec3 p = ro;
  vec3 dir = rd;
  float travel = 0.0;
  float glow = 0.0;
  float wallHit = 0.0;
  float coreReached = 0.0;
  vec3 wallCol = vec3(0.0);

  for (int i = 0; i < STEPS; i++) {
    vec3 toCore = core - p;
    float cd = length(toCore);
    vec3 nToCore = toCore / max(cd, 0.001);

    // Volumetric core radiance, fogged by how far we have travelled.
    float fogHere = exp(-travel * fogDensity);
    glow += (0.9 / (cd * cd + 0.35)) * fogHere;

    if (cd < 0.75) { coreReached = 1.0; break; }

    // Fake gravitational lensing: nudge the ray toward the core each step.
    dir = normalize(dir + nToCore * bend * 0.055);

    float d = mapTunnel(p);
    if (d < 0.03) {
      wallHit = 1.0;
      wallCol = shadeWall(p) * fogHere;
      break;
    }
    float step = clamp(d * 0.7, 0.05, 0.5);
    p += dir * step;
    travel += step;
  }

  // Compose: fogged walls + volumetric corona + the core flash on arrival.
  vec3 coreCol = mix(vec3(0.72, 0.6, 1.0), vec3(1.0, 0.97, 1.0), approach);
  vec3 col = wallCol * (0.55 + 0.45 * wallHit);
  col += coreCol * glow * (0.05 + 0.13 * approach);

  // The clarity/bloom snap on true arrival — softened hard under reduced-motion.
  float snap = mix(1.0, 0.35, reduced);
  if (coreReached > 0.5) {
    col += coreCol * (1.3 + 3.2 * approach) * snap;
  }

  // Animated tunnel-vision vignette — constricts as you go deeper toward light.
  float vigR = mix(1.08, 0.5, approach);
  float edge = smoothstep(vigR * 0.45, vigR, length(uv));
  float vig = mix(1.0, 1.0 - edge, mix(0.85, 0.55, reduced));
  col *= vig;

  // Filmic-ish tonemap keeps swells bounded below full white.
  col = col / (col + vec3(0.85));
  col = pow(col, vec3(0.85));

  fragColor = vec4(col, 1.0);
}
`;

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
    console.error("tunnel shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("tunnel link:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

/** Build the WebGL2 raymarch engine. Returns null if WebGL2 / the shader fails. */
export function makeTunnel(canvas: HTMLCanvasElement): TunnelHandle | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const prog = link(gl, VERT, FRAG);
  if (!prog) return null;

  const vao = gl.createVertexArray();

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uCamZ = gl.getUniformLocation(prog, "uCamZ");
  const uHeading = gl.getUniformLocation(prog, "uHeading");
  const uApproach = gl.getUniformLocation(prog, "uApproach");
  const uReduced = gl.getUniformLocation(prog, "uReduced");

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  resize();

  const render = (u: TunnelUniforms): void => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, u.time);
    gl.uniform1f(uCamZ, u.camZ);
    gl.uniform2f(uHeading, u.heading[0], u.heading[1]);
    gl.uniform1f(uApproach, u.approach);
    gl.uniform1f(uReduced, u.reduced ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const dispose = (): void => {
    gl.deleteProgram(prog);
    gl.deleteVertexArray(vao);
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
  };

  return { render, resize, dispose };
}

// ── Canvas2D fallback — concentric rings zooming toward a bright center ───────
export function makeTunnelFallback(
  canvas: HTMLCanvasElement,
): TunnelHandle | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  };
  resize();

  const render = (u: TunnelUniforms): void => {
    const cw = canvas.width;
    const ch = canvas.height;
    const a = Math.min(1, Math.max(0, u.approach));
    // Center drifts with the steering heading.
    const cx = cw / 2 + u.heading[0] * cw * 0.18;
    const cy = ch / 2 - u.heading[1] * ch * 0.18;
    const maxR = Math.hypot(cw, ch) * 0.6;

    // Dark void backdrop.
    ctx.fillStyle = "#05030c";
    ctx.fillRect(0, 0, cw, ch);

    // Concentric rings rushing inward (phase from the time-dilated clock).
    const ringCount = 26;
    const phase = (u.camZ * 0.35) % 1;
    ctx.lineWidth = Math.max(1, 2 + 4 * a);
    for (let i = ringCount; i > 0; i--) {
      const f = ((i - phase) / ringCount) % 1;
      if (f <= 0) continue;
      const r = maxR * f * f;
      const stops = ["#241147", "#5b2ec9", "#8b5cf6", "#b043e0", "#c4b5fd"];
      const col = stops[i % stops.length];
      const alpha = (0.08 + 0.5 * (1 - f)) * (0.5 + 0.5 * a);
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // The being-of-light core bloom.
    const bloomR = maxR * (0.08 + a * 0.4);
    const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, bloomR);
    bloom.addColorStop(0, `rgba(240,236,255,${0.35 + 0.6 * a})`);
    bloom.addColorStop(0.5, `rgba(139,92,246,${0.2 + 0.3 * a})`);
    bloom.addColorStop(1, "rgba(36,17,71,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(cx, cy, bloomR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // Tunnel-vision vignette, constricting with approach.
    const vigInner = maxR * (u.reduced ? 0.7 : 0.55 - a * 0.28);
    const vig = ctx.createRadialGradient(cx, cy, vigInner, cx, cy, maxR);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, `rgba(0,0,0,${u.reduced ? 0.55 : 0.82})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, cw, ch);
  };

  const dispose = (): void => {
    /* nothing to release */
  };

  return { render, resize, dispose };
}
