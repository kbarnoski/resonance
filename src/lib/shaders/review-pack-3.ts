// ─── Review pack #3 — 100 candidate shaders ───
//
// Aesthetic-tuned to user's revealed preferences from packs 1 & 2:
//   keep: smooth wisps, plasma flows, organic alive forms, magical
//         glows, mercury/liquid metal, twisting tendrils
//   skip: hard geometric tiles, discrete particle clouds, decorative
//         motifs, glitch/cyberpunk
//
// All under category "Review" until you triage.

import { U, SMOOTH_NOISE, VORONOI, ROT2, VISIONARY_PALETTE } from "./shared";

const HEAD = U + SMOOTH_NOISE + VORONOI + ROT2 + VISIONARY_PALETTE;

// Helper main wrapper to cut boilerplate
function mk(body: string): string {
  return HEAD + `\nvoid main() {\n  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;\n  float t = u_time;\n  vec3 col = vec3(0.0);\n` + body + `\n  gl_FragColor = vec4(col, 1.0);\n}\n`;
}

// ─── 1-15: Flowing wisps / smoky veils ───

export const R3_VEILFLOW = mk(`
  vec2 q = uv * 1.6;
  q += 0.5 * vec2(fbm(q + t * 0.1), fbm(q - t * 0.1));
  float n = fbm(q * 2.0 + t * 0.05);
  col = palette(n + t * 0.02, vec3(0.4), vec3(0.5), vec3(1.0), vec3(0.0, 0.3, 0.7)) * smoothstep(0.0, 0.7, n);
`);

export const R3_MISTSPIRALS = mk(`
  vec2 q = uv;
  for (int i = 0; i < 4; i++) {
    q = rot2(t * 0.05) * q + 0.05 * vec2(fbm(q * 3.0 + t * 0.1), fbm(q * 3.0 - t * 0.1));
  }
  float h = fbm(q * 1.5);
  col = palette(h + t * 0.03, vec3(0.4), vec3(0.4), vec3(1.0), vec3(0.1, 0.4, 0.7)) * smoothstep(0.1, 0.8, h);
`);

export const R3_SPIRITTRAILS = mk(`
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 p = rot2(fi * 1.04 + t * 0.05) * uv;
    float wave = sin(p.x * 1.5 + t * 0.3 + fi) * 0.2;
    float d = abs(p.y - wave);
    col += (0.005 / (d + 0.008)) * palette(fi * 0.17 + t * 0.05, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.3, 0.7)) * 0.4;
  }
`);

export const R3_GHOSTRIBBONS = mk(`
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 p = uv + 0.1 * vec2(fbm(uv * 2.0 + t * 0.2 + fi), fbm(uv * 2.0 - t * 0.15 + fi));
    float wave = sin(p.x * 2.0 + t * 0.4 + fi * 1.2) * 0.18;
    float d = abs(p.y - wave) - 0.005 * fract(fi * 0.31 + t * 0.1);
    col += (0.004 / (d + 0.007)) * mix(vec3(0.7, 0.85, 1.0), vec3(0.85, 0.7, 1.0), fract(fi * 0.21)) * 0.5;
  }
`);

export const R3_ETHERCURRENTS = mk(`
  vec2 q = uv * 1.4;
  q += vec2(fbm(q * 1.5 + t * 0.05), fbm(q * 1.5 - t * 0.05)) * 0.4;
  q += vec2(fbm(q * 4.0 + t * 0.03), fbm(q * 4.0 - t * 0.03)) * 0.1;
  float n = fbm(q * 0.8);
  col = mix(vec3(0.05, 0.1, 0.2), vec3(0.6, 0.85, 1.0), smoothstep(0.2, 0.8, n));
`);

export const R3_SILKWIND = mk(`
  for (int i = 0; i < 25; i++) {
    float fi = float(i);
    float yOff = (fi / 24.0 - 0.5) * 1.4;
    float wob = sin(uv.x * 1.8 + t * 0.3 + fi * 0.4) * 0.06 + sin(uv.x * 5.0 - t * 0.2 + fi) * 0.02;
    float d = abs(uv.y - yOff - wob);
    col += (0.0015 / (d + 0.002)) * palette(fi * 0.05 + t * 0.02, vec3(0.5), vec3(0.4), vec3(1.0), vec3(0.0, 0.3, 0.6)) * 0.25;
  }
`);

export const R3_PLASMAVEIL = mk(`
  vec2 q = uv * 1.5;
  q += vec2(fbm(q + t * 0.1), fbm(q - t * 0.1)) * 0.6;
  float h = fbm(q * 2.0);
  vec3 deep = vec3(0.2, 0.05, 0.4);
  vec3 hot = vec3(1.0, 0.4, 0.7);
  col = mix(deep, hot, smoothstep(0.2, 0.8, h));
  col += pow(smoothstep(0.6, 0.9, h), 4.0) * vec3(1.0, 0.85, 1.0) * 0.3;
`);

export const R3_AURORAMIST = mk(`
  vec2 q = vec2(uv.x, uv.y - 0.2);
  float wave = sin(q.x * 2.0 + t * 0.2) * 0.1 + sin(q.x * 4.0 - t * 0.3) * 0.05;
  float band = exp(-pow((q.y - wave) * 5.0, 2.0));
  float n = fbm(q * 3.0 + t * 0.15);
  vec3 green = vec3(0.2, 0.85, 0.5);
  vec3 magenta = vec3(0.9, 0.4, 0.85);
  col = mix(green, magenta, n) * band;
  col += smoothstep(-0.5, -0.95, q.y) * vec3(0.05, 0.1, 0.15);
`);

export const R3_DREAMTENDRILS = mk(`
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 p = rot2(fi * 0.78 + t * 0.04) * uv;
    p.x += sin(p.y * 3.0 + t * 0.3 + fi) * 0.1;
    float thick = 0.008 + 0.005 * sin(p.y * 4.0 + t * 0.4 + fi);
    float d = abs(p.x);
    col += (thick / (d + 0.012)) * palette(fi * 0.13 + t * 0.04, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.3, 0.6)) * 0.3;
  }
`);

export const R3_EMBERWISPS = mk(`
  vec2 q = uv;
  q.y += 0.1 * fbm(q * 4.0 + t * 0.2);
  float n = fbm(q * 1.5 + vec2(0.0, t * 0.3));
  vec3 dark = vec3(0.05, 0.0, 0.0);
  vec3 hot = vec3(1.0, 0.4, 0.05);
  col = mix(dark, hot, smoothstep(0.2, 0.8, n));
  col += pow(smoothstep(0.5, 0.85, n), 6.0) * vec3(1.0, 0.85, 0.4);
  col *= smoothstep(-0.7, 0.0, uv.y + n * 0.3);
`);

export const R3_SHADOWFLOW = mk(`
  vec2 q = uv * 1.3;
  q += vec2(fbm(q + t * 0.05), fbm(q - t * 0.05)) * 0.5;
  float h = fbm(q * 1.8);
  col = vec3(0.05, 0.04, 0.08) + (1.0 - h) * vec3(0.15, 0.2, 0.3);
  col += pow(1.0 - h, 6.0) * vec3(0.5, 0.6, 0.8) * 0.2;
`);

export const R3_LIGHTRIVERS = mk(`
  vec2 q = vec2(uv.x + t * 0.1, uv.y);
  q.y += 0.15 * fbm(q * 3.0 - t * 0.2);
  float bands = abs(sin(q.y * 6.0));
  bands = smoothstep(0.7, 1.0, bands);
  vec3 hue = palette(q.y * 0.5 + t * 0.05, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
  col = bands * hue * 0.7;
  col += smoothstep(0.85, 1.0, bands) * vec3(1.0) * 0.4;
`);

export const R3_BIOTRAIL = mk(`
  for (int i = 0; i < 30; i++) {
    float fi = float(i);
    vec2 origin = vec2(snoise(vec2(fi, 0.0)) * 1.4, snoise(vec2(0.0, fi)) * 0.8);
    vec2 vel = vec2(cos(fi * 1.3), sin(fi * 1.7)) * 0.06;
    float life = fract(t * 0.15 + fi * 0.1);
    vec2 c = origin + vel * life * 4.0;
    float d = length(uv - c);
    float fade = 1.0 - life;
    col += (0.001 / (d * d + 0.001)) * vec3(0.2, 0.9, 0.7) * fade * 0.6;
  }
`);

export const R3_AURORASTREAMS = mk(`
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float yOff = (fi / 4.0 - 0.5) * 1.0;
    vec2 q = uv;
    q.y -= yOff;
    q.y -= sin(q.x * 1.5 + t * 0.2 + fi * 1.04) * 0.1;
    q.y -= 0.05 * fbm(q * 4.0 + t * 0.2 + fi);
    float band = exp(-pow(q.y * 7.0, 2.0));
    vec3 hue = palette(fi * 0.27 + t * 0.05, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col += band * hue * 0.5;
  }
`);

export const R3_WAVEVEIL = mk(`
  vec2 q = uv;
  q.y += 0.1 * sin(q.x * 3.0 + t * 0.3) + 0.05 * sin(q.x * 6.0 - t * 0.4);
  float n = fbm(q * 2.5 + t * 0.05);
  vec3 cool = vec3(0.1, 0.4, 0.6);
  vec3 light = vec3(0.6, 0.85, 1.0);
  col = mix(cool, light, smoothstep(0.3, 0.8, n));
  col *= smoothstep(0.6, -0.4, abs(q.y));
`);

// ─── 16-27: Liquid forms ───

export const R3_MERCURYPOOL = mk(`
  vec2 q = uv;
  q += 0.3 * vec2(fbm(q * 2.0 + t * 0.1), fbm(q * 2.0 - t * 0.1));
  float h = fbm(q * 3.0);
  vec3 dark = vec3(0.05, 0.06, 0.1);
  vec3 silver = vec3(0.7, 0.75, 0.85);
  col = mix(dark, silver, smoothstep(0.3, 0.7, h));
  col += pow(smoothstep(0.55, 0.85, h), 6.0) * vec3(1.0);
`);

export const R3_MOLTENGLASS = mk(`
  vec2 q = uv * 1.5;
  q += 0.4 * vec2(fbm(q + t * 0.1), fbm(q - t * 0.1));
  float h = fbm(q * 2.0);
  col = palette(h * 0.5 + t * 0.03, vec3(0.4, 0.3, 0.3), vec3(0.4, 0.3, 0.3), vec3(1.0), vec3(0.1, 0.3, 0.5));
  col *= 0.4 + 0.6 * h;
  col += pow(smoothstep(0.6, 0.9, h), 8.0) * vec3(1.0, 0.95, 0.85);
`);

export const R3_LIQUIDPEARL = mk(`
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(t * 0.2 + fi * 1.2) * 0.5, cos(t * 0.15 + fi * 0.8) * 0.4);
    float r = 0.15 + fract(fi * 0.31) * 0.05;
    vec2 d = uv - c;
    float dist = length(d);
    float orb = smoothstep(r, r * 0.7, dist);
    vec3 hue = palette(fi * 0.18, vec3(0.5), vec3(0.4), vec3(1.0), vec3(0.0, 0.33, 0.67)) * 0.8 + vec3(0.2);
    col = mix(col, hue, orb);
    col += pow(smoothstep(r * 0.5, 0.0, dist), 2.0) * vec3(1.0) * 0.5 * orb;
  }
`);

export const R3_HONEYDRIP = mk(`
  vec2 q = uv;
  q.y += t * 0.05;
  float h = fbm(q * 2.5);
  h += 0.3 * fbm(q * 6.0 - vec2(0.0, t * 0.1));
  vec3 amber = vec3(0.85, 0.6, 0.15);
  vec3 deep = vec3(0.4, 0.2, 0.05);
  col = mix(deep, amber, smoothstep(0.2, 0.7, h));
  col += pow(smoothstep(0.55, 0.85, h), 6.0) * vec3(1.0, 0.85, 0.5);
`);

export const R3_WAXFLOW = mk(`
  vec2 q = uv;
  q.y += t * 0.05;
  q += 0.15 * vec2(fbm(q * 4.0), fbm(q * 4.0 + 7.0));
  float h = fbm(q * 1.5);
  vec3 cream = vec3(0.92, 0.88, 0.78);
  vec3 amber = vec3(0.7, 0.45, 0.2);
  col = mix(amber, cream, smoothstep(0.3, 0.8, h));
  col += pow(smoothstep(0.6, 0.85, h), 4.0) * vec3(1.0, 0.95, 0.85);
`);

export const R3_MELTEDGOLD = mk(`
  vec2 q = uv * 1.6;
  q += 0.5 * vec2(fbm(q + t * 0.08), fbm(q - t * 0.08));
  float h = fbm(q * 2.0);
  vec3 deep = vec3(0.4, 0.25, 0.0);
  vec3 gold = vec3(1.0, 0.85, 0.3);
  col = mix(deep, gold, smoothstep(0.2, 0.7, h));
  col += pow(smoothstep(0.55, 0.85, h), 6.0) * vec3(1.0, 0.95, 0.6);
`);

export const R3_LAVACRUST = mk(`
  vec3 v = voronoi(uv * 6.0 + t * 0.05);
  float crack = smoothstep(0.05, 0.0, abs(v.x - v.y));
  float crust = 1.0 - smoothstep(0.0, 0.5, v.x);
  col = vec3(0.04, 0.02, 0.01) + crust * vec3(0.15, 0.06, 0.02);
  col += crack * vec3(1.0, 0.4, 0.05);
  col += pow(crack, 4.0) * vec3(1.0, 0.85, 0.4);
`);

export const R3_BOILINGCREAM = mk(`
  vec2 q = uv * 3.0;
  q += vec2(fbm(q + t * 0.4), fbm(q - t * 0.4)) * 0.3;
  float h = fbm(q * 2.0 + t * 0.2);
  vec3 c1 = vec3(0.95, 0.92, 0.85);
  vec3 c2 = vec3(0.85, 0.75, 0.6);
  col = mix(c2, c1, smoothstep(0.2, 0.8, h));
  col += pow(smoothstep(0.7, 0.9, h), 4.0) * vec3(1.0);
`);

export const R3_INKPOOL = mk(`
  vec2 q = uv;
  q += 0.25 * vec2(fbm(q * 2.5 + t * 0.05), fbm(q * 2.5 - t * 0.05));
  float h = fbm(q * 1.8);
  col = mix(vec3(0.0, 0.0, 0.05), vec3(0.05, 0.1, 0.3), smoothstep(0.3, 0.7, h));
  col += pow(smoothstep(0.55, 0.85, h), 8.0) * vec3(0.5, 0.6, 1.0) * 0.3;
`);

export const R3_TARBUBBLES = mk(`
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float life = mod(t * 0.2 + fi * 0.13, 1.0);
    vec2 c = vec2(snoise(vec2(fi, 0.0)) * 0.9, -0.5 + life * 1.2);
    float r = 0.04 + life * 0.06;
    float d = length(uv - c);
    col = mix(col, vec3(0.04, 0.03, 0.06), smoothstep(r, 0.0, d));
    col += pow(smoothstep(r * 0.5, 0.0, d), 3.0) * vec3(0.5, 0.55, 0.7) * (1.0 - life) * 0.3;
  }
  col += vec3(0.05, 0.04, 0.07);
`);

export const R3_GALAXYFLUID = mk(`
  vec2 q = uv * 1.5;
  q = rot2(t * 0.05) * q;
  q += 0.4 * vec2(fbm(q + t * 0.05), fbm(q - t * 0.05));
  float h = fbm(q * 1.5);
  vec3 deep = vec3(0.05, 0.0, 0.15);
  vec3 mid = vec3(0.4, 0.1, 0.5);
  vec3 hot = vec3(1.0, 0.7, 0.4);
  col = mix(deep, mid, smoothstep(0.2, 0.6, h));
  col = mix(col, hot, smoothstep(0.7, 0.9, h));
  col += pow(snoise(uv * 80.0), 80.0) * vec3(1.0);
`);

export const R3_PLASMAOCEAN = mk(`
  vec2 q = uv * 1.4;
  q += 0.5 * vec2(fbm(q + t * 0.2), fbm(q - t * 0.2));
  q += 0.15 * vec2(fbm(q * 4.0 + t), fbm(q * 4.0 - t));
  float h = fbm(q * 1.0);
  vec3 cool = vec3(0.0, 0.2, 0.5);
  vec3 hot = vec3(0.9, 0.3, 0.7);
  col = mix(cool, hot, h);
  col += pow(smoothstep(0.55, 0.85, h), 4.0) * vec3(1.0, 0.85, 0.95);
`);

// ─── 28-37: Energy / plasma ───

export const R3_PLASMASTORM = mk(`
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 q = rot2(fi * 1.25 + t * 0.1) * uv;
    q.x += sin(q.y * 4.0 + t * 0.5 + fi) * 0.1;
    float d = abs(q.x);
    col += (0.005 / (d + 0.008)) * mix(vec3(0.4, 0.2, 0.9), vec3(0.95, 0.4, 0.85), fract(fi * 0.21 + t * 0.1)) * 0.4;
  }
  col += smoothstep(1.0, 0.0, length(uv)) * vec3(0.05, 0.0, 0.1);
`);

export const R3_LIGHTNINGVEIL = mk(`
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 q = uv;
    q.x += sin(q.y * 8.0 + fi * 1.04) * 0.1;
    float seg = floor(q.y * 6.0 + fi);
    float jitter = fract(sin(seg * 12.7 + fi * 31.0) * 43.0);
    q.x += (jitter - 0.5) * 0.15;
    float d = abs(q.x);
    float strike = pow(0.5 + 0.5 * sin(t * 1.0 + fi * 2.0), 16.0);
    col += (0.003 / (d + 0.005)) * vec3(0.7, 0.85, 1.0) * (0.2 + strike);
  }
`);

export const R3_CORONASTREAMS = mk(`
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float n = fbm(vec2(a * 4.0, r * 6.0) + t * 0.2);
  // Angle seam (atan cut on the left half of the centre line): n is not
  // 2π-periodic, so just below the cut fade it to the value above the cut
  // (a + 2π). Rays stay crisp (integer frequency); identical elsewhere.
  float seamW = smoothstep(2.35619449, 3.14159265, -a);
  if (seamW > 0.0) n = mix(n, fbm(vec2((a + 6.28318531) * 4.0, r * 6.0) + t * 0.2), seamW);
  float rays = sin(a * 30.0 + n * 4.0);
  rays = smoothstep(0.0, 0.95, rays);
  float falloff = exp(-r * 1.8);
  col = vec3(1.0, 0.7, 0.3) * rays * falloff * 0.7;
  col += exp(-r * 5.0) * vec3(1.0, 0.9, 0.6);
`);

export const R3_SOLARWIND = mk(`
  vec2 q = vec2(uv.x + t * 0.2, uv.y);
  q.y += 0.1 * fbm(q * 3.0 - t * 0.1);
  float n = fbm(q * 2.0);
  vec3 cool = vec3(0.0, 0.2, 0.5);
  vec3 warm = vec3(1.0, 0.5, 0.2);
  col = mix(cool, warm, smoothstep(0.2, 0.8, n));
  col *= smoothstep(0.6, 0.0, abs(q.y));
`);

export const R3_STELLARRIBBON = mk(`
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 q = uv;
    q = rot2(fi * 0.3 + t * 0.05) * q;
    float wave = sin(q.x * 1.2 + t * 0.2 + fi) * 0.2;
    float thick = 0.04 * (0.7 + 0.3 * sin(q.x * 3.0 + t * 0.3 + fi));
    float d = abs(q.y - wave);
    col += smoothstep(thick, 0.0, d) * palette(fi * 0.27 + t * 0.05, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67)) * 0.7;
  }
`);

export const R3_MAGNETICWISPS = mk(`
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float curve = (fi / 11.0 - 0.5) * 1.6;
    vec2 c = vec2(0.0, -curve * 0.4);
    float r = 0.3 + abs(curve) * 0.5;
    float d = abs(length(uv - c) - r);
    float a = atan(uv.y - c.y, uv.x - c.x);
    float anim = sin(a * 3.0 - t * 0.5 + fi);
    col += (0.002 / (d + 0.005)) * mix(vec3(0.5, 0.7, 1.0), vec3(1.0, 0.6, 0.8), 0.5 + 0.5 * anim) * 0.4;
  }
`);

export const R3_IONTRAILS = mk(`
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    float speed = 0.2 + fract(fi * 0.27) * 0.3;
    float x = mod(fi * 0.21 - t * speed, 2.4) - 1.2;
    float y = (fract(fi * 0.13) - 0.5) * 1.2 + sin(t * 0.3 + fi) * 0.1;
    float trail = smoothstep(-1.2, x, uv.x) * (1.0 - step(x, uv.x));
    float thick = 0.005 + 0.008 * trail;
    float d = abs(uv.y - y);
    col += (thick / (d + 0.005)) * mix(vec3(0.5, 0.8, 1.0), vec3(0.9, 0.5, 1.0), fract(fi * 0.21)) * 0.3;
  }
`);

export const R3_ARCDISCHARGE = mk(`
  for (int b = 0; b < 3; b++) {
    float fb = float(b);
    vec2 from = vec2(-0.7, sin(t * 0.5 + fb * 1.5) * 0.4);
    vec2 to = vec2(0.7, sin(t * 0.4 + fb * 1.3) * 0.4);
    vec2 dir = normalize(to - from);
    vec2 perp = vec2(-dir.y, dir.x);
    float along = dot(uv - from, dir);
    float across = dot(uv - from, perp);
    float wob = sin(along * 12.0 + t * 4.0 + fb) * 0.04 + sin(along * 30.0 - t * 3.0 + fb) * 0.01;
    float d = abs(across - wob);
    float clip = step(0.0, along) * step(along, length(to - from));
    col += clip * (0.004 / (d + 0.006)) * vec3(0.8, 0.9, 1.0) * 0.5;
  }
`);

export const R3_TESLACOIL = mk(`
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float a = fi * 6.28 / 8.0 + t * 0.3;
    vec2 to = vec2(cos(a), sin(a)) * 0.6;
    vec2 dir = normalize(to);
    float along = dot(uv, dir);
    float across = dot(uv, vec2(-dir.y, dir.x));
    float wob = sin(along * 8.0 + t * 5.0 + fi * 2.0) * 0.04;
    float d = abs(across - wob);
    float clip = step(0.0, along) * step(along, 0.6);
    col += clip * (0.003 / (d + 0.005)) * vec3(0.8, 0.85, 1.0) * 0.4;
  }
  col += smoothstep(0.06, 0.0, length(uv)) * vec3(1.0);
`);

export const R3_BALLLIGHTNING = mk(`
  vec2 c = vec2(sin(t * 0.3) * 0.3, cos(t * 0.4) * 0.2);
  float d = length(uv - c);
  float ball = exp(-d * 8.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float a = fi * 1.25 + t * 0.6;
    vec2 to = c + vec2(cos(a), sin(a)) * 0.25;
    vec2 dir = normalize(to - c);
    float along = dot(uv - c, dir);
    float across = dot(uv - c, vec2(-dir.y, dir.x));
    float wob = sin(along * 20.0 + t * 8.0 + fi) * 0.02;
    float dl = abs(across - wob);
    float clip = step(0.0, along) * step(along, 0.25);
    col += clip * (0.0015 / (dl + 0.003)) * vec3(0.7, 0.85, 1.0) * 0.5;
  }
  col += ball * vec3(0.6, 0.8, 1.0);
`);

// ─── 38-49: Organic growth ───

export const R3_MYCELIUMPULSE = mk(`
  vec3 v = voronoi(uv * 5.0 + t * 0.05);
  float thread = pow(smoothstep(0.07, 0.0, abs(v.x - v.y)), 2.0);
  float pulse = sin(t * 0.5 + v.y * 6.0) * 0.5 + 0.5;
  col = vec3(0.05, 0.04, 0.07) + thread * mix(vec3(0.6, 0.7, 0.4), vec3(0.9, 0.85, 0.6), pulse);
`);

export const R3_CORALPULSE = mk(`
  vec2 z = uv * 1.4;
  float dist = 1e9;
  for (int i = 0; i < 5; i++) {
    z = abs(z) / dot(z, z) - vec2(0.7, 0.5);
    dist = min(dist, length(z));
  }
  float c = smoothstep(1.5, 0.0, dist);
  float pulse = 0.5 + 0.5 * sin(t * 0.5);
  col = palette(c + t * 0.05, vec3(0.5, 0.3, 0.4), vec3(0.5, 0.3, 0.3), vec3(1.0), vec3(0.0, 0.2, 0.5));
  col *= c * (0.7 + 0.3 * pulse);
`);

export const R3_FERNUNFURL = mk(`
  vec2 p = uv;
  p = rot2(t * 0.05) * p;
  float r = length(p);
  float a = atan(p.y, p.x);
  float spiral = sin(a * 4.0 + log(r + 0.001) * 6.0 - t * 0.3);
  spiral = smoothstep(-0.5, 0.95, spiral);
  vec3 green = vec3(0.2, 0.6, 0.3);
  col = green * spiral * exp(-r * 2.0);
  col += pow(spiral, 4.0) * vec3(0.8, 1.0, 0.5) * 0.4;
`);

export const R3_NEURONPULSE = mk(`
  vec3 v = voronoi(uv * 3.0 + t * 0.05);
  float synapse = smoothstep(0.04, 0.0, abs(v.x - v.y));
  float pulse = pow(0.5 + 0.5 * sin(t * 1.5 + v.y * 8.0), 8.0);
  col = vec3(0.03, 0.02, 0.06) + synapse * vec3(0.5, 0.5, 0.9) * 0.6;
  col += synapse * pulse * vec3(0.9, 0.85, 1.0) * 0.5;
`);

export const R3_CAPILLARY = mk(`
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 p = uv;
    p = rot2(fi * 0.78 + t * 0.03) * p;
    p.x += sin(p.y * 4.0 + t * 0.1 + fi) * 0.06;
    float thick = 0.005 + 0.003 * sin(p.y * 3.0 + t * 0.4 + fi);
    float d = abs(p.x);
    col += (thick / (d + 0.007)) * vec3(0.8, 0.2, 0.3) * 0.4;
  }
  col += vec3(0.05, 0.02, 0.03);
`);

export const R3_MOSSGLOW = mk(`
  vec3 v = voronoi(uv * 8.0 + t * 0.02);
  float clump = smoothstep(0.5, 0.0, v.x);
  float n = fbm(uv * 14.0);
  vec3 green = mix(vec3(0.05, 0.15, 0.05), vec3(0.4, 0.7, 0.3), clump * (0.7 + 0.3 * n));
  float glow = pow(clump, 6.0) * (0.5 + 0.5 * sin(t * 0.5 + v.y * 8.0));
  col = green + glow * vec3(0.8, 1.0, 0.5) * 0.3;
`);

export const R3_LICHENPULSE = mk(`
  vec3 v = voronoi(uv * 4.0 + t * 0.02);
  float patch = smoothstep(0.5, 0.0, v.x);
  float pulse = 0.5 + 0.5 * sin(t * 0.3 + v.y * 5.0);
  vec3 mossy = mix(vec3(0.3, 0.4, 0.25), vec3(0.7, 0.85, 0.4), pulse);
  col = vec3(0.08, 0.07, 0.06) + patch * mossy * 0.6;
`);

export const R3_SEAWEEDSWAY = mk(`
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    vec2 p = uv;
    p.x -= (fi / 11.0 - 0.5) * 1.6;
    p.x += sin(p.y * 2.0 + t * 0.4 + fi * 0.5) * 0.1;
    float thick = 0.008 * (1.0 - smoothstep(-0.6, 0.6, p.y));
    float d = abs(p.x);
    col += smoothstep(thick, 0.0, d) * vec3(0.1, 0.4, 0.2) * 0.7;
  }
  col += smoothstep(-0.5, 0.5, uv.y) * vec3(0.05, 0.15, 0.2);
`);

export const R3_UNDERWATERVINES = mk(`
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    vec2 p = uv;
    p.x -= (fi / 9.0 - 0.5) * 1.6;
    p.x += sin(p.y * 1.5 + t * 0.3 + fi) * 0.12 + sin(p.y * 4.0 + t * 0.5 + fi) * 0.03;
    float thick = 0.006;
    float d = abs(p.x);
    col += smoothstep(thick, 0.0, d) * mix(vec3(0.05, 0.3, 0.15), vec3(0.3, 0.5, 0.25), fract(fi * 0.21)) * 0.7;
  }
`);

export const R3_SLEEPINGBLOOM = mk(`
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float petals = abs(cos(a * 5.0 + sin(t * 0.2) * 0.3));
  petals = smoothstep(0.3, 0.95, petals);
  float flower = petals * exp(-r * 2.0);
  col = palette(t * 0.05, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67)) * flower;
  col += pow(flower, 4.0) * vec3(1.0);
`);

export const R3_PEELINGBARK = mk(`
  vec2 q = uv * 4.0;
  float lines = abs(fract(q.x + fbm(q * 0.5 + t * 0.05)) - 0.5);
  float crack = smoothstep(0.05, 0.0, lines);
  vec3 base = mix(vec3(0.2, 0.12, 0.06), vec3(0.5, 0.3, 0.15), fbm(q * 0.7));
  col = base + crack * vec3(0.6, 0.4, 0.2);
`);

export const R3_ROOTSPULSE = mk(`
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 p = rot2(fi * 1.04 + t * 0.02) * uv;
    p.y *= 1.5;
    float branch = abs(p.x) - 0.5 * exp(-abs(p.y) * 1.5);
    branch += sin(p.y * 3.0 + fi) * 0.04;
    float pulse = sin(p.y * 2.0 - t * 1.0 + fi);
    col += smoothstep(0.012, 0.0, branch) * mix(vec3(0.4, 0.3, 0.2), vec3(0.95, 0.85, 0.5), 0.5 + 0.5 * pulse) * 0.5;
  }
`);

// ─── 50-61: Cosmic / ethereal ───

export const R3_COSMICMIST = mk(`
  vec2 q = uv * 1.5;
  q += 0.4 * vec2(fbm(q + t * 0.05), fbm(q - t * 0.05));
  float h = fbm(q * 1.5);
  vec3 deep = vec3(0.02, 0.0, 0.1);
  vec3 mid = vec3(0.3, 0.1, 0.5);
  col = mix(deep, mid, smoothstep(0.2, 0.7, h));
  col += pow(snoise(uv * 80.0), 80.0) * vec3(1.0);
`);

export const R3_NEBULAVEIL = mk(`
  vec2 q = uv * 1.4;
  q += 0.4 * vec2(fbm(q + t * 0.05), fbm(q - t * 0.05));
  float h1 = fbm(q * 1.5);
  float h2 = fbm(q * 1.5 + 7.0);
  col = vec3(0.4, 0.1, 0.5) * h1 + vec3(0.1, 0.5, 0.6) * h2 + vec3(0.02, 0.0, 0.04);
  col += pow(snoise(uv * 100.0), 90.0) * vec3(1.0);
`);

export const R3_MILKYVEIL = mk(`
  vec2 q = uv;
  q.y += 0.1 * fbm(q * 2.0 + t * 0.03);
  float band = exp(-pow(q.y * 4.0, 2.0));
  float n = fbm(q * 2.5 + t * 0.02);
  col = vec3(0.05, 0.02, 0.1) + band * mix(vec3(0.4, 0.3, 0.6), vec3(0.85, 0.7, 0.5), n) * 0.6;
  col += band * pow(snoise(uv * 70.0), 50.0) * vec3(1.0);
`);

export const R3_STELLARMIST = mk(`
  vec2 q = uv * 1.6;
  q += 0.5 * vec2(fbm(q + t * 0.04), fbm(q - t * 0.04));
  float h = fbm(q);
  col = palette(h * 0.7 + t * 0.02, vec3(0.3), vec3(0.5), vec3(1.0), vec3(0.0, 0.3, 0.6)) * smoothstep(0.0, 0.7, h);
  col += pow(snoise(uv * 90.0), 80.0) * vec3(1.0);
`);

export const R3_COSMICRIVER = mk(`
  vec2 q = vec2(uv.x + t * 0.05, uv.y);
  q.y += 0.15 * fbm(q * 3.0 + t * 0.05);
  float band = exp(-pow(q.y * 3.5, 2.0));
  float n = fbm(q * 4.0);
  vec3 violet = vec3(0.4, 0.2, 0.7);
  vec3 cyan = vec3(0.2, 0.6, 0.85);
  col = mix(violet, cyan, n) * band * 0.7;
  col += band * pow(snoise(uv * 60.0), 60.0) * vec3(1.0);
  col += vec3(0.02, 0.0, 0.05);
`);

export const R3_STARLIGHTVEIL = mk(`
  float n = fbm(uv * 2.0 + t * 0.03);
  col = vec3(0.05, 0.03, 0.12) + smoothstep(0.4, 0.7, n) * vec3(0.4, 0.3, 0.5);
  col += pow(snoise(uv * 100.0), 70.0) * vec3(1.0);
  col += pow(smoothstep(0.55, 0.8, n), 4.0) * vec3(0.7, 0.6, 0.9) * 0.4;
`);

export const R3_DARKCLOUD = mk(`
  vec2 q = uv * 1.4;
  q += 0.5 * vec2(fbm(q + t * 0.04), fbm(q - t * 0.04));
  float h = fbm(q * 1.5);
  col = vec3(0.05, 0.04, 0.1) + (1.0 - h) * vec3(0.0, 0.05, 0.15);
  col += pow(1.0 - h, 6.0) * vec3(0.3, 0.4, 0.7) * 0.3;
  col += pow(snoise(uv * 80.0), 80.0) * vec3(1.0);
`);

export const R3_COSMICTIDE = mk(`
  vec2 q = uv;
  q = rot2(t * 0.03) * q * 1.4;
  q += 0.4 * vec2(fbm(q * 2.0 + t * 0.05), fbm(q * 2.0 - t * 0.05));
  float r = length(q);
  float h = fbm(q * 1.5);
  col = palette(r + t * 0.05, vec3(0.4, 0.3, 0.3), vec3(0.4, 0.3, 0.3), vec3(1.0), vec3(0.0, 0.2, 0.6));
  col *= h;
  col += pow(snoise(uv * 80.0), 80.0) * vec3(1.0);
`);

export const R3_INTERSTELLARFLOW = mk(`
  vec2 q = uv * 1.6;
  q += vec2(fbm(q * 1.5 + t * 0.03), fbm(q * 1.5 - t * 0.03)) * 0.6;
  float n = fbm(q * 1.0);
  col = mix(vec3(0.0, 0.0, 0.05), vec3(0.5, 0.3, 0.7), smoothstep(0.2, 0.8, n));
  col += pow(smoothstep(0.6, 0.9, n), 4.0) * vec3(0.95, 0.85, 1.0) * 0.5;
  col += pow(snoise(uv * 90.0), 70.0) * vec3(1.0);
`);

export const R3_VOIDSHIMMER = mk(`
  float n = fbm(uv * 5.0 + t * 0.05);
  float shimmer = smoothstep(0.55, 0.65, n) - smoothstep(0.65, 0.75, n);
  col = vec3(0.02, 0.01, 0.05) + shimmer * palette(n + t * 0.1, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67)) * 0.7;
  col += pow(snoise(uv * 100.0), 80.0) * vec3(1.0);
`);

export const R3_QUASARHAZE = mk(`
  vec2 q = uv * 1.5;
  q.y += sin(q.x * 1.5 + t * 0.05) * 0.05;
  float h = fbm(q * 1.8 + t * 0.05);
  vec3 deep = vec3(0.1, 0.0, 0.2);
  vec3 hot = vec3(1.0, 0.5, 0.7);
  col = mix(deep, hot, smoothstep(0.3, 0.8, h));
  col += pow(smoothstep(0.6, 0.9, h), 4.0) * vec3(1.0, 0.85, 0.5);
  col += pow(snoise(uv * 80.0), 80.0) * vec3(1.0);
`);

export const R3_GALACTICARMS = mk(`
  vec2 p = rot2(t * 0.05) * uv;
  float r = length(p);
  float a = atan(p.y, p.x);
  float arms = sin(a * 3.0 - log(r + 0.01) * 4.0 - t * 0.3) * 0.5 + 0.5;
  arms = smoothstep(0.3, 0.95, arms);
  float falloff = exp(-r * 1.5);
  col = palette(r + t * 0.02, vec3(0.5), vec3(0.4), vec3(1.0), vec3(0.0, 0.3, 0.6)) * arms * falloff;
  col += exp(-r * 5.0) * vec3(1.0, 0.85, 0.6);
  col += pow(snoise(uv * 80.0), 80.0) * vec3(1.0);
`);

// ─── 62-71: Fire / warmth ───

export const R3_EMBERPOOL = mk(`
  vec2 q = uv * 2.0;
  q += 0.3 * vec2(fbm(q + t * 0.2), fbm(q - t * 0.2));
  float h = fbm(q * 1.5);
  vec3 dark = vec3(0.1, 0.02, 0.0);
  vec3 hot = vec3(1.0, 0.4, 0.05);
  col = mix(dark, hot, smoothstep(0.2, 0.7, h));
  col += pow(smoothstep(0.6, 0.85, h), 8.0) * vec3(1.0, 0.85, 0.4);
`);

export const R3_SUNBLUSH = mk(`
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float n = fbm(vec2(a * 3.0, r * 4.0) + t * 0.05);
  float bloom = exp(-r * 1.5);
  vec3 warm = mix(vec3(1.0, 0.5, 0.2), vec3(1.0, 0.85, 0.5), n);
  col = warm * bloom;
  col += pow(bloom, 4.0) * vec3(1.0);
`);

export const R3_FIREVEIL = mk(`
  vec2 q = uv;
  q.y += t * 0.15;
  q += 0.2 * vec2(fbm(q * 4.0 + t * 0.3), fbm(q * 4.0 - t * 0.3));
  float h = fbm(q * 1.5);
  h *= smoothstep(0.7, -0.4, uv.y - h * 0.3);
  col = mix(vec3(0.05, 0.0, 0.0), vec3(1.0, 0.5, 0.1), smoothstep(0.2, 0.8, h));
  col += pow(smoothstep(0.5, 0.85, h), 4.0) * vec3(1.0, 0.85, 0.4);
`);

export const R3_FORGEMIST = mk(`
  vec2 q = uv * 1.6;
  q += 0.4 * vec2(fbm(q + t * 0.1), fbm(q - t * 0.1));
  float h = fbm(q * 1.2);
  vec3 dim = vec3(0.1, 0.05, 0.02);
  vec3 warm = vec3(0.85, 0.5, 0.2);
  col = mix(dim, warm, smoothstep(0.3, 0.7, h));
  col += pow(smoothstep(0.6, 0.85, h), 4.0) * vec3(1.0, 0.85, 0.5) * 0.4;
`);

export const R3_WARMGLOWPOOL = mk(`
  vec2 q = uv;
  q += 0.25 * vec2(fbm(q * 2.0 + t * 0.05), fbm(q * 2.0 - t * 0.05));
  float h = fbm(q * 1.5);
  col = palette(h * 0.5 + t * 0.02, vec3(0.5, 0.4, 0.3), vec3(0.4, 0.3, 0.2), vec3(1.0), vec3(0.05, 0.15, 0.2));
  col *= 0.5 + 0.5 * h;
`);

export const R3_MAGMAVEIL = mk(`
  vec2 q = uv * 1.4;
  q += 0.4 * vec2(fbm(q + t * 0.15), fbm(q - t * 0.15));
  float h = fbm(q * 1.5);
  vec3 dark = vec3(0.05, 0.0, 0.0);
  vec3 magma = vec3(0.95, 0.3, 0.05);
  col = mix(dark, magma, smoothstep(0.3, 0.7, h));
  col += pow(smoothstep(0.6, 0.85, h), 6.0) * vec3(1.0, 0.85, 0.4);
`);

export const R3_COALPULSE = mk(`
  vec3 v = voronoi(uv * 8.0);
  float crack = smoothstep(0.04, 0.0, abs(v.x - v.y));
  float pulse = 0.5 + 0.5 * sin(t * 0.4 + v.y * 6.0);
  col = vec3(0.04, 0.02, 0.01) * (1.0 - crack);
  col += crack * mix(vec3(0.4, 0.1, 0.05), vec3(1.0, 0.5, 0.1), pulse);
`);

export const R3_DAWNFIRE = mk(`
  vec2 q = uv * 1.5;
  q.y += 0.1 * fbm(q * 3.0 + t * 0.1);
  float band = uv.y + 0.5;
  band = smoothstep(0.0, 1.5, band);
  vec3 night = vec3(0.05, 0.04, 0.1);
  vec3 dawn = vec3(0.95, 0.5, 0.3);
  vec3 day = vec3(1.0, 0.85, 0.5);
  col = mix(night, dawn, smoothstep(0.0, 0.5, band));
  col = mix(col, day, smoothstep(0.5, 1.0, band));
`);

export const R3_SUNSETVEIL = mk(`
  vec2 q = uv * 1.4;
  q += 0.4 * vec2(fbm(q + t * 0.05), fbm(q - t * 0.05));
  float h = fbm(q);
  vec3 sky = vec3(0.4, 0.15, 0.45);
  vec3 horizon = vec3(0.95, 0.55, 0.35);
  vec3 sun = vec3(1.0, 0.9, 0.5);
  col = mix(sky, horizon, smoothstep(-0.3, 0.5, uv.y));
  col = mix(col, sun, h * smoothstep(-0.2, 0.2, uv.y));
`);

export const R3_GOLDENHAZE = mk(`
  vec2 q = uv * 1.5;
  q += 0.3 * vec2(fbm(q + t * 0.05), fbm(q - t * 0.05));
  float h = fbm(q * 2.0);
  col = mix(vec3(0.3, 0.18, 0.05), vec3(1.0, 0.85, 0.4), smoothstep(0.2, 0.8, h));
  col += pow(smoothstep(0.55, 0.85, h), 4.0) * vec3(1.0, 0.95, 0.7);
`);

// ─── 72-81: Atmospheric ───

export const R3_FOGRIVER = mk(`
  vec2 q = vec2(uv.x + t * 0.06, uv.y);
  q.y += 0.1 * fbm(q * 3.0 - t * 0.05);
  float n = fbm(q * 2.0);
  col = vec3(0.1, 0.12, 0.16) + smoothstep(0.3, 0.7, n) * vec3(0.5, 0.55, 0.6);
  col *= smoothstep(0.5, -0.2, abs(q.y - 0.1));
`);

export const R3_HEATSHIMMER = mk(`
  vec2 q = uv;
  q.x += 0.05 * sin(q.y * 12.0 + t * 1.5);
  float band = uv.y + 0.4;
  band = smoothstep(0.0, 1.0, band);
  vec3 ground = vec3(0.6, 0.3, 0.15);
  vec3 sky = vec3(0.95, 0.85, 0.6);
  col = mix(ground, sky, band);
  col *= 1.0 + 0.05 * sin(q.y * 30.0 + t * 5.0);
`);

export const R3_MISTCURTAIN = mk(`
  vec2 q = vec2(uv.x, uv.y * 1.4);
  q += 0.2 * vec2(fbm(q * 3.0 + t * 0.05), fbm(q * 3.0 - t * 0.05));
  float h = fbm(q * 1.5);
  col = mix(vec3(0.05, 0.06, 0.1), vec3(0.7, 0.75, 0.85), smoothstep(0.2, 0.8, h));
  col *= smoothstep(0.7, -0.2, abs(uv.x));
`);

export const R3_DAWNHAZE = mk(`
  vec2 q = uv;
  q.y += 0.06 * fbm(q * 4.0 + t * 0.05);
  float band = (uv.y + 0.5) * 0.7;
  vec3 deep = vec3(0.4, 0.3, 0.55);
  vec3 warm = vec3(1.0, 0.7, 0.5);
  col = mix(deep, warm, smoothstep(0.0, 0.7, band));
  col += pow(smoothstep(0.85, 1.0, band), 4.0) * vec3(1.0, 0.95, 0.7) * 0.3;
`);

export const R3_MONSOONVEIL = mk(`
  vec2 q = vec2(uv.x + t * 0.5, uv.y * 4.0 + t * 1.5);
  float streaks = abs(fract(q.x * 0.5 + q.y * 0.1) - 0.5);
  streaks = smoothstep(0.45, 0.5, streaks);
  float fog = fbm(uv * 2.0 + t * 0.1);
  col = mix(vec3(0.05, 0.07, 0.1), vec3(0.3, 0.4, 0.5), fog);
  col += streaks * vec3(0.7, 0.8, 0.9) * 0.3;
`);

export const R3_DESERTHAZE = mk(`
  vec2 q = uv;
  q.x += 0.04 * sin(q.y * 8.0 + t * 1.0);
  float band = (uv.y + 0.4) * 0.7;
  vec3 sand = vec3(0.85, 0.6, 0.3);
  vec3 sky = vec3(0.95, 0.85, 0.7);
  col = mix(sand, sky, smoothstep(0.0, 1.0, band));
  col += pow(snoise(uv * 80.0), 80.0) * vec3(1.0) * 0.5;
`);

export const R3_FORESTMIST = mk(`
  vec2 q = uv * 1.4;
  q += 0.3 * vec2(fbm(q * 2.0 + t * 0.05), fbm(q * 2.0 - t * 0.05));
  float h = fbm(q * 1.5);
  vec3 dark = vec3(0.04, 0.07, 0.05);
  vec3 light = vec3(0.4, 0.55, 0.45);
  col = mix(dark, light, smoothstep(0.3, 0.7, h));
  col += pow(smoothstep(0.6, 0.85, h), 4.0) * vec3(0.85, 0.9, 0.7);
`);

export const R3_CANYONHAZE = mk(`
  float band = (uv.y + 0.5);
  vec3 deep = vec3(0.3, 0.15, 0.1);
  vec3 warm = vec3(0.85, 0.55, 0.3);
  vec3 sky = vec3(0.95, 0.7, 0.5);
  col = mix(deep, warm, smoothstep(0.0, 0.5, band));
  col = mix(col, sky, smoothstep(0.5, 1.0, band));
  col += 0.05 * fbm(uv * 5.0 + t * 0.1);
`);

export const R3_MOUNTAINMIST = mk(`
  vec2 q = uv * 1.5;
  q.y += 0.05 * fbm(q * 5.0 + t * 0.05);
  float h = fbm(q * 1.5);
  vec3 mist = mix(vec3(0.05, 0.08, 0.12), vec3(0.6, 0.65, 0.75), h);
  col = mist;
  col += smoothstep(0.5, 0.8, h) * vec3(0.85, 0.9, 1.0) * 0.4;
`);

export const R3_CLOUDVEIL = mk(`
  vec2 q = uv * 1.4;
  q += 0.3 * vec2(fbm(q + t * 0.05), fbm(q - t * 0.05));
  float h = fbm(q * 2.0);
  vec3 dark = vec3(0.4, 0.45, 0.55);
  vec3 light = vec3(0.95, 0.97, 1.0);
  col = mix(dark, light, smoothstep(0.3, 0.7, h));
`);

// ─── 82-91: Magical / dreamlike ───

export const R3_FAIRYGLOW = mk(`
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    vec2 c = vec2(snoise(vec2(fi, 0.0)) * 1.4, snoise(vec2(0.0, fi)) * 0.8);
    c += 0.06 * vec2(sin(t * 0.5 + fi), cos(t * 0.4 + fi * 0.7));
    float d = length(uv - c);
    float twink = pow(0.5 + 0.5 * sin(t * 1.5 + fi * 2.0), 4.0);
    col += (0.0008 / (d * d + 0.001)) * mix(vec3(1.0, 0.9, 0.6), vec3(0.85, 0.7, 1.0), fract(fi * 0.21)) * twink * 0.5;
  }
  col += vec3(0.04, 0.03, 0.07);
`);

export const R3_STARDUST2 = mk(`
  for (int i = 0; i < 100; i++) {
    float fi = float(i);
    vec2 c = vec2(snoise(vec2(fi, 0.0)) * 1.5, snoise(vec2(0.0, fi)) * 0.9);
    c += 0.04 * vec2(cos(t * 0.2 + fi), sin(t * 0.25 + fi * 0.5));
    float d = length(uv - c);
    float twink = pow(0.5 + 0.5 * sin(t * 2.0 + fi * 3.0), 8.0);
    col += (0.0005 / (d * d + 0.0006)) * vec3(1.0) * twink;
  }
`);

export const R3_MOONGLOW = mk(`
  vec2 c = vec2(0.0);
  float r = length(uv - c);
  float disc = smoothstep(0.35, 0.32, r);
  col = disc * vec3(0.95, 0.93, 0.85);
  col += smoothstep(0.7, 0.0, r) * vec3(0.4, 0.5, 0.7) * 0.4;
  col += smoothstep(1.5, 0.5, r) * vec3(0.05, 0.07, 0.15);
`);

export const R3_SPIRITFLAME = mk(`
  vec2 q = uv;
  q.y += t * 0.1;
  q += 0.15 * vec2(fbm(q * 3.0 + t * 0.2), fbm(q * 3.0 - t * 0.2));
  float h = fbm(q * 1.5);
  h *= smoothstep(0.7, -0.4, abs(uv.x) + uv.y * 0.3);
  col = palette(h + t * 0.03, vec3(0.4, 0.5, 0.6), vec3(0.4, 0.5, 0.5), vec3(1.0), vec3(0.0, 0.3, 0.6));
  col *= h;
`);

export const R3_WISHTRAILS = mk(`
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float speed = 0.15 + fract(fi * 0.27) * 0.2;
    float tt = mod(t * speed + fi * 0.13, 1.0);
    vec2 origin = vec2(snoise(vec2(fi, 0.0)) * 0.8, -0.5);
    vec2 c = origin + vec2(sin(fi) * 0.05, tt * 1.4);
    float d = length(uv - c);
    col += (0.0007 / (d * d + 0.0008)) * vec3(0.85, 0.95, 1.0) * (1.0 - tt) * 0.6;
  }
  col += vec3(0.03, 0.02, 0.06);
`);

export const R3_DREAMPARTICLES = mk(`
  for (int i = 0; i < 50; i++) {
    float fi = float(i);
    vec2 c = vec2(snoise(vec2(fi, 0.0)), snoise(vec2(0.0, fi))) * vec2(1.5, 0.85);
    c += 0.05 * vec2(sin(t * 0.4 + fi), cos(t * 0.3 + fi * 0.7));
    float d = length(uv - c);
    vec3 hue = palette(fract(fi * 0.13), vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col += (0.0006 / (d * d + 0.0008)) * hue * 0.5;
  }
`);

export const R3_LULLABY = mk(`
  vec2 q = uv * 1.2;
  q += 0.3 * vec2(fbm(q + t * 0.04), fbm(q - t * 0.04));
  float h = fbm(q);
  col = mix(vec3(0.05, 0.05, 0.15), vec3(0.5, 0.4, 0.7), smoothstep(0.2, 0.8, h));
  float pulse = 0.5 + 0.5 * sin(t * 0.3);
  col *= 0.7 + 0.3 * pulse;
`);

export const R3_MEMORYFLOW = mk(`
  vec2 q = uv * 1.4;
  q += 0.4 * vec2(fbm(q * 1.5 + t * 0.05), fbm(q * 1.5 - t * 0.05));
  float h = fbm(q);
  col = palette(h * 0.6 + t * 0.02, vec3(0.5, 0.4, 0.4), vec3(0.4, 0.3, 0.4), vec3(1.0), vec3(0.0, 0.3, 0.6));
  col *= smoothstep(0.0, 0.7, h);
`);

export const R3_MIRAGE = mk(`
  vec2 q = uv;
  q.x += 0.04 * sin(q.y * 14.0 + t * 1.5);
  float band = uv.y + 0.3;
  vec3 sand = vec3(0.85, 0.6, 0.3);
  vec3 water = vec3(0.6, 0.85, 0.95);
  col = mix(water, sand, smoothstep(-0.3, 0.7, band));
  col += smoothstep(-0.3, -0.1, band) * vec3(0.85, 0.95, 1.0) * 0.3;
`);

export const R3_AURORADREAM = mk(`
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 q = uv;
    q.y -= (fi / 3.0 - 0.5) * 0.4;
    q.y -= sin(q.x * 1.2 + t * 0.1 + fi * 1.04) * 0.06;
    q.y -= 0.03 * fbm(q * 5.0 + t * 0.1 + fi);
    float band = exp(-pow(q.y * 8.0, 2.0));
    vec3 hue = palette(fi * 0.27 + t * 0.03, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col += band * hue * 0.5;
  }
`);

// ─── 92-100: Soft abstract motion ───

export const R3_WAVEFLOW = mk(`
  vec2 q = uv;
  q.y += sin(q.x * 2.0 + t * 0.3) * 0.1 + sin(q.x * 5.0 - t * 0.4) * 0.04;
  float n = fbm(q * 2.5 + t * 0.05);
  col = palette(n + t * 0.03, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.3, 0.6)) * smoothstep(0.0, 0.7, n);
  col *= smoothstep(0.6, -0.3, abs(q.y));
`);

export const R3_RIPPLECASCADE = mk(`
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(t * 0.3 + fi * 1.3) * 0.4, cos(t * 0.2 + fi * 0.7) * 0.3);
    float r = length(uv - c);
    float ripple = sin(r * 18.0 - t * 2.0 + fi);
    col += smoothstep(0.5, 0.0, r) * (0.5 + 0.5 * ripple) * palette(fi * 0.27 + t * 0.03, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.3, 0.6)) * 0.25;
  }
`);

export const R3_PULSERINGSSOFT = mk(`
  float r = length(uv);
  float pulse1 = 0.5 + 0.5 * sin(r * 5.0 - t * 0.5);
  float pulse2 = 0.5 + 0.5 * sin(r * 10.0 - t * 0.7);
  col = palette(r + t * 0.05, vec3(0.4), vec3(0.5), vec3(1.0), vec3(0.0, 0.3, 0.6));
  col *= pulse1 * 0.5 + pulse2 * 0.3;
  col *= exp(-r * 0.8);
`);

export const R3_BREATHGLOW = mk(`
  float r = length(uv);
  float breath = 0.5 + 0.5 * sin(t * 0.4);
  vec3 hue = mix(vec3(0.4, 0.2, 0.5), vec3(0.95, 0.65, 0.85), breath);
  col = hue * exp(-r * (1.5 + 0.5 * breath));
  col += pow(exp(-r * 4.0), 2.0) * vec3(1.0, 0.9, 0.95);
`);

export const R3_HEARTWARMTH = mk(`
  vec2 q = uv;
  float pulse = pow(0.5 + 0.5 * sin(t * 1.0), 3.0);
  float r = length(q);
  col = mix(vec3(0.1, 0.0, 0.05), vec3(1.0, 0.4, 0.4), pulse * exp(-r * 1.5));
  col += pow(exp(-r * 3.0), 3.0) * vec3(1.0, 0.85, 0.8) * pulse;
`);

export const R3_SOFTORBIT = mk(`
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float a = fi * 1.57 + t * 0.2;
    vec2 c = vec2(cos(a), sin(a)) * 0.5;
    float d = length(uv - c);
    vec3 hue = palette(fi * 0.25 + t * 0.05, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    col += hue * exp(-d * 5.0) * 0.6;
  }
  col += exp(-length(uv) * 8.0) * vec3(1.0);
`);

export const R3_GENTLETIDE = mk(`
  vec2 q = uv;
  q.y += sin(q.x * 1.5 + t * 0.2) * 0.15;
  float h = fbm(q * 1.5 + t * 0.05);
  col = mix(vec3(0.0, 0.1, 0.25), vec3(0.4, 0.7, 0.85), smoothstep(0.3, 0.7, h));
  col += pow(smoothstep(0.6, 0.85, h), 4.0) * vec3(0.95, 0.97, 1.0) * 0.3;
`);

export const R3_INNERGLOW = mk(`
  float r = length(uv);
  float n = fbm(uv * 4.0 + t * 0.05);
  col = vec3(0.05, 0.04, 0.1);
  col += exp(-r * 1.8) * mix(vec3(0.5, 0.3, 0.7), vec3(0.95, 0.7, 0.85), n);
  col += pow(exp(-r * 4.0), 2.0) * vec3(1.0, 0.95, 0.9) * 0.5;
`);

export const R3_QUIETLIGHT = mk(`
  vec2 q = uv;
  q += 0.1 * vec2(fbm(q * 2.0 + t * 0.03), fbm(q * 2.0 - t * 0.03));
  float h = fbm(q * 1.2);
  col = vec3(0.05, 0.06, 0.1) + h * vec3(0.5, 0.55, 0.7) * 0.4;
  col += pow(smoothstep(0.55, 0.85, h), 4.0) * vec3(0.95, 0.97, 1.0) * 0.3;
`);
