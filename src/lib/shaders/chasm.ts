import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.28;

  // Looking DOWN into a vertical crack/chasm
  // Center of screen is the crack, we are above looking into the abyss
  // Perspective: as uv.y increases (top of screen) = looking deeper in

  // The crack: a vertical gap with irregular fractal walls
  // Crack width narrows with depth (y going up = further down)
  float depthT = uv.y * 0.5 + 0.5; // 0=near surface, 1=deep
  depthT = clamp(depthT, 0.0, 1.0);

  // Effective depth from camera (nonlinear perspective)
  float depth = depthT * depthT * 60.0 + 0.5;

  // Crack walls: fbm-displaced boundaries
  float crackWidth = (0.18 + u_bass * 0.04) * (1.0 - depthT * 0.85);
  float wallNoise = fbm(vec2(depthT * 4.0, t * 0.3)) * 0.08;
  float leftWall  = -crackWidth - wallNoise;
  float rightWall =  crackWidth + fbm(vec2(depthT * 4.0 + 5.3, t * 0.25)) * 0.08;

  // Distance from nearest wall
  float distToWall = min(uv.x - leftWall, rightWall - uv.x);
  float inCrack = step(0.0, distToWall); // 1 inside crack, 0 on wall surface

  vec3 color = vec3(0.0);

  // ─── WALL SURFACE ───
  // Wall texture: stratified rock, horizontal layers
  vec2 wallUV = vec2(abs(uv.x) * 3.0, depthT * 8.0 + t * 0.1);
  float rockLayer = fbm(wallUV * 0.7) * 0.5 + 0.5;
  float rockDetail = fbm(wallUV * 2.5) * 0.5 + 0.5;

  // Light: diffuse from above. Further down = less light
  float lightFalloff = exp(-depth * 0.08);
  // Side light: more light on the wall closest to us
  float sideLit = (1.0 - depthT) * 0.4;

  vec3 rockColor = palette(rockLayer * 0.2 + paletteShift,
    vec3(0.04, 0.03, 0.025),
    vec3(0.06, 0.05, 0.04),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.05, 0.1));

  vec3 wallColor = rockColor * (lightFalloff * 0.6 + sideLit + rockDetail * 0.05);

  // Crack interior darkness
  // The bottom of the chasm is unreachable — pure blackness
  // Only faint reflected light from walls reaches the center at shallow depths
  float crackBrightness = exp(-depth * 0.12) * (1.0 - abs(uv.x) / (crackWidth + 0.001)) * 0.08;
  crackBrightness = max(crackBrightness, 0.0);

  // Very faint light color from above
  vec3 reflectColor = palette(0.15 + paletteShift + u_mid * 0.1,
    vec3(0.02, 0.015, 0.01),
    vec3(0.05, 0.03, 0.01),
    vec3(1.0, 1.0, 1.0),
    vec3(0.05, 0.1, 0.2));

  vec3 crackColor = reflectColor * crackBrightness;

  // Surface rim: the top edge where we stand — slightly brighter
  float rimDepth = 1.0 - depthT;
  float rimMask = smoothstep(0.0, 0.15, rimDepth) * (1.0 - smoothstep(0.15, 0.3, rimDepth));
  float rimBrightness = rimMask * 0.15;

  // Moisture/mist rising from depths — fbm wisps in the crack
  if (inCrack > 0.5) {
    float mistN = fbm(vec2(uv.x * 4.0, depthT * 6.0 - t * 0.5)) * 0.5 + 0.5;
    float mist = smoothstep(0.4, 0.8, mistN) * exp(-depthT * 2.0) * 0.05;
    vec3 mistColor = palette(0.62 + paletteShift,
      vec3(0.005, 0.005, 0.01),
      vec3(0.02, 0.018, 0.03),
      vec3(1.0, 1.0, 1.0),
      vec3(0.4, 0.5, 0.7));
    crackColor += mistColor * mist;
  }

  // Bass: low rumble — makes the walls feel wet/glistening
  float wetSheen = u_bass * exp(-depth * 0.15) * fbm(wallUV * 4.0 + t) * 0.06;
  vec3 sheenColor = palette(0.6 + paletteShift,
    vec3(0.0, 0.0, 0.01),
    vec3(0.03, 0.02, 0.05),
    vec3(1.0, 1.0, 1.0),
    vec3(0.3, 0.4, 0.6));

  // Treble: tiny mineral glints in rock face
  float glint = smoothstep(0.85, 1.0, snoise(wallUV * 10.0)) * lightFalloff * u_treble * 0.08;

  // Compose
  color = mix(wallColor, crackColor, inCrack);
  color += sheenColor * wetSheen * (1.0 - inCrack);
  color += rockColor * glint * (1.0 - inCrack);
  color += reflectColor * rimBrightness;

  // Depth fog — beyond a certain depth, pure black
  float totalFog = exp(-depth * 0.055);
  color *= totalFog;

  // Screen-edge vignette — you're leaning over the edge
  float vd = length(uv * vec2(1.0, 0.7));
  float vignette = pow(1.0 - smoothstep(0.1, 1.2, vd), 2.0);
  color *= vignette;

  // The top of screen (near surface, near us) gets slightly more light
  float nearBoost = (1.0 - depthT) * 0.15;
  color += reflectColor * nearBoost * rimMask * 0.5;

  gl_FragColor = vec4(color, 1.0);
}`;
