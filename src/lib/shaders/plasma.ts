import { U, SMOOTH_NOISE, VISIONARY_PALETTE, ROT2 } from "./shared";

export const FRAG = U + SMOOTH_NOISE + VISIONARY_PALETTE + ROT2 + `
// Electric arc: branching lightning bolt SDF
// Returns distance to a lightning-like branching line segment
float arcSegment(vec2 p, vec2 a, vec2 b, float thickness, float warp, float seed) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  vec2 midPoint = a + ba * h;
  // Jagged displacement along the bolt
  float disp = snoise(midPoint * 4.0 + seed) * warp;
  float disp2 = snoise(midPoint * 8.0 + seed + 3.0) * warp * 0.4;
  vec2 displaced = midPoint + vec2(-ba.y, ba.x) * normalize(ba + 0.001) * (disp + disp2);
  return length(p - displaced) - thickness;
}

// A whole lightning bolt: sum of multiple displaced segments
float lightning(vec2 p, vec2 start, vec2 end, float t, float seed) {
  float d = 1e6;
  vec2 dir = end - start;
  int N = 8;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float f0 = fi / 8.0;
    float f1 = (fi + 1.0) / 8.0;
    vec2 a = start + dir * f0;
    vec2 b = start + dir * f1;
    // Displace segment endpoints with noise (frozen in time per seed)
    float dispA = snoise(a * 3.0 + seed + t * 0.01) * 0.06;
    float dispB = snoise(b * 3.0 + seed + 1.7 + t * 0.01) * 0.06;
    a += vec2(-dir.y, dir.x) * dispA;
    b += vec2(-dir.y, dir.x) * dispB;

    float thickness = 0.003 + (1.0 - f0) * 0.002;
    float seg = length(p - mix(a, b, clamp(dot(p - a, b - a) / dot(b - a, b - a), 0.0, 1.0))) - thickness;
    d = min(d, seg);
  }
  return d;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.12;
  float paletteShift = u_amplitude * 0.27;

  vec3 color = vec3(0.0); // absolute dark space

  // Background: near-black with very faint electric field haze
  float bgHaze = fbm(uv * 2.5 + t * 0.06) * 0.5 + 0.5;
  bgHaze = smoothstep(0.45, 0.75, bgHaze) * 0.015;
  vec3 hazeColor = palette(0.58 + paletteShift,
    vec3(0.0, 0.0, 0.01),
    vec3(0.02, 0.01, 0.05),
    vec3(1.0, 1.0, 1.0),
    vec3(0.4, 0.5, 0.8));
  color += hazeColor * bgHaze * (0.5 + u_mid * 0.3);

  // ─── LIGHTNING BOLTS ───
  // Multiple arcs branching across the void
  // Each arc: start point, end point, time-flickering opacity, seed

  // Arc 1: top-left to bottom-right, main bolt
  float seed1 = 1.37;
  float flicker1 = smoothstep(0.3, 0.7, sin(t * 7.3 + seed1) * 0.5 + 0.5);
  flicker1 = flicker1 * (0.7 + u_bass * 0.3);
  float arc1 = lightning(uv, vec2(-0.7, 0.6), vec2(0.4, -0.5), t, seed1);
  float arc1glow = exp(-max(arc1, 0.0) * 80.0) * flicker1;
  float arc1core = exp(-max(arc1, 0.0) * 600.0) * flicker1;

  // Arc 2: branch from mid of arc1
  float seed2 = 3.71;
  float flicker2 = smoothstep(0.4, 0.8, sin(t * 11.1 + seed2) * 0.5 + 0.5);
  float arc2 = lightning(uv, vec2(-0.15, 0.05), vec2(0.7, 0.3), t, seed2);
  float arc2glow = exp(-max(arc2, 0.0) * 100.0) * flicker2 * 0.6;
  float arc2core = exp(-max(arc2, 0.0) * 800.0) * flicker2 * 0.6;

  // Arc 3: another main bolt, different angle
  float seed3 = 7.23;
  float flicker3 = smoothstep(0.2, 0.6, sin(t * 5.7 + seed3) * 0.5 + 0.5);
  flicker3 *= (0.5 + u_treble * 0.5);
  float arc3 = lightning(uv, vec2(0.5, 0.7), vec2(-0.3, -0.6), t, seed3);
  float arc3glow = exp(-max(arc3, 0.0) * 90.0) * flicker3 * 0.7;
  float arc3core = exp(-max(arc3, 0.0) * 700.0) * flicker3 * 0.7;

  // Arc 4: tiny branch — treble driven
  float seed4 = 9.15;
  float flicker4 = smoothstep(0.5, 0.9, sin(t * 17.0 + seed4) * 0.5 + 0.5) * u_treble;
  float arc4 = lightning(uv, vec2(-0.4, -0.2), vec2(0.0, -0.7), t * 1.3, seed4);
  float arc4glow = exp(-max(arc4, 0.0) * 150.0) * flicker4 * 0.4;

  // Electric glow color — cold blue-white with purple edges
  vec3 glowColor = palette(0.62 + paletteShift + u_mid * 0.08,
    vec3(0.0, 0.0, 0.02),
    vec3(0.06, 0.04, 0.18),
    vec3(1.0, 1.0, 1.0),
    vec3(0.5, 0.65, 0.9));

  // Core color: near-white, blue-white
  vec3 coreColor = palette(0.52 + paletteShift,
    vec3(0.05, 0.05, 0.1),
    vec3(0.3, 0.25, 0.5),
    vec3(1.0, 1.0, 1.0),
    vec3(0.0, 0.1, 0.3));

  // Warm discharge color for branching arcs
  vec3 dischargeColor = palette(0.45 + paletteShift,
    vec3(0.02, 0.0, 0.03),
    vec3(0.1, 0.03, 0.15),
    vec3(1.0, 0.8, 1.0),
    vec3(0.3, 0.5, 0.8));

  // Compose arcs
  float totalGlow = arc1glow + arc2glow * 0.7 + arc3glow + arc4glow;
  float totalCore = arc1core + arc2core + arc3core;

  color += glowColor * totalGlow * 0.5;
  color += dischargeColor * (arc2glow + arc4glow) * 0.6;
  color += coreColor * totalCore * 1.2;

  // Bass: massive discharge — brightens everything momentarily
  float bassFlash = u_bass * 0.12 * flicker1;
  color += coreColor * bassFlash * (arc1glow + arc3glow);

  // Treble: crackle — tiny random sparks
  float crackle = smoothstep(0.85, 1.0, snoise(uv * 25.0 + t * 3.0)) * u_treble * 0.08;
  crackle *= fbm(uv * 8.0 + t) * 0.5 + 0.5; // cluster
  color += glowColor * crackle;

  // St. Elmo's fire — diffuse glow around active areas
  float stElmo = (arc1glow + arc3glow) * 0.06 * exp(-length(uv) * 1.5);
  color += hazeColor * stElmo;

  // Vignette
  float vd = length(uv);
  float vignette = pow(1.0 - smoothstep(0.15, 1.4, vd), 2.0);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;
