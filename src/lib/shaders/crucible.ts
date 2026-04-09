import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Crucible — dark vessel containing barely-visible molten material

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

  // Bowl shape — parabolic vessel
  float bowlWidth = 0.4;
  float bowlDepth = 0.25;
  float bowlY = -0.1; // center of bowl opening

  // Vessel walls — parabola
  float parabola = (uv.x * uv.x) / (bowlWidth * bowlWidth) * bowlDepth + bowlY;
  float wallDist = uv.y - parabola;

  // Vessel body — dark exterior
  float vessel = smoothstep(0.0, -0.02, wallDist) * smoothstep(-0.15, -0.05, wallDist);
  float vesselEdge = exp(-abs(wallDist) * 50.0) * step(-bowlWidth * 1.1, uv.x) * step(uv.x, bowlWidth * 1.1);

  // Dark vessel body
  color += vec3(0.025, 0.02, 0.03) * vessel;
  color += vec3(0.06, 0.04, 0.025) * vesselEdge;

  // Molten interior — visible from above (above the parabola, within bowl width)
  float inBowl = smoothstep(bowlWidth * 0.9, bowlWidth * 0.7, abs(uv.x));
  float aboveBowl = smoothstep(parabola - 0.01, parabola + 0.03, uv.y);
  float belowRim = smoothstep(bowlY + 0.08, bowlY + 0.02, uv.y);
  float molten = inBowl * aboveBowl * belowRim;

  // Molten surface — slow-moving hot material
  float moltenTex = fbm3(vec2(uv.x * 4.0 + t * 0.3, uv.y * 2.0 + sin(t * 0.5) * 0.5));
  vec3 moltenColor = palette(moltenTex * 0.5 + t * 0.15,
    vec3(0.15, 0.04, 0.0),
    vec3(0.2, 0.08, 0.02),
    vec3(1.0, 0.5, 0.2),
    vec3(0.0, 0.1, 0.2)
  );
  color += moltenColor * molten * 0.8 * (1.0 + 0.2 * u_bass);

  // Heat glow above the surface — faint upward radiance
  float heatAbove = smoothstep(bowlY + 0.03, bowlY + 0.2, uv.y) *
                    smoothstep(bowlY + 0.35, bowlY + 0.15, uv.y) * inBowl;
  color += vec3(0.08, 0.035, 0.01) * heatAbove;

  // Rim highlight
  float rim = exp(-abs(uv.y - bowlY - 0.03) * 40.0) * inBowl;
  color += vec3(0.06, 0.03, 0.012) * rim;

  // Audio
  color *= 1.0 + 0.15 * u_amplitude;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
