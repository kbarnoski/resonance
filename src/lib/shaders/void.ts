import { U, VISIONARY_PALETTE, ROT2, SMIN } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  SMIN +
  `
// 3D SDF primitives for ray marching
float sdBox3(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}

// Stellated dodecahedron approximation: intersection of cube and octahedron
// with extended points via smooth-min blending
float sdStellated(vec3 p, float size, float midWarp) {
  float cube = sdBox3(p, vec3(size * 0.65));
  float octa = sdOctahedron(p, size * 1.2);
  // Intersect cube and octahedron for base shape
  float base = max(cube, octa);
  // Add stellated spikes via rotated octahedra
  vec3 p2 = p;
  p2.xz = rot2(0.7854) * p2.xz;
  p2.xy = rot2(0.6155) * p2.xy;
  float octa2 = sdOctahedron(p2, size * (1.0 + midWarp * 0.3));
  // Smooth-blend spike with base
  return smin(base, octa2, 0.15 + midWarp * 0.1);
}

// Corridor scene SDF
float map(vec3 p, float bassVal, float midVal) {
  // Corridor walls, floor, ceiling
  float corridorWidth = 2.5 + bassVal * 0.8;
  float corridorHeight = 2.2 + bassVal * 0.3;

  float walls = corridorWidth - abs(p.x);
  float floor_d = p.y + corridorHeight * 0.5;
  float ceil_d = corridorHeight * 0.5 - p.y;
  float corridor = -min(walls, min(floor_d, ceil_d));

  // Domain repetition on z-axis for repeating forms
  float repZ = 5.0;
  vec3 q = p;
  q.z = mod(q.z + repZ * 0.5, repZ) - repZ * 0.5;

  // Warp the repeated forms with mid frequency
  q.x += sin(q.z * 2.0 + midVal * 3.0) * midVal * 0.3;
  q.y += cos(q.z * 1.5 + midVal * 2.0) * midVal * 0.2;

  float stellated = sdStellated(q, 0.6 + midVal * 0.15, midVal);

  // Small floating forms offset from center
  vec3 q2 = p;
  q2.z = mod(q2.z + repZ * 0.25 + repZ * 0.5, repZ) - repZ * 0.5;
  q2.x += 1.0;
  q2.y -= 0.3;
  float small1 = sdStellated(q2, 0.25, midVal);

  vec3 q3 = p;
  q3.z = mod(q3.z + repZ * 0.75 + repZ * 0.5, repZ) - repZ * 0.5;
  q3.x -= 1.0;
  q3.y += 0.4;
  float small2 = sdStellated(q3, 0.3, midVal);

  float forms = min(stellated, min(small1, small2));

  // Combine: corridor is negative space, forms are positive
  return min(forms, corridor);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.2;
  float paletteShift = u_amplitude * 0.35;

  // Camera setup — advancing through corridor
  float camSpeed = 0.8;
  vec3 ro = vec3(sin(t * 0.3) * 0.5, cos(t * 0.2) * 0.3, t * camSpeed);
  vec3 rd = normalize(vec3(uv.x, uv.y, 1.5));

  // Slight camera sway
  rd.xz = rot2(sin(t * 0.4) * 0.08) * rd.xz;
  rd.yz = rot2(cos(t * 0.35) * 0.05) * rd.yz;

  // Ray march
  float totalDist = 0.0;
  float hitDist = 0.0;
  vec3 hitPos = ro;
  bool hit = false;

  for (int i = 0; i < 64; i++) {
    hitPos = ro + rd * totalDist;
    hitDist = map(hitPos, u_bass, u_mid);
    if (hitDist < 0.005) {
      hit = true;
      break;
    }
    if (totalDist > 40.0) break;
    totalDist += hitDist;
  }

  vec3 color = vec3(0.0);

  if (hit) {
    // Approximate normal via central differences
    vec2 e = vec2(0.002, 0.0);
    vec3 n = normalize(vec3(
      map(hitPos + e.xyy, u_bass, u_mid) - map(hitPos - e.xyy, u_bass, u_mid),
      map(hitPos + e.yxy, u_bass, u_mid) - map(hitPos - e.yxy, u_bass, u_mid),
      map(hitPos + e.yyx, u_bass, u_mid) - map(hitPos - e.yyx, u_bass, u_mid)
    ));

    // Palette 1: deep moody corridor tones
    vec3 col1 = palette(
      totalDist * 0.08 + hitPos.z * 0.05 + paletteShift,
      vec3(0.3, 0.25, 0.35),
      vec3(0.4, 0.3, 0.5),
      vec3(1.0, 0.6, 0.8),
      vec3(0.1, 0.2, 0.45)
    );

    // Palette 2: cold geometric highlights
    vec3 col2 = palette(
      n.x * 0.5 + n.y * 0.3 + t * 0.2 + paletteShift + 0.4,
      vec3(0.5, 0.5, 0.5),
      vec3(0.5, 0.4, 0.5),
      vec3(0.6, 0.8, 1.0),
      vec3(0.0, 0.1, 0.3)
    );

    // Palette 3: warm accent for edges
    vec3 col3 = palette(
      hitPos.y * 0.4 + hitPos.x * 0.3 + paletteShift + 0.7,
      vec3(0.5, 0.4, 0.3),
      vec3(0.5, 0.4, 0.3),
      vec3(1.0, 0.7, 0.4),
      vec3(0.0, 0.05, 0.15)
    );

    // Lighting
    vec3 lightDir = normalize(vec3(sin(t), 0.8, cos(t * 0.7)));
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 32.0);

    // Fresnel rim
    float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

    // Ambient occlusion approximation from distance
    float ao = 1.0 - smoothstep(0.0, 5.0, float(totalDist) * 0.1);

    // Base shading
    color = col1 * diff * 0.5 * ao;
    color += col2 * fresnel * 0.8;
    color += col3 * spec * 0.6;

    // Depth-based fog color (moody)
    float fogFactor = 1.0 - exp(-totalDist * 0.06);
    vec3 fogColor = col1 * 0.15;
    color = mix(color, fogColor, fogFactor);

    // Emissive geometric highlights on stellated forms
    float repZ = 5.0;
    float zMod = mod(hitPos.z + repZ * 0.5, repZ) - repZ * 0.5;
    float formGlow = smoothstep(0.8, 0.0, length(vec2(hitPos.x, hitPos.y)) + abs(zMod) * 0.5);
    formGlow *= (0.5 + u_bass * 1.5);

    // Warm white emissive on closest geometry
    float proximity = smoothstep(15.0, 0.0, totalDist);
    color += vec3(1.3, 1.15, 1.0) * formGlow * proximity * 1.6;

    // Cool white emissive on specular peaks
    float specPeak = pow(spec, 4.0);
    color += vec3(1.0, 1.15, 1.4) * specPeak * 2.2 * proximity;

    // Edge glow on fresnel
    color += vec3(1.2, 1.1, 1.35) * fresnel * proximity * 0.6;

  } else {
    // Missed — deep void with subtle gradient
    float voidGlow = smoothstep(1.5, 0.0, length(uv));
    vec3 voidCol = palette(
      length(uv) * 0.5 + t * 0.1 + paletteShift,
      vec3(0.1, 0.05, 0.15),
      vec3(0.1, 0.1, 0.15),
      vec3(0.8, 0.5, 1.0),
      vec3(0.2, 0.1, 0.4)
    );
    color = voidCol * voidGlow * 0.15;
  }

  gl_FragColor = vec4(color, 1.0);
}
`;
