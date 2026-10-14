import { pointLightTable } from "./prepass-pack";

// Meteor Rain — sparse diagonal meteors with glittering wakes.
// Bass lengthens the streaks; the fall rate rides the kinetic clock.
//
// PERF (2026-10-13, the 120 fps law): 18 meteors × 7 wake lights, rendered
// from a per-frame light table (prepass-pack.ts pointLightTable) — the
// identical per-light math, computed once per frame instead of per pixel.

const HEADER = `
float hash(float n) { return fract(sin(n) * 43758.5453); }
vec3 hash3(float n) {
  return fract(sin(vec3(n, n + 17.13, n + 31.7)) * vec3(43758.5453, 24634.6345, 12764.235));
}
// Evolving palette (Karel 2026-09-30: "they should also adjust in
// color... chemo just stays the same color"): a slow cycle through a
// cosmic gamut, nudged by the harmony (u_mid).
vec3 pal(float t) {
  return vec3(0.42) + vec3(0.45) * cos(6.28318 * (vec3(1.0, 0.92, 0.85) * t + vec3(0.0, 0.33, 0.62)));
}
float palT(float seed) { return seed + u_time * 0.012 + u_mid * 0.18; }
`;

// light fi = meteor m × 7 + wake step fk
const LIGHT = `
    float m = floor((fi + 0.5) / 7.0);
    float fk = fi - m * 7.0;
    vec2 dir = normalize(vec2(0.55, -1.0));
    vec3 h = hash3(m * 6.91);
    float period = 2.5 + h.x * 4.0;
    float cycle = fract(u_time * 0.286 / period * 3.0 + h.y); // constant rate (was u_time * (A + u_bass * B): on a long-running layer the phase leapt as bass moved — kiosk slew audit 2026-10-10; the kinetic clock already rides the band)
    vec2 start = vec2(-1.6 + h.x * 3.2, 1.25 + h.z * 0.4);
    vec2 head = start + dir * cycle * 3.0;
    lp = head - dir * fk * (0.035 + u_bass * 0.03);
    float fade = (1.0 - fk / 7.0) * (1.0 - cycle);
    float tw = fk < 0.5 ? 1.0 : 0.5 + 0.5 * sin(u_time * (6.0 + hash(m + fk) * 8.0) * (0.6 + u_treble) + fk);
    lt = pal(palT(h.z * 0.3 + fk * 0.02));
    lw = 0.0007 * fade * fade * tw * 0.42;
    le = 0.00013;
`;

const T = pointLightTable({ n: 126, header: HEADER, light: LIGHT, posRange: 4, wMax: 0.0003, eMax: 0.0002, eConst: "0.00013" });
export const FRAG = T.FRAG;
export const PRE = T.PRE;
export const PRE_SIZE = T.SIZE;
