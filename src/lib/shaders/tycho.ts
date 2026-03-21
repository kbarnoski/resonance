import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Tycho — supernova remnant, expanding nebula filaments.
// Tangled web of shock-heated filaments expanding outward
// from the site of a long-dead stellar explosion.

float filament(vec2 uv, float angle, float bend, float t) {
  vec2 dir = vec2(cos(angle), sin(angle));
  vec2 perp = vec2(-dir.y, dir.x);
  float proj = dot(uv, dir);
  float perpD = dot(uv, perp);

  // Curving filament path
  float curve = perpD - sin(proj * bend + t * 0.5) * 0.06;
  float width = 0.008 + snoise(vec2(proj * 10.0, angle * 5.0 + t * 0.2)) * 0.004;
  float mask = smoothstep(0.5, 0.0, abs(proj));
  return smoothstep(abs(width), 0.0, abs(curve)) * mask;
}

float remnantShell(vec2 uv, float radius, float t) {
  float r = length(uv);
  float angle = atan(uv.y, uv.x);
  float wobble = fbm(vec2(angle * 3.0, t * 0.3)) * 0.06;
  float shell = smoothstep(0.03, 0.0, abs(r - radius + wobble));
  return shell;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Expanding shell — the outer blast wave
  float shellR = 0.35 + sin(t * 0.2) * 0.02 + u_bass * 0.05;
  float shell = remnantShell(uv, shellR, t);
  float shell2 = remnantShell(uv, shellR * 0.85, t + 1.0);

  // Filamentary structure — tangled web of shock-heated gas
  float filaments = 0.0;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float a = fi * 0.393 + sin(fi * 1.7) * 0.3;
    float bend = 4.0 + sin(fi * 2.3) * 2.0;
    vec2 fUv = uv * rot2(a) * (1.5 + fi * 0.05);
    filaments += filament(fUv, 0.0, bend, t + fi * 0.4) * (0.5 + fract(fi * 0.37) * 0.5);
  }

  // Interior turbulence — hot shocked gas
  float interior = fbm(uv * 5.0 * rot2(t * 0.03) + vec2(t * 0.1, 0.0));
  interior = (interior * 0.5 + 0.5) * smoothstep(shellR, shellR * 0.3, r);

  // Reverse shock — inner ring of reheated ejecta
  float reverseShock = remnantShell(uv, shellR * 0.5, t * 0.7 + 2.0);

  // Central compact remnant — neutron star or black hole
  float remnant = exp(-r * 20.0) * (0.5 + u_bass * 0.5);
  float pulsar = exp(-r * 30.0) * abs(sin(t * 8.0)) * u_treble;

  // Radial ejecta knots
  float knots = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float kAngle = fi * 0.628 + t * 0.02;
    float kR = 0.1 + fi * 0.025 + sin(t * 0.5 + fi) * 0.02;
    vec2 kPos = vec2(cos(kAngle), sin(kAngle)) * kR;
    knots += exp(-length(uv - kPos) * 40.0) * 0.3;
  }

  float paletteShift = u_amplitude * 0.25;

  // Shell color — blue-white shock heated
  vec3 shellCol = palette(
    shell + t * 0.04 + paletteShift,
    vec3(0.4, 0.5, 0.7),
    vec3(0.3, 0.25, 0.3),
    vec3(0.6, 0.5, 0.8),
    vec3(0.1, 0.15, 0.35)
  );

  // Filament color — characteristic red-green emission
  vec3 filCol = palette(
    filaments * 0.5 + angle * 0.1 + paletteShift + 0.3,
    vec3(0.5, 0.4, 0.3),
    vec3(0.3, 0.25, 0.2),
    vec3(0.7, 0.4, 0.5),
    vec3(0.05, 0.15, 0.2)
  );

  // Interior — hot blue-purple X-ray gas
  vec3 interiorCol = palette(
    interior + t * 0.03 + paletteShift + 0.6,
    vec3(0.3, 0.2, 0.5),
    vec3(0.2, 0.15, 0.3),
    vec3(0.5, 0.3, 0.7),
    vec3(0.15, 0.1, 0.35)
  );

  vec3 color = vec3(0.0);

  // Interior glow
  color += interiorCol * interior * 0.4 * (0.5 + u_mid * 0.5);

  // Filaments
  color += filCol * filaments * (0.6 + u_mid * 0.5);

  // Blast shells
  color += shellCol * shell * (0.7 + u_bass * 0.5);
  color += shellCol * 0.7 * shell2 * 0.5;

  // Reverse shock
  color += vec3(0.5, 0.3, 0.6) * reverseShock * 0.4;

  // Ejecta knots
  color += vec3(0.8, 0.6, 0.4) * knots * (0.5 + u_treble * 0.5);

  // Central remnant
  color += vec3(0.8, 0.85, 1.0) * remnant;
  color += vec3(0.6, 0.8, 1.0) * pulsar;

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
