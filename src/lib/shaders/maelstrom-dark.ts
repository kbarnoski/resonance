import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Dark whirlpool — swirling void pulling everything inward.
// Spiraling darkness, matter being consumed by a central emptiness.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  // ── Polar coordinates for spiral ──
  float dist = length(uv);
  float angle = atan(uv.y, uv.x);

  // ── Spiral distortion — UV spirals inward ──
  float spiralTight = 3.0 + u_bass * 1.0;
  float spiralAngle = angle + dist * spiralTight - t * 1.5;
  vec2 spiralUV = vec2(spiralAngle, dist);

  // ── Swirling matter — noise in spiral space ──
  float matter = fbm3(spiralUV * vec2(1.0, 4.0) + vec2(t * 0.5, 0.0));
  float matterDensity = smoothstep(-0.2, 0.4, matter);

  // Arms of the vortex — regular spiral structure
  float arms = sin(spiralAngle * 2.0) * 0.5 + 0.5;
  arms = smoothstep(0.2, 0.8, arms);
  arms *= smoothstep(0.0, 0.15, dist); // fade near center

  // ── Central void — absolute black pulling everything in ──
  float voidRadius = 0.08 + u_bass * 0.03;
  float voidMask = smoothstep(voidRadius + 0.05, voidRadius, dist);
  float voidEdge = smoothstep(voidRadius + 0.12, voidRadius + 0.02, dist);

  // ── Accretion disc — bright ring around the void ──
  float accretionDist = abs(dist - voidRadius - 0.06);
  float accretion = exp(-accretionDist * 20.0);
  accretion *= (0.5 + u_mid * 0.5);

  // ── Debris being pulled in — streaks ──
  float debris = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float debrisAngle = fi * 0.785 + t * 0.8;
    float debrisDist = fract(fi * 0.37 - t * 0.2) * 0.8 + 0.1;
    vec2 debrisPos = vec2(cos(debrisAngle), sin(debrisAngle)) * debrisDist;

    // Streak shape — elongated along spiral
    vec2 diff = uv - debrisPos;
    float along = dot(diff, vec2(-sin(debrisAngle), cos(debrisAngle)));
    float perp = dot(diff, vec2(cos(debrisAngle), sin(debrisAngle)));
    float streak = exp(-along * along * 100.0 - perp * perp * 400.0);
    debris += streak * (1.0 - debrisDist);
  }

  // ── Colors ──
  // Swirling matter — deep cold blues and purples
  vec3 matterColor = palette(
    matter * 2.0 + dist * 1.5 + u_amplitude * 0.2,
    vec3(0.03, 0.02, 0.06),
    vec3(0.06, 0.04, 0.12),
    vec3(0.4, 0.3, 0.8),
    vec3(0.1, 0.08, 0.25)
  );

  // Spiral arm color — slightly brighter
  vec3 armColor = palette(
    arms * 1.5 + t * 0.2,
    vec3(0.05, 0.03, 0.08),
    vec3(0.08, 0.05, 0.15),
    vec3(0.5, 0.3, 0.7),
    vec3(0.15, 0.1, 0.3)
  );

  // Accretion disc — hot, compressed, bright edge
  vec3 accretionColor = palette(
    accretion * 3.0 + t * 0.4,
    vec3(0.4, 0.15, 0.1),
    vec3(0.4, 0.2, 0.15),
    vec3(0.8, 0.5, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  // ── Compositing ──
  vec3 color = matterColor * matterDensity * 0.3;
  color += armColor * arms * 0.2 * (1.0 - voidMask);
  color += accretionColor * accretion * 0.6;
  color += vec3(0.5, 0.3, 0.2) * debris * 0.3 * (0.5 + u_treble * 0.5);

  // Everything fades toward the void center
  color *= (1.0 - voidMask);

  // Faint glow at void edge — light being redshifted
  color += vec3(0.15, 0.03, 0.02) * voidEdge * 0.3;

  // Radial darkening toward edges — matter thins out
  color *= smoothstep(1.2, 0.3, dist);

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.2, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
