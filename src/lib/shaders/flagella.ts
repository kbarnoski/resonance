import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

// Distance to a wavy tendril along a parametric path
float tendrilDist(vec2 uv, vec2 origin, float baseAngle, float len, float t, float seed) {
  float minDist = 100.0;
  float prevX = origin.x;
  float prevY = origin.y;

  // Trace the tendril in segments
  for (int j = 1; j <= 20; j++) {
    float fj = float(j) / 20.0;
    float s = fj * len;

    // Whip-like undulation — amplitude increases toward tip
    float wave = sin(s * 12.0 - t * 4.0 + seed * 6.28) * fj * 0.08;
    float wave2 = sin(s * 20.0 - t * 6.0 + seed * 3.0) * fj * fj * 0.04;

    float cx = origin.x + cos(baseAngle) * s + sin(baseAngle + 1.57) * (wave + wave2);
    float cy = origin.y + sin(baseAngle) * s + cos(baseAngle + 1.57) * (wave + wave2);

    // Distance to line segment
    vec2 pa = uv - vec2(prevX, prevY);
    vec2 ba = vec2(cx - prevX, cy - prevY);
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float d = length(pa - ba * h);

    // Taper width — thick at base, thin at tip
    float width = mix(0.012, 0.002, fj);
    d -= width;

    minDist = min(minDist, d);
    prevX = cx;
    prevY = cy;
  }
  return minDist;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: dark fluid medium ──
  float bgN = fbm(uv * 2.5 + vec2(t * 0.06, -t * 0.04));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.6,
    vec3(0.01, 0.02, 0.04),
    vec3(0.02, 0.03, 0.05),
    vec3(0.3, 0.5, 0.7),
    vec3(0.0, 0.15, 0.4)
  );
  color = bgColor * (bgN * 0.1 + 0.04);

  // ── Scattered microorganisms with flagella ──
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float seed = hash1(fi * 7.31);
    float seed2 = hash1(fi * 13.17 + 2.0);
    float seed3 = hash1(fi * 19.41 + 5.0);

    // Organism position — drifting through the fluid
    vec2 orgPos = vec2(
      sin(t * 0.3 * (0.5 + seed) + seed * 20.0) * 0.6,
      cos(t * 0.25 * (0.5 + seed2) + seed2 * 15.0) * 0.5
    );

    // Cell body
    float bodySize = 0.03 + seed3 * 0.02;
    float bodyDist = length(uv - orgPos) - bodySize;
    float bodyGlow = smoothstep(0.03, 0.0, bodyDist);
    float bodyFill = smoothstep(0.005, -0.005, bodyDist);

    vec3 bodyColor = palette(
      fi * 0.15 + t * 0.04 + paletteShift,
      vec3(0.3, 0.45, 0.5),
      vec3(0.3, 0.4, 0.45),
      vec3(0.7, 0.9, 1.0),
      vec3(0.0, 0.2, 0.4)
    );

    color += bodyColor * (bodyGlow * 0.4 + bodyFill * 0.6);

    // Flagella — 1-3 per organism
    int numFlagella = 1 + int(seed * 2.99);
    float heading = atan(
      cos(t * 0.25 * (0.5 + seed2) + seed2 * 15.0) * -0.25,
      cos(t * 0.3 * (0.5 + seed) + seed * 20.0) * 0.3
    );

    for (int f = 0; f < 3; f++) {
      if (f >= numFlagella) break;
      float ff = float(f);
      float flagAngle = heading + 3.14 + (ff - 1.0) * 0.4;
      float flagLen = 0.15 + hash1(fi * 3.0 + ff * 7.0) * 0.12;

      float flagDist = tendrilDist(uv, orgPos, flagAngle, flagLen, t + fi * 2.0, seed + ff);
      float flagGlow = smoothstep(0.015, 0.0, flagDist);

      // Bioluminescent tips
      float tipParam = smoothstep(0.0, flagLen, length(uv - orgPos));
      float tipGlow = tipParam * flagGlow;

      vec3 flagColor = palette(
        fi * 0.12 + ff * 0.3 + t * 0.03 + paletteShift + 0.3,
        vec3(0.3, 0.5, 0.55),
        vec3(0.25, 0.45, 0.5),
        vec3(0.6, 1.0, 0.9),
        vec3(0.0, 0.2, 0.45)
      );

      vec3 tipColor = palette(
        fi * 0.1 + paletteShift + 0.7,
        vec3(0.5, 0.6, 0.4),
        vec3(0.4, 0.5, 0.3),
        vec3(0.8, 1.0, 0.6),
        vec3(0.0, 0.15, 0.3)
      );

      color += flagColor * flagGlow * 0.6;
      color += tipColor * tipGlow * u_treble * 0.8;
    }

    // Bioluminescent aura around each organism
    float auraDist = length(uv - orgPos);
    float aura = exp(-auraDist * auraDist / (0.008 + u_bass * 0.004));
    float auraPulse = 0.5 + 0.5 * sin(t * 2.5 + fi * 1.7);
    color += bodyColor * aura * auraPulse * 0.3;
  }

  // ── Fluid current lines — subtle flow field ──
  float flowAngle = snoise(uv * 3.0 + t * 0.2) * 3.14;
  vec2 flowDir = vec2(cos(flowAngle), sin(flowAngle));
  float flowLines = sin(dot(uv, flowDir) * 30.0 + t * 1.5) * 0.5 + 0.5;
  flowLines = pow(flowLines, 8.0);
  vec3 flowColor = palette(
    flowAngle * 0.2 + paletteShift + 0.5,
    vec3(0.1, 0.15, 0.2),
    vec3(0.1, 0.12, 0.18),
    vec3(0.5, 0.6, 0.8),
    vec3(0.0, 0.2, 0.4)
  );
  color += flowColor * flowLines * 0.08 * (1.0 + u_mid * 0.5);

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
