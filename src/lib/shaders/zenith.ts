import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Zenith — Looking straight up into an infinite tube of stars
// spiraling toward a brilliant center, cosmic vortex tunnel.

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = rot * p * 2.0; a *= 0.5; }
  return v;
}

// Star layer with spiral distortion
float spiralStars(vec2 uv, float density, float seed, float spiralAmount, float t) {
  // Apply spiral warp
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float spiralAngle = a + r * spiralAmount + t * 0.3;
  vec2 spiralUV = vec2(cos(spiralAngle), sin(spiralAngle)) * r;

  vec2 id = floor(spiralUV * density);
  vec2 f = fract(spiralUV * density) - 0.5;

  float h = fract(sin(dot(id + seed, vec2(127.1, 311.7))) * 43758.5453);
  float star = step(0.90, h);
  float radius = 0.02 + 0.05 * fract(h * 23.0);
  float brightness = smoothstep(radius, 0.0, length(f));
  float twinkle = 0.5 + 0.5 * sin(u_time * (2.0 + h * 8.0) + h * 70.0);

  return star * brightness * twinkle;
}

// Tunnel wall — cylinder of nebula gas
float tunnelWall(vec2 uv, float t) {
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Tube wall is at the edges
  float wall = smoothstep(0.3, 0.7, r);

  // Spiral texture on the wall
  float spiralA = a + r * 3.0 + t * 0.2;
  float wallTex = snoise(vec2(spiralA * 2.0, r * 6.0 - t * 0.3)) * 0.5 + 0.5;
  wallTex *= snoise(vec2(spiralA * 4.0 + 5.0, r * 3.0 + t * 0.1)) * 0.5 + 0.5;

  return wall * wallTex;
}

// Spiral arms of light converging to center
float spiralArm(vec2 uv, float armAngle, float t) {
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Logarithmic spiral
  float spiralA = a + log(max(r, 0.01)) * 2.5 + t * 0.3;
  float angleDist = abs(sin((spiralA - armAngle) * 2.0));

  // Width decreases toward center
  float width = 0.15 + r * 0.3;
  float arm = smoothstep(width, 0.0, angleDist);

  // Brightness increases toward center
  float brightness = smoothstep(0.8, 0.05, r);

  return arm * brightness;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;

  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float paletteShift = u_amplitude * 0.2;

  // Slow rotation of everything
  vec2 rotUV = uv * rot2(t * 0.1);

  vec3 color = vec3(0.01, 0.01, 0.02);

  // ── Tunnel wall — nebula gas forming the cylinder ──
  float wall = tunnelWall(rotUV, t);
  vec3 wallCol = palette(
    wall + a * 0.1 + t * 0.02 + paletteShift,
    vec3(0.3, 0.25, 0.45),
    vec3(0.2, 0.15, 0.3),
    vec3(0.5, 0.3, 0.8),
    vec3(0.1, 0.1, 0.3)
  );
  color += wallCol * wall * (0.3 + u_mid * 0.3);

  // ── Spiral arms — 4 arms converging ──
  float arms = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    arms += spiralArm(rotUV, fi * 1.5708 + t * 0.05, t) * 0.25;
  }
  arms *= (0.6 + u_bass * 0.8);

  vec3 armCol = palette(
    arms + r * 0.5 + t * 0.03 + paletteShift + 0.3,
    vec3(0.5, 0.4, 0.6),
    vec3(0.25, 0.2, 0.35),
    vec3(0.6, 0.35, 0.9),
    vec3(0.1, 0.1, 0.3)
  );
  color += armCol * arms;

  // ── Star layers — at multiple depths, spiraling ──
  float s1 = spiralStars(rotUV, 40.0, 0.0, 2.0, t);
  float s2 = spiralStars(rotUV * 1.3, 70.0, 42.0, 3.0, t * 0.8);
  float s3 = spiralStars(rotUV * 0.8, 120.0, 91.0, 4.0, t * 0.6);

  // Stars get brighter toward center
  float centerBoost = smoothstep(0.8, 0.1, r) * 2.0 + 1.0;

  vec3 starCol1 = vec3(0.9, 0.95, 1.3) * s1 * 1.5 * centerBoost;
  vec3 starCol2 = vec3(1.2, 1.05, 0.9) * s2 * 1.0 * centerBoost;
  vec3 starCol3 = vec3(1.0, 0.9, 0.8) * s3 * 0.6;

  color += (starCol1 + starCol2 + starCol3) * (0.7 + u_treble * 0.6);

  // ── Central bright point — the zenith ──
  float zenithGlow = exp(-r * 6.0) * 1.5;
  float zenithPulse = 1.0 + 0.2 * sin(t * 1.5);
  zenithGlow *= zenithPulse * (0.7 + u_bass * 0.5);

  vec3 zenithCol = palette(
    zenithGlow * 0.2 + t * 0.04 + paletteShift + 0.15,
    vec3(0.85, 0.8, 0.9),
    vec3(0.15, 0.12, 0.1),
    vec3(0.3, 0.2, 0.4),
    vec3(0.05, 0.08, 0.2)
  );
  color += zenithCol * zenithGlow;

  // Extra bright core
  float brightCore = exp(-r * 15.0) * 0.5;
  color += vec3(1.0, 0.98, 0.95) * brightCore;

  // ── Speed lines — sense of motion toward center ──
  float speedLines = 0.0;
  float lineA = a + t * 0.15;
  float lines = sin(lineA * 30.0) * 0.5 + 0.5;
  lines = pow(lines, 8.0);
  speedLines = lines * smoothstep(0.1, 0.4, r) * smoothstep(0.9, 0.5, r);
  speedLines *= 0.1;

  vec3 lineCol = palette(
    speedLines + r + t * 0.05 + paletteShift + 0.6,
    vec3(0.5, 0.5, 0.65),
    vec3(0.15, 0.12, 0.2),
    vec3(0.3, 0.25, 0.5),
    vec3(0.1, 0.1, 0.25)
  );
  color += lineCol * speedLines;

  // ── Depth fog — faint glow in the tunnel ──
  float fog = smoothstep(1.0, 0.2, r) * 0.04;
  color += vec3(0.15, 0.12, 0.25) * fog * (0.5 + u_amplitude * 0.5);

  // Vignette — strong at edges to reinforce tunnel
  float vignette = 1.0 - smoothstep(0.3, 1.0, r);
  color *= (0.6 + 0.4 * vignette);

  gl_FragColor = vec4(color, 1.0);
}
`;
