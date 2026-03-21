import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.25;

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Crown shape — elevated arc above center
  vec2 crownCenter = vec2(0.0, 0.05);
  float crownR = length(uv - crownCenter);
  float crownA = atan(uv.y - crownCenter.y, uv.x - crownCenter.x);

  // Multiple FBM layers for cloud-like vapors
  // Layer 1: large billowing clouds
  vec2 cloudUV1 = uv * 2.5 + vec2(t * 0.2, t * 0.1);
  float cloud1 = fbm(cloudUV1);

  // Layer 2: medium turbulence
  vec2 cloudUV2 = rot2(t * 0.15) * uv * 4.0 + vec2(-t * 0.15, t * 0.25);
  float cloud2 = fbm(cloudUV2);

  // Layer 3: fine vapor detail
  vec2 cloudUV3 = rot2(-t * 0.1) * uv * 8.0 + vec2(t * 0.3, -t * 0.1);
  float cloud3 = fbm(cloudUV3);

  // Shape the clouds into a nimbus/crown formation
  // Toroidal mask — thick ring around center
  float crownMask = smoothstep(0.55, 0.25, crownR) * smoothstep(0.05, 0.15, crownR);

  // Slight upward bias — nimbus sits above center
  crownMask *= smoothstep(-0.3, 0.1, uv.y) * 0.7 + 0.3;

  // Audio-reactive breathing
  float breathe = 1.0 + u_bass * 0.15;
  crownMask *= breathe;

  // Combine cloud layers with different weights
  float clouds = cloud1 * 0.5 + cloud2 * 0.3 + cloud3 * 0.2;
  float shapedCloud = clouds * crownMask;

  // Luminous inner glow — the divine light source
  float innerLight = exp(-crownR * 3.0) * (1.0 + u_amplitude * 0.4);

  // Soft radial rays through the clouds
  float rayCount = 16.0;
  float rays = pow(abs(cos(crownA * rayCount + t * 0.5)), 8.0);
  rays *= smoothstep(0.15, 0.3, crownR) * smoothstep(0.7, 0.35, crownR);
  rays *= (0.3 + cloud1 * 0.3); // Rays modulated by clouds

  // Scintillation at cloud edges
  float edgeNoise = snoise(uv * 25.0 + t * 1.5);
  float cloudEdge = smoothstep(0.1, 0.2, abs(shapedCloud));
  float scintillation = smoothstep(0.5, 0.8, edgeNoise) * cloudEdge * crownMask;

  // Wispy tendrils extending outward
  float tendrils = 0.0;
  for (int i = 0; i < 8; i++) {
    float ta = float(i) * 0.7854 + t * 0.2;
    vec2 dir = vec2(cos(ta), sin(ta));
    float along = dot(uv, dir);
    float perp = length(uv - dir * along);
    float tendril = exp(-perp * 40.0) * smoothstep(0.25, 0.5, along) * smoothstep(0.8, 0.5, along);
    tendril *= (0.5 + 0.5 * snoise(vec2(along * 10.0, float(i)) + t));
    tendrils += tendril;
  }
  tendrils *= u_treble * 0.5;

  // Halo ring at the nimbus boundary
  float haloRing = abs(crownR - 0.35) - 0.005;
  float haloGlow = smoothstep(0.02, 0.0, abs(haloRing)) * (0.5 + cloud1 * 0.3);

  // Warm luminous white palette
  vec3 col1 = palette(
    crownR * 2.0 + paletteShift,
    vec3(0.8, 0.75, 0.65),
    vec3(0.3, 0.28, 0.22),
    vec3(1.0, 0.9, 0.7),
    vec3(0.0, 0.05, 0.1)
  );

  // Soft lavender / silver for outer vapors
  vec3 col2 = palette(
    clouds * 2.0 + paletteShift + 0.3,
    vec3(0.6, 0.6, 0.7),
    vec3(0.3, 0.3, 0.35),
    vec3(0.7, 0.7, 0.9),
    vec3(0.3, 0.2, 0.4)
  );

  // Warm peach for the inner light
  vec3 col3 = palette(
    innerLight + paletteShift + 0.6,
    vec3(0.85, 0.75, 0.65),
    vec3(0.25, 0.2, 0.18),
    vec3(1.0, 0.85, 0.7),
    vec3(0.0, 0.05, 0.08)
  );

  vec3 color = vec3(0.0);

  // Inner divine light
  color += col3 * innerLight * 1.2;

  // Main cloud formation
  color += col1 * shapedCloud * 1.5 * (0.7 + u_bass * 0.5);

  // Secondary cloud detail
  color += col2 * abs(cloud2) * crownMask * 0.5 * (0.6 + u_mid * 0.4);

  // Rays through clouds
  color += col1 * rays * 0.6 * (0.5 + u_treble * 0.5);

  // Scintillation sparkles
  color += vec3(1.3, 1.25, 1.1) * scintillation * 0.8;

  // Wispy tendrils
  color += col2 * tendrils;

  // Halo ring
  color += col1 * haloGlow * 1.0 * (0.6 + u_mid * 0.4);

  // Emissive hot center
  float hotCore = exp(-crownR * 6.0);
  color += vec3(1.4, 1.3, 1.1) * hotCore * 0.5;

  // Subtle fine cloud texture
  color += col2 * abs(cloud3) * crownMask * 0.15 * u_treble;

  // Vignette
  color *= smoothstep(1.5, 0.5, length(uv));

  gl_FragColor = vec4(color, 1.0);
}
`;
