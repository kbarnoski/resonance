import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Radiance — emanating gentle light like sunrise through morning mist.
// A soft glow source that breathes and shifts, with light rays extending
// through hazy atmosphere. Warm amber core to peach to cool lavender edges.

// Soft radial gradient with smooth falloff
float softGlow(vec2 uv, vec2 center, float size, float softness) {
  float d = length(uv - center);
  return exp(-d * d / (size * size * softness));
}

// Atmospheric haze — layered noise that simulates mist
float mistLayer(vec2 uv, float t, float scale, float speed) {
  vec2 p = uv * scale;
  // Domain warp for organic mist shapes
  float w1 = fbm(p + vec2(t * speed, 0.0));
  float w2 = fbm(p + vec2(0.0, t * speed * 0.8) + vec2(5.3, 1.7));
  vec2 warped = p + vec2(w1, w2) * 0.5;
  float mist = fbm(warped) * 0.5 + 0.5;
  return mist;
}

// God rays / crepuscular rays radiating from a point
float godRays(vec2 uv, vec2 source, float t) {
  vec2 delta = uv - source;
  float angle = atan(delta.y, delta.x);
  float dist = length(delta);

  // Radial noise creates ray pattern
  float rays = 0.0;

  // Multiple frequencies of rays
  float rayAngle1 = snoise(vec2(angle * 5.0 + t * 0.1, dist * 2.0 + t * 0.05));
  float rayAngle2 = snoise(vec2(angle * 8.0 + t * 0.07, dist * 1.5 - t * 0.03));
  float rayAngle3 = snoise(vec2(angle * 12.0 - t * 0.05, dist * 3.0 + t * 0.02));

  rays = rayAngle1 * 0.5 + rayAngle2 * 0.3 + rayAngle3 * 0.2;
  rays = rays * 0.5 + 0.5;
  rays = pow(rays, 1.5);

  // Rays fade with distance from source
  float distFade = exp(-dist * 1.2);

  return rays * distFade;
}

// Atmospheric particles catching light
float mistParticles(vec2 uv, float t) {
  float total = 0.0;
  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    float h1 = fract(sin(fi * 127.1) * 43758.5453);
    float h2 = fract(sin(fi * 311.7) * 43758.5453);
    float h3 = fract(sin(fi * 78.233) * 43758.5453);

    // Slow drift with convection
    vec2 pos = vec2(
      h1 * 1.6 - 0.8 + sin(t * 0.08 * (0.5 + h3) + fi * 2.0) * 0.3,
      h2 * 1.6 - 0.8 + cos(t * 0.06 * (0.5 + h3) + fi * 1.5) * 0.25 + t * 0.01
    );

    float d = length(uv - pos);
    float size = 0.01 + h3 * 0.02;
    float bright = exp(-d * d / (size * size * 2.0));
    // Gentle pulsing
    bright *= 0.5 + 0.5 * sin(t * 0.5 * (0.5 + h3) + fi * 3.0);
    total += bright * 0.08;
  }
  return total;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.2;

  // ── Light source position — slowly drifts and breathes ──
  vec2 lightPos = vec2(
    sin(t * 0.2) * 0.15 + cos(t * 0.13) * 0.08,
    cos(t * 0.17) * 0.1 + sin(t * 0.11) * 0.06 - 0.05
  );

  // Breathing scale — the light source pulses gently
  float breath = 1.0 + 0.15 * sin(t * 0.4) + 0.08 * sin(t * 0.7);
  breath *= (0.8 + u_bass * 0.3);

  // ── Core glow — intense warm center ──
  float coreGlow = softGlow(uv, lightPos, 0.15 * breath, 0.8);
  float innerGlow = softGlow(uv, lightPos, 0.35 * breath, 1.5);
  float outerGlow = softGlow(uv, lightPos, 0.7 * breath, 3.0);
  float wideGlow = softGlow(uv, lightPos, 1.2 * breath, 5.0);

  // ── God rays ──
  float rays = godRays(uv, lightPos, t);
  rays *= (0.5 + u_mid * 0.5);

  // ── Atmospheric mist layers ──
  float mist1 = mistLayer(uv, t, 1.5, 0.03);
  float mist2 = mistLayer(uv + vec2(10.0, 5.0), t, 2.5, 0.02);
  float mist3 = mistLayer(uv + vec2(20.0, 15.0), t, 4.0, 0.015);

  // Combined mist density
  float mistDensity = mist1 * 0.5 + mist2 * 0.3 + mist3 * 0.2;

  // Mist is lit by the source — brighter near the light
  float distToLight = length(uv - lightPos);
  float mistLighting = exp(-distToLight * 0.8);

  // ── Color palette — amber core through peach to lavender ──

  // Core color — warm amber/gold
  vec3 coreColor = palette(
    t * 0.03 + paletteShift,
    vec3(0.85, 0.55, 0.20),
    vec3(0.15, 0.12, 0.08),
    vec3(0.4, 0.5, 0.6),
    vec3(0.0, 0.05, 0.1)
  );

  // Inner glow — warm peach
  vec3 peachColor = palette(
    innerGlow * 0.3 + t * 0.02 + paletteShift + 0.15,
    vec3(0.75, 0.50, 0.35),
    vec3(0.2, 0.15, 0.1),
    vec3(0.5, 0.5, 0.7),
    vec3(0.0, 0.05, 0.15)
  );

  // Mid glow — soft salmon/rose
  vec3 roseColor = palette(
    outerGlow * 0.3 + t * 0.015 + paletteShift + 0.3,
    vec3(0.55, 0.40, 0.45),
    vec3(0.15, 0.1, 0.12),
    vec3(0.6, 0.4, 0.7),
    vec3(0.05, 0.05, 0.2)
  );

  // Edge color — cool lavender
  vec3 lavenderColor = palette(
    t * 0.01 + paletteShift + 0.55,
    vec3(0.30, 0.28, 0.40),
    vec3(0.08, 0.06, 0.12),
    vec3(0.5, 0.4, 0.8),
    vec3(0.1, 0.1, 0.3)
  );

  // ── Compose the scene ──

  // Start with lavender atmosphere at edges
  vec3 color = lavenderColor;

  // Layer in the radial glow zones
  color = mix(color, roseColor, outerGlow * 0.8);
  color = mix(color, peachColor, innerGlow * 0.9);

  // Bright core
  color += coreColor * coreGlow * 1.5;
  // Very bright center point
  color += vec3(1.0, 0.95, 0.85) * pow(coreGlow, 3.0) * 0.8;

  // ── God rays add light through the mist ──
  vec3 rayColor = mix(peachColor, coreColor, 0.5);
  color += rayColor * rays * 0.35;

  // ── Lit mist ──
  vec3 mistColor = mix(lavenderColor, peachColor, mistLighting);
  color += mistColor * mistDensity * mistLighting * 0.25;

  // Mist scatters the god rays
  color += rayColor * rays * mistDensity * 0.15;

  // ── Atmospheric particles catching the light ──
  float particles = mistParticles(uv, t);
  particles *= (0.3 + u_treble * 0.7);
  vec3 particleColor = mix(vec3(1.0, 0.9, 0.7), vec3(0.8, 0.7, 0.9), 1.0 - mistLighting);
  color += particleColor * particles * (0.5 + mistLighting * 0.5);

  // ── Horizon line suggestion — very subtle ──
  float horizonLine = exp(-pow((uv.y + 0.05) * 10.0, 2.0)) * 0.06;
  color += coreColor * horizonLine;

  // ── Secondary glow — creates depth, as if light wraps around mist ──
  vec2 secondaryPos = lightPos + vec2(0.1, 0.05) * sin(t * 0.3 + vec2(0.0, 1.57));
  float secondary = softGlow(uv, secondaryPos, 0.4 * breath, 2.0);
  color += roseColor * secondary * 0.15;

  // ── Warm color grading — ensure warm-to-cool gradient ──
  // Enhance warmth near center, coolness at edges
  float warmZone = exp(-distToLight * 1.5);
  color = mix(color, color * vec3(1.05, 0.97, 0.90), warmZone * 0.3);
  color = mix(color, color * vec3(0.92, 0.92, 1.05), (1.0 - warmZone) * 0.2);

  // ── Vignette — soft fade at edges ──
  float vignette = 1.0 - smoothstep(0.3, 1.3, length(uv));
  color *= 0.6 + 0.4 * vignette;

  // Prevent clipping while allowing bloom-like overbright core
  color = min(color, vec3(1.3));

  gl_FragColor = vec4(color, 1.0);
}
`;
