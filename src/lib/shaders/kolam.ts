import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Kolam Pattern ----
// South Indian floor drawing: dots arranged in a grid with continuous
// looping curves weaving around them. Uses sinusoidal weaving logic.

float kolamLoop(vec2 p, float gridSize, float t) {
  // Grid cell and local coords
  vec2 cell = floor(p / gridSize);
  vec2 local = fract(p / gridSize) - 0.5;

  // Each cell has a dot and curve direction based on hash
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);

  // Weaving: alternating over/under pattern
  float weaveX = sin(local.x * 6.28318 + h * 6.28 + t);
  float weaveY = sin(local.y * 6.28318 + h * 3.14 + t * 0.7);

  // Distance to the weaving curve
  float curve = length(vec2(weaveX, weaveY) * 0.3 - local);
  return curve;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  vec3 color = vec3(0.0);

  // Scale and rotate
  float scale = 4.0 + u_bass * 1.0;
  vec2 p = rot2(t * 0.1) * uv * scale;

  // Main kolam curve pattern
  float gridSize = 1.0;
  float curveDist = kolamLoop(p, gridSize, t);

  float curveGlow = exp(-curveDist * (8.0 + u_mid * 3.0));
  float curveCore = smoothstep(0.12, 0.05, curveDist);

  vec3 curveCol = palette(
    curveDist * 2.0 + t * 0.3 + u_amplitude * 0.25,
    vec3(0.55, 0.52, 0.5),
    vec3(0.4, 0.42, 0.48),
    vec3(0.8, 0.9, 1.0),
    vec3(0.0, 0.1, 0.2)
  );
  color += curveCol * curveGlow * 0.4;
  color += curveCol * curveCore * 0.5;

  // Dot grid: bright dots at grid intersections
  vec2 gridP = fract(p / gridSize) - 0.5;
  float dotDist = length(gridP);
  float dotGlow = exp(-dotDist * dotDist * 80.0) * (0.6 + u_treble * 0.3);
  vec3 dotCol = palette(
    t * 0.4 + u_amplitude * 0.2,
    vec3(0.65, 0.65, 0.7),
    vec3(0.3, 0.32, 0.4),
    vec3(0.5, 0.7, 1.0),
    vec3(0.1, 0.15, 0.3)
  );
  color += dotCol * dotGlow;

  // Second layer: finer kolam with different phase
  vec2 p2 = rot2(t * 0.15 + 0.785) * uv * scale * 1.5;
  float curveDist2 = kolamLoop(p2, gridSize, t * 1.2 + 1.5);
  float curveGlow2 = exp(-curveDist2 * (10.0 + u_treble * 4.0));
  vec3 curveCol2 = palette(
    curveDist2 * 2.0 + t * 0.25 + 0.5,
    vec3(0.45, 0.45, 0.52),
    vec3(0.35, 0.35, 0.42),
    vec3(0.6, 0.8, 1.0),
    vec3(0.05, 0.1, 0.28)
  );
  color += curveCol2 * curveGlow2 * 0.2;

  // Subtle noise texture for ground
  float ground = fbm(uv * 3.0 + t * 0.1) * 0.03;
  color += vec3(0.08, 0.07, 0.06) * (0.5 + ground);

  // Radial symmetry overlay: 4-fold
  float angle = atan(uv.y, uv.x);
  float symLine = smoothstep(0.02, 0.0, abs(sin(angle * 4.0)) * length(uv) - 0.01);
  color += vec3(0.15, 0.18, 0.25) * symLine * 0.15 * u_amplitude;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
