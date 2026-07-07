// render.ts — the volumetric raymarch engine for 1251 · borealis.
//
// A full-screen WebGL2 fragment shader raymarches THROUGH a log-polar tunnel of
// luminous fog toward a growing white-gold core. The camera translates forward
// along +z (uZ grows every frame) so the ring-structured walls stream past you —
// embodied transport, not a pattern on a wall. The log-polar / form-constant
// engine (imported from _shared/psych/logpolar) shapes the tunnel cross-section:
// concentric rings = the tunnel form constant (phi = 0), warped along depth so
// they flow toward the viewer as you fly in.
//
// Named references (see README): Karolina Halatek, *Terminal* (walk-through NDE
// light-tunnel); Klüver's tunnel/funnel form constant; Bressloff–Cowan retino-
// cortical log map; Íñigo Quílez volumetric fog/raymarch technique.

import { LOGPOLAR_GLSL } from "../_shared/psych/logpolar";

export const VERT_SRC = /* glsl */ `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;      // drawing-buffer resolution
uniform float uZ;        // forward camera position — grows every frame (transport)
uniform float uPhase;    // slow ring phase drift
uniform float uEnergy;   // smoothed piano energy 0..1 (surges you forward)
uniform float uApproach; // 0..1 long ramp — the core brightens/widens toward light
uniform float uThin;     // 0..1 fog thinning over the minutes
uniform float uRingFreq; // ring density (slowly wanders, never repeats)
uniform float uFlicker;  // safe luminance multiplier [floor,1]; 1.0 when steady
uniform vec2  uDrift;    // weightless camera nudge

${LOGPOLAR_GLSL}

// cheap per-pixel hash to jitter the march start (kills slice banding)
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  // centered, aspect-correct screen coords
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  float fov = 1.15;
  vec3 ro = vec3(uDrift * 0.35, uZ);          // camera flies forward as uZ grows
  vec3 rd = normalize(vec3(uv * fov, 1.0));   // look down +z (into the tunnel)

  const int STEPS = 64;
  float marchLen = 9.0;
  float stepSize = marchLen / float(STEPS);
  float jitter = hash21(gl_FragCoord.xy + fract(uPhase) * vec2(17.0, 31.0));
  float t = 0.15 + jitter * stepSize;

  // white-gold NDE palette — warm dark amber at the mouth, white at the core
  vec3 amber = vec3(1.00, 0.55, 0.22);
  vec3 gold  = vec3(1.00, 0.82, 0.50);
  vec3 white = vec3(1.00, 0.97, 0.92);

  float absorb    = mix(1.7, 0.9, uThin);            // tunnel thins over minutes
  float fogBright = mix(0.90, 1.30, uEnergy);        // loud passages glow harder
  float coreBright = (0.50 + 1.7 * uApproach) * (0.80 + 0.85 * uEnergy);
  float coreTight = mix(3.2, 1.4, uApproach);        // the light widens as you near

  vec3 col = vec3(0.0);
  float trans = 1.0;

  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;
    float r = length(p.xy) + 1e-4;
    vec2 c = screenToCortex(p.xy);                   // (log r, theta)

    // tunnel rings warped along DEPTH so they stream toward you = forward motion
    vec2 cc = vec2(c.x + p.z * 0.55, c.y);
    float rings = formConstant(cc, 0.0, uRingFreq, uPhase);   // phi=0: tunnel form
    // faint honeycomb texture on the fog walls
    float hex = honeycomb(vec2(c.x * 0.6 + p.z * 0.18, c.y), uRingFreq * 0.5, uPhase * 0.4);

    float wall = smoothstep(0.12, 0.85, r);          // clear throat, foggy walls
    float far  = exp(-t * 0.16);                      // distance dimming
    float dens = wall * (0.30 + 0.70 * rings) * (0.70 + 0.30 * hex);
    dens *= mix(1.0, 0.45, uThin);
    dens = max(dens, 0.0);

    // emission: ring-lit amber/gold fog + the axial radiance at the tunnel's end
    vec3 fogCol = mix(amber, gold, rings * 0.8);
    float emit = dens * (0.35 + 0.9 * rings) * fogBright;
    float axial = exp(-r * r * coreTight);
    vec3 coreCol = mix(gold, white, clamp(uApproach * 0.8 + uEnergy * 0.4, 0.0, 1.0));

    vec3 add = (emit * fogCol + axial * coreBright * coreCol) * far;
    col += trans * add * stepSize;

    trans *= exp(-dens * absorb * stepSize);
    if (trans < 0.02) break;
    t += stepSize;
  }

  // soft vignette so the eye falls into the depth
  float vig = smoothstep(1.25, 0.2, length(uv));
  col *= mix(0.75, 1.0, vig);

  // safe luminance modulation (OFF => 1.0, never a strobe)
  col *= uFlicker;

  // gentle tonemap — highlights bloom toward the NDE white-out, no hard clip
  col = col / (1.0 + col * 0.85);
  col = pow(max(col, 0.0), vec3(0.78));

  fragColor = vec4(col, 1.0);
}
`;

export interface GLRig {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer | null;
  u: {
    res: WebGLUniformLocation | null;
    z: WebGLUniformLocation | null;
    phase: WebGLUniformLocation | null;
    energy: WebGLUniformLocation | null;
    approach: WebGLUniformLocation | null;
    thin: WebGLUniformLocation | null;
    ringFreq: WebGLUniformLocation | null;
    flicker: WebGLUniformLocation | null;
    drift: WebGLUniformLocation | null;
  };
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("borealis shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** Build the full-screen-triangle raymarch rig. Returns null if WebGL2 or the
 *  shader is unavailable so the caller can fall back to Canvas2D. */
export function makeGLRig(canvas: HTMLCanvasElement): GLRig | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    powerPreference: "low-power",
    alpha: false,
  });
  if (!gl) return null;

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("borealis program link error:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(program);
  return {
    gl,
    program,
    buffer,
    u: {
      res: gl.getUniformLocation(program, "uRes"),
      z: gl.getUniformLocation(program, "uZ"),
      phase: gl.getUniformLocation(program, "uPhase"),
      energy: gl.getUniformLocation(program, "uEnergy"),
      approach: gl.getUniformLocation(program, "uApproach"),
      thin: gl.getUniformLocation(program, "uThin"),
      ringFreq: gl.getUniformLocation(program, "uRingFreq"),
      flicker: gl.getUniformLocation(program, "uFlicker"),
      drift: gl.getUniformLocation(program, "uDrift"),
    },
  };
}

export interface MarchState {
  z: number;
  phase: number;
  energy: number;
  approach: number;
  thin: number;
  ringFreq: number;
  flicker: number;
  drift: [number, number];
}

/** Push one frame of uniforms and draw the full-screen triangle. */
export function drawFrame(rig: GLRig, s: MarchState): void {
  const { gl, u } = rig;
  gl.uniform2f(u.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.uniform1f(u.z, s.z);
  gl.uniform1f(u.phase, s.phase);
  gl.uniform1f(u.energy, s.energy);
  gl.uniform1f(u.approach, s.approach);
  gl.uniform1f(u.thin, s.thin);
  gl.uniform1f(u.ringFreq, s.ringFreq);
  gl.uniform1f(u.flicker, s.flicker);
  gl.uniform2f(u.drift, s.drift[0], s.drift[1]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function disposeGLRig(rig: GLRig): void {
  const { gl } = rig;
  try {
    gl.deleteProgram(rig.program);
    if (rig.buffer) gl.deleteBuffer(rig.buffer);
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  } catch {
    /* context already gone */
  }
}

// ─── CPU Canvas2D fallback: a simple log-polar tunnel when WebGL2 is absent ────
// Not the raymarch — a lightweight receding-rings tunnel so the notice never sits
// on a blank page. Concentric warm rings stream outward from a bright core.

export function drawCpuTunnel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tSec: number,
): void {
  ctx.fillStyle = "#0a0603";
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.hypot(w, h) * 0.5;

  // bright receding core
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.5);
  coreGrad.addColorStop(0, "rgba(255,250,236,0.95)");
  coreGrad.addColorStop(0.25, "rgba(255,208,140,0.45)");
  coreGrad.addColorStop(1, "rgba(20,10,4,0)");
  ctx.fillStyle = coreGrad;
  ctx.fillRect(0, 0, w, h);

  // log-polar rings streaming outward (forward-motion illusion)
  const flow = (tSec * 0.35) % 1;
  ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < 14; k++) {
    const u = (k + flow) / 14; // 0..1 cortical log-radius
    const r = Math.exp(u * 3.4) * (maxR / Math.exp(3.4));
    const a = 0.35 * (1 - u) * (1 - u);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,${Math.floor(150 + 90 * (1 - u))},${Math.floor(70 + 60 * (1 - u))},${a})`;
    ctx.lineWidth = 2 + 10 * u;
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}
