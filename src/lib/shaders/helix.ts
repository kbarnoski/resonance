import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Distance to a 3D line segment
float sdSegment3D(vec3 p, vec3 a, vec3 b) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Camera
  vec3 ro = vec3(0.0, 0.0, 3.0);
  vec3 rd = normalize(vec3(uv * 0.9, -1.0));

  // Slow rotation
  float rotAngle = t * 0.3;
  ro.xz = rot2(rotAngle) * ro.xz;
  rd.xz = rot2(rotAngle) * rd.xz;

  // Gentle tilt
  float tiltA = sin(t * 0.2) * 0.15;
  ro.yz = rot2(tiltA) * ro.yz;
  rd.yz = rot2(tiltA) * rd.yz;

  vec3 color = vec3(0.0);

  // Double helix parameters
  float helixR = 0.5 + u_bass * 0.05; // radius of helix
  float pitch = 1.2; // vertical distance per full turn
  float strandR = 0.04; // strand thickness
  int numRungs = 12;

  // Sample along ray to find closest approach to helix strands
  float minD1 = 100.0, minD2 = 100.0, minDRung = 100.0;
  float bestT1 = 0.0, bestT2 = 0.0, bestTRung = 0.0;
  float bestPhase1 = 0.0, bestPhase2 = 0.0;

  for (int i = 0; i < 40; i++) {
    float ray_t = float(i) * 0.15;
    vec3 p = ro + rd * ray_t;

    // Helix axis along Y
    float y = p.y;
    float scrollY = y + t * 2.0; // scroll animation

    // Strand 1 position at this y
    float phase1 = scrollY / pitch * 6.28318;
    vec3 s1 = vec3(helixR * cos(phase1), y, helixR * sin(phase1));
    float d1 = length(p - s1);

    // Strand 2: offset by PI
    float phase2 = phase1 + 3.14159;
    vec3 s2 = vec3(helixR * cos(phase2), y, helixR * sin(phase2));
    float d2 = length(p - s2);

    if (d1 < minD1) { minD1 = d1; bestT1 = ray_t; bestPhase1 = phase1; }
    if (d2 < minD2) { minD2 = d2; bestT2 = ray_t; bestPhase2 = phase2; }

    // Rungs: connecting the two strands at regular intervals
    for (int j = 0; j < 12; j++) {
      float rungY = float(j) * pitch / 6.0 - 3.0 + mod(t * 2.0, pitch / 6.0);
      float rungPhase = (rungY + t * 2.0) / pitch * 6.28318;
      vec3 rA = vec3(helixR * cos(rungPhase), rungY, helixR * sin(rungPhase));
      vec3 rB = vec3(helixR * cos(rungPhase + 3.14159), rungY, helixR * sin(rungPhase + 3.14159));
      float dRung = sdSegment3D(p, rA, rB);
      if (dRung < minDRung) { minDRung = dRung; bestTRung = ray_t; }
    }
  }

  // Strand glow
  float strand1Glow = exp(-minD1 * 12.0);
  float strand1Core = smoothstep(strandR * 2.0, 0.0, minD1);
  float strand2Glow = exp(-minD2 * 12.0);
  float strand2Core = smoothstep(strandR * 2.0, 0.0, minD2);

  // Rung glow
  float rungGlow = exp(-minDRung * 15.0);
  float rungCore = smoothstep(strandR * 1.5, 0.0, minDRung);

  // Colors
  vec3 col1 = palette(
    bestPhase1 * 0.1 + t * 0.3 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.4, 0.6),
    vec3(0.8, 1.0, 0.5),
    vec3(0.0, 0.15, 0.4)
  );
  vec3 col2 = palette(
    bestPhase2 * 0.1 + t * 0.3 + paletteShift + 0.5,
    vec3(0.5, 0.4, 0.5),
    vec3(0.4, 0.5, 0.3),
    vec3(1.0, 0.7, 0.4),
    vec3(0.1, 0.05, 0.3)
  );
  vec3 rungCol = palette(
    bestTRung * 0.1 + t * 0.4 + paletteShift + 0.25,
    vec3(0.6, 0.6, 0.6),
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.9, 1.0),
    vec3(0.0, 0.05, 0.25)
  );

  // Depth fade
  float depth1 = exp(-bestT1 * 0.15);
  float depth2 = exp(-bestT2 * 0.15);
  float depthR = exp(-bestTRung * 0.15);

  color += col1 * (strand1Glow * 0.4 + strand1Core * 1.5) * depth1;
  color += col2 * (strand2Glow * 0.4 + strand2Core * 1.5) * depth2;
  color += rungCol * (rungGlow * 0.3 + rungCore * 1.0) * depthR;

  // Audio: treble makes rungs pulse
  color += rungCol * rungCore * u_treble * 0.6 * depthR;

  // Background particles (nucleotides vibe)
  float n = snoise(uv * 5.0 + t * 0.5) * 0.5 + 0.5;
  float sparkle = smoothstep(0.75, 0.8, n) * 0.15;
  color += palette(n + t * 0.1, vec3(0.3), vec3(0.3), vec3(0.6, 0.8, 1.0), vec3(0.1, 0.1, 0.3)) * sparkle;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
