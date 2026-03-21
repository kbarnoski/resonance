import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Hexagonal coordinate system
vec4 hexCoord(vec2 p) {
  vec2 a = mod(p, vec2(1.0, sqrt(3.0))) - vec2(0.5, sqrt(3.0) * 0.5);
  vec2 b = mod(p + vec2(0.5, sqrt(3.0) * 0.5), vec2(1.0, sqrt(3.0))) - vec2(0.5, sqrt(3.0) * 0.5);
  float da = dot(a, a);
  float db = dot(b, b);
  return (da < db) ? vec4(a, p - a) : vec4(b, p - b);
}

// Triangle grid distance
float triGrid(vec2 p, float scale) {
  p *= scale;
  vec2 q = abs(p);
  float d = max(q.x * 0.866 + q.y * 0.5, q.y);
  return fract(d);
}

// Square grid
vec2 squareCell(vec2 p, float scale) {
  return fract(p * scale) - 0.5;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // Gentle rotation
  vec2 uvR = rot2(t * 0.08 + u_mid * 0.04) * uv;

  // Morph parameter: cycles through triangle -> square -> hexagon
  // Bass pulses accelerate the morph
  float morphCycle = t * 0.4 + u_bass * 0.3;
  float morphPhase = fract(morphCycle / 3.0) * 3.0; // 0-3 range

  // Smooth morph weights
  float triWeight = smoothstep(0.0, 0.5, morphPhase) * smoothstep(1.5, 1.0, morphPhase);
  float sqWeight  = smoothstep(1.0, 1.5, morphPhase) * smoothstep(2.5, 2.0, morphPhase);
  float hexWeight = smoothstep(2.0, 2.5, morphPhase) + smoothstep(0.5, 0.0, morphPhase);

  // Normalize
  float total = triWeight + sqWeight + hexWeight + 0.001;
  triWeight /= total;
  sqWeight /= total;
  hexWeight /= total;

  float scale = 4.0 + u_amplitude * 1.0;
  vec2 p = uvR * scale;

  // === Triangle tessellation ===
  vec2 triP = p;
  triP = rot2(0.5236) * triP; // 30 degree rotation for equilateral
  float triSize = 1.0;

  // Triangle grid: use barycentric-like coordinates
  vec2 triCell = floor(triP / triSize);
  vec2 triLocal = fract(triP / triSize);

  // Which triangle within the cell (upper or lower)
  float triSide = step(triLocal.x + triLocal.y, 1.0);
  float triId = triCell.x * 7.0 + triCell.y * 13.0 + triSide * 3.0;

  // Distance to triangle edges
  float triEdge1 = abs(triLocal.x);
  float triEdge2 = abs(triLocal.y);
  float triEdge3 = abs(triLocal.x + triLocal.y - 1.0) * 0.707;
  float triEdgeDist = min(min(triEdge1, triEdge2), triEdge3);
  float triLine = smoothstep(0.04, 0.0, triEdgeDist);

  // === Square tessellation ===
  vec2 sqP = p;
  vec2 sqCell = floor(sqP);
  vec2 sqLocal = fract(sqP) - 0.5;
  float sqId = sqCell.x * 7.0 + sqCell.y * 13.0;

  // Distance to square edges
  vec2 sqEdge = abs(sqLocal);
  float sqEdgeDist = min(abs(sqEdge.x - 0.5), abs(sqEdge.y - 0.5));
  float sqLine = smoothstep(0.04, 0.0, sqEdgeDist);

  // === Hexagonal tessellation ===
  vec4 hexData = hexCoord(p * 0.6);
  vec2 hexLocal = hexData.xy;
  vec2 hexCenter = hexData.zw;
  float hexId = hexCenter.x * 7.0 + hexCenter.y * 13.0;

  // Distance to hex edges
  float hexR = length(hexLocal);
  float hexAngle = atan(hexLocal.y, hexLocal.x);
  float hexEdgeDist = cos(mod(hexAngle, 1.0472) - 0.5236) * hexR; // 60-degree sectors
  hexEdgeDist = 0.5 - hexEdgeDist;
  float hexLine = smoothstep(0.04, 0.0, hexEdgeDist);

  // Blend the three tessellations
  float blendedLine = triLine * triWeight + sqLine * sqWeight + hexLine * hexWeight;
  float blendedId = triId * triWeight + sqId * sqWeight + hexId * hexWeight;
  float blendedFill = 1.0 - blendedLine;

  // Tile color based on blended cell ID
  vec3 tileCol = palette(
    blendedId * 0.05 + t * 0.2 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.8, 0.5),
    vec3(0.0, 0.1, 0.25)
  );

  // Tile fill: each tile pulses at its own rate
  float tilePulse = 0.4 + 0.4 * sin(blendedId * 2.3 + t * 3.0 + u_mid * 2.0);
  color += tileCol * blendedFill * tilePulse * 0.35;

  // Edge color
  vec3 edgeCol = palette(
    blendedId * 0.03 + t * 0.4 + paletteShift + 0.4,
    vec3(0.7, 0.7, 0.8),
    vec3(0.5, 0.4, 0.6),
    vec3(0.8, 0.9, 1.0),
    vec3(0.05, 0.1, 0.35)
  );
  color += edgeCol * blendedLine * 0.9;
  color += vec3(1.0, 0.95, 0.9) * blendedLine * 0.3;

  // Morph phase indicator: subtle background hue shift
  vec3 phaseCol = palette(
    morphPhase * 0.33 + paletteShift + 0.6,
    vec3(0.05, 0.05, 0.08),
    vec3(0.05, 0.05, 0.1),
    vec3(0.4, 0.6, 1.0),
    vec3(0.1, 0.15, 0.35)
  );
  float bgDist = length(uv);
  color += phaseCol * smoothstep(1.2, 0.0, bgDist) * 0.06;

  // Treble: vertex sparkle at tile intersections
  float vertexGlow = smoothstep(0.08, 0.03, triEdgeDist * triWeight + sqEdgeDist * sqWeight + hexEdgeDist * hexWeight);
  vertexGlow *= blendedLine;
  color += vec3(1.0, 0.92, 0.85) * vertexGlow * u_treble * 0.5;

  // Bass: center pulse
  float centerPulse = smoothstep(0.6, 0.0, bgDist) * u_bass * 0.15;
  color += tileCol * centerPulse;

  // Vignette
  float vign = 1.0 - smoothstep(0.5, 1.5, bgDist);
  color *= vign;

  gl_FragColor = vec4(color, 1.0);
}
`;
