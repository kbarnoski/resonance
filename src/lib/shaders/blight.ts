import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Corruption spreading — dark tendrils consuming light areas

float corruption(vec2 p, float time) {
  // Multiple spreading fronts from different seed points
  float spread = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 seed = vec2(
      sin(fi * 2.4 + 0.5) * 0.6,
      cos(fi * 1.7 + 0.3) * 0.6
    );
    float dist = length(p - seed);
    // Corruption front expands with time, modulated by noise
    float noise = fbm(p * 3.0 + fi * 1.3 + time * 0.15);
    float front = dist - (0.3 + time * 0.08 + noise * 0.25);
    front = smoothstep(0.1, -0.15, front);
    spread = max(spread, front);
  }
  return spread;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;

  // The "light" areas — faintly luminous surface being consumed
  float surfaceNoise = fbm(uv * 2.5 + t * 0.03);
  float surface = surfaceNoise * 0.5 + 0.5;
  surface = smoothstep(0.3, 0.7, surface) * 0.08;

  vec3 lightColor = palette(0.2 + u_mid * 0.1,
    vec3(0.04, 0.035, 0.03),
    vec3(0.05, 0.04, 0.03),
    vec3(1.0, 1.0, 1.0),
    vec3(0.1, 0.15, 0.2));

  // Corruption mask — tendrils eating inward
  float corr = corruption(uv, t + u_bass * 0.5);

  // Tendril edge detail — fractal boundary
  float edgeNoise = fbm(uv * 8.0 + t * 0.2);
  float edgeDetail = smoothstep(0.4, 0.6, corr) - smoothstep(0.6, 0.8, corr);
  edgeDetail *= edgeNoise;

  // Corrupted areas: deep dark with sickly undertone
  vec3 blightColor = palette(0.85 + u_amplitude * 0.2,
    vec3(0.008, 0.005, 0.003),
    vec3(0.02, 0.012, 0.008),
    vec3(1.0, 1.0, 1.0),
    vec3(0.2, 0.4, 0.1));

  // Edge of corruption: faint toxic glow
  vec3 edgeColor = palette(0.35 + u_treble * 0.15,
    vec3(0.01, 0.015, 0.005),
    vec3(0.04, 0.05, 0.015),
    vec3(1.0, 1.0, 1.0),
    vec3(0.15, 0.35, 0.1));

  // Compose
  vec3 color = lightColor * surface;
  color = mix(color, blightColor, corr);
  color += edgeColor * edgeDetail * (0.3 + u_treble * 0.4);

  // Bass makes corruption pulse darker
  color *= 1.0 - corr * u_bass * 0.3;

  // Veins within corrupted areas
  float veins = fbm(uv * 12.0 + t * 0.3);
  veins = smoothstep(0.45, 0.5, veins) * corr;
  color += edgeColor * veins * 0.04;

  // Particles breaking off the corruption front
  float particles = snoise(uv * 25.0 + t * 2.0);
  particles = smoothstep(0.85, 0.95, particles) * edgeDetail;
  color += edgeColor * particles * u_treble * 0.08;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
