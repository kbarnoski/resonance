// ════════════════════════════════════════════════════════════════════════════
// 1329-breath-drop / shader.ts — WebGL2 full-screen fragment shader.
//
// A log-polar Klüver form-constant field (via the shared LOGPOLAR_GLSL engine)
// that DENSIFIES with the player-charged tension T and SLAMS on the drop — a
// luminance / saturation / scale bloom, NOT a strobe. Any repetitive flicker is
// applied outside this shader through the shared SafeFlicker as a luminance
// multiplier (uFlicker) so the danger band is unreachable.
//
// Uniforms are driven by breath: T charges the field's density + spiral drive,
// a sharp exhale transient sets uDrop -> 1 (decaying), and pitch sets the hue so
// a *rising* hum visibly climbs. Palette runs intense-neon -> cosmic-gold at the
// peak.
// ════════════════════════════════════════════════════════════════════════════

import { LOGPOLAR_GLSL } from "../_shared/psych/logpolar";

export const VERT_SRC = `#version 300 es
precision highp float;
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uTension;   // 0..1 player-charged tension -> field density / drive
uniform float uDrop;      // 0..1 drop bloom (sat + scale + brightness slam)
uniform float uPitch;     // 0..1 normalized pitch -> hue climb with a rising hum
uniform float uLevel;     // 0..1 live input level -> breathing / grain
uniform float uFlicker;   // luminance multiplier from SafeFlicker (1.0 = steady)
uniform float uSpeed;     // flow speed scale (pulled down for reduced-motion)
uniform float uSatBase;   // base saturation ceiling (pulled down for reduced-motion)
uniform float uBeat;      // 0..1 kick pulse for a subtle scale throb

${LOGPOLAR_GLSL}

const float TAU = 6.28318530718;

// IQ cosine palette — intense neon at rest, blooms toward cosmic gold at drop.
vec3 palette(float t, vec3 shift) {
  vec3 a = vec3(0.50, 0.40, 0.60);
  vec3 b = vec3(0.50, 0.48, 0.50);
  vec3 c = vec3(1.00, 1.10, 1.25);
  return a + b * cos(TAU * (c * t + shift));
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  // centered, aspect-corrected UV
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  // ---- SCALE bloom: the drop pushes the field outward; a subtle kick throb ----
  float scale = 1.0 - uDrop * 0.28 - uBeat * 0.03;
  uv *= max(scale, 0.4);
  float r0 = length(uv);

  // gentle radial warp pulled by tension (being drawn in as you charge)
  uv *= 1.0 + uTension * 0.10 * sin(r0 * 7.0 - uTime * 1.3 * uSpeed);

  // ---- kaleidoscope fold on theta, densifying with tension ----
  float theta = atan(uv.y, uv.x);
  float fold = 3.0 + floor(uTension * 6.0) + uDrop * 3.0;
  float seg = TAU / fold;
  float a = mod(theta, seg);
  a = abs(a - 0.5 * seg);
  vec2 folded = vec2(cos(a), sin(a)) * max(length(uv), 1e-4);

  // ---- log-polar cortical coordinates (shared engine) ----
  vec2 cortex = screenToCortex(folded);

  // cortical frequency (ring/spoke density) climbs with tension + drop
  float freq = 4.0 + uTension * 11.0 + uDrop * 4.0;
  // inward tunnel drift; faster as you charge
  float phase = uTime * (0.4 + uTension * 1.6 + uDrop * 2.0) * uSpeed;

  // three form constants, blended across tension: tunnel -> spiral -> honeycomb
  float tunnel = formConstant(cortex, 0.0,        freq, -phase);          // rings
  float spiral = formConstant(cortex, 0.7853982,  freq, -phase);          // diagonal
  float hex    = honeycomb(cortex, freq * 0.55, -phase * 0.8);            // lattice

  float m = clamp(uTension, 0.0, 1.0);
  float field = mix(tunnel, spiral, smoothstep(0.05, 0.6, m));
  field = mix(field, hex, smoothstep(0.6, 1.0, m) * 0.85);

  // second octave breathing from live level
  field += uLevel * 0.22 * sin(cortex.x * 3.0 - uTime * 0.9 * uSpeed);

  // ---- color ----
  float hue = uPitch * 0.5 + uTime * 0.02 + uDrop * 0.18;
  vec3 shift = vec3(0.00, 0.12, 0.24) + hue;
  float t = field * 0.5 + 0.5;
  vec3 col = palette(t, shift);

  // cosmic-gold bloom injected at the drop
  vec3 gold = vec3(1.0, 0.82, 0.42);
  col = mix(col, mix(col, gold, 0.6), uDrop * 0.7);

  // contrast / jeweled punch grows with tension + drop
  float pw = 1.0 + (0.4 + 0.6 * uTension + uDrop) * uSatBase;
  col = pow(max(col, 0.0), vec3(pw));

  // saturation (neural gain) around luma; slammed at the drop
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  float sat = (0.75 + uTension * 0.6 + uDrop * 1.1) * uSatBase;
  col = mix(vec3(luma), col, clamp(sat, 0.0, 2.2));

  // brightness bloom at the drop
  col *= 1.0 + uDrop * 0.9 + uBeat * 0.12;

  // radial vignette toward deep violet-black (frames the tunnel)
  float vig = smoothstep(1.25, 0.1, r0);
  col *= mix(0.22, 1.0, vig);
  col += vec3(0.04, 0.0, 0.08) * (1.0 - vig);

  // blue-noise visual snow at low alpha, a touch more with level
  float g = hash21(gl_FragCoord.xy + fract(uTime) * 91.7);
  col += (g - 0.5) * (0.02 + uLevel * 0.06);

  // SafeFlicker luminance multiplier (steady 1.0 unless the user opts in)
  col *= uFlicker;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/** Compile + link a WebGL2 program. Not a hook -> not named use*. */
export function makeProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const compile = (type: number, src: string): WebGLShader | null => {
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
  };

  const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}
