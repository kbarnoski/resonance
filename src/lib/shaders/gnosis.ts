import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, VORONOI } from "./shared";

// Knowing eye: concentric iris-like rings with fractal detail,
// pupil that dilates with bass, radiating awareness patterns.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  VORONOI +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  vec3 color = vec3(0.0);

  // Pupil: dilates with bass
  float pupilRadius = 0.08 + 0.12 * u_bass;
  float pupil = smoothstep(pupilRadius + 0.01, pupilRadius - 0.01, r);

  // Pupil depth - looking into the void
  float pupilDepth = smoothstep(pupilRadius, 0.0, r);
  float voidPattern = fbm(uv * 15.0 + t * 0.5);
  vec3 voidCol = palette(
    voidPattern + t * 0.1 + paletteShift,
    vec3(0.05, 0.02, 0.1),
    vec3(0.1, 0.1, 0.15),
    vec3(0.5, 0.3, 1.0),
    vec3(0.7, 0.0, 0.3)
  );
  color += voidCol * pupilDepth * 0.4;

  // Iris: multiple concentric rings with fiber detail
  float irisInner = pupilRadius + 0.02;
  float irisOuter = 0.45 + 0.05 * u_mid;
  float irisMask = smoothstep(irisInner - 0.01, irisInner + 0.02, r) * smoothstep(irisOuter + 0.02, irisOuter - 0.01, r);

  // Iris fiber pattern: radial streaks
  float fibers = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float fiberFreq = 20.0 + fi * 12.0;
    float fiberPhase = fi * 1.7 + t * 0.3;
    float noiseMod = snoise(vec2(a * fiberFreq * 0.1 + fi * 5.0, r * 8.0 + fiberPhase));
    float fiber = sin(a * fiberFreq + noiseMod * 3.0 + fiberPhase);
    fiber = smoothstep(0.3, 0.9, fiber);
    fibers += fiber * (1.0 / (1.0 + fi * 0.5));
  }
  fibers *= irisMask;

  // Iris coloring - radial gradient with palette
  vec3 irisCol1 = palette(
    r * 2.0 + paletteShift,
    vec3(0.5, 0.4, 0.3),
    vec3(0.5, 0.5, 0.5),
    vec3(0.8, 1.0, 0.6),
    vec3(0.1, 0.2, 0.3)
  );
  vec3 irisCol2 = palette(
    r * 3.0 + a * 0.1 + paletteShift + 0.3,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.4, 0.3),
    vec3(1.0, 0.7, 0.4),
    vec3(0.0, 0.15, 0.3)
  );

  color += mix(irisCol1, irisCol2, fibers * 0.5) * irisMask * (0.6 + fibers * 0.4);

  // Crypts of Fuchs: dark radial gaps in the iris
  float crypts = sin(a * 36.0 + snoise(vec2(a * 5.0, t * 0.5)) * 2.0);
  crypts = smoothstep(0.7, 0.95, crypts) * irisMask;
  color *= 1.0 - crypts * 0.4;

  // Collarette ring: bright ring between pupil and mid-iris
  float collarR = irisInner + (irisOuter - irisInner) * 0.35;
  float collar = smoothstep(0.012, 0.0, abs(r - collarR));
  vec3 collarCol = palette(
    t * 0.2 + paletteShift + 0.5,
    vec3(0.6, 0.6, 0.5),
    vec3(0.4, 0.4, 0.4),
    vec3(1.0, 0.9, 0.7),
    vec3(0.0, 0.1, 0.2)
  );
  color += collarCol * collar * 1.5 * (0.7 + 0.4 * u_mid);

  // Limbal ring: dark edge of iris
  float limbal = smoothstep(0.02, 0.0, abs(r - irisOuter)) * 0.8;
  color *= 1.0 - limbal * 0.5;
  color += collarCol * limbal * 0.3;

  // Awareness rays: radial beams extending from the iris
  float rayCount = 12.0;
  float raySector = 6.28318 / rayCount;
  float rayAngle = mod(a + t * 0.2, raySector) - raySector * 0.5;
  float ray = smoothstep(0.03, 0.0, abs(rayAngle)) * smoothstep(irisOuter, irisOuter + 0.1, r);
  float rayFade = exp(-(r - irisOuter) * 3.5);
  float rayPulse = 0.5 + 0.5 * sin(floor((a + t * 0.2) / raySector) * 3.7 + t * 2.0 + u_bass * 5.0);

  vec3 rayCol = palette(
    a * 0.3 + paletteShift + 0.2,
    vec3(0.5, 0.5, 0.5),
    vec3(0.5, 0.5, 0.5),
    vec3(1.0, 0.8, 0.6),
    vec3(0.0, 0.2, 0.4)
  );
  color += rayCol * ray * rayFade * rayPulse * (0.5 + 0.5 * u_amplitude);

  // Voronoi texture in the outer sclera region
  float scleraMask = smoothstep(irisOuter + 0.02, irisOuter + 0.15, r) * smoothstep(1.2, 0.6, r);
  vec3 vor = voronoi(uv * 8.0 + t * 0.2);
  float vorPattern = smoothstep(0.05, 0.15, vor.y - vor.x);
  color += rayCol * vorPattern * scleraMask * 0.2;

  // Specular highlight - treble responsive
  vec2 specPos = vec2(0.08, 0.06);
  float spec = smoothstep(0.06, 0.0, length(uv - specPos));
  color += vec3(1.3, 1.2, 1.1) * spec * (0.5 + 0.5 * u_treble);

  // Pupil edge glow
  float pupilEdge = smoothstep(0.02, 0.0, abs(r - pupilRadius));
  color += voidCol * 2.0 * pupilEdge * (0.6 + 0.4 * u_bass);

  // Vignette
  color *= smoothstep(1.4, 0.3, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
