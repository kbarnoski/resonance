import { pointLightTable, LIGHT_HEADER } from "./prepass-pack";

// Pendulum Dust — a glittering bob swinging on an unseen thread,
// shedding dust at the bottom of each arc. Bass widens the swing.
//
// PERF (2026-10-13, the 120 fps law): rendered from a per-frame light table
// (prepass-pack.ts pointLightTable) — the identical per-light math, computed
// once per frame instead of once per light per pixel. Light 0 = the bob,
// lights 1-22 = its dust.
const LIGHT = `
    vec2 pivot = vec2(0.15, 0.85);
    float armLen = 1.05;
    if (fi < 0.5) {
      float swing = (0.5 + u_bass * 0.45) * sin(u_time * 1.1);
      float ang = -1.5708 + swing;
      lp = pivot + vec2(cos(ang), sin(ang)) * armLen;
      lt = pal(palT(0.0));
      lw = 0.0016 * 0.45;
      le = 0.0009;
    } else {
      float fk = fi;
      float ta = u_time - fk * 0.05;
      float swa = (0.5 + u_bass * 0.45) * sin(ta * 1.1);
      vec2 pb = pivot + vec2(cos(-1.5708 + swa), sin(-1.5708 + swa)) * armLen;
      vec3 rnd = hash3(floor(ta * 16.0) + fk * 3.7) - 0.5;
      pb += rnd.xy * fk * 0.014;
      pb.y -= fk * fk * 0.0012;
      lp = pb;
      float tw = 0.5 + 0.5 * sin(u_time * (5.0 + hash(fk) * 7.0) * (0.6 + u_treble) + fk);
      lt = pal(palT(fk * 0.012));
      lw = 0.00034 * (1.0 - fk / 22.0) * tw * 0.3;
      le = 0.00012;
    }
`;

const T = pointLightTable({ n: 23, header: LIGHT_HEADER, light: LIGHT, posRange: 4, wMax: 0.0008, eMax: 0.001 });
export const FRAG = T.FRAG;
export const PRE = T.PRE;
export const PRE_SIZE = T.SIZE;
