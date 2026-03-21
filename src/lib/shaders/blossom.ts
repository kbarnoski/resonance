import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  // Petal coordinate system — polar with organic distortion
  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Bloom unfurling — time-based opening
  float bloomProgress = sin(t * 0.3) * 0.5 + 0.5;
  bloomProgress = bloomProgress * 0.6 + 0.4; // never fully closed

  // Number of petals and their shape
  float petalCount = 5.0;
  float petalAngle = mod(angle + t * 0.05, 6.28318 / petalCount) - 3.14159 / petalCount;
  float petalR = cos(petalAngle * petalCount * 0.5) * 0.35 * bloomProgress;

  // Organic edge variation
  float edgeWarp = snoise(vec2(angle * 3.0, r * 5.0 + t * 0.1)) * 0.05;
  petalR += edgeWarp;

  // Petal layers — outer, mid, inner
  float outerPetal = smoothstep(petalR + 0.02, petalR - 0.02, r);
  float midPetal = smoothstep(petalR * 0.7 + 0.02, petalR * 0.7 - 0.02, r);
  float innerPetal = smoothstep(petalR * 0.4 + 0.01, petalR * 0.4 - 0.01, r);

  // Petal veins — radial lines from center
  float veins = sin(angle * petalCount * 6.0 + r * 20.0) * 0.5 + 0.5;
  veins = pow(veins, 4.0);
  float veinPattern = veins * outerPetal;

  // Center pistil/stamen
  float center = smoothstep(0.08, 0.04, r);
  float stamenDots = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float sa = fi * 0.785 + t * 0.1;
    vec2 stamenPos = vec2(cos(sa), sin(sa)) * (0.05 + u_bass * 0.01);
    float dot = smoothstep(0.015, 0.008, length(uv - stamenPos));
    stamenDots += dot;
  }

  // Colors
  // Outer petals — soft pink
  vec3 outerColor = palette(
    angle * 0.1 + r * 0.5 + t * 0.02,
    vec3(0.65, 0.4, 0.45),
    vec3(0.25, 0.15, 0.18),
    vec3(0.9, 0.5, 0.6),
    vec3(0.0, 0.1, 0.15)
  );

  // Mid petals — warmer rose
  vec3 midColor = palette(
    angle * 0.08 + r * 0.3 + t * 0.03 + 0.15,
    vec3(0.7, 0.35, 0.4),
    vec3(0.3, 0.18, 0.2),
    vec3(1.0, 0.45, 0.55),
    vec3(0.0, 0.08, 0.12)
  );

  // Inner petals — deep magenta
  vec3 innerColor = palette(
    r * 0.8 + t * 0.04 + 0.3,
    vec3(0.55, 0.2, 0.35),
    vec3(0.3, 0.12, 0.2),
    vec3(0.8, 0.3, 0.5),
    vec3(0.0, 0.1, 0.2)
  );

  // Center — golden yellow
  vec3 centerColor = palette(
    t * 0.05,
    vec3(0.65, 0.55, 0.15),
    vec3(0.3, 0.25, 0.08),
    vec3(1.0, 0.8, 0.3),
    vec3(0.0, 0.05, 0.0)
  );

  // Background — dark green garden
  vec3 bgColor = palette(
    fbm(uv * 3.0 + t * 0.02) * 0.3 + 0.6,
    vec3(0.04, 0.08, 0.03),
    vec3(0.03, 0.05, 0.02),
    vec3(0.15, 0.3, 0.1),
    vec3(0.0, 0.1, 0.05)
  );

  // Compose
  vec3 color = bgColor;
  color = mix(color, outerColor, outerPetal);
  color = mix(color, midColor, midPetal * 0.7);
  color = mix(color, innerColor, innerPetal * 0.6);

  // Veins on petals
  color += outerColor * 0.15 * veinPattern;

  // Center
  color = mix(color, centerColor, center);
  color += centerColor * stamenDots * 0.8;

  // Petal unfurling glow — bass reactive bloom
  float unfurl = pow(outerPetal * (1.0 - midPetal), 2.0);
  color += outerColor * unfurl * u_bass * 0.35;

  // Pollen shimmer — mid reactive
  float pollen = pow(snoise(vec2(angle * 10.0 + t * 1.0, r * 15.0)) * 0.5 + 0.5, 8.0);
  color += centerColor * pollen * center * u_mid * 0.5;

  // Dew sparkle — treble
  float dew = pow(snoise(uv * 30.0 + t * 2.0) * 0.5 + 0.5, 12.0);
  color += vec3(0.8, 0.75, 0.9) * dew * u_treble * 0.4 * outerPetal;

  color *= 0.85 + u_amplitude * 0.2;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
