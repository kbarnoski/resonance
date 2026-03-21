import { U, SMOOTH_NOISE, VISIONARY_PALETTE, VORONOI, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  VORONOI +
  SDF_PRIMITIVES +
  `
// Breaking apart — a surface shattering into angular fragments,
// cracks propagating from impact point, pieces separating to reveal void beneath.

float crackNetwork(vec2 p, float scale) {
  vec3 vor = voronoi(p * scale);
  float edge = vor.y - vor.x;
  return edge;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Impact point — center, but drifts with audio
  vec2 impact = vec2(sin(t * 0.3) * 0.1, cos(t * 0.4) * 0.08);
  float impactDist = length(uv - impact);

  // Crack propagation — waves of fracture radiating from impact
  float fracWave = t * 1.5 + u_bass * 2.0;
  float fractured = smoothstep(fracWave + 0.1, fracWave - 0.3, impactDist * 3.0);
  fractured = clamp(fractured, 0.0, 1.0);

  // Multi-scale Voronoi crack networks
  float crack1 = crackNetwork(uv + impact * 0.5, 5.0);
  float crack2 = crackNetwork(uv * 1.3 + vec2(3.0), 8.0);
  float crack3 = crackNetwork(uv * 0.7 + vec2(7.0, 2.0), 12.0);

  // Crack lines — thin dark fissures
  float crackLine1 = smoothstep(0.04, 0.0, crack1) * fractured;
  float crackLine2 = smoothstep(0.03, 0.0, crack2) * fractured * 0.7;
  float crackLine3 = smoothstep(0.02, 0.0, crack3) * fractured * 0.5;
  float cracks = max(crackLine1, max(crackLine2, crackLine3));

  // Fragment separation — pieces pulling apart from center
  vec3 vor = voronoi(uv * 5.0 + impact * 0.3);
  float cellId = vor.x + vor.y;
  float separation = fractured * (0.3 + u_bass * 0.4);
  float fragmentGap = smoothstep(0.08, 0.0, vor.y - vor.x - separation * 0.06);

  // Each fragment gets its own slight displacement
  vec2 fragOffset = hash2(vec2(cellId * 13.7, cellId * 7.3));
  fragOffset *= separation * 0.03;
  vec2 fragUV = uv + fragOffset * fractured;

  // Surface material — dark stone/obsidian texture
  float surfaceNoise = fbm(fragUV * 4.0 + t * 0.02);
  float surfaceField = surfaceNoise * 0.5 + 0.5;

  float detailNoise = snoise(fragUV * 15.0 + t * 0.01);
  float surfaceDetail = detailNoise * 0.5 + 0.5;

  // Fragment rotation — pieces tilt as they separate
  float tiltAmount = fractured * sin(cellId * 5.7 + t * 0.5) * 0.3;

  // Surface color — dark obsidian with subtle veining
  vec3 surfaceColor = palette(surfaceField * 0.3 + paletteShift,
    vec3(0.03, 0.025, 0.035),
    vec3(0.04, 0.03, 0.05),
    vec3(0.6, 0.5, 0.7),
    vec3(0.1, 0.08, 0.15));

  // Vein pattern in the material
  float vein = smoothstep(0.48, 0.52, surfaceDetail);
  vec3 veinColor = palette(surfaceDetail + paletteShift + 0.4,
    vec3(0.04, 0.03, 0.05),
    vec3(0.06, 0.04, 0.07),
    vec3(0.5, 0.4, 0.8),
    vec3(0.15, 0.1, 0.3));
  surfaceColor = mix(surfaceColor, veinColor, vein * 0.3);

  // The void beneath — what the cracks reveal
  vec3 voidColor = palette(t * 0.3 + impactDist * 2.0 + paletteShift + 0.7,
    vec3(0.005, 0.002, 0.01),
    vec3(0.015, 0.005, 0.02),
    vec3(0.7, 0.3, 0.9),
    vec3(0.2, 0.1, 0.4));

  // Void glow — faint light from beneath
  float voidGlow = exp(-impactDist * 3.0) * fractured * 0.2;
  voidColor += palette(t * 0.5 + paletteShift,
    vec3(0.02, 0.005, 0.01),
    vec3(0.04, 0.01, 0.03),
    vec3(0.8, 0.3, 0.5),
    vec3(0.0, 0.15, 0.3)) * voidGlow * (0.5 + u_mid * 0.5);

  // Crack edge glow — energy at the fracture lines
  float crackGlow1 = smoothstep(0.08, 0.0, crack1) * (1.0 - smoothstep(0.0, 0.03, crack1));
  float crackGlow2 = smoothstep(0.06, 0.0, crack2) * (1.0 - smoothstep(0.0, 0.02, crack2));
  float crackGlow = (crackGlow1 + crackGlow2 * 0.6) * fractured;

  vec3 glowColor = palette(crack1 * 3.0 + paletteShift + 0.5,
    vec3(0.08, 0.02, 0.01),
    vec3(0.12, 0.04, 0.02),
    vec3(1.0, 0.5, 0.3),
    vec3(0.0, 0.1, 0.2));

  // Composite — surface with cracks revealing void
  vec3 color = surfaceColor;

  // Cracks cut through to void
  color = mix(color, voidColor, cracks * 0.8);

  // Fragment gaps show pure darkness
  color = mix(color, voidColor * 0.3, fragmentGap * 0.6);

  // Crack edge glow
  color += glowColor * crackGlow * 0.15 * (0.4 + u_treble * 0.6);

  // Dust particles at impact — tiny bright specs
  float dust = snoise(uv * 30.0 + t * 5.0);
  dust = smoothstep(0.85, 1.0, dust) * exp(-impactDist * 4.0) * fractured;
  color += glowColor * dust * 0.08 * u_treble;

  // Bass shockwave — concentric ring from impact
  float shockwave = abs(impactDist - fract(t * 0.5 + u_bass * 0.3) * 1.5);
  shockwave = smoothstep(0.03, 0.0, shockwave) * fractured * u_bass;
  color += glowColor * shockwave * 0.1;

  // Darkening of tilted fragments — simulating depth
  color *= 1.0 - abs(tiltAmount) * 0.3;

  // Vignette
  float vd = length(uv);
  float vignette = 1.0 - smoothstep(0.4, 1.3, vd);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
