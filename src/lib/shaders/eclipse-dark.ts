import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Dark eclipse — the moment of totality.
// Corona barely visible around absolute black. Diamond ring effect.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;

  // ── The dark disc — absolute black center ──
  float dist = length(uv);
  float moonRadius = 0.28 + u_bass * 0.02;
  float disc = smoothstep(moonRadius, moonRadius - 0.005, dist);

  // ── Corona — plasma streamers radiating outward ──
  float angle = atan(uv.y, uv.x);
  float coronaBase = smoothstep(moonRadius + 0.25, moonRadius + 0.01, dist);
  float coronaFade = exp(-(dist - moonRadius) * 4.0);

  // Streamer pattern — angular noise creates irregular corona
  float streamer = fbm3(vec2(angle * 3.0, dist * 4.0 - t * 0.5));
  streamer += fbm3(vec2(angle * 5.0 + 1.0, dist * 6.0 - t * 0.3)) * 0.5;
  float streamerMask = smoothstep(-0.2, 0.5, streamer) * coronaFade;

  // ── Inner corona — brighter, tighter to the limb ──
  float innerCorona = exp(-(dist - moonRadius) * 12.0);
  innerCorona *= smoothstep(moonRadius - 0.01, moonRadius + 0.02, dist);

  // Chromatic ring — the thin red/pink ring right at the limb
  float chromatic = exp(-pow((dist - moonRadius) * 30.0, 2.0));

  // ── Diamond ring effect — single bright point on the limb ──
  float diamondAngle = t * 0.3 + sin(t * 0.1) * 0.5;
  vec2 diamondPos = vec2(cos(diamondAngle), sin(diamondAngle)) * moonRadius;
  float diamondDist = length(uv - diamondPos);
  float diamond = 0.003 / (diamondDist * diamondDist + 0.001);
  diamond *= (0.5 + u_treble * 0.5);

  // ── Colors ──
  // Corona — pale gold to white
  vec3 coronaColor = palette(
    streamer * 0.5 + t * 0.1 + u_amplitude * 0.2,
    vec3(0.5, 0.4, 0.3),
    vec3(0.3, 0.25, 0.2),
    vec3(0.8, 0.7, 0.5),
    vec3(0.0, 0.05, 0.1)
  );

  // Inner corona — blue-white
  vec3 innerColor = palette(
    dist * 2.0 + t * 0.15,
    vec3(0.6, 0.6, 0.7),
    vec3(0.3, 0.3, 0.4),
    vec3(0.5, 0.6, 0.9),
    vec3(0.0, 0.1, 0.2)
  );

  // Chromatic — deep red prominences
  vec3 chromaticColor = vec3(0.8, 0.1, 0.15);

  // ── Background — not pure black, faint deep blue void ──
  vec3 bgColor = palette(
    angle * 0.1 + t * 0.05,
    vec3(0.005, 0.005, 0.015),
    vec3(0.01, 0.008, 0.02),
    vec3(0.5, 0.4, 0.8),
    vec3(0.2, 0.15, 0.3)
  );

  // Faint stars
  float stars = 0.0;
  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    vec2 starPos = vec2(
      fract(sin(fi * 127.1) * 43758.5) * 2.0 - 1.0,
      fract(sin(fi * 311.7) * 43758.5) * 2.0 - 1.0
    );
    float sd = length(uv - starPos);
    float twinkle = 0.5 + 0.5 * sin(t * 10.0 + fi * 5.0);
    stars += 0.0001 / (sd * sd + 0.0003) * twinkle;
  }

  // ── Compositing ──
  vec3 color = bgColor;
  color += vec3(0.8, 0.85, 1.0) * stars * 0.02;
  color += coronaColor * streamerMask * 0.6 * (0.7 + u_mid * 0.3);
  color += innerColor * innerCorona * 0.8;
  color += chromaticColor * chromatic * 0.5;

  // Diamond ring
  vec3 diamondColor = vec3(1.2, 1.1, 1.0);
  color += diamondColor * diamond * 0.015;

  // The disc itself — absolute black
  color *= (1.0 - disc);

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.3, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
