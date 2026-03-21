import { U, SMOOTH_NOISE, VISIONARY_PALETTE, SMIN } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + SMIN + `
// Cairn — stacked stone cairn, layered rough circles

float roughCircle(vec2 p, float r, float seed) {
  float angle = atan(p.y, p.x);
  float roughness = snoise(vec2(angle * 3.0 + seed, seed * 5.0)) * 0.03;
  roughness += snoise(vec2(angle * 8.0 + seed * 2.0, seed * 3.0)) * 0.015;
  return length(p) - r - roughness;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  // Stack of stones — wider at base, narrower at top
  float cairn = 1e6;
  float stoneTexture = 0.0;

  // Base stone
  float s0 = roughCircle(uv - vec2(0.0, -0.32), 0.18, 1.0);
  cairn = min(cairn, s0);

  // Second stone
  float s1 = roughCircle(uv - vec2(0.02, -0.15), 0.15, 2.3);
  cairn = min(cairn, s1);

  // Third stone
  float s2 = roughCircle(uv - vec2(-0.01, 0.0), 0.12, 3.7);
  cairn = min(cairn, s2);

  // Fourth stone
  float s3 = roughCircle(uv - vec2(0.01, 0.12), 0.1, 5.1);
  cairn = min(cairn, s3);

  // Top stone — small
  float s4 = roughCircle(uv - vec2(0.0, 0.22), 0.06, 7.2);
  cairn = min(cairn, s4);

  // Stone surface — inside the cairn shape
  float insideCairn = smoothstep(0.005, -0.005, cairn);

  // Stone texture using noise layers
  float tex1 = fbm(uv * 15.0 + 0.5);
  float tex2 = snoise(uv * 25.0 + 1.3);
  stoneTexture = tex1 * 0.5 + tex2 * 0.3;

  // Subtle breathing — stones shift slightly
  float breath = sin(t * 0.5 + u_bass * 2.0) * 0.003;

  // Gaps between stones — darker crevices
  float gap1 = smoothstep(0.015, 0.0, abs(uv.y + 0.23)) * insideCairn;
  float gap2 = smoothstep(0.012, 0.0, abs(uv.y + 0.07)) * insideCairn;
  float gap3 = smoothstep(0.01, 0.0, abs(uv.y - 0.06)) * insideCairn;
  float gap4 = smoothstep(0.008, 0.0, abs(uv.y - 0.17)) * insideCairn;
  float gaps = max(max(gap1, gap2), max(gap3, gap4));

  // Spirit glow emanating from gaps — faint otherworldly light
  float spiritGlow = 0.0;
  spiritGlow += exp(-abs(uv.y + 0.23) * 20.0) * 0.06;
  spiritGlow += exp(-abs(uv.y + 0.07) * 22.0) * 0.05;
  spiritGlow += exp(-abs(uv.y - 0.06) * 25.0) * 0.04;
  spiritGlow += exp(-abs(uv.y - 0.17) * 28.0) * 0.03;
  spiritGlow *= insideCairn;
  spiritGlow *= (1.0 + u_mid * 0.8);

  // Ground shadow
  float ground = smoothstep(-0.3, -0.5, uv.y) * 0.02;

  // Colors
  vec3 stoneColor = palette(stoneTexture * 0.3 + 0.5,
    vec3(0.025, 0.022, 0.02),
    vec3(0.03, 0.025, 0.022),
    vec3(1.0, 1.0, 1.0),
    vec3(0.1, 0.12, 0.15));

  vec3 spiritColor = palette(0.4 + u_amplitude * 0.15,
    vec3(0.01, 0.012, 0.02),
    vec3(0.03, 0.04, 0.06),
    vec3(1.0, 1.0, 1.0),
    vec3(0.4, 0.5, 0.7));

  vec3 bgColor = vec3(0.005, 0.005, 0.007);

  // Compose
  vec3 color = bgColor;
  color += bgColor * ground;
  color = mix(color, stoneColor * (0.6 + stoneTexture * 0.3), insideCairn);
  color *= 1.0 - gaps * 0.7; // darken crevices
  color += spiritColor * spiritGlow;

  // Edge light — faint rim on the cairn
  float edge = smoothstep(0.02, 0.0, cairn) - smoothstep(0.0, -0.01, cairn);
  color += spiritColor * edge * 0.04 * (1.0 + u_treble * 0.5);

  // Bass: stones feel heavier, darken slightly
  color *= 1.0 - insideCairn * u_bass * 0.15;

  // Background atmosphere
  float atmo = fbm(uv * 2.0 + t * 0.03) * 0.015;
  color += bgColor * atmo;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
