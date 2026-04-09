import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Dark ocean waves at night — moonlight catching wave crests.
// Deep navy-black water with silver/white specular highlights.

// Light 3-octave fbm for wave detail
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Layered sine waves for ocean surface height
float oceanHeight(vec2 p, float t) {
  float h = 0.0;
  // Large swells
  h += sin(p.x * 1.2 + t * 0.6 + p.y * 0.4) * 0.35;
  h += sin(p.x * 0.7 - t * 0.45 + p.y * 1.1) * 0.25;
  // Medium waves
  h += sin(p.x * 2.5 + t * 1.1 - p.y * 0.8) * 0.15;
  h += sin(p.y * 3.0 + t * 0.9 + p.x * 1.5) * 0.1;
  // Small chop
  h += sin(p.x * 5.0 - t * 1.8 + p.y * 4.0) * 0.05;
  // Noise-based detail
  h += fbm3(p * 0.8 + t * 0.2) * 0.12;
  return h;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.2;

  // ── Perspective ocean plane ──
  // Camera looking out across a dark sea
  float camH = 0.15;
  float horizon = 0.05;
  float isWater = step(uv.y, horizon + 0.02);

  // Project onto water plane
  float dist = camH / max(horizon - uv.y + 0.01, 0.005);
  dist = clamp(dist, 0.5, 80.0);
  vec2 worldP = vec2(uv.x * dist * 0.6, dist + t * 4.0);

  // Bass makes the sea rougher
  float roughness = 1.0 + u_bass * 0.4;

  // ── Wave height and gradient for normals ──
  float eps = 0.02;
  float h  = oceanHeight(worldP * roughness, t);
  float hx = oceanHeight((worldP + vec2(eps, 0.0)) * roughness, t);
  float hy = oceanHeight((worldP + vec2(0.0, eps)) * roughness, t);

  // Approximate surface normal (for specular)
  vec2 grad = vec2(hx - h, hy - h) / eps;
  float slopeLen = length(grad);

  // ── Moonlight specular ──
  // Moon is high-right in the sky
  vec2 moonDir = normalize(vec2(0.3, 1.0));
  // Reflected direction from wave normal
  float spec = dot(normalize(grad), moonDir);
  spec = max(spec, 0.0);
  // Sharp specular — only bright on wave crests
  float specPow = pow(spec, 12.0) * 0.35;
  // Broader glow
  float specSoft = pow(spec, 4.0) * 0.08;

  // Wave crests: where slope is steep and height is positive
  float crest = smoothstep(0.2, 0.6, slopeLen) * smoothstep(0.0, 0.3, h);

  // Depth fog — far waves merge to dark
  float depthFade = exp(-dist * 0.04);

  // ── Water base color ──
  vec3 deepWater = vec3(0.01, 0.015, 0.03); // near-black navy
  vec3 shallowWater = palette(
    h * 0.3 + paletteShift + 0.1,
    vec3(0.02, 0.03, 0.06),
    vec3(0.02, 0.03, 0.05),
    vec3(0.3, 0.5, 0.7),
    vec3(0.15, 0.2, 0.35)
  );
  vec3 waterCol = mix(deepWater, shallowWater, depthFade * 0.4);

  // Wave height modulates brightness subtly
  waterCol *= 0.9 + h * 0.15;

  // ── Specular highlights — moonlight on crests ──
  vec3 moonColor = vec3(0.35, 0.38, 0.40); // cool silver
  waterCol += moonColor * specPow * depthFade * (0.7 + u_treble * 0.3);
  waterCol += moonColor * specSoft * depthFade * 0.5;

  // Crest foam — faint white on breaking wave tops
  float foam = crest * depthFade * 0.12;
  waterCol += vec3(0.25, 0.28, 0.30) * foam;

  // ── Moon reflection path ── bright streak on the water
  float moonPathX = uv.x - 0.15; // slightly right of center
  float moonPath = exp(-moonPathX * moonPathX * 8.0);
  float moonPathFlicker = 0.6 + 0.4 * sin(dist * 0.5 + t * 2.0 + h * 6.0);
  waterCol += moonColor * moonPath * moonPathFlicker * depthFade * 0.15 * (0.8 + u_mid * 0.2);

  // ── Sky — dark night sky with faint gradient ──
  float skyT = smoothstep(horizon - 0.02, horizon + 0.4, uv.y);
  vec3 skyColor = mix(
    vec3(0.015, 0.02, 0.035),  // horizon — slightly lighter
    vec3(0.005, 0.005, 0.015), // zenith — near black
    skyT
  );

  // Moon glow in sky
  vec2 moonPos = vec2(0.15, 0.35);
  float moonDist = length(uv - moonPos);
  float moonGlow = 0.015 / (moonDist * moonDist + 0.01);
  moonGlow = min(moonGlow, 0.30);
  skyColor += vec3(0.25, 0.27, 0.30) * moonGlow;

  // Moon disc
  float moonDisc = smoothstep(0.035, 0.03, moonDist);
  skyColor += vec3(0.30, 0.32, 0.35) * moonDisc;

  // ── Composite sky and water ──
  float horizonBlend = smoothstep(horizon - 0.02, horizon + 0.02, uv.y);
  vec3 color = mix(waterCol, skyColor, horizonBlend);

  // Horizon glow line
  float hGlow = exp(-abs(uv.y - horizon) * 40.0) * 0.04;
  color += vec3(0.15, 0.18, 0.22) * hGlow;

  // Mid drives gentle luminosity
  color *= 0.95 + u_mid * 0.08;

  // Vignette
  float vignette = 1.0 - smoothstep(0.45, 1.3, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
