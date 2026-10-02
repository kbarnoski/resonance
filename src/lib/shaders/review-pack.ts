// ─── Review pack — 30 candidate shaders for curation ───
//
// All under category "Review" so the user can preview each in The Room
// and tell me which to keep / kill / move into a permanent category.
// All use the standard uniform contract: u_time, u_resolution, u_bass,
// u_mid, u_treble, u_amplitude. Each shader is self-contained and
// compact — variety > polish at this stage.

import { U, SMOOTH_NOISE, VORONOI, ROT2, VISIONARY_PALETTE } from "./shared";

const HEAD = U + SMOOTH_NOISE + VORONOI + ROT2 + VISIONARY_PALETTE;

// 1. Soft drifting bokeh circles with depth-of-field blur
export const R_BOKEH = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.15;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    vec2 seed = vec2(fi * 13.7, fi * 7.3);
    vec2 c = vec2(snoise(seed) * 1.6, mod(snoise(seed.yx) * 0.6 + t * (0.04 + fract(fi * 0.13) * 0.08), 1.4) - 0.7);
    float r = 0.04 + fract(fi * 0.31) * 0.08;
    float depth = fract(fi * 0.21);
    float blur = mix(0.005, 0.05, depth);
    float d = length(uv - c);
    float circ = smoothstep(r + blur, r - blur, d);
    vec3 hue = palette(fract(fi * 0.17 + t * 0.3), vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col += circ * hue * (0.4 + depth * 0.6);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 2. Flowing chrome / liquid mercury surface
export const R_MERCURY = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.2;
  vec2 q = uv * 2.0;
  q += 0.4 * vec2(fbm(q + t), fbm(q - t * 0.7));
  float h = fbm(q * 2.0 + t * 0.3);
  float spec = pow(smoothstep(0.4, 0.7, h), 6.0);
  vec3 base = mix(vec3(0.05, 0.06, 0.08), vec3(0.45, 0.5, 0.6), h);
  vec3 col = base + spec * vec3(0.95, 0.92, 1.0);
  col += 0.15 * smoothstep(0.55, 0.9, h) * vec3(0.4, 0.6, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 3. Twisting plasma tendrils
export const R_TENDRILS = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.3;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 p = uv;
    p = rot2(t * 0.1 + fi * 1.04) * p;
    float wave = sin(p.x * 4.0 + t + fi) * 0.3;
    float d = abs(p.y - wave);
    float thick = 0.005 + 0.02 * sin(t * 0.5 + fi);
    float glow = thick / (d + 0.01);
    vec3 hue = palette(fi * 0.13 + t * 0.05, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.4, 0.7));
    col += glow * hue * 0.25;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 4. Stardust river streaming across the frame
export const R_STARDUST = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.4;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    float fi = float(i);
    float lane = (fract(fi * 0.13) - 0.5) * 1.4;
    float speed = 0.3 + fract(fi * 0.27) * 0.5;
    float x = mod(fi * 0.31 - t * speed, 2.4) - 1.2;
    float wob = sin(t + fi) * 0.05;
    vec2 c = vec2(x, lane + wob);
    float d = length(uv - c);
    float star = 0.003 / (d + 0.003);
    vec3 hue = palette(fract(fi * 0.07), vec3(0.6), vec3(0.4), vec3(1.0), vec3(0.0, 0.2, 0.5));
    col += star * hue * 0.6;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 5. Fire ember storm swirling upward
export const R_EMBERS = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.5;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float life = mod(t * (0.3 + fract(fi * 0.21)) + fi * 0.13, 1.5);
    float x = (fract(fi * 0.31) - 0.5) * 1.4 + sin(life * 6.0 + fi) * 0.08;
    float y = -0.7 + life * 1.2;
    vec2 c = vec2(x, y);
    float d = length(uv - c);
    float ember = 0.005 / (d + 0.004);
    float fade = 1.0 - smoothstep(0.6, 1.4, life);
    vec3 hue = mix(vec3(1.0, 0.4, 0.05), vec3(0.4, 0.05, 0.0), life * 0.7);
    col += ember * hue * fade;
  }
  col += 0.03 * vec3(0.2, 0.05, 0.0); // ember glow background
  gl_FragColor = vec4(col, 1.0);
}
`;

// 6. Kaleidoscopic mandala
export const R_KALEIDO = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  uv = rot2(t * 0.3) * uv;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float seg = 8.0;
  a = mod(a, 6.28318 / seg);
  a = abs(a - 3.14159 / seg);
  vec2 p = vec2(cos(a), sin(a)) * r;
  float n = fbm(p * 4.0 + t);
  vec3 col = palette(n + t * 0.1, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.2, 0.5, 0.8));
  col *= 0.6 + 0.4 * sin(r * 18.0 - t * 4.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 7. Pulsing TRON-style grid
export const R_GRID_PULSE = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.5;
  uv *= 6.0;
  vec2 g = abs(fract(uv) - 0.5);
  float line = smoothstep(0.45, 0.5, max(g.x, g.y));
  // distance from origin in grid space
  float d = length(uv) * 0.1;
  float pulse = sin(d * 6.0 - t * 3.0) * 0.5 + 0.5;
  vec3 col = mix(vec3(0.02, 0.05, 0.1), vec3(0.2, 0.7, 1.0), line * pulse);
  col += 0.3 * line * pulse * pulse;
  gl_FragColor = vec4(col, 1.0);
}
`;

// 8. Black hole accretion disk
export const R_BLACKHOLE = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.4;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float event = smoothstep(0.18, 0.16, r);
  float disk = smoothstep(0.7, 0.2, r) * smoothstep(0.18, 0.22, r);
  float swirl = sin(a * 6.0 - t * 4.0 + r * 12.0);
  float n = fbm(vec2(a * 3.0, r * 5.0) + t);
  vec3 hot = vec3(1.0, 0.6, 0.2);
  vec3 cool = vec3(0.4, 0.05, 0.6);
  vec3 col = mix(cool, hot, n * 0.5 + 0.5 + swirl * 0.2) * disk;
  col -= event * col;
  gl_FragColor = vec4(col, 1.0);
}
`;

// 9. Soap bubble iridescence
export const R_SOAP = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.2;
  vec2 q = uv;
  q += 0.3 * vec2(fbm(q * 2.0 + t), fbm(q * 2.0 - t));
  float h = fbm(q * 3.0);
  vec3 col = palette(h * 4.0 + t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
  float fres = pow(1.0 - length(uv) * 0.6, 2.5);
  col *= fres;
  col += 0.2 * smoothstep(0.6, 0.9, fres);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 10. Fractal lightning bolt
export const R_BOLT = HEAD + `
float bolt(vec2 uv, float t, float seed) {
  float d = 1e9;
  vec2 p = vec2(0.0, 0.9);
  for (int i = 0; i < 20; i++) {
    vec2 next = p + vec2((snoise(vec2(p.y * 5.0 + seed, t * 0.3)) - 0.0) * 0.15, -0.1);
    vec2 ab = next - p;
    vec2 pa = uv - p;
    float h = clamp(dot(pa, ab) / dot(ab, ab), 0.0, 1.0);
    d = min(d, length(pa - ab * h));
    p = next;
  }
  return d;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.6;
  float strike = pow(0.5 + 0.5 * sin(t * 0.4), 8.0);
  float d = bolt(uv, t, 1.0);
  float core = smoothstep(0.02, 0.0, d);
  float glow = 0.008 / (d + 0.008);
  vec3 col = vec3(0.6, 0.8, 1.0) * (core + glow * 0.5) * (0.3 + strike);
  col += vec3(0.05, 0.05, 0.15) * (1.0 - smoothstep(0.0, 0.5, length(uv)));
  gl_FragColor = vec4(col, 1.0);
}
`;

// 11. Frost crystal growth pattern
export const R_FROSTGROW = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.05;
  vec3 v = voronoi(uv * 6.0 + t);
  float edge = smoothstep(0.04, 0.0, abs(v.x - v.y));
  float n = fbm(uv * 8.0 + t);
  vec3 col = vec3(0.7, 0.85, 1.0) * edge;
  col += vec3(0.3, 0.5, 0.8) * (1.0 - v.x) * 0.3 * n;
  col += vec3(0.05, 0.1, 0.2);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 12. Molten gold flow
export const R_MOLTEN = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.25;
  vec2 q = uv * 1.6;
  q += 0.5 * vec2(fbm(q + t), fbm(q - t * 0.8));
  float h = fbm(q * 2.0 + t);
  vec3 dark = vec3(0.4, 0.2, 0.0);
  vec3 hot = vec3(1.0, 0.85, 0.3);
  vec3 col = mix(dark, hot, smoothstep(0.0, 0.7, h));
  col += pow(smoothstep(0.5, 0.85, h), 4.0) * vec3(1.0, 0.95, 0.6);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 13. Smoke rings rising
export const R_SMOKERINGS = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.3;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float life = mod(t * 0.4 + fi * 0.2, 1.0);
    vec2 c = vec2(sin(t + fi) * 0.1, -0.5 + life * 1.2);
    float r = 0.05 + life * 0.5;
    float d = abs(length(uv - c) - r);
    float ring = 0.02 / (d + 0.02) * (1.0 - life);
    col += ring * vec3(0.6, 0.65, 0.75);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 14. Circuit board flowing current
export const R_CIRCUIT = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.5;
  uv *= 8.0;
  vec2 ic = floor(uv);
  vec2 fc = fract(uv) - 0.5;
  float seed = fract(sin(dot(ic, vec2(127.1, 311.7))) * 43758.5);
  vec2 dir = seed < 0.5 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  float wire = abs(dot(fc, dir.yx)) ; // perpendicular axis = trace
  float trace = smoothstep(0.04, 0.0, wire);
  float pulse = sin(dot(fc, dir) * 6.0 - t * 6.0 - seed * 31.0);
  vec3 col = mix(vec3(0.02, 0.06, 0.1), vec3(0.2, 0.9, 0.7), trace * (0.4 + 0.6 * pulse));
  col += trace * pow(0.5 + 0.5 * pulse, 8.0) * vec3(0.5, 1.0, 0.8);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 15. Falling cherry blossom petals
// Pure-black base (2026-10-01): Ghost's ending shader — any lifted base
// shows through the image layers as a grey wash ("removes detail").
export const R_PETALS = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.3;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    float speed = 0.2 + fract(fi * 0.27) * 0.3;
    float x = (fract(fi * 0.31) - 0.5) * 1.6 + sin(t * 2.0 + fi) * 0.15;
    float y = mod(0.7 - t * speed - fi * 0.13, 1.5) - 0.7;
    vec2 c = vec2(x, y);
    vec2 d = uv - c;
    d = rot2(t * 2.0 + fi) * d;
    float petal = smoothstep(0.025, 0.0, abs(d.x) + abs(d.y) * 0.7);
    vec3 pink = mix(vec3(1.0, 0.7, 0.85), vec3(1.0, 0.55, 0.7), fract(fi * 0.17));
    col += petal * pink * 0.6;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 16. Matrix-style code rain
export const R_CODEFALL = HEAD + `
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time * 1.5;
  vec2 g = vec2(uv.x * 60.0, uv.y * 30.0);
  vec2 ig = floor(g);
  float col_seed = fract(sin(ig.x * 12.7) * 43.0);
  float speed = 0.5 + col_seed * 0.5;
  float head = fract(t * speed - col_seed * 7.0);
  float dist = head - uv.y;
  if (dist < 0.0) dist += 1.0;
  float bright = pow(1.0 - dist, 4.0);
  float glyph = step(0.5, fract(sin(dot(ig, vec2(31.7, 19.3)) + floor(t * 8.0)) * 99.0));
  vec3 col = vec3(0.1, 1.0, 0.3) * bright * glyph;
  col += vec3(0.7, 1.0, 0.7) * pow(1.0 - dist, 32.0) * glyph;
  gl_FragColor = vec4(col, 1.0);
}
`;

// 17. Underwater caustics
export const R_CAUSTICS = HEAD + `
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.y;
  float t = u_time * 0.4;
  vec2 p = uv * 4.0;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    p += vec2(fbm(p + t * 0.3), fbm(p - t * 0.4));
    col += 0.05 / abs(0.4 - length(fract(p) - 0.5));
  }
  col *= vec3(0.05, 0.18, 0.35);
  col += vec3(0.02, 0.07, 0.15);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 18. Organic tendril growth
export const R_GROWTH = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.15;
  float branch = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 p = uv;
    p = rot2(fi * 1.25 + t * 0.2) * p;
    p.y *= 1.4;
    float wave = sin(p.x * 6.0 + t + fi) * 0.08 + sin(p.x * 17.0 + t * 0.7) * 0.02;
    float d = abs(p.y - wave);
    branch += smoothstep(0.012, 0.0, d) * smoothstep(0.7, 0.0, abs(p.x));
  }
  vec3 col = mix(vec3(0.02, 0.05, 0.03), vec3(0.4, 0.9, 0.5), branch);
  col += branch * vec3(0.2, 0.5, 0.3);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 19. Refracting glass shards
export const R_SHARDS = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  vec3 v = voronoi(uv * 4.0 + t);
  float cell = v.x;
  float edge = smoothstep(0.04, 0.0, abs(v.x - v.y));
  vec3 base = palette(cell * 2.0 + t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.1, 0.3, 0.6));
  vec3 col = base * (0.4 + 0.6 * (1.0 - cell));
  col += edge * vec3(0.95, 0.97, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 20. Floating dust motes in shaft of light
export const R_MOTES = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.05;
  float shaft = smoothstep(0.5, 0.0, abs(uv.x + uv.y * 0.4));
  vec3 col = shaft * vec3(0.3, 0.25, 0.18) * 0.4;
  for (int i = 0; i < 60; i++) {
    float fi = float(i);
    vec2 c = vec2(snoise(vec2(fi, 0.0)) * 1.4, snoise(vec2(0.0, fi)) * 0.9);
    c += 0.05 * vec2(sin(t + fi), cos(t + fi * 1.3));
    float d = length(uv - c);
    float mote = 0.0008 / (d * d + 0.0008);
    col += mote * vec3(1.0, 0.95, 0.8) * shaft * 0.8;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 21. Sea glass / translucent rounded shapes
export const R_SEAGLASS = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.08;
  vec3 v = voronoi(uv * 3.5 + t);
  float cell = smoothstep(0.5, 0.0, v.x);
  vec3 hue = palette(v.y * 1.5 + t, vec3(0.4, 0.5, 0.5), vec3(0.3, 0.4, 0.4), vec3(1.0), vec3(0.1, 0.4, 0.6));
  vec3 col = hue * cell;
  col += pow(cell, 6.0) * vec3(0.9);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 22. Twinkling firefly meadow
export const R_FIREFLIES = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.3;
  vec3 col = vec3(0.02, 0.05, 0.04);
  for (int i = 0; i < 35; i++) {
    float fi = float(i);
    vec2 c = vec2(snoise(vec2(fi, 0.0)) * 1.6, snoise(vec2(0.0, fi)) * 0.9);
    c += 0.03 * vec2(sin(t * 1.5 + fi), cos(t * 1.3 + fi * 0.7));
    float d = length(uv - c);
    float twinkle = 0.5 + 0.5 * sin(t * 3.0 + fi * 2.1);
    twinkle = pow(twinkle, 4.0);
    float glow = 0.001 / (d * d + 0.0008);
    col += glow * vec3(0.9, 1.0, 0.5) * twinkle;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 23. Flowing silk threads
export const R_SILK = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.2;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float yOff = (fi / 15.0 - 0.5) * 1.2;
    float wave = sin(uv.x * 3.0 + t + fi * 0.4) * 0.08 + sin(uv.x * 7.0 - t * 0.6 + fi) * 0.03;
    float d = abs(uv.y - yOff - wave);
    float thread = 0.003 / (d + 0.003);
    vec3 hue = palette(fi * 0.07 + t * 0.05, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.3, 0.6));
    col += thread * hue * 0.3;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 24. Ink drops dispersing
export const R_INKDROPS = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.3;
  vec3 col = vec3(0.95, 0.94, 0.92);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float life = mod(t * 0.3 + fi * 0.18, 1.0);
    vec2 c = vec2(sin(fi * 1.3) * 0.7, cos(fi * 0.8) * 0.4);
    float r = life * 0.6;
    vec2 d = uv - c;
    d += 0.05 * vec2(fbm(d * 3.0 + t), fbm(d * 3.0 - t));
    float blot = smoothstep(r, r - 0.05, length(d)) * (1.0 - life);
    vec3 ink = palette(fi * 0.13, vec3(0.2), vec3(0.2), vec3(1.0), vec3(0.0, 0.4, 0.7));
    col = mix(col, ink, blot);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 25. Falling paper confetti
export const R_CONFETTI = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.4;
  vec3 col = vec3(0.04, 0.04, 0.06);
  for (int i = 0; i < 70; i++) {
    float fi = float(i);
    float speed = 0.2 + fract(fi * 0.31) * 0.4;
    float x = (fract(fi * 0.13) - 0.5) * 1.6 + sin(t + fi * 0.5) * 0.1;
    float y = mod(0.8 - t * speed - fi * 0.07, 1.6) - 0.8;
    vec2 c = vec2(x, y);
    vec2 d = uv - c;
    d = rot2(t * 4.0 + fi) * d;
    float rect = step(abs(d.x), 0.012) * step(abs(d.y), 0.025);
    vec3 hue = palette(fract(fi * 0.21), vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col += rect * hue;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 26. Bioluminescent deep-sea glow
export const R_BIOGLOW = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.15;
  vec3 col = vec3(0.0, 0.01, 0.04);
  for (int i = 0; i < 25; i++) {
    float fi = float(i);
    vec2 c = vec2(snoise(vec2(fi, 0.0)) * 1.6, snoise(vec2(0.0, fi)) * 0.9);
    c += 0.04 * vec2(sin(t + fi * 0.7), cos(t * 1.3 + fi));
    float d = length(uv - c);
    float pulse = 0.5 + 0.5 * sin(t * 0.7 + fi * 1.7);
    float glow = 0.005 / (d + 0.005);
    vec3 hue = mix(vec3(0.0, 0.7, 1.0), vec3(0.0, 1.0, 0.5), fract(fi * 0.3));
    col += glow * hue * pulse * 0.4;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 27. Stained glass voronoi
export const R_STAINED = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.05;
  vec3 v = voronoi(uv * 3.0 + t);
  float lead = smoothstep(0.05, 0.0, abs(v.x - v.y));
  float cell = v.x;
  vec3 hue = palette(cell * 3.0 + sin(v.y * 4.0), vec3(0.4), vec3(0.4), vec3(1.0), vec3(0.0, 0.33, 0.67));
  vec3 col = hue * (0.5 + 0.5 * (1.0 - cell));
  col *= 1.0 - lead;
  col += lead * vec3(0.1, 0.08, 0.05);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 28. Floating pollen cloud
export const R_POLLEN = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.1;
  vec3 col = vec3(0.95, 0.85, 0.6) * 0.05;
  for (int i = 0; i < 80; i++) {
    float fi = float(i);
    vec2 c = vec2(snoise(vec2(fi, 0.0)) * 1.6, snoise(vec2(0.0, fi)) * 0.9);
    c += 0.06 * vec2(sin(t + fi), cos(t * 1.2 + fi * 0.8));
    float d = length(uv - c);
    float p = 0.0006 / (d * d + 0.0006);
    col += p * vec3(1.0, 0.85, 0.4) * 0.5;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// 29. Liquid metal droplets
export const R_DROPLETS = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.2;
  float field = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(t + fi * 1.2) * 0.5, cos(t * 0.8 + fi * 0.7) * 0.4);
    float d = length(uv - c);
    field += 0.06 / d;
  }
  float blob = smoothstep(1.5, 2.5, field);
  float edge = smoothstep(2.5, 3.0, field);
  vec3 col = mix(vec3(0.05, 0.06, 0.1), vec3(0.7, 0.75, 0.85), blob);
  col += edge * vec3(0.95);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 30. Light through prism — chromatic dispersion
export const R_PRISM = HEAD + `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.15;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float hue = fi / 6.0;
    float yOff = (hue - 0.5) * 0.4;
    float angle = t * 0.2 + sin(t * 0.7) * 0.05;
    vec2 p = rot2(angle) * uv;
    float wave = sin(p.x * 5.0 + t + fi * 0.4) * 0.04;
    float d = abs(p.y - yOff - wave);
    float beam = 0.005 / (d + 0.006);
    vec3 c = palette(hue, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col += beam * c * 0.3;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;
