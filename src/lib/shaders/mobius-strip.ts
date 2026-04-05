import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Camera
  vec3 ro = vec3(0.0, 1.5, 3.0);
  vec3 rd = normalize(vec3(uv, -1.4));

  // Orbit camera around the strip
  float camAngle = t * 0.3;
  ro.xz = rot2(camAngle) * ro.xz;
  rd.xz = rot2(camAngle) * rd.xz;

  float tilt = sin(t * 0.2) * 0.2;
  ro.yz = rot2(tilt) * ro.yz;
  rd.yz = rot2(tilt) * rd.yz;

  vec3 color = vec3(0.0);

  // Mobius strip parametric surface
  // x = (R + s*cos(theta/2)) * cos(theta)
  // y = (R + s*cos(theta/2)) * sin(theta)
  // z = s * sin(theta/2)
  // theta in [0, 2*PI], s in [-w, w]
  float R = 1.0;
  float w = 0.35 + u_bass * 0.03;

  // Find closest point on Mobius strip to ray
  float minDist = 100.0;
  float bestRayT = 0.0;
  float bestTheta = 0.0;
  float bestS = 0.0;

  for (int i = 0; i < 36; i++) {
    float rayT = float(i) * 0.16;
    vec3 p = ro + rd * rayT;

    // Check against sampled points on Mobius strip
    for (int j = 0; j < 24; j++) {
      float theta = float(j) / 24.0 * 6.28318;
      float halfTheta = theta * 0.5;
      float cosHT = cos(halfTheta);
      float sinHT = sin(halfTheta);

      // Center of strip at this theta
      vec3 center = vec3(R * cos(theta), R * sin(theta), 0.0);

      // Strip normal direction (the s-direction)
      vec3 sDir = vec3(cosHT * cos(theta), cosHT * sin(theta), sinHT);

      // Distance from p to the line through center in sDir direction
      vec3 diff = p - center;
      float proj = dot(diff, sDir);
      float sVal = clamp(proj, -w, w);
      vec3 closest = center + sDir * sVal;
      float d = length(p - closest);

      if (d < minDist) {
        minDist = d;
        bestRayT = rayT;
        bestTheta = theta;
        bestS = sVal;
      }
    }
  }

  // Strip thickness
  float stripThick = 0.06;
  float surfaceGlow = exp(-max(minDist - stripThick * 0.5, 0.0) * 10.0);
  float surfaceCore = smoothstep(stripThick, 0.0, minDist);

  // Light traveling along the surface — it must go around TWICE
  // because Mobius strip has one side
  float travel = mod(bestTheta - t * 2.5, 6.28318 * 2.0);
  float lightPulse = exp(-mod(travel, 3.14159) * 2.0) * 0.8;
  float lightPulse2 = exp(-mod(travel + 1.5, 3.14159) * 2.0) * 0.6;

  // Edge glow along strip width
  float edgeDist = abs(abs(bestS) - w);
  float edgeGlow = smoothstep(0.08, 0.0, edgeDist);

  // Grid lines on surface
  float gridTheta = abs(fract(bestTheta * 8.0 / 6.28318) - 0.5);
  float gridS = abs(fract((bestS + w) / (2.0 * w) * 4.0) - 0.5);
  float grid = smoothstep(0.04, 0.0, gridTheta) + smoothstep(0.04, 0.0, gridS);
  grid = min(grid, 1.0);

  // Colors
  vec3 surfCol = palette(
    bestTheta * 0.3 + t * 0.25 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.4, 0.6),
    vec3(0.7, 1.0, 0.5),
    vec3(0.0, 0.1, 0.4)
  );
  vec3 lightCol = palette(
    bestTheta * 0.5 + t * 0.6 + paletteShift + 0.3,
    vec3(0.7, 0.7, 0.6),
    vec3(0.5, 0.5, 0.4),
    vec3(1.0, 0.8, 0.4),
    vec3(0.05, 0.1, 0.2)
  );
  vec3 edgeCol = palette(
    t * 0.3 + paletteShift + 0.6,
    vec3(0.6, 0.6, 0.7),
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.9, 1.0),
    vec3(0.0, 0.05, 0.3)
  );

  // Depth fade
  float depthFade = exp(-bestRayT * 0.1);

  // Compose
  color += surfCol * surfaceGlow * 0.3 * depthFade;
  color += surfCol * surfaceCore * 0.4 * depthFade;
  color += surfCol * grid * surfaceCore * 0.4 * depthFade;
  color += lightCol * (lightPulse + lightPulse2) * surfaceCore * depthFade;
  color += edgeCol * edgeGlow * surfaceCore * 0.5 * depthFade;

  // Audio
  color += lightCol * surfaceCore * u_treble * 0.4 * depthFade;
  color += surfCol * lightPulse * u_mid * 0.3 * depthFade;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
