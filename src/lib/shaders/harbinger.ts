import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Harbinger — approaching darkness, shadow creeping across light

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.07;

  // The light — a fading luminous region retreating
  vec2 lightCenter = vec2(0.3 + sin(t * 0.2) * 0.1, 0.2 + cos(t * 0.15) * 0.08);
  float lightDist = length(uv - lightCenter);
  float lightField = exp(-lightDist * 2.5) * 0.1;

  // The shadow — advancing front consuming from the opposite side
  float shadowAngle = t * 0.15;
  vec2 shadowDir = vec2(cos(shadowAngle), sin(shadowAngle));
  float shadowFront = dot(uv, shadowDir);

  // Noise-distorted shadow edge
  float edgeNoise = fbm(uv * 4.0 + t * 0.1) * 0.25;
  float shadowMask = smoothstep(0.1 + edgeNoise, -0.2 + edgeNoise, shadowFront + sin(t * 0.3) * 0.15);

  // Tendrils of shadow reaching ahead of the front
  float tendrils = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float tAngle = shadowAngle + (fi - 2.5) * 0.3;
    vec2 tDir = vec2(cos(tAngle), sin(tAngle));
    float tDist = dot(uv, tDir);
    float tNoise = fbm(uv * 6.0 + fi * 2.0 + t * 0.15);
    float tendril = smoothstep(0.02, 0.0, abs(tDist - tNoise * 0.3) - 0.005);
    tendril *= smoothstep(-0.3, 0.2, shadowFront + edgeNoise); // only ahead of front
    tendrils += tendril;
  }
  tendrils = clamp(tendrils, 0.0, 1.0);

  // Colors
  vec3 lightColor = palette(0.3 + u_mid * 0.1,
    vec3(0.03, 0.025, 0.02),
    vec3(0.05, 0.04, 0.03),
    vec3(1.0, 1.0, 1.0),
    vec3(0.15, 0.2, 0.3));

  vec3 shadowColor = palette(0.75 + u_amplitude * 0.1,
    vec3(0.003, 0.002, 0.004),
    vec3(0.006, 0.004, 0.008),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.4, 0.6));

  vec3 edgeColor = palette(0.5 + u_treble * 0.12,
    vec3(0.01, 0.008, 0.015),
    vec3(0.025, 0.018, 0.04),
    vec3(1.0, 1.0, 1.0),
    vec3(0.4, 0.35, 0.6));

  // Compose: light side vs shadow side
  vec3 color = mix(lightColor * lightField + lightColor * 0.02, shadowColor, shadowMask);

  // Shadow edge glow — the boundary between worlds
  float edgeMask = smoothstep(0.15, 0.0, abs(shadowFront + edgeNoise * 0.8));
  color += edgeColor * edgeMask * 0.06 * (1.0 + u_bass * 0.8);

  // Tendrils
  color = mix(color, shadowColor * 0.5, tendrils * 0.7);

  // Atmospheric haze in the light region
  float haze = fbm(uv * 2.0 + t * 0.06) * (1.0 - shadowMask);
  color += lightColor * haze * 0.02 * u_mid;

  // Bass: shadow surges forward
  float surge = u_bass * 0.05;
  color = mix(color, shadowColor, surge * (1.0 - shadowMask));

  // Treble: sparks at the shadow edge
  float sparks = snoise(uv * 20.0 + t * 3.0);
  color += edgeColor * smoothstep(0.8, 0.95, sparks) * edgeMask * u_treble * 0.05;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
