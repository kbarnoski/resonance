import { U, VISIONARY_PALETTE, ROT2, SMIN } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  SMIN +
  `
// Infinite temple — ray-marched hall of repeating arches.
// Camera advances forever through sacred geometry.

float sdBox3(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// Column with fluted surface
float sdColumn(vec3 p, float r, float h) {
  float cyl = length(p.xz) - r;
  float cap = abs(p.y) - h;
  // Fluting — subtle ridges around circumference
  float angle = atan(p.z, p.x);
  float flute = sin(angle * 12.0) * 0.008;
  cyl += flute;
  return max(cyl, cap);
}

// Pointed arch shape in 2D (for extrusion)
float sdArch(vec2 p, float w, float h, float thick) {
  // Two circles intersecting to form pointed arch
  float r = (w * w + h * h) / (2.0 * w);
  float d1 = length(p - vec2(-r + w, 0.0)) - r;
  float d2 = length(p - vec2( r - w, 0.0)) - r;
  float arch = max(d1, d2);
  arch = max(arch, -p.y); // only upper half
  arch = max(arch, p.y - h * 1.3); // cap height
  float shell = abs(arch) - thick;
  return shell;
}

float map(vec3 p, float bassVal, float midVal) {
  // Corridor dimensions
  float hallWidth = 3.0;
  float hallHeight = 4.0;

  // Floor and ceiling
  float floor_d = p.y + 1.5;
  float ceil_d = hallHeight - p.y;

  // Walls
  float walls = hallWidth - abs(p.x);

  // Corridor negative space
  float corridor = -min(walls, min(floor_d, ceil_d));

  // ── Domain repetition for infinite columns ──
  float repZ = 4.0;
  float cellZ = floor(p.z / repZ + 0.5);
  vec3 q = p;
  q.z = mod(q.z + repZ * 0.5, repZ) - repZ * 0.5;

  // Columns — pairs flanking the center
  float colSpacing = 2.2 + bassVal * 0.2;
  vec3 colL = q - vec3(-colSpacing, 0.0, 0.0);
  vec3 colR = q - vec3( colSpacing, 0.0, 0.0);
  float col = min(
    sdColumn(colL, 0.18, hallHeight * 0.5),
    sdColumn(colR, 0.18, hallHeight * 0.5)
  );

  // Arches between columns — rotated into the XY plane
  vec2 archP = vec2(abs(q.x) - colSpacing, q.y - 1.0);
  float archD = sdArch(vec2(q.x, q.y - 1.0), colSpacing * 0.8, 2.0 + midVal * 0.3, 0.08);
  // Extrude arch along Z
  float archExtrude = max(archD, abs(q.z) - 0.12);

  // ── Ribbed vault ceiling ──
  float vaultRib = abs(q.z) - 0.06;
  float vaultArch = length(vec2(abs(q.x), q.y - hallHeight + 1.5)) - hallWidth * 0.8;
  float vault = max(vaultRib, max(vaultArch, -(q.y - 1.5)));

  // ── Floor pattern — recessed tiles ──
  vec2 tileP = mod(p.xz * 1.5 + 0.5, 1.0) - 0.5;
  float tile = sdBox3(vec3(tileP.x, p.y + 1.48, tileP.y), vec3(0.42, 0.03, 0.42));

  float forms = min(col, min(archExtrude, min(vault, tile)));

  return min(forms, corridor);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.3;

  // Camera — advancing through the temple
  float camSpeed = 0.6;
  vec3 ro = vec3(
    sin(t * 0.2) * 0.6,
    0.2 + sin(t * 0.15) * 0.15,
    t * camSpeed
  );

  // Look direction — slightly wandering
  vec3 lookAt = ro + vec3(sin(t * 0.1) * 0.3, 0.1, 3.0);
  vec3 fwd = normalize(lookAt - ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  vec3 rd = normalize(uv.x * right + uv.y * up + 1.5 * fwd);

  // ── Ray march ──
  float totalDist = 0.0;
  float hitDist = 0.0;
  vec3 hitPos = ro;
  bool hit = false;

  for (int i = 0; i < 80; i++) {
    hitPos = ro + rd * totalDist;
    hitDist = map(hitPos, u_bass, u_mid);
    if (hitDist < 0.003) { hit = true; break; }
    if (totalDist > 50.0) break;
    totalDist += hitDist;
  }

  vec3 color = vec3(0.0);

  if (hit) {
    // Normal
    vec2 e = vec2(0.002, 0.0);
    vec3 n = normalize(vec3(
      map(hitPos + e.xyy, u_bass, u_mid) - map(hitPos - e.xyy, u_bass, u_mid),
      map(hitPos + e.yxy, u_bass, u_mid) - map(hitPos - e.yxy, u_bass, u_mid),
      map(hitPos + e.yyx, u_bass, u_mid) - map(hitPos - e.yyx, u_bass, u_mid)
    ));

    // Palette 1 — warm stone
    vec3 stone = palette(
      hitPos.z * 0.03 + hitPos.y * 0.1 + paletteShift,
      vec3(0.35, 0.3, 0.28),
      vec3(0.15, 0.12, 0.1),
      vec3(0.6, 0.5, 0.4),
      vec3(0.05, 0.08, 0.12)
    );

    // Palette 2 — cool shadow
    vec3 shadow = palette(
      n.y * 0.5 + hitPos.x * 0.1 + paletteShift + 0.5,
      vec3(0.15, 0.15, 0.2),
      vec3(0.1, 0.1, 0.15),
      vec3(0.5, 0.4, 0.7),
      vec3(0.15, 0.1, 0.3)
    );

    // Palette 3 — golden light
    vec3 gold = palette(
      totalDist * 0.05 + paletteShift + 0.3,
      vec3(0.5, 0.4, 0.3),
      vec3(0.3, 0.25, 0.15),
      vec3(0.8, 0.6, 0.3),
      vec3(0.0, 0.05, 0.1)
    );

    // Lighting — distant warm light from ahead
    vec3 lightDir = normalize(vec3(sin(t * 0.3) * 0.3, 0.5, 1.0));
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 24.0);
    float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

    // Ambient occlusion
    float ao = 1.0 - smoothstep(0.0, 3.0, totalDist * 0.08);

    color = stone * diff * 0.5 * ao;
    color += shadow * (0.08 + fresnel * 0.3);
    color += gold * spec * 0.4;

    // Depth fog — warm, suggesting more temple beyond
    float fogFactor = 1.0 - exp(-totalDist * 0.04);
    vec3 fogColor = gold * 0.12;
    color = mix(color, fogColor, fogFactor);

    // Emissive — light from far ahead pooling through arches
    float proximity = smoothstep(20.0, 0.0, totalDist);
    float upLight = smoothstep(-0.5, 2.0, hitPos.y);
    color += gold * upLight * proximity * 0.15 * (0.5 + u_mid * 0.5);

    // Column glow on bass
    float colGlow = smoothstep(0.3, 0.0, abs(abs(hitPos.x) - 2.2)) * smoothstep(3.0, 0.0, abs(mod(hitPos.z + 2.0, 4.0) - 2.0));
    color += vec3(1.2, 1.05, 0.9) * colGlow * proximity * u_bass * 0.6;

    // Specular emissive
    color += vec3(1.1, 1.0, 0.9) * pow(spec, 3.0) * proximity * 1.5;

  } else {
    // Missed — warm distant glow suggesting infinity
    float endGlow = smoothstep(1.0, 0.0, length(uv));
    vec3 farLight = palette(
      t * 0.05 + paletteShift + 0.3,
      vec3(0.15, 0.12, 0.1),
      vec3(0.1, 0.08, 0.06),
      vec3(0.6, 0.4, 0.25),
      vec3(0.0, 0.05, 0.1)
    );
    color = farLight * endGlow * 0.15;
  }

  gl_FragColor = vec4(color, 1.0);
}
`;
