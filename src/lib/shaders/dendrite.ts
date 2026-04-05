import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Hash for branch seeds
float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: neural tissue void ──
  float bgN = fbm(uv * 2.0 + vec2(t * 0.05, -t * 0.04));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.2,
    vec3(0.02, 0.02, 0.04),
    vec3(0.03, 0.03, 0.05),
    vec3(0.4, 0.5, 0.7),
    vec3(0.0, 0.1, 0.3)
  );
  color = bgColor * (bgN * 0.12 + 0.05);

  // ── Dendrite branches — multiple branching arms from a soma ──
  // Central soma (cell body)
  float somaDist = length(uv);
  float somaGlow = exp(-somaDist * somaDist / 0.015);
  float somaEdge = smoothstep(0.14, 0.11, somaDist);

  vec3 somaColor = palette(
    t * 0.05 + paletteShift + 0.1,
    vec3(0.4, 0.35, 0.5),
    vec3(0.3, 0.3, 0.45),
    vec3(0.8, 0.7, 1.0),
    vec3(0.0, 0.15, 0.35)
  );
  color += somaColor * (somaGlow * 0.8 + somaEdge * 0.3);

  // ── Branching dendrite arms ──
  // Each arm is a line segment that curves outward, with sub-branches
  float branchAccum = 0.0;
  float impulseAccum = 0.0;

  for (int arm = 0; arm < 7; arm++) {
    float af = float(arm);
    float baseAngle = af * 0.898 + 0.3; // ~51.4 degrees apart, offset
    float armLen = 0.5 + hash1(af * 3.7) * 0.3;

    // Primary branch direction — slowly swaying
    float sway = sin(t * 0.5 + af * 1.3) * 0.15;
    float angle = baseAngle + sway;
    vec2 armDir = vec2(cos(angle), sin(angle));

    // Distance to the primary branch line
    // Project uv onto the arm direction
    float along = dot(uv, armDir);
    float across = length(uv - armDir * along);

    // Taper: thicker near soma, thinner at tips
    float taper = smoothstep(armLen, 0.0, along) * smoothstep(-0.05, 0.05, along);
    float branchWidth = (0.02 + 0.015 * taper) * (1.0 + u_bass * 0.3);

    // Add organic waviness to the branch
    float wave = snoise(vec2(along * 8.0, af * 5.0 + t * 0.3)) * 0.02;
    float branchDist = abs(across + wave) - branchWidth * taper;
    float branchGlow = smoothstep(0.02, 0.0, branchDist) * taper;

    branchAccum += branchGlow;

    // ── Electrical impulses traveling along branches ──
    float impulseSpeed = 3.0 + u_bass * 2.0;
    float impulsePhase = fract(t * 0.4 * impulseSpeed / armLen + af * 0.37);
    float impulsePos = impulsePhase * armLen;
    float impulseDist = abs(along - impulsePos);
    float impulse = smoothstep(0.08, 0.0, impulseDist) * taper;
    impulse *= smoothstep(0.0, 0.05, along); // fade near soma
    impulseAccum += impulse;

    // ── Sub-branches — smaller offshoots ──
    for (int sub = 0; sub < 4; sub++) {
      float sf = float(sub);
      float subStart = (sf + 1.0) * armLen / 5.0;
      float subAngle = angle + (hash1(af * 7.0 + sf * 3.1) - 0.5) * 1.2;
      vec2 subDir = vec2(cos(subAngle), sin(subAngle));

      vec2 subOrigin = armDir * subStart;
      vec2 subUV = uv - subOrigin;
      float subAlong = dot(subUV, subDir);
      float subAcross = length(subUV - subDir * subAlong);
      float subLen = 0.12 + hash1(af * 11.0 + sf) * 0.1;
      float subTaper = smoothstep(subLen, 0.0, subAlong) * smoothstep(-0.01, 0.02, subAlong);
      float subWidth = 0.008 * subTaper;
      float subDist = abs(subAcross) - subWidth;
      float subGlow = smoothstep(0.01, 0.0, subDist) * subTaper;

      branchAccum += subGlow * 0.6;
    }
  }

  // ── Branch color — cool neural tones ──
  vec3 branchColor = palette(
    branchAccum * 0.3 + t * 0.03 + paletteShift + 0.4,
    vec3(0.35, 0.4, 0.55),
    vec3(0.3, 0.35, 0.5),
    vec3(0.7, 0.8, 1.0),
    vec3(0.0, 0.2, 0.4)
  );
  color += branchColor * branchAccum * 0.7;

  // ── Impulse glow — bright electrical signal ──
  vec3 impulseColor = palette(
    t * 0.1 + paletteShift + 0.7,
    vec3(0.6, 0.5, 0.7),
    vec3(0.5, 0.4, 0.6),
    vec3(1.0, 0.8, 1.0),
    vec3(0.0, 0.1, 0.3)
  );
  color += impulseColor * impulseAccum * (1.5 + u_mid * 1.0);

  // ── Synaptic vesicles — tiny glowing dots at branch tips ──
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float seed = hash1(fi * 9.3);
    float seed2 = hash1(fi * 5.7 + 2.0);
    float angle = seed * 6.28;
    float radius = 0.45 + seed2 * 0.35;
    vec2 vesPos = vec2(cos(angle), sin(angle)) * radius;
    vesPos += vec2(sin(t * 0.8 + fi), cos(t * 0.6 + fi * 1.3)) * 0.03;

    float vesDist = length(uv - vesPos);
    float vesGlow = exp(-vesDist * vesDist / 0.0008);
    float vesPulse = 0.5 + 0.5 * sin(t * 3.0 + fi * 2.1);

    vec3 vesColor = palette(
      fi * 0.12 + paletteShift + 0.5,
      vec3(0.5, 0.4, 0.6),
      vec3(0.4, 0.3, 0.5),
      vec3(0.9, 0.7, 1.0),
      vec3(0.05, 0.15, 0.4)
    );
    color += vesColor * vesGlow * vesPulse * (0.6 + u_treble * 0.8);
  }

  // ── Treble: fine neural sparkle ──
  float sparkle = snoise(uv * 25.0 + t * 2.0);
  sparkle = smoothstep(0.75, 1.0, sparkle) * u_treble;
  color += branchColor * sparkle * 0.3;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
