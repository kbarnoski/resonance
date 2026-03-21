import { U, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
// ---- Quatrefoil ----
// Four-lobed gothic window shape. Polar: r = cos(2*theta).
// Overlapping circles arranged in 4-fold rotational symmetry.

float quatrefoilSDF(vec2 p, float r) {
  // Four overlapping circles offset along axes
  float d = 999.0;
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.5708; // pi/2
    vec2 center = r * 0.5 * vec2(cos(a), sin(a));
    d = min(d, length(p - center) - r * 0.5);
  }
  return d;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  vec3 color = vec3(0.0);

  // Nested quatrefoils at different scales and rotations
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float r = 0.5 - fi * 0.06 + u_bass * 0.04;
    float rot = fi * 0.13 + t * (0.3 + fi * 0.05);
    vec2 rp = rot2(rot) * uv;

    float d = quatrefoilSDF(rp, r);

    // Gothic arch outline
    float outline = abs(d) - 0.003;
    float edgeGlow = exp(-abs(outline) * (40.0 + u_mid * 12.0));
    float edgeCore = smoothstep(0.005, 0.0, abs(outline));

    vec3 col = palette(
      fi * 0.16 + t * 0.25 + u_amplitude * 0.2,
      vec3(0.5, 0.5, 0.55),
      vec3(0.42, 0.44, 0.5),
      vec3(0.75, 0.9, 1.0),
      vec3(0.0, 0.1, 0.22)
    );

    color += col * edgeGlow * (0.3 - fi * 0.03);
    color += col * edgeCore * (0.4 - fi * 0.04);

    // Fill interior with subtle gradient
    float interior = smoothstep(0.01, -0.03, d);
    vec3 fillCol = palette(
      fi * 0.2 + t * 0.15 + 0.3,
      vec3(0.03, 0.03, 0.05),
      vec3(0.03, 0.04, 0.06),
      vec3(0.3, 0.5, 0.8),
      vec3(0.1, 0.1, 0.3)
    );
    color += fillCol * interior * 0.06;
  }

  // Gothic tracery: intersecting circular arcs
  float tracery = 999.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float a = fi * 0.785 + t * 0.15; // pi/4 spacing
    float arcR = 0.35 + sin(t * 0.3 + fi) * 0.05 + u_treble * 0.03;
    vec2 arcCenter = 0.3 * vec2(cos(a), sin(a));
    float arcDist = abs(length(uv - arcCenter) - arcR);
    tracery = min(tracery, arcDist);
  }
  float traceryGlow = exp(-tracery * (50.0 + u_treble * 15.0));
  vec3 traceryCol = palette(
    tracery * 10.0 + t * 0.4,
    vec3(0.5, 0.52, 0.58),
    vec3(0.3, 0.32, 0.4),
    vec3(0.5, 0.7, 1.0),
    vec3(0.1, 0.12, 0.3)
  );
  color += traceryCol * traceryGlow * 0.2;

  // Central rosette
  float angle = atan(uv.y, uv.x);
  float radius = length(uv);
  float rose = abs(cos(4.0 * angle)) * 0.15;
  float roseDist = abs(radius - rose);
  float roseGlow = exp(-roseDist * 40.0) * 0.3 * (0.5 + u_amplitude * 0.5);
  color += vec3(0.6, 0.7, 0.85) * roseGlow;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
