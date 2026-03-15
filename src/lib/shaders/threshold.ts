import { U, VISIONARY_PALETTE, SMOOTH_NOISE } from "./shared";

// Looking through a narrow passage into infinite blinding light beyond.
// Dark walls converging toward an unreachable bright vanishing point.
export const FRAG = U + VISIONARY_PALETTE + SMOOTH_NOISE + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.28;

  // Vanishing point at exact center — all perspective lines converge there
  // Distance from center drives depth: center = infinity, edge = near
  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Passage walls: view as corridor with rectangular cross-section
  // The "walls" are lines that converge to the center
  // Map uv to a polar wedge: angle defines which wall face
  vec2 absUV = abs(uv);
  float wallDist; // signed distance to nearest corridor wall

  // Box passage: the corridor has a cross-section, narrowing to center
  // perspective scale: things at distance 1/r appear with scale r
  float perspectiveScale = 0.35 + u_bass * 0.06; // passage half-width at "near" plane
  float passageHalfW = perspectiveScale * r;       // narrows toward center

  // Which wall face are we on?
  float wallX = absUV.x - passageHalfW;
  float wallY = absUV.y - passageHalfW;
  float wallDist2 = max(wallX, wallY); // inside passage if < 0, on wall if > 0

  // Inside passage: looking through into light
  float insideMask = step(wallDist2, 0.0);

  // FBM texture on walls
  float warpU = angle + t * 0.2;
  float wallNoise = fbm(vec2(warpU * 3.0, log(r + 0.01) * 5.0 + t * 0.3)) * 0.5 + 0.5;

  // Wall surface: dark stone with depth-based color
  float wallDepth = 1.0 - r; // walls near edge = shallow, near center = deep
  float wallBrightness = wallNoise * wallDepth * 0.4;

  // Corridor receding lines — perspective grid lines on floor/ceiling/walls
  float logR = log(r * 8.0 + 1.0);
  float gridLines = abs(sin(logR * 12.0 - t * 2.0 + u_mid * 1.5));
  gridLines = 1.0 - smoothstep(0.85, 1.0, gridLines); // thin dark lines
  gridLines *= (1.0 - insideMask) * 0.5; // only on walls

  // The light beyond: bright center glow, infinitely distant
  float lightR = r;
  // Light bleeds out from center through the passage
  float lightCore = exp(-lightR * lightR * 18.0) * (1.5 + u_amplitude * 1.2);
  float lightHalo = exp(-lightR * 3.5) * (0.5 + u_bass * 0.3);
  // Light only visible inside passage
  float lightVisible = insideMask * (lightCore + lightHalo * 0.4);

  // God rays: radial streaks emanating from the light
  float rayAngle = abs(sin(angle * 8.0 + t * 0.5));
  float rays = pow(rayAngle, 6.0) * exp(-lightR * 4.0) * insideMask * (0.3 + u_treble * 0.5);

  // Chromatic aberration at passage edges — light bending around corner
  float edgeGlow = smoothstep(0.0, 0.04, abs(wallDist2)) * exp(-r * 2.0) *
                   (1.0 - insideMask) * (0.5 + u_treble * 0.4);

  // Palette
  vec3 cWall = palette(wallNoise * 0.4 + wallDepth * 0.3 + paletteShift,
    vec3(0.15, 0.12, 0.18), vec3(0.2, 0.15, 0.25), vec3(1.0, 0.8, 1.2), vec3(0.0, 0.2, 0.5));
  vec3 cLight = palette(lightR * 0.5 + t * 0.05 + paletteShift * 0.5,
    vec3(0.95, 0.92, 0.85), vec3(0.1, 0.1, 0.2), vec3(0.8, 1.0, 1.2), vec3(0.0, 0.05, 0.1));
  vec3 cEdge = palette(angle * 0.3 + t * 0.1 + paletteShift,
    vec3(0.6, 0.5, 0.8), vec3(0.5, 0.4, 0.3), vec3(1.0, 1.2, 0.8), vec3(0.3, 0.0, 0.2));

  vec3 color = cWall * (wallBrightness + gridLines) * (1.0 - insideMask);
  color += cLight * lightVisible;
  color += vec3(1.0, 0.98, 0.95) * rays;
  color += cEdge * edgeGlow;

  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
