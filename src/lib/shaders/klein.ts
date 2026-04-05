import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Klein bottle immersion in 3D (figure-8 parametrization)
// Returns distance to the Klein bottle surface
float kleinSDF(vec3 p, float time) {
  // Rotate for tumbling effect
  p.xz = rot2(time * 0.2) * p.xz;
  p.yz = rot2(time * 0.15) * p.yz;

  // Scale
  p *= 1.5;

  // Klein bottle via closest-point sampling on parametric surface
  // Figure-8 Klein bottle parametrization
  float minD = 100.0;

  for (int i = 0; i < 24; i++) {
    float u = float(i) / 24.0 * 6.28318;
    for (int j = 0; j < 16; j++) {
      float v = float(j) / 16.0 * 6.28318;

      // Figure-8 Klein bottle
      float r = 0.6;
      float a = cos(u) * (r + cos(u * 0.5) * sin(v) - sin(u * 0.5) * sin(2.0 * v));
      float b = sin(u) * (r + cos(u * 0.5) * sin(v) - sin(u * 0.5) * sin(2.0 * v));
      float c = sin(u * 0.5) * sin(v) + cos(u * 0.5) * sin(2.0 * v);

      vec3 surfP = vec3(a, b, c) * 0.7;
      float d = length(p - surfP);
      minD = min(minD, d);
    }
  }
  return minD;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Camera
  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(uv, -1.3));

  // Orbit camera
  ro.xz = rot2(t * 0.25) * ro.xz;
  ro.yz = rot2(sin(t * 0.15) * 0.3) * ro.yz;
  rd.xz = rot2(t * 0.25) * rd.xz;
  rd.yz = rot2(sin(t * 0.15) * 0.3) * rd.yz;

  vec3 color = vec3(0.0);

  // Sample along ray — find closest approach to Klein bottle
  float minDist = 100.0;
  float bestRayT = 0.0;
  vec3 bestP = vec3(0.0);

  for (int i = 0; i < 32; i++) {
    float rayT = float(i) * 0.18;
    vec3 p = ro + rd * rayT;

    // Simplified Klein: use parametric tube distance
    // Rotate for tumbling
    vec3 rp = p;
    rp.xz = rot2(t * 0.2) * rp.xz;
    rp.yz = rot2(t * 0.15) * rp.yz;
    rp *= 1.3;

    // Figure-8 Klein bottle: approximate distance using key cross-sections
    float u_param = atan(rp.y, rp.x);
    float r_klein = 0.6;
    float halfU = u_param * 0.5;

    // Expected center of tube at this angle
    float expectedR = r_klein + cos(halfU) * 0.3;
    float xyLen = length(rp.xy);
    float tubeCenter = abs(xyLen - expectedR);

    // Z-component check
    float expectedZ = sin(halfU) * 0.3;
    float zDist = abs(rp.z - expectedZ);

    float d = length(vec2(tubeCenter, zDist)) - 0.15;

    if (d < minDist) {
      minDist = d;
      bestRayT = rayT;
      bestP = rp;
    }
  }

  // Tube glow
  float tubeR = 0.15 + u_bass * 0.02;
  float surfaceGlow = exp(-max(minDist, 0.0) * 6.0);
  float surfaceCore = smoothstep(tubeR * 0.5, 0.0, max(minDist, 0.0));

  // Parametric coordinate for color
  float paramU = atan(bestP.y, bestP.x);
  float paramV = atan(bestP.z, length(bestP.xy) - 0.6);

  // Light tubes — flowing color along surface
  float flow = sin(paramU * 4.0 - t * 3.0) * 0.5 + 0.5;
  float flow2 = sin(paramV * 6.0 + t * 2.0 + paramU * 2.0) * 0.5 + 0.5;

  vec3 col1 = palette(
    paramU * 0.3 + t * 0.3 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.4, 0.6),
    vec3(0.8, 1.0, 0.5),
    vec3(0.0, 0.15, 0.4)
  );
  vec3 col2 = palette(
    paramV * 0.4 + t * 0.2 + paletteShift + 0.5,
    vec3(0.5, 0.4, 0.4),
    vec3(0.4, 0.5, 0.3),
    vec3(1.0, 0.7, 0.4),
    vec3(0.1, 0.05, 0.3)
  );

  // Depth fade
  float depthFade = exp(-bestRayT * 0.12);

  color += col1 * surfaceGlow * 0.4 * depthFade;
  color += col1 * surfaceCore * 0.8 * depthFade;
  color += col2 * flow * surfaceCore * 0.5 * depthFade;
  color += col1 * flow2 * surfaceGlow * 0.3 * depthFade;

  // Self-intersection highlight — where the surface passes through itself
  float selfIntersect = smoothstep(0.1, 0.0, minDist) * smoothstep(0.15, 0.05, abs(bestP.z));
  vec3 isectCol = palette(
    t * 0.5 + paletteShift + 0.3,
    vec3(0.7, 0.7, 0.7),
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.9, 1.0),
    vec3(0.0, 0.05, 0.25)
  );
  color += isectCol * selfIntersect * 0.4;

  // Audio
  color += col1 * surfaceCore * u_treble * 0.4 * depthFade;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
