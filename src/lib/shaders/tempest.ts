import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Tempest — violent storm with swirling dark clouds and lightning flashes

float hash1(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.25;

  // Rotating storm system — clouds spiral around a central eye
  vec2 center = vec2(0.1, 0.05);
  vec2 fromCenter = uv - center;
  float r = length(fromCenter);
  float a = atan(fromCenter.y, fromCenter.x);

  // Spiral cloud bands
  float spiralTwist = 2.5 + u_bass * 1.0;
  float spiralA = a + spiralTwist * r - t * 0.5;

  // Layered storm clouds with domain warping
  float clouds = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 cloudUV = vec2(spiralA + fi * 0.4, r * (3.0 + fi));
    cloudUV *= rot2(fi * 0.2);
    float warp = snoise(cloudUV * 0.5 + t * 0.1) * 0.3;
    cloudUV.x += warp;
    float layer = fbm(cloudUV + fi * 5.3 + vec2(t * 0.08, 0.0));
    layer = layer * 0.5 + 0.5;
    layer = pow(layer, 1.4);
    clouds += layer * (0.3 - fi * 0.03);
  }
  clouds = clamp(clouds, 0.0, 1.0);

  // Storm eye — calmer center
  float eye = smoothstep(0.15, 0.05, r);
  float eyeWall = smoothstep(0.08, 0.15, r) * smoothstep(0.25, 0.15, r);

  // Lightning flashes — intermittent bright patches
  float flashSeed = floor(t * 0.8);
  float flashRand = hash1(flashSeed * 7.3);
  float flashActive = step(0.65 - u_bass * 0.15, flashRand);
  float flashFade = exp(-fract(t * 0.8) * 5.0) * flashActive;

  // Flash location varies
  vec2 flashPos = vec2(hash1(flashSeed * 3.1) - 0.5, hash1(flashSeed * 5.7) - 0.5) * 0.6;
  float flashDist = length(uv - flashPos);
  float flashGlow = flashFade * exp(-flashDist * 3.0);

  // Flash illuminates nearby clouds
  float cloudFlash = flashGlow * clouds * 1.5;

  // Rain streaks — angled lines
  vec2 rainUV = uv * rot2(-0.15);
  float rain = snoise(vec2(rainUV.x * 20.0, rainUV.y * 60.0 + t * 15.0));
  rain = pow(max(rain, 0.0), 5.0) * u_treble * 0.3;
  rain *= smoothstep(0.1, 0.3, r); // no rain in the eye

  // Colors — dark moody storm palette
  vec3 darkCloud = palette(
    clouds * 0.4 + paletteShift,
    vec3(0.06, 0.06, 0.1),
    vec3(0.06, 0.05, 0.08),
    vec3(0.4, 0.35, 0.5),
    vec3(0.05, 0.05, 0.15)
  );

  vec3 lightCloud = palette(
    clouds * 0.3 + paletteShift + 0.3,
    vec3(0.2, 0.18, 0.25),
    vec3(0.12, 0.1, 0.15),
    vec3(0.5, 0.45, 0.6),
    vec3(0.1, 0.08, 0.2)
  );

  vec3 eyeColor = palette(
    r * 0.5 + paletteShift + 0.5,
    vec3(0.12, 0.13, 0.2),
    vec3(0.08, 0.08, 0.12),
    vec3(0.4, 0.4, 0.6),
    vec3(0.15, 0.15, 0.3)
  );

  // Compose
  vec3 color = mix(darkCloud, lightCloud, clouds * 0.6);

  // Eye wall — brightest/most turbulent
  color = mix(color, lightCloud * 1.3, eyeWall * 0.5);
  color = mix(color, eyeColor, eye);

  // Lightning illumination
  color += vec3(0.4, 0.4, 0.6) * cloudFlash;
  // Direct flash core
  float flashCore = flashFade * exp(-flashDist * 8.0);
  color += vec3(0.7, 0.75, 0.95) * flashCore;

  // Rain
  color += vec3(0.4, 0.45, 0.55) * rain;

  // Mid: shifts cloud density and color temperature
  color = mix(color, color * vec3(0.85, 0.9, 1.1), u_mid * 0.3);

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
