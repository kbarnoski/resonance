import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Nova — star explosion with expanding shock rings.
// Concentric blast waves radiate outward from a blinding core,
// each ring distorted by turbulence and colored by temperature.

float shockRing(vec2 uv, float radius, float width, float t) {
  float r = length(uv);
  float angle = atan(uv.y, uv.x);
  float wobble = snoise(vec2(angle * 4.0, t * 0.5 + radius * 3.0)) * 0.03;
  float d = abs(r - radius + wobble);
  return smoothstep(width, 0.0, d);
}

float ejectaStreamer(vec2 uv, float angle, float speed, float t) {
  vec2 dir = vec2(cos(angle), sin(angle));
  float proj = dot(uv, dir);
  float perp = length(uv - dir * proj);
  float head = smoothstep(speed * t + 0.1, speed * t - 0.05, proj);
  float tail = smoothstep(0.0, speed * t * 0.5, proj);
  float width_val = 0.015 + proj * 0.005;
  return smoothstep(width_val, 0.0, perp) * head * tail;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Pulsing explosion phase — cyclic
  float phase = fract(t * 0.15);
  float expandT = phase;

  // Core — blinding white-hot remnant
  float core = exp(-r * 15.0) * (1.5 + u_bass * 1.0);
  float coreFlicker = 0.8 + 0.2 * snoise(vec2(t * 5.0, 0.0));
  core *= coreFlicker;

  // Multiple expanding shock rings
  float rings = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float ringPhase = fract(expandT + fi * 0.18);
    float radius = ringPhase * 0.8;
    float width_val = 0.015 + ringPhase * 0.02;
    float intensity = (1.0 - ringPhase) * (1.0 - fi * 0.15);
    rings += shockRing(uv, radius, width_val, t) * intensity;
  }

  // Radial ejecta streamers
  float ejecta = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float a = fi * 0.524 + sin(fi * 2.3) * 0.3 + t * 0.02;
    float spd = 0.3 + fract(fi * 0.37) * 0.2;
    ejecta += ejectaStreamer(uv * rot2(a), 0.0, spd, expandT) * 0.15;
  }

  // Turbulent blast cloud
  vec2 blastUv = uv * rot2(t * 0.05) * (2.0 + expandT * 3.0);
  float blast = fbm(blastUv + t * 0.3) * 0.5 + 0.5;
  blast *= smoothstep(0.6, 0.1, r) * expandT;

  // Debris field — small bright fragments
  float debris = snoise(uv * 20.0 + vec2(t * 2.0, t * 1.5));
  debris = smoothstep(0.7, 0.9, debris) * smoothstep(0.5, 0.15, r);

  float paletteShift = u_amplitude * 0.3;

  // Ring color — hot blue-white to cooling orange
  vec3 ringCol = palette(
    rings * 0.5 + expandT + paletteShift,
    vec3(0.7, 0.6, 0.8),
    vec3(0.3, 0.3, 0.3),
    vec3(0.8, 0.5, 0.3),
    vec3(0.0, 0.1, 0.3)
  );

  // Ejecta — brilliant blue-white
  vec3 ejectaCol = palette(
    t * 0.1 + paletteShift + 0.2,
    vec3(0.6, 0.65, 0.9),
    vec3(0.3, 0.25, 0.3),
    vec3(0.5, 0.4, 0.8),
    vec3(0.1, 0.1, 0.3)
  );

  // Blast cloud — hot plasma reds and oranges
  vec3 blastCol = palette(
    blast + t * 0.05 + paletteShift + 0.5,
    vec3(0.7, 0.3, 0.15),
    vec3(0.3, 0.2, 0.1),
    vec3(0.6, 0.3, 0.2),
    vec3(0.0, 0.05, 0.1)
  );

  vec3 color = vec3(0.0);

  // Compose explosion
  color += blastCol * blast * (0.5 + u_mid * 0.5);
  color += ringCol * rings * (0.8 + u_bass * 0.5);
  color += ejectaCol * ejecta * (0.6 + u_treble * 0.6);
  color += vec3(1.2, 1.1, 1.0) * debris * 0.3 * u_treble;

  // Core — overwhelming white
  vec3 coreCol = vec3(1.4, 1.3, 1.2) * core;
  color += coreCol;

  // Ambient remnant glow
  color += vec3(0.04, 0.02, 0.06) * smoothstep(0.8, 0.0, r);

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
