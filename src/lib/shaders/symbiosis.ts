import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SMIN } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SMIN +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;
  float paletteShift = u_amplitude * 0.3;

  vec3 color = vec3(0.0);

  // ── Two organisms: System A (warm) and System B (cool) ──
  // They orbit each other, interpenetrating and exchanging energy

  // Orbital motion — neither dominates, both circle a shared center
  float orbitR = 0.15 + u_mid * 0.05;
  float orbitSpeed = t * 0.6;
  vec2 centerA = vec2(cos(orbitSpeed), sin(orbitSpeed)) * orbitR;
  vec2 centerB = vec2(cos(orbitSpeed + 3.14159), sin(orbitSpeed + 3.14159)) * orbitR;

  // ── System A: warm organism — flowing, amorphous ──
  vec2 uvA = uv - centerA;
  float angleA = atan(uvA.y, uvA.x);
  float radiusA = length(uvA);

  // Organic boundary with domain warp
  vec2 warpA = vec2(
    snoise(uvA * 3.0 + vec2(t * 0.4, 0.0)),
    snoise(uvA * 3.0 + vec2(0.0, t * 0.35) + 5.0)
  );
  vec2 warpedA = uvA + warpA * (0.08 + u_bass * 0.04);
  float distA = length(warpedA) - 0.3;

  // FBM texture inside A
  float texA = fbm(uvA * 5.0 + warpA * 2.0 + t * 0.2);
  float texA2 = fbm(uvA * 8.0 + vec2(t * 0.3, -t * 0.15));

  // ── System B: cool organism — crystalline, geometric ──
  vec2 uvB = uv - centerB;
  float angleB = atan(uvB.y, uvB.x);
  float radiusB = length(uvB);

  // Geometric boundary — subtly faceted
  float facets = 6.0;
  float facetAngle = angleB + t * 0.2;
  float facetR = 0.28 + 0.04 * cos(facetAngle * facets);
  facetR += 0.02 * cos(facetAngle * facets * 2.0 + t);

  vec2 warpB = vec2(
    snoise(uvB * 4.0 + vec2(-t * 0.3, t * 0.2) + 10.0),
    snoise(uvB * 4.0 + vec2(t * 0.25, t * 0.3) + 15.0)
  );
  vec2 warpedB = uvB + warpB * (0.05 + u_treble * 0.03);
  float distB = length(warpedB) - facetR;

  // FBM texture inside B
  float texB = fbm(uvB * 6.0 + warpB * 1.5 - t * 0.15);
  float texB2 = fbm(uvB * 10.0 + vec2(-t * 0.2, t * 0.25));

  // ── Interpenetration zone ──
  float interZone = smoothstep(0.1, -0.1, max(distA, distB));
  float overlapField = smoothstep(0.05, -0.15, distA) * smoothstep(0.05, -0.15, distB);

  // ── Palette A: warm corals, ambers, rose ──
  vec3 colA = palette(
    texA * 0.6 + angleA * 0.15 + t * 0.04 + paletteShift,
    vec3(0.5, 0.3, 0.25),
    vec3(0.4, 0.25, 0.2),
    vec3(1.0, 0.7, 0.5),
    vec3(0.0, 0.1, 0.25)
  );
  vec3 colA2 = palette(
    texA2 * 0.4 + t * 0.06 + paletteShift + 0.3,
    vec3(0.55, 0.35, 0.3),
    vec3(0.35, 0.2, 0.25),
    vec3(0.9, 0.6, 0.7),
    vec3(0.05, 0.15, 0.3)
  );

  // ── Palette B: cool teals, indigos, silvers ──
  vec3 colB = palette(
    texB * 0.6 + angleB * 0.15 + t * 0.04 + paletteShift + 0.5,
    vec3(0.25, 0.4, 0.5),
    vec3(0.2, 0.35, 0.45),
    vec3(0.5, 0.9, 1.0),
    vec3(0.0, 0.2, 0.4)
  );
  vec3 colB2 = palette(
    texB2 * 0.4 + t * 0.06 + paletteShift + 0.7,
    vec3(0.3, 0.35, 0.5),
    vec3(0.25, 0.3, 0.45),
    vec3(0.6, 0.8, 1.0),
    vec3(0.05, 0.2, 0.45)
  );

  // ── Render System A ──
  float fillA = smoothstep(0.02, -0.03, distA);
  float edgeA = smoothstep(0.015, 0.0, abs(distA));
  float innerTexA = texA * 0.5 + 0.5;

  // Internal flowing patterns
  float flowA = sin(radiusA * 15.0 + angleA * 3.0 - t * 3.0) * 0.5 + 0.5;
  flowA = pow(flowA, 3.0) * fillA;

  color += colA * fillA * innerTexA * (0.35 + u_bass * 0.2);
  color += colA2 * flowA * 0.4;
  color += colA * edgeA * 0.8;

  // ── Render System B ──
  float fillB = smoothstep(0.02, -0.03, distB);
  float edgeB = smoothstep(0.015, 0.0, abs(distB));
  float innerTexB = texB * 0.5 + 0.5;

  // Internal geometric patterns — more structured than A
  float structB = sin(radiusB * 20.0 - t * 2.0) * 0.5 + 0.5;
  structB *= sin(angleB * facets + t) * 0.5 + 0.5;
  structB = pow(structB, 2.0) * fillB;

  color += colB * fillB * innerTexB * (0.35 + u_treble * 0.2);
  color += colB2 * structB * 0.4;
  color += colB * edgeB * 0.8;

  // ── Overlap zone: mutual benefit visualization ──
  // Where both systems interpenetrate — new emergent colors
  if (overlapField > 0.01) {
    // Blended palette — neither warm nor cool, something new
    vec3 symColor = palette(
      texA * 0.3 + texB * 0.3 + t * 0.08 + paletteShift + 0.15,
      vec3(0.45, 0.4, 0.4),
      vec3(0.35, 0.3, 0.35),
      vec3(0.9, 0.85, 0.9),
      vec3(0.05, 0.15, 0.35)
    );

    // Brighter than either alone — synergy
    float synergy = overlapField * (1.0 + u_amplitude * 0.5);
    color += symColor * synergy * 0.6;

    // Sparkling exchange particles in the overlap
    float exchange = snoise(uv * 20.0 + t * 3.0);
    exchange = smoothstep(0.6, 0.9, exchange) * overlapField;
    color += vec3(1.2, 1.1, 1.0) * exchange * (0.3 + u_mid * 0.5);
  }

  // ── Tendrils reaching between organisms ──
  // Complementary patterns: A reaches toward B, B reaches toward A
  vec2 AtoB = normalize(centerB - centerA);
  float reachA = dot(normalize(uvA + 0.001), AtoB);
  reachA = smoothstep(0.5, 0.95, reachA) * smoothstep(0.35, 0.1, radiusA);

  vec2 BtoA = -AtoB;
  float reachB = dot(normalize(uvB + 0.001), BtoA);
  reachB = smoothstep(0.5, 0.95, reachB) * smoothstep(0.35, 0.1, radiusB);

  // Tendril patterns using noise
  float tendrilA = fbm(uv * 6.0 + AtoB * t * 2.0);
  tendrilA = smoothstep(0.1, 0.5, tendrilA) * reachA;
  color += colA * tendrilA * 0.4 * (0.5 + u_bass * 0.5);

  float tendrilB = fbm(uv * 6.0 + BtoA * t * 2.0 + 7.0);
  tendrilB = smoothstep(0.1, 0.5, tendrilB) * reachB;
  color += colB * tendrilB * 0.4 * (0.5 + u_treble * 0.5);

  // ── Background ambience — faint halos around both ──
  float haloA = exp(-radiusA * radiusA / 0.15);
  float haloB = exp(-radiusB * radiusB / 0.15);
  color += colA * haloA * 0.08;
  color += colB * haloB * 0.08;

  // ── Shared energy field — fbm background ──
  float sharedField = fbm(uv * 2.0 + vec2(t * 0.1, -t * 0.08));
  vec3 fieldColor = palette(
    sharedField * 0.5 + paletteShift + 0.4,
    vec3(0.03, 0.04, 0.05),
    vec3(0.03, 0.04, 0.05),
    vec3(0.5, 0.5, 0.6),
    vec3(0.0, 0.15, 0.3)
  );
  color += fieldColor * sharedField * 0.08;

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
