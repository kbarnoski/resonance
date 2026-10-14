import { pointLightTable, LIGHT_HEADER } from "./prepass-pack";

// Cascade Veil — a narrow particle waterfall from the upper edge,
// pooling in a glowing basin. Bass splashes the pool outward.
//
// PERF (2026-10-13, the 120 fps law): rendered from a per-frame light table
// (prepass-pack.ts pointLightTable) — the identical per-light math, computed
// once per frame instead of once per light per pixel. Lights 0-57 = the
// drops, 58-115 = each drop's splash (off until it lands).
const LIGHT = `
    float xSrc = 0.35;
    float di = fi < 57.5 ? fi : fi - 58.0;
    vec3 h = hash3(di * 6.07);
    float cyc = fract(u_time * (0.3 + h.x * 0.25) + h.y);
    if (fi < 57.5) {
      float y = 1.1 - cyc * 1.75;
      float x = xSrc + (h.z - 0.5) * (0.05 + cyc * 0.12);
      lp = vec2(x, y);
      float tw = 0.55 + 0.45 * sin(u_time * (4.5 + h.y * 7.0) * (0.6 + u_treble) + di);
      lt = pal(palT(cyc * 0.18));
      lw = 0.00036 * tw * 0.3;
      le = 0.00013;
    } else if (cyc > 0.9) {
      float splash = (cyc - 0.9) * 10.0;
      lp = vec2(xSrc + (h.x - 0.5) * splash * (0.3 + u_bass * 0.5), -0.68 + splash * 0.1 * (0.5 + u_bass));
      lt = pal(palT(0.2));
      lw = 0.0004 * (1.0 - splash) * 0.33;
      le = 0.00015;
    }
`;

const T = pointLightTable({ n: 116, header: LIGHT_HEADER, light: LIGHT, posRange: 4, wMax: 0.0002, eMax: 0.0002 });
export const FRAG = T.FRAG;
export const PRE = T.PRE;
export const PRE_SIZE = T.SIZE;
