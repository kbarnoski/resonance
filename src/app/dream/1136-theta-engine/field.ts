// ════════════════════════════════════════════════════════════════════════════
// field.ts — the raw WebGL2 fragment-shader field for 1136-theta-engine.
//
// A full-screen log-polar form-constant field (the SECONDARY spatial layer) whose
// TEMPORAL organisation is the star: every visual-theta cycle the field re-blooms
// (its frequency + spiral angle reorganise), and a fine high-frequency "gamma
// sparkle" texture rises and falls in AMPLITUDE with the theta-phase envelope —
// theta→gamma cross-frequency coupling made visible.
//
// SAFETY: the literal 5/40 Hz coupling lives only in the audio. Here the global
// luminance is multiplied by a soft [floor,1] envelope supplied by the shared
// SafeFlicker engine (≤8 Hz hard cap, ≤3 Hz soft default, floor 0.6 — it never
// blacks out). "Gamma" is expressed as a SPATIAL sparkle whose amplitude tracks
// theta phase, never a 40 Hz full-screen luminance strobe.
// ════════════════════════════════════════════════════════════════════════════

import { LOGPOLAR_GLSL } from "../_shared/psych/logpolar";

const VERT_SRC = /* glsl */ `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform float u_thetaEnv;   // [floor,1] SLOW soft theta luminance envelope (SafeFlicker)
uniform float u_bloomPhase; // 0..1 sawtooth per visual-theta cycle (spatial reorg)
uniform float u_coupling;   // 0..1 how strongly theta gates gamma sparkle amplitude
uniform float u_energy;     // 0..1 audio envelope (extra glow)
uniform float u_deep;       // 0/1 deep-coupling mode
uniform float u_sparkT;     // sparkle animation clock (frozen under reduced motion)

out vec4 frag;

${LOGPOLAR_GLSL}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

// cool / electric on near-black: deep indigo -> electric violet -> cyan
vec3 palette(float t) {
  vec3 c0 = vec3(0.015, 0.015, 0.055); // near-black
  vec3 c1 = vec3(0.16,  0.05,  0.42);  // deep indigo
  vec3 c2 = vec3(0.55,  0.16,  0.95);  // electric violet
  vec3 c3 = vec3(0.24,  0.85,  1.00);  // cyan
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(c0, c1, smoothstep(0.0,  0.34, t));
  c = mix(c, c2, smoothstep(0.34, 0.68, t));
  c = mix(c, c3, smoothstep(0.68, 1.0,  t));
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);

  // ── secondary spatial layer: log-polar form constants (Bressloff–Cowan) ──
  vec2 cx = screenToCortex(uv);
  float drift = u_time * 0.14;                       // slow inward tunnel motion
  float bloom = u_bloomPhase * TAU_LP;               // re-blooms each theta cycle

  // spiral layer whose density + angle reorganise each theta cycle
  float freq = 5.5 + 3.0 * sin(bloom);
  float phi  = 0.785 + 0.45 * sin(bloom * 0.5);
  float fSpiral = formConstant(cx, phi, freq, -drift * 4.0 + bloom);

  // concentric tunnel layer for depth
  float fTunnel = formConstant(cx, 0.0, 8.0, drift * 3.0);

  float field = mix(fSpiral, fTunnel, 0.35);

  float r = length(uv);
  float depth = exp(-r * 1.15);                       // tunnel falloff / vignette
  float base = field * depth;

  // ── gamma sparkle: fine spatial texture, AMPLITUDE gated by theta phase ──
  // The sparkle re-randomises spatially (spatial "gamma" phase) but its overall
  // brightness is bounded and rides the slow theta envelope — no luminance strobe.
  vec2 gp = gl_FragCoord.xy * 0.55;
  float spk = hash21(floor(gp) + floor(u_sparkT));
  spk = pow(spk, 6.0);                                // sparse points, not a wash
  float ridge = smoothstep(0.62, 0.96, field);       // sparkle clings to ridges
  float gammaAmp = u_coupling * u_thetaEnv;           // theta gates gamma amplitude
  float sparkle = spk * ridge * gammaAmp * (1.0 + u_deep * 1.6);

  // ── compose ──
  float tint = base * 0.8 + u_bloomPhase * 0.16 + u_energy * 0.18;
  vec3 col = palette(tint);
  col *= (0.22 + 0.95 * base);
  col += sparkle * vec3(0.55, 0.82, 1.0) * 1.5;       // electric cyan-violet grains
  col += u_energy * 0.07 * vec3(0.30, 0.20, 0.62) * depth;

  // GLOBAL luminance envelope — the ONLY luminance modulation, via SafeFlicker.
  col *= u_thetaEnv;

  col = col / (1.0 + col * 0.7);                       // soft filmic knee
  frag = vec4(col, 1.0);
}`;

export interface FieldUniforms {
  time: number;
  thetaEnv: number;
  bloomPhase: number;
  coupling: number;
  energy: number;
  deep: boolean;
  sparkT: number;
}

export interface FieldRig {
  render: (u: FieldUniforms) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

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
    console.error("shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function makeFieldRig(canvas: HTMLCanvasElement): FieldRig | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("program link error:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(program);
  const u = {
    res: gl.getUniformLocation(program, "u_res"),
    time: gl.getUniformLocation(program, "u_time"),
    thetaEnv: gl.getUniformLocation(program, "u_thetaEnv"),
    bloomPhase: gl.getUniformLocation(program, "u_bloomPhase"),
    coupling: gl.getUniformLocation(program, "u_coupling"),
    energy: gl.getUniformLocation(program, "u_energy"),
    deep: gl.getUniformLocation(program, "u_deep"),
    sparkT: gl.getUniformLocation(program, "u_sparkT"),
  };

  return {
    render(v: FieldUniforms) {
      gl.uniform2f(u.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(u.time, v.time);
      gl.uniform1f(u.thetaEnv, v.thetaEnv);
      gl.uniform1f(u.bloomPhase, v.bloomPhase);
      gl.uniform1f(u.coupling, v.coupling);
      gl.uniform1f(u.energy, v.energy);
      gl.uniform1f(u.deep, v.deep ? 1 : 0);
      gl.uniform1f(u.sparkT, v.sparkT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize(w: number, h: number) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },
    dispose() {
      try {
        gl.deleteBuffer(buf);
        gl.deleteProgram(program);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* ignore */
      }
    },
  };
}
