import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Meridian — intersecting great circles of a sphere rotating in multiple axes.
// Moiré interference, clean geometric beauty, infinite mathematical structure.

// Distance from point to a great circle (ring) in 3D, projected to 2D
float ringDist(vec3 p, vec3 normal) {
  // Distance of point from the plane defined by the great circle
  float planeDist = dot(p, normal);
  // Project point onto the plane
  vec3 projected = p - planeDist * normal;
  // Distance from the ring = |distance_from_unit_sphere_surface|
  float r = length(projected);
  return abs(r - 1.0) + abs(planeDist) * 0.3;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  // ── Sphere projection ──
  // Map 2D screen to 3D sphere surface
  float r = length(uv);
  float sphereMask = smoothstep(1.1, 0.9, r);

  // Stereographic-like projection
  float z = (1.0 - r * r) / (1.0 + r * r);
  vec3 sphereP = vec3(uv * 2.0 / (1.0 + r * r), z);
  sphereP = normalize(sphereP);

  // ── Multiple sets of great circles, each rotating ──
  float totalGlow = 0.0;
  vec3 totalColor = vec3(0.0);

  // Rotation speeds modulated by audio
  float rotSpeed = 0.3 + u_bass * 0.3;

  for (int set = 0; set < 4; set++) {
    float fset = float(set);
    float setOffset = fset * 1.57;

    // Each set has a different rotation axis and speed
    float ax = t * rotSpeed * (0.7 + fset * 0.2) + setOffset;
    float ay = t * rotSpeed * (0.5 + fset * 0.15) + setOffset * 1.3;

    // Rotate the point (equivalent to rotating the circle the other way)
    vec3 rp = sphereP;
    rp.xz = rot2(ax) * rp.xz;
    rp.xy = rot2(ay) * rp.xy;

    // Draw multiple great circles in this orientation
    int numCircles = 6;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float angle = fi * 3.14159 / float(numCircles);

      // Great circle normal — rotated around Y
      vec3 normal = vec3(sin(angle), 0.0, cos(angle));

      // Distance to this great circle
      float d = abs(dot(rp, normal));

      // Line thickness — treble makes them finer
      float lineWidth = 0.015 + u_treble * 0.01;
      float line = smoothstep(lineWidth, 0.0, d);
      float glow = smoothstep(lineWidth * 4.0, 0.0, d);

      // Color per set
      vec3 lineCol = palette(
        fset * 0.25 + fi * 0.1 + paletteShift + t * 0.05,
        vec3(0.5, 0.5, 0.5),
        vec3(0.4, 0.4, 0.5),
        vec3(0.3 + fset * 0.2, 0.7 - fset * 0.1, 0.9),
        vec3(0.05 + fset * 0.08, 0.1, 0.25 + fset * 0.05)
      );

      totalColor += lineCol * glow * 0.15;
      totalColor += lineCol * line * 0.6;
      totalGlow += line * 0.2;
    }
  }

  // ── Moiré interference glow ──
  // Where multiple lines overlap, create bright interference
  float interference = smoothstep(0.4, 1.0, totalGlow);
  vec3 intColor = palette(
    totalGlow * 2.0 + t * 0.1 + paletteShift + 0.5,
    vec3(0.7, 0.7, 0.8),
    vec3(0.3, 0.3, 0.4),
    vec3(0.5, 0.8, 1.0),
    vec3(0.1, 0.15, 0.3)
  );
  totalColor += intColor * interference * 0.8;

  // Emissive at intersection hotspots
  float hotspot = smoothstep(0.6, 1.2, totalGlow);
  totalColor += vec3(1.2, 1.1, 1.3) * hotspot * 0.5;

  // ── Background — deep dark with subtle sphere edge ──
  vec3 bgColor = vec3(0.005, 0.005, 0.015);

  // Sphere edge glow
  float edgeGlow = smoothstep(0.7, 1.0, r) * smoothstep(1.2, 1.0, r);
  vec3 edgeCol = palette(
    r + t * 0.08 + paletteShift,
    vec3(0.15, 0.15, 0.2),
    vec3(0.15, 0.12, 0.2),
    vec3(0.4, 0.5, 0.8),
    vec3(0.1, 0.15, 0.3)
  );
  bgColor += edgeCol * edgeGlow * 0.3;

  // Compose sphere onto background
  vec3 color = mix(bgColor, totalColor, sphereMask);

  // Outer haze — sense of the sphere floating in space
  float outerHaze = smoothstep(1.3, 0.9, r) * (1.0 - sphereMask);
  color += edgeCol * outerHaze * 0.08;

  // Mid drives overall intensity
  color *= (0.85 + u_mid * 0.2);

  // ── Stars outside the sphere ──
  float starField = 0.0;
  vec2 starUV = uv * 5.0;
  vec2 starId = floor(starUV);
  vec2 starF = fract(starUV) - 0.5;
  float starH = fract(sin(dot(starId, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.94, starH);
  float starD = length(starF);
  starField = smoothstep(0.03, 0.0, starD) * star * (1.0 - sphereMask);
  float starTwinkle = sin(t * 10.0 + starH * 80.0) * 0.3 + 0.7;
  color += vec3(0.7, 0.75, 0.9) * starField * starTwinkle * 0.5;

  gl_FragColor = vec4(color, 1.0);
}
`;
