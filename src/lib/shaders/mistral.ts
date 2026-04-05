import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Mistral — Strong wind visualization: streaking horizontal particles, pressure fronts

// 3-octave fbm for performance
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

// Wind streak function — elongated noise in wind direction
float windStreak(vec2 p, float speed) {
  // Stretch heavily in x (wind direction), compress in y
  vec2 stretched = vec2(p.x * 0.15 + u_time * speed, p.y * 3.0);
  return snoise(stretched);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  // Multiple wind layers at different speeds (parallax)
  vec2 windUV = uv;

  // Pressure front — large-scale wave moving across
  float pressure = sin(uv.x * 1.5 - t * 4.0 + fbm3(uv * 0.8 + vec2(t * 0.5)) * 1.5);
  pressure = pressure * 0.5 + 0.5;
  pressure *= (0.6 + u_bass * 0.5);

  // Fast wind streaks — foreground
  float streak1 = windStreak(uv * 3.0 + vec2(0.0, 10.0), 0.8);
  streak1 = smoothstep(0.2, 0.6, streak1);

  // Medium wind streaks — midground
  float streak2 = windStreak(uv * 2.0 + vec2(0.0, 30.0), 0.5);
  streak2 = smoothstep(0.1, 0.5, streak2);

  // Slow wind streaks — background
  float streak3 = windStreak(uv * 1.2 + vec2(0.0, 50.0), 0.3);
  streak3 = smoothstep(0.0, 0.4, streak3);

  // Turbulence eddies — small rotating disturbances
  vec2 eddyUV = rot2(t * 0.3) * (uv * 5.0) + vec2(t * 2.0, 0.0);
  float eddy = snoise(eddyUV);
  eddy = abs(eddy) * (0.5 + u_mid * 0.5);

  // Dust/particle streaks
  float dust = snoise(vec2(uv.x * 0.5 + t * 3.0, uv.y * 8.0));
  dust = pow(max(dust, 0.0), 4.0) * u_treble * 0.5;

  // Gust intensity variation
  float gust = sin(t * 6.0 + uv.x * 2.0) * 0.5 + 0.5;
  gust = mix(0.7, 1.0, gust * u_amplitude);

  // ── Color ──
  // Sky base — cold blue-grey
  vec3 skyBase = palette(
    pressure * 0.3 + t * 0.04,
    vec3(0.10, 0.12, 0.18),
    vec3(0.08, 0.10, 0.16),
    vec3(0.5, 0.6, 0.8),
    vec3(0.15, 0.20, 0.35)
  );

  // Wind color — silver-blue streaks
  vec3 windColor = palette(
    streak1 * 0.3 + streak2 * 0.2 + t * 0.06,
    vec3(0.25, 0.30, 0.40),
    vec3(0.18, 0.22, 0.30),
    vec3(0.6, 0.7, 0.9),
    vec3(0.12, 0.20, 0.38)
  );

  // Pressure front color — darker, more intense
  vec3 pressureColor = palette(
    pressure * 0.5 + t * 0.08 + u_amplitude * 0.15,
    vec3(0.05, 0.08, 0.18),
    vec3(0.08, 0.12, 0.22),
    vec3(0.4, 0.5, 0.9),
    vec3(0.10, 0.18, 0.40)
  );

  // Combine
  vec3 color = skyBase;

  // Pressure front
  color = mix(color, pressureColor, pressure * 0.4);

  // Wind streak layers (back to front)
  color = mix(color, windColor * 0.7, streak3 * 0.25);
  color = mix(color, windColor * 0.85, streak2 * 0.3);
  color = mix(color, windColor, streak1 * 0.35);

  // Turbulence eddies
  color += windColor * eddy * 0.12;

  // Dust particles
  color += vec3(0.5, 0.55, 0.65) * dust;

  // Gust intensity modulation
  color *= gust;

  // Horizontal motion blur effect — subtle bright edge
  float motionEdge = abs(snoise(vec2(uv.x * 0.3 + t * 1.5, uv.y * 6.0)));
  motionEdge = pow(motionEdge, 3.0) * 0.15;
  color += windColor * motionEdge;

  // Vignette
  float vignette = 1.0 - smoothstep(0.45, 1.35, length(uv));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;
