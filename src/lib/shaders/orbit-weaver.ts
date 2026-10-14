import { pointLightTable, LIGHT_HEADER } from "./prepass-pack";

// Orbit Weaver — particles on four concentric orbital shells around
// the SHARED anchor (concentric law). Bass surges orbital speed.
//
// PERF (2026-10-13, the 120 fps law): rendered from a per-frame light table
// (prepass-pack.ts pointLightTable) — the identical per-light math, computed
// once per frame instead of once per light per pixel.
const LIGHT = `
    vec2 c = vec2(-0.08, 0.05);
    float w = 0.25 + u_bass * 1.1;
    vec3 h = hash3(fi * 4.63);
    float shell = floor(h.x * 4.0);
    float radius = 0.18 + shell * 0.17 + (h.y - 0.5) * 0.02;
    float ang = h.z * 6.28318 + u_time * w * (1.0 - shell * 0.18) * (h.x > 0.5 ? 1.0 : -1.0);
    lp = c + vec2(cos(ang), sin(ang)) * radius;
    float tw = 0.55 + 0.45 * sin(u_time * (4.0 + h.y * 7.0) * (0.6 + u_treble) + fi);
    lt = pal(palT(shell * 0.12));
    lw = 0.00045 * tw * 0.3;
    le = 0.00013;
`;

const T = pointLightTable({ n: 56, header: LIGHT_HEADER, light: LIGHT, posRange: 4, wMax: 0.0002, eMax: 0.0002, eConst: "0.00013" });
export const FRAG = T.FRAG;
export const PRE = T.PRE;
export const PRE_SIZE = T.SIZE;
