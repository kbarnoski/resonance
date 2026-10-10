// ─── Review pack #2 — 50 candidate shaders ───
//
// Same uniform contract as the rest of the pool. All under category
// "Review" — user previews, deletes the bad ones, tells me which
// permanent category each survivor belongs in.

import { U, SMOOTH_NOISE, VORONOI, ROT2, VISIONARY_PALETTE } from "./shared";
import { withAngleSeamBlend } from "./angle-seam";

const HEAD = U + SMOOTH_NOISE + VORONOI + ROT2 + VISIONARY_PALETTE;

// 1. Curl-noise particle swarm (no actual particles — sampled flow field)
export const R2_CURLSWARM = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.2;
  vec2 p = uv * 2.0;
  float a = fbm(p + t);
  float b = fbm(p + 5.7 - t);
  vec2 flow = vec2(b, -a);
  p += flow * 0.4;
  float n = fbm(p * 3.0 + t * 0.5);
  vec3 col = palette(n + t * 0.1, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.3, 0.7));
  col *= smoothstep(0.0, 0.6, n);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 2. Logarithmic spiral galaxy
export const R2_SPIRALGAL = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.15;
  vec2 p = rot2(t * 0.1) * uv;
  float r = length(p);
  float a = atan(p.y, p.x);
  float arms = 4.0;
  float spiral = sin(a * arms - log(r + 0.001) * 5.0 - t * 2.0);
  float core = exp(-r * 3.0);
  vec3 col = palette(r * 0.5 + t * 0.05, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.3, 0.6));
  col *= smoothstep(-0.2, 0.7, spiral) * 0.6 + core;
  gl_FragColor = vec4(col, 1.0);
}
`;

// 3. Marble texture flow
export const R2_MARBLE = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  vec2 q = uv * 2.0;
  float a = fbm(q + t);
  float b = fbm(q * 1.4 + a * 1.5);
  float marble = sin((q.x + b * 4.0) * 4.0) * 0.5 + 0.5;
  vec3 col = mix(vec3(0.05, 0.04, 0.03), vec3(0.85, 0.8, 0.7), pow(marble, 1.5));
  col += vec3(0.4, 0.35, 0.25) * pow(marble, 6.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 4. Wave interference rings
export const R2_INTERFERENCE = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.5;
  vec2 c1 = vec2(sin(t * 0.4), cos(t * 0.5)) * 0.4;
  vec2 c2 = vec2(cos(t * 0.6), sin(t * 0.7)) * 0.4;
  float w1 = sin(length(uv - c1) * 18.0 - t * 3.0);
  float w2 = sin(length(uv - c2) * 18.0 - t * 3.0);
  float combined = (w1 + w2) * 0.5;
  vec3 col = palette(combined * 0.3 + t * 0.05, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.4, 0.7));
  col *= 0.5 + 0.5 * combined;
  gl_FragColor = vec4(col, 1.0);
}
`;

// 5. Constellation — stars with connecting lines
export const R2_CONSTELLATION = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.05;
  vec3 col = vec3(0.01, 0.02, 0.05);
  vec2 stars[8];
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    stars[i] = vec2(snoise(vec2(fi, 0.0)) * 1.5, snoise(vec2(0.0, fi)) * 0.85)
      + 0.05 * vec2(sin(t + fi), cos(t * 1.3 + fi));
  }
  for (int i = 0; i < 8; i++) {
    float d = length(uv - stars[i]);
    col += vec3(0.9, 0.95, 1.0) * 0.001 / (d * d + 0.0008);
  }
  for (int i = 0; i < 8; i++) {
    int j = (i + 1) % 8;
    vec2 a = stars[i], b = stars[j];
    vec2 ba = b - a;
    vec2 pa = uv - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float d = length(pa - ba * h);
    col += vec3(0.4, 0.5, 0.7) * 0.0006 / (d + 0.0008);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 6. Parallel fiber strands
export const R2_FIBERS = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.15;
  vec3 col = vec3(0.0);
  uv = rot2(0.4) * uv;
  for (int i = 0; i < 30; i++) {
    float fi = float(i);
    float yOff = (fi / 29.0 - 0.5) * 1.2;
    float wob = sin(uv.x * 2.0 + t + fi * 0.3) * 0.04;
    float d = abs(uv.y - yOff - wob);
    float thread = 0.0015 / (d + 0.002);
    vec3 hue = palette(fi * 0.04 + t * 0.02, vec3(0.4), vec3(0.4), vec3(1.0), vec3(0.0, 0.3, 0.6));
    col += thread * hue * 0.25;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 7. Kelvin-Helmholtz atmospheric instability
export const R2_KELVIN = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.2;
  vec2 q = uv * 1.5;
  q.x += t * 0.5;
  q.y += sin(q.x * 1.5 + t) * 0.3;
  float h = fbm(q * 2.0);
  vec3 cool = vec3(0.1, 0.2, 0.45);
  vec3 warm = vec3(0.85, 0.55, 0.25);
  vec3 col = mix(cool, warm, smoothstep(0.0, 0.6, h));
  col += pow(smoothstep(0.5, 0.85, h), 4.0) * vec3(0.95, 0.85, 0.5) * 0.3;
  gl_FragColor = vec4(col, 1.0);
}
`;

// 8. Dark matter — black-on-black subtle structure
export const R2_DARKMATTER = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.05;
  vec2 q = uv * 2.5;
  q += 0.3 * vec2(fbm(q + t), fbm(q - t));
  float n = fbm(q * 1.8 + t);
  float threads = pow(smoothstep(0.55, 0.7, n), 4.0);
  vec3 col = vec3(0.05, 0.07, 0.12) * (0.3 + n * 0.2);
  col += threads * vec3(0.3, 0.4, 0.6);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 9. Solar corona — radial light streaks
export const R2_CORONA = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float core = exp(-r * 4.0);
  float rays = sin(a * 60.0 + fbm(vec2(a * 5.0, t)) * 4.0);
  rays = smoothstep(-0.5, 0.9, rays);
  float falloff = exp(-r * 2.0);
  vec3 col = vec3(1.0, 0.85, 0.4) * core;
  col += vec3(1.0, 0.6, 0.2) * rays * falloff * 0.6;
  col += vec3(0.6, 0.2, 0.05) * (1.0 - smoothstep(0.0, 1.5, r));
  gl_FragColor = vec4(col, 1.0);
}
`;

// 10. Paint splatter
export const R2_SPLATTER = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.15;
  vec3 col = vec3(0.95, 0.93, 0.9);
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    vec2 c = vec2(snoise(vec2(fi, 0.0)) * 1.2, snoise(vec2(0.0, fi)) * 0.7);
    c += 0.05 * vec2(sin(t + fi), cos(t + fi * 0.7));
    vec2 d = uv - c;
    d += 0.04 * vec2(fbm(d * 4.0 + t), fbm(d * 4.0 - t));
    float r = 0.04 + fract(fi * 0.31) * 0.12;
    float blot = smoothstep(r, r * 0.8, length(d));
    vec3 paint = palette(fract(fi * 0.13), vec3(0.3), vec3(0.4), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col = mix(col, paint, blot);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 11. Crystalline geometric refraction
export const R2_CRYSTALLINE = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.08;
  vec3 v = voronoi(uv * 4.0 + t);
  float facet = smoothstep(0.5, 0.0, v.x);
  float edge = smoothstep(0.05, 0.0, abs(v.x - v.y));
  vec3 base = palette(v.y * 2.0, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.1, 0.4, 0.8));
  vec3 col = base * facet;
  col += pow(facet, 6.0) * vec3(1.0);
  col += edge * vec3(0.85, 0.92, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 12. Heatmap thermal pulse
export const R2_THERMAL = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.2;
  float h = fbm(uv * 2.0 + t);
  h += 0.3 * fbm(uv * 6.0 - t * 0.5);
  // Thermal palette: blue → cyan → green → yellow → red → white
  vec3 col;
  if (h < 0.2) col = mix(vec3(0.0, 0.0, 0.2), vec3(0.0, 0.4, 0.8), h * 5.0);
  else if (h < 0.4) col = mix(vec3(0.0, 0.4, 0.8), vec3(0.0, 0.9, 0.4), (h - 0.2) * 5.0);
  else if (h < 0.6) col = mix(vec3(0.0, 0.9, 0.4), vec3(0.95, 0.95, 0.0), (h - 0.4) * 5.0);
  else if (h < 0.8) col = mix(vec3(0.95, 0.95, 0.0), vec3(1.0, 0.2, 0.0), (h - 0.6) * 5.0);
  else col = mix(vec3(1.0, 0.2, 0.0), vec3(1.0, 0.95, 0.9), (h - 0.8) * 5.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 13. Magnetic field lines
export const R2_MAGNETIC = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.15;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float curve = (fi / 13.0 - 0.5) * 1.4;
    float bend = curve * 0.6;
    // Half-circle field line
    float r = 0.3 + abs(curve) * 0.7;
    vec2 center = vec2(0.0, -bend * 0.5);
    float d = abs(length(uv - center) - r);
    float anim = sin(atan(uv.y - center.y, uv.x - center.x) * 2.0 - t * 3.0 + fi);
    float line = (0.003 + 0.002 * anim) / (d + 0.005);
    vec3 hue = mix(vec3(0.4, 0.6, 1.0), vec3(1.0, 0.5, 0.7), abs(curve));
    col += line * hue * 0.4;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 14. Twisting ribbon dance
export const R2_RIBBON = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.4;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 p = uv;
    p = rot2(t * 0.2 + fi * 1.57) * p;
    float wave = sin(p.x * 2.0 + t + fi) * 0.15;
    float thick = 0.04 * (1.0 + sin(p.x * 3.0 + t * 0.5));
    float d = abs(p.y - wave);
    float ribbon = smoothstep(thick, 0.0, d);
    vec3 hue = palette(fi * 0.25 + t * 0.1, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col += ribbon * hue * 0.6;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 15. Cellular mitosis pattern
export const R2_MITOSIS = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  vec3 v = voronoi(uv * 2.5 + t * 0.3);
  float cell = smoothstep(0.6, 0.2, v.x);
  float nucleus = smoothstep(0.1, 0.0, v.x);
  float mem = smoothstep(0.04, 0.0, abs(v.x - v.y));
  vec3 col = vec3(0.05, 0.1, 0.08) + cell * vec3(0.3, 0.5, 0.4);
  col += nucleus * vec3(0.6, 0.2, 0.7);
  col += mem * vec3(0.4, 0.7, 0.5);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 16. Coral fractal bloom
export const R2_CORAL = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.07;
  vec2 z = uv * 1.4;
  float dist = 1e9;
  for (int i = 0; i < 6; i++) {
    z = abs(z) / dot(z, z) - vec2(0.7 + sin(t) * 0.05, 0.5);
    dist = min(dist, length(z));
  }
  float c = smoothstep(1.5, 0.0, dist);
  vec3 col = palette(c + t * 0.2, vec3(0.5, 0.3, 0.4), vec3(0.5, 0.3, 0.3), vec3(1.0), vec3(0.0, 0.2, 0.5));
  col *= c;
  gl_FragColor = vec4(col, 1.0);
}
`;

// 17. Ferrofluid spikes
export const R2_FERROFLUID = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.2;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float spikes = sin(a * 12.0 + t) * 0.05 + sin(a * 24.0 - t * 0.7) * 0.02;
  float bulb = smoothstep(0.5 + spikes, 0.45 + spikes, r);
  vec3 col = vec3(0.0);
  col += bulb * vec3(0.05, 0.05, 0.08);
  float rim = smoothstep(0.04, 0.0, abs(r - 0.5 - spikes));
  col += rim * vec3(0.3, 0.45, 0.7);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 18. Neon noir cyberpunk grid
export const R2_NEONNOIR = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.5;
  // Perspective grid
  float horizon = 0.0;
  float dist = (uv.y - horizon);
  if (dist < 0.0) dist = -dist * 0.5;
  vec2 g = vec2(uv.x / dist, mod(1.0 / dist + t, 1.0));
  vec2 ag = abs(fract(g) - 0.5);
  float line = smoothstep(0.45, 0.5, max(ag.x, ag.y));
  vec3 col = vec3(0.02, 0.0, 0.05);
  col += line * vec3(1.0, 0.2, 0.7);
  col += smoothstep(0.05, 0.0, abs(uv.y - horizon)) * vec3(0.8, 0.1, 0.5);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 19. Starlit mist atmosphere
export const R2_STARLITMIST = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.05;
  float mist = fbm(uv * 1.5 + t);
  vec3 fog = vec3(0.05, 0.08, 0.18) * (0.3 + mist);
  // Stars
  float stars = pow(snoise(uv * 80.0), 50.0);
  vec3 col = fog + stars * vec3(1.0);
  col += pow(mist, 5.0) * vec3(0.3, 0.45, 0.7);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 20. Zero-gravity floating spheres
export const R2_ZEROG = HEAD + `
float sphere(vec2 uv, vec2 c, float r) {
  float d = length(uv - c);
  return smoothstep(r, r * 0.85, d);
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.2;
  vec3 col = vec3(0.04, 0.03, 0.06);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(t + fi * 1.7) * 0.6, cos(t * 0.7 + fi * 1.3) * 0.4);
    float r = 0.08 + fract(fi * 0.31) * 0.05;
    float s = sphere(uv, c, r);
    vec2 d = uv - c;
    float lit = max(0.0, dot(normalize(d + vec2(0.001)), vec2(0.5, 0.7)));
    vec3 hue = palette(fi * 0.13, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.3, 0.6));
    col = mix(col, hue * (0.3 + lit * 0.7), s);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 21. Volumetric nebula clouds
export const R2_NEBULA2 = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.05;
  vec2 q = uv * 1.5;
  float c1 = fbm(q + t);
  float c2 = fbm(q * 1.5 - t * 0.7 + 5.0);
  vec3 violet = vec3(0.4, 0.1, 0.6) * c1;
  vec3 cyan = vec3(0.1, 0.4, 0.6) * c2;
  vec3 col = violet + cyan + vec3(0.02, 0.02, 0.05);
  // Stars
  col += pow(snoise(uv * 60.0), 80.0) * vec3(1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 22. Fish-school coordinated motion
export const R2_FISHSCHOOL = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.3;
  vec3 col = vec3(0.02, 0.06, 0.1);
  vec2 herd = vec2(sin(t * 0.4), cos(t * 0.3)) * 0.3;
  for (int i = 0; i < 50; i++) {
    float fi = float(i);
    vec2 jitter = vec2(snoise(vec2(fi, t * 0.5)), snoise(vec2(fi, t * 0.5 + 7.0))) * 0.4;
    vec2 c = herd + jitter;
    float d = length(uv - c);
    float fish = 0.0008 / (d * d + 0.001);
    col += fish * vec3(0.5, 0.7, 0.9);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 23. Reaction-diffusion approximation
export const R2_REACTDIFF = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.05;
  vec2 q = uv * 5.0;
  float a = fbm(q + t);
  float b = fbm(q * 1.4 + a * 3.0);
  float spots = smoothstep(0.45, 0.55, b);
  float rings = abs(fract(b * 4.0) - 0.5);
  vec3 col = mix(vec3(0.05, 0.03, 0.08), vec3(0.85, 0.6, 0.35), spots);
  col -= rings * 0.2;
  gl_FragColor = vec4(col, 1.0);
}
`;

// 24. Iridescent oil slick
export const R2_OILSLICK = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  vec2 q = uv;
  q += 0.2 * vec2(fbm(q * 2.0 + t), fbm(q * 2.0 - t));
  float h = fbm(q * 4.0);
  vec3 col = palette(h * 6.0 + t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
  col *= 0.4 + 0.6 * h;
  gl_FragColor = vec4(col, 1.0);
}
`;

// 25. Abyssal deep-ocean currents
export const R2_ABYSS = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  vec2 q = uv * 1.6;
  q += 0.4 * vec2(fbm(q + t), fbm(q - t));
  float current = fbm(q * 1.5);
  vec3 col = mix(vec3(0.0, 0.02, 0.06), vec3(0.0, 0.15, 0.3), current);
  // Faint particles
  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    vec2 c = vec2(snoise(vec2(fi, 0.0)), snoise(vec2(0.0, fi))) * vec2(1.4, 0.85);
    c.x = mod(c.x + t * 0.1, 2.8) - 1.4;
    float d = length(uv - c);
    col += vec3(0.4, 0.7, 0.9) * 0.0007 / (d * d + 0.0008);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 26. Fireworks bursts
export const R2_FIREWORKS = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.6;
  vec3 col = vec3(0.02, 0.02, 0.05);
  for (int b = 0; b < 4; b++) {
    float fb = float(b);
    float life = mod(t * 0.4 + fb * 0.25, 1.0);
    vec2 c = vec2(snoise(vec2(fb, floor(t * 0.4 + fb * 0.25))) * 1.0,
                  snoise(vec2(0.0, fb + floor(t * 0.4 + fb * 0.25))) * 0.6);
    float r = length(uv - c);
    float front = smoothstep(0.05, 0.0, abs(r - life * 0.5));
    float fade = 1.0 - life;
    vec3 hue = palette(fb * 0.27, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col += front * fade * hue;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 27. Chromatic aberration distortion
export const R2_CHROMATIC = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.15;
  float r = length(uv);
  vec3 col;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float off = (fi - 1.0) * 0.04 * r;
    vec2 p = uv + vec2(cos(t + fi * 2.09), sin(t + fi * 2.09)) * off;
    float pat = smoothstep(0.4, 0.0, abs(length(p) - 0.4 + 0.1 * sin(t * 2.0)));
    if (i == 0) col.r = pat;
    if (i == 1) col.g = pat;
    if (i == 2) col.b = pat;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 28. Glitch tear / digital corruption
export const R2_GLITCH = HEAD + `
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.3;
  // Horizontal tear lines
  float band = floor(uv.y * 30.0);
  float seed = fract(sin(band * 12.7 + floor(t * 4.0)) * 43.0);
  float shift = (seed - 0.5) * 0.3 * step(0.7, seed);
  uv.x += shift;
  vec3 col = vec3(0.0);
  col.r = smoothstep(0.4, 0.6, fract(uv.x * 2.0 + seed));
  col.g = smoothstep(0.4, 0.6, fract(uv.x * 2.0 + seed + 0.33));
  col.b = smoothstep(0.4, 0.6, fract(uv.x * 2.0 + seed + 0.66));
  col *= step(0.5, fract(sin(band * 31.7) * 99.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

// 29. Liquid light photon stream
export const R2_PHOTON = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.4;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float speed = 0.3 + fract(fi * 0.27) * 0.4;
    float x = mod(fi * 0.21 - t * speed, 2.4) - 1.2;
    float y = (fract(fi * 0.13) - 0.5) * 1.0 + sin(t * 0.5 + fi) * 0.05;
    float trail = smoothstep(0.0, 0.4, x + 1.2) * (1.0 - step(0.0, uv.x - x));
    float thick = 0.005 + 0.005 * trail;
    float d = abs(uv.y - y);
    float beam = thick / (d + 0.005);
    vec3 hue = palette(fi * 0.13, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col += beam * hue * 0.4;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 30. Spider web radial threads
export const R2_WEB = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.05;
  uv = rot2(t) * uv;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  // Radial spokes
  float spokes = abs(sin(a * 7.0));
  spokes = smoothstep(0.95, 1.0, spokes);
  // Concentric polygons (octagons)
  float poly = mod(r * 8.0, 1.0);
  float ring = smoothstep(0.05, 0.0, abs(poly - 0.5));
  vec3 col = vec3(0.02);
  col += spokes * vec3(0.7, 0.75, 0.85);
  col += ring * vec3(0.5, 0.55, 0.7);
  col += smoothstep(0.02, 0.0, r) * vec3(0.9, 0.9, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 31. Tessellation tiling
export const R2_TESSELLATION = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  uv = rot2(t * 0.1) * uv;
  uv *= 4.0;
  vec2 ic = floor(uv);
  vec2 fc = fract(uv) - 0.5;
  float d = max(abs(fc.x), abs(fc.y));
  float seed = fract(sin(dot(ic, vec2(127.1, 311.7))) * 43.0);
  vec3 hue = palette(seed + t * 0.05, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
  vec3 col = hue * smoothstep(0.5, 0.4, d);
  col += smoothstep(0.5, 0.48, d) * vec3(0.95);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 32. Holographic prismatic flare
export const R2_HOLO = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.15;
  vec2 c = vec2(sin(t) * 0.3, cos(t * 0.7) * 0.2);
  float d = length(uv - c);
  vec3 col = vec3(0.02);
  // Anamorphic flare
  vec2 ad = uv - c;
  float h = exp(-abs(ad.y) * 10.0) * exp(-abs(ad.x) * 3.0);
  col += h * vec3(0.7, 0.85, 1.0);
  // Hexagonal ghosts
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 g = c + (fi / 4.0 - 0.5) * 1.5 * normalize(c);
    float gd = length(uv - g);
    vec3 hue = palette(fi * 0.2, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col += smoothstep(0.05, 0.0, gd) * hue * 0.6;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 33. Oxidation rust spreading
export const R2_OXIDATION = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.05;
  float n = fbm(uv * 4.0 + t);
  float spread = smoothstep(0.3, 0.7, n);
  vec3 metal = vec3(0.4, 0.42, 0.45);
  vec3 rust = mix(vec3(0.5, 0.2, 0.1), vec3(0.7, 0.4, 0.15), fbm(uv * 8.0));
  vec3 col = mix(metal, rust, spread);
  col += pow(spread, 4.0) * vec3(0.2, 0.1, 0.05);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 34. Velvet soft pulse
export const R2_VELVET = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  float r = length(uv);
  float pulse = 0.5 + 0.5 * sin(t - r * 2.0);
  float n = fbm(uv * 8.0 + t * 0.3);
  vec3 col = mix(vec3(0.15, 0.0, 0.25), vec3(0.6, 0.1, 0.5), pulse);
  col *= 0.7 + n * 0.3;
  gl_FragColor = vec4(col, 1.0);
}
`;

// 35. Avalanche cascading particles
export const R2_AVALANCHE = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.5;
  vec3 col = vec3(0.05, 0.07, 0.1);
  for (int i = 0; i < 80; i++) {
    float fi = float(i);
    float speed = 0.4 + fract(fi * 0.31) * 0.5;
    float x = (fract(fi * 0.13) - 0.5) * 1.6 + sin(t * 1.5 + fi * 2.0) * 0.05;
    float y = mod(0.8 - t * speed - fi * 0.05, 1.6) - 0.8;
    vec2 c = vec2(x, y);
    float d = length(uv - c);
    float p = 0.001 / (d * d + 0.0008);
    col += p * vec3(0.85, 0.92, 1.0);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 36. Thunderhead storm cloud
export const R2_THUNDERHEAD = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.05;
  vec2 q = uv * 1.4;
  q += 0.4 * vec2(fbm(q + t), fbm(q - t));
  float cloud = fbm(q * 2.0);
  // Occasional flash
  float flash = pow(0.5 + 0.5 * sin(t * 7.0), 32.0);
  vec3 dark = vec3(0.04, 0.05, 0.08);
  vec3 light = vec3(0.4, 0.45, 0.55);
  vec3 col = mix(dark, light, smoothstep(0.3, 0.7, cloud));
  col += flash * cloud * vec3(0.85, 0.9, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 37. Golden Fibonacci spiral with gold
export const R2_GOLDEN = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float spiralB = 0.30635;
  float spiralA = 0.04;
  float th = log(max(r, 0.001) / spiralA) / spiralB;
  float arms = 3.0;
  float ang = mod(a - th + t, 6.28318);
  float dist = abs(fract(ang / 6.28318 * arms) - 0.5) / arms;
  float arm = smoothstep(0.06, 0.0, dist * (0.4 + r));
  vec3 gold = vec3(1.0, 0.78, 0.3);
  vec3 col = arm * gold;
  col += smoothstep(0.04, 0.0, r) * vec3(1.0, 0.95, 0.7);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 38. Paper-fold origami creases
export const R2_PAPERFOLD = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.05;
  vec2 q = rot2(t) * uv;
  float c1 = abs(q.x + q.y * 0.5);
  float c2 = abs(q.x * 0.5 - q.y);
  float c3 = abs(q.x);
  float fold = sin(c1 * 6.0) * sin(c2 * 6.0) * sin(c3 * 6.0);
  float lit = max(0.0, fold);
  vec3 col = vec3(0.85, 0.82, 0.78) * (0.6 + 0.4 * lit);
  col -= 0.2 * smoothstep(0.0, 0.05, abs(c1 - 0.0)) * (0.5 - lit);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 39. Pixie dust sparkles trailing
export const R2_PIXIE = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.4;
  vec3 col = vec3(0.04, 0.03, 0.08);
  for (int i = 0; i < 28; i++) {
    float fi = float(i);
    float life = mod(t * 0.5 + fi * 0.13, 1.0);
    vec2 origin = vec2(sin(t * 0.3 + fi * 0.7) * 0.5, cos(t * 0.4 + fi * 1.1) * 0.3);
    vec2 vel = vec2(cos(fi), sin(fi)) * life * 0.3;
    vec2 c = origin + vel;
    float d = length(uv - c);
    float twink = 0.5 + 0.5 * sin(t * 4.0 + fi * 3.0);
    twink = pow(twink, 8.0);
    float fade = 1.0 - life;
    float glow = 0.0008 / (d * d + 0.0008);
    col += glow * vec3(1.0, 0.9, 0.6) * twink * fade;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 40. Moss spread organic
export const R2_MOSS = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.03;
  vec3 v = voronoi(uv * 6.0 + t);
  float clump = smoothstep(0.5, 0.0, v.x);
  float n = fbm(uv * 12.0 + t);
  vec3 darkmoss = vec3(0.05, 0.15, 0.05);
  vec3 lightmoss = vec3(0.3, 0.55, 0.2);
  vec3 col = mix(darkmoss, lightmoss, clump * (0.7 + 0.3 * n));
  col += pow(clump, 4.0) * vec3(0.6, 0.8, 0.3) * 0.3;
  gl_FragColor = vec4(col, 1.0);
}
`;

// 41. Fjord deep blue reflective
export const R2_FJORD = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  vec2 q = uv * 1.5;
  q.y += 0.05 * fbm(q * 4.0 + t);
  float h = fbm(q * 1.5 + t * 0.3);
  vec3 deep = vec3(0.0, 0.05, 0.15);
  vec3 mid = vec3(0.05, 0.25, 0.45);
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.7, h));
  // Highlight ripples on top half
  float ripple = pow(smoothstep(0.7, 0.95, h), 4.0);
  col += ripple * vec3(0.95, 0.95, 1.0) * smoothstep(-0.1, 0.3, uv.y);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 42. Heavy snowfall thick
export const R2_HEAVYSNOW = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.4;
  vec3 col = vec3(0.05, 0.07, 0.1);
  for (int i = 0; i < 120; i++) {
    float fi = float(i);
    float speed = 0.2 + fract(fi * 0.27) * 0.3;
    float x = (fract(fi * 0.13) - 0.5) * 1.8 + sin(t + fi) * 0.05;
    float y = mod(0.8 - t * speed - fi * 0.04, 1.6) - 0.8;
    vec2 c = vec2(x, y);
    float d = length(uv - c);
    float size = 0.0006 + fract(fi * 0.31) * 0.0008;
    float flake = size / (d * d + size);
    col += flake * vec3(0.95, 0.97, 1.0) * 0.6;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 43. Comet trail streak
export const R2_COMET = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.4;
  // Comet path: arc across screen
  float cx = -1.4 + mod(t * 0.5, 2.8);
  float cy = sin(cx * 1.5) * 0.3;
  vec2 c = vec2(cx, cy);
  vec2 d = uv - c;
  // Direction of motion (tangent)
  vec2 dir = normalize(vec2(1.0, cos(cx * 1.5) * 1.5 * 0.3));
  float along = -dot(d, dir);
  float perp = length(d - dir * dot(d, dir));
  float trail = smoothstep(0.5, 0.0, along) * smoothstep(0.04 + along * 0.05, 0.0, perp);
  float head = 0.005 / (length(d) * length(d) + 0.005);
  vec3 col = vec3(0.02, 0.02, 0.06);
  col += trail * vec3(0.6, 0.8, 1.0);
  col += head * vec3(1.0);
  // Background stars
  col += pow(snoise(uv * 80.0), 80.0) * vec3(1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 44. Muted glow minimal pulses
export const R2_MUTEDGLOW = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  float pulse = 0.5 + 0.5 * sin(t);
  float r = length(uv);
  vec3 col = vec3(0.05, 0.05, 0.08);
  col += pulse * exp(-r * 3.0) * vec3(0.3, 0.25, 0.4);
  col += 0.5 * pulse * exp(-r * 1.5) * vec3(0.15, 0.1, 0.2);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 45. Infrared red/black heat signature
export const R2_INFRARED = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.05;
  vec2 q = uv * 1.5;
  q += 0.3 * vec2(fbm(q + t), fbm(q - t));
  float h = fbm(q * 2.0);
  vec3 col;
  if (h < 0.4) col = mix(vec3(0.0), vec3(0.4, 0.0, 0.0), h * 2.5);
  else if (h < 0.6) col = mix(vec3(0.4, 0.0, 0.0), vec3(0.95, 0.3, 0.0), (h - 0.4) * 5.0);
  else if (h < 0.8) col = mix(vec3(0.95, 0.3, 0.0), vec3(1.0, 0.8, 0.1), (h - 0.6) * 5.0);
  else col = mix(vec3(1.0, 0.8, 0.1), vec3(1.0), (h - 0.8) * 5.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 46. Portal rim event horizon
export const R2_PORTALRIM = withAngleSeamBlend(HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.2;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float ringR = 0.45;
  float dist = abs(r - ringR);
  float distort = sin(a * 16.0 + t * 3.0) * 0.01 + sin(a * 32.0 - t * 2.0) * 0.005;
  dist = abs(r - ringR - distort);
  float ring = smoothstep(0.04, 0.0, dist);
  // Inside dimmed
  float inside = smoothstep(ringR, ringR - 0.05, r);
  vec3 col = vec3(0.02, 0.0, 0.04) * inside;
  vec3 rim = palette(a * 0.5 + t * 0.2, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
  col += ring * rim;
  col += pow(ring, 4.0) * vec3(1.0);
  gl_FragColor = vec4(col, 1.0);
}
`);

// 47. Spore cloud release
export const R2_SPORE = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.3;
  vec3 col = vec3(0.05, 0.04, 0.08);
  for (int i = 0; i < 30; i++) {
    float fi = float(i);
    vec2 origin = vec2(0.0, -0.3);
    float life = mod(t * 0.3 + fi * 0.07, 1.5);
    vec2 vel = vec2(snoise(vec2(fi, 0.0)) * 0.5, 0.4 + fract(fi * 0.21) * 0.4);
    vec2 c = origin + vel * life + 0.05 * vec2(sin(t * 2.0 + fi), cos(t * 2.0 + fi));
    float d = length(uv - c);
    float fade = exp(-life * 1.0);
    float p = 0.0008 / (d * d + 0.001);
    col += p * vec3(0.7, 0.9, 0.5) * fade;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 48. Wireframe globe
export const R2_GLOBE = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.2;
  float r = length(uv);
  if (r > 0.6) { gl_FragColor = vec4(0.02, 0.03, 0.06, 1.0); return; }
  float z = sqrt(0.36 - r * r);
  vec3 sph = vec3(uv, z);
  // rotate Y
  float ca = cos(t), sa = sin(t);
  sph.xz = mat2(ca, -sa, sa, ca) * sph.xz;
  float lat = abs(fract(sph.y * 6.0) - 0.5);
  float lon = abs(fract(atan(sph.z, sph.x) / 6.28 * 12.0) - 0.5);
  float wire = smoothstep(0.04, 0.0, min(lat, lon));
  vec3 col = vec3(0.02, 0.04, 0.08);
  col += wire * vec3(0.4, 0.7, 1.0);
  col += pow(wire, 4.0) * vec3(0.7, 0.9, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 49. Quantum foam subatomic chaos
export const R2_QUANTUM = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.4;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    vec2 c = vec2(snoise(vec2(fi, floor(t * 4.0))) * 1.0,
                  snoise(vec2(fi, floor(t * 4.0 + 100.0))) * 0.6);
    float d = length(uv - c);
    float life = fract(t + fi * 0.13);
    float r = 0.02 + (1.0 - life) * 0.04;
    float blip = smoothstep(r, 0.0, d) * smoothstep(0.0, 0.2, life) * smoothstep(1.0, 0.6, life);
    vec3 hue = palette(fi * 0.13, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col += blip * hue * 0.5;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 50. Sunset cascade warm gradient flow
export const R2_SUNSETCASCADE = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  // Vertical gradient with warm bands
  float band = uv.y * 2.0 + sin(uv.x * 2.0 + t) * 0.1 + sin(uv.x * 5.0 - t * 1.5) * 0.05;
  vec3 deep = vec3(0.15, 0.05, 0.25);
  vec3 mid = vec3(0.95, 0.4, 0.3);
  vec3 hi = vec3(1.0, 0.85, 0.4);
  vec3 col;
  if (band < -0.2) col = mix(deep, mid, (band + 0.7) * 2.0);
  else col = mix(mid, hi, (band + 0.2) * 1.0);
  // Sun
  vec2 sc = vec2(sin(t * 0.3) * 0.3, -0.2 + sin(t * 0.4) * 0.05);
  float sd = length(uv - sc);
  col += smoothstep(0.18, 0.12, sd) * vec3(1.0, 0.95, 0.7);
  col += smoothstep(0.4, 0.0, sd) * vec3(0.4, 0.2, 0.1) * 0.3;
  gl_FragColor = vec4(col, 1.0);
}
`;
