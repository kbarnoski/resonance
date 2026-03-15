import { U, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG = U + VISIONARY_PALETTE + ROT2 + SDF_PRIMITIVES + `

// Flower of Life: 7 overlapping circles
float flowerOfLife(vec2 p, float radius) {
  float r = radius;
  float d = sdCircle(p, r);
  float spacing = r;

  // 6 surrounding circles at 60-degree increments
  for (int i = 0; i < 6; i++) {
    float angle = float(i) * 1.0471975;
    vec2 offset = vec2(cos(angle), sin(angle)) * spacing;
    d = min(d, sdCircle(p - offset, r));
  }
  return d;
}

// Helper: compute node position for Metatron's Cube
vec2 metNode(int idx, float radius) {
  // 0: center, 1-6: inner ring, 7-12: outer ring
  if (idx == 0) return vec2(0.0);
  if (idx < 7) {
    float a = float(idx - 1) * 1.0471975;
    return vec2(cos(a), sin(a)) * radius * 0.4;
  }
  float a = float(idx - 7) * 1.0471975 + 0.5235988;
  return vec2(cos(a), sin(a)) * radius * 0.8;
}

// Metatron's Cube: 13 circles + connecting lines
float metatronsCube(vec2 p, float radius) {
  float r = radius * 0.15;
  float d = 1e5;

  // Draw circles at each of the 13 node positions
  for (int i = 0; i < 13; i++) {
    vec2 n = metNode(i, radius);
    d = min(d, sdCircle(p - n, r));
  }

  // Draw connecting lines between all node pairs
  float lines = 1e5;
  for (int i = 0; i < 13; i++) {
    for (int j = 0; j < 13; j++) {
      if (j > i) {
        vec2 ni = metNode(i, radius);
        vec2 nj = metNode(j, radius);
        lines = min(lines, sdLine(p, ni, nj) - 0.003);
      }
    }
  }
  d = min(d, lines);

  return d;
}

// Sri Yantra: 9 interlocking triangles
float sriYantra(vec2 p, float radius) {
  float d = 1e5;

  // 4 upward-pointing triangles at different scales/positions
  d = min(d, abs(sdTriangle(p - vec2(0.0, -radius * 0.05), radius * 0.9)) - 0.005);
  d = min(d, abs(sdTriangle(p - vec2(0.0, radius * 0.08), radius * 0.7)) - 0.005);
  d = min(d, abs(sdTriangle(p - vec2(0.0, -radius * 0.12), radius * 0.5)) - 0.005);
  d = min(d, abs(sdTriangle(p - vec2(0.0, radius * 0.15), radius * 0.3)) - 0.005);

  // 5 downward-pointing triangles (flipped vertically)
  vec2 pFlip = vec2(p.x, -p.y);
  d = min(d, abs(sdTriangle(pFlip - vec2(0.0, -radius * 0.02), radius * 0.85)) - 0.005);
  d = min(d, abs(sdTriangle(pFlip - vec2(0.0, radius * 0.1), radius * 0.65)) - 0.005);
  d = min(d, abs(sdTriangle(pFlip - vec2(0.0, -radius * 0.08), radius * 0.45)) - 0.005);
  d = min(d, abs(sdTriangle(pFlip - vec2(0.0, radius * 0.13), radius * 0.28)) - 0.005);
  d = min(d, abs(sdTriangle(pFlip, radius * 0.15)) - 0.005);

  // Outer circle (bindu)
  d = min(d, abs(sdCircle(p, radius)) - 0.005);

  return d;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.25;

  // Gentle rotation of the whole pattern
  uv = rot2(t * 0.3) * uv;

  float radius = 0.5 + u_bass * 0.08;

  // Compute all three pattern SDFs
  float fol = flowerOfLife(uv, radius);
  float met = metatronsCube(uv, radius);
  float sri = sriYantra(uv, radius);

  // Morph parameter driven by u_amplitude (0 -> FOL, 0.5 -> Metatron, 1.0 -> Sri Yantra)
  float morph = u_amplitude;

  // Blend between patterns
  float pattern;
  if (morph < 0.5) {
    float m = morph * 2.0;
    pattern = mix(fol, met, smoothstep(0.0, 1.0, m));
  } else {
    float m = (morph - 0.5) * 2.0;
    pattern = mix(met, sri, smoothstep(0.0, 1.0, m));
  }

  // Edge glow: sharp geometric lines
  float edge = 1.0 - smoothstep(0.0, 0.015, abs(pattern));

  // Fine detail revealed by treble
  float detail = 1.0 - smoothstep(0.0, 0.005 + 0.01 * (1.0 - u_treble), abs(pattern));

  // Bass pulse: radial pulse outward from center
  float pulse = sin(length(uv) * 15.0 - u_time * 2.0) * 0.5 + 0.5;
  pulse *= u_bass;

  // --- Color: multiple palette lookups ---
  // Palette 1: sacred gold / violet
  vec3 col1 = palette(
    edge * 2.0 + t + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.7, 0.4),
    vec3(0.0, 0.15, 0.2)
  );

  // Palette 2: deep indigo / rose
  vec3 col2 = palette(
    length(uv) * 3.0 + t * 0.5 + paletteShift * 1.3,
    vec3(0.5, 0.4, 0.6),
    vec3(0.5, 0.5, 0.5),
    vec3(0.8, 0.6, 1.0),
    vec3(0.7, 0.1, 0.3)
  );

  // Palette 3: white-cyan for fine detail
  vec3 col3 = palette(
    detail * 1.5 + morph * 2.0 + paletteShift * 0.5,
    vec3(0.7, 0.8, 0.9),
    vec3(0.3, 0.3, 0.3),
    vec3(1.0, 1.0, 1.0),
    vec3(0.1, 0.25, 0.35)
  );

  // Compose color
  vec3 color = vec3(0.0);

  // Base geometry glow
  color += col1 * edge * (0.8 + pulse * 0.6);

  // Secondary color layer
  color += col2 * edge * 0.4;

  // Fine detail layer from treble
  color += col3 * detail * u_treble * 1.5;

  // Emissive highlights -- warm white on the sharpest edges
  float sharpEdge = 1.0 - smoothstep(0.0, 0.004, abs(pattern));
  vec3 warmGlow = vec3(1.4, 1.25, 1.0);
  color += sharpEdge * warmGlow * (0.6 + u_bass * 0.8);

  // Inner glow: soft radial light near center
  float innerGlow = exp(-length(uv) * 4.0);
  vec3 coolCenter = vec3(0.8, 0.95, 1.3);
  color += innerGlow * coolCenter * 0.3 * (1.0 + u_amplitude * 0.5);

  // Subtle intersection highlights
  float folEdge = 1.0 - smoothstep(0.0, 0.01, abs(fol));
  float metEdge = 1.0 - smoothstep(0.0, 0.01, abs(met));
  float intersect = folEdge * metEdge;
  color += intersect * vec3(1.3, 1.1, 1.5) * 0.5;

  // Vignette for black background falloff
  float vignette = 1.0 - smoothstep(0.6, 1.3, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
