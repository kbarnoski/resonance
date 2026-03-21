import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG =
  U +
  SMOOTH_NOISE +
  VISIONARY_PALETTE +
  ROT2 +
  `
// Helios — solar deity, radiant golden disk with corona.
// A stylized sun god radiating pure golden light, with
// ornamental rays and a pulsing divine corona.

float sacredRay(vec2 uv, float angle, float width, float len) {
  vec2 dir = vec2(cos(angle), sin(angle));
  float proj = dot(uv, dir);
  float perp = abs(dot(uv, vec2(-dir.y, dir.x)));
  float taper = width * (1.0 - proj / len);
  return smoothstep(max(taper, 0.001), 0.0, perp) * smoothstep(0.0, 0.05, proj) * smoothstep(len, len * 0.5, proj);
}

float haloRing(vec2 uv, float radius, float width) {
  float r = length(uv);
  return smoothstep(width, 0.0, abs(r - radius));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.15;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  // Central golden disk — the face of the sun god
  float disk = smoothstep(0.22, 0.18, r);
  float diskEdge = smoothstep(0.2, 0.17, r) - smoothstep(0.17, 0.14, r);

  // Inner glow patterns on disk surface
  float facePattern = snoise(uv * 8.0 + t * 0.2) * 0.5 + 0.5;
  facePattern += snoise(uv * 16.0 * rot2(t * 0.1) + vec2(10.0)) * 0.2;

  // Ornamental rays — alternating long and short
  float rays = 0.0;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float rayAngle = fi * 0.3927 + t * 0.04;
    float len = (mod(fi, 2.0) < 0.5) ? 0.7 + u_bass * 0.15 : 0.45 + u_bass * 0.1;
    float w = (mod(fi, 2.0) < 0.5) ? 0.04 : 0.025;
    float pulse = 0.8 + 0.2 * sin(t * 2.0 + fi * 0.8);
    rays += sacredRay(uv, rayAngle, w, len) * pulse;
  }

  // Divine corona — soft radiant glow
  float corona = exp(-r * 3.5) * (1.0 + u_bass * 0.6);
  float coronaNoise = fbm(vec2(angle * 3.0 + t * 0.2, r * 5.0 - t * 0.5));
  corona += coronaNoise * 0.15 * smoothstep(0.15, 0.4, r);

  // Halo rings — sacred geometry circles
  float halos = 0.0;
  halos += haloRing(uv, 0.3, 0.006) * 0.6;
  halos += haloRing(uv, 0.55, 0.004) * 0.35;
  halos += haloRing(uv, 0.75, 0.003) * 0.2;

  // Heat shimmer distortion
  vec2 shimmerUv = uv + vec2(
    snoise(vec2(uv.y * 10.0, t * 2.0)) * 0.005,
    snoise(vec2(uv.x * 10.0, t * 2.3)) * 0.005
  );
  float shimmer = fbm(shimmerUv * 6.0 + t * 0.5) * 0.5 + 0.5;

  float paletteShift = u_amplitude * 0.25;

  // Disk — pure divine gold
  vec3 diskCol = palette(
    facePattern * 0.3 + t * 0.05 + paletteShift,
    vec3(0.95, 0.8, 0.4),
    vec3(0.1, 0.1, 0.05),
    vec3(0.3, 0.2, 0.1),
    vec3(0.0, 0.05, 0.05)
  );

  // Ray color — brilliant amber to white
  vec3 rayCol = palette(
    rays + t * 0.04 + paletteShift + 0.15,
    vec3(0.9, 0.75, 0.35),
    vec3(0.2, 0.15, 0.1),
    vec3(0.5, 0.35, 0.15),
    vec3(0.0, 0.03, 0.08)
  );

  // Corona — warm amber glow
  vec3 coronaCol = palette(
    shimmer + t * 0.03 + paletteShift + 0.4,
    vec3(0.8, 0.6, 0.25),
    vec3(0.25, 0.15, 0.05),
    vec3(0.4, 0.3, 0.15),
    vec3(0.05, 0.05, 0.08)
  );

  vec3 color = vec3(0.0);

  // Corona base glow
  color += coronaCol * corona;

  // Sacred rays
  color += rayCol * rays * (0.7 + u_mid * 0.5);

  // Halo rings
  color += vec3(1.0, 0.9, 0.6) * halos * (0.5 + u_treble * 0.5);

  // Central disk — overwrites everything beneath
  color = mix(color, diskCol * (0.9 + facePattern * 0.2), disk);
  color += vec3(1.0, 0.95, 0.8) * diskEdge * 0.4;

  // Ambient warmth
  color += vec3(0.05, 0.03, 0.01) * smoothstep(0.8, 0.0, r);

  color *= smoothstep(1.5, 0.5, length(uv));
  gl_FragColor = vec4(color, 1.0);
}
`;
