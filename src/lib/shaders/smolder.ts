import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Smolder — internal heat visible through cracks in dark surface

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;
  vec3 color = vec3(0.0);

  // Dark surface texture
  float surface = fbm3(uv * 4.0 + t * 0.05);
  vec3 darkSurface = vec3(0.02, 0.015, 0.025) * (surface * 0.3 + 0.7);
  color += darkSurface;

  // Crack network — using noise zero-crossings
  float crack1 = abs(snoise(uv * 5.0 + vec2(t * 0.1, 0.0)));
  float crack2 = abs(snoise(uv * 3.5 + vec2(0.0, t * 0.08) + 3.0));
  float crack3 = abs(snoise(uv * 7.0 + vec2(t * 0.05, t * 0.05) + 7.0));

  // Thin bright cracks — orange heat below
  float crackLine1 = smoothstep(0.04, 0.0, crack1) * 0.25;
  float crackLine2 = smoothstep(0.03, 0.0, crack2) * 0.18;
  float crackLine3 = smoothstep(0.02, 0.0, crack3) * 0.10;
  float cracks = crackLine1 + crackLine2 + crackLine3;

  // Heat color — deep orange to red
  vec3 heatColor = palette(cracks * 3.0 + t * 0.2,
    vec3(0.15, 0.04, 0.0),
    vec3(0.12, 0.06, 0.02),
    vec3(1.0, 0.5, 0.2),
    vec3(0.0, 0.1, 0.2)
  );
  color += heatColor * cracks * (1.0 + 0.2 * u_bass);

  // Deeper glow bleeding around cracks
  float bleed1 = smoothstep(0.15, 0.0, crack1) * 0.06;
  float bleed2 = smoothstep(0.12, 0.0, crack2) * 0.04;
  color += vec3(0.12, 0.04, 0.005) * (bleed1 + bleed2);

  // Heat shimmer — very subtle distortion feel
  float shimmer = snoise(uv * 10.0 + vec2(0.0, t * 0.8)) * 0.003;
  color += vec3(0.06, 0.02, 0.0) * abs(shimmer) * (1.0 + 0.1 * u_mid);

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
