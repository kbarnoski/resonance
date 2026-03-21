import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.25;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Two mirrored reaching forms — Sistine Chapel inspired
  // Left hand/form reaching from left
  vec2 leftBase = vec2(-0.55, -0.05);
  vec2 leftTip = vec2(-0.05, 0.02 + sin(t * 0.8) * 0.02);

  // Right hand/form reaching from right
  vec2 rightBase = vec2(0.55, 0.05);
  vec2 rightTip = vec2(0.05, -0.02 + sin(t * 0.8 + 0.5) * 0.02);

  // Arm/form as tapered distance field
  // Left form
  vec2 leftDir = normalize(leftTip - leftBase);
  float leftLen = length(leftTip - leftBase);
  vec2 leftPerp = vec2(-leftDir.y, leftDir.x);
  vec2 toLeft = uv - leftBase;
  float leftAlong = dot(toLeft, leftDir);
  float leftAcross = dot(toLeft, leftPerp);
  float leftTaper = mix(0.08, 0.015, smoothstep(0.0, leftLen, leftAlong));
  float leftDist = abs(leftAcross) - leftTaper;
  leftDist = max(leftDist, max(-leftAlong, leftAlong - leftLen));
  float leftGlow = smoothstep(0.015, 0.0, abs(leftDist));
  float leftFill = smoothstep(0.005, -0.01, leftDist);

  // Right form
  vec2 rightDir = normalize(rightTip - rightBase);
  float rightLen = length(rightTip - rightBase);
  vec2 rightPerp = vec2(-rightDir.y, rightDir.x);
  vec2 toRight = uv - rightBase;
  float rightAlong = dot(toRight, rightDir);
  float rightAcross = dot(toRight, rightPerp);
  float rightTaper = mix(0.08, 0.015, smoothstep(0.0, rightLen, rightAlong));
  float rightDist = abs(rightAcross) - rightTaper;
  rightDist = max(rightDist, max(-rightAlong, rightAlong - rightLen));
  float rightGlow = smoothstep(0.015, 0.0, abs(rightDist));
  float rightFill = smoothstep(0.005, -0.01, rightDist);

  // The gap between fingertips — the sacred space
  float gap = length(leftTip - rightTip);
  vec2 gapCenter = (leftTip + rightTip) * 0.5;
  float gapDist = length(uv - gapCenter);

  // Divine spark in the gap
  float spark = exp(-gapDist * 12.0) * (1.0 + u_bass * 0.8);
  // Electric arc between tips
  vec2 arcDir = normalize(rightTip - leftTip);
  vec2 arcPerp = vec2(-arcDir.y, arcDir.x);
  vec2 toGap = uv - leftTip;
  float arcAlong = dot(toGap, arcDir);
  float arcAcross = dot(toGap, arcPerp);
  float arcParam = arcAlong / gap;
  float arcWave = sin(arcParam * 20.0 + t * 8.0) * 0.02 * sin(arcParam * 3.14159);
  float arcDist = abs(arcAcross - arcWave);
  float arc = smoothstep(0.008, 0.0, arcDist)
            * step(0.0, arcParam) * step(arcParam, 1.0);
  arc *= u_amplitude * 1.5 + 0.3;

  // Secondary arcs
  float arc2Wave = sin(arcParam * 15.0 - t * 6.0 + 1.0) * 0.03 * sin(arcParam * 3.14159);
  float arc2Dist = abs(arcAcross - arc2Wave);
  float arc2 = smoothstep(0.006, 0.0, arc2Dist)
             * step(0.0, arcParam) * step(arcParam, 1.0);
  arc2 *= u_treble * 0.8;

  // Energy radiating from the gap
  float gapRays = pow(abs(cos(atan(uv.y - gapCenter.y, uv.x - gapCenter.x) * 6.0 + t * 2.0)), 8.0);
  gapRays *= exp(-gapDist * 4.0);
  gapRays *= u_mid * 0.6 + 0.2;

  // Particle stream flowing between the forms
  float particles = 0.0;
  for (int i = 0; i < 10; i++) {
    float pt = mod(float(i) * 0.1 + t * 0.3, 1.0);
    vec2 pp = mix(leftTip, rightTip, pt);
    pp.y += sin(pt * 6.28 + t * 3.0 + float(i)) * 0.03;
    float pd = length(uv - pp);
    particles += smoothstep(0.012, 0.003, pd);
  }
  particles *= u_amplitude * 0.8 + 0.2;

  // Background sacred geometry — soft mandorla around the gap
  float mandorla = length((uv - gapCenter) * vec2(1.0, 2.0));
  float mandorlaRing = abs(mandorla - 0.2) - 0.003;
  float mandorlaGlow = smoothstep(0.008, 0.0, abs(mandorlaRing));

  // FBM energy field
  float n = fbm(uv * 4.0 + t * 0.2);
  float energyField = abs(n) * exp(-gapDist * 2.0);

  // Left form palette — warm / earthy
  vec3 col1 = palette(
    leftAlong / leftLen + paletteShift,
    vec3(0.55, 0.4, 0.3),
    vec3(0.4, 0.35, 0.25),
    vec3(0.9, 0.7, 0.5),
    vec3(0.0, 0.1, 0.15)
  );

  // Right form palette — cool / ethereal
  vec3 col2 = palette(
    rightAlong / rightLen + paletteShift + 0.4,
    vec3(0.4, 0.45, 0.6),
    vec3(0.35, 0.4, 0.5),
    vec3(0.5, 0.7, 1.0),
    vec3(0.2, 0.3, 0.5)
  );

  // Spark / arc palette — divine gold-white
  vec3 col3 = palette(
    spark * 2.0 + t * 0.3 + paletteShift + 0.2,
    vec3(0.8, 0.75, 0.6),
    vec3(0.3, 0.3, 0.25),
    vec3(1.0, 0.9, 0.7),
    vec3(0.0, 0.05, 0.1)
  );

  vec3 color = vec3(0.0);

  // Left reaching form
  color += col1 * leftFill * 0.4;
  color += col1 * leftGlow * 1.5 * (0.7 + u_bass * 0.4);

  // Right reaching form
  color += col2 * rightFill * 0.4;
  color += col2 * rightGlow * 1.5 * (0.7 + u_bass * 0.4);

  // Divine spark
  color += col3 * spark * 2.0;

  // Electric arcs
  color += col3 * arc * 2.0;
  color += col2 * arc2 * 1.0;

  // Gap rays
  color += col3 * gapRays * 0.6;

  // Particles
  color += col3 * particles * 1.0;

  // Mandorla
  color += col3 * mandorlaGlow * 0.5;

  // Energy field
  color += col3 * energyField * 0.3 * (0.5 + u_mid * 0.5);

  // Emissive at near-touch point
  float touchGlow = exp(-gapDist * 20.0);
  color += vec3(1.5, 1.4, 1.2) * touchGlow * u_amplitude;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
