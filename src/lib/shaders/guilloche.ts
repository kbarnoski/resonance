import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Guilloche Pattern ----
// Intricate overlapping spirograph patterns used in banknote security.
// Epitrochoid curves with multiple overlapping layers.

vec2 epitrochoid(float s, float R, float r, float d) {
  float ratio = (R + r) / r;
  return vec2(
    (R + r) * cos(s) - d * cos(ratio * s),
    (R + r) * sin(s) - d * sin(ratio * s)
  );
}

float guillocheLine(vec2 p, float R, float r, float d, float scale) {
  float minD = 999.0;
  for (int i = 0; i < 200; i++) {
    float s = float(i) * 6.28318 * 3.0 / 200.0;
    vec2 pt = epitrochoid(s, R, r, d) * scale;
    minD = min(minD, length(p - pt));
  }
  return minD;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  vec3 color = vec3(0.0);

  vec2 p = rot2(t * 0.08) * uv;

  // Layer 1: outer guilloche band
  float R1 = 1.0 + u_bass * 0.1;
  float r1 = 0.33;
  float d1 = 0.28 + u_mid * 0.04;
  float scale1 = 0.22;
  float dist1 = guillocheLine(p, R1, r1, d1, scale1);
  float glow1 = exp(-dist1 * (35.0 + u_treble * 10.0));
  float core1 = smoothstep(0.005, 0.0, dist1);

  vec3 col1 = palette(
    dist1 * 5.0 + t * 0.3 + u_amplitude * 0.2,
    vec3(0.5, 0.5, 0.55),
    vec3(0.4, 0.42, 0.5),
    vec3(0.7, 0.9, 1.0),
    vec3(0.0, 0.1, 0.25)
  );
  color += col1 * glow1 * 0.35;
  color += col1 * core1 * 0.5;

  // Layer 2: middle guilloche — different parameters
  float R2 = 0.8 + u_bass * 0.08;
  float r2 = 0.25;
  float d2 = 0.22 + u_treble * 0.03;
  float scale2 = 0.25;
  vec2 p2 = rot2(t * 0.12 + 0.5) * uv;
  float dist2 = guillocheLine(p2, R2, r2, d2, scale2);
  float glow2 = exp(-dist2 * (38.0 + u_mid * 8.0));
  float core2 = smoothstep(0.004, 0.0, dist2);

  vec3 col2 = palette(
    dist2 * 4.0 + t * 0.25 + 0.33,
    vec3(0.45, 0.48, 0.55),
    vec3(0.38, 0.4, 0.48),
    vec3(0.6, 0.85, 1.0),
    vec3(0.05, 0.12, 0.3)
  );
  color += col2 * glow2 * 0.3;
  color += col2 * core2 * 0.45;

  // Layer 3: inner fine detail
  float R3 = 0.5 + sin(t * 0.3) * 0.1;
  float r3 = 0.18;
  float d3 = 0.15 + u_amplitude * 0.03;
  float scale3 = 0.3;
  vec2 p3 = rot2(-t * 0.15 + 1.0) * uv;
  float dist3 = guillocheLine(p3, R3, r3, d3, scale3);
  float glow3 = exp(-dist3 * (40.0 + u_bass * 8.0));

  vec3 col3 = palette(
    dist3 * 3.0 + t * 0.2 + 0.66,
    vec3(0.5, 0.5, 0.56),
    vec3(0.35, 0.38, 0.45),
    vec3(0.5, 0.8, 1.0),
    vec3(0.08, 0.12, 0.28)
  );
  color += col3 * glow3 * 0.25;

  // Moiré interference between layers
  float moire = glow1 * glow2 * 3.0;
  vec3 moireCol = palette(
    t * 0.4 + u_amplitude * 0.3,
    vec3(0.6, 0.6, 0.65),
    vec3(0.3, 0.3, 0.4),
    vec3(0.5, 0.7, 1.0),
    vec3(0.1, 0.1, 0.3)
  );
  color += moireCol * moire * 0.15;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
