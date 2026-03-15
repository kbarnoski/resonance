import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Cheap 3-octave fbm — half the cost of shared fbm (6 octaves)
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Nebula density — single fbm with cheap analytical warp (no extra noise lookups)
float nebulaDensity(vec3 p) {
  vec2 xy = p.xy + p.z * 0.3;

  // Analytical domain warp — sin/cos instead of expensive fbm lookups
  vec2 warp = vec2(
    sin(xy.y * 1.2 + u_time * 0.03) * 0.6,
    cos(xy.x * 1.1 + u_time * 0.025) * 0.6
  );

  float n = fbm3(xy * 0.5 + warp);
  n += 0.4 * snoise(xy * 1.2 - warp * 0.5 + u_time * 0.01);

  n = smoothstep(-0.1, 0.6, n);
  return n;
}

// Emission cores — localized bright spots
float emissionField(vec3 p) {
  vec2 xy = p.xy * 2.0 + p.z * 0.5;
  float e = snoise(xy + u_time * 0.05);
  e = pow(max(0.0, e), 3.0);
  return e;
}

// Star layer — sparse bright dots
float stars(vec2 uv) {
  vec2 id = floor(uv * 80.0);
  vec2 f = fract(uv * 80.0) - 0.5;

  float h = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.95, h);

  float radius = 0.03 + 0.04 * fract(h * 17.3);
  float d = length(f);
  float brightness = smoothstep(radius, 0.0, d);

  float twinkle = sin(u_time * (3.0 + h * 8.0) + h * 100.0) * 0.5 + 0.5;
  twinkle = mix(0.4, 1.0, twinkle * u_treble + (1.0 - u_treble) * 0.7);

  return star * brightness * twinkle;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float paletteShift = u_amplitude * 0.3;

  // ── Camera — slowly drifting through the nebula ──
  float camTime = u_time * 0.08;
  vec3 ro = vec3(
    sin(camTime * 0.7) * 2.0,
    cos(camTime * 0.5) * 1.5,
    camTime * 1.5
  );

  vec3 lookAt = ro + vec3(
    sin(camTime * 0.3) * 0.5,
    cos(camTime * 0.4) * 0.3,
    2.0
  );

  vec3 fwd = normalize(lookAt - ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  vec3 rd = normalize(uv.x * right + uv.y * up + 1.5 * fwd);

  // ── Ray march — 28 steps (down from 64), faster step growth ──
  vec3 color = vec3(0.0);
  float totalDensity = 0.0;

  float stepSize = 0.15;
  float depth = 0.0;

  for (int i = 0; i < 28; i++) {
    if (totalDensity > 0.9) break;

    vec3 p = ro + rd * depth;

    float dens = nebulaDensity(p) * stepSize;

    if (dens > 0.001) {
      // Only compute emission where there's visible density
      float emission = emissionField(p);

      float palT = depth * 0.1 + p.x * 0.05;

      // Primary nebula color — deep purples and blues
      vec3 nebulaCol = palette(
        palT + paletteShift,
        vec3(0.5, 0.5, 0.5),
        vec3(0.5, 0.5, 0.5),
        vec3(0.8, 0.4, 1.0),
        vec3(0.0, 0.1, 0.2)
      );

      // Emission color — warm oranges and pinks
      vec3 emitCol = palette(
        palT * 2.0 + paletteShift + 0.33,
        vec3(0.5, 0.5, 0.5),
        vec3(0.5, 0.5, 0.4),
        vec3(1.0, 0.6, 0.3),
        vec3(0.1, 0.0, 0.15)
      );

      // Depth variation color
      vec3 deepCol = palette(
        palT * 0.5 + paletteShift + 0.67,
        vec3(0.5, 0.5, 0.5),
        vec3(0.3, 0.5, 0.5),
        vec3(0.3, 0.8, 0.8),
        vec3(0.2, 0.3, 0.5)
      );

      vec3 sampleCol = nebulaCol * 0.4 + deepCol * 0.2;

      // Emission cores — bass drives intensity
      float emitStrength = emission * (1.5 + u_bass * 3.0);
      sampleCol += emitCol * emitStrength;

      // Hot spots — warm white tint
      float hotness = smoothstep(0.5, 1.0, emission);
      sampleCol += vec3(1.4, 1.2, 1.05) * hotness * emitStrength * 0.8;

      // Front-to-back compositing
      float alpha = dens * (1.0 - totalDensity);
      color += sampleCol * alpha;
      totalDensity += alpha;
    }

    depth += stepSize;
    stepSize *= 1.06;
  }

  // ── Stars — visible where nebula is thin ──
  float starMask = 1.0 - totalDensity;

  float s1 = stars(rd.xy / (rd.z + 1.0) * 5.0);
  float s2 = stars(rd.xy / (rd.z + 1.0) * 12.0 + vec2(50.0));

  vec3 starCol1 = vec3(1.1, 1.15, 1.4) * s1 * 2.0;
  vec3 starCol2 = vec3(1.3, 1.2, 1.05) * s2 * 1.5;

  color += (starCol1 + starCol2) * starMask;

  // ── Central glow ──
  float centralGlow = smoothstep(1.2, 0.0, length(uv)) * 0.08;
  vec3 glowCol = palette(
    u_time * 0.02 + paletteShift,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(0.7, 0.5, 1.0),
    vec3(0.1, 0.15, 0.3)
  );
  color += glowCol * centralGlow * (0.5 + 0.5 * u_amplitude);

  gl_FragColor = vec4(color, 1.0);
}
`;
