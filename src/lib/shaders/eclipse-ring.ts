import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Eclipse Ring — thin bright ring around absolute darkness

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.04;
  vec3 color = vec3(0.0);

  float dist = length(uv);
  float angle = atan(uv.y, uv.x);

  // Dark disc — absolute darkness at center
  float discRadius = 0.32 + 0.02 * sin(t * 0.5);

  // Corona ring — thin luminous ring at edge
  float ringDist = abs(dist - discRadius);
  float ring = exp(-ringDist * 60.0);

  // Ring brightness varies around circumference
  float coronaVar = 0.7 + 0.3 * sin(angle * 3.0 + t * 0.4)
                        + 0.15 * sin(angle * 7.0 - t * 0.6);
  ring *= coronaVar;

  // Ring color — warm white/gold corona
  vec3 coronaColor = palette(angle * 0.15 + t * 0.08,
    vec3(0.18, 0.12, 0.05),
    vec3(0.14, 0.10, 0.06),
    vec3(1.0, 0.8, 0.5),
    vec3(0.0, 0.05, 0.15)
  );
  color += coronaColor * ring * 0.35 * (1.0 + 0.15 * u_bass);

  // Outer corona — very faint extended glow
  float outerCorona = exp(-(dist - discRadius) * 5.0) * step(discRadius, dist);
  color += vec3(0.06, 0.035, 0.015) * outerCorona * 0.8;

  // Solar prominences — tiny noise bumps on the ring
  float prominence = fbm3(vec2(angle * 3.0, t * 0.5)) * 0.5 + 0.5;
  float promShape = exp(-abs(dist - discRadius - prominence * 0.08) * 30.0);
  promShape *= step(discRadius, dist) * prominence;
  color += vec3(0.12, 0.06, 0.02) * promShape * 0.2;

  // Inner disc is pure black — ensure no light leaks
  color *= smoothstep(discRadius - 0.01, discRadius + 0.01, dist) + 0.001;

  // Very faint background stars
  float star = smoothstep(0.65, 0.68, snoise(uv * 30.0));
  color += vec3(0.02) * star * step(discRadius + 0.1, dist);

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
