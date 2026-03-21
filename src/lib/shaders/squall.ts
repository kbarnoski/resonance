import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Squall — sudden wind burst with directional force lines

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.2;
  float paletteShift = u_amplitude * 0.2;

  // Primary wind direction — sweeping from left to right with gusts
  float gustPhase = sin(t * 0.8) * 0.5 + 0.5;
  float gustStr = 0.5 + gustPhase * 0.5 + u_bass * 0.4;
  float windAngle = -0.1 + snoise(vec2(t * 0.25, uv.y * 2.0)) * 0.15;
  vec2 windVec = vec2(cos(windAngle), sin(windAngle));

  // Horizontal force lines — stretched noise in wind direction
  float forceLines = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    // Stretch UV heavily in the wind direction
    vec2 stretchedUV = uv;
    stretchedUV.x = uv.x * 0.3 - t * gustStr * (1.0 + fi * 0.2);
    stretchedUV.y = uv.y * (4.0 + fi * 2.0);
    stretchedUV *= rot2(windAngle + fi * 0.05);

    float line = snoise(stretchedUV + fi * 7.7);
    line = pow(abs(line), 0.8) * (0.4 - fi * 0.05);
    forceLines += line;
  }

  // Wind streaks — sharp directional marks
  float streaks = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 streakUV = uv * rot2(windAngle);
    streakUV = vec2(streakUV.x * 0.8 - t * (3.0 + fi), streakUV.y * (20.0 + fi * 10.0));
    streakUV += fi * 13.0;

    float streak = snoise(streakUV);
    streak = smoothstep(0.4, 0.6, streak);

    // Fade streaks at edges
    float yFade = exp(-pow(uv.y * 2.0, 2.0));
    streaks += streak * yFade * (0.3 - fi * 0.05) * gustStr;
  }

  // Turbulent gusts — swirling eddies
  vec2 gustUV = uv + windVec * t * 0.5;
  float gust1 = fbm(gustUV * 2.0 + vec2(t * 0.6, 0.0));
  float gust2 = fbm(gustUV * 3.0 + vec2(t * 0.8, 2.0) + 5.0);
  float gusts = gust1 * 0.6 + gust2 * 0.4;
  gusts = gusts * 0.5 + 0.5;

  // Pressure front — visible line where the squall hits
  float frontX = -0.5 + fract(t * 0.08) * 2.0;
  float front = smoothstep(frontX + 0.05, frontX - 0.05, uv.x);
  float frontEdge = exp(-pow((uv.x - frontX) * 8.0, 2.0));

  // Debris particles caught in the wind
  float debris = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 debrisUV = uv * (12.0 + fi * 6.0);
    debrisUV += windVec * t * (4.0 + fi * 1.5);
    debrisUV.y += sin(debrisUV.x * 0.5 + t * 2.0) * 0.3; // tumbling
    vec2 did = floor(debrisUV);
    vec2 df = fract(debrisUV) - 0.5;
    vec2 rnd = hash2(did + fi * 17.0);
    float d = length(df - (rnd - 0.5) * 0.3);
    debris += smoothstep(0.04, 0.01, d) * (0.3 - fi * 0.06);
  }

  // Colors — windswept gray-blue palette
  vec3 calmColor = palette(
    gusts * 0.3 + paletteShift + 0.4,
    vec3(0.2, 0.22, 0.28),
    vec3(0.1, 0.1, 0.14),
    vec3(0.5, 0.5, 0.65),
    vec3(0.2, 0.22, 0.35)
  );

  vec3 windColor = palette(
    forceLines * 0.4 + streaks * 0.2 + paletteShift,
    vec3(0.35, 0.38, 0.42),
    vec3(0.15, 0.15, 0.2),
    vec3(0.5, 0.55, 0.7),
    vec3(0.15, 0.18, 0.3)
  );

  vec3 frontColor = palette(
    frontEdge * 0.5 + paletteShift + 0.2,
    vec3(0.45, 0.47, 0.5),
    vec3(0.2, 0.2, 0.22),
    vec3(0.5, 0.55, 0.6),
    vec3(0.15, 0.17, 0.25)
  );

  // Compose
  vec3 color = calmColor;
  color = mix(color, windColor, clamp(forceLines * 0.6, 0.0, 1.0));
  color += windColor * streaks * 0.5;
  color = mix(color, frontColor, frontEdge * 0.6);

  // Debris
  color += vec3(0.3, 0.28, 0.22) * debris * u_treble;

  // Mid: adds cyan tint to the force lines
  color += vec3(0.05, 0.1, 0.12) * forceLines * u_mid * 0.4;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
