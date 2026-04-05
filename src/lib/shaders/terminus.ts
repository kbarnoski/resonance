import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// The end of everything — light retreating from a field leaving only void.
// A wavefront of extinction sweeping across the canvas.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  // ── Extinction wavefront — radiates from center outward, cyclically ──
  float dist = length(uv);
  float waveFront = fract(t * 0.15) * 2.5;
  float extinctionZone = smoothstep(waveFront - 0.1, waveFront + 0.3, dist);

  // Behind the wave: void. Ahead: fading light.
  float behindWave = 1.0 - extinctionZone;

  // ── Residual light field — what remains before extinction ──
  vec2 lightUV = uv * rot2(t * 0.05) * 3.0;
  float lightField = fbm3(lightUV + vec2(t * 0.2, 0.0)) * 0.5 + 0.5;
  lightField *= extinctionZone;

  // Light becoming unstable near the wavefront
  float nearWave = smoothstep(0.4, 0.0, abs(dist - waveFront));
  float instability = snoise(uv * 15.0 + t * 3.0) * nearWave;
  lightField += instability * 0.2;

  // ── Scattered remnants — particles of light breaking off ──
  float remnants = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    vec2 pos = vec2(
      fract(sin(fi * 127.1) * 43758.5) * 2.0 - 1.0,
      fract(sin(fi * 311.7) * 43758.5) * 2.0 - 1.0
    );
    float pDist = length(pos);
    // Remnants exist just ahead of the wavefront
    float alive = smoothstep(waveFront - 0.05, waveFront + 0.3, pDist);
    float d = length(uv - pos);
    float brightness = 0.002 / (d * d + 0.002) * alive;
    float flicker = 0.5 + 0.5 * sin(t * 8.0 + fi * 7.0);
    remnants += brightness * flicker;
  }

  // ── Colors ──
  // The dying light — pale, exhausted color
  vec3 dyingLight = palette(
    lightField * 2.0 + u_amplitude * 0.2,
    vec3(0.1, 0.08, 0.06),
    vec3(0.12, 0.1, 0.08),
    vec3(0.6, 0.5, 0.4),
    vec3(0.0, 0.05, 0.1)
  );

  // The void — not pure black, has a cold depth
  vec3 voidColor = palette(
    behindWave * 0.5 + t * 0.05,
    vec3(0.005, 0.005, 0.01),
    vec3(0.01, 0.008, 0.015),
    vec3(0.3, 0.2, 0.5),
    vec3(0.2, 0.1, 0.3)
  );

  // Wavefront edge — bright, the last flare before annihilation
  vec3 edgeColor = palette(
    nearWave * 3.0 + t * 0.3,
    vec3(0.4, 0.25, 0.15),
    vec3(0.3, 0.2, 0.15),
    vec3(0.8, 0.6, 0.4),
    vec3(0.0, 0.05, 0.1)
  );

  // ── Compositing ──
  vec3 color = voidColor * behindWave;
  color += dyingLight * lightField * 0.4;
  color += edgeColor * nearWave * 0.5 * (0.6 + u_bass * 0.4);

  // Remnant particles
  vec3 remnantColor = vec3(0.8, 0.6, 0.4);
  color += remnantColor * remnants * 0.01 * (0.5 + u_treble * 0.5);

  // Faint afterglow in the void — memory of light
  float afterglow = behindWave * exp(-behindWave * 3.0) * 0.08;
  color += vec3(0.15, 0.08, 0.05) * afterglow * (0.6 + u_mid * 0.4);

  // Vignette
  float vignette = 1.0 - smoothstep(0.4, 1.3, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
