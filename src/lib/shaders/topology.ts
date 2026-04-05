import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Smooth minimum for blending SDFs
float smin_t(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Sphere SDF
float sdSphere3(vec3 p, float r) {
  return length(p) - r;
}

// Torus SDF
float sdTorus3(vec3 p, float R, float r) {
  return length(vec2(length(p.xz) - R, p.y)) - r;
}

// Morphing topological surface: genus-0 (sphere) to genus-1 (torus)
float topoSDF(vec3 p, float morph) {
  // Sphere (genus-0)
  float sphere = sdSphere3(p, 0.8);

  // Torus (genus-1)
  float torus = sdTorus3(p, 0.7, 0.3);

  // Intermediate: sphere with dimple growing into hole
  // Create the hole by subtracting a cylinder that grows
  float holeR = morph * 0.5;
  float cylinder = length(p.xz) - holeR;
  float hole = max(cylinder, abs(p.y) - 1.0);

  // Blend between sphere and torus
  float surface = mix(sphere, torus, smoothstep(0.3, 0.7, morph));

  // During transition, subtract growing hole from sphere
  float transition = smoothstep(0.0, 0.5, morph) * smoothstep(1.0, 0.5, morph);
  if (transition > 0.01) {
    surface = max(surface, -hole * transition * 3.0);
  }

  return surface;
}

// Normal estimation
vec3 topoNormal(vec3 p, float morph) {
  float e = 0.002;
  float d = topoSDF(p, morph);
  return normalize(vec3(
    topoSDF(p + vec3(e,0,0), morph) - d,
    topoSDF(p + vec3(0,e,0), morph) - d,
    topoSDF(p + vec3(0,0,e), morph) - d
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  // Camera
  vec3 ro = vec3(0.0, 1.0, 2.8);
  vec3 rd = normalize(vec3(uv, -1.4));

  // Orbit
  float camAngle = t * 0.35;
  ro.xz = rot2(camAngle) * ro.xz;
  rd.xz = rot2(camAngle) * rd.xz;
  float tiltAngle = sin(t * 0.2) * 0.25;
  ro.yz = rot2(tiltAngle) * ro.yz;
  rd.yz = rot2(tiltAngle) * rd.yz;

  // Morph parameter: oscillates between 0 (sphere) and 1 (torus)
  float morph = sin(t * 0.5) * 0.5 + 0.5;
  morph = smoothstep(0.0, 1.0, morph); // ease

  vec3 color = vec3(0.0);

  // Raymarch
  float dist = 0.0;
  bool hit = false;
  vec3 p;
  for (int i = 0; i < 40; i++) {
    p = ro + rd * dist;
    float d = topoSDF(p, morph);
    if (abs(d) < 0.002) { hit = true; break; }
    if (dist > 6.0) break;
    dist += d * 0.8;
  }

  if (hit) {
    vec3 n = topoNormal(p, morph);

    // Curvature visualization: mean curvature approximation
    float curvSample = 0.02;
    float curvature = topoSDF(p + n * curvSample, morph) - topoSDF(p, morph);
    curvature /= curvSample;

    // UV coordinates from normal
    float theta = atan(p.z, p.x);
    float phi = asin(clamp(p.y / length(p), -1.0, 1.0));

    // Grid lines
    float gridA = abs(fract(theta * 6.0 / 6.28318) - 0.5);
    float gridB = abs(fract(phi * 8.0 / 3.14159) - 0.5);
    float grid = smoothstep(0.04, 0.0, min(gridA, gridB));

    // Contour lines of morph field
    float contour = abs(fract(length(p) * 5.0 + morph * 3.0) - 0.5);
    float contourLine = smoothstep(0.04, 0.0, contour);

    // Lighting
    vec3 lightDir = normalize(vec3(0.6, 1.0, 0.8));
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 24.0);
    float fresnel = pow(1.0 - abs(dot(n, -rd)), 3.0);

    // Colors
    vec3 surfCol = palette(
      curvature * 2.0 + theta * 0.2 + t * 0.3 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.6),
      vec3(0.7, 1.0, 0.5),
      vec3(0.0, 0.1, 0.4)
    );
    vec3 gridCol = palette(
      theta * 0.3 + t * 0.2 + paletteShift + 0.5,
      vec3(0.6, 0.6, 0.6),
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.9, 1.0),
      vec3(0.0, 0.05, 0.25)
    );

    // Compose surface
    color += surfCol * diff * 0.4;
    color += surfCol * 0.08; // ambient
    color += gridCol * grid * 0.6;
    color += gridCol * contourLine * 0.3;
    color += vec3(0.8, 0.85, 1.0) * spec * 0.5;
    color += surfCol * fresnel * 0.4;

    // Audio: morph responds to mid
    color += surfCol * u_mid * 0.15;
    color += gridCol * grid * u_treble * 0.3;
  }

  // Ambient glow
  float nearDist = topoSDF(ro + rd * clamp(dist, 0.0, 5.0), morph);
  float ambGlow = exp(-max(nearDist, 0.0) * 3.0) * 0.1;
  vec3 glowCol = palette(
    t * 0.15 + paletteShift + 0.7,
    vec3(0.3, 0.3, 0.4),
    vec3(0.2, 0.2, 0.3),
    vec3(0.5, 0.7, 1.0),
    vec3(0.1, 0.1, 0.3)
  );
  color += glowCol * ambGlow;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, length(uv));
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
