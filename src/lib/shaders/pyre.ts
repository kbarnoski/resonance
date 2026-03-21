import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Funeral pyre — dark flames consuming upward

float flame(vec2 p, float time, float seed) {
  // Flames rise upward with turbulence
  p.y += time * 0.3;
  float n1 = fbm(p * vec2(2.0, 1.5) + seed);
  float n2 = fbm(p * vec2(3.0, 2.0) + seed + 5.0 + time * 0.1);
  return n1 * 0.6 + n2 * 0.4;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  // Fire base at bottom of screen
  vec2 fireUV = uv;
  fireUV.y += 0.4; // shift fire origin down

  // Multiple flame layers with different speeds
  float f1 = flame(fireUV * 2.0, t * 1.2, 0.0);
  float f2 = flame(fireUV * 2.5 + vec2(0.3, 0.0), t * 1.5, 3.7);
  float f3 = flame(fireUV * 1.8 + vec2(-0.2, 0.0), t * 0.9, 7.1);

  // Flame shape — tapers upward, wider at base
  float taper = smoothstep(0.8, -0.3, fireUV.y);
  float width = 0.4 + (1.0 - fireUV.y) * 0.3;
  float shape = smoothstep(width, width * 0.3, abs(fireUV.x)) * taper;

  // Combine flame noise with shape
  float fireIntensity = (f1 * 0.5 + f2 * 0.3 + f3 * 0.2) * 0.5 + 0.5;
  fireIntensity *= shape;
  fireIntensity = pow(fireIntensity, 1.5);

  // Audio reactivity: bass makes fire surge
  fireIntensity *= 1.0 + u_bass * 0.8;

  // Dark fire colors — deep reds and blacks, not bright
  vec3 fireCore = palette(fireIntensity * 0.3 + u_amplitude * 0.1,
    vec3(0.04, 0.01, 0.0),
    vec3(0.08, 0.02, 0.005),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.1, 0.2));

  vec3 fireEdge = palette(fireIntensity * 0.5 + 0.3,
    vec3(0.02, 0.005, 0.0),
    vec3(0.05, 0.015, 0.003),
    vec3(1.0, 1.0, 1.0),
    vec3(0.05, 0.15, 0.25));

  // Ember particles rising
  float emberField = snoise(vec2(uv.x * 8.0, uv.y * 3.0 - t * 2.0));
  float embers = smoothstep(0.82, 0.92, emberField) * taper * 0.5;

  vec3 emberColor = palette(0.1 + u_treble * 0.15,
    vec3(0.06, 0.02, 0.0),
    vec3(0.1, 0.03, 0.005),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.08, 0.15));

  // Smoke above the fire — dark, rolling
  float smokeY = smoothstep(-0.1, -0.6, fireUV.y);
  float smoke = fbm(uv * 3.0 + vec2(0.0, t * 0.2)) * smokeY;

  vec3 smokeColor = palette(0.5,
    vec3(0.01, 0.01, 0.012),
    vec3(0.015, 0.012, 0.02),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.4, 0.6));

  // Background: deep black
  vec3 bgColor = vec3(0.005, 0.004, 0.006);

  // Compose
  vec3 color = bgColor;
  color += smokeColor * smoke * 0.3;
  color = mix(color, fireCore, fireIntensity * 0.7);
  color += fireEdge * fireIntensity * 0.3;
  color += emberColor * embers * (1.0 + u_treble * 0.6);

  // Heat shimmer above fire — subtle distortion glow
  float shimmer = snoise(vec2(uv.x * 6.0, uv.y * 2.0 - t * 1.5));
  float shimmerMask = smoothstep(0.0, -0.4, fireUV.y) * (1.0 - smokeY);
  color += fireEdge * shimmer * shimmerMask * 0.02 * u_mid;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
