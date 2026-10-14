import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Covenant — Two luminous arcs meeting, bridge of light

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = r * p * 2.0; a *= 0.5; }
  return v;
}

float arc(vec2 p, vec2 center, float radius, float thickness, float startA, float endA) {
  vec2 d = p - center;
  float a = atan(d.y, d.x);
  float r = length(d);
  float radialDist = abs(r - radius);
  float inArc = smoothstep(0.0, 0.05, a - startA) * smoothstep(0.0, 0.05, endA - a);
  return smoothstep(thickness, 0.0, radialDist) * inArc;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.06;

  float bass = 0.5 + 0.5 * sin(u_bass * 3.14159);
  float amp = 0.5 + 0.5 * sin(u_amplitude * 3.14159);

  vec3 color = vec3(0.0);

  // Two arcs approaching from opposite sides
  float approach = sin(t * 0.8) * 0.15;

  // Left arc
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float radius = 0.5 + fi * 0.06;
    vec2 leftCenter = vec2(-0.6 - approach, 0.0);
    vec2 d = uv - leftCenter;
    float a = atan(d.y, d.x);
    float r = length(d);
    // PERF (2026-10-13, the 120 fps law): the arc is exactly 0 farther than
    // its thickness + the noise's reach (|fbm3| < 1 -> 0.02) from its radius,
    // or outside its angular window — the noise only runs where it can show
    float thickness = 0.01 + 0.005 * sin(t + fi);
    float angMaskL = smoothstep(-0.8, -0.3, a) * smoothstep(0.8, 0.3, a);
    if (angMaskL <= 0.0 || abs(r - radius) >= thickness + 0.02) continue;
    float n = fbm3(vec2(a * 2.0, r * 3.0 + t));
    float radialDist = abs(r - radius + n * 0.02);
    float arcVal = smoothstep(thickness, 0.0, radialDist);
    arcVal *= angMaskL;
    float fade = 1.0 - fi * 0.15;

    vec3 arcColor = palette(
      fi * 0.2 + t * 0.1,
      vec3(0.7, 0.5, 0.2),
      vec3(0.4, 0.3, 0.15),
      vec3(1.0, 0.8, 0.4),
      vec3(0.0, 0.1, 0.15)
    );
    color += arcColor * arcVal * fade;
  }

  // Right arc
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float radius = 0.5 + fi * 0.06;
    vec2 rightCenter = vec2(0.6 + approach, 0.0);
    vec2 d = uv - rightCenter;
    float a = atan(d.y, d.x);
    float r = length(d);
    float thickness = 0.01 + 0.005 * sin(t + fi);
    float angMask = smoothstep(2.3, 2.8, a) + smoothstep(-2.3, -2.8, a);
    if (angMask <= 0.0 || abs(r - radius) >= thickness + 0.02) continue;
    float n = fbm3(vec2(a * 2.0, r * 3.0 - t));
    float radialDist = abs(r - radius + n * 0.02);
    float arcVal = smoothstep(thickness, 0.0, radialDist);
    arcVal *= angMask;
    float fade = 1.0 - fi * 0.15;

    vec3 arcColor = palette(
      fi * 0.2 + t * 0.1 + 0.5,
      vec3(0.6, 0.45, 0.15),
      vec3(0.45, 0.35, 0.15),
      vec3(1.0, 0.85, 0.4),
      vec3(0.05, 0.1, 0.2)
    );
    color += arcColor * arcVal * fade;
  }

  // Bridge of light where arcs meet (center)
  float meetGlow = exp(-uv.x * uv.x * 20.0) * exp(-uv.y * uv.y * 8.0);
  meetGlow *= (0.6 + 0.4 * sin(t * 1.5)) * (0.8 + bass * 0.3);
  color += vec3(1.0, 0.9, 0.6) * meetGlow * 0.8;

  // Soft noise along the bridge
  float bridgeN = abs(uv.x) >= 0.5 ? 0.0 : fbm3(vec2(uv.x * 5.0, uv.y * 3.0 + t)); // the bridge is 0 beyond |x| 0.5
  float bridgeLine = exp(-uv.y * uv.y * 30.0) * (0.5 + bridgeN * 0.3);
  bridgeLine *= smoothstep(0.5, 0.1, abs(uv.x));
  color += vec3(0.8, 0.65, 0.3) * bridgeLine * 0.4;

  // Central meeting point bright spot
  float meetPoint = exp(-dot(uv, uv) * 15.0) * (0.5 + amp * 0.3);
  color += vec3(1.0, 0.95, 0.8) * meetPoint;

  // Vignette
  color *= smoothstep(1.5, 0.4, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
