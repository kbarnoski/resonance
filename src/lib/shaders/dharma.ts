import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

// Wheel of becoming: 8-spoke wheel with fbm energy flowing along spokes,
// rim glowing, center void, the wheel slowly turns and breathes.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  vec3 color = vec3(0.0);

  // Wheel rotation - slow majestic turn
  float wheelRot = t * 0.4;
  vec2 wuv = rot2(wheelRot) * uv;
  float wa = atan(wuv.y, wuv.x);

  // Breathing: wheel expands/contracts
  float breath = 1.0 + 0.04 * sin(t * 1.5) + 0.06 * u_bass;

  // Outer rim
  float rimR = 0.55 * breath;
  float rimWidth = 0.025 + 0.008 * u_mid;
  float rim = smoothstep(rimWidth, 0.0, abs(r - rimR));

  // Inner rim
  float innerRimR = 0.5 * breath;
  float innerRim = smoothstep(0.012, 0.0, abs(r - innerRimR));

  // Hub circle
  float hubR = 0.12 * breath;
  float hub = smoothstep(0.01, 0.0, abs(r - hubR));

  // Inner hub
  float innerHubR = 0.08 * breath;
  float innerHub = smoothstep(0.008, 0.0, abs(r - innerHubR));

  // Rim color
  vec3 rimCol = palette(
    paletteShift + t * 0.1,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.4),
    vec3(1.0, 0.8, 0.5),
    vec3(0.0, 0.15, 0.3)
  );

  // Energy color for fbm flows
  vec3 energyCol = palette(
    paletteShift + 0.3,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.4, 0.5),
    vec3(0.7, 1.0, 0.9),
    vec3(0.2, 0.0, 0.3)
  );

  // Glow along the rim - energy traveling around
  float rimEnergy = fbm(vec2(wa * 2.0 + t * 2.0, r * 5.0));
  rimEnergy = smoothstep(-0.1, 0.5, rimEnergy);
  float rimZone = smoothstep(0.06, 0.0, abs(r - rimR * 1.02)) * 0.5;

  color += rimCol * rim * 1.8 * (0.7 + 0.4 * u_amplitude);
  color += rimCol * innerRim * 1.2;
  color += energyCol * rimEnergy * rimZone * (0.6 + 0.5 * u_mid);

  // 8 spokes
  float spokeCount = 8.0;
  float spokeSector = 6.28318 / spokeCount;

  for (int s = 0; s < 8; s++) {
    float fs = float(s);
    float spokeAngle = fs * spokeSector;

    // Spoke line using sdLine from hub to rim
    vec2 spokeStart = vec2(cos(spokeAngle + wheelRot), sin(spokeAngle + wheelRot)) * hubR;
    vec2 spokeEnd = vec2(cos(spokeAngle + wheelRot), sin(spokeAngle + wheelRot)) * innerRimR;
    float spoke = sdLine(uv, spokeStart, spokeEnd);
    float spokeLine = smoothstep(0.008 + 0.003 * u_bass, 0.0, spoke);

    // Energy flowing along the spoke (hub to rim)
    float spokeDir = dot(uv, vec2(cos(spokeAngle + wheelRot), sin(spokeAngle + wheelRot)));
    float flowPhase = fract(t * 0.8 + fs * 0.125 + u_bass * 0.3);
    float spokeR = length(uv);
    float flowPos = mix(hubR, innerRimR, flowPhase);
    float flow = smoothstep(0.06, 0.0, abs(spokeR - flowPos)) * smoothstep(0.015, 0.0, spoke);

    // FBM texture along spoke
    float spokeFBM = fbm(vec2(spokeDir * 10.0 + t * 2.0, spoke * 50.0 + fs * 3.0));
    spokeFBM = smoothstep(-0.1, 0.4, spokeFBM) * smoothstep(0.03, 0.0, spoke);
    float spokeMask = smoothstep(hubR * 0.8, hubR * 1.2, spokeR) * smoothstep(innerRimR * 1.1, innerRimR * 0.9, spokeR);

    // Each spoke gets slightly shifted color
    vec3 spokeCol = palette(
      fs * 0.12 + paletteShift + 0.15,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.5),
      vec3(1.0, 0.7, 0.5),
      vec3(0.0, 0.2, 0.35)
    );

    color += spokeCol * spokeLine * (0.8 + 0.3 * u_mid);
    color += energyCol * flow * 1.5 * (0.5 + 0.5 * u_treble);
    color += spokeCol * spokeFBM * spokeMask * 0.3 * (0.6 + 0.4 * u_amplitude);
  }

  // Hub and inner structure
  color += rimCol * hub * 1.5;
  color += rimCol * innerHub * 1.0;

  // Center void: deep dark with subtle activity
  float voidMask = smoothstep(innerHubR, 0.0, r);
  float voidPattern = snoise(uv * 20.0 + t * 0.5);
  voidPattern = voidPattern * 0.5 + 0.5;
  vec3 voidCol = palette(
    voidPattern * 0.5 + t * 0.2 + paletteShift,
    vec3(0.1, 0.05, 0.15),
    vec3(0.15, 0.1, 0.2),
    vec3(0.5, 0.3, 0.8),
    vec3(0.6, 0.0, 0.4)
  );
  color += voidCol * voidMask * 0.3 * (0.5 + 0.5 * u_bass);

  // Decorative arcs between spokes (crescent shapes)
  float arcAngle = mod(wa, spokeSector) - spokeSector * 0.5;
  float arcR = 0.33 * breath;
  float arc = abs(length(wuv - vec2(cos(wa - arcAngle), sin(wa - arcAngle)) * 0.05) - arcR) - 0.003;
  float arcLine = smoothstep(0.005, 0.0, arc) * smoothstep(0.15, 0.3, abs(arcAngle));
  float arcMask = smoothstep(hubR * 1.3, hubR * 1.8, r) * smoothstep(innerRimR * 0.9, innerRimR * 0.7, r);
  color += energyCol * arcLine * arcMask * 0.6;

  // Treble sparkle along rim
  float sparkle = sin(wa * 40.0 + t * 8.0 + r * 30.0);
  sparkle = pow(max(sparkle, 0.0), 8.0) * u_treble;
  float sparkleMask = smoothstep(0.04, 0.0, abs(r - rimR));
  color += vec3(1.3, 1.2, 1.1) * sparkle * sparkleMask * 0.5;

  // Outer aura: faint glow beyond the rim
  float aura = smoothstep(rimR + 0.3, rimR + 0.02, r) * smoothstep(rimR - 0.02, rimR + 0.05, r);
  float auraNoise = fbm(vec2(a * 2.0 + t * 0.5, r * 3.0));
  color += rimCol * aura * max(auraNoise, 0.0) * 0.2 * (0.5 + 0.5 * u_amplitude);

  // Vignette
  color *= smoothstep(1.4, 0.3, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
