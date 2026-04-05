import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Animated voronoi for network structure
vec3 voronoiNet(vec2 p, float time) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md1 = 8.0, md2 = 8.0;
  vec2 mg;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 cellId = n + g;
      vec2 rnd = vec2(
        dot(cellId, vec2(127.1, 311.7)),
        dot(cellId, vec2(269.5, 183.3))
      );
      vec2 o = 0.5 + 0.5 * sin(rnd + time * 0.8);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md1) { md2 = md1; md1 = d; mg = r; }
      else if (d < md2) { md2 = d; }
    }
  }
  return vec3(sqrt(md1), sqrt(md2), 0.0);
}

float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: dark subsurface earth ──
  float bgN = fbm(uv * 1.8 + vec2(t * 0.03, -t * 0.02));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.1,
    vec3(0.02, 0.015, 0.01),
    vec3(0.03, 0.02, 0.015),
    vec3(0.35, 0.3, 0.25),
    vec3(0.0, 0.08, 0.12)
  );
  color = bgColor * (bgN * 0.12 + 0.04);

  // ── Domain warp for organic network shape ──
  vec2 warp = vec2(
    snoise(uv * 2.5 + vec2(t * 0.15, 0.0)),
    snoise(uv * 2.5 + vec2(0.0, t * 0.12) + 5.0)
  );
  vec2 warped = uv + warp * 0.12;

  // ── Primary mycelial network — large hyphae ──
  vec3 v1 = voronoiNet(warped * 4.0 + vec2(t * 0.06, t * 0.03), t * 0.4);
  float ridge1 = v1.y - v1.x;
  float edge1 = smoothstep(0.1, 0.0, ridge1);
  float node1 = smoothstep(0.18, 0.0, v1.x);
  node1 = pow(node1, 2.5);

  // ── Secondary network — finer branching ──
  vec3 v2 = voronoiNet(warped * 9.0 + vec2(-t * 0.05, t * 0.04), t * 0.6);
  float ridge2 = v2.y - v2.x;
  float edge2 = smoothstep(0.07, 0.0, ridge2);
  float node2 = smoothstep(0.12, 0.0, v2.x);

  // ── Tertiary: finest hyphal tips — treble reveals ──
  vec3 v3 = voronoiNet(warped * 16.0 + vec2(t * 0.08, -t * 0.06), t * 0.8);
  float ridge3 = v3.y - v3.x;
  float edge3 = smoothstep(0.05, 0.0, ridge3);

  // ── Hypha colors — pale ghostly white with subtle blues ──
  vec3 hyphaColor = palette(
    v1.x * 0.4 + ridge1 * 0.3 + t * 0.02 + paletteShift,
    vec3(0.45, 0.42, 0.38),
    vec3(0.25, 0.22, 0.2),
    vec3(0.7, 0.65, 0.6),
    vec3(0.0, 0.1, 0.18)
  );

  vec3 nodeGlowColor = palette(
    v1.x * 0.3 + t * 0.04 + paletteShift + 0.35,
    vec3(0.5, 0.45, 0.3),
    vec3(0.4, 0.35, 0.25),
    vec3(0.9, 0.8, 0.5),
    vec3(0.0, 0.1, 0.2)
  );

  vec3 fineColor = palette(
    v3.x * 0.5 + paletteShift + 0.6,
    vec3(0.4, 0.45, 0.42),
    vec3(0.25, 0.3, 0.28),
    vec3(0.6, 0.8, 0.7),
    vec3(0.0, 0.15, 0.25)
  );

  // ── Compose the network ──
  // Primary hyphae
  float hyphaPulse = sin(v1.x * 10.0 - t * 2.5) * 0.5 + 0.5;
  hyphaPulse = pow(hyphaPulse, 5.0);
  color += hyphaColor * edge1 * (0.5 + hyphaPulse * u_bass * 1.2);

  // Nodes — junction points glow brighter
  color += nodeGlowColor * node1 * (0.7 + u_bass * 0.6);

  // Secondary hyphae
  float midPulse = sin(v2.x * 15.0 + t * 2.0) * 0.5 + 0.5;
  midPulse = pow(midPulse, 6.0);
  color += hyphaColor * edge2 * (0.25 + midPulse * u_mid * 0.8);
  color += nodeGlowColor * node2 * 0.35;

  // Finest hyphae — treble activated
  float trebleAct = smoothstep(0.1, 0.5, u_treble);
  color += fineColor * edge3 * 0.2 * trebleAct;

  // ── Nutrient pulses traveling along the network ──
  float nutrientPulse = sin(v1.x * 8.0 + v2.x * 12.0 - t * 4.0) * 0.5 + 0.5;
  nutrientPulse = pow(nutrientPulse, 8.0) * edge1;
  vec3 nutrientColor = palette(
    t * 0.06 + paletteShift + 0.5,
    vec3(0.5, 0.55, 0.35),
    vec3(0.4, 0.45, 0.25),
    vec3(0.9, 1.0, 0.6),
    vec3(0.0, 0.12, 0.2)
  );
  color += nutrientColor * nutrientPulse * (0.6 + u_bass * 1.0);

  // ── Fruiting body glow — bright spots at major nodes ──
  float fruitGlow = pow(node1, 3.0) * smoothstep(0.3, 0.0, v2.x);
  vec3 fruitColor = palette(
    t * 0.08 + paletteShift + 0.8,
    vec3(0.55, 0.5, 0.3),
    vec3(0.45, 0.4, 0.25),
    vec3(1.0, 0.9, 0.5),
    vec3(0.0, 0.1, 0.2)
  );
  color += fruitColor * fruitGlow * (0.5 + u_mid * 0.5);

  // ── Spore scatter — tiny particles near fruiting bodies ──
  float sporeNoise = snoise(uv * 30.0 + t * 1.5);
  sporeNoise = smoothstep(0.8, 1.0, sporeNoise) * fruitGlow * 3.0;
  color += fineColor * sporeNoise * u_treble * 0.6;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.55, 1.5, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
