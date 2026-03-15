import { U, VISIONARY_PALETTE, SMOOTH_NOISE } from "./shared";

// Waves of light expanding outward from an infinitely distant center point,
// rippling through space toward the viewer. Concentric expanding rings with depth.
export const FRAG = U + VISIONARY_PALETTE + SMOOTH_NOISE + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.13;
  float paletteShift = u_amplitude * 0.32;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // The center is "infinitely far" — rings expand outward like ripples arriving
  // from an event at infinity. Use log-space radius so rings that started far
  // ago appear compressed near center, spreading as they approach.
  float logR = log(r * 12.0 + 1.0);

  // FBM warp of the radial axis — gives waves a living, breathing wobble
  float warpAmt = 0.12 + u_bass * 0.1;
  float angularWarp = fbm(vec2(angle * 1.5, logR + t * 0.5)) * warpAmt;
  float warpedR = logR + angularWarp;

  // Primary wave rings — travel outward (warpedR - t drives outward motion)
  float waveFreq = 4.5 + u_mid * 1.5;
  float wavePhase = warpedR * waveFreq - t * 5.0;
  float wave = 0.5 + 0.5 * sin(wavePhase);
  wave = pow(wave, 2.0 + u_bass * 1.5); // sharpen crests

  // Secondary faster waves — treble frequency
  float wave2Phase = warpedR * (waveFreq * 2.3) - t * 9.0 + u_treble * 2.0;
  float wave2 = pow(max(0.0, 0.5 + 0.5 * sin(wave2Phase)), 4.0) * 0.4;

  // Tertiary ultra-fine shimmer
  float shimmerPhase = warpedR * 22.0 - t * 18.0;
  float shimmer = pow(max(0.0, 0.5 + 0.5 * sin(shimmerPhase)), 8.0) * u_treble * 0.25;

  // Angular modulation — rings are not perfectly circular, they bulge
  float angMod = sin(angle * 7.0 + t * 1.2 + u_mid * 2.0) * 0.06;
  wave *= 1.0 + angMod;

  // Depth perception: rings nearer the edge appear "closer" (just arrived)
  // Rings near center appear to be from impossibly far source — dim, blue-shifted
  float distantBias = 1.0 - exp(-r * 2.0);   // 0 at center, 1 at edge
  float nearGlow = exp(-r * 1.5) * (0.4 + u_amplitude * 0.5); // bright arrival point

  // Interfering wave pattern — standing wave nodes create depth grid
  float standing = abs(sin(warpedR * waveFreq * 0.5) * cos(wavePhase * 0.5));
  standing = pow(standing, 3.0) * 0.3;

  // Palette
  vec3 c1 = palette(wavePhase * 0.05 + paletteShift,
    vec3(0.6, 0.5, 0.8), vec3(0.5, 0.4, 0.3), vec3(1.0, 0.8, 1.0), vec3(0.0, 0.2, 0.4));
  vec3 c2 = palette(wave2Phase * 0.04 + u_mid * 0.3 + paletteShift,
    vec3(0.4, 0.6, 0.7), vec3(0.4, 0.3, 0.5), vec3(0.8, 1.2, 0.9), vec3(0.3, 0.0, 0.1));
  vec3 c3 = palette(r * 0.8 + t * 0.06 + paletteShift,
    vec3(0.9, 0.8, 0.6), vec3(0.3, 0.3, 0.4), vec3(1.0, 0.9, 1.4), vec3(0.2, 0.4, 0.0));

  vec3 color = vec3(0.0);
  color += c1 * wave * distantBias * (0.7 + u_bass * 0.5);
  color += c2 * wave2;
  color += c3 * nearGlow;
  color += c1 * standing;
  color += vec3(1.0, 0.98, 0.95) * shimmer;

  float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
