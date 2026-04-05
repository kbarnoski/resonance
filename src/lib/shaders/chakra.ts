import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Energy centers: 7 spinning vortices of different colors aligned vertically,
// each with unique rotation speed and sacred geometry patterns.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  vec3 color = vec3(0.0);

  // Central spine — subtle vertical line of energy
  float spine = smoothstep(0.015, 0.0, abs(uv.x)) * smoothstep(0.8, 0.3, abs(uv.y));
  vec3 spineCol = vec3(0.3, 0.25, 0.4) * (0.4 + 0.3 * u_mid);
  color += spineCol * spine;

  // 7 chakra palette offsets — root to crown
  // Each has a unique hue shift for the IQ palette
  float chakraHues[7];
  chakraHues[0] = 0.0;   // root — deep red/warm
  chakraHues[1] = 0.08;  // sacral — orange
  chakraHues[2] = 0.16;  // solar plexus — golden
  chakraHues[3] = 0.33;  // heart — green/emerald
  chakraHues[4] = 0.5;   // throat — blue
  chakraHues[5] = 0.62;  // third eye — indigo/violet
  chakraHues[6] = 0.78;  // crown — violet/white

  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float yPos = -0.55 + fi * 0.185; // spread vertically
    vec2 center = vec2(0.0, yPos);
    vec2 local = uv - center;
    float lr = length(local);
    float la = atan(local.y, local.x);

    // Rotation — each spins at different speed, alternating direction
    float spinDir = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
    float spinSpeed = 0.5 + fi * 0.15;
    float rotA = la + t * spinSpeed * spinDir;

    // Petal count increases from root (4) to crown (12)
    float petals = 4.0 + fi * 1.3;
    float petalAngle = mod(rotA + 3.14159 / petals, 6.28318 / petals) - 3.14159 / petals;

    // Vortex shape — petals with spinning spiral
    float spiral = sin(rotA * 3.0 - lr * 20.0 + t * 2.0);
    float petalMask = smoothstep(0.06, 0.0, abs(petalAngle) * lr - 0.002);
    float vortexGlow = exp(-lr * lr * 120.0) * (0.8 + 0.4 * u_bass);

    // Outer ring
    float ringR = 0.07 + 0.01 * sin(t * 2.0 + fi);
    float ring = smoothstep(0.006, 0.0, abs(lr - ringR));

    // Petal glow
    float pGlow = smoothstep(ringR + 0.01, ringR * 0.3, lr) * smoothstep(0.04, 0.0, abs(petalAngle) * lr);

    // Spiral arms inside vortex
    float spiralArm = smoothstep(0.3, 0.8, spiral * 0.5 + 0.5) * smoothstep(ringR, 0.0, lr) * 0.5;

    // Color — use chakra-specific hue
    vec3 chakraCol = palette(
      chakraHues[i] + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.4),
      vec3(1.0, 1.0, 0.8),
      vec3(0.0, 0.15, 0.3)
    );

    // Crown chakra gets sacred white blend
    float whiteBlend = fi / 6.0 * 0.3;
    chakraCol = mix(chakraCol, vec3(1.0, 0.95, 0.9), whiteBlend);

    color += chakraCol * (pGlow + spiralArm) * (0.6 + 0.4 * u_mid);
    color += chakraCol * vortexGlow;
    color += chakraCol * ring * 0.8;
  }

  // Connecting energy flow — FBM along the spine
  float flow = snoise(vec2(uv.x * 8.0, uv.y * 4.0 - t * 1.5));
  flow = smoothstep(0.2, 0.8, flow) * smoothstep(0.08, 0.0, abs(uv.x)) * 0.25;
  vec3 flowCol = palette(
    uv.y * 0.5 + 0.5 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.8, 0.6),
    vec3(0.0, 0.2, 0.4)
  );
  color += flowCol * flow;

  // Treble shimmer — fine particles along spine
  float particles = snoise(vec2(uv.x * 30.0, uv.y * 15.0 - t * 3.0));
  particles = pow(max(particles, 0.0), 5.0) * u_treble * 0.4;
  particles *= smoothstep(0.1, 0.0, abs(uv.x));
  color += vec3(1.0, 0.95, 0.9) * particles;

  // Vignette
  color *= smoothstep(1.4, 0.35, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
