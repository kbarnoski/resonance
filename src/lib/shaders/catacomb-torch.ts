import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Stone archway corridors receding into darkness.
// Perspective floor/ceiling with flickering torchlight on near walls.

// Light 3-octave fbm for stone texture
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

float hash1(float n) { return fract(sin(n) * 43758.5453); }

// Torch flicker — irregular pulsing
float torchFlicker(float t, float seed) {
  float f = 0.0;
  f += sin(t * 5.0 + seed) * 0.15;
  f += sin(t * 8.3 + seed * 2.0) * 0.1;
  f += sin(t * 13.7 + seed * 3.0) * 0.05;
  f += sin(t * 2.1 + seed * 0.5) * 0.2;
  return 0.5 + f;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.15;

  vec3 color = vec3(0.0);

  // ── Corridor perspective ──
  // Vanishing point at center, corridor extends forward
  float corridorWidth = 0.35;
  float corridorHeight = 0.4;

  // Depth from UV — how far into the corridor we're looking
  float wallDistX = abs(uv.x) / corridorWidth;
  float wallDistY = abs(uv.y) / corridorHeight;
  float wallDist = max(wallDistX, wallDistY);

  // Depth: 0 at edges (near), high at center (far)
  // Invert: things near the edge are at distance 0, center is deep
  float depth = 1.0 / max(wallDist, 0.01);
  depth = clamp(depth, 0.5, 30.0);

  // World-space coords on the walls
  float worldZ = depth + t * 3.0; // forward motion

  // ── Determine what surface we're looking at ──
  // Left/right walls, ceiling, floor, or the deep corridor
  float isLeftWall = step(wallDistX, wallDistY) * step(uv.x, 0.0) * step(0.0, wallDist - 0.95);
  float isRightWall = step(wallDistX, wallDistY) * step(0.0, uv.x) * step(0.0, wallDist - 0.95);
  float isCeiling = step(wallDistY, wallDistX) * step(0.0, uv.y) * step(0.0, wallDist - 0.95);
  float isFloor = step(wallDistY, wallDistX) * step(uv.y, 0.0) * step(0.0, wallDist - 0.95);

  // ── Stone texture ──
  vec2 stoneUV;
  if (wallDistX > wallDistY) {
    // Floor or ceiling — world XZ
    stoneUV = vec2(uv.x * depth * 0.3, worldZ * 0.15);
  } else {
    // Side walls — world YZ
    stoneUV = vec2(uv.y * depth * 0.3, worldZ * 0.15);
  }

  float stoneTex = fbm3(stoneUV * 3.0);
  float stoneDetail = snoise(stoneUV * 12.0) * 0.3;
  float stone = stoneTex * 0.5 + 0.5 + stoneDetail;

  // Stone block pattern — mortar lines
  vec2 blockUV = stoneUV * vec2(4.0, 3.0);
  // Offset every other row
  blockUV.x += floor(blockUV.y) * 0.5;
  vec2 blockFract = fract(blockUV);
  float mortar = smoothstep(0.05, 0.08, blockFract.x) * smoothstep(0.05, 0.08, blockFract.y);
  mortar *= smoothstep(0.05, 0.08, 1.0 - blockFract.x) * smoothstep(0.05, 0.08, 1.0 - blockFract.y);

  // Base stone color
  vec3 stoneCol = palette(
    stone * 0.3 + paletteShift,
    vec3(0.04, 0.035, 0.03),
    vec3(0.03, 0.025, 0.02),
    vec3(0.4, 0.35, 0.3),
    vec3(0.1, 0.12, 0.15)
  );
  // Mortar is darker
  vec3 mortarCol = stoneCol * 0.5;
  vec3 wallColor = mix(mortarCol, stoneCol, mortar);

  // ── Archway shapes — periodic along depth ──
  float archSpacing = 3.0;
  float archZ = mod(worldZ, archSpacing);
  float archProximity = smoothstep(0.3, 0.0, abs(archZ - archSpacing * 0.5));

  // Arch darkens where the structural column would be
  float archColumn = smoothstep(corridorWidth * 0.9, corridorWidth * 0.7, abs(uv.x) / max(wallDist, 0.01));
  float archOverhead = archProximity * (1.0 - archColumn) * 0.5;

  // Darken walls at arch locations
  wallColor *= 1.0 - archOverhead * 0.4;

  // ── Torchlight — two torches, left and right sides ──
  float flicker1 = torchFlicker(t * 8.0, 0.0) * (0.7 + u_bass * 0.4);
  float flicker2 = torchFlicker(t * 8.0, 3.7) * (0.7 + u_bass * 0.4);

  // Torch positions — near camera, on the walls
  vec2 torch1Pos = vec2(-corridorWidth * 0.85, 0.15);
  vec2 torch2Pos = vec2(corridorWidth * 0.85, 0.15);

  float torch1Dist = length(uv - torch1Pos);
  float torch2Dist = length(uv - torch2Pos);

  // Warm light falloff — inverse distance
  float light1 = flicker1 * 0.03 / (torch1Dist * torch1Dist + 0.02);
  float light2 = flicker2 * 0.03 / (torch2Dist * torch2Dist + 0.02);
  light1 = min(light1, 0.40);
  light2 = min(light2, 0.40);

  // Torch light color — warm amber
  vec3 torchCol = palette(
    flicker1 * 0.2 + paletteShift + 0.05,
    vec3(0.25, 0.12, 0.03),
    vec3(0.20, 0.10, 0.02),
    vec3(1.0, 0.7, 0.3),
    vec3(0.0, 0.05, 0.1)
  );

  // Apply torchlight to walls
  vec3 litWall = wallColor + torchCol * (light1 + light2);

  // ── Depth fog — walls fade to black in the distance ──
  float depthFog = exp(-depth * 0.12);
  vec3 fogColor = vec3(0.008, 0.006, 0.005);
  litWall = mix(fogColor, litWall, depthFog);

  // ── Deep corridor end — darkness with faint suggestion ──
  float deepCenter = smoothstep(0.8, 0.2, wallDist);
  float deepDark = 1.0 - deepCenter * 0.7;

  color = litWall * deepDark;

  // ── Ambient occlusion in corners ──
  float aoFloor = smoothstep(0.0, 0.15, abs(uv.y) / max(wallDist * corridorHeight, 0.01));
  float aoWall = smoothstep(0.0, 0.15, abs(uv.x) / max(wallDist * corridorWidth, 0.01));
  float ao = aoFloor * aoWall;
  color *= 0.6 + ao * 0.4;

  // ── Torch flame sprites — small bright points at torch locations ──
  float flame1 = smoothstep(0.025, 0.01, torch1Dist);
  float flame2 = smoothstep(0.025, 0.01, torch2Dist);
  vec3 flameCol = vec3(0.35, 0.20, 0.05);
  color += flameCol * flame1 * flicker1;
  color += flameCol * flame2 * flicker2;

  // ── Dust motes in torchlight ──
  float dustLight = (light1 + light2) * 0.5;
  float dust = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float dx = hash1(fi * 23.7) * 1.0 - 0.5;
    float dy = hash1(fi * 51.3) * 0.8 - 0.4;
    dx += sin(t * (0.5 + fi * 0.2) + fi) * 0.1;
    dy += sin(t * (0.3 + fi * 0.15) + fi * 2.0) * 0.05;
    float dd = length(uv - vec2(dx, dy));
    dust += 0.0003 / (dd * dd + 0.0003);
  }
  color += torchCol * dust * dustLight * 0.003 * (0.5 + u_treble * 0.5);

  // Mid-frequency modulates ambient light
  color *= 0.9 + u_mid * 0.12;

  // Vignette — heavy, claustrophobic
  float vignette = 1.0 - smoothstep(0.35, 1.2, length(uv * vec2(0.9, 1.0)));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
