import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Torus SDF
float sdTorus(vec3 p, float R, float r) {
  return length(vec2(length(p.xz) - R, p.y)) - r;
}

// Normal via central differences
vec3 torusNormal(vec3 p, float R, float r) {
  float e = 0.001;
  float d = sdTorus(p, R, r);
  return normalize(vec3(
    sdTorus(p + vec3(e,0,0), R, r) - d,
    sdTorus(p + vec3(0,e,0), R, r) - d,
    sdTorus(p + vec3(0,0,e), R, r) - d
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Camera setup
  vec3 ro = vec3(0.0, 1.2, 3.5);
  vec3 rd = normalize(vec3(uv, -1.5));

  // Rotate camera around torus
  float camAngle = t * 0.4;
  ro.xz = rot2(camAngle) * ro.xz;
  rd.xz = rot2(camAngle) * rd.xz;

  // Tilt
  float tilt = sin(t * 0.25) * 0.3 + u_bass * 0.1;
  ro.yz = rot2(tilt) * ro.yz;
  rd.yz = rot2(tilt) * rd.yz;

  float R = 1.0; // major radius
  float r = 0.35 + u_mid * 0.05; // minor radius

  vec3 color = vec3(0.0);

  // Raymarch the torus
  float dist = 0.0;
  bool hit = false;
  vec3 p;
  for (int i = 0; i < 40; i++) {
    p = ro + rd * dist;
    float d = sdTorus(p, R, r);
    if (d < 0.001) { hit = true; break; }
    if (dist > 8.0) break;
    dist += d;
  }

  if (hit) {
    vec3 n = torusNormal(p, R, r);

    // UV coordinates on torus surface
    // theta: angle around major circle, phi: angle around minor circle
    float theta = atan(p.z, p.x);
    vec2 q = vec2(length(p.xz) - R, p.y);
    float phi = atan(q.y, q.x);

    // Grid lines along both parametric directions
    float gridTheta = abs(fract(theta * 8.0 / 6.28318) - 0.5);
    float gridPhi = abs(fract(phi * 12.0 / 6.28318) - 0.5);

    float wireTheta = smoothstep(0.04, 0.0, gridTheta);
    float wirePhi = smoothstep(0.04, 0.0, gridPhi);
    float wire = max(wireTheta, wirePhi);

    // Flowing light along the surface
    float flow1 = sin(theta * 3.0 - t * 4.0 + phi * 2.0) * 0.5 + 0.5;
    float flow2 = sin(phi * 5.0 + t * 3.0 - theta * 1.5) * 0.5 + 0.5;

    // Surface palette
    vec3 surfCol = palette(
      theta * 0.5 + phi * 0.3 + t * 0.3 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.6),
      vec3(0.7, 1.0, 0.5),
      vec3(0.0, 0.1, 0.4)
    );

    vec3 flowCol = palette(
      flow1 + t * 0.2 + paletteShift + 0.3,
      vec3(0.6, 0.5, 0.5),
      vec3(0.5, 0.5, 0.4),
      vec3(1.0, 0.8, 0.4),
      vec3(0.05, 0.1, 0.2)
    );

    // Lighting
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 16.0);
    float fresnel = pow(1.0 - abs(dot(n, -rd)), 3.0);

    // Compose
    color += surfCol * diff * 0.3;
    color += surfCol * wire * 0.8;
    color += flowCol * (flow1 * flow2) * 0.5;
    color += vec3(0.8, 0.85, 1.0) * spec * 0.4;
    color += surfCol * fresnel * 0.5;

    // Audio: treble brightens wire
    color += surfCol * wire * u_treble * 0.5;
  }

  // Ambient glow around torus
  float glowDist = sdTorus(ro + rd * clamp(dist, 0.0, 6.0), R, r);
  float ambientGlow = exp(-glowDist * 2.5) * 0.15;
  vec3 glowCol = palette(
    t * 0.15 + paletteShift + 0.6,
    vec3(0.3, 0.3, 0.4),
    vec3(0.3, 0.3, 0.4),
    vec3(0.5, 0.7, 1.0),
    vec3(0.1, 0.1, 0.3)
  );
  color += glowCol * ambientGlow;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
