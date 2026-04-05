import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Crescent — Thin crescent of light against infinite dark,
// like a planet's terminator line with atmospheric scattering.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Atmospheric scattering along the limb
float atmosphere(vec2 uv, vec2 center, float planetR, float atmosR) {
  float r = length(uv - center);
  // Only outside the planet
  float atmos = smoothstep(atmosR, planetR, r);
  atmos *= smoothstep(planetR - 0.02, planetR + 0.01, r);
  return atmos;
}

// Star field
float stars(vec2 uv) {
  vec2 id = floor(uv * 90.0);
  vec2 f = fract(uv * 90.0) - 0.5;
  float h = fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.93, h);
  float radius = 0.02 + 0.03 * fract(h * 23.0);
  float twinkle = 0.6 + 0.4 * sin(u_time * (2.0 + h * 7.0) + h * 70.0);
  return star * smoothstep(radius, 0.0, length(f)) * twinkle;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.08;

  float paletteShift = u_amplitude * 0.2;

  // Planet center — offset so the crescent is interesting
  vec2 center = vec2(0.05, 0.0);
  float planetR = 0.35;

  float r = length(uv - center);
  float a = atan(uv.y - center.y, uv.x - center.x);

  // ── Deep space background ──
  vec3 color = vec3(0.005, 0.005, 0.015);

  // Stars — hidden behind the planet
  float s = stars(uv);
  float behindPlanet = smoothstep(planetR - 0.01, planetR + 0.01, r);
  color += vec3(0.8, 0.85, 1.1) * s * 0.6 * behindPlanet;

  // ── The crescent — light source from the right side ──
  // Terminator angle slowly drifts
  float terminatorAngle = sin(t * 0.3) * 0.2;
  vec2 lightDir = vec2(cos(terminatorAngle), sin(terminatorAngle * 0.5));

  // How much the surface faces the light
  vec2 surfaceNormal = normalize(uv - center);
  float facing = dot(surfaceNormal, lightDir);

  // Crescent: only the lit sliver
  float crescentWidth = 0.15 + u_bass * 0.05;
  float lit = smoothstep(-crescentWidth, crescentWidth * 0.5, facing);

  // Only on the planet surface
  float onPlanet = smoothstep(planetR + 0.005, planetR - 0.01, r);

  // Surface detail — subtle terrain
  float terrain = fbm3((uv - center) * 8.0 + t * 0.02);
  terrain = terrain * 0.5 + 0.5;

  float crescentBrightness = lit * onPlanet;

  // ── Atmospheric limb glow ──
  // Thin bright edge all along the lit limb
  float limbDist = abs(r - planetR);
  float limbGlow = exp(-limbDist * 50.0) * smoothstep(-0.1, 0.3, facing);
  limbGlow *= (1.0 + u_treble * 1.0);

  // Atmospheric scattering — blue-ish glow that wraps slightly around
  float atmosScatter = exp(-limbDist * 20.0) * smoothstep(-0.4, 0.1, facing);
  atmosScatter *= smoothstep(planetR - 0.05, planetR + 0.03, r);

  // Forward scattering — bright halo where atmosphere is tangent to light
  float forwardScatter = exp(-limbDist * 80.0) * smoothstep(0.5, 1.0, facing);

  // ── Night side — faint surface features ──
  float nightSide = (1.0 - lit) * onPlanet;
  float nightDetail = snoise((uv - center) * 15.0 + t * 0.01) * 0.5 + 0.5;
  nightDetail = pow(nightDetail, 3.0); // sparse bright spots (cities or volcanism)

  // ── Colors ──
  // Lit surface — pale silvery-blue (icy world)
  vec3 surfLitCol = palette(
    terrain * 0.3 + facing * 0.2 + t * 0.02 + paletteShift,
    vec3(0.65, 0.68, 0.75),
    vec3(0.15, 0.12, 0.1),
    vec3(0.3, 0.25, 0.2),
    vec3(0.05, 0.08, 0.12)
  );

  // Limb glow — brilliant white with slight blue
  vec3 limbCol = palette(
    limbGlow + t * 0.03 + paletteShift + 0.2,
    vec3(0.9, 0.92, 0.98),
    vec3(0.1, 0.08, 0.06),
    vec3(0.2, 0.2, 0.3),
    vec3(0.05, 0.08, 0.15)
  );

  // Atmosphere — blue scattered light
  vec3 atmosCol = palette(
    atmosScatter + a * 0.05 + t * 0.01 + paletteShift + 0.5,
    vec3(0.3, 0.45, 0.7),
    vec3(0.15, 0.2, 0.35),
    vec3(0.2, 0.4, 0.8),
    vec3(0.1, 0.15, 0.35)
  );

  // Night side — very faint warm spots
  vec3 nightCol = palette(
    nightDetail + t * 0.015 + paletteShift + 0.8,
    vec3(0.25, 0.2, 0.15),
    vec3(0.1, 0.08, 0.06),
    vec3(0.3, 0.2, 0.1),
    vec3(0.05, 0.03, 0.02)
  );

  // ── Compose ──
  // Lit crescent
  color += surfLitCol * crescentBrightness * (0.6 + terrain * 0.4);

  // Limb brightening
  color += limbCol * limbGlow * 1.5;

  // Forward scattering highlight
  color += vec3(1.0, 0.98, 0.95) * forwardScatter * 0.8;

  // Atmospheric scattering
  color += atmosCol * atmosScatter * (0.3 + u_mid * 0.4);

  // Night side surface
  color += nightCol * nightSide * nightDetail * 0.08;

  // ── Faint secondary light — reflected from a nearby moon ──
  float secondaryLight = smoothstep(0.2, -0.1, facing) * onPlanet * 0.03;
  color += vec3(0.1, 0.12, 0.18) * secondaryLight;

  // ── Dark planet body — ensure it's dark ──
  float darkBody = onPlanet * (1.0 - lit);
  color *= mix(vec3(1.0), vec3(0.02, 0.02, 0.03), darkBody * 0.9);

  // Distant light source glow (off-screen star)
  float starGlow = exp(-length(uv - vec2(0.8, 0.0)) * 3.0) * 0.15;
  color += vec3(1.0, 0.95, 0.85) * starGlow;

  // Vignette
  float vignette = 1.0 - smoothstep(0.5, 1.3, length(uv));
  color *= (0.8 + 0.2 * vignette);

  gl_FragColor = vec4(color, 1.0);
}
`;
