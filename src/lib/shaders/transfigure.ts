import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Morph cycle: circle -> triangle -> square -> circle
  // Each shape lasts ~2 seconds of shader time
  float cycle = mod(t * 0.5, 3.0);
  float morph1 = smoothstep(0.0, 1.0, cycle);                   // circle -> triangle
  float morph2 = smoothstep(1.0, 2.0, cycle);                   // triangle -> square
  float morph3 = smoothstep(2.0, 3.0, cycle);                   // square -> circle

  float scale = 0.35 + u_bass * 0.06;

  // Compute all three shapes
  float circle = sdCircle(uv, scale);
  vec2 triUV = rot2(t * 0.3) * uv;
  float triangle = sdTriangle(triUV, scale * 1.1);
  vec2 boxUV = rot2(-t * 0.2) * uv;
  float square = sdBox(boxUV, vec2(scale * 0.75));

  // Blend between shapes based on morph phase
  float shape;
  if (cycle < 1.0) {
    shape = mix(circle, triangle, morph1);
  } else if (cycle < 2.0) {
    shape = mix(triangle, square, morph2);
  } else {
    shape = mix(square, circle, morph3);
  }

  // Multiple scale layers — nested morphing shapes
  float innerShape;
  vec2 innerUV = rot2(t * 0.8) * uv;
  float iCircle = sdCircle(innerUV, scale * 0.5);
  float iTriangle = sdTriangle(rot2(-t * 0.6) * uv, scale * 0.55);
  float iSquare = sdBox(rot2(t * 0.5) * uv, vec2(scale * 0.38));

  // Inner cycle offset by 1 phase
  float innerCycle = mod(t * 0.5 + 1.0, 3.0);
  float im1 = smoothstep(0.0, 1.0, innerCycle);
  float im2 = smoothstep(1.0, 2.0, innerCycle);
  float im3 = smoothstep(2.0, 3.0, innerCycle);
  if (innerCycle < 1.0) {
    innerShape = mix(iCircle, iTriangle, im1);
  } else if (innerCycle < 2.0) {
    innerShape = mix(iTriangle, iSquare, im2);
  } else {
    innerShape = mix(iSquare, iCircle, im3);
  }

  // Micro inner — offset by 2 phases
  float microShape;
  float mCircle = sdCircle(uv, scale * 0.22);
  float mTriangle = sdTriangle(rot2(t * 1.2) * uv, scale * 0.25);
  float mSquare = sdBox(rot2(-t * 0.9) * uv, vec2(scale * 0.17));
  float microCycle = mod(t * 0.5 + 2.0, 3.0);
  float mm1 = smoothstep(0.0, 1.0, microCycle);
  float mm2 = smoothstep(1.0, 2.0, microCycle);
  float mm3 = smoothstep(2.0, 3.0, microCycle);
  if (microCycle < 1.0) {
    microShape = mix(mCircle, mTriangle, mm1);
  } else if (microCycle < 2.0) {
    microShape = mix(mTriangle, mSquare, mm2);
  } else {
    microShape = mix(mSquare, mCircle, mm3);
  }

  // Edge glows
  float outerEdge = smoothstep(0.015, 0.0, abs(shape));
  float innerEdge = smoothstep(0.01, 0.0, abs(innerShape));
  float microEdge = smoothstep(0.008, 0.0, abs(microShape));

  // Transition particles — released during morphing
  float transitionIntensity = sin(cycle * 3.14159) * sin(cycle * 3.14159);
  float particles = snoise(uv * 15.0 + t * 3.0);
  particles = smoothstep(0.6, 0.9, particles) * transitionIntensity;
  particles *= smoothstep(0.1, scale + 0.1, r) * smoothstep(scale + 0.3, scale + 0.05, r);

  // Radial energy pulse during transition
  float pulse = sin(r * 30.0 - t * 5.0) * transitionIntensity;
  pulse = smoothstep(0.5, 1.0, pulse) * smoothstep(0.8, 0.2, r);

  // FBM organic aura
  float n = fbm(uv * 4.0 + t * 0.2);

  // Shape-driven palettes
  // Circle phase: soft blue / silver
  vec3 circleCol = palette(
    r * 2.0 + paletteShift,
    vec3(0.5, 0.55, 0.7),
    vec3(0.4, 0.45, 0.5),
    vec3(0.6, 0.7, 1.0),
    vec3(0.2, 0.25, 0.4)
  );

  // Triangle phase: fiery orange / gold
  vec3 triCol = palette(
    r * 2.0 + paletteShift + 0.33,
    vec3(0.6, 0.45, 0.3),
    vec3(0.5, 0.4, 0.3),
    vec3(1.0, 0.7, 0.3),
    vec3(0.0, 0.1, 0.2)
  );

  // Square phase: emerald / jade
  vec3 sqCol = palette(
    r * 2.0 + paletteShift + 0.66,
    vec3(0.3, 0.55, 0.4),
    vec3(0.3, 0.5, 0.3),
    vec3(0.4, 0.9, 0.5),
    vec3(0.1, 0.3, 0.15)
  );

  // Blend palettes with morph
  vec3 col;
  if (cycle < 1.0) {
    col = mix(circleCol, triCol, morph1);
  } else if (cycle < 2.0) {
    col = mix(triCol, sqCol, morph2);
  } else {
    col = mix(sqCol, circleCol, morph3);
  }

  vec3 color = vec3(0.0);

  // Outer shape
  color += col * outerEdge * 1.8 * (0.8 + u_bass * 0.5);

  // Inner shape
  color += col * innerEdge * 1.2 * (0.7 + u_mid * 0.5);

  // Micro shape
  color += col * microEdge * 0.9 * (0.6 + u_treble * 0.6);

  // Transition particles
  color += col * particles * 1.0;

  // Pulse rings
  color += col * pulse * 0.4 * u_amplitude;

  // FBM aura
  color += col * abs(n) * smoothstep(0.8, 0.2, r) * 0.15;

  // Emissive at shape edges during morph
  color += vec3(1.3, 1.2, 1.1) * outerEdge * transitionIntensity * 1.5;

  // Central core
  float core = exp(-r * 6.0);
  color += col * core * 0.5 * (1.0 + u_amplitude * 0.3);

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
