import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Redshift — the expanding universe. Concentric rings stretching outward,
// Doppler effect shifting colors red at edges. Bass stretches the rings.
// Everything moving away, the loneliness of cosmic expansion.

// Doppler ring — expanding wavefront
float dopplerRing(vec2 uv, float baseR, float t, float speed, float bass) {
  float r = length(uv);
  // Ring expands outward — Hubble flow
  float ringR = baseR + fract(t * speed) * (1.5 + bass * 0.5);
  float ringWidth = 0.015 + bass * 0.01;

  // Ring dims as it expands (inverse square)
  float brightness = 1.0 / (ringR * ringR * 2.0 + 0.3);

  float ring = smoothstep(ringWidth, 0.0, abs(r - ringR)) * brightness;

  // Slight wobble in ring shape — gravitational perturbation
  float angle = atan(uv.y, uv.x);
  float wobble = sin(angle * 6.0 + t * 0.5 + baseR * 10.0) * 0.01 * ringR;
  ring += smoothstep(ringWidth, 0.0, abs(r - ringR - wobble)) * brightness * 0.3;

  return ring;
}

// Receding galaxy cluster — getting smaller and redder
float recedingGalaxy(vec2 uv, vec2 center, float t, float speed) {
  vec2 dir = normalize(center); // direction of recession
  // Galaxy moves away from center over time
  vec2 pos = center + dir * t * speed * 0.05;
  float dist = length(uv - pos);

  // Galaxy shrinks as it recedes (getting further away)
  float distFromOrigin = length(pos);
  float apparentSize = 0.04 / (distFromOrigin * 2.0 + 1.0);

  // Spiral arms
  float angle = atan(uv.y - pos.y, uv.x - pos.x);
  float spiral = sin(angle * 2.0 - log(dist * 20.0 + 1.0) * 3.0 + t * 0.3) * 0.5 + 0.5;

  float galaxy = smoothstep(apparentSize, 0.0, dist) * (0.5 + spiral * 0.5);
  galaxy *= smoothstep(1.2, 0.8, distFromOrigin); // fade at edge

  return galaxy;
}

// Cosmic microwave background — the afterglow of creation
float cmbBackground(vec2 uv, float t) {
  // Very large scale noise — temperature fluctuations
  float cmb = fbm(uv * 0.8 + t * 0.002) * 0.5 + 0.5;
  // Additional finer structure
  cmb += snoise(uv * 2.0 + t * 0.005) * 0.15;
  return cmb * 0.08;
}

// Hubble flow lines — showing the expansion velocity field
float flowLines(vec2 uv, float t, float bass) {
  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Radial lines emanating outward
  float radialCount = 24.0;
  float radialAngle = mod(angle + 0.01, 6.28318 / radialCount);
  float lineWidth = 0.005;
  float radialLine = smoothstep(lineWidth, 0.0, abs(radialAngle - 3.14159 / radialCount));

  // Dashed — particles at increasing separation
  float dashSpeed = t * (0.3 + bass * 0.4);
  float dash = sin(r * 20.0 - dashSpeed) * 0.5 + 0.5;
  dash = smoothstep(0.3, 0.7, dash);

  // Dim further from center, but present everywhere
  float brightness = exp(-r * 0.5) * 0.3;

  return radialLine * dash * brightness * smoothstep(0.05, 0.15, r);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // ── Doppler rings — expanding concentric wavefronts ──
  float rings = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float baseR = fi * 0.12;
    float speed = 0.08 + fi * 0.01;
    rings += dopplerRing(uv, baseR, t, speed, u_bass);
  }

  // ── Hubble flow velocity field ──
  float flow = flowLines(uv, t, u_bass);

  // ── Receding galaxy clusters ──
  float galaxies = 0.0;
  galaxies += recedingGalaxy(uv, vec2(0.3, 0.2), t, 0.3);
  galaxies += recedingGalaxy(uv, vec2(-0.25, 0.35), t, 0.25);
  galaxies += recedingGalaxy(uv, vec2(0.15, -0.3), t, 0.35);
  galaxies += recedingGalaxy(uv, vec2(-0.4, -0.15), t, 0.2);
  galaxies += recedingGalaxy(uv, vec2(0.45, -0.1), t, 0.28);
  galaxies += recedingGalaxy(uv, vec2(-0.1, 0.45), t, 0.32);

  // ── CMB background ──
  float cmb = cmbBackground(uv, t);

  // ── Central origin — the Big Bang point ──
  float origin = 0.002 / (r * r + 0.001);
  float originHalo = exp(-r * 8.0) * 0.5;

  // ── Redshift calculation — everything gets redder toward edges ──
  // Redshift proportional to distance (Hubble's law)
  float redshiftAmount = smoothstep(0.0, 1.0, r);

  // ── Expansion stretching — bass makes everything stretch faster ──
  float stretch = 1.0 + u_bass * 0.3;

  // ── Colors ──
  // Ring colors — blue at center (nearby), shifting to red at edges (far away)
  vec3 ringNearCol = palette(
    rings + t * 0.03 + paletteShift,
    vec3(0.4, 0.5, 0.6),
    vec3(0.3, 0.4, 0.5),
    vec3(0.3, 0.5, 0.8),
    vec3(0.1, 0.2, 0.4)
  );

  vec3 ringFarCol = palette(
    rings + t * 0.03 + paletteShift + 0.4,
    vec3(0.5, 0.3, 0.2),
    vec3(0.4, 0.2, 0.1),
    vec3(0.3, 0.1, 0.05),
    vec3(0.1, 0.0, 0.0)
  );

  // Blend near/far based on radial distance (Doppler shift)
  vec3 ringCol = mix(ringNearCol, ringFarCol, redshiftAmount);

  // Galaxy colors — also redshifting
  vec3 galaxyCol = palette(
    galaxies + r * 0.5 + t * 0.02 + paletteShift + 0.2,
    vec3(0.5, 0.45, 0.4),
    vec3(0.4, 0.3, 0.2),
    vec3(0.4, 0.2, 0.1),
    vec3(0.05, 0.02, 0.0)
  );
  // Apply redshift to galaxy colors
  galaxyCol = mix(galaxyCol, galaxyCol * vec3(1.3, 0.7, 0.5), redshiftAmount);

  // Flow line colors — subtle blue-white
  vec3 flowCol = palette(
    flow + t * 0.04 + paletteShift + 0.5,
    vec3(0.3, 0.35, 0.4),
    vec3(0.2, 0.25, 0.3),
    vec3(0.4, 0.5, 0.7),
    vec3(0.1, 0.15, 0.3)
  );

  // CMB — faint warm glow from the primordial universe
  vec3 cmbCol = palette(
    cmb * 3.0 + paletteShift + 0.3,
    vec3(0.08, 0.06, 0.04),
    vec3(0.05, 0.04, 0.03),
    vec3(0.4, 0.3, 0.2),
    vec3(0.1, 0.05, 0.0)
  );

  // Origin — white-blue remnant of creation
  vec3 originCol = palette(
    t * 0.1 + paletteShift,
    vec3(0.8, 0.85, 0.95),
    vec3(0.2, 0.15, 0.1),
    vec3(0.3, 0.3, 0.5),
    vec3(0.0, 0.05, 0.15)
  );

  // Deep space — dark with slight warm cast
  vec3 color = palette(
    r * 0.15 + paletteShift + 0.7,
    vec3(0.015, 0.01, 0.02),
    vec3(0.01, 0.008, 0.015),
    vec3(0.3, 0.2, 0.4),
    vec3(0.1, 0.05, 0.15)
  );

  // CMB (outermost layer)
  color += cmbCol * cmb;

  // Flow lines
  color += flowCol * flow * (0.5 + u_mid * 0.5);

  // Expanding rings
  color += ringCol * rings * stretch * (0.7 + u_mid * 0.5);

  // Galaxies
  color += galaxyCol * galaxies * (0.6 + u_amplitude * 0.5);

  // Origin point
  color += originCol * (origin + originHalo) * (0.5 + u_amplitude * 1.0);

  // Treble — fine structure in the expansion wavefronts
  float fineWaves = sin(r * 60.0 - t * 3.0) * 0.5 + 0.5;
  fineWaves *= exp(-r * 2.0) * u_treble * 0.15;
  color += ringNearCol * fineWaves;

  // Overall redshift tint toward edges — the signature effect
  color = mix(color, color * vec3(1.2, 0.85, 0.7), redshiftAmount * 0.4);

  // Vignette — deep space isolation
  float vignette = 1.0 - smoothstep(0.4, 1.3, r);
  color *= vignette;

  // Tonemap
  color = color / (color + 0.7);
  color = pow(color, vec3(0.9));

  gl_FragColor = vec4(color, 1.0);
}
`;
