// 1922-chladni-plate · WebGL2 fragment shader — the live Chladni figure.
//
// A full-screen triangle; the fragment shader sums the currently-excited plate
// modes into a standing-wave field u(x,y) = Σ A_k · sin(mπx)·sin(nπy) and
// draws "sand" collecting on the nodal lines (|u| ≈ 0 → bright sand; antinodes
// → dark oxidized metal). As the modal energies A_k decay at different rates,
// the nodal pattern morphs — the figure blooms on strike and settles as the
// higher modes die away first.
//
// Palette is warm brass / graphite / sand (non-violet); raw hex-equivalent
// constants live here in the art layer only.

import { MAX_MODES } from "./modal";

export const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export const MODE_CAP = MAX_MODES;

export const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  u_res;
uniform float u_time;
uniform float u_ar;                 // plate aspect ratio (width/height)
uniform int   u_count;              // active mode count
uniform vec4  u_modes[${MODE_CAP}]; // (m, n, A_signed, unused)
uniform vec2  u_strikePos;          // last strike point, plate-local
uniform float u_strikeAge;          // seconds since last strike

const float PI = 3.14159265;
const float MARGIN = 0.86;          // plate fills this fraction of the viewport

// palette (warm brass / graphite / sand)
const vec3 GRAPHITE = vec3(0.078, 0.094, 0.110); // #14181c
const vec3 SAND     = vec3(0.909, 0.835, 0.658); // #e8d5a8
const vec3 BRASS    = vec3(0.788, 0.588, 0.184); // #c9962f
const vec3 HOT      = vec3(1.000, 0.902, 0.627); // #ffe6a0

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

void main() {
  vec2 res = u_res;

  // fit a plate rectangle of aspect u_ar centred in the viewport
  vec2 avail = res * MARGIN;
  float pw, ph;
  if (avail.x / avail.y > u_ar) { ph = avail.y; pw = ph * u_ar; }
  else                         { pw = avail.x; ph = pw / u_ar; }
  vec2 pmin = (res - vec2(pw, ph)) * 0.5;
  vec2 local = (gl_FragCoord.xy - pmin) / vec2(pw, ph); // 0..1, y up

  bool inside = local.x >= 0.0 && local.x <= 1.0 &&
                local.y >= 0.0 && local.y <= 1.0;

  vec3 col;

  if (!inside) {
    // graphite surround with a soft radial falloff
    vec2 q = (gl_FragCoord.xy - 0.5 * res) / res.y;
    col = vec3(0.035, 0.043, 0.052) * (1.0 - 0.4 * length(q));
    outColor = vec4(col, 1.0);
    return;
  }

  // ── sum the active modes into the standing-wave field ──
  float S = 0.0;   // signed field
  float E = 0.0;   // total present energy
  for (int i = 0; i < ${MODE_CAP}; i++) {
    if (i >= u_count) break;
    vec4 md = u_modes[i];
    float phi = sin(md.x * PI * local.x) * sin(md.y * PI * local.y);
    S += md.z * phi;
    E += abs(md.z);
  }
  float norm = S / (E + 0.0004);      // ~ -1..1
  float presence = smoothstep(0.004, 0.06, E); // dark & silent until struck

  // brushed-metal base with a faint grain
  float grain = (hash(floor(gl_FragCoord.xy * 0.5)) - 0.5) * 0.02;
  col = GRAPHITE * (1.0 + grain);

  // antinodes (large |field|) darken like bare oxidized metal, with a hint
  // of warm brass sheen
  float dist = abs(norm);
  float anti = smoothstep(0.2, 0.85, dist);
  col += BRASS * anti * 0.10 * presence;
  col *= 1.0 - 0.35 * anti * presence;

  // sand accumulating on the nodal lines (|field| ≈ 0)
  float line = 1.0 - smoothstep(0.0, 0.11, dist);
  line = pow(line, 1.7);
  col = mix(col, SAND, line * presence * 0.92);
  // hot brass glint on the sharpest, most energetic nodal ridges
  col += HOT * pow(line, 3.0) * presence * smoothstep(0.05, 0.4, E) * 0.5;

  // strike ripple — a brief expanding ring flash from the impact point
  if (u_strikeAge < 1.2) {
    float d = distance(local * vec2(u_ar, 1.0), u_strikePos * vec2(u_ar, 1.0));
    float r = u_strikeAge * 1.0;
    float ring = exp(-pow((d - r) / 0.05, 2.0)) * (1.0 - u_strikeAge / 1.2);
    col += HOT * ring * 0.55;
  }

  // brass frame around the plate edge
  float bd = min(min(local.x, 1.0 - local.x), min(local.y, 1.0 - local.y));
  float frame = 1.0 - smoothstep(0.006, 0.016, bd);
  col = mix(col, BRASS * 0.9, frame * 0.8);

  // gentle vignette
  vec2 c = local - 0.5;
  col *= 1.0 - 0.35 * dot(c, c);

  outColor = vec4(col, 1.0);
}
`;
