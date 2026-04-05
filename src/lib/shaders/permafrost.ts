import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Permafrost — Frozen tundra surface with ice crystal patterns and aurora reflections

// 3-octave fbm for performance
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Polygon crack pattern — simulates frozen earth cracks
float cracks(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 seed = i + g;
      vec2 o = 0.5 + 0.4 * sin(vec2(
        dot(seed, vec2(127.1, 311.7)),
        dot(seed, vec2(269.5, 183.3))
      ) + u_time * 0.02);
      float d = length(f - g - o);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.05;

  // Ground plane with subtle perspective
  vec2 groundUV = uv * 3.0 + vec2(t * 0.2, t * 0.1);

  // Frozen terrain elevation
  float terrain = fbm3(groundUV * 0.7);
  float terrainDetail = fbm3(groundUV * 1.4 + vec2(20.0));

  // Polygon crack network
  float crack = cracks(groundUV * 1.2);
  float crackEdge = smoothstep(0.0, 0.08, crack);
  float crackGlow = 1.0 - smoothstep(0.0, 0.04, crack);
  crackGlow *= (0.5 + u_bass * 0.7);

  // Ice crystal layer on surface
  float crystal = cracks(groundUV * 3.5 + vec2(50.0));
  float crystalPattern = smoothstep(0.01, 0.06, crystal);

  // Aurora reflection from above — flowing color bands
  vec2 auroraUV = vec2(uv.x * 0.5 + t * 0.8, uv.y * 0.3);
  float aurora = sin(auroraUV.x * 3.0 + fbm3(auroraUV * 2.0) * 2.0) * 0.5 + 0.5;
  aurora *= smoothstep(-0.2, 0.3, uv.y); // more visible toward top
  aurora *= (0.4 + u_mid * 0.5);

  // Frost sparkle
  float sparkle = snoise(uv * 20.0 + vec2(t * 4.0));
  sparkle = pow(max(sparkle, 0.0), 8.0) * u_treble * 0.6;

  // ── Color ──
  // Frozen ground — dark steel blue
  vec3 groundColor = palette(
    terrain * 0.3 + t * 0.04,
    vec3(0.08, 0.10, 0.15),
    vec3(0.06, 0.08, 0.14),
    vec3(0.4, 0.5, 0.7),
    vec3(0.10, 0.15, 0.25)
  );

  // Ice surface — pale blue-white
  vec3 iceColor = palette(
    terrainDetail * 0.2 + crystal * 0.3 + t * 0.03,
    vec3(0.30, 0.38, 0.48),
    vec3(0.15, 0.18, 0.25),
    vec3(0.5, 0.6, 0.9),
    vec3(0.15, 0.22, 0.40)
  );

  // Crack glow — deep cyan
  vec3 crackColor = palette(
    crackGlow * 0.4 + u_amplitude * 0.2 + t * 0.08,
    vec3(0.02, 0.15, 0.30),
    vec3(0.05, 0.20, 0.40),
    vec3(0.3, 0.6, 0.9),
    vec3(0.05, 0.18, 0.40)
  );

  // Aurora colors — green to violet
  vec3 auroraColor = palette(
    aurora * 0.8 + uv.x * 0.3 + t * 0.15,
    vec3(0.05, 0.25, 0.15),
    vec3(0.15, 0.30, 0.25),
    vec3(0.8, 0.6, 0.9),
    vec3(0.10, 0.35, 0.55)
  );

  // Combine
  vec3 color = mix(groundColor, iceColor, crackEdge * 0.6);

  // Crystal surface detail
  color = mix(color, iceColor * 1.1, (1.0 - crystalPattern) * 0.2);

  // Crack glow
  color = mix(color, crackColor, crackGlow * 0.7);

  // Aurora reflection on the ice surface
  float reflectivity = 0.3 + (1.0 - crackEdge) * 0.2;
  color += auroraColor * aurora * reflectivity * 0.4;

  // Frost sparkle
  color += vec3(0.6, 0.8, 1.0) * sparkle;

  // Subtle subsurface glow
  float subsurface = smoothstep(-0.3, 0.1, terrain) * 0.15;
  color += crackColor * subsurface * (0.5 + u_bass * 0.3);

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
