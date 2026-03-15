import { U, VISIONARY_PALETTE, ROT2, SMIN } from "./shared";

export const FRAG = U + VISIONARY_PALETTE + ROT2 + SMIN + `

// SDF for a cube
float sdCube(vec3 p, float s) {
  vec3 d = abs(p) - vec3(s);
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// SDF for an octahedron (exact)
float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  float m = p.x + p.y + p.z - s;
  vec3 q;
  if (3.0 * p.x < m) {
    q = p;
  } else if (3.0 * p.y < m) {
    q = p.yzx;
  } else if (3.0 * p.z < m) {
    q = p.zxy;
  } else {
    return m * 0.57735027;
  }
  float k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
  return length(vec3(q.x, q.y - s + k, q.z - k));
}

// SDF for an icosahedron (approximation via planes)
float sdIcosahedron(vec3 p, float r) {
  // Golden ratio constants
  float phi = 1.618034;
  float invPhi = 0.618034;

  // Normalize the golden ratio normal vectors
  // Icosahedron face normals point along permutations of (0, 1, phi)
  vec3 n1 = normalize(vec3(0.0, 1.0, phi));
  vec3 n2 = normalize(vec3(0.0, 1.0, -phi));
  vec3 n3 = normalize(vec3(1.0, phi, 0.0));
  vec3 n4 = normalize(vec3(1.0, -phi, 0.0));
  vec3 n5 = normalize(vec3(phi, 0.0, 1.0));
  vec3 n6 = normalize(vec3(-phi, 0.0, 1.0));

  vec3 ap = abs(p);
  float d = 0.0;
  d = max(d, abs(dot(p, n1)));
  d = max(d, abs(dot(p, n2)));
  d = max(d, abs(dot(p, n3)));
  d = max(d, abs(dot(p, n4)));
  d = max(d, abs(dot(p, n5)));
  d = max(d, abs(dot(p, n6)));
  return d - r;
}

// Scene SDF: nested polyhedra
float scene(vec3 p) {
  float t = u_time * 0.2;
  float breathe = sin(u_time * 0.5) * 0.1;

  // Rotate each form differently
  vec3 p1 = p;
  p1.xy = rot2(t * 0.3) * p1.xy;
  p1.yz = rot2(t * 0.2) * p1.yz;

  vec3 p2 = p;
  p2.xy = rot2(-t * 0.25) * p2.xy;
  p2.xz = rot2(t * 0.35) * p2.xz;

  vec3 p3 = p;
  p3.yz = rot2(t * 0.15) * p3.yz;
  p3.xy = rot2(-t * 0.2) * p3.xy;

  // Inner icosahedron — breathes with bass
  float innerSize = 0.5 + breathe + u_bass * 0.15;
  float ico = sdIcosahedron(p1, innerSize);

  // Middle octahedron
  float midSize = 0.85 + breathe * 0.7;
  float oct = sdOctahedron(p2, midSize);

  // Outer cube
  float outerSize = 1.1 + breathe * 0.5;
  float cube = sdCube(p3, outerSize);

  // Smooth blend all three forms
  float k = 0.3 + u_treble * 0.2;
  float d = smin(ico, oct, k);
  d = smin(d, cube, k * 0.8);

  // Energy tendrils: wavy displacement driven by treble
  float tendrilFreq = 8.0 + u_treble * 12.0;
  float tendrilAmp = 0.03 + u_treble * 0.08;
  float tendril = sin(p.x * tendrilFreq + u_time) *
                  sin(p.y * tendrilFreq * 0.7 + u_time * 1.3) *
                  sin(p.z * tendrilFreq * 1.1 + u_time * 0.9) * tendrilAmp;
  d += tendril;

  return d;
}

// Normal from SDF gradient
vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    scene(p + e.xyy) - scene(p - e.xyy),
    scene(p + e.yxy) - scene(p - e.yxy),
    scene(p + e.yyx) - scene(p - e.yyx)
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float paletteShift = u_amplitude * 0.3;

  // Camera setup
  vec3 ro = vec3(0.0, 0.0, 3.5); // ray origin
  vec3 rd = normalize(vec3(uv, -1.5)); // ray direction

  // Gentle camera sway
  float sway = u_time * 0.08;
  ro.xz = rot2(sway) * ro.xz;
  rd.xz = rot2(sway) * rd.xz;

  // Ray march
  float totalDist = 0.0;
  float minDist = 1e5;
  vec3 color = vec3(0.0);
  bool hit = false;

  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * totalDist;
    float d = scene(p);

    // Track closest approach for glow
    minDist = min(minDist, d);

    if (d < 0.001) {
      hit = true;
      vec3 pos = p;
      vec3 nor = calcNormal(pos);

      // Fresnel-like edge lighting
      float fresnel = pow(1.0 - max(0.0, dot(nor, -rd)), 3.0);

      // --- Multiple palette color sources ---
      // Palette 1: deep electric blue / violet
      vec3 col1 = palette(
        fresnel * 2.0 + u_time * 0.05 + paletteShift,
        vec3(0.5, 0.5, 0.5),
        vec3(0.5, 0.5, 0.5),
        vec3(1.0, 0.7, 0.4),
        vec3(0.0, 0.15, 0.2)
      );

      // Palette 2: warm amber / magenta for interior
      vec3 col2 = palette(
        dot(nor, vec3(0.0, 1.0, 0.0)) + u_time * 0.08 + paletteShift * 1.2,
        vec3(0.5, 0.5, 0.3),
        vec3(0.5, 0.5, 0.5),
        vec3(0.8, 0.5, 0.3),
        vec3(0.6, 0.2, 0.0)
      );

      // Palette 3: cyan / gold accents on edges
      vec3 col3 = palette(
        totalDist * 0.5 + fresnel + paletteShift * 0.8,
        vec3(0.6, 0.7, 0.8),
        vec3(0.4, 0.4, 0.4),
        vec3(1.0, 0.8, 0.6),
        vec3(0.1, 0.3, 0.4)
      );

      // Base surface color from normal direction
      float normalBlend = dot(nor, vec3(0.577, 0.577, 0.577)) * 0.5 + 0.5;
      vec3 surfColor = mix(col1, col2, normalBlend);
      surfColor = mix(surfColor, col3, fresnel * 0.5);

      // Emissive edge glow — warm white tint
      vec3 warmEdge = vec3(1.4, 1.2, 0.95);
      surfColor += fresnel * warmEdge * (1.0 + u_amplitude * 1.5);

      // Inner glow: bass-reactive pulsing light from within
      float innerPulse = sin(length(pos) * 6.0 - u_time * 3.0) * 0.5 + 0.5;
      vec3 coolInner = vec3(0.85, 1.1, 1.5);
      surfColor += innerPulse * coolInner * u_bass * 0.8;

      // Depth fog to darken distant surfaces
      float fog = exp(-totalDist * 0.3);
      color = surfColor * fog;

      break;
    }

    if (totalDist > 20.0) break;
    totalDist += d;
  }

  // Atmospheric glow for near-misses (even if no hit)
  if (!hit) {
    // Volumetric glow based on closest approach
    float glow = exp(-minDist * 5.0);

    // Palette for atmospheric glow
    vec3 glowCol1 = palette(
      minDist * 3.0 + u_time * 0.1 + paletteShift,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.5, 0.5),
      vec3(1.0, 0.8, 0.6),
      vec3(0.1, 0.2, 0.35)
    );

    vec3 glowCol2 = palette(
      length(uv) * 2.0 + u_time * 0.06 + paletteShift * 1.5,
      vec3(0.5, 0.4, 0.6),
      vec3(0.5, 0.5, 0.4),
      vec3(0.7, 1.0, 0.8),
      vec3(0.3, 0.05, 0.15)
    );

    vec3 atmColor = mix(glowCol1, glowCol2, smoothstep(0.0, 0.5, minDist));
    color = atmColor * glow * (0.5 + u_amplitude * 1.0);

    // Cool white halo at near-miss edges
    float halo = exp(-minDist * 15.0);
    color += halo * vec3(0.9, 1.0, 1.3) * 0.6;
  }

  // Overall glow intensity modulated by amplitude
  color *= 0.8 + u_amplitude * 0.5;

  gl_FragColor = vec4(color, 1.0);
}
`;
