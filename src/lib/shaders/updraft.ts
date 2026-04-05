import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Updraft — Powerful thermal updraft: vertical particle streams with heat shimmer distortion

// 3-octave fbm for performance
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  // Heat shimmer distortion — wavy refraction
  vec2 shimmerOffset = vec2(
    snoise(vec2(uv.x * 3.0, uv.y * 1.5 - t * 2.0)) * 0.03,
    snoise(vec2(uv.x * 2.0 + 10.0, uv.y * 2.0 - t * 3.0)) * 0.02
  );
  vec2 distortedUV = uv + shimmerOffset * (0.8 + u_bass * 0.4);

  // Vertical thermal columns — multiple rising streams
  float thermal = 0.0;

  // Central column
  float col1 = exp(-pow(distortedUV.x * 3.0, 2.0) * 2.0);
  col1 *= 0.5 + 0.5 * snoise(vec2(distortedUV.x * 4.0, distortedUV.y * 2.0 - t * 5.0));
  thermal += col1;

  // Side columns
  float col2 = exp(-pow((distortedUV.x - 0.4) * 3.5, 2.0) * 2.0);
  col2 *= 0.5 + 0.5 * snoise(vec2(distortedUV.x * 3.0 + 20.0, distortedUV.y * 2.5 - t * 4.0));
  thermal += col2 * 0.6;

  float col3 = exp(-pow((distortedUV.x + 0.35) * 3.5, 2.0) * 2.0);
  col3 *= 0.5 + 0.5 * snoise(vec2(distortedUV.x * 3.5 + 40.0, distortedUV.y * 2.0 - t * 4.5));
  thermal += col3 * 0.5;

  thermal = clamp(thermal, 0.0, 1.0);
  thermal *= (0.6 + u_mid * 0.5);

  // Rising particles — dots streaking upward
  float particles = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float px = sin(fi * 2.3 + t * 0.5) * 0.3;
    float py = fract(fi * 0.17 - t * (0.3 + fi * 0.08)) * 2.0 - 1.0;
    float d = length(distortedUV - vec2(px, py));
    // Streak vertically
    float streak = exp(-d * d * vec2(30.0, 8.0).x) * exp(-pow((distortedUV.y - py) * 3.0, 2.0) / 4.0);
    particles += streak;
  }
  particles *= u_treble * 0.8;

  // Turbulent mixing at column edges
  float turbulence = fbm3(distortedUV * 3.0 + vec2(0.0, -t * 3.0));
  turbulence = abs(turbulence);

  // Heat intensity — hotter at the bottom
  float heat = smoothstep(0.5, -0.5, distortedUV.y);
  heat *= (0.7 + u_bass * 0.4);

  // Convection cells — slow horizontal movement
  float convection = sin(distortedUV.x * 4.0 + fbm3(distortedUV * 1.5 + vec2(t)) * 2.0) * 0.5 + 0.5;

  // ── Color ──
  // Ambient air — dark warm grey
  vec3 airColor = palette(
    convection * 0.2 + t * 0.04,
    vec3(0.08, 0.06, 0.06),
    vec3(0.06, 0.05, 0.05),
    vec3(0.5, 0.4, 0.3),
    vec3(0.20, 0.15, 0.10)
  );

  // Thermal color — amber to red heat
  vec3 thermalColor = palette(
    thermal * 0.3 + heat * 0.4 + t * 0.06 + u_amplitude * 0.15,
    vec3(0.30, 0.15, 0.05),
    vec3(0.35, 0.20, 0.08),
    vec3(0.8, 0.5, 0.3),
    vec3(0.05, 0.15, 0.25)
  );

  // Hot core — bright yellow-white
  vec3 hotCore = palette(
    heat * 0.5 + thermal * 0.3 + t * 0.08,
    vec3(0.60, 0.40, 0.15),
    vec3(0.35, 0.30, 0.15),
    vec3(0.7, 0.6, 0.4),
    vec3(0.02, 0.10, 0.20)
  );

  // Combine
  vec3 color = airColor;

  // Thermal columns
  color = mix(color, thermalColor, thermal * 0.7);

  // Hot core at base of columns
  color = mix(color, hotCore, thermal * heat * 0.6);

  // Turbulent edges
  color += thermalColor * turbulence * thermal * 0.2;

  // Rising particles
  color += vec3(1.0, 0.7, 0.3) * particles * 0.3;

  // Heat shimmer glow
  float shimmerGlow = length(shimmerOffset) * 15.0;
  color += thermalColor * shimmerGlow * 0.15;

  // Convection pattern in the background
  color += airColor * convection * 0.08;

  // Vignette
  float vignette = 1.0 - smoothstep(0.45, 1.35, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
