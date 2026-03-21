import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Cytoplasm — cellular fluid dynamics. Tiny particles flowing in streams
// within a cell boundary. Organelles drift in currents. Gentle pulsing.
// Warm biological tones: amber, rose, pale yellow against deep purple.

// Curl-noise-like flow field for particle streaming
vec2 flowField(vec2 p, float time) {
  float eps = 0.01;
  float n0 = fbm(p + vec2(time * 0.12, time * 0.08));
  float nx = fbm(p + vec2(eps, 0.0) + vec2(time * 0.12, time * 0.08));
  float ny = fbm(p + vec2(0.0, eps) + vec2(time * 0.12, time * 0.08));
  // Curl: perpendicular to gradient
  return vec2(-(ny - n0) / eps, (nx - n0) / eps) * 0.3;
}

// Cell boundary — elliptical with organic wobble
float cellBoundary(vec2 p, float time) {
  // Organic ellipse
  float angle = atan(p.y, p.x);
  float baseR = 0.55 + 0.05 * sin(angle * 3.0 + time * 0.1)
              + 0.03 * sin(angle * 5.0 - time * 0.15)
              + 0.02 * sin(angle * 7.0 + time * 0.08);
  // Breathing
  baseR += 0.015 * sin(time * 0.3);
  float dist = length(p * vec2(1.0, 1.15)) - baseR;
  return dist;
}

// Particle field — lots of tiny dots advected by flow
float particleField(vec2 p, float time, float scale) {
  vec2 flow = flowField(p * 0.5, time);
  vec2 advected = p + flow * time * 0.5;

  // Use noise to create particle-like point clusters
  float n1 = snoise(advected * scale);
  float n2 = snoise(advected * scale * 1.7 + 3.1);
  float particles = n1 * n1 * n2 * n2;
  particles = smoothstep(0.02, 0.2, particles);
  return particles;
}

// Organelle (darker spots drifting in currents)
float organelleField(vec2 p, float time) {
  float field = 0.0;

  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float phase = fi * 0.7 + time * 0.05;

    // Each organelle drifts along flow
    vec2 center = vec2(
      sin(phase * 0.45 + fi * 2.3) * 0.3 + sin(phase * 0.2) * 0.1,
      cos(phase * 0.35 + fi * 1.9) * 0.28 + cos(phase * 0.15 + fi) * 0.08
    );

    float r = 0.025 + fract(sin(fi * 97.3) * 3758.5) * 0.035;
    // Slightly elongated
    vec2 diff = p - center;
    float angle = time * 0.05 + fi * 1.5;
    diff = diff * rot2(angle);
    diff.x *= 1.0 + fract(fi * 0.31) * 0.5;

    float dist = length(diff);
    field += smoothstep(r + 0.015, r - 0.005, dist) * (0.4 + fract(fi * 0.57) * 0.4);
  }

  return field;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;
  float paletteShift = u_amplitude * 0.2;

  vec3 color = vec3(0.0);

  // ─── DEEP PURPLE BACKGROUND ───
  vec3 bgColor = palette(length(uv) * 0.2 + t * 0.005 + paletteShift * 0.1,
    vec3(0.04, 0.015, 0.06),
    vec3(0.03, 0.01, 0.04),
    vec3(0.6, 0.3, 0.8),
    vec3(0.5, 0.3, 0.6));
  color = bgColor;

  // ─── CELL BOUNDARY ───
  float boundary = cellBoundary(uv, t);
  float insideCell = smoothstep(0.02, -0.02, boundary);
  float membraneMask = smoothstep(0.04, 0.0, abs(boundary));

  // ─── CYTOPLASM BASE COLOR — warm amber inside the cell ───
  vec3 cytoColor = palette(
    fbm(uv * 2.0 + t * 0.05) * 0.3 + 0.2 + paletteShift * 0.4 + u_mid * 0.02,
    vec3(0.15, 0.08, 0.05),
    vec3(0.12, 0.07, 0.04),
    vec3(0.9, 0.7, 0.5),
    vec3(0.1, 0.2, 0.35));

  color = mix(color, cytoColor, insideCell * 0.8);

  // ─── STREAMING PARTICLES — tiny dots flowing in currents ───
  {
    // Layer 1: fine particles
    float p1 = particleField(uv, t, 18.0);
    // Layer 2: medium particles, slightly different flow
    float p2 = particleField(uv + 2.7, t * 0.8, 12.0);
    // Layer 3: coarser streaks
    float p3 = particleField(uv + 5.3, t * 0.6, 8.0);

    float particles = p1 * 0.4 + p2 * 0.35 + p3 * 0.25;
    particles *= insideCell;

    // Particle color — pale yellow/amber
    vec3 particleColor = palette(particles * 0.5 + 0.35 + paletteShift * 0.3,
      vec3(0.2, 0.14, 0.06),
      vec3(0.15, 0.1, 0.04),
      vec3(1.0, 0.85, 0.5),
      vec3(0.05, 0.15, 0.3));

    color += particleColor * particles * 0.25 * (0.8 + u_treble * 0.2);
  }

  // ─── FLOW VISUALIZATION — subtle streaming lines ───
  {
    vec2 flow = flowField(uv * 1.5, t);
    float flowMag = length(flow);
    float flowAngle = atan(flow.y, flow.x);

    // Create directional streaks
    float streak = snoise(vec2(
      dot(uv, normalize(flow + 0.001)) * 15.0,
      flowAngle * 3.0
    ) + vec2(t * 0.5, 0.0));
    streak = smoothstep(0.2, 0.6, streak) * flowMag * 5.0;
    streak *= insideCell;

    vec3 streakColor = vec3(0.18, 0.12, 0.08);
    color += streakColor * streak * 0.12;
  }

  // ─── ORGANELLES — darker spots drifting in the fluid ───
  {
    float organelles = organelleField(uv, t);
    organelles *= insideCell;

    // Darker than surrounding cytoplasm — rose/purple tint
    vec3 organelleColor = palette(organelles * 0.4 + 0.55 + paletteShift * 0.3,
      vec3(0.08, 0.04, 0.07),
      vec3(0.06, 0.03, 0.06),
      vec3(0.7, 0.4, 0.7),
      vec3(0.3, 0.2, 0.45));

    color = mix(color, organelleColor, organelles * 0.5);

    // Internal bright spot in organelles (like endoplasmic structures)
    float innerBright = smoothstep(0.55, 0.8, organelles) * insideCell;
    color += vec3(0.08, 0.05, 0.06) * innerBright * 0.3;
  }

  // ─── CELL MEMBRANE — bright edge ───
  {
    vec3 membraneColor = palette(0.15 + paletteShift * 0.5,
      vec3(0.2, 0.1, 0.08),
      vec3(0.15, 0.08, 0.06),
      vec3(0.9, 0.7, 0.5),
      vec3(0.1, 0.2, 0.35));
    color += membraneColor * membraneMask * 0.6;
  }

  // ─── GENTLE PULSING — the cell breathes ───
  {
    float pulse = sin(t * 0.3) * 0.5 + 0.5;
    pulse = pulse * pulse; // ease in-out
    float pulseBright = pulse * 0.06 * insideCell;

    vec3 pulseColor = vec3(0.12, 0.07, 0.04);
    color += pulseColor * pulseBright * (0.6 + u_bass * 0.5);
  }

  // ─── NUCLEUS — large central organelle ───
  {
    vec2 nucleusCenter = vec2(
      sin(t * 0.06) * 0.05,
      cos(t * 0.04) * 0.04
    );
    float nucleusDist = length(uv - nucleusCenter);
    float nucleusR = 0.1 + 0.008 * sin(t * 0.25);
    float nucleusMask = smoothstep(nucleusR + 0.02, nucleusR - 0.02, nucleusDist) * insideCell;
    float nucleusEdge = smoothstep(nucleusR + 0.02, nucleusR, nucleusDist)
                      - smoothstep(nucleusR, nucleusR - 0.02, nucleusDist);
    nucleusEdge = max(nucleusEdge, 0.0);

    vec3 nucleusColor = palette(0.6 + paletteShift * 0.3,
      vec3(0.1, 0.04, 0.1),
      vec3(0.08, 0.03, 0.08),
      vec3(0.6, 0.35, 0.7),
      vec3(0.35, 0.2, 0.5));

    color = mix(color, nucleusColor, nucleusMask * 0.45);

    // Nucleus membrane glow
    vec3 nucMemColor = vec3(0.2, 0.12, 0.15);
    color += nucMemColor * nucleusEdge * 0.4;

    // Nucleolus — bright spot inside nucleus
    float nucleolus = smoothstep(0.04, 0.01, nucleusDist) * insideCell;
    color += vec3(0.12, 0.06, 0.1) * nucleolus * 0.3;
  }

  // ─── GLOBAL AUDIO MODULATION ───
  // Bass drives gentle whole-cell pulsing
  color *= (0.92 + u_bass * 0.1);

  // Mid enriches warm tones
  color += vec3(0.01, 0.005, 0.002) * u_mid * insideCell * 0.5;

  // Amplitude general brightness
  color *= (0.9 + u_amplitude * 0.12);

  // ─── VIGNETTE ───
  float vd = length(uv);
  float vignette = 1.0 - smoothstep(0.5, 1.2, vd);
  vignette = pow(vignette, 1.3);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
