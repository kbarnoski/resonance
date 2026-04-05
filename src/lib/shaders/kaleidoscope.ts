import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Kaleidoscopic fold: reflect point across N mirror lines through origin
vec2 kaleido(vec2 p, float segments) {
  float angle = atan(p.y, p.x);
  float segAngle = 6.28318 / segments;

  // Fold into one sector
  angle = mod(angle, segAngle);
  // Mirror within sector
  if (angle > segAngle * 0.5) {
    angle = segAngle - angle;
  }

  float r = length(p);
  return vec2(cos(angle), sin(angle)) * r;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Slow rotation of the whole kaleidoscope
  vec2 p = rot2(t * 0.12) * uv;

  // Number of mirror segments (slowly morphing between 5-8)
  float segments = 6.0 + sin(t * 0.25) * 1.5;
  segments = floor(segments + 0.5); // snap to integer
  segments = max(segments, 4.0);

  // Apply kaleidoscopic folding
  vec2 kp = kaleido(p, segments);

  // Scale and translate for interesting patterns
  float scale = 2.0 + sin(t * 0.3) * 0.5 + u_bass * 0.3;
  kp *= scale;

  // Offset for animation
  kp += vec2(t * 0.4, sin(t * 0.35) * 0.3);

  vec3 color = vec3(0.0);

  // Layer 1: Curved geometric forms
  float r = length(kp);
  float a = atan(kp.y, kp.x);

  // Rose curve pattern
  float petals = 3.0 + sin(t * 0.2) * 1.0;
  float rose = cos(petals * a + t * 1.5);
  float roseDist = abs(r - rose * 0.6 - 0.3);
  float roseGlow = smoothstep(0.08, 0.0, roseDist);
  float roseCore = smoothstep(0.03, 0.0, roseDist);

  vec3 roseCol = palette(
    a * 0.3 + r * 0.2 + t * 0.3 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.4, 0.6),
    vec3(0.8, 1.0, 0.5),
    vec3(0.0, 0.1, 0.4)
  );

  color += roseCol * roseGlow * 0.4;
  color += roseCol * roseCore * 0.8;

  // Layer 2: Concentric ring pattern
  float rings = abs(fract(r * 3.0 - t * 0.8) - 0.5);
  float ringGlow = smoothstep(0.08, 0.0, rings);

  vec3 ringCol = palette(
    r * 0.5 + t * 0.25 + paletteShift + 0.3,
    vec3(0.6, 0.5, 0.5),
    vec3(0.5, 0.5, 0.4),
    vec3(1.0, 0.8, 0.4),
    vec3(0.05, 0.1, 0.2)
  );

  color += ringCol * ringGlow * 0.3;

  // Layer 3: Noise-based organic shapes
  float n1 = snoise(kp * 1.5 + t * 0.5);
  float n2 = snoise(kp * 3.0 - t * 0.3);
  float pattern = smoothstep(0.0, 0.1, abs(n1 * 0.5 + n2 * 0.3) - 0.15);

  vec3 noiseCol = palette(
    n1 + t * 0.2 + paletteShift + 0.6,
    vec3(0.4, 0.4, 0.5),
    vec3(0.3, 0.3, 0.5),
    vec3(0.6, 0.8, 1.0),
    vec3(0.1, 0.1, 0.3)
  );

  color += noiseCol * (1.0 - pattern) * 0.15;

  // Layer 4: Radial spokes from center
  float spokes = abs(fract(a * segments / 6.28318 * 2.0) - 0.5);
  float spokeGlow = smoothstep(0.06, 0.0, spokes) * smoothstep(1.5, 0.2, r);

  vec3 spokeCol = palette(
    a * 0.2 + t * 0.4 + paletteShift + 0.5,
    vec3(0.7, 0.7, 0.7),
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.9, 1.0),
    vec3(0.0, 0.05, 0.25)
  );

  color += spokeCol * spokeGlow * 0.25;

  // Central jewel glow
  float centerDist = length(uv);
  float jewelGlow = exp(-centerDist * 6.0) * 0.3;
  vec3 jewelCol = palette(
    t * 0.5 + paletteShift + 0.2,
    vec3(0.7, 0.6, 0.6),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.9, 0.5),
    vec3(0.0, 0.05, 0.15)
  );
  color += jewelCol * jewelGlow;

  // Audio response
  color += roseCol * roseCore * u_treble * 0.4;
  color += ringCol * ringGlow * u_mid * 0.2;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
