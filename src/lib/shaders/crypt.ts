import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// SDF: rounded box
float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - r;
}

// SDF: infinite corridor with repeating stone arches
// p is the ray position, returns distance to scene
float sdfArch(vec3 p) {
  // Repeat arches along z axis
  float archSpacing = 3.5;
  float pz = p.z;
  float zId = floor(pz / archSpacing);
  float lz = mod(pz, archSpacing) - archSpacing * 0.5;

  // Corridor walls (two vertical slabs left and right)
  float wallL = p.x + 0.9;   // left wall
  float wallR = -(p.x - 0.9); // right wall
  float floor_ = p.y + 1.1;  // floor
  float ceiling = -(p.y - 1.4); // ceiling

  float walls = min(min(wallL, wallR), min(floor_, ceiling));

  // Arch shape: union of two pillars + top curved portion
  // Pillar left
  float pillarW = 0.12, pillarD = 0.15;
  float archThickness = 0.12;
  float archH = 1.1; // height of arch top center
  float archHalfW = 0.65;

  vec3 archP = vec3(p.x, p.y, lz);
  float pL = sdRoundBox(archP - vec3(-archHalfW, -0.2, 0.0), vec3(pillarW, 1.2, pillarD), 0.02);
  float pR = sdRoundBox(archP - vec3( archHalfW, -0.2, 0.0), vec3(pillarW, 1.2, pillarD), 0.02);

  // Arch top: torus-like curved beam — approximate with a bent box
  // Use a circle SDF in xz plane for the curved top
  float archR = archHalfW;
  float archCenterY = 0.5;
  vec2 archXY = vec2(length(vec2(archP.x, 0.0)) - archR, archP.y - archCenterY);
  float archTop = length(archXY) - archThickness;
  archTop = max(archTop, -sdRoundBox(archP - vec3(0.0, archCenterY, 0.0), vec3(archR + archThickness, archThickness + 0.3, pillarD + 0.01), 0.01));
  archTop = max(archTop, abs(archP.z) - pillarD - 0.01);

  float archScene = min(min(pL, pR), archTop);

  // Noise on walls for stone texture — fbm
  float stoneNoise = fbm(vec2(p.x * 3.0 + p.z * 0.4, p.y * 3.0) + u_time * 0.01) * 0.04;

  return min(walls + stoneNoise, archScene);
}

// Ray march
float march(vec3 ro, vec3 rd) {
  float t = 0.001;
  for (int i = 0; i < 72; i++) {
    vec3 p = ro + rd * t;
    float d = sdfArch(p);
    if (d < 0.002) break;
    if (t > 40.0) break;
    t += d * 0.7;
  }
  return t;
}

// Normal estimation
vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(
    sdfArch(p + e.xyy) - sdfArch(p - e.xyy),
    sdfArch(p + e.yxy) - sdfArch(p - e.yxy),
    sdfArch(p + e.yyx) - sdfArch(p - e.yyx)
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.27;

  // Camera moving forward through the corridor
  float speed = 0.6 + u_bass * 0.3;
  vec3 ro = vec3(0.0, 0.0, t * speed * 8.0);
  // Slight tilt down, subtle sway
  float sway = sin(t * 1.3) * 0.04 * u_mid;
  vec3 target = ro + vec3(sway, -0.1, 1.0);
  vec3 forward = normalize(target - ro);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);

  // Build ray
  vec3 rd = normalize(uv.x * right + uv.y * up + 1.5 * forward);

  float dist = march(ro, rd);
  vec3 p = ro + rd * dist;

  vec3 color = vec3(0.0);

  if (dist < 39.0) {
    vec3 n = calcNormal(p);

    // Single faint torch-like light from ahead and slightly above
    // The light is always ahead — receding into infinite darkness
    float torchZ = ro.z + 12.0 + sin(t * 0.7) * 2.0;
    vec3 lightPos = vec3(0.0, 0.6, torchZ);
    vec3 lDir = normalize(lightPos - p);
    float lDist = length(lightPos - p);

    float diff = max(dot(n, lDir), 0.0) / (1.0 + lDist * lDist * 0.08);

    // Ambient — near zero
    float amb = 0.02 + u_bass * 0.01;

    // Stone texture: use fbm on world position
    float stoneT = fbm(vec2(p.x * 2.0 + p.z * 0.3, p.y * 2.0) + 0.5) * 0.5 + 0.5;

    // Colors
    vec3 stoneColor = palette(stoneT * 0.3 + paletteShift,
      vec3(0.04, 0.03, 0.03),
      vec3(0.06, 0.05, 0.04),
      vec3(1.0, 1.0, 1.0),
      vec3(0.0, 0.05, 0.1));

    vec3 torchColor = palette(0.08 + paletteShift + u_mid * 0.1,
      vec3(0.1, 0.04, 0.0),
      vec3(0.15, 0.06, 0.01),
      vec3(1.0, 1.0, 1.0),
      vec3(0.0, 0.1, 0.2));

    color = stoneColor * amb;
    color += torchColor * diff * (0.4 + u_bass * 0.2);

    // Depth fog — darkness swallows everything
    float depthFog = exp(-max(dist - 2.0, 0.0) * 0.065);
    color *= depthFog;

    // Arch edge highlight — treble sparkle on corners
    float edgeHighlight = smoothstep(0.01, 0.0, sdfArch(p) + 0.01) * u_treble * 0.05;
    vec3 sparkColor = palette(0.15 + paletteShift,
      vec3(0.1, 0.05, 0.0),
      vec3(0.2, 0.1, 0.0),
      vec3(1.0, 1.0, 1.0),
      vec3(0.0, 0.05, 0.15));
    color += sparkColor * edgeHighlight * depthFog;
  }

  // Vignette — intense, as if the darkness closes in
  float vd = length(uv);
  float vignette = pow(1.0 - smoothstep(0.1, 1.2, vd), 2.5);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
