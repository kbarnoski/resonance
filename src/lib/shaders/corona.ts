import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Corona — Solar corona: radial light filaments emanating from
// a central dark disc, plasma tendrils stretching into the void.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Plasma filament — a tendril of hot gas along a magnetic field line
float filament(vec2 uv, float angle, float t, float seed) {
  vec2 dir = vec2(cos(angle), sin(angle));
  float proj = dot(uv, dir);
  float perp = dot(uv, vec2(-dir.y, dir.x));

  // Only outward from the disc
  if (proj < 0.0) return 0.0;

  // Filament wiggles via noise
  float wiggle = snoise(vec2(proj * 6.0 + seed, t * 0.4 + seed)) * 0.04;
  perp += wiggle;

  // Taper outward
  float width = 0.015 * (1.0 - smoothstep(0.0, 0.7, proj));
  float core = smoothstep(width, 0.0, abs(perp));

  // Fade outward
  float fade = smoothstep(0.8, 0.15, proj);

  // Pulsing brightness
  float pulse = 0.7 + 0.3 * sin(t * 1.5 + seed * 3.0 + proj * 8.0);

  return core * fade * pulse;
}

// Streamer — broader, fainter coronal streamer
float streamer(vec2 uv, float angle, float t, float seed) {
  vec2 dir = vec2(cos(angle), sin(angle));
  float proj = dot(uv, dir);
  float perp = dot(uv, vec2(-dir.y, dir.x));

  if (proj < 0.05) return 0.0;

  float wiggle = snoise(vec2(proj * 3.0, t * 0.2 + seed)) * 0.06;
  perp += wiggle;

  float width = 0.06 * (1.0 - smoothstep(0.0, 1.0, proj));
  float shape = exp(-perp * perp / (width * width * 2.0));

  float fade = exp(-proj * 2.5);
  return shape * fade * 0.5;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // ── Central dark disc — the eclipsed sun ──
  float disc = smoothstep(0.14, 0.12, r);

  // ── Inner corona — intense glow just outside the disc ──
  float innerCorona = smoothstep(0.12, 0.3, r) * exp(-(r - 0.13) * 8.0);
  innerCorona *= (1.0 + u_bass * 0.5);

  // Corona noise texture
  float coronaNoise = fbm3(vec2(a * 2.0 + t * 0.1, r * 6.0 - t * 0.3));
  innerCorona *= (0.7 + coronaNoise * 0.5);

  // ── Plasma filaments — many thin tendrils ──
  float filaments = 0.0;
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float fAngle = fi * 0.2618 + sin(fi * 1.7 + t * 0.1) * 0.15;
    float intensity = 0.6 + 0.4 * sin(fi * 2.3 + t * 0.3);
    filaments += filament(uv, fAngle, t, fi * 7.3) * intensity;
  }
  filaments *= (0.6 + u_treble * 1.0);

  // ── Broad streamers — fewer, wider ──
  float streamers = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float sAngle = fi * 1.047 + t * 0.03 + sin(t * 0.08 + fi) * 0.3;
    streamers += streamer(uv, sAngle, t, fi * 13.7);
  }
  streamers *= (0.5 + u_mid * 0.8);

  // ── Outer diffuse glow ──
  float outerGlow = exp(-r * 2.0) * 0.3;
  float outerNoise = snoise(vec2(a * 1.5 + t * 0.05, r * 3.0)) * 0.5 + 0.5;
  outerGlow *= (0.6 + outerNoise * 0.4);

  // ── Colors ──
  float paletteShift = u_amplitude * 0.25;

  // Inner corona — brilliant white-gold
  vec3 innerCol = palette(
    innerCorona + t * 0.02 + paletteShift,
    vec3(0.9, 0.85, 0.7),
    vec3(0.15, 0.1, 0.05),
    vec3(0.3, 0.2, 0.1),
    vec3(0.0, 0.0, 0.05)
  );

  // Filament color — hot pinkish-white to gold
  vec3 filCol = palette(
    filaments * 0.5 + a * 0.1 + t * 0.03 + paletteShift + 0.2,
    vec3(0.85, 0.7, 0.55),
    vec3(0.2, 0.15, 0.1),
    vec3(0.4, 0.25, 0.1),
    vec3(0.0, 0.05, 0.1)
  );

  // Streamer color — cooler, more violet
  vec3 streamCol = palette(
    streamers + r * 0.3 + t * 0.01 + paletteShift + 0.5,
    vec3(0.6, 0.5, 0.6),
    vec3(0.25, 0.2, 0.3),
    vec3(0.5, 0.3, 0.8),
    vec3(0.1, 0.1, 0.3)
  );

  // Outer glow — faint warm
  vec3 outerCol = palette(
    outerGlow + t * 0.015 + paletteShift + 0.35,
    vec3(0.5, 0.45, 0.35),
    vec3(0.2, 0.15, 0.1),
    vec3(0.4, 0.3, 0.2),
    vec3(0.05, 0.05, 0.1)
  );

  // ── Compose ──
  vec3 color = vec3(0.0);

  // Outer glow base
  color += outerCol * outerGlow;

  // Streamers
  color += streamCol * streamers;

  // Filaments
  color += filCol * filaments;

  // Inner corona
  color += innerCol * innerCorona;

  // Dark disc — near black with faint surface detail
  float surfaceDetail = snoise(uv * 20.0 + t * 0.1) * 0.02;
  vec3 discCol = vec3(0.01 + surfaceDetail);
  color = mix(color, discCol, disc);

  // Limb brightening — bright ring at disc edge
  float limb = smoothstep(0.14, 0.12, r) - smoothstep(0.12, 0.10, r);
  color += vec3(1.0, 0.9, 0.7) * limb * 1.5;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.3, r);
  color *= (0.7 + 0.3 * vignette);

  // Tonemap
  color = color / (color + 0.5);

  gl_FragColor = vec4(color, 1.0);
}
`;
