import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2, VORONOI } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  VORONOI +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  // Tissue background — warm pink
  float tissue = fbm(uv * 3.0 + t * 0.02);
  vec3 color = palette(
    tissue * 0.3 + 0.1,
    vec3(0.55, 0.4, 0.38),
    vec3(0.12, 0.08, 0.08),
    vec3(0.7, 0.5, 0.5),
    vec3(0.0, 0.08, 0.12)
  );

  // Capillary network — voronoi ridges at multiple scales
  vec2 warp = vec2(
    snoise(uv * 3.0 + t * 0.06),
    snoise(uv * 3.0 + t * 0.05 + 5.0)
  );
  vec2 p = uv + warp * 0.1;

  // Primary vessels
  vec3 v1 = voronoi(p * 5.0 + t * 0.02);
  float ridge1 = v1.y - v1.x;
  float vessel1 = smoothstep(0.18, 0.0, ridge1);
  float vesselCore1 = smoothstep(0.06, 0.0, ridge1);

  // Secondary capillaries
  vec3 v2 = voronoi(p * 12.0 + vec2(t * 0.03, 0.0));
  float ridge2 = v2.y - v2.x;
  float vessel2 = smoothstep(0.12, 0.0, ridge2);
  float vesselCore2 = smoothstep(0.04, 0.0, ridge2);

  // Finest capillaries
  vec3 v3 = voronoi(p * 28.0 + vec2(0.0, t * 0.04));
  float ridge3 = v3.y - v3.x;
  float vessel3 = smoothstep(0.08, 0.0, ridge3);

  // Blood color — deep red with variation
  vec3 bloodDark = palette(
    ridge1 * 0.5 + t * 0.02,
    vec3(0.4, 0.04, 0.04),
    vec3(0.25, 0.03, 0.02),
    vec3(0.8, 0.1, 0.1),
    vec3(0.0, 0.05, 0.1)
  );

  vec3 bloodBright = palette(
    ridge2 * 0.6 + t * 0.03 + 0.15,
    vec3(0.6, 0.1, 0.08),
    vec3(0.3, 0.08, 0.05),
    vec3(1.0, 0.2, 0.1),
    vec3(0.0, 0.05, 0.05)
  );

  // Oxygenated vs deoxygenated — spatial variation
  float oxyLevel = snoise(p * 2.0 + t * 0.1) * 0.5 + 0.5;
  vec3 oxyColor = mix(bloodDark, bloodBright, oxyLevel);

  // Compose vessel layers
  color = mix(color, oxyColor * 0.7, vessel1 * 0.7);
  color = mix(color, bloodBright, vesselCore1 * 0.85);
  color = mix(color, oxyColor * 0.8, vessel2 * 0.5);
  color = mix(color, bloodBright * 0.9, vesselCore2 * 0.6);
  color += bloodDark * vessel3 * 0.25;

  // Blood flow animation — pulsing through vessels
  float flowPulse = sin(v1.x * 20.0 - t * 6.0) * 0.5 + 0.5;
  flowPulse = pow(flowPulse, 3.0);
  color += bloodBright * flowPulse * vesselCore1 * u_bass * 0.6;

  // Heartbeat pulse — periodic brightness surge
  float heartbeat = pow(sin(t * 3.0) * 0.5 + 0.5, 8.0);
  color += bloodBright * heartbeat * vessel1 * u_mid * 0.3;

  // Oxygen sparkle — treble
  float sparkle = pow(snoise(p * 35.0 + t * 2.0) * 0.5 + 0.5, 10.0);
  color += vec3(0.8, 0.2, 0.15) * sparkle * u_treble * vessel2 * 0.5;

  color *= 0.85 + u_amplitude * 0.25;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
