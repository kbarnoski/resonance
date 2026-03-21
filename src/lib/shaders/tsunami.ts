import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Tsunami — massive wave building and cresting, wall of water

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.25;

  // Wave profile — a massive curling wave moving left to right
  // The crest arcs over and curls down
  float wavePhase = uv.x * 1.5 - t * 0.3;
  float waveHeight = 0.3 + u_bass * 0.1;

  // Main wave body curve
  float waveCurve = waveHeight * sin(wavePhase * 1.2 + 0.5)
                  + 0.08 * snoise(vec2(wavePhase * 3.0, t * 0.5));
  float waveBody = smoothstep(waveCurve + 0.03, waveCurve - 0.03, uv.y);

  // Curl at the crest — tighter curve at the top
  float curlX = uv.x + 0.1;
  float curlR = length(vec2(curlX, uv.y - waveCurve - 0.1)) * 3.0;
  float curlAngle = atan(uv.y - waveCurve - 0.1, curlX);
  float curlMask = smoothstep(0.4, 0.2, curlR) * step(-1.5, curlAngle);

  // Water turbulence inside the wave
  vec2 turbUV = uv * rot2(0.1) + vec2(-t * 0.4, t * 0.1);
  float turb = fbm(turbUV * 4.0) * 0.5 + 0.5;
  float deepTurb = fbm(turbUV * 2.0 + 5.0) * 0.5 + 0.5;

  // Foam at the crest — white frothy line
  float foamLine = abs(uv.y - waveCurve);
  float foam = smoothstep(0.06, 0.0, foamLine) * (0.7 + u_treble * 0.5);
  foam += curlMask * 0.5;
  // Foam texture
  float foamTex = snoise(uv * 20.0 + vec2(-t * 2.0, t * 0.5));
  foamTex = foamTex * 0.5 + 0.5;
  foam *= foamTex;

  // Spray particles above the crest
  float spray = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 sprayUV = uv + vec2(-t * (1.0 + fi * 0.3), -fi * 0.05);
    float s = snoise(sprayUV * (15.0 + fi * 5.0));
    s = pow(max(s, 0.0), 4.0);
    float sprayMask = smoothstep(waveCurve - 0.05, waveCurve + 0.2 + fi * 0.08, uv.y);
    sprayMask *= smoothstep(waveCurve + 0.4, waveCurve + 0.1, uv.y);
    spray += s * sprayMask * (0.5 - fi * 0.12);
  }

  // Deep water color
  vec3 deepColor = palette(
    deepTurb * 0.4 + paletteShift,
    vec3(0.02, 0.06, 0.15),
    vec3(0.03, 0.08, 0.15),
    vec3(0.4, 0.6, 0.8),
    vec3(0.15, 0.2, 0.35)
  );

  // Wave body color — translucent green-blue
  vec3 waveColor = palette(
    turb * 0.5 + uv.y * 0.3 + paletteShift + 0.2,
    vec3(0.05, 0.18, 0.22),
    vec3(0.08, 0.2, 0.2),
    vec3(0.5, 0.8, 0.7),
    vec3(0.1, 0.2, 0.3)
  );

  // Sky behind
  vec3 skyColor = palette(
    uv.y * 0.3 + paletteShift + 0.5,
    vec3(0.15, 0.18, 0.22),
    vec3(0.1, 0.12, 0.15),
    vec3(0.5, 0.6, 0.7),
    vec3(0.2, 0.25, 0.35)
  );

  // Compose
  vec3 color = skyColor;
  color = mix(color, waveColor, waveBody);
  color = mix(color, deepColor, waveBody * smoothstep(waveCurve, waveCurve - 0.4, uv.y));

  // Foam and spray
  vec3 foamColor = vec3(0.8, 0.85, 0.9);
  color = mix(color, foamColor, clamp(foam, 0.0, 1.0) * 0.8);
  color += foamColor * spray * u_treble * 0.4;

  // Mid: underwater light rays
  float rays = snoise(vec2(uv.x * 4.0 + t * 0.2, 0.0));
  rays = pow(max(rays, 0.0), 3.0) * waveBody * u_mid * 0.2;
  color += vec3(0.1, 0.2, 0.15) * rays;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
