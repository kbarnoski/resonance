import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Memory of divine knowledge: layers of translucent golden symbols fading in/out,
// ancient glyphs dissolving and reforming like half-remembered truths.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Pseudo-random glyph cell — returns (edgeDist, cellId)
vec2 glyphCell(vec2 p, float seed) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float id = fract(sin(dot(i, vec2(127.1, 311.7)) + seed) * 43758.5);
  // Cross / circle / diamond shape per cell
  float shape;
  if (id < 0.33) {
    // Cross
    float cx = smoothstep(0.08, 0.0, abs(f.x - 0.5) - 0.02) * step(abs(f.y - 0.5), 0.35);
    float cy = smoothstep(0.08, 0.0, abs(f.y - 0.5) - 0.02) * step(abs(f.x - 0.5), 0.35);
    shape = max(cx, cy);
  } else if (id < 0.66) {
    // Circle
    shape = smoothstep(0.04, 0.0, abs(length(f - 0.5) - 0.3));
  } else {
    // Diamond
    float dd = abs(f.x - 0.5) + abs(f.y - 0.5);
    shape = smoothstep(0.04, 0.0, abs(dd - 0.35));
  }
  return vec2(shape, id);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  vec3 color = vec3(0.0);

  // Multiple layers of symbol fields at different scales, rotations, fade cycles
  for (int layer = 0; layer < 4; layer++) {
    float fl = float(layer);
    float scale = 4.0 + fl * 2.5;
    float fadePhase = t * 0.7 + fl * 1.57;
    float opacity = pow(sin(fadePhase) * 0.5 + 0.5, 2.0); // fade in/out

    // Rotate each layer
    vec2 ruv = rot2(t * 0.15 * (mod(fl, 2.0) < 0.5 ? 1.0 : -1.0) + fl * 0.4) * uv;

    // Drift
    ruv += vec2(sin(t * 0.3 + fl), cos(t * 0.2 + fl * 1.3)) * 0.1;

    vec2 glyph = glyphCell(ruv * scale, fl * 7.0 + t * 0.05);

    // Color per layer — warm golds to deep violets
    vec3 layerCol = palette(
      fl * 0.22 + glyph.y * 0.3 + paletteShift,
      vec3(0.7, 0.55, 0.3),
      vec3(0.4, 0.35, 0.3),
      vec3(1.0, 0.8, 0.5),
      vec3(0.0, 0.1, 0.3)
    );

    float dist = smoothstep(1.2, 0.2, r); // center bias
    float layerFade = 1.0 / (1.0 + fl * 0.4);

    color += layerCol * glyph.x * opacity * dist * layerFade * (0.6 + 0.4 * u_mid);
  }

  // FBM haze — golden mist underneath the symbols
  float mist = fbm(uv * 3.0 + vec2(t * 0.15, t * 0.1));
  mist = smoothstep(-0.2, 0.5, mist) * 0.25;
  vec3 mistCol = palette(
    t * 0.05 + paletteShift + 0.5,
    vec3(0.6, 0.5, 0.3),
    vec3(0.3, 0.25, 0.2),
    vec3(1.0, 0.9, 0.6),
    vec3(0.05, 0.1, 0.2)
  );
  color += mistCol * mist * smoothstep(1.0, 0.2, r);

  // Central glow — the source of remembering
  float core = exp(-r * r * 8.0) * (0.5 + 0.5 * u_bass);
  vec3 coreCol = palette(
    t * 0.1 + paletteShift,
    vec3(0.8, 0.7, 0.5),
    vec3(0.2, 0.2, 0.2),
    vec3(1.0, 0.9, 0.7),
    vec3(0.0, 0.05, 0.1)
  );
  color += coreCol * core;

  // Treble shimmer on symbol edges
  float shimmer = snoise(uv * 20.0 + t * 2.0) * u_treble * 0.15;
  color += vec3(1.0, 0.95, 0.8) * max(shimmer, 0.0) * smoothstep(1.0, 0.3, r);

  // Vignette
  color *= smoothstep(1.4, 0.35, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
