import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Binary — Binary star gravitational dance: two color-coded stars
// orbiting with tidal streams, Roche lobe overflow, figure-eight flow.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Roche lobe — figure-eight gravitational equipotential
float rocheLobe(vec2 uv, vec2 p1, vec2 p2, float m1, float m2) {
  float d1 = length(uv - p1);
  float d2 = length(uv - p2);

  // Simplified Roche potential
  float potential = -m1 / max(d1, 0.01) - m2 / max(d2, 0.01);

  // Centrifugal term
  vec2 com = (p1 * m1 + p2 * m2) / (m1 + m2);
  float rCom = length(uv - com);
  potential -= 0.5 * rCom * rCom;

  return potential;
}

// Mass stream — material flowing between stars
float massStream(vec2 uv, vec2 p1, vec2 p2, float t) {
  // L1 Lagrange point — between the two stars
  vec2 L1 = mix(p1, p2, 0.45);

  // Stream curves from one star through L1 to the other
  float total = 0.0;

  // Outgoing stream from star 1
  for (int i = 0; i < 16; i++) {
    float s = float(i) / 16.0;
    // Curved path: star1 -> L1 with deflection
    vec2 pt = mix(p1, L1, s);
    // Coriolis deflection
    float deflect = sin(s * 3.14159) * 0.08;
    pt += vec2(-deflect * (L1.y - p1.y), deflect * (L1.x - p1.x)) / max(length(L1 - p1), 0.01);

    // Clumpy flow
    float phase = s * 20.0 - t * 3.0;
    float clump = smoothstep(0.3, 0.7, sin(phase) * 0.5 + 0.5);

    float d = length(uv - pt);
    total += smoothstep(0.015, 0.0, d) * clump * (1.0 - s * 0.5);
  }

  // Incoming stream wrapping around star 2
  for (int i = 0; i < 16; i++) {
    float s = float(i) / 16.0;
    vec2 pt = mix(L1, p2, s);
    // Deflects into accretion spiral
    float spiral = s * 3.14159 * 0.5;
    float spiralR = 0.05 * (1.0 - s);
    pt += vec2(cos(spiral + t * 2.0), sin(spiral + t * 2.0)) * spiralR;

    float d = length(uv - pt);
    total += smoothstep(0.012, 0.0, d) * 0.7;
  }

  return total;
}

// Accretion disc around the accreting star
float accretionDisc(vec2 uv, vec2 center, float t) {
  vec2 local = uv - center;
  float r = length(local);
  float a = atan(local.y, local.x);

  // Thin ring
  float ring = exp(-pow((r - 0.06) / 0.02, 2.0));

  // Spiral density wave
  float spiral = sin(a * 3.0 - r * 40.0 + t * 4.0) * 0.5 + 0.5;

  // Hot spot where stream impacts
  float hotSpot = exp(-pow(a - 1.0 - t * 0.5, 2.0) * 2.0);

  return ring * (0.4 + spiral * 0.4 + hotSpot * 0.5);
}

// Star glow
float starGlow(vec2 uv, vec2 center, float radius) {
  float r = length(uv - center);
  float core = smoothstep(radius, radius * 0.6, r);
  float glow = exp(-r / (radius * 3.0));
  return core + glow * 0.3;
}

// Stars background
float stars(vec2 uv) {
  vec2 id = floor(uv * 80.0);
  vec2 f = fract(uv * 80.0) - 0.5;
  float h = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.95, h);
  float twinkle = 0.6 + 0.4 * sin(u_time * (2.0 + h * 7.0) + h * 80.0);
  return star * smoothstep(0.025, 0.0, length(f)) * twinkle;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.18;

  float paletteShift = u_amplitude * 0.2;

  // ── Binary orbit ──
  float orbitR = 0.2;
  float orbitSpeed = t * 0.5;
  vec2 star1 = vec2(cos(orbitSpeed), sin(orbitSpeed)) * orbitR * 0.6;
  vec2 star2 = vec2(cos(orbitSpeed + 3.14159), sin(orbitSpeed + 3.14159)) * orbitR;

  vec3 color = vec3(0.008, 0.008, 0.02);

  // Background stars
  float bg = stars(uv);
  color += vec3(0.6, 0.65, 0.9) * bg * 0.4;

  // ── Roche lobe visualization — faint equipotential lines ──
  float roche = rocheLobe(uv, star1, star2, 1.5, 1.0);
  float rocheLines = abs(sin(roche * 8.0));
  rocheLines = smoothstep(0.95, 1.0, rocheLines) * 0.15;
  rocheLines *= smoothstep(0.6, 0.2, length(uv)); // fade at edges

  vec3 rocheCol = palette(
    roche * 0.1 + t * 0.02 + paletteShift + 0.5,
    vec3(0.3, 0.3, 0.4),
    vec3(0.1, 0.1, 0.2),
    vec3(0.3, 0.3, 0.6),
    vec3(0.1, 0.1, 0.25)
  );
  color += rocheCol * rocheLines;

  // ── Mass stream ──
  float stream = massStream(uv, star1, star2, t);
  stream *= (0.6 + u_mid * 0.8);

  vec3 streamCol = palette(
    stream + t * 0.04 + paletteShift + 0.2,
    vec3(0.7, 0.5, 0.4),
    vec3(0.25, 0.2, 0.15),
    vec3(0.4, 0.25, 0.15),
    vec3(0.05, 0.03, 0.08)
  );
  color += streamCol * stream;

  // ── Accretion disc around star 2 ──
  float disc = accretionDisc(uv, star2, t);
  disc *= (0.5 + u_bass * 0.8);

  vec3 discCol = palette(
    disc + t * 0.05 + paletteShift + 0.35,
    vec3(0.8, 0.55, 0.35),
    vec3(0.25, 0.18, 0.12),
    vec3(0.45, 0.3, 0.15),
    vec3(0.02, 0.03, 0.08)
  );
  color += discCol * disc;

  // ── Star 1 — giant red/orange donor star ──
  float glow1 = starGlow(uv, star1, 0.055);
  glow1 *= (0.8 + u_bass * 0.4);

  vec3 star1Col = palette(
    glow1 * 0.2 + t * 0.02 + paletteShift,
    vec3(0.85, 0.5, 0.3),
    vec3(0.2, 0.12, 0.08),
    vec3(0.35, 0.2, 0.08),
    vec3(0.0, 0.03, 0.06)
  );
  color += star1Col * glow1 * 1.3;
  color += vec3(0.5, 0.25, 0.1) * exp(-length(uv - star1) * 6.0) * 0.3;

  // ── Star 2 — compact blue-white accretor ──
  float glow2 = starGlow(uv, star2, 0.03);
  glow2 *= (0.8 + u_bass * 0.4);

  vec3 star2Col = palette(
    glow2 * 0.2 + t * 0.02 + paletteShift + 0.6,
    vec3(0.7, 0.75, 0.95),
    vec3(0.12, 0.12, 0.1),
    vec3(0.25, 0.25, 0.5),
    vec3(0.08, 0.1, 0.25)
  );
  color += star2Col * glow2 * 1.5;
  color += vec3(0.2, 0.3, 0.6) * exp(-length(uv - star2) * 8.0) * 0.4;

  // ── X-ray flickering from accretion ──
  float xray = exp(-length(uv - star2) * 12.0) * u_treble;
  float flicker = sin(u_time * 15.0 + snoise(uv * 20.0) * 5.0) * 0.5 + 0.5;
  color += vec3(0.5, 0.6, 1.0) * xray * flicker * 0.3;

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.2, length(uv));
  color *= (0.75 + 0.25 * vignette);

  // Tonemap
  color = color / (color + 0.5);

  gl_FragColor = vec4(color, 1.0);
}
`;
