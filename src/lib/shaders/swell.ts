import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Swell — Deep ocean swell: slow massive wave movement with subsurface light

// 3-octave fbm for performance
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Smooth deep wave
float deepWave(vec2 p, float freq, float speed, float angle) {
  vec2 dir = vec2(cos(angle), sin(angle));
  float phase = dot(p, dir) * freq + u_time * speed;
  // Smooth sine with slight asymmetry (wave crests sharper than troughs)
  return (sin(phase) + 0.3 * sin(phase * 2.0 + 0.5)) * (0.5 / freq);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;

  // Ocean surface viewed from slightly above and at an angle
  // Apply perspective: compress y as it recedes
  float horizon = smoothstep(-0.1, 0.5, uv.y);
  float depth = 1.0 / max(0.3 + uv.y * 0.7, 0.1);
  vec2 seaUV = vec2(uv.x * depth, depth * 0.5 + t * 2.0);

  // Massive deep swell waves
  float h = 0.0;
  h += deepWave(seaUV, 0.6, 0.15, 0.1);
  h += deepWave(seaUV, 1.0, 0.12, 0.5);
  h += deepWave(seaUV, 1.6, 0.20, 1.2);
  h += fbm3(seaUV * 0.5 + vec2(t)) * 0.1;
  h *= (1.0 + u_bass * 0.4);

  // Wave slope — determines where light catches
  float eps = 0.03;
  float hx = deepWave(seaUV + vec2(eps, 0.0), 0.6, 0.15, 0.1)
           + deepWave(seaUV + vec2(eps, 0.0), 1.0, 0.12, 0.5);
  float slope = (h - hx) / eps;

  // Subsurface scattering — light penetrating the wave face
  float sss = smoothstep(-0.5, 0.5, slope) * horizon;
  sss *= (0.5 + u_mid * 0.5);

  // Surface glints — sunlight reflecting off wave peaks
  float glint = pow(max(slope * 2.0, 0.0), 4.0);
  glint *= horizon * u_treble * 0.6;

  // Deep blue glow from below
  float subsurface = fbm3(seaUV * 0.8 + vec2(t * 0.3, t * 0.15));
  subsurface = 0.5 + 0.5 * subsurface;
  subsurface *= (1.0 - horizon * 0.5);

  // Gentle foam on swell crests
  float foam = smoothstep(0.25, 0.35, h) * horizon;
  foam *= snoise(seaUV * 8.0 + vec2(t * 2.0)) * 0.5 + 0.5;
  foam *= 0.2;

  // ── Color ──
  // Deep ocean — near-black indigo
  vec3 deepOcean = palette(
    subsurface * 0.3 + t * 0.04,
    vec3(0.02, 0.03, 0.08),
    vec3(0.02, 0.04, 0.10),
    vec3(0.3, 0.4, 0.7),
    vec3(0.08, 0.12, 0.30)
  );

  // Mid-depth — dark teal
  vec3 midOcean = palette(
    h * 0.2 + horizon * 0.3 + t * 0.05,
    vec3(0.03, 0.10, 0.16),
    vec3(0.04, 0.12, 0.18),
    vec3(0.3, 0.6, 0.7),
    vec3(0.06, 0.18, 0.32)
  );

  // Subsurface scatter color — luminous teal/green
  vec3 sssColor = palette(
    sss * 0.4 + slope * 0.2 + t * 0.07 + u_amplitude * 0.15,
    vec3(0.08, 0.28, 0.30),
    vec3(0.12, 0.30, 0.28),
    vec3(0.5, 0.8, 0.7),
    vec3(0.05, 0.22, 0.35)
  );

  // Sky reflection on surface
  vec3 skyReflect = palette(
    horizon * 0.3 + t * 0.03,
    vec3(0.08, 0.10, 0.20),
    vec3(0.06, 0.08, 0.15),
    vec3(0.4, 0.5, 0.8),
    vec3(0.12, 0.18, 0.35)
  );

  // Build ocean
  vec3 color = mix(deepOcean, midOcean, horizon * 0.6);

  // Subsurface scattering on wave faces
  color = mix(color, sssColor, sss * 0.5);

  // Sky reflection on calm areas
  color = mix(color, skyReflect, horizon * horizon * 0.2);

  // Wave height modulation
  color += midOcean * h * 0.15;

  // Glints
  color += vec3(0.7, 0.85, 0.9) * glint * 0.3;

  // Foam
  color += vec3(0.6, 0.7, 0.75) * foam;

  // Deep subsurface glow
  color += deepOcean * subsurface * 0.2;

  // Vignette
  float vignette = 1.0 - smoothstep(0.45, 1.35, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
