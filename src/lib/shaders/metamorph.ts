import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SMIN } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SMIN +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  // Morphing phase — cycles between stages
  float phase = sin(t * 0.25) * 0.5 + 0.5; // 0=larva, 0.5=pupa, 1=imago
  float larvaPhase = smoothstep(0.0, 0.3, 1.0 - phase);
  float pupaPhase = 1.0 - abs(phase - 0.5) * 2.0;
  pupaPhase = smoothstep(0.0, 1.0, pupaPhase);
  float imagoPhase = smoothstep(0.7, 1.0, phase);

  vec2 p = uv;

  // LARVA FORM — segmented worm body
  float segmented = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float yOff = -0.3 + fi * 0.08;
    float xWave = sin(fi * 0.8 + t * 2.0) * 0.05;
    float segR = 0.04 - fi * 0.002;
    float d = length(p - vec2(xWave, yOff)) - segR;
    segmented = smin(segmented > 0.0 ? -segmented : 1.0, d > 0.0 ? d : -0.001, 0.03);
  }
  // Simplified: just use distance-based approach
  float larvaDist = 1e6;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float yOff = -0.25 + fi * 0.07;
    float xWave = sin(fi * 0.8 + t * 2.0) * 0.06;
    float segR = 0.035 - fi * 0.002;
    float d = length(p - vec2(xWave, yOff)) - segR;
    larvaDist = smin(larvaDist, d, 0.025);
  }
  float larva = smoothstep(0.005, -0.005, larvaDist);

  // PUPA FORM — enclosed ovoid, dissolving and reforming
  vec2 pupaP = p;
  pupaP.x *= 1.2;
  float pupaWarp = snoise(pupaP * 5.0 + t * 0.3) * 0.05;
  float pupaDist = length(pupaP) - 0.2 + pupaWarp;
  float pupa = smoothstep(0.01, -0.01, pupaDist);

  // Internal dissolution pattern
  float dissolution = fbm(p * 6.0 + vec2(t * 0.2, 0.0));
  float dissolvePattern = smoothstep(0.0, 0.4, dissolution) * pupa;

  // IMAGO FORM — butterfly wings
  vec2 wingP = p * rot2(t * 0.03);
  float wingAngle = atan(wingP.y, abs(wingP.x));
  float wingR = length(wingP);

  // Wing shape — two lobes
  float upperWing = cos(wingAngle * 1.5 + 0.5) * 0.3;
  float lowerWing = cos(wingAngle * 2.0 - 1.0) * 0.2;
  float wingShape = max(upperWing, lowerWing);
  float wing = smoothstep(wingShape + 0.02, wingShape - 0.02, wingR);
  wing *= step(0.04, abs(wingP.x)); // gap for body

  // Body
  float body = smoothstep(0.025, 0.015, abs(wingP.x)) * smoothstep(0.25, 0.0, abs(wingP.y));

  // Wing pattern — spots and veins
  float spots = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 spotPos = vec2(0.1 + fi * 0.04, 0.05 - fi * 0.03);
    spots += smoothstep(0.03, 0.01, length(abs(wingP) - spotPos));
  }

  // Colors
  vec3 larvaColor = palette(
    larvaDist * 2.0 + t * 0.02,
    vec3(0.3, 0.35, 0.1),
    vec3(0.2, 0.25, 0.08),
    vec3(0.6, 0.7, 0.2),
    vec3(0.0, 0.1, 0.0)
  );

  vec3 pupaColor = palette(
    dissolution * 0.5 + t * 0.03,
    vec3(0.35, 0.25, 0.15),
    vec3(0.2, 0.15, 0.08),
    vec3(0.6, 0.45, 0.25),
    vec3(0.0, 0.08, 0.05)
  );

  vec3 wingColor = palette(
    wingR * 0.8 + wingAngle * 0.2 + t * 0.02,
    vec3(0.6, 0.3, 0.1),
    vec3(0.4, 0.2, 0.1),
    vec3(1.0, 0.5, 0.2),
    vec3(0.0, 0.1, 0.2)
  );

  vec3 spotColor = vec3(0.1, 0.05, 0.2);
  vec3 bodyColor = vec3(0.08, 0.05, 0.03);

  // Background — dark natural
  vec3 bgColor = palette(
    fbm(uv * 2.0 + t * 0.02) * 0.2 + 0.7,
    vec3(0.04, 0.05, 0.03),
    vec3(0.02, 0.03, 0.02),
    vec3(0.15, 0.2, 0.1),
    vec3(0.0, 0.08, 0.05)
  );

  // Compose by phase blending
  vec3 color = bgColor;

  // Larva
  color = mix(color, larvaColor, larva * larvaPhase);

  // Pupa
  vec3 pupaInner = mix(pupaColor, larvaColor * 0.5 + wingColor * 0.5, dissolvePattern);
  color = mix(color, pupaInner, pupa * pupaPhase);

  // Imago
  color = mix(color, wingColor, wing * imagoPhase);
  color = mix(color, spotColor, spots * wing * imagoPhase * 0.7);
  color = mix(color, bodyColor, body * imagoPhase);

  // Transformation energy — bass reactive glow during pupa phase
  float energy = fbm(p * 8.0 + t * 0.5) * pupaPhase * pupa;
  color += vec3(0.4, 0.3, 0.1) * energy * u_bass * 0.5;

  // Wing flutter shimmer — mid reactive
  float flutter = sin(wingAngle * 20.0 + t * 4.0) * 0.5 + 0.5;
  flutter = pow(flutter, 4.0);
  color += wingColor * flutter * wing * imagoPhase * u_mid * 0.25;

  // Metamorphic sparkle — treble
  float sparkle = pow(snoise(p * 25.0 + t * 2.0) * 0.5 + 0.5, 12.0);
  color += vec3(0.6, 0.5, 0.3) * sparkle * u_treble * 0.4;

  color *= 0.85 + u_amplitude * 0.2;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
