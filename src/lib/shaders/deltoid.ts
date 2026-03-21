import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Deltoid ----
// Three-cusped hypocycloid: a circle of radius r/3 rolling inside radius r.
// Parametric: x = (2*cos(s) + cos(2*s))/3, y = (2*sin(s) - sin(2*s))/3

float deltoidDist(vec2 p, float size, float phase) {
  float minD = 999.0;
  for (int i = 0; i < 90; i++) {
    float s = float(i) * 6.28318 / 90.0;
    vec2 pt = size * vec2(
      (2.0 * cos(s + phase) + cos(2.0 * s + 2.0 * phase)) / 3.0,
      (2.0 * sin(s + phase) - sin(2.0 * s + 2.0 * phase)) / 3.0
    );
    minD = min(minD, length(p - pt));
  }
  return minD;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  vec3 color = vec3(0.0);

  // Multiple rotating deltoids at different scales
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float size = 0.55 - fi * 0.08 + u_bass * 0.05;
    float rot = fi * 0.42 + t * (0.4 + fi * 0.08);
    vec2 rp = rot2(rot) * uv;

    float d = deltoidDist(rp, size, t * 0.3 + fi * 1.2);

    float glow = exp(-d * (30.0 + u_mid * 10.0));
    float core = smoothstep(0.005, 0.0, d);

    vec3 col = palette(
      fi * 0.2 + t * 0.25 + u_amplitude * 0.2,
      vec3(0.5, 0.5, 0.55),
      vec3(0.42, 0.44, 0.5),
      vec3(0.75, 0.9, 1.0),
      vec3(0.0, 0.1, 0.22)
    );

    color += col * glow * (0.35 - fi * 0.04);
    color += col * core * (0.5 - fi * 0.06);
  }

  // Steiner deltoid property: inscribed equilateral triangle
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float a1 = fi * 2.0944 + t * 0.4; // 2pi/3
    float a2 = (fi + 1.0) * 2.0944 + t * 0.4;
    float triR = 0.55 + u_bass * 0.05;
    vec2 v1 = triR * vec2(
      (2.0 * cos(a1) + cos(2.0 * a1)) / 3.0,
      (2.0 * sin(a1) - sin(2.0 * a1)) / 3.0
    );
    vec2 v2 = triR * vec2(
      (2.0 * cos(a2) + cos(2.0 * a2)) / 3.0,
      (2.0 * sin(a2) - sin(2.0 * a2)) / 3.0
    );
    // Line segment distance
    vec2 pa = uv - v1;
    vec2 ba = v2 - v1;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float lineDist = length(pa - ba * h);
    float lineGlow = exp(-lineDist * 50.0) * 0.2;
    vec3 lineCol = palette(
      fi * 0.33 + t * 0.3 + 0.5,
      vec3(0.55, 0.55, 0.6),
      vec3(0.3, 0.32, 0.4),
      vec3(0.5, 0.7, 1.0),
      vec3(0.1, 0.1, 0.3)
    );
    color += lineCol * lineGlow * (0.5 + u_treble * 0.5);
  }

  // Cusps glow points
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float ca = fi * 2.0944 + t * 0.4;
    float size = 0.55 + u_bass * 0.05;
    vec2 cusp = size * vec2(cos(ca), sin(ca)); // Cusps at these positions
    // Actually deltoid cusps are at cos(0),cos(2pi/3),cos(4pi/3) parametric
    cusp = size * vec2(
      (2.0 * cos(ca) + cos(2.0 * ca)) / 3.0,
      (2.0 * sin(ca) - sin(2.0 * ca)) / 3.0
    );
    float dd = length(uv - cusp);
    float cuspGlow = exp(-dd * dd * 500.0) * (0.5 + u_amplitude * 0.5);
    color += vec3(0.7, 0.75, 0.9) * cuspGlow;
  }

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
