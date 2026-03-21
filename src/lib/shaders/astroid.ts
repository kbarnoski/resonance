import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Astroid / Hypocycloid (4-cusped star) ----
// The astroid is x^(2/3) + y^(2/3) = r^(2/3), a 4-cusped curve
// traced by a point on a circle of radius r/4 rolling inside radius r.

float astroidDist(vec2 p, float r, float thick) {
  // Parametric distance: find closest point on astroid
  // Astroid: (r*cos^3(a), r*sin^3(a))
  float minD = 999.0;
  for (int i = 0; i < 64; i++) {
    float a = float(i) * 6.28318 / 64.0;
    float ca = cos(a);
    float sa = sin(a);
    vec2 pt = r * vec2(ca * ca * ca, sa * sa * sa);
    minD = min(minD, length(p - pt));
  }
  return minD - thick;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  // Rotate the whole view slowly
  vec2 p = rot2(t * 0.3) * uv;

  // Audio-reactive size and glow
  float baseR = 0.35 + u_bass * 0.08;
  float thick = 0.003 + u_treble * 0.002;

  vec3 color = vec3(0.0);

  // Multiple nested astroids at different scales and rotations
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float r = baseR * (1.0 - fi * 0.15);
    float rot = t * (0.5 + fi * 0.2) + fi * 0.6;
    vec2 rp = rot2(rot) * p;

    float d = astroidDist(rp, r, thick);

    // Glow layers
    float glow = exp(-abs(d) * (40.0 + u_mid * 10.0));
    float core = smoothstep(0.005, 0.0, abs(d));

    vec3 col = palette(
      fi * 0.2 + t * 0.3 + u_amplitude * 0.2,
      vec3(0.5, 0.5, 0.55),
      vec3(0.4, 0.45, 0.5),
      vec3(0.8, 0.9, 1.0),
      vec3(0.0, 0.1, 0.25)
    );

    color += col * glow * (0.5 - fi * 0.06);
    color += col * core * (0.8 - fi * 0.1);
  }

  // Cusp points: bright dots at the 4 cusps
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.5708 + t * 0.5;
    vec2 cusp = baseR * vec2(cos(a), sin(a));
    // Cusps pulse with bass
    cusp *= (1.0 + u_bass * 0.1);
    float d = length(rot2(t * 0.3) * uv - cusp);
    float dot_glow = exp(-d * d * 800.0) * (0.6 + u_treble * 0.4);
    vec3 dotCol = palette(
      float(i) * 0.25 + t * 0.5,
      vec3(0.7, 0.7, 0.75),
      vec3(0.3, 0.35, 0.4),
      vec3(0.6, 0.8, 1.0),
      vec3(0.1, 0.15, 0.3)
    );
    color += dotCol * dot_glow;
  }

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
