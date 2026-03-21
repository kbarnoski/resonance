import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Dolmen — standing stones, monolithic rectangles with energy between

float sdBox2D(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;

  // Standing stones — arranged in a rough circle
  float stones = 1e6;
  float stoneCount = 7.0;
  float circleR = 0.45;

  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float angle = fi / stoneCount * 6.2832 + t * 0.03;
    vec2 stonePos = vec2(cos(angle), sin(angle)) * circleR;

    // Each stone slightly different
    float stoneH = 0.12 + sin(fi * 2.3) * 0.04;
    float stoneW = 0.025 + sin(fi * 3.7) * 0.008;

    // Slight lean
    float lean = sin(fi * 1.9 + 0.5) * 0.1;
    vec2 localP = uv - stonePos;
    localP = rot2(lean) * localP;

    float stone = sdBox2D(localP, vec2(stoneW, stoneH));

    // Rough edges — stone texture
    float roughness = snoise(localP * 40.0 + fi) * 0.005;
    stone += roughness;

    stones = min(stones, stone);
  }

  // Capstone across the top — lintel
  vec2 lintelP = rot2(sin(t * 0.05) * 0.02) * uv;
  float lintel = sdBox2D(lintelP - vec2(0.0, circleR * 0.7), vec2(0.2, 0.018));
  lintel += snoise(lintelP * 30.0) * 0.004;
  stones = min(stones, lintel);

  // Stone rendering
  float stoneGlow = smoothstep(0.01, -0.01, stones);
  float stoneEdge = smoothstep(0.02, 0.0, abs(stones)) * 0.15;

  // Energy field between stones
  float energy = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float angle = fi / stoneCount * 6.2832 + t * 0.03;
    vec2 sp = vec2(cos(angle), sin(angle)) * circleR;
    float d = length(uv - sp);
    energy += exp(-d * 4.0) * 0.1;
  }

  // Interference pattern in the center
  float centerDist = length(uv);
  float interference = sin(centerDist * 20.0 - t * 1.5 + fbm(uv * 5.0 + t * 0.1) * 3.0);
  interference *= exp(-centerDist * 3.0);
  float energyField = energy * (0.5 + interference * 0.5);

  // Ground mist
  float mist = fbm(uv * 3.0 + t * 0.04);
  mist = smoothstep(0.3, 0.7, mist) * smoothstep(-0.6, -0.2, uv.y) * 0.04;

  // Colors
  vec3 stoneColor = palette(0.6,
    vec3(0.02, 0.018, 0.016),
    vec3(0.03, 0.025, 0.02),
    vec3(1.0, 1.0, 1.0),
    vec3(0.1, 0.15, 0.2));

  vec3 energyColor = palette(0.35 + u_amplitude * 0.15,
    vec3(0.008, 0.01, 0.015),
    vec3(0.02, 0.03, 0.05),
    vec3(1.0, 1.0, 1.0),
    vec3(0.4, 0.5, 0.7));

  vec3 mistColor = palette(0.5,
    vec3(0.006, 0.006, 0.008),
    vec3(0.01, 0.01, 0.015),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.5, 0.6));

  vec3 bgColor = vec3(0.004, 0.004, 0.006);

  // Compose
  vec3 color = bgColor;
  color += mistColor * mist;
  color += energyColor * energyField * (0.4 + u_bass * 0.5);
  color = mix(color, stoneColor, stoneGlow);
  color += stoneColor * stoneEdge;

  // Bass: energy between stones intensifies
  color += energyColor * energy * u_bass * 0.06;

  // Treble: sparks along the energy lines
  float sparks = snoise(uv * 18.0 + t * 4.0);
  color += energyColor * smoothstep(0.75, 0.95, sparks) * energy * u_treble * 0.08;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
