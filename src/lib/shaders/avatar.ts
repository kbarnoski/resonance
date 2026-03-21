import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Symmetric figure
  vec2 suv = vec2(abs(uv.x), uv.y);

  // Human silhouette approximation using SDF-like math
  // Head — circle at top
  float head = length(uv - vec2(0.0, 0.35)) - 0.09;

  // Neck
  float neck = max(suv.x - 0.03, abs(uv.y - 0.25) - 0.04);

  // Torso — tapered rectangle
  float torsoWidth = 0.12 - (uv.y - 0.0) * 0.04;
  torsoWidth = max(torsoWidth, 0.06);
  float torso = max(suv.x - torsoWidth, max(-(uv.y + 0.2), uv.y - 0.22));

  // Arms — angled outward
  vec2 armUV = suv - vec2(0.12, 0.1);
  float armAngle = -0.3 + sin(t * 0.5) * 0.15;
  vec2 rotArm = rot2(armAngle) * armUV;
  float arm = max(abs(rotArm.x) - 0.025, abs(rotArm.y) - 0.15);

  // Legs
  vec2 legUV = suv - vec2(0.06, -0.35);
  float leg = max(abs(legUV.x) - 0.03, abs(legUV.y) - 0.18);

  // Combine body parts
  float body = min(min(min(head, neck), min(torso, arm)), leg);
  float bodyEdge = smoothstep(0.015, 0.0, abs(body));
  float bodyFill = smoothstep(0.01, -0.02, body);

  // Aura layers — concentric energy fields around the body
  float aura1 = smoothstep(0.04, 0.0, body - 0.04);
  float aura2 = smoothstep(0.06, 0.0, body - 0.1);
  float aura3 = smoothstep(0.08, 0.0, body - 0.2);

  // Subtract body from aura
  aura1 *= (1.0 - bodyFill);
  aura2 *= (1.0 - aura1) * (1.0 - bodyFill);
  aura3 *= (1.0 - aura2) * (1.0 - aura1) * (1.0 - bodyFill);

  // Chakra points along the spine
  float chakras = 0.0;
  float chakraColors = 0.0;
  for (int i = 0; i < 7; i++) {
    float cy = -0.2 + float(i) * 0.09;
    float cdist = length(uv - vec2(0.0, cy));
    float pulse = sin(t * 2.0 + float(i) * 0.8) * 0.5 + 0.5;
    float ch = smoothstep(0.025, 0.005, cdist) * (0.6 + pulse * 0.4);
    chakras += ch;
    chakraColors += ch * float(i) / 6.0;
  }

  // Energy emanating outward — radial rays from body
  float emanation = 0.0;
  for (int i = 0; i < 12; i++) {
    float ea = float(i) * 0.5236 + t * 0.2;
    float rayWidth = 0.02 + 0.01 * sin(t + float(i));
    float ray = exp(-abs(a - ea + 3.14159) / rayWidth);
    if (abs(a - ea + 3.14159) > 3.14159) ray = exp(-abs(a - ea + 3.14159 - 6.28318) / rayWidth);
    emanation += ray;
  }
  emanation *= smoothstep(0.2, 0.35, r) * smoothstep(0.8, 0.4, r);
  emanation *= u_treble * 0.6 + 0.2;

  // Crown energy above the head — ascending luminance
  float crown = fbm(vec2(uv.x * 8.0, (uv.y - 0.45) * 4.0 - t * 0.8));
  float crownMask = smoothstep(0.44, 0.5, uv.y) * smoothstep(0.8, 0.5, uv.y);
  crownMask *= smoothstep(0.15, 0.0, abs(uv.x));
  crown = max(crown, 0.0) * crownMask;

  // FBM texture within the aura
  float auraNoise = fbm(uv * 5.0 + t * 0.2);

  // Body interior palette — deep indigo
  vec3 colBody = palette(
    uv.y + paletteShift,
    vec3(0.1, 0.08, 0.2),
    vec3(0.2, 0.15, 0.3),
    vec3(0.3, 0.2, 0.5),
    vec3(0.0, 0.1, 0.3)
  );

  // Inner aura — warm gold
  vec3 col1 = palette(
    r * 2.0 + auraNoise * 0.5 + paletteShift,
    vec3(0.6, 0.5, 0.3),
    vec3(0.4, 0.35, 0.25),
    vec3(1.0, 0.8, 0.4),
    vec3(0.0, 0.1, 0.15)
  );

  // Mid aura — ethereal cyan
  vec3 col2 = palette(
    r * 3.0 + paletteShift + 0.3,
    vec3(0.4, 0.55, 0.6),
    vec3(0.4, 0.45, 0.45),
    vec3(0.5, 0.8, 1.0),
    vec3(0.2, 0.3, 0.4)
  );

  // Outer aura — soft violet
  vec3 col3 = palette(
    r * 4.0 + paletteShift + 0.6,
    vec3(0.45, 0.35, 0.55),
    vec3(0.35, 0.3, 0.4),
    vec3(0.6, 0.4, 0.8),
    vec3(0.4, 0.2, 0.5)
  );

  // Chakra rainbow
  vec3 chakraCol = palette(
    chakraColors + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.33, 0.67)
  );

  vec3 color = vec3(0.0);

  // Outer aura
  color += col3 * aura3 * 0.4 * (0.5 + abs(auraNoise) * 0.5);

  // Mid aura
  color += col2 * aura2 * 0.6 * (0.6 + u_mid * 0.4);

  // Inner aura
  color += col1 * aura1 * 0.8 * (0.7 + u_bass * 0.4);

  // Body silhouette
  color += colBody * bodyFill * 0.5;
  color += col1 * bodyEdge * 1.5;

  // Chakras
  color += chakraCol * chakras * 1.5 * (0.6 + u_amplitude * 0.5);

  // Energy emanation rays
  color += col2 * emanation * 0.4;

  // Crown energy
  color += col1 * crown * 1.2 * (0.5 + u_treble * 0.5);

  // Central spine line
  float spine = smoothstep(0.008, 0.0, abs(uv.x)) * bodyFill;
  color += vec3(1.2, 1.1, 1.0) * spine * 0.4;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
