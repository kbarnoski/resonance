import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Per-flower pseudo-random
float hash1(vec2 p) {
  return fract(sin(dot(p, vec2(127.391, 311.709))) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.07;
  float paletteShift = u_amplitude * 0.08;

  // Dark background — flowers float in void
  vec3 bgColor = palette(
    t * 0.01 + paletteShift,
    vec3(0.02, 0.01, 0.03),
    vec3(0.02, 0.01, 0.02),
    vec3(0.3, 0.2, 0.4),
    vec3(0.0, 0.05, 0.15)
  );
  vec3 color = bgColor;

  // ── 7 flowers, each with unique position, size, petal count ──
  // Flower definitions: vec4(centerX, centerY, scale, petalCount)
  // Manually unrolled to avoid int-float issues in GLSL ES 1.0

  // Flower 0
  float fc0 = 0.0;
  vec2 center0 = vec2(-0.45, 0.30);
  float scale0 = 0.28;
  float petals0 = 5.0;

  // Flower 1
  float fc1 = 1.0;
  vec2 center1 = vec2(0.50, -0.25);
  float scale1 = 0.22;
  float petals1 = 7.0;

  // Flower 2
  float fc2 = 2.0;
  vec2 center2 = vec2(-0.15, -0.50);
  float scale2 = 0.32;
  float petals2 = 3.0;

  // Flower 3
  float fc3 = 3.0;
  vec2 center3 = vec2(0.35, 0.45);
  float scale3 = 0.18;
  float petals3 = 8.0;

  // Flower 4
  float fc4 = 4.0;
  vec2 center4 = vec2(-0.55, -0.20);
  float scale4 = 0.20;
  float petals4 = 5.0;

  // Flower 5
  float fc5 = 5.0;
  vec2 center5 = vec2(0.10, 0.15);
  float scale5 = 0.35;
  float petals5 = 6.0;

  // Flower 6
  float fc6 = 6.0;
  vec2 center6 = vec2(0.55, 0.10);
  float scale6 = 0.15;
  float petals6 = 4.0;

  // ── Render each flower ──
  // Macro: compute flower contribution for given params
  // We accumulate into color additively

  // --- Flower 0 ---
  {
    vec2 p = uv - center0;
    float drift = t * 0.15 + fc0 * 2.1;
    p += vec2(sin(drift) * 0.03, cos(drift * 0.7) * 0.02);
    float rotAngle = t * 0.08 + fc0 * 1.2;
    p = rot2(rotAngle) * p;
    p /= scale0;
    float a = atan(p.y, p.x);
    float r = length(p);
    float openAmount = 0.55 + 0.35 * sin(t * 0.4 + fc0 * 1.7);
    float petalShape = 0.5 + 0.5 * cos(a * petals0);
    petalShape = pow(petalShape, 1.4);
    float petalEdge = petalShape * openAmount;
    float petal = smoothstep(petalEdge + 0.04, petalEdge - 0.04, r);
    float innerGlow = smoothstep(0.6, 0.0, r) * petal;
    float disk = smoothstep(0.12, 0.0, r);
    vec3 pCol = palette(
      fc0 * 0.15 + t * 0.02 + paletteShift,
      vec3(0.55, 0.30, 0.40),
      vec3(0.45, 0.30, 0.35),
      vec3(1.0, 0.7, 0.8),
      vec3(0.0, 0.15, 0.45)
    );
    vec3 dCol = palette(
      fc0 * 0.2 + t * 0.03 + paletteShift + 0.5,
      vec3(0.60, 0.50, 0.20),
      vec3(0.40, 0.35, 0.15),
      vec3(1.0, 0.85, 0.4),
      vec3(0.1, 0.0, 0.25)
    );
    float glow = exp(-r * r * 3.0) * scale0 * 0.6;
    color += pCol * petal * 0.7;
    color += pCol * innerGlow * 0.3;
    color += dCol * disk * 1.2;
    color += pCol * glow * 0.15;
  }

  // --- Flower 1 ---
  {
    vec2 p = uv - center1;
    float drift = t * 0.15 + fc1 * 2.1;
    p += vec2(sin(drift) * 0.03, cos(drift * 0.7) * 0.02);
    float rotAngle = t * 0.08 + fc1 * 1.2;
    p = rot2(rotAngle) * p;
    p /= scale1;
    float a = atan(p.y, p.x);
    float r = length(p);
    float openAmount = 0.55 + 0.35 * sin(t * 0.4 + fc1 * 1.7);
    float petalShape = 0.5 + 0.5 * cos(a * petals1);
    petalShape = pow(petalShape, 1.4);
    float petalEdge = petalShape * openAmount;
    float petal = smoothstep(petalEdge + 0.04, petalEdge - 0.04, r);
    float innerGlow = smoothstep(0.6, 0.0, r) * petal;
    float disk = smoothstep(0.12, 0.0, r);
    vec3 pCol = palette(
      fc1 * 0.15 + t * 0.02 + paletteShift,
      vec3(0.55, 0.30, 0.40),
      vec3(0.45, 0.30, 0.35),
      vec3(1.0, 0.7, 0.8),
      vec3(0.0, 0.15, 0.45)
    );
    vec3 dCol = palette(
      fc1 * 0.2 + t * 0.03 + paletteShift + 0.5,
      vec3(0.60, 0.50, 0.20),
      vec3(0.40, 0.35, 0.15),
      vec3(1.0, 0.85, 0.4),
      vec3(0.1, 0.0, 0.25)
    );
    float glow = exp(-r * r * 3.0) * scale1 * 0.6;
    color += pCol * petal * 0.7;
    color += pCol * innerGlow * 0.3;
    color += dCol * disk * 1.2;
    color += pCol * glow * 0.15;
  }

  // --- Flower 2 ---
  {
    vec2 p = uv - center2;
    float drift = t * 0.15 + fc2 * 2.1;
    p += vec2(sin(drift) * 0.03, cos(drift * 0.7) * 0.02);
    float rotAngle = t * 0.08 + fc2 * 1.2;
    p = rot2(rotAngle) * p;
    p /= scale2;
    float a = atan(p.y, p.x);
    float r = length(p);
    float openAmount = 0.55 + 0.35 * sin(t * 0.4 + fc2 * 1.7);
    float petalShape = 0.5 + 0.5 * cos(a * petals2);
    petalShape = pow(petalShape, 1.4);
    float petalEdge = petalShape * openAmount;
    float petal = smoothstep(petalEdge + 0.04, petalEdge - 0.04, r);
    float innerGlow = smoothstep(0.6, 0.0, r) * petal;
    float disk = smoothstep(0.12, 0.0, r);
    vec3 pCol = palette(
      fc2 * 0.15 + t * 0.02 + paletteShift + 0.1,
      vec3(0.60, 0.25, 0.45),
      vec3(0.40, 0.25, 0.35),
      vec3(1.0, 0.6, 0.9),
      vec3(0.0, 0.20, 0.40)
    );
    vec3 dCol = palette(
      fc2 * 0.2 + t * 0.03 + paletteShift + 0.5,
      vec3(0.60, 0.50, 0.20),
      vec3(0.40, 0.35, 0.15),
      vec3(1.0, 0.85, 0.4),
      vec3(0.1, 0.0, 0.25)
    );
    float glow = exp(-r * r * 3.0) * scale2 * 0.6;
    color += pCol * petal * 0.7;
    color += pCol * innerGlow * 0.3;
    color += dCol * disk * 1.2;
    color += pCol * glow * 0.15;
  }

  // --- Flower 3 ---
  {
    vec2 p = uv - center3;
    float drift = t * 0.15 + fc3 * 2.1;
    p += vec2(sin(drift) * 0.03, cos(drift * 0.7) * 0.02);
    float rotAngle = t * 0.08 + fc3 * 1.2;
    p = rot2(rotAngle) * p;
    p /= scale3;
    float a = atan(p.y, p.x);
    float r = length(p);
    float openAmount = 0.55 + 0.35 * sin(t * 0.4 + fc3 * 1.7);
    float petalShape = 0.5 + 0.5 * cos(a * petals3);
    petalShape = pow(petalShape, 1.4);
    float petalEdge = petalShape * openAmount;
    float petal = smoothstep(petalEdge + 0.04, petalEdge - 0.04, r);
    float innerGlow = smoothstep(0.6, 0.0, r) * petal;
    float disk = smoothstep(0.12, 0.0, r);
    vec3 pCol = palette(
      fc3 * 0.15 + t * 0.02 + paletteShift + 0.2,
      vec3(0.50, 0.35, 0.50),
      vec3(0.35, 0.30, 0.40),
      vec3(0.9, 0.7, 1.0),
      vec3(0.05, 0.10, 0.35)
    );
    vec3 dCol = palette(
      fc3 * 0.2 + t * 0.03 + paletteShift + 0.5,
      vec3(0.60, 0.50, 0.20),
      vec3(0.40, 0.35, 0.15),
      vec3(1.0, 0.85, 0.4),
      vec3(0.1, 0.0, 0.25)
    );
    float glow = exp(-r * r * 3.0) * scale3 * 0.6;
    color += pCol * petal * 0.7;
    color += pCol * innerGlow * 0.3;
    color += dCol * disk * 1.2;
    color += pCol * glow * 0.15;
  }

  // --- Flower 4 ---
  {
    vec2 p = uv - center4;
    float drift = t * 0.15 + fc4 * 2.1;
    p += vec2(sin(drift) * 0.03, cos(drift * 0.7) * 0.02);
    float rotAngle = t * 0.08 + fc4 * 1.2;
    p = rot2(rotAngle) * p;
    p /= scale4;
    float a = atan(p.y, p.x);
    float r = length(p);
    float openAmount = 0.55 + 0.35 * sin(t * 0.4 + fc4 * 1.7);
    float petalShape = 0.5 + 0.5 * cos(a * petals4);
    petalShape = pow(petalShape, 1.4);
    float petalEdge = petalShape * openAmount;
    float petal = smoothstep(petalEdge + 0.04, petalEdge - 0.04, r);
    float innerGlow = smoothstep(0.6, 0.0, r) * petal;
    float disk = smoothstep(0.12, 0.0, r);
    vec3 pCol = palette(
      fc4 * 0.15 + t * 0.02 + paletteShift + 0.05,
      vec3(0.55, 0.30, 0.40),
      vec3(0.45, 0.30, 0.35),
      vec3(1.0, 0.7, 0.8),
      vec3(0.0, 0.15, 0.45)
    );
    vec3 dCol = palette(
      fc4 * 0.2 + t * 0.03 + paletteShift + 0.5,
      vec3(0.60, 0.50, 0.20),
      vec3(0.40, 0.35, 0.15),
      vec3(1.0, 0.85, 0.4),
      vec3(0.1, 0.0, 0.25)
    );
    float glow = exp(-r * r * 3.0) * scale4 * 0.6;
    color += pCol * petal * 0.7;
    color += pCol * innerGlow * 0.3;
    color += dCol * disk * 1.2;
    color += pCol * glow * 0.15;
  }

  // --- Flower 5 (large center flower) ---
  {
    vec2 p = uv - center5;
    float drift = t * 0.15 + fc5 * 2.1;
    p += vec2(sin(drift) * 0.03, cos(drift * 0.7) * 0.02);
    float rotAngle = t * 0.08 + fc5 * 1.2;
    p = rot2(rotAngle) * p;
    p /= scale5;
    float a = atan(p.y, p.x);
    float r = length(p);
    float openAmount = 0.55 + 0.35 * sin(t * 0.4 + fc5 * 1.7);
    float petalShape = 0.5 + 0.5 * cos(a * petals5);
    petalShape = pow(petalShape, 1.4);
    float petalEdge = petalShape * openAmount;
    float petal = smoothstep(petalEdge + 0.04, petalEdge - 0.04, r);
    float innerGlow = smoothstep(0.6, 0.0, r) * petal;
    float disk = smoothstep(0.12, 0.0, r);
    vec3 pCol = palette(
      fc5 * 0.15 + t * 0.02 + paletteShift + 0.15,
      vec3(0.58, 0.28, 0.42),
      vec3(0.42, 0.28, 0.38),
      vec3(1.0, 0.65, 0.85),
      vec3(0.0, 0.18, 0.42)
    );
    vec3 dCol = palette(
      fc5 * 0.2 + t * 0.03 + paletteShift + 0.5,
      vec3(0.65, 0.55, 0.22),
      vec3(0.40, 0.38, 0.18),
      vec3(1.0, 0.90, 0.5),
      vec3(0.1, 0.0, 0.25)
    );
    float glow = exp(-r * r * 3.0) * scale5 * 0.6;
    color += pCol * petal * 0.7;
    color += pCol * innerGlow * 0.3;
    color += dCol * disk * 1.2;
    color += pCol * glow * 0.15;
  }

  // --- Flower 6 (small accent) ---
  {
    vec2 p = uv - center6;
    float drift = t * 0.15 + fc6 * 2.1;
    p += vec2(sin(drift) * 0.03, cos(drift * 0.7) * 0.02);
    float rotAngle = t * 0.08 + fc6 * 1.2;
    p = rot2(rotAngle) * p;
    p /= scale6;
    float a = atan(p.y, p.x);
    float r = length(p);
    float openAmount = 0.55 + 0.35 * sin(t * 0.4 + fc6 * 1.7);
    float petalShape = 0.5 + 0.5 * cos(a * petals6);
    petalShape = pow(petalShape, 1.4);
    float petalEdge = petalShape * openAmount;
    float petal = smoothstep(petalEdge + 0.04, petalEdge - 0.04, r);
    float innerGlow = smoothstep(0.6, 0.0, r) * petal;
    float disk = smoothstep(0.12, 0.0, r);
    vec3 pCol = palette(
      fc6 * 0.15 + t * 0.02 + paletteShift + 0.25,
      vec3(0.50, 0.35, 0.45),
      vec3(0.40, 0.30, 0.40),
      vec3(0.9, 0.75, 0.95),
      vec3(0.05, 0.12, 0.38)
    );
    vec3 dCol = palette(
      fc6 * 0.2 + t * 0.03 + paletteShift + 0.5,
      vec3(0.60, 0.50, 0.20),
      vec3(0.40, 0.35, 0.15),
      vec3(1.0, 0.85, 0.4),
      vec3(0.1, 0.0, 0.25)
    );
    float glow = exp(-r * r * 3.0) * scale6 * 0.6;
    color += pCol * petal * 0.7;
    color += pCol * innerGlow * 0.3;
    color += dCol * disk * 1.2;
    color += pCol * glow * 0.15;
  }

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
