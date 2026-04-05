import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
vec2 hash2v(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Background: abyssal ocean darkness ──
  // Very deep and dark with subtle blue-black variation
  float bgN = fbm(uv * 1.5 + vec2(t * 0.03, t * 0.02));
  vec3 bgColor = palette(
    bgN * 0.3 + paletteShift + 0.7,
    vec3(0.005, 0.008, 0.02),
    vec3(0.01, 0.015, 0.03),
    vec3(0.2, 0.3, 0.5),
    vec3(0.0, 0.1, 0.3)
  );
  color = bgColor * (bgN * 0.08 + 0.02);

  // ── Deep water particulate — suspended organic matter ──
  float detritus = snoise(uv * 8.0 + vec2(t * 0.2, -t * 0.15));
  detritus = smoothstep(0.4, 0.6, detritus) * 0.03;
  color += vec3(0.03, 0.04, 0.06) * detritus;

  // ── Bioluminescent organisms — multiple depth layers ──
  for (int layer = 0; layer < 5; layer++) {
    float lf = float(layer);
    float layerFrac = lf / 4.0; // 0=far, 1=near

    float depthScale = mix(10.0, 4.0, layerFrac);
    float brightness = mix(0.08, 1.0, layerFrac * layerFrac);
    float driftSpeed = mix(0.03, 0.15, layerFrac);

    // Per-layer drift
    float driftAngle = lf * 1.57 + t * 0.03;
    vec2 drift = vec2(cos(driftAngle), sin(driftAngle)) * driftSpeed * t;

    vec2 layerUV = uv * depthScale + drift + vec2(lf * 7.3, lf * 4.1);

    // Grid cells for organism placement
    vec2 cellIdx = floor(layerUV);
    vec2 cellFrac = fract(layerUV);

    for (int dj = -1; dj <= 1; dj++) {
      for (int di = -1; di <= 1; di++) {
        vec2 neighbor = cellIdx + vec2(float(di), float(dj));
        vec2 h = hash2v(neighbor + lf * vec2(11.3, 17.7));

        vec2 orgCenter = vec2(float(di), float(dj)) + h - cellFrac;

        // Gentle drifting motion
        float floatFreq = 0.3 + h.x * 0.4;
        orgCenter += vec2(
          sin(t * floatFreq + h.y * 6.28) * 0.06,
          cos(t * floatFreq * 0.8 + h.x * 6.28) * 0.08
        );

        float dist = length(orgCenter);

        // ── Organism type varies by hash ──
        float orgType = h.x;
        float glowSize = 0.0;
        float glowIntensity = 0.0;
        float haloSize = 0.0;

        if (orgType < 0.3) {
          // Jellyfish-like: large soft glow with trailing tendrils effect
          glowSize = 0.15 / depthScale * 8.0;
          glowIntensity = exp(-dist * dist / (glowSize * glowSize));
          haloSize = glowSize * 2.0;
        } else if (orgType < 0.6) {
          // Dinoflagellate: small bright flash
          glowSize = 0.06 / depthScale * 8.0;
          glowIntensity = exp(-dist * dist / (glowSize * glowSize * 0.3));
          haloSize = glowSize * 1.5;
        } else {
          // Ctenophore: medium with rainbow edge
          glowSize = 0.1 / depthScale * 8.0;
          float ring = abs(dist - glowSize * 0.5);
          glowIntensity = exp(-dist * dist / (glowSize * glowSize)) +
                          smoothstep(glowSize * 0.15, 0.0, ring) * 0.5;
          haloSize = glowSize * 1.8;
        }

        // Bioluminescent pulse — each organism has its own rhythm
        float pulseFreq = 1.0 + h.y * 2.0;
        float pulse = 0.3 + 0.7 * pow(max(sin(t * pulseFreq + h.x * 6.28), 0.0), 2.0);

        // Bass triggers flash cascades
        float bassFlash = smoothstep(0.3, 0.8, u_bass) * smoothstep(0.0, 0.3, sin(t * 4.0 + h.x * 12.0));
        pulse = max(pulse, bassFlash);

        glowIntensity *= pulse;

        // Soft halo
        float halo = exp(-dist * dist / (haloSize * haloSize)) * 0.2;

        // Color — deep sea bioluminescence palette (blues, greens, occasional violet)
        float colorSeed = h.x * 0.5 + lf * 0.1 + t * 0.02 + paletteShift;
        vec3 orgColor = palette(
          colorSeed,
          vec3(0.2, 0.4, 0.5),
          vec3(0.2, 0.4, 0.45),
          vec3(0.5, 0.9, 1.0),
          vec3(0.0, 0.25, 0.5)
        );

        // Rare warm-colored organisms
        if (orgType > 0.85) {
          orgColor = palette(
            colorSeed + 0.4,
            vec3(0.4, 0.3, 0.5),
            vec3(0.3, 0.2, 0.45),
            vec3(0.8, 0.5, 1.0),
            vec3(0.1, 0.1, 0.4)
          );
        }

        color += orgColor * (glowIntensity + halo) * brightness;
      }
    }
  }

  // ── Ambient bioluminescent shimmer — mid frequencies ──
  float shimmer = snoise(uv * 12.0 + t * 1.0);
  shimmer = pow(max(shimmer, 0.0), 3.0) * u_mid * 0.15;
  vec3 shimmerColor = palette(
    shimmer * 2.0 + paletteShift + 0.5,
    vec3(0.1, 0.3, 0.4),
    vec3(0.1, 0.25, 0.35),
    vec3(0.4, 0.8, 1.0),
    vec3(0.0, 0.2, 0.5)
  );
  color += shimmerColor * shimmer;

  // ── Treble: microscopic sparkle — tiny organisms flashing ──
  float sparkle = snoise(uv * 35.0 + t * 4.0);
  sparkle = smoothstep(0.85, 1.0, sparkle) * u_treble;
  color += vec3(0.3, 0.6, 0.8) * sparkle * 0.3;

  // ── Vignette — heavy for deep-sea claustrophobia ──
  float vignette = 1.0 - smoothstep(0.4, 1.3, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
