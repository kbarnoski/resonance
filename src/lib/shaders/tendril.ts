import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: deep dark organic void ──
  float bgN = fbm(uv * 2.0 + vec2(t * 0.05, -t * 0.04));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.3,
    vec3(0.015, 0.02, 0.01),
    vec3(0.02, 0.03, 0.015),
    vec3(0.3, 0.4, 0.3),
    vec3(0.0, 0.12, 0.2)
  );
  color = bgColor * (bgN * 0.1 + 0.03);

  // ── Tendrils: multiple organic vines reaching through space ──
  float tendrilAccum = 0.0;
  float glowAccum = 0.0;
  float tipAccum = 0.0;

  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float seed = hash1(fi * 7.31);
    float seed2 = hash1(fi * 13.17 + 2.0);

    // Origin point — scattered around center
    float originAngle = fi * 0.698 + seed * 0.5; // ~40 degrees apart
    float originR = 0.1 + seed2 * 0.15;
    vec2 origin = vec2(cos(originAngle), sin(originAngle)) * originR;

    // Growth direction — outward with gentle curves
    float growAngle = originAngle + sin(t * 0.3 + fi * 1.7) * 0.4;
    float growLen = 0.4 + seed * 0.3;

    // Trace the tendril path with curling
    vec2 prev = origin;
    float segLen = growLen / 16.0;

    for (int seg = 1; seg <= 16; seg++) {
      float sf = float(seg) / 16.0;

      // Angle evolves: the tendril curls as it grows
      float curl = sin(sf * 6.28 + t * 1.0 + fi * 2.0) * 0.4 * sf;
      float waveSm = sin(sf * 12.0 + t * 2.0 + fi * 0.9) * 0.15 * sf;
      float segAngle = growAngle + curl + waveSm;

      vec2 dir = vec2(cos(segAngle), sin(segAngle));
      vec2 curr = prev + dir * segLen;

      // Distance to this segment
      vec2 pa = uv - prev;
      vec2 ba = curr - prev;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      float d = length(pa - ba * h);

      // Taper: thick at base, thin at tip
      float taper = mix(0.018, 0.003, sf);
      taper *= (1.0 + u_bass * 0.3);

      float tendrilGlow = smoothstep(taper + 0.015, taper, d);
      float tendrilCore = smoothstep(taper + 0.003, taper, d);

      tendrilAccum += tendrilCore * 0.3;
      glowAccum += tendrilGlow * 0.15;

      // Curling tip — enhanced glow at the very end
      if (seg >= 14) {
        float tipIntensity = smoothstep(14.0 / 16.0, 1.0, sf);
        float tipDist = length(uv - curr);
        float tipGlow = exp(-tipDist * tipDist / (0.002 + u_treble * 0.001));
        tipAccum += tipGlow * tipIntensity;
      }

      prev = curr;
    }
  }

  // ── Tendril colors — rich greens and jade ──
  vec3 tendrilColor = palette(
    tendrilAccum * 0.4 + t * 0.03 + paletteShift,
    vec3(0.2, 0.4, 0.25),
    vec3(0.2, 0.35, 0.2),
    vec3(0.5, 0.9, 0.6),
    vec3(0.0, 0.2, 0.25)
  );
  color += tendrilColor * tendrilAccum;

  // Soft glow halo
  vec3 haloColor = palette(
    glowAccum * 0.3 + t * 0.04 + paletteShift + 0.2,
    vec3(0.15, 0.3, 0.2),
    vec3(0.12, 0.25, 0.18),
    vec3(0.4, 0.8, 0.5),
    vec3(0.0, 0.15, 0.2)
  );
  color += haloColor * glowAccum * 0.5;

  // Tip glow — bioluminescent growing points
  vec3 tipColor = palette(
    t * 0.08 + paletteShift + 0.6,
    vec3(0.4, 0.6, 0.3),
    vec3(0.35, 0.55, 0.25),
    vec3(0.7, 1.0, 0.5),
    vec3(0.0, 0.2, 0.15)
  );
  color += tipColor * tipAccum * (1.0 + u_treble * 1.0);

  // ── Unfurling leaves / small fronds along tendrils ──
  for (int leaf = 0; leaf < 12; leaf++) {
    float lf = float(leaf);
    float lSeed = hash1(lf * 5.7 + 10.0);
    float lSeed2 = hash1(lf * 11.3 + 7.0);

    // Position along a tendril
    float parentArm = floor(lSeed * 9.0);
    float parentT = 0.2 + lSeed2 * 0.6; // position along tendril
    float leafAngle = lSeed * 6.28 + sin(t * 0.8 + lf) * 0.5;

    // Approximate position (simplified — near the tendril network)
    float armAngle = parentArm * 0.698 + hash1(parentArm * 7.31) * 0.5;
    float armR = 0.1 + hash1(parentArm * 13.17 + 2.0) * 0.15;
    vec2 leafBase = vec2(cos(armAngle), sin(armAngle)) * (armR + parentT * 0.35);

    // Small elliptical leaf
    vec2 leafUV = uv - leafBase;
    leafUV = rot2(leafAngle) * leafUV;
    float leafDist = length(leafUV * vec2(1.0, 3.0)) - 0.015;
    float leafGlow = smoothstep(0.01, 0.0, leafDist);

    // Unfurling animation
    float unfurl = smoothstep(0.0, 0.5, sin(t * 0.5 + lf * 0.8) * 0.5 + 0.5);
    leafGlow *= unfurl;

    vec3 leafColor = palette(
      lf * 0.1 + paletteShift + 0.15,
      vec3(0.25, 0.45, 0.2),
      vec3(0.2, 0.4, 0.15),
      vec3(0.6, 1.0, 0.4),
      vec3(0.0, 0.2, 0.15)
    );
    color += leafColor * leafGlow * 0.4;
  }

  // ── Central root glow ──
  float rootGlow = exp(-dot(uv, uv) / 0.03);
  color += tendrilColor * rootGlow * 0.2 * (1.0 + u_bass * 0.5);

  // ── Mid: pulsing sap flow along tendrils ──
  float sapPulse = sin(tendrilAccum * 20.0 - t * 5.0) * 0.5 + 0.5;
  sapPulse = pow(sapPulse, 6.0) * tendrilAccum * u_mid;
  color += tipColor * sapPulse * 0.4;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
