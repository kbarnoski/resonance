import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Banshee — screaming wave patterns, sonic distortion ripples

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  // Scream origin — pulsing source point
  vec2 screamOrigin = vec2(0.0, 0.1 + sin(t * 0.3) * 0.05);
  float distFromSource = length(uv - screamOrigin);

  // Concentric sonic waves expanding from the scream
  float waveFreq = 12.0 + u_bass * 8.0;
  float wave = sin(distFromSource * waveFreq - t * 3.0);
  wave *= exp(-distFromSource * 1.5); // decay with distance

  // Secondary distortion waves — interference
  float wave2 = sin(distFromSource * waveFreq * 0.7 - t * 2.3 + 1.5);
  wave2 *= exp(-distFromSource * 2.0);

  // Combined waveform
  float sonic = wave * 0.6 + wave2 * 0.4;

  // Distortion field — space warps near the source
  vec2 warpDir = normalize(uv - screamOrigin + 0.001);
  vec2 warp = warpDir * sonic * 0.04 * (1.0 + u_amplitude * 0.5);
  vec2 warpedUV = uv + warp;

  // Noise-based scream texture — chaotic, anguished
  float screamNoise = fbm(warpedUV * 5.0 + t * 0.5);
  float screamTexture = fbm(warpedUV * 8.0 - t * 0.3 + screamNoise * 2.0);

  // Mouth/void shape at the origin — the source of the scream
  float mouth = length((uv - screamOrigin) * vec2(1.5, 2.5));
  float mouthOpen = 0.06 + u_bass * 0.04 + sin(t * 1.5) * 0.02;
  float mouthMask = smoothstep(mouthOpen + 0.02, mouthOpen, mouth);

  // Wave rings — sharp peaks
  float rings = abs(sonic);
  rings = smoothstep(0.3, 0.8, rings);

  // Colors: cold, piercing, anguished
  vec3 voidColor = palette(0.8 + u_amplitude * 0.1,
    vec3(0.003, 0.003, 0.006),
    vec3(0.006, 0.005, 0.012),
    vec3(1.0, 1.0, 1.0),
    vec3(0.6, 0.5, 0.8));

  vec3 waveColor = palette(0.4 + u_treble * 0.15,
    vec3(0.01, 0.008, 0.02),
    vec3(0.04, 0.025, 0.06),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.45, 0.75));

  vec3 screamColor = palette(0.2 + u_mid * 0.12,
    vec3(0.02, 0.01, 0.03),
    vec3(0.06, 0.03, 0.08),
    vec3(1.0, 1.0, 1.0),
    vec3(0.55, 0.4, 0.7));

  // Compose
  vec3 color = voidColor;

  // Sonic wave rings
  color += waveColor * rings * 0.08 * (1.0 + u_bass * 0.6);

  // Scream texture — anguish in the space between waves
  float textureMask = (1.0 - rings) * exp(-distFromSource * 1.0);
  color += screamColor * screamTexture * textureMask * 0.04;

  // Mouth void — absolute darkness at the center
  color = mix(color, vec3(0.001, 0.0, 0.002), mouthMask);

  // Edge of mouth — faint glow of escaping energy
  float mouthEdge = smoothstep(mouthOpen + 0.06, mouthOpen + 0.01, mouth)
                  - smoothstep(mouthOpen + 0.01, mouthOpen - 0.01, mouth);
  color += screamColor * mouthEdge * (0.15 + u_treble * 0.2);

  // Treble: high-frequency interference patterns
  float hiFreq = sin(distFromSource * 40.0 - t * 8.0) * exp(-distFromSource * 3.0);
  color += waveColor * smoothstep(0.5, 0.9, hiFreq) * u_treble * 0.03;

  // Mid: general atmospheric pressure
  float pressure = fbm(uv * 2.0 + t * 0.1);
  color += voidColor * pressure * u_mid * 0.02;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
