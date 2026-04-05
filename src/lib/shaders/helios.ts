import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Helios — Massive solar flare arcing from a star surface,
// a plasma eruption frozen mid-arc, magnetic field lines visible.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Solar flare arc — massive magnetic loop
float flareArc(vec2 uv, vec2 foot1, vec2 foot2, float height, float thickness, float t, float phase) {
  vec2 mid = (foot1 + foot2) * 0.5 + vec2(0.0, height);

  // Breathing motion
  float breath = sin(t * 0.3 + phase) * 0.5 + 0.5;
  mid.y += breath * height * 0.15;

  float minD = 1e6;
  for (int i = 0; i <= 20; i++) {
    float s = float(i) / 20.0;
    vec2 q0 = mix(foot1, mid, s);
    vec2 q1 = mix(mid, foot2, s);
    vec2 arcPt = mix(q0, q1, s);

    // Magnetic threading — filamentary substructure
    float thread = sin(s * 18.0 + t * 2.0 + phase) * 0.005;
    arcPt.x += thread;

    minD = min(minD, length(uv - arcPt));
  }

  // Core filament
  float core = smoothstep(thickness * 2.0, 0.0, minD);
  // Broad glow envelope
  float glow = exp(-minD * 8.0);

  return core + glow * 0.4;
}

// Magnetic field lines — visible curves near the flare
float fieldLine(vec2 uv, vec2 center, float radius, float startAngle, float span, float t) {
  float a = atan(uv.y - center.y, uv.x - center.x);
  float r = length(uv - center);

  float ringDist = abs(r - radius);
  float ring = exp(-ringDist * ringDist * 2000.0);

  // Only draw a portion of the circle
  float angleDiff = mod(a - startAngle + 3.14159, 6.28318) - 3.14159;
  float arcMask = smoothstep(0.0, 0.1, angleDiff) * smoothstep(span, span - 0.1, angleDiff);

  return ring * arcMask * 0.4;
}

// Star limb — curved surface at the bottom
float starSurface(vec2 uv, float t) {
  // Star fills the bottom, very large — we see a slice of the limb
  float surfY = -0.45 + sin(uv.x * 3.0 + t * 0.1) * 0.02;
  float surface = smoothstep(surfY + 0.05, surfY, uv.y);

  // Surface granulation
  float gran = snoise(vec2(uv.x * 8.0 + t * 0.15, (uv.y + 0.45) * 20.0)) * 0.5 + 0.5;

  return surface * (0.6 + gran * 0.4);
}

// Plasma rain — material falling back along field lines
float plasmaRain(vec2 uv, float t) {
  float total = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float x = -0.3 + fi * 0.05 + sin(fi * 3.0) * 0.03;
    float fallSpeed = 1.5 + fract(fi * 0.37) * 1.0;
    float y = fract(-t * fallSpeed * 0.1 + fi * 0.27) * 0.6 - 0.1;

    vec2 dropPos = vec2(x, y);
    float d = length(uv - dropPos);
    // Elongated drop shape
    vec2 diff = uv - dropPos;
    float elongated = length(vec2(diff.x * 3.0, diff.y));
    total += smoothstep(0.02, 0.0, elongated) * 0.3;
  }
  return total;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  float paletteShift = u_amplitude * 0.25;

  vec3 color = vec3(0.02, 0.01, 0.01);

  // ── Star surface at bottom ──
  float surface = starSurface(uv, t);
  vec3 surfCol = palette(
    surface * 0.5 + uv.x * 0.2 + t * 0.01 + paletteShift,
    vec3(0.85, 0.65, 0.3),
    vec3(0.2, 0.15, 0.1),
    vec3(0.3, 0.2, 0.08),
    vec3(0.0, 0.02, 0.05)
  );

  // Chromosphere — thin bright layer at the limb
  float chromosphere = smoothstep(-0.42, -0.44, uv.y) * smoothstep(-0.48, -0.44, uv.y);
  vec3 chromCol = vec3(0.9, 0.3, 0.25) * chromosphere * 2.0;

  color = mix(color, surfCol, surface);
  color += chromCol;

  // ── Main flare arc — the hero element ──
  float mainFlare = flareArc(
    uv,
    vec2(-0.2, -0.42), vec2(0.15, -0.42),
    0.55 + u_bass * 0.1,
    0.008, t, 0.0
  );
  mainFlare *= (0.8 + u_bass * 0.8);

  // Secondary smaller flare
  float flare2 = flareArc(
    uv,
    vec2(0.1, -0.42), vec2(0.3, -0.42),
    0.3 + u_bass * 0.06,
    0.006, t, 2.5
  );
  flare2 *= (0.7 + u_mid * 0.5);

  // Third small flare
  float flare3 = flareArc(
    uv,
    vec2(-0.35, -0.42), vec2(-0.2, -0.42),
    0.2 + u_bass * 0.04,
    0.005, t, 5.0
  );

  // ── Magnetic field lines ──
  float fields = 0.0;
  fields += fieldLine(uv, vec2(-0.025, -0.42), 0.35, 0.3, 2.5, t);
  fields += fieldLine(uv, vec2(-0.025, -0.42), 0.45, 0.2, 2.7, t);
  fields += fieldLine(uv, vec2(0.2, -0.42), 0.2, 0.4, 2.2, t);

  // ── Plasma rain ──
  float rain = plasmaRain(uv, t);
  rain *= (0.4 + u_treble * 0.6);

  // ── Flare colors — searing hot ──
  vec3 flareCol = palette(
    mainFlare * 0.3 + t * 0.04 + paletteShift + 0.15,
    vec3(0.9, 0.6, 0.3),
    vec3(0.2, 0.18, 0.12),
    vec3(0.4, 0.25, 0.1),
    vec3(0.0, 0.03, 0.08)
  );

  vec3 flare2Col = palette(
    flare2 * 0.3 + t * 0.03 + paletteShift + 0.35,
    vec3(0.85, 0.5, 0.3),
    vec3(0.25, 0.15, 0.1),
    vec3(0.35, 0.2, 0.1),
    vec3(0.02, 0.02, 0.06)
  );

  vec3 fieldCol = palette(
    fields + t * 0.02 + paletteShift + 0.6,
    vec3(0.5, 0.35, 0.25),
    vec3(0.2, 0.12, 0.08),
    vec3(0.3, 0.2, 0.1),
    vec3(0.05, 0.03, 0.05)
  );

  vec3 rainCol = palette(
    rain + t * 0.05 + paletteShift + 0.5,
    vec3(0.7, 0.45, 0.25),
    vec3(0.2, 0.15, 0.1),
    vec3(0.35, 0.2, 0.08),
    vec3(0.03, 0.02, 0.0)
  );

  // Compose
  color += flareCol * mainFlare * 1.2;
  color += flare2Col * flare2 * 0.9;
  color += flareCol * flare3 * 0.6;
  color += fieldCol * fields;
  color += rainCol * rain;

  // Hot core glow where flares originate
  float originGlow = exp(-length(uv - vec2(-0.025, -0.35)) * 4.0) * 0.2;
  color += vec3(1.0, 0.8, 0.5) * originGlow * (0.5 + u_bass * 0.5);

  // Ambient heat
  float heatGlow = smoothstep(0.7, 0.0, length(uv - vec2(0.0, -0.2))) * 0.05;
  color += vec3(0.15, 0.08, 0.03) * heatGlow;

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.3, length(uv));
  color *= (0.75 + 0.25 * vignette);

  // Tonemap
  color = color / (color + 0.5);

  gl_FragColor = vec4(color, 1.0);
}
`;
