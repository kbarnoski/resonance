import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Ghost form — translucent drifting figure with trailing wisps

float ghostShape(vec2 p, float time) {
  // Undulating central body — vaguely humanoid, top-heavy
  float headR = 0.15 + sin(time * 0.3) * 0.02;
  float head = length(p - vec2(0.0, 0.25 + sin(time * 0.5) * 0.03)) - headR;
  float body = length(p * vec2(1.8, 1.0) - vec2(0.0, 0.0)) - 0.2;
  float form = min(head, body);

  // Trailing wisps below — elongated tendrils drifting downward
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float xOff = (fi - 2.0) * 0.08;
    float sway = sin(time * 0.4 + fi * 1.2) * 0.06;
    vec2 wispP = p - vec2(xOff + sway, -0.2 - fi * 0.12);
    float wisp = length(wispP * vec2(6.0, 1.0)) - 0.04;
    form = min(form, wisp);
  }
  return form;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.1;

  // Slow drift across the frame
  vec2 drift = vec2(sin(t * 0.3) * 0.15, cos(t * 0.2) * 0.08);
  vec2 ghostUV = uv - drift;

  // Warp the ghost shape with noise for ethereal distortion
  vec2 warp = vec2(
    fbm(ghostUV * 3.0 + t * 0.2) * 0.12,
    fbm(ghostUV * 3.0 + vec2(5.0, 0.0) + t * 0.15) * 0.12
  );
  float dist = ghostShape(ghostUV + warp * (1.0 + u_bass * 0.5), t);

  // Layered translucency — multiple soft edges
  float innerGlow = exp(-max(dist, 0.0) * 8.0) * 0.12;
  float midGlow = exp(-max(dist, 0.0) * 3.0) * 0.08;
  float outerGlow = exp(-max(dist, 0.0) * 1.2) * 0.05;

  // Background: near-black with faint noise texture
  float bgNoise = fbm(uv * 2.0 + t * 0.05) * 0.02;
  vec3 bgColor = palette(0.7,
    vec3(0.005, 0.005, 0.01),
    vec3(0.01, 0.008, 0.02),
    vec3(1.0, 1.0, 1.0),
    vec3(0.6, 0.7, 0.85));
  bgColor += bgNoise;

  // Ghost colors: cold, pale, barely visible
  vec3 ghostCore = palette(0.55 + u_amplitude * 0.15,
    vec3(0.02, 0.02, 0.03),
    vec3(0.06, 0.05, 0.08),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.6, 0.8));

  vec3 ghostEdge = palette(0.4 + u_mid * 0.1,
    vec3(0.01, 0.01, 0.02),
    vec3(0.03, 0.025, 0.06),
    vec3(1.0, 1.0, 1.0),
    vec3(0.55, 0.65, 0.9));

  vec3 color = bgColor;
  color += ghostCore * innerGlow * (1.0 + u_bass * 1.5);
  color += ghostEdge * midGlow * (1.0 + u_mid * 0.8);
  color += ghostEdge * outerGlow * (1.0 + u_treble * 0.5);

  // Treble: faint particle sparkle in the ghost's wake
  float wake = smoothstep(0.1, 0.4, -ghostUV.y) * exp(-max(dist, 0.0) * 2.0);
  float sparkle = snoise(uv * 20.0 + t * 3.0);
  color += ghostEdge * smoothstep(0.7, 0.95, sparkle) * wake * u_treble * 0.06;

  // Trailing afterimage — ghost leaves faint traces behind
  float trail = 0.0;
  for (int i = 1; i < 4; i++) {
    float fi = float(i);
    vec2 pastDrift = vec2(sin((t - fi * 0.4) * 0.3) * 0.15, cos((t - fi * 0.4) * 0.2) * 0.08);
    float pastDist = ghostShape(uv - pastDrift + warp * 0.5, t - fi * 0.4);
    trail += exp(-max(pastDist, 0.0) * 4.0) * 0.02 / fi;
  }
  color += ghostEdge * trail;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}`;
