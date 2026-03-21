import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Cassini — Saturn's rings, concentric banded structures.
// A gas giant with atmospheric bands and an elaborate ring system
// of thousands of concentric particle streams.

float ringBand(float r, float center, float width, float density) {
  float d = abs(r - center);
  return smoothstep(width, 0.0, d) * density;
}

float atmosphereBand(vec2 uv, float y, float width, float t) {
  float wobble = snoise(vec2(uv.x * 8.0 + t * 0.3, y * 20.0)) * 0.01;
  return smoothstep(width, 0.0, abs(uv.y - y + wobble));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  // Planet center slightly offset
  vec2 center = vec2(-0.05, 0.0);
  vec2 p = uv - center;
  float r = length(p);
  float angle = atan(p.y, p.x);

  // Planet body — oblate spheroid
  vec2 oblate = p / vec2(1.0, 0.9);
  float planetR = length(oblate);
  float planet = smoothstep(0.22, 0.2, planetR);

  // Atmospheric bands on planet
  float bands = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float y = -0.16 + fi * 0.045;
    float w = 0.015 + sin(fi * 1.3) * 0.005;
    bands += atmosphereBand(oblate, y, w, t + fi * 0.5) * 0.25;
  }

  // Great storm spot
  vec2 stormPos = vec2(-0.08 + sin(t * 0.2) * 0.03, 0.05);
  float storm = exp(-length(oblate - stormPos) * 30.0) * 0.3;
  float stormSwirl = snoise((oblate - stormPos) * rot2(t * 0.5) * 20.0) * 0.5 + 0.5;

  // Ring system — elliptical from viewing angle
  vec2 ringUv = p / vec2(1.0, 0.3); // flatten for ring plane perspective
  float ringR = length(ringUv);

  // Ring structure — multiple bands with gaps
  float rings = 0.0;
  float ringMask = smoothstep(0.25, 0.28, ringR) * smoothstep(0.75, 0.7, ringR);

  // Dense ring bands
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float bandR = 0.3 + fi * 0.035;
    float w = 0.01 + sin(fi * 2.1) * 0.005;
    float dens = 0.6 + sin(fi * 1.7) * 0.3;
    rings += ringBand(ringR, bandR, w, dens);
  }

  // Ring texture — fine particle noise
  float ringNoise = snoise(vec2(angle * 20.0 + t * 0.3, ringR * 60.0)) * 0.5 + 0.5;
  rings *= (0.7 + ringNoise * 0.3);
  rings *= ringMask;

  // Cassini Division — prominent gap
  float cassiniGap = 1.0 - smoothstep(0.005, 0.0, abs(ringR - 0.48)) * 0.8;
  rings *= cassiniGap;

  // Ring shadow on planet
  float ringShadow = smoothstep(0.25, 0.28, ringR) * smoothstep(0.75, 0.7, ringR);
  float shadowBand = (p.y < 0.0 && planetR < 0.22) ? ringShadow * 0.3 : 0.0;

  // Rings behind planet — occluded
  float ringsBehind = (p.y > 0.0) ? 0.0 : 1.0;
  float ringsVisible = mix(rings, rings * (1.0 - planet), ringsBehind);

  float paletteShift = u_amplitude * 0.2;

  // Planet atmosphere colors — warm tans and ochres
  vec3 planetCol = palette(
    planetR * 2.0 + bands * 0.5 + t * 0.02 + paletteShift,
    vec3(0.65, 0.55, 0.35),
    vec3(0.15, 0.12, 0.08),
    vec3(0.5, 0.4, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  // Ring color — icy blue-white to warm gold
  vec3 ringCol = palette(
    ringR * 3.0 + ringNoise * 0.3 + paletteShift + 0.3,
    vec3(0.65, 0.6, 0.55),
    vec3(0.15, 0.15, 0.12),
    vec3(0.7, 0.5, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  // Storm color — reddish
  vec3 stormCol = palette(
    stormSwirl + t * 0.1 + paletteShift + 0.6,
    vec3(0.7, 0.4, 0.25),
    vec3(0.2, 0.1, 0.05),
    vec3(0.5, 0.3, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  vec3 color = vec3(0.0);

  // Rings (behind planet)
  float behindMask = (p.y > 0.0) ? 1.0 : 0.0;
  color += ringCol * rings * behindMask * (1.0 - planet) * (0.5 + u_mid * 0.3);

  // Planet
  vec3 planetSurface = planetCol * (1.0 + bands * 0.5);
  planetSurface += stormCol * storm * stormSwirl;
  planetSurface *= (1.0 - shadowBand);
  planetSurface *= (0.8 + u_bass * 0.2);
  color += planetSurface * planet;

  // Rings (in front of planet)
  float frontMask = (p.y <= 0.0) ? 1.0 : 0.0;
  color += ringCol * rings * frontMask * (0.6 + u_mid * 0.3);

  // Ring glow
  float ringGlow = ringMask * 0.05 * (0.5 + u_treble * 0.5);
  color += vec3(0.4, 0.35, 0.3) * ringGlow;

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
