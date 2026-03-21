import { U, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  VISIONARY_PALETTE +
  ROT2 +
  `
// ---- Frieze Pattern ----
// Repeating border/band pattern with translational symmetry.
// Combines multiple wallpaper-like motifs in horizontal bands.

float wave(float x, float freq, float phase) {
  return sin(x * freq + phase);
}

float friezeMotif(vec2 p, float t) {
  // Sinusoidal interlocking bands
  float y1 = wave(p.x, 6.0, t) * 0.15;
  float y2 = wave(p.x, 6.0, t + 3.14159) * 0.15;

  float d1 = abs(p.y - y1);
  float d2 = abs(p.y - y2);

  // Over/under weaving
  float weave = sin(p.x * 3.0 + t * 0.5);
  float band1 = smoothstep(0.04, 0.01, d1) * (weave > 0.0 ? 1.0 : 0.5);
  float band2 = smoothstep(0.04, 0.01, d2) * (weave > 0.0 ? 0.5 : 1.0);

  return band1 + band2;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  vec3 color = vec3(0.0);

  // Multiple horizontal frieze bands at different y positions
  for (int i = -2; i <= 2; i++) {
    float fi = float(i);
    float bandY = fi * 0.25;
    vec2 p = uv - vec2(0.0, bandY);

    // Scale and scroll each band
    float scrollSpeed = 0.3 + abs(fi) * 0.1;
    p.x += t * scrollSpeed * sign(fi + 0.1);
    p *= 2.5 + u_bass * 0.5;

    float motif = friezeMotif(p, t * 0.8 + fi);

    // Distance to band center for fade
    float bandDist = abs(uv.y - bandY);
    float bandMask = smoothstep(0.15, 0.05, bandDist);

    vec3 bandCol = palette(
      fi * 0.2 + t * 0.2 + u_amplitude * 0.25 + 0.5,
      vec3(0.5, 0.5, 0.55),
      vec3(0.4, 0.42, 0.5),
      vec3(0.7, 0.85, 1.0),
      vec3(0.0, 0.1, 0.25)
    );

    color += bandCol * motif * bandMask * 0.5;

    // Edge glow for each band
    float edgeGlow = exp(-bandDist * bandDist * 200.0) * 0.15;
    vec3 edgeCol = palette(
      fi * 0.3 + t * 0.3,
      vec3(0.55, 0.55, 0.6),
      vec3(0.3, 0.32, 0.4),
      vec3(0.5, 0.7, 1.0),
      vec3(0.1, 0.1, 0.3)
    );
    color += edgeCol * edgeGlow;
  }

  // Connecting vertical elements between bands
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float x = fi * 0.25 - 1.0 + fract(t * 0.1) * 0.25;
    float vertDist = abs(uv.x - x);
    float vertLine = exp(-vertDist * 60.0) * 0.12;

    // Diamond motifs at intersections
    for (int j = -2; j <= 2; j++) {
      float fj = float(j);
      vec2 diamond = vec2(x, fj * 0.25);
      vec2 dp = abs(uv - diamond);
      float diamondDist = dp.x + dp.y; // Manhattan distance = diamond shape
      float diamondGlow = exp(-diamondDist * 30.0) * 0.2;
      vec3 diamondCol = palette(
        fi * 0.15 + fj * 0.2 + t * 0.35,
        vec3(0.6, 0.6, 0.65),
        vec3(0.3, 0.3, 0.4),
        vec3(0.5, 0.7, 1.0),
        vec3(0.1, 0.12, 0.3)
      );
      color += diamondCol * diamondGlow * (0.4 + u_treble * 0.4);
    }

    color += vec3(0.2, 0.25, 0.35) * vertLine * u_mid;
  }

  // Audio-reactive shimmer across bands
  float shimmer = sin(uv.x * 30.0 + t * 4.0) * sin(uv.y * 20.0 + t * 3.0);
  shimmer = max(shimmer, 0.0);
  color += vec3(0.15, 0.2, 0.3) * shimmer * 0.05 * u_amplitude;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
