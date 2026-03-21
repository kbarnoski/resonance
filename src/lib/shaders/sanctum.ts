import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, SDF_PRIMITIVES } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  SDF_PRIMITIVES +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.25;

  // Mirror horizontally for symmetry
  vec2 suv = vec2(abs(uv.x), uv.y);

  // Grand arch — pointed Gothic arch shape
  float archWidth = 0.35 + u_bass * 0.03;
  float archHeight = 0.6;
  float archTop = uv.y - archHeight;
  // Parabolic arch shape
  float archCurve = archWidth * (1.0 - (uv.y + 0.2) * (uv.y + 0.2) * 1.5);
  archCurve = max(archCurve, 0.0);
  float archDist = abs(abs(uv.x) - archCurve) - 0.01;
  float archInside = step(abs(uv.x), archCurve) * step(-0.2, uv.y) * step(uv.y, archHeight);

  // Three nested arched windows
  float windows = 0.0;
  for (int i = 0; i < 3; i++) {
    float wx = (float(i) - 1.0) * 0.22;
    vec2 wp = uv - vec2(wx, 0.0);
    float wScale = 0.6 - float(i == 1 ? 0 : 1) * 0.1;
    float wArchW = 0.08 * wScale;
    float wArchCurve = wArchW * (1.0 - wp.y * wp.y * 8.0);
    wArchCurve = max(wArchCurve, 0.0);
    float wInside = step(abs(wp.x), wArchCurve) * step(-0.1, wp.y) * step(wp.y, 0.25 * wScale);
    windows += wInside;
  }
  windows = clamp(windows, 0.0, 1.0);

  // Light rays streaming through windows
  float lightAngle = sin(t * 0.5) * 0.2;
  vec2 lightDir = vec2(sin(lightAngle), -cos(lightAngle));
  float lightBeams = 0.0;
  for (int i = 0; i < 3; i++) {
    float wx = (float(i) - 1.0) * 0.22;
    vec2 source = vec2(wx, 0.15);
    vec2 toPoint = uv - source;
    float alongBeam = dot(toPoint, lightDir);
    float perpBeam = length(toPoint - lightDir * alongBeam);
    float beam = exp(-perpBeam * 30.0) * step(0.0, alongBeam);
    beam *= exp(-alongBeam * 2.0);
    lightBeams += beam;
  }
  lightBeams *= (0.5 + u_treble * 0.5);

  // Dust particles floating in the light beams
  float dust = snoise(uv * 20.0 + t * vec2(0.3, -0.5));
  dust = smoothstep(0.5, 0.8, dust) * lightBeams;

  // Rose window at the top — circular mandala
  vec2 roseCenter = vec2(0.0, 0.45);
  float roseDist = length(uv - roseCenter);
  float roseRadius = 0.12 + u_mid * 0.02;
  float roseRing = abs(roseDist - roseRadius) - 0.005;
  float roseGlow = smoothstep(0.01, 0.0, abs(roseRing));

  // Petals inside rose window
  float roseAngle = atan(uv.y - roseCenter.y, uv.x - roseCenter.x);
  float petals = sin(roseAngle * 8.0 + t) * 0.5 + 0.5;
  petals *= smoothstep(roseRadius, roseRadius * 0.3, roseDist);

  // Floor tiles — perspective grid
  float floorY = uv.y + 0.3;
  float floorMask = smoothstep(0.0, -0.05, floorY) * step(-0.7, uv.y);
  float tileX = sin(uv.x * 20.0 / max(-floorY, 0.01));
  float tileY = sin(floorY * -30.0);
  float tiles = smoothstep(0.8, 0.9, max(abs(tileX), abs(tileY))) * floorMask;

  // Column pillars
  float pillars = 0.0;
  for (int i = 0; i < 2; i++) {
    float px = (float(i) * 2.0 - 1.0) * 0.35;
    float pillarDist = abs(uv.x - px) - 0.025;
    pillars += smoothstep(0.01, 0.0, abs(pillarDist)) * step(-0.3, uv.y) * step(uv.y, 0.5);
  }

  // Atmospheric FBM — incense haze
  float haze = fbm(uv * 3.0 + vec2(t * 0.1, t * 0.3));
  float hazeMask = archInside * 0.3;

  // Stained glass palette — deep jewel tones
  vec3 col1 = palette(
    lightBeams * 2.0 + paletteShift,
    vec3(0.7, 0.6, 0.4),
    vec3(0.4, 0.35, 0.3),
    vec3(1.0, 0.8, 0.4),
    vec3(0.0, 0.08, 0.15)
  );

  // Deep stone / shadow
  vec3 col2 = palette(
    uv.y + paletteShift + 0.5,
    vec3(0.2, 0.18, 0.2),
    vec3(0.15, 0.15, 0.2),
    vec3(0.4, 0.35, 0.5),
    vec3(0.0, 0.1, 0.3)
  );

  // Rose window — ruby / sapphire
  vec3 col3 = palette(
    roseAngle / 6.28 + petals + t * 0.1 + paletteShift,
    vec3(0.5, 0.3, 0.4),
    vec3(0.5, 0.4, 0.5),
    vec3(0.9, 0.4, 0.6),
    vec3(0.3, 0.1, 0.5)
  );

  vec3 color = vec3(0.0);

  // Stone base
  color += col2 * 0.15 * (0.8 + abs(haze) * 0.4);

  // Light beams — the primary visual
  color += col1 * lightBeams * 1.5 * (0.7 + u_bass * 0.5);

  // Dust motes
  color += vec3(1.2, 1.1, 0.9) * dust * 0.8;

  // Arch structure
  float archEdge = smoothstep(0.015, 0.0, abs(archDist));
  color += col2 * archEdge * 1.5;

  // Pillars
  color += col2 * pillars * 0.8;

  // Stained glass windows
  color += col3 * windows * (0.3 + u_mid * 0.4);

  // Rose window
  color += col3 * roseGlow * 1.5;
  color += col3 * petals * 0.6 * (0.5 + u_treble * 0.5);

  // Floor reflection
  color += col1 * tiles * 0.2;

  // Haze overlay
  color += col1 * hazeMask * abs(haze) * 0.3;

  // Warm emissive at window centers
  color += vec3(1.3, 1.1, 0.8) * windows * lightBeams * 2.0;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
