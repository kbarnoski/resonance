import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Distance to a funnel/hyperboloid shape
float sdFunnel(vec2 p, float waist, float flare) {
  float y = p.y;
  float r = waist + flare * y * y;
  return length(vec2(p.x, 0.0)) - r;
}

// Pseudo-random for particle IDs
float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: swirling energy field ──
  float bgWarp = fbm(uv * 2.0 + vec2(t * 0.3, -t * 0.2));
  float bgWarp2 = fbm(uv * 3.0 + vec2(-t * 0.15, t * 0.25) + 5.0);
  vec3 bgColor = palette(
    bgWarp * 0.5 + bgWarp2 * 0.3 + t * 0.02 + paletteShift,
    vec3(0.02, 0.03, 0.06),
    vec3(0.04, 0.05, 0.08),
    vec3(0.5, 0.7, 1.0),
    vec3(0.0, 0.15, 0.4)
  );
  color = bgColor * (bgWarp * 0.2 + 0.08);

  // ── Funnel-shaped energy barrier — activation energy ──
  // Rotate the funnel with slow oscillation
  float funnelAngle = sin(t * 0.4) * 0.3;
  vec2 fuv = rot2(funnelAngle) * uv;

  // Funnel distance field — narrow waist, flaring outward
  float waist = 0.04 + u_bass * 0.03;
  float flare = 2.5 - u_amplitude * 0.8;
  float funnelY = fuv.y;
  float funnelR = waist + flare * funnelY * funnelY;
  float funnelDist = abs(length(vec2(fuv.x, 0.0)) - funnelR * sign(abs(fuv.x) + 0.001));
  float funnelShape = abs(abs(fuv.x) - funnelR);

  // Energy barrier walls — glowing edges
  float barrierGlow = smoothstep(0.05, 0.0, funnelShape);
  float barrierEdge = smoothstep(0.015, 0.0, funnelShape);

  vec3 barrierColor = palette(
    funnelY * 2.0 + t * 0.1 + paletteShift,
    vec3(0.4, 0.3, 0.5),
    vec3(0.5, 0.3, 0.4),
    vec3(1.0, 0.7, 0.9),
    vec3(0.0, 0.1, 0.3)
  );

  // Pulsing energy along the barrier — bass drives intensity
  float barrierPulse = sin(funnelY * 20.0 - t * 5.0) * 0.5 + 0.5;
  barrierPulse = pow(barrierPulse, 3.0);
  color += barrierColor * barrierGlow * (0.4 + barrierPulse * u_bass * 1.5);
  color += barrierColor * barrierEdge * 1.2;

  // ── Substrate binding: orbital shapes around the funnel waist ──
  float bindingRadius = 0.2 + u_mid * 0.1;
  float bindAngle = t * 1.5;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float angle = bindAngle + fi * 2.094; // 120 degrees apart
    vec2 bindCenter = vec2(cos(angle), sin(angle)) * bindingRadius;

    // Substrate shape — warped circle
    vec2 bp = fuv - bindCenter;
    float substrateDist = length(bp) - (0.06 + 0.02 * sin(t * 3.0 + fi * 1.5));
    float substrateGlow = smoothstep(0.04, 0.0, abs(substrateDist));
    float substrateFill = smoothstep(0.02, -0.02, substrateDist);

    vec3 subColor = palette(
      fi * 0.33 + t * 0.05 + paletteShift + 0.3,
      vec3(0.5, 0.4, 0.3),
      vec3(0.4, 0.3, 0.4),
      vec3(0.9, 0.8, 1.0),
      vec3(0.1, 0.2, 0.4)
    );

    // Binding affinity — brighter when near the waist
    float proximity = smoothstep(0.4, 0.05, length(bindCenter));
    color += subColor * substrateGlow * (0.5 + proximity * u_mid);
    color += subColor * substrateFill * 0.3 * (1.0 + proximity);
  }

  // ── Particles accelerating through the funnel ──
  for (int i = 0; i < 30; i++) {
    float fi = float(i);
    float seed = hash1(fi * 7.13);
    float seed2 = hash1(fi * 13.37 + 3.0);

    // Particle trajectory — parabolic through the funnel
    float particleTime = fract(t * (0.3 + seed * 0.4) + seed * 10.0);
    float yPos = mix(-0.8, 0.8, particleTime);

    // X position follows funnel shape with some scatter
    float funnelX = waist + flare * yPos * yPos;
    float xSign = seed > 0.5 ? 1.0 : -1.0;
    float scatter = (seed2 - 0.5) * 0.08;
    float xPos = xSign * (funnelX * 0.5 + scatter);

    // Apply funnel rotation
    vec2 particlePos = rot2(funnelAngle) * vec2(0.0);
    particlePos = vec2(xPos, yPos);
    particlePos = rot2(-funnelAngle) * particlePos;

    // Speed increases at the waist — acceleration visualization
    float speed = 1.0 / (0.3 + abs(yPos) * 2.0);
    float trailLength = 0.03 * speed;

    // Particle glow
    float dist = length(uv - particlePos);
    float particleGlow = exp(-dist * dist / (0.001 * speed));

    // Trail — elongated in direction of motion
    vec2 trailDir = normalize(vec2(0.0, 1.0));
    float trailDist = abs(dot(uv - particlePos, vec2(-trailDir.y, trailDir.x)));
    float trailAlong = dot(uv - particlePos, trailDir);
    float trail = smoothstep(trailLength, 0.0, -trailAlong) *
                  smoothstep(0.0, -trailLength * 0.5, trailAlong) *
                  smoothstep(0.008, 0.0, trailDist);

    // Particle color — shifts with speed (faster = hotter)
    vec3 pColor = palette(
      speed * 0.3 + seed * 0.5 + paletteShift,
      vec3(0.5, 0.4, 0.3),
      vec3(0.5, 0.4, 0.5),
      vec3(1.0, 0.8, 0.6),
      vec3(0.0, 0.15, 0.35)
    );

    float depthFade = 0.3 + 0.7 * seed2;
    color += pColor * (particleGlow * 0.6 + trail * 0.3) * depthFade;
  }

  // ── Catalytic hotspot at the waist ──
  float waistDist = length(fuv * vec2(1.0, 3.0));
  float catalystGlow = exp(-waistDist * waistDist / (0.02 + u_bass * 0.03));
  vec3 catalystColor = palette(
    t * 0.15 + paletteShift + 0.6,
    vec3(0.6, 0.5, 0.4),
    vec3(0.5, 0.4, 0.5),
    vec3(1.0, 0.9, 0.7),
    vec3(0.0, 0.1, 0.25)
  );
  color += catalystColor * catalystGlow * (1.0 + u_bass * 2.0);

  // ── Energy field lines — radial from waist ──
  float fieldAngle = atan(fuv.y, fuv.x);
  float fieldLines = sin(fieldAngle * 12.0 + t * 2.0) * 0.5 + 0.5;
  fieldLines = pow(fieldLines, 6.0);
  float fieldFade = smoothstep(0.6, 0.1, waistDist);
  vec3 fieldColor = palette(
    fieldAngle * 0.3 + t * 0.05 + paletteShift + 0.4,
    vec3(0.3, 0.3, 0.5),
    vec3(0.2, 0.3, 0.4),
    vec3(0.7, 0.9, 1.0),
    vec3(0.0, 0.2, 0.5)
  );
  color += fieldColor * fieldLines * fieldFade * (0.15 + u_treble * 0.3);

  // ── Treble sparkle — reaction products ──
  float sparkle = snoise(uv * 30.0 + t * 3.0);
  sparkle = smoothstep(0.8, 1.0, sparkle) * u_treble;
  vec3 sparkleColor = palette(
    sparkle + paletteShift + 0.8,
    vec3(0.6, 0.6, 0.5),
    vec3(0.3, 0.3, 0.3),
    vec3(0.8, 0.9, 1.0),
    vec3(0.1, 0.2, 0.3)
  );
  color += sparkleColor * sparkle * 0.4;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
