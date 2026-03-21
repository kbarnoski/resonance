import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SMIN } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + SMIN + `
// Amoeba — single-cell organisms under a microscope.
// Large soft blobs merge, split, drift. Translucent with internal structures.
// Pale green-blue-purple bioluminescent coloring against dark background.

// Smooth metaball-like SDF for organic blobs
float blobField(vec2 p, float time) {
  float field = 0.0;

  // 5 large amoeba bodies drifting slowly
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float phase = fi * 1.256 + time * 0.08;

    // Wandering center — Lissajous-like paths
    vec2 center = vec2(
      sin(phase * 0.7 + fi * 2.1) * 0.4 + sin(phase * 0.3 + fi) * 0.2,
      cos(phase * 0.5 + fi * 1.7) * 0.35 + cos(phase * 0.25 + fi * 0.8) * 0.15
    );

    // Organic radius — warped by noise
    float baseR = 0.15 + fract(sin(fi * 73.1) * 4375.5) * 0.1;
    float warp = snoise(p * 2.5 + vec2(time * 0.1 + fi * 3.0, fi * 5.0)) * 0.06;
    float warp2 = snoise(p * 4.0 + vec2(-time * 0.15, fi * 7.3)) * 0.03;

    float r = baseR + warp + warp2;

    // SDF circle with noise-warped surface
    vec2 toCenter = p - center;
    // Apply organic deformation to position
    float angle = atan(toCenter.y, toCenter.x);
    float distort = snoise(vec2(angle * 2.0 + fi * 5.0, time * 0.15)) * 0.04;
    float dist = length(toCenter) - r - distort;

    // Contribution to field (inverse distance, clamped)
    field += smoothstep(0.15, -0.08, dist);
  }

  return field;
}

// Nucleus-like internal structures
float nucleusField(vec2 p, float time) {
  float field = 0.0;

  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float phase = fi * 0.89 + time * 0.06;

    vec2 center = vec2(
      sin(phase * 0.6 + fi * 3.3) * 0.35,
      cos(phase * 0.4 + fi * 2.1) * 0.3
    );

    float r = 0.03 + fract(sin(fi * 131.7) * 2137.5) * 0.04;
    float dist = length(p - center);
    field += smoothstep(r + 0.02, r - 0.01, dist) * (0.3 + fract(fi * 0.47) * 0.5);
  }

  return field;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.2;

  // Slight slow pan to simulate microscope drift
  uv += vec2(sin(t * 0.07) * 0.05, cos(t * 0.05) * 0.04);

  vec3 color = vec3(0.0);

  // ─── DARK BACKGROUND — deep microscope field ───
  vec3 bgColor = palette(length(uv) * 0.3 + t * 0.01 + paletteShift * 0.1,
    vec3(0.01, 0.015, 0.025),
    vec3(0.01, 0.01, 0.02),
    vec3(0.5, 0.4, 0.6),
    vec3(0.7, 0.5, 0.3));
  color = bgColor;

  // Subtle background particles — tiny floating debris
  float debris = fbm(uv * 12.0 + vec2(t * 0.05, t * 0.03));
  debris = smoothstep(0.3, 0.5, debris) * 0.02;
  color += vec3(0.03, 0.05, 0.04) * debris;

  // ─── AMOEBA BODIES ───
  float bodies = blobField(uv, t);
  float bodyMask = smoothstep(0.1, 0.6, bodies);

  // Translucent body color — pale bioluminescent green-blue
  vec3 bodyColorInner = palette(bodies * 0.4 + 0.15 + paletteShift * 0.5 + u_mid * 0.03,
    vec3(0.08, 0.15, 0.12),
    vec3(0.06, 0.12, 0.1),
    vec3(0.7, 0.9, 1.0),
    vec3(0.2, 0.35, 0.45));

  // Edge color — more purple/violet
  vec3 bodyColorEdge = palette(bodies * 0.3 + 0.4 + paletteShift * 0.3,
    vec3(0.1, 0.06, 0.15),
    vec3(0.08, 0.05, 0.12),
    vec3(0.8, 0.6, 1.0),
    vec3(0.3, 0.2, 0.5));

  // Membrane edge detection
  float edgeMask = smoothstep(0.1, 0.3, bodies) - smoothstep(0.4, 0.8, bodies);
  edgeMask = max(edgeMask, 0.0);

  // Blend body
  vec3 bodyColor = mix(bodyColorEdge, bodyColorInner, smoothstep(0.3, 0.7, bodies));
  color = mix(color, bodyColor, bodyMask * 0.7);

  // Bright membrane edge glow
  vec3 membraneColor = palette(0.3 + paletteShift * 0.4,
    vec3(0.15, 0.25, 0.2),
    vec3(0.1, 0.15, 0.12),
    vec3(0.8, 1.0, 0.9),
    vec3(0.2, 0.3, 0.4));
  color += membraneColor * edgeMask * 0.5 * (0.7 + u_treble * 0.3);

  // ─── INTERNAL STRUCTURES — nuclei, organelles ───
  float nuclei = nucleusField(uv, t);
  // Only visible inside the amoeba body
  float nucleiVisible = nuclei * bodyMask;

  vec3 nucleusColor = palette(nuclei * 0.5 + 0.5 + paletteShift * 0.3,
    vec3(0.12, 0.08, 0.18),
    vec3(0.1, 0.06, 0.14),
    vec3(0.7, 0.5, 0.9),
    vec3(0.3, 0.2, 0.5));

  color = mix(color, nucleusColor, nucleiVisible * 0.5);

  // Nucleus bright spot (nucleolus-like)
  float nucleolus = smoothstep(0.5, 0.8, nuclei) * bodyMask;
  color += vec3(0.1, 0.15, 0.2) * nucleolus * 0.4;

  // ─── INTERNAL FLOW — cytoplasmic streaming ───
  {
    float flow = snoise(uv * 5.0 + vec2(t * 0.2, -t * 0.15));
    float flow2 = snoise(uv * 8.0 + vec2(-t * 0.3, t * 0.25) + 3.7);
    float streaming = (flow * 0.5 + flow2 * 0.3) * bodyMask;
    vec3 flowColor = vec3(0.04, 0.07, 0.06);
    color += flowColor * streaming * 0.15;
  }

  // ─── BIOLUMINESCENT GLOW ───
  // Soft glow around each amoeba, bass-reactive
  {
    float glowField = blobField(uv, t);
    float glow = smoothstep(-0.1, 0.3, glowField) * (1.0 - smoothstep(0.3, 0.8, glowField));
    vec3 glowColor = palette(0.25 + paletteShift * 0.5,
      vec3(0.03, 0.08, 0.06),
      vec3(0.04, 0.06, 0.05),
      vec3(0.6, 0.9, 0.8),
      vec3(0.2, 0.35, 0.4));
    color += glowColor * glow * (0.2 + u_bass * 0.25);
  }

  // ─── GLOBAL MODULATION ───
  // Bass makes bodies pulse larger (already in blobField via u_bass indirectly through amplitude)
  // Gentle pulsing based on amplitude
  float pulse = 1.0 + sin(t * 0.5) * 0.02 * u_amplitude;
  color *= pulse;

  // Mid-frequency warms the bio-glow
  color += vec3(0.01, 0.015, 0.01) * u_mid * bodyMask * 0.3;

  // Vignette — microscope lens effect
  float vd = length(uv);
  float vignette = 1.0 - smoothstep(0.5, 1.1, vd);
  vignette = pow(vignette, 1.2);
  color *= vignette;

  // Slight circular mask for microscope look
  float lensMask = smoothstep(1.0, 0.85, vd);
  color *= lensMask;

  gl_FragColor = vec4(color, 1.0);
}`;
