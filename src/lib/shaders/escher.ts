import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Hyperbolic Poincare disk model for Escher-like tilings
// Regular {p,q} tiling in hyperbolic space

// Complex multiplication
vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// Complex division
vec2 cdiv(vec2 a, vec2 b) {
  float d = dot(b, b);
  return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d;
}

// Mobius transform for hyperbolic reflection
vec2 mobius(vec2 z, vec2 c) {
  return cdiv(z - c, vec2(1.0, 0.0) - cmul(vec2(c.x, -c.y), z));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Map to Poincare disk
  vec2 z = uv * 1.8;

  // Slow rotation of the whole disk
  z = rot2(t * 0.15) * z;

  float diskR = length(z);
  vec3 color = vec3(0.0);

  if (diskR < 0.98) {
    // Hyperbolic distance from origin
    float hypDist = 2.0 * atanh(min(diskR, 0.97));

    // Triangular tiling via repeated reflections
    // Use polar coordinates in hyperbolic space
    float angle = atan(z.y, z.x);

    // {6,4} tiling: 6-gon, 4 meeting at vertex
    float p = 6.0;
    float sectorAngle = 6.28318 / p;

    // Fold into fundamental domain
    float a = mod(angle + t * 0.1, sectorAngle);
    if (a > sectorAngle * 0.5) a = sectorAngle - a;

    // Create pattern from hyperbolic distance + angle
    float shell = floor(hypDist * 1.5);
    float shellFrac = fract(hypDist * 1.5);

    // Triangle-like pattern within each shell
    float triPattern = abs(fract(a / sectorAngle * 3.0 + shell * 0.5) - 0.5) * 2.0;

    // Edge detection
    float edgeDist = min(shellFrac, 1.0 - shellFrac);
    float radialEdge = smoothstep(0.05, 0.0, edgeDist);

    float angleEdge = abs(fract(angle / sectorAngle + 0.5) - 0.5) * sectorAngle;
    float angularEdge = smoothstep(0.04, 0.0, angleEdge * (1.0 + hypDist * 0.3));

    float edge = max(radialEdge, angularEdge);

    // Tile identity
    float tileId = fract(sin(shell * 127.1 + floor(angle / sectorAngle) * 311.7) * 43758.5453);

    // Morphing: tiles subtly shift shape over time
    float morph = sin(t * 0.5 + tileId * 6.28) * 0.15;
    triPattern += morph;

    // Colors: each tile gets a distinct hue
    vec3 tileCol = palette(
      tileId + shell * 0.15 + t * 0.2 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.6),
      vec3(0.8, 1.0, 0.6),
      vec3(0.0, 0.1, 0.4)
    );

    vec3 altCol = palette(
      tileId * 1.7 + shell * 0.2 + t * 0.15 + paletteShift + 0.5,
      vec3(0.5, 0.4, 0.4),
      vec3(0.4, 0.5, 0.3),
      vec3(1.0, 0.7, 0.4),
      vec3(0.1, 0.05, 0.3)
    );

    // Alternate colors in checkerboard-like pattern
    float checker = step(0.5, fract(shell * 0.5 + floor(angle / sectorAngle) * 0.5));
    vec3 fillCol = mix(tileCol, altCol, checker);

    // Fill brightness decreases toward disk edge (hyperbolic depth)
    float depthFade = exp(-hypDist * 0.3);

    color += fillCol * (0.12 + triPattern * 0.1) * depthFade;

    // Edge glow
    vec3 edgeCol = palette(
      t * 0.3 + paletteShift + hypDist * 0.1,
      vec3(0.7, 0.7, 0.7),
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.9, 1.0),
      vec3(0.0, 0.05, 0.25)
    );
    color += edgeCol * edge * 0.7 * depthFade;

    // Audio response
    color += fillCol * edge * u_treble * 0.4 * depthFade;
  }

  // Disk boundary glow
  float boundaryGlow = smoothstep(0.03, 0.0, abs(diskR - 0.98));
  vec3 boundCol = palette(
    t * 0.2 + paletteShift + 0.7,
    vec3(0.5, 0.5, 0.5),
    vec3(0.4, 0.4, 0.5),
    vec3(0.6, 0.8, 1.0),
    vec3(0.1, 0.1, 0.3)
  );
  color += boundCol * boundaryGlow * 0.8;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
