import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Star tetrahedron: two interlocking triangular forms rotating in opposite
// directions, with energy fields at intersection zones.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// SDF equilateral triangle centered at origin
float sdTri(vec2 p, float r) {
  float k = sqrt(3.0);
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);
  vec3 color = vec3(0.0);

  // Counter-rotating speed
  float spinSpeed = t * 0.6 + u_bass * 0.2;

  // Multiple scale layers for depth illusion
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float scale = 1.0 + fl * 0.5;
    float triSize = (0.35 - fl * 0.06) / scale;
    float opacity = 1.0 / (1.0 + fl * 0.5);

    // Upward triangle — rotates clockwise
    vec2 upUV = rot2(spinSpeed + fl * 0.2) * uv * scale;
    float upTri = sdTri(upUV + vec2(0.0, triSize * 0.2), triSize);
    float upEdge = smoothstep(0.008 / scale, 0.0, abs(upTri));
    float upFill = smoothstep(0.02, -0.02, upTri);

    // Downward triangle — rotates counter-clockwise
    vec2 dnUV = rot2(-spinSpeed - fl * 0.2) * uv * scale;
    float dnTri = sdTri(vec2(dnUV.x, -dnUV.y) + vec2(0.0, triSize * 0.2), triSize);
    float dnEdge = smoothstep(0.008 / scale, 0.0, abs(dnTri));
    float dnFill = smoothstep(0.02, -0.02, dnTri);

    // Intersection zone — Star of David center
    float intersection = upFill * dnFill;

    // Energy field at intersection — radial pattern
    float interR = length(uv);
    float interPattern = sin(interR * 30.0 / scale - t * 4.0 + fl * 2.0);
    interPattern = smoothstep(0.3, 0.8, interPattern * 0.5 + 0.5);
    float interEnergy = intersection * interPattern * 0.4;

    // Internal structure — parallel lines inside each triangle
    float upLines = sin(dot(upUV, vec2(0.5, 0.866)) * 25.0 / scale + t * 2.0);
    upLines = smoothstep(0.4, 0.6, upLines * 0.5 + 0.5) * upFill * (1.0 - intersection) * 0.15;

    float dnLines = sin(dot(dnUV, vec2(-0.5, 0.866)) * 25.0 / scale - t * 2.0);
    dnLines = smoothstep(0.4, 0.6, dnLines * 0.5 + 0.5) * dnFill * (1.0 - intersection) * 0.15;

    // Palette — upward is golden, downward is violet
    vec3 upCol = palette(
      fl * 0.15 + paletteShift,
      vec3(0.65, 0.55, 0.35),
      vec3(0.4, 0.35, 0.25),
      vec3(1.0, 0.9, 0.6),
      vec3(0.0, 0.1, 0.2)
    );

    vec3 dnCol = palette(
      fl * 0.15 + paletteShift + 0.5,
      vec3(0.45, 0.35, 0.55),
      vec3(0.35, 0.25, 0.4),
      vec3(0.7, 0.8, 1.1),
      vec3(0.25, 0.1, 0.4)
    );

    vec3 interCol = palette(
      fl * 0.15 + paletteShift + 0.25,
      vec3(0.7, 0.6, 0.5),
      vec3(0.3, 0.3, 0.3),
      vec3(1.0, 0.9, 0.8),
      vec3(0.0, 0.08, 0.15)
    );

    color += upCol * upEdge * opacity * (0.7 + 0.3 * u_mid);
    color += dnCol * dnEdge * opacity * (0.7 + 0.3 * u_mid);
    color += interCol * interEnergy * opacity;
    color += upCol * upLines * opacity;
    color += dnCol * dnLines * opacity;

    // Intersection glow
    color += interCol * intersection * exp(-interR * 6.0) * 0.3 * opacity * u_bass;
  }

  // Central energy node — where all triangles meet
  float node = exp(-r * r * 50.0) * (0.8 + 0.6 * u_bass);
  vec3 nodeCol = palette(
    t * 0.1 + paletteShift,
    vec3(0.9, 0.85, 0.7),
    vec3(0.15, 0.15, 0.1),
    vec3(1.0, 0.95, 0.85),
    vec3(0.0, 0.05, 0.08)
  );
  color += nodeCol * node;

  // Rotation energy field — spiral trails
  float spiral1 = sin(a * 3.0 + r * 15.0 - spinSpeed * 3.0);
  float spiral2 = sin(-a * 3.0 + r * 15.0 + spinSpeed * 3.0);
  float spiralGlow = (pow(max(spiral1, 0.0), 4.0) + pow(max(spiral2, 0.0), 4.0));
  spiralGlow *= exp(-r * 4.0) * 0.15 * u_treble;
  color += nodeCol * spiralGlow;

  // Vignette
  color *= smoothstep(1.4, 0.35, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
