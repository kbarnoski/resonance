import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  float t = u_time * 0.10;
  float paletteShift = u_amplitude * 0.28;

  vec3 color = vec3(0.0);

  // ── Cocoon shape: egg silhouette ──
  // Elliptical cocoon body, slightly tilted
  vec2 cocoonUV = rot2(0.15) * uv;
  float cocoonDist = length(cocoonUV * vec2(1.0, 1.6));

  // ── Spiral wrapping threads ──
  // Angle and radius from center
  float radius = length(uv);
  float angle = atan(uv.y, uv.x);

  // Multiple interlocking spirals with different chirality and speed
  // Spiral parameter: angle + k * log(radius) = constant defines a logarithmic spiral
  float logR = log(max(radius, 0.001));

  // Spiral 1: main silk wrapping — bass driven
  float spiral1Pitch = 4.5 + u_bass * 1.5;
  float spiral1Phase = angle + logR * spiral1Pitch - t * 2.0;
  float thread1 = 0.5 + 0.5 * sin(spiral1Phase * 8.0);
  thread1 = pow(thread1, 6.0);

  // Spiral 2: counter-winding reinforcement — mid driven
  float spiral2Pitch = 3.0 + u_mid * 1.0;
  float spiral2Phase = -angle + logR * spiral2Pitch + t * 1.5;
  float thread2 = 0.5 + 0.5 * sin(spiral2Phase * 10.0);
  thread2 = pow(thread2, 7.0);

  // Spiral 3: fine gossamer threads — treble activated
  float spiral3Pitch = 7.0;
  float spiral3Phase = angle * 1.5 + logR * spiral3Pitch - t * 3.0;
  float thread3 = 0.5 + 0.5 * sin(spiral3Phase * 14.0);
  thread3 = pow(thread3, 9.0) * smoothstep(0.05, 0.5, u_treble);

  // ── Interior depth tunnel ──
  // Looking through the cocoon into infinite metamorphic depth
  // Deep FBM vortex drawn when inside cocoon
  float interiorMask = smoothstep(0.42, 0.30, cocoonDist);

  // Interior: spinning FBM vortex — transforming organic matter
  vec2 interior = uv / max(cocoonDist, 0.01); // normalized direction
  float interiorDepth = 1.0 / max(cocoonDist, 0.05); // perspective into depth

  // Spiral into infinite center
  float vortexAngle = angle - t * 1.5 + logR * 3.0;
  vec2 vortexUV = vec2(cos(vortexAngle), sin(vortexAngle)) * radius * interiorDepth * 0.3;
  vortexUV += vec2(t * 0.05, 0.0);

  float innerNoise = fbm(vortexUV * 2.0 + t * 0.2);
  float innerNoise2 = fbm(vortexUV * 4.5 - t * 0.3 + innerNoise * 0.4);
  float innerNoise3 = fbm(vortexUV * 9.0 + t * 0.4 + innerNoise2 * 0.3);

  // Interior is morphing organic matter — half-transformed wing scales, fluid chrysalis soup
  float morphProgress = innerNoise * 0.4 + innerNoise2 * 0.35 + innerNoise3 * 0.25;
  morphProgress = morphProgress * 0.5 + 0.5;

  // Interior depth fog — things blur and recede toward center
  float innerFog = smoothstep(0.4, 0.0, cocoonDist);

  // ── Color composition ──

  // Interior metamorphic colors — warm amber/gold to cool iridescent
  vec3 chrysalisInner = palette(
    morphProgress + t * 0.04 + paletteShift,
    vec3(0.5, 0.4, 0.2),
    vec3(0.4, 0.35, 0.25),
    vec3(1.0, 0.8, 0.5),
    vec3(0.0, 0.2, 0.4)
  );

  // Wing-scale iridescence deep inside
  vec3 wingIridescence = palette(
    innerNoise2 * 1.5 + t * 0.08 + paletteShift + 0.4,
    vec3(0.4, 0.5, 0.6),
    vec3(0.4, 0.4, 0.5),
    vec3(0.9, 1.0, 0.8),
    vec3(0.05, 0.2, 0.45)
  );

  // Silk thread colors — silvery with mid-tone warmth
  vec3 silkColor = palette(
    spiral1Phase * 0.1 + t * 0.05 + paletteShift + 0.15,
    vec3(0.55, 0.50, 0.45),
    vec3(0.35, 0.30, 0.25),
    vec3(0.9, 0.85, 0.7),
    vec3(0.05, 0.1, 0.2)
  );

  // Gossamer color — cool blue-white
  vec3 gossamerColor = palette(
    spiral3Phase * 0.05 + paletteShift + 0.65,
    vec3(0.5, 0.55, 0.65),
    vec3(0.3, 0.35, 0.45),
    vec3(0.7, 0.8, 1.0),
    vec3(0.0, 0.1, 0.3)
  );

  // ── Compose ──

  // Interior — fill with metamorphic soup
  color += chrysalisInner * interiorMask * 0.7;
  color += wingIridescence * innerFog * morphProgress * 0.5;

  // Depth tunnel: bright point at very center — light at infinity
  float infiniteLight = smoothstep(0.15, 0.0, cocoonDist);
  infiniteLight = pow(infiniteLight, 2.5);
  color += vec3(1.2, 1.1, 0.9) * infiniteLight * (1.0 + u_amplitude * 0.5);

  // Bass makes interior surge with transformation energy
  float bassGlow = smoothstep(0.35, 0.0, cocoonDist) * u_bass;
  color += wingIridescence * bassGlow * 0.8;

  // Silk threads on exterior
  float exteriorMask = smoothstep(0.28, 0.44, cocoonDist); // only on silk shell
  color += silkColor * thread1 * exteriorMask * 1.0;
  color += silkColor * thread2 * exteriorMask * 0.7;
  color += gossamerColor * thread3 * 0.6; // gossamer everywhere

  // Thread catchlight — threads catch light as bass hits
  float catchlight = (thread1 * thread2) * u_bass;
  color += vec3(1.3, 1.2, 1.0) * catchlight * exteriorMask * 1.5;

  // Outermost silk texture — FBM surface variation
  float surfaceTexture = fbm(uv * 6.0 + t * 0.15);
  float shellMask = smoothstep(0.35, 0.45, cocoonDist) * smoothstep(0.55, 0.42, cocoonDist);
  color += silkColor * 0.2 * surfaceTexture * shellMask;

  // ── Surrounding darkness — the branch it hangs from ──
  float outerDark = smoothstep(0.45, 0.70, cocoonDist);
  // Very faint ambient glow of the surrounding air
  vec3 ambientColor = palette(
    angle * 0.1 + t * 0.02 + paletteShift + 0.8,
    vec3(0.04, 0.03, 0.05),
    vec3(0.04, 0.03, 0.05),
    vec3(0.5, 0.4, 0.7),
    vec3(0.1, 0.0, 0.3)
  );
  color = mix(color, ambientColor, outerDark * 0.9);

  // ── Vignette ──
  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
