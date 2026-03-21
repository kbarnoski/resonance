import { U, SMOOTH_NOISE, VISIONARY_PALETTE } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  `
// River — flowing water currents with layered depth and caustic light.
// Multiple translucent ribbons of blue-green flow diagonally at different speeds.
// Organic noise creates natural motion; caustic highlights dance on the surface.

// Caustic pattern from overlapping sine ridges
float causticPattern(vec2 p, float t) {
  float c = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float angle = fi * 0.9 + t * 0.08;
    vec2 dir = vec2(cos(angle), sin(angle));
    c += sin(dot(p, dir) * (6.0 + fi * 2.0) + t * (0.3 + fi * 0.15)) * 0.25;
  }
  return c * c; // squared for sharper bright spots
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.12;

  // Diagonal flow direction — slight organic drift over time
  float flowAngle = 0.45 + sin(t * 0.07) * 0.08;
  vec2 flowDir = vec2(cos(flowAngle), sin(flowAngle));
  vec2 perpDir = vec2(-flowDir.y, flowDir.x);

  // ── Layer 1: Deep slow current ──
  vec2 p1 = uv + flowDir * t * 1.2;
  float n1 = fbm(p1 * 1.8 + vec2(0.0, t * 0.15));
  float stream1 = smoothstep(-0.3, 0.5, n1) * 0.6;
  // Lateral displacement for organic ribbon shape
  float ribbon1 = sin(dot(uv, perpDir) * 4.0 + n1 * 2.0 + t * 0.2) * 0.5 + 0.5;
  stream1 *= ribbon1;

  // ── Layer 2: Mid-speed current ──
  vec2 p2 = uv + flowDir * t * 2.0 + vec2(3.7, 1.2);
  float n2 = fbm(p2 * 2.5 + vec2(t * 0.2, 0.0));
  float stream2 = smoothstep(-0.2, 0.6, n2) * 0.5;
  float ribbon2 = sin(dot(uv, perpDir) * 6.0 + n2 * 3.0 + t * 0.35) * 0.5 + 0.5;
  stream2 *= ribbon2;

  // ── Layer 3: Fast surface current ──
  vec2 p3 = uv + flowDir * t * 3.5 + vec2(7.1, 5.3);
  float n3 = fbm(p3 * 3.2 + vec2(t * 0.3, t * 0.1));
  float stream3 = smoothstep(-0.1, 0.7, n3) * 0.4;
  float ribbon3 = sin(dot(uv, perpDir) * 9.0 + n3 * 2.5 + t * 0.5) * 0.5 + 0.5;
  stream3 *= ribbon3;

  // ── Layer 4: Fine detail ripples ──
  vec2 p4 = uv + flowDir * t * 5.0 + vec2(13.0, 9.0);
  float n4 = snoise(p4 * 6.0 + vec2(t * 0.4, t * 0.15));
  float detail = smoothstep(0.1, 0.6, n4) * 0.25;

  // ── Caustic light dancing on the surface ──
  vec2 causticUV = uv * 5.0 + flowDir * t * 1.5;
  causticUV += vec2(snoise(uv * 3.0 + t * 0.2) * 0.15, snoise(uv * 3.0 + t * 0.15 + 5.0) * 0.15);
  float caustics = causticPattern(causticUV, t * 3.0);
  caustics = pow(max(caustics, 0.0), 2.0) * 0.6;

  // ── Colors ──
  // Deep teal base
  vec3 deepColor = palette(
    stream1 * 0.4 + paletteShift,
    vec3(0.02, 0.08, 0.12),
    vec3(0.05, 0.10, 0.15),
    vec3(0.4, 0.7, 0.8),
    vec3(0.10, 0.20, 0.30)
  );

  // Aquamarine mid-layer
  vec3 midColor = palette(
    stream2 * 0.5 + n2 * 0.2 + paletteShift + 0.2,
    vec3(0.06, 0.18, 0.22),
    vec3(0.10, 0.20, 0.25),
    vec3(0.5, 0.8, 0.7),
    vec3(0.05, 0.15, 0.25)
  );

  // Bright surface layer — lighter aqua
  vec3 surfColor = palette(
    stream3 * 0.6 + n3 * 0.3 + paletteShift + 0.4,
    vec3(0.12, 0.28, 0.30),
    vec3(0.15, 0.25, 0.28),
    vec3(0.6, 0.9, 0.8),
    vec3(0.0, 0.10, 0.20)
  );

  // Caustic highlight — near white with a touch of cyan
  vec3 causticColor = palette(
    caustics * 0.3 + paletteShift + 0.6,
    vec3(0.65, 0.80, 0.85),
    vec3(0.25, 0.18, 0.15),
    vec3(0.3, 0.5, 0.6),
    vec3(0.0, 0.05, 0.10)
  );

  // ── Composite ──
  vec3 color = deepColor;
  color = mix(color, midColor, stream2 * 0.7);
  color = mix(color, surfColor, stream3 * 0.6);
  color += surfColor * detail * 0.3;
  color += causticColor * caustics;

  // White foam hints on the brightest current edges
  float foam = pow(max(stream3 * ribbon3, 0.0), 3.0) * 0.35;
  color += vec3(0.7, 0.85, 0.9) * foam;

  // Subtle depth darkening at the edges of flow
  float flowIntensity = stream1 + stream2 + stream3;
  color *= 0.7 + flowIntensity * 0.4;

  // Very gentle audio influence — bass deepens the color slightly
  color *= 1.0 + u_bass * 0.08;

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
