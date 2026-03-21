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
  float t = u_time * 0.15;

  // Heartbeat rhythm — systole/diastole cycle
  float heartRate = 1.2 + u_bass * 0.8;
  float heartPhase = t * heartRate;
  float systole = pow(sin(heartPhase) * 0.5 + 0.5, 3.0);
  float diastole = 1.0 - systole;

  // Chamber shape — pulsing organic cavity
  vec2 p = uv * rot2(t * 0.02);
  float chamberScale = 1.0 + systole * 0.15;
  p *= chamberScale;

  // Organic distortion of chamber walls
  float wallWarp = fbm(p * 3.0 + vec2(t * 0.1, 0.0));
  float wallWarp2 = fbm(p * 5.0 + vec2(0.0, t * 0.08) + 7.3);

  // Chamber as deformed ellipse
  vec2 chamberP = p;
  chamberP.x *= 1.3;
  chamberP += vec2(wallWarp, wallWarp2) * 0.12;
  float chamberDist = length(chamberP) - 0.35;

  // Wall thickness with organic variation
  float wallThickness = 0.2 + wallWarp * 0.08 + u_mid * 0.05;
  float wallOuter = chamberDist - wallThickness;
  float inWall = smoothstep(0.01, -0.01, chamberDist) * smoothstep(-0.01, 0.01, chamberDist + wallThickness);
  float inChamber = smoothstep(0.01, -0.01, chamberDist);

  // Muscle fiber texture — striated
  float fibers = sin(atan(p.y, p.x) * 15.0 + wallWarp * 8.0 + t * 0.3) * 0.5 + 0.5;
  fibers *= sin(length(p) * 40.0 + wallWarp2 * 5.0) * 0.5 + 0.5;

  // Endocardium — inner lining texture
  float lining = fbm(chamberP * 12.0 + t * 0.05);

  // Colors
  // Myocardium — deep red muscle
  vec3 muscleColor = palette(
    fibers * 0.4 + wallWarp * 0.3 + t * 0.02,
    vec3(0.45, 0.08, 0.08),
    vec3(0.3, 0.06, 0.05),
    vec3(0.9, 0.15, 0.1),
    vec3(0.0, 0.08, 0.05)
  );

  // Endocardium — slightly paler, glistening
  vec3 liningColor = palette(
    lining * 0.5 + t * 0.03,
    vec3(0.55, 0.2, 0.2),
    vec3(0.2, 0.1, 0.1),
    vec3(0.8, 0.3, 0.25),
    vec3(0.0, 0.1, 0.15)
  );

  // Blood in chamber — darker flowing red
  vec3 bloodColor = palette(
    fbm(p * 4.0 + t * 0.3) * 0.4 + t * 0.02,
    vec3(0.3, 0.02, 0.02),
    vec3(0.2, 0.02, 0.01),
    vec3(0.7, 0.08, 0.05),
    vec3(0.0, 0.05, 0.1)
  );

  // Compose
  vec3 color = vec3(0.02, 0.01, 0.01);

  // Blood filling chamber
  float bloodFlow = fbm(p * 6.0 + vec2(0.0, -t * 0.5));
  color = mix(color, bloodColor, inChamber * (0.7 + bloodFlow * 0.3));

  // Inner lining
  float liningMask = smoothstep(0.02, -0.02, chamberDist) * smoothstep(-wallThickness - 0.02, -wallThickness + 0.06, chamberDist);
  color = mix(color, liningColor, liningMask * 0.8);

  // Muscle wall
  color = mix(color, muscleColor, inWall);
  color += muscleColor * fibers * inWall * 0.15;

  // Contraction glow during systole
  float contractionGlow = systole * inWall;
  color += vec3(0.5, 0.1, 0.05) * contractionGlow * 0.3 * u_bass;

  // Blood turbulence — flow patterns inside
  float turbulence = sin(fbm(p * 8.0 - vec2(0.0, t * 0.8)) * 10.0) * 0.5 + 0.5;
  color += bloodColor * turbulence * inChamber * 0.2 * diastole;

  // Treble — valve flutter sparkle
  float valve = pow(snoise(p * 20.0 + t * 3.0) * 0.5 + 0.5, 10.0);
  color += vec3(0.6, 0.15, 0.1) * valve * u_treble * inWall * 0.4;

  color *= 0.85 + u_amplitude * 0.2;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
