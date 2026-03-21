import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  vec2 uvScreen = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.06;
  float paletteShift = u_amplitude * 0.25;

  // Storm center — slightly off-center for dynamism
  vec2 eyeCenter = vec2(sin(u_time * 0.1) * 0.05, cos(u_time * 0.08) * 0.04);
  vec2 centered = uv - eyeCenter;
  float dist = length(centered);
  float angle = atan(centered.y, centered.x);

  // Spiral arm rotation — distance-dependent angular offset
  float spiralTwist = 3.0 + u_bass * 1.5;
  float spiralAngle = angle + dist * spiralTwist - u_time * 0.5;

  // Base ocean color beneath
  vec3 oceanColor = palette(0.6 + paletteShift,
    vec3(0.02, 0.05, 0.12), vec3(0.05, 0.08, 0.15),
    vec3(1.0, 1.0, 1.0), vec3(0.55, 0.6, 0.75));
  vec3 color = oceanColor;

  // Cloud spiral bands — multiple arms
  float cloudDensity = 0.0;
  for (int arm = 0; arm < 4; arm++) {
    float fArm = float(arm);
    float armOffset = fArm * 1.5708; // pi/2 spacing
    float armAngle = spiralAngle + armOffset;

    // Spiral arm shape — sinusoidal modulation
    float armShape = sin(armAngle * 2.0) * 0.5 + 0.5;
    armShape = smoothstep(0.2, 0.8, armShape);

    // Arm width varies with distance
    float armWidth = 0.3 + dist * 0.2;
    armShape *= smoothstep(0.0, armWidth, dist) * smoothstep(0.9, 0.4, dist);

    // Turbulence within the arm
    vec2 armUV = vec2(armAngle + fArm * 5.0, dist * 5.0);
    float armTurb = fbm(armUV + t * 0.5);
    armShape *= smoothstep(-0.1, 0.3, armTurb);

    cloudDensity += armShape * (0.3 - fArm * 0.04);
  }
  cloudDensity = clamp(cloudDensity, 0.0, 1.0);

  // Cloud coloring — brighter tops, darker bases
  vec3 cloudBright = palette(cloudDensity * 0.3 + 0.35 + paletteShift,
    vec3(0.45, 0.48, 0.55), vec3(0.2, 0.18, 0.15),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.65));
  vec3 cloudDark = palette(0.42 + paletteShift,
    vec3(0.15, 0.18, 0.25), vec3(0.12, 0.1, 0.1),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.7));

  // Cloud texture noise
  vec2 cloudTexUV = centered * 5.0;
  cloudTexUV = rot2(dist * 2.0 - u_time * 0.3) * cloudTexUV;
  float cloudTex = fbm(cloudTexUV + t) * 0.5 + 0.5;

  vec3 cloudColor = mix(cloudDark, cloudBright, cloudTex);
  color = mix(color, cloudColor, cloudDensity);

  // Outer rainbands — concentric arcs
  for (int band = 0; band < 5; band++) {
    float fBand = float(band);
    float bandRadius = 0.35 + fBand * 0.12;
    float bandWidth = 0.03 + u_mid * 0.015;
    float bandNoise = snoise(vec2(angle * 3.0 + fBand * 7.0, fBand + t * 0.3)) * 0.04;
    float bandDist = abs(dist - bandRadius + bandNoise);
    float rainband = smoothstep(bandWidth, 0.0, bandDist);
    rainband *= smoothstep(0.3, 0.5, cloudDensity + 0.2); // only where clouds exist

    vec3 bandColor = palette(fBand * 0.1 + 0.38 + paletteShift,
      vec3(0.3, 0.33, 0.4), vec3(0.15, 0.12, 0.1),
      vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.65));
    color = mix(color, bandColor, rainband * 0.3);
  }

  // Eye of the storm — clear center
  float eyeRadius = 0.08 + u_bass * 0.03;
  float eyeWall = smoothstep(eyeRadius + 0.05, eyeRadius, dist);
  float eyeClear = smoothstep(eyeRadius, eyeRadius * 0.3, dist);

  // Eye wall — densest clouds around the eye
  vec3 eyeWallColor = palette(0.4 + paletteShift,
    vec3(0.5, 0.52, 0.6), vec3(0.2, 0.18, 0.15),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.65));
  float wallIntensity = smoothstep(eyeRadius + 0.08, eyeRadius + 0.01, dist) *
                        smoothstep(eyeRadius - 0.02, eyeRadius + 0.01, dist);
  color = mix(color, eyeWallColor, wallIntensity * 0.6);

  // Ocean visible through the eye
  vec3 eyeOcean = palette(0.58 + paletteShift,
    vec3(0.05, 0.1, 0.2), vec3(0.08, 0.1, 0.15),
    vec3(1.0, 1.0, 1.0), vec3(0.55, 0.6, 0.75));
  // Slight wave texture in the eye
  float eyeWaves = snoise(centered * 30.0 + t * 2.0) * 0.05;
  eyeOcean += eyeWaves;
  color = mix(color, eyeOcean, eyeClear);

  // Lightning in the outer bands — treble + bass reactive
  float lightningZone = smoothstep(0.15, 0.3, dist) * smoothstep(0.8, 0.5, dist);
  lightningZone *= cloudDensity;

  float lightningFlash = 0.0;
  for (int l = 0; l < 4; l++) {
    float fl = float(l);
    float flashTrigger = step(0.92, fract(sin(floor(u_time * 15.0 + fl * 47.0) * 127.1) * 43758.5453));
    float flashAngle = fract(sin(fl * 311.7 + floor(u_time * 8.0)) * 43758.5453) * 6.28;
    float flashDist = 0.2 + fract(sin(fl * 173.3 + floor(u_time * 8.0)) * 12345.6) * 0.4;

    vec2 flashPos = vec2(cos(flashAngle), sin(flashAngle)) * flashDist + eyeCenter;
    float flashRadius = 0.05 + u_bass * 0.03;
    float flash = smoothstep(flashRadius, 0.0, length(uv - flashPos));
    lightningFlash += flash * flashTrigger;
  }

  vec3 lightningColor = palette(0.65 + paletteShift,
    vec3(0.7, 0.7, 0.9), vec3(0.2, 0.2, 0.15),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.7));
  color += lightningFlash * lightningColor * lightningZone * (0.5 + u_treble);

  // Cloud top highlights — simulated sunlight from one direction
  vec2 lightDir = normalize(vec2(0.7, 0.5));
  float lightDot = dot(normalize(centered), lightDir);
  float topLight = smoothstep(-0.2, 0.5, lightDot) * cloudDensity * 0.15;
  vec3 sunlitCloud = palette(0.3 + paletteShift,
    vec3(0.55, 0.55, 0.6), vec3(0.15, 0.12, 0.1),
    vec3(1.0, 1.0, 1.0), vec3(0.5, 0.55, 0.6));
  color = mix(color, sunlitCloud, topLight);

  // Mid-reactive feeder bands — darker streaks flowing inward
  float feeder = snoise(vec2(spiralAngle * 4.0, dist * 6.0 - u_time * 1.0));
  feeder = smoothstep(0.3, 0.6, feeder) * cloudDensity * u_mid * 0.15;
  color -= feeder * 0.1;

  // Atmospheric glow near eye wall
  float eyeGlow = smoothstep(0.2, 0.08, abs(dist - eyeRadius - 0.02));
  eyeGlow *= 0.1;
  color += eyeGlow * eyeWallColor;

  // Rotation blur — slight angular smear effect
  float motionBlur = snoise(vec2(angle * 8.0 - u_time * 2.0, dist * 3.0));
  motionBlur = smoothstep(0.4, 0.7, motionBlur) * 0.05 * cloudDensity;
  color += motionBlur * cloudBright;

  // Overall atmospheric tint
  color = mix(color, color * vec3(0.9, 0.92, 1.05), 0.2);

  // Vignette
  float vig = 1.0 - dot(uvScreen - 0.5, uvScreen - 0.5) * 1.8;
  vig = clamp(vig, 0.0, 1.0);
  color *= vig;

  gl_FragColor = vec4(color, 1.0);
}
`;
