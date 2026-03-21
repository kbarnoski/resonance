import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Darkstar — a dying red dwarf with fading glow. Corona barely visible,
// cold space, occasional flicker of remaining energy. Melancholy cosmic mood.

float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}

// Feeble granulation — dying convection cells, barely visible
float dyingGranulation(vec2 uv, float t) {
  float scale = 5.0;
  vec2 p = uv * scale;
  float cellNoise = snoise(p + t * 0.02);
  float cellNoise2 = snoise(p * 1.7 + t * 0.015 + vec2(5.3, 2.1));

  // Cells are faint and indistinct — dying star has weak convection
  float cells = cellNoise * 0.5 + 0.5;
  cells *= cellNoise2 * 0.5 + 0.5;
  return cells * 0.3; // very dim
}

// Rare energy flicker — sporadic last bursts of nuclear activity
float energyFlicker(vec2 uv, float t) {
  float total = 0.0;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // Each flicker happens at a random interval — most of the time nothing
    float flickerTime = sin(t * 0.3 + fi * 7.3) * 0.5 + 0.5;
    float flickerActive = smoothstep(0.92, 0.96, flickerTime); // only active 4% of time

    float flickerAngle = hash1(fi * 13.7 + floor(t * 0.3 + fi * 7.3)) * 6.28318;
    float flickerR = 0.15 + hash1(fi * 23.1 + floor(t * 0.3)) * 0.12;
    vec2 flickerPos = vec2(cos(flickerAngle), sin(flickerAngle)) * flickerR;

    float dist = length(uv - flickerPos);
    total += exp(-dist * dist * 200.0) * flickerActive * 2.0;
    // Brief afterglow
    float afterglow = smoothstep(0.96, 1.0, flickerTime);
    total += exp(-dist * dist * 80.0) * afterglow * 0.5;
  }
  return total;
}

// Fading corona — barely there
float fadingCorona(vec2 uv, float t, float discR) {
  float r = length(uv);
  float coronaR = r - discR;

  if (coronaR < 0.0) return 0.0;

  // Very weak, very thin corona
  float corona = exp(-coronaR * 12.0) * 0.15;

  // Slight asymmetry — remnant magnetic field
  float angle = atan(uv.y, uv.x);
  float asym = sin(angle * 2.0 + t * 0.1) * 0.5 + 0.5;
  corona *= (0.6 + asym * 0.4);

  // Noise structure in what little corona remains
  float coronaNoise = snoise(vec2(angle * 3.0, coronaR * 10.0) + t * 0.05) * 0.5 + 0.5;
  corona *= (0.5 + coronaNoise * 0.5);

  return corona;
}

// Cold distant star field — emphasizing loneliness
float coldStars(vec2 uv, float seed) {
  vec2 id = floor(uv * 50.0);
  vec2 f = fract(uv * 50.0) - 0.5;
  float h = fract(sin(dot(id + seed, vec2(127.1, 311.7))) * 43758.5453);
  if (h < 0.96) return 0.0;
  float brightness = fract(h * 37.3) * 0.5; // dim stars — cold universe
  float r = 0.02 + 0.015 * brightness;
  // Very slow, minimal twinkle — dead universe feel
  float twinkle = 0.85 + 0.15 * sin(u_time * 0.5 + h * 40.0);
  return smoothstep(r, 0.0, length(f)) * twinkle * brightness;
}

// Cooling surface spots — dark regions where convection has stopped
float coolingSpots(vec2 uv, float t) {
  float total = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float spotAngle = fi * 1.256 + t * 0.01;
    float spotR = 0.08 + fract(sin(fi * 17.3) * 43.7) * 0.08;
    vec2 spotPos = vec2(cos(spotAngle), sin(spotAngle)) * spotR;
    float dist = length(uv - spotPos);
    float spotSize = 0.04 + fract(sin(fi * 31.1) * 27.3) * 0.04;
    total += smoothstep(spotSize, spotSize * 0.3, dist) * 0.4;
  }
  return total;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.1; // Everything moves slowly — dying star
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // ── The dying star — small, dim red dwarf ──
  float discRadius = 0.22;
  float discMask = smoothstep(discRadius + 0.008, discRadius - 0.008, r);

  // Limb darkening — more extreme for cool stars
  float mu = sqrt(max(0.0, 1.0 - (r / discRadius) * (r / discRadius)));
  float limb = 0.3 + 0.7 * mu * mu; // Squared for more edge darkening

  // Surface structure
  float gran = dyingGranulation(uv, t);
  float spots = coolingSpots(rot2(t * 0.05) * uv, t);

  float surface = gran * limb * (1.0 - spots * 0.6);

  // ── Barely visible corona ──
  float corona = fadingCorona(uv, t, discRadius);
  corona *= (0.3 + u_mid * 0.4); // mid gives slight corona visibility

  // ── Rare energy flickers ──
  float flickers = energyFlicker(uv, t);
  flickers *= (0.3 + u_bass * 1.5); // bass triggers flickers

  // ── Cold star field ──
  float stars1 = coldStars(uv, 0.0);
  float stars2 = coldStars(uv * 1.5 + vec2(13.0, 7.0), 50.0);

  // ── Faint nebulous wisps — remnant of expelled envelope ──
  float wisps = fbm(uv * 2.0 + t * 0.01) * 0.5 + 0.5;
  wisps *= smoothstep(0.3, 0.8, r) * 0.08;
  wisps *= (0.5 + u_treble * 0.3);

  // ── Colors — everything is muted, cold, dying ──
  // Star surface — deep dull red, not orange, not yellow
  vec3 surfaceCol = palette(
    surface * 0.5 + t * 0.005 + paletteShift,
    vec3(0.25, 0.08, 0.05),
    vec3(0.2, 0.06, 0.03),
    vec3(0.3, 0.1, 0.05),
    vec3(0.05, 0.0, 0.0)
  );

  // Spot color — even darker red-brown (cooler regions)
  vec3 spotCol = palette(
    spots + t * 0.003 + paletteShift + 0.2,
    vec3(0.12, 0.04, 0.03),
    vec3(0.08, 0.03, 0.02),
    vec3(0.2, 0.08, 0.04),
    vec3(0.03, 0.0, 0.0)
  );

  // Corona — faint reddish glow
  vec3 coronaCol = palette(
    corona + t * 0.01 + paletteShift + 0.3,
    vec3(0.2, 0.1, 0.08),
    vec3(0.15, 0.06, 0.05),
    vec3(0.3, 0.1, 0.05),
    vec3(0.05, 0.02, 0.0)
  );

  // Flicker — brief flash of brighter orange (last nuclear spasms)
  vec3 flickerCol = palette(
    flickers + t * 0.05 + paletteShift + 0.5,
    vec3(0.5, 0.3, 0.15),
    vec3(0.4, 0.2, 0.1),
    vec3(0.3, 0.15, 0.05),
    vec3(0.05, 0.02, 0.0)
  );

  // Background — cold, nearly black with slight blue tint
  vec3 bgCol = palette(
    r * 0.1 + paletteShift + 0.7,
    vec3(0.01, 0.01, 0.02),
    vec3(0.01, 0.01, 0.02),
    vec3(0.3, 0.3, 0.5),
    vec3(0.1, 0.1, 0.2)
  );

  // Wisp color — faint blue-grey expelled gas
  vec3 wispCol = palette(
    wisps * 2.0 + t * 0.005 + paletteShift + 0.6,
    vec3(0.08, 0.08, 0.12),
    vec3(0.05, 0.05, 0.08),
    vec3(0.3, 0.3, 0.5),
    vec3(0.1, 0.1, 0.2)
  );

  vec3 color = bgCol;

  // Stars — cold and distant
  color += vec3(0.7, 0.75, 0.85) * stars1 * 0.4;
  color += vec3(0.6, 0.65, 0.75) * stars2 * 0.3;

  // Remnant wisps
  color += wispCol * wisps;

  // Corona
  color += coronaCol * corona;

  // Star surface
  vec3 starSurface = mix(surfaceCol, spotCol, spots) * surface;
  color += starSurface * discMask * 0.8;

  // Very faint core glow — not bright, just slightly warmer
  color += surfaceCol * exp(-r * 5.0) * 0.3;

  // Energy flickers — rare but noticeable
  color += flickerCol * flickers * discMask;

  // Dim edge glow
  float edgeGlow = smoothstep(discRadius + 0.02, discRadius - 0.02, r) *
                   smoothstep(discRadius - 0.04, discRadius, r);
  color += surfaceCol * edgeGlow * 0.2;

  // Treble — slight shimmer on what remains of the surface
  float shimmer = snoise(uv * 15.0 + t * 0.3) * 0.5 + 0.5;
  color += surfaceCol * shimmer * u_treble * 0.05 * discMask;

  // Vignette — deep, emphasizing isolation
  float vignette = 1.0 - smoothstep(0.3, 1.0, r);
  color *= (0.5 + 0.5 * vignette);

  // No aggressive tonemap — keep it dark and somber
  color = pow(color, vec3(0.95));

  gl_FragColor = vec4(color, 1.0);
}
`;
