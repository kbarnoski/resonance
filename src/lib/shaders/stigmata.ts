import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

// Points of intense light on a dark field with radiating sacred geometry:
// five wound-points of blinding brilliance, each emitting geometric patterns.
export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;
  float paletteShift = u_amplitude * 0.3;

  float r = length(uv);
  vec3 color = vec3(0.0);

  // Five sacred points — arranged like the quincunx
  vec2 points[5];
  points[0] = vec2(0.0, 0.0);          // center — heart
  points[1] = vec2(-0.35, 0.15);       // left hand
  points[2] = vec2(0.35, 0.15);        // right hand
  points[3] = vec2(-0.12, -0.4);       // left foot
  points[4] = vec2(0.12, -0.4);        // right foot

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 p = points[i];

    // Gentle breathing motion
    p += vec2(sin(t * 1.5 + fi * 1.2), cos(t * 1.3 + fi * 0.9)) * 0.015;

    vec2 local = uv - p;
    float lr = length(local);
    float la = atan(local.y, local.x);

    // Intense point source
    float intensity = exp(-lr * lr * 80.0) * (1.5 + u_bass * 0.8);

    // Radiating geometric rings
    float ringPattern = sin(lr * 40.0 - t * 3.0 + fi * 0.7);
    ringPattern = smoothstep(0.3, 0.9, ringPattern) * exp(-lr * 6.0);

    // Sacred geometry rays — cross pattern from each point
    float crossCount = 4.0 + fi * 2.0; // different fold per point
    float crossAngle = mod(la + t * 0.3 * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0), 6.28318 / crossCount);
    crossAngle = abs(crossAngle - 3.14159 / crossCount);
    float cross = smoothstep(0.08, 0.0, crossAngle * lr) * exp(-lr * 4.0);

    // Connecting lines between points — sacred geometry web
    float web = 0.0;
    for (int j = 0; j < 5; j++) {
      if (j != i) {
        vec2 pj = points[j];
        vec2 dir = normalize(pj - p);
        vec2 perp = vec2(-dir.y, dir.x);
        float along = dot(uv - p, dir);
        float across = abs(dot(uv - p, perp));
        float segLen = length(pj - p);
        float lineMask = smoothstep(0.005, 0.0, across) * step(0.0, along) * step(along, segLen);
        // Pulse along the line
        float pulse = sin(along * 20.0 - t * 4.0) * 0.5 + 0.5;
        web += lineMask * pulse * 0.3;
      }
    }

    // Palette — increasingly white toward center point
    vec3 pointCol = palette(
      fi * 0.18 + paletteShift,
      vec3(0.7, 0.55, 0.35),
      vec3(0.4, 0.4, 0.35),
      vec3(1.0, 0.85, 0.6),
      vec3(0.0, 0.1, 0.25)
    );

    // Center point is more white/golden
    if (i == 0) {
      pointCol = mix(pointCol, vec3(1.0, 0.95, 0.85), 0.4);
    }

    color += pointCol * intensity;
    color += pointCol * ringPattern * (0.5 + 0.5 * u_mid);
    color += pointCol * cross * 0.8 * (0.6 + 0.4 * u_treble);
    color += pointCol * web;
  }

  // Background sacred noise field
  float bg = snoise(uv * 5.0 + t * 0.15);
  bg = smoothstep(0.3, 0.7, bg * 0.5 + 0.5) * 0.06;
  vec3 bgCol = palette(
    bg * 3.0 + paletteShift + 0.5,
    vec3(0.3, 0.25, 0.4),
    vec3(0.3, 0.2, 0.3),
    vec3(0.7, 0.8, 1.0),
    vec3(0.2, 0.1, 0.35)
  );
  color += bgCol * bg;

  // Vignette
  color *= smoothstep(1.4, 0.35, r);

  gl_FragColor = vec4(color, 1.0);
}
`;
