import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Comet — a bright nucleus trailing a curved tail of particles across the void.
// The tail curves with bass, coma glows with treble, parallax star field behind.

float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

// Star field at a given parallax depth
float starLayer(vec2 uv, float scale, float seed) {
  vec2 id = floor(uv * scale);
  vec2 f = fract(uv * scale) - 0.5;
  float h = fract(sin(dot(id + seed, vec2(127.1, 311.7))) * 43758.5453);
  if (h < 0.95) return 0.0;
  float brightness = fract(h * 37.3);
  float twinkle = 0.7 + 0.3 * sin(u_time * (1.0 + h * 5.0) + h * 80.0);
  float r = 0.02 + 0.025 * brightness;
  return smoothstep(r, 0.0, length(f)) * twinkle * brightness;
}

// Curved comet tail — bezier-like arc
float cometTail(vec2 uv, vec2 nucleus, float t, float bass) {
  float totalGlow = 0.0;
  float curvature = 0.5 + bass * 0.8;

  // Sample tail as a series of points along a curved path
  for (int i = 0; i < 40; i++) {
    float s = float(i) / 40.0;
    // Tail extends away from direction of travel
    float tailX = nucleus.x - s * 1.6;
    // Curve bends with bass — solar wind pushing the tail
    float tailY = nucleus.y + sin(s * 3.14159 * 0.8) * curvature * s;
    // Add fbm turbulence to tail
    tailY += fbm(vec2(s * 3.0 + t * 0.2, t * 0.1)) * 0.15 * s;
    tailX += snoise(vec2(s * 4.0, t * 0.15)) * 0.05 * s;

    vec2 tailPos = vec2(tailX, tailY);
    float dist = length(uv - tailPos);

    // Tail widens and dims further from nucleus
    float width = 0.008 + s * 0.12;
    float brightness = (1.0 - s) * (1.0 - s);
    totalGlow += smoothstep(width, 0.0, dist) * brightness * 0.08;
    // Wider diffuse glow
    totalGlow += exp(-dist * dist / (width * width * 4.0)) * brightness * 0.03;
  }
  return totalGlow;
}

// Ion tail — straight, narrow, blue
float ionTail(vec2 uv, vec2 nucleus, float t) {
  float totalGlow = 0.0;
  for (int i = 0; i < 30; i++) {
    float s = float(i) / 30.0;
    float tailX = nucleus.x - s * 2.0;
    float tailY = nucleus.y + s * 0.05;
    tailY += snoise(vec2(s * 8.0, t * 0.3)) * 0.02 * s;

    vec2 tailPos = vec2(tailX, tailY);
    float dist = length(uv - tailPos);

    float width = 0.003 + s * 0.03;
    float brightness = (1.0 - s);
    totalGlow += smoothstep(width, 0.0, dist) * brightness * 0.06;
  }
  return totalGlow;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  // Nucleus position — drifts slowly across screen
  vec2 nucleus = vec2(
    sin(t * 0.3) * 0.3 + 0.15,
    cos(t * 0.2) * 0.15 + sin(t * 0.15) * 0.08
  );

  // ── Parallax star field — three depth layers ──
  vec2 drift = vec2(t * 0.05, t * 0.02);
  float s1 = starLayer(uv + drift * 0.3, 40.0, 0.0);
  float s2 = starLayer(uv + drift * 0.6, 60.0, 17.3);
  float s3 = starLayer(uv + drift * 1.0, 80.0, 41.7);

  // ── Dust tail — wide, curved, yellowish ──
  float dustTail = cometTail(uv, nucleus, t, u_bass);

  // ── Ion tail — narrow, straight, bluish ──
  float ionT = ionTail(uv, nucleus, t);

  // ── Nucleus — bright point source ──
  float nucleusDist = length(uv - nucleus);
  float nucleusGlow = 0.004 / (nucleusDist * nucleusDist + 0.0004);
  float nucleusSharp = exp(-nucleusDist * 40.0) * 3.0;

  // ── Coma — fuzzy envelope around nucleus, treble-reactive ──
  float coma = exp(-nucleusDist * 6.0) * (0.5 + u_treble * 1.0);
  // Coma has structure — jet-like features
  float comaAngle = atan(uv.y - nucleus.y, uv.x - nucleus.x);
  float comaJets = sin(comaAngle * 3.0 + t * 2.0) * 0.5 + 0.5;
  coma *= (0.7 + comaJets * 0.4);
  // fbm texture in coma
  float comaTexture = fbm((uv - nucleus) * 8.0 + t * 0.1) * 0.5 + 0.5;
  coma *= (0.6 + comaTexture * 0.5);

  // ── Particle debris field around tail ──
  float particles = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float px = nucleus.x - hash1(fi * 7.3) * 1.2;
    float py = nucleus.y + (hash1(fi * 13.1) - 0.5) * 0.4;
    py += sin(t * 0.5 + fi) * 0.05;
    float pd = length(uv - vec2(px, py));
    float pSize = 0.003 + hash1(fi * 19.7) * 0.005;
    particles += smoothstep(pSize, 0.0, pd) * (0.3 + u_mid * 0.4);
  }

  // ── Colors ──
  // Deep space background
  vec3 bgCol = palette(
    length(uv) * 0.2 + t * 0.01 + paletteShift,
    vec3(0.02, 0.02, 0.04),
    vec3(0.03, 0.02, 0.05),
    vec3(0.5, 0.3, 0.8),
    vec3(0.2, 0.1, 0.3)
  );

  // Dust tail — warm gold-white
  vec3 dustCol = palette(
    dustTail * 2.0 + t * 0.03 + paletteShift,
    vec3(0.6, 0.55, 0.4),
    vec3(0.4, 0.35, 0.2),
    vec3(0.3, 0.2, 0.1),
    vec3(0.05, 0.02, 0.0)
  );

  // Ion tail — cool blue
  vec3 ionCol = palette(
    ionT * 3.0 + t * 0.04 + paletteShift + 0.6,
    vec3(0.4, 0.5, 0.6),
    vec3(0.3, 0.4, 0.5),
    vec3(0.2, 0.5, 0.9),
    vec3(0.1, 0.2, 0.5)
  );

  // Coma — bright white-blue with green tinge (C2 emission)
  vec3 comaCol = palette(
    coma + t * 0.05 + paletteShift + 0.3,
    vec3(0.6, 0.7, 0.6),
    vec3(0.3, 0.3, 0.3),
    vec3(0.3, 0.5, 0.3),
    vec3(0.1, 0.15, 0.1)
  );

  // Nucleus — brilliant white
  vec3 nucleusCol = palette(
    t * 0.1 + paletteShift,
    vec3(0.95, 0.95, 0.9),
    vec3(0.05, 0.05, 0.1),
    vec3(0.2, 0.15, 0.1),
    vec3(0.0, 0.0, 0.05)
  );

  vec3 color = bgCol;

  // Stars
  vec3 starColor = vec3(0.9, 0.95, 1.0);
  color += starColor * s1 * 0.5;
  color += starColor * s2 * 0.7;
  color += starColor * s3 * 0.9;

  // Dust tail
  color += dustCol * dustTail * (1.0 + u_bass * 0.6);

  // Ion tail
  color += ionCol * ionT * (0.8 + u_mid * 0.5);

  // Coma
  color += comaCol * coma;

  // Nucleus
  color += nucleusCol * (nucleusGlow + nucleusSharp) * (0.8 + u_amplitude * 0.8);

  // Particles
  color += dustCol * particles;

  // Emissive bloom at nucleus
  color += vec3(1.4, 1.3, 1.1) * exp(-nucleusDist * 20.0) * (1.0 + u_treble * 1.5);

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.3, length(uv));
  color *= vignette;

  // Tonemap
  color = color / (color + 0.7);
  color = pow(color, vec3(0.92));

  gl_FragColor = vec4(color, 1.0);
}
`;
