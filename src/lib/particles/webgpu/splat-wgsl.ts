// ─────────────────────────────────────────────────────────────────────────────
// splat-wgsl.ts — PHASE B: tile-binned, deterministic splatting (250k–1M+).
//
// The raster path draws one quad per mote and lets the blender add them up.
// At 10⁶ motes most are 1–3 px: a million tiny quads are fill- and setup-bound
// and the float blend order is the GPU's. The splat path instead:
//   1. motes     — the ported draw vertex program as COMPUTE (gl-port.ts
//                  portMote): one record per mote (window px, size, defocus,
//                  colour, the stable gaussians);
//   2. classify  — small sprites (≤ maxPx, no trail) count into the 16×16-px
//                  tiles they touch; everything else joins the LARGE list,
//                  drawn by the ported raster program (drawIndirect);
//   3. scan      — tile offsets (one workgroup);
//   4. scatter   — each small mote's index into its tiles' lists;
//   5. tile      — one workgroup per tile accumulates its motes into shared
//                  memory with FIXED-POINT atomics (integer sums are exact and
//                  order-free: the frame is bit-identical however the GPU
//                  schedules it — no blend-order shimmer), then writes the tile;
//   6. compose   — fade, + the splat layer, + the large motes, → temporal
//                  resolve → governor → composite (engine-port.ts).
// The per-pixel value is the show's own fragment program (DRAW_FS), mirrored
// exactly — pixel set (GL point rasterisation), plain and stable shapes, the
// bokeh mix; splat.test.ts holds the mirror to DRAW_FS's text.
// ─────────────────────────────────────────────────────────────────────────────

import { layoutStruct, structWGSL } from "./layout";
import { MOTE_STRIDE } from "./gl-port";

export const TILE = 16;
/** fixed-point scale of the accumulation (1/16384 HDR units; 2³² ≫ any pile-up) */
export const SPLAT_SCALE = 16384;
/** the largest sprite (device px) the splat takes; larger → the raster path */
export const SPLAT_MAX_PX = 6;
/** tiles a small mote can touch (SPLAT_MAX_PX ≤ TILE → at most 2 × 2) */
export const SPLAT_MAX_TILES = 4;

export const SPLAT_LAYOUT = layoutStruct("SplatU", [
  { name: "vp", type: "vec2f", doc: "target size (px)" },
  { name: "maxPx", type: "f32" },
  { name: "stable", type: "u32", doc: "1 = the stable gaussian sprite" },
  { name: "tilesX", type: "u32" },
  { name: "tilesY", type: "u32" },
  { name: "count", type: "u32" },
  { name: "listCap", type: "u32" },
]);

export const SPLAT_BINDINGS = { uniforms: 0, motes: 1, count: 2, offs: 3, fill: 4, list: 5, large: 6, args: 7, out: 8 } as const;
export const SPLAT_ENTRIES = ["splatClear", "splatClassify", "splatScan", "splatScatter", "splatTile"] as const;

export function tileGrid(w: number, h: number): { tilesX: number; tilesY: number; tiles: number } {
  const tilesX = Math.max(1, Math.ceil(w / TILE)), tilesY = Math.max(1, Math.ceil(h / TILE));
  return { tilesX, tilesY, tiles: tilesX * tilesY };
}

/** CPU mirror of the pixel set a GL point of diameter `s` at window px (cx, cy)
 *  covers (pixel centres inside the square) — the classify / tile passes use it. */
export function pointPixels(cx: number, cy: number, s: number): [number, number, number, number] {
  return [Math.ceil(cx - s * 0.5 - 0.5), Math.ceil(cy - s * 0.5 - 0.5), Math.floor(cx + s * 0.5 - 0.5), Math.floor(cy + s * 0.5 - 0.5)];
}

export function buildSplatWGSL(): string {
  const S = MOTE_STRIDE;
  return /* wgsl */ `// generated — tile-binned fixed-point splat (phase B)
${structWGSL(SPLAT_LAYOUT)}
@group(0) @binding(${SPLAT_BINDINGS.uniforms}) var<uniform> SU: SplatU;
@group(0) @binding(${SPLAT_BINDINGS.motes}) var<storage, read> motes: array<vec4f>;
@group(0) @binding(${SPLAT_BINDINGS.count}) var<storage, read_write> tcount: array<atomic<u32>>;
@group(0) @binding(${SPLAT_BINDINGS.offs}) var<storage, read_write> toffs: array<u32>;
@group(0) @binding(${SPLAT_BINDINGS.fill}) var<storage, read_write> tfill: array<atomic<u32>>;
@group(0) @binding(${SPLAT_BINDINGS.list}) var<storage, read_write> tlist: array<u32>;
@group(0) @binding(${SPLAT_BINDINGS.large}) var<storage, read_write> large: array<u32>;
@group(0) @binding(${SPLAT_BINDINGS.args}) var<storage, read_write> args: array<atomic<u32>, 4>;
@group(0) @binding(${SPLAT_BINDINGS.out}) var outTex: texture_storage_2d<rgba16float, write>;

const TILE = ${TILE}i;
const SCALE = ${SPLAT_SCALE}.0;

fn lin(gid: vec3u, nwg: vec3u) -> u32 { return gid.x + gid.y * nwg.x * 256u; }

// pixel set of a GL point (centres inside the square), clipped to the target
fn pixels(r0: vec4f) -> vec4i {
  let h = r0.z * 0.5;
  let lo = vec2i(ceil(r0.xy - h - 0.5));
  let hi = vec2i(floor(r0.xy + h - 0.5));
  let vp = vec2i(SU.vp);
  return vec4i(max(lo, vec2i(0)), min(hi, vp - 1));
}

// 0 = hidden, 1 = splat, 2 = large (raster)
fn kind(r0: vec4f, r1: vec4f) -> u32 {
  if (r1.w < 0.5) { return 0u; }
  if (r1.w > 1.5 || r0.z > SU.maxPx) { return 2u; }
  let p = pixels(r0);
  if (p.x > p.z || p.y > p.w) { return 0u; }
  return 1u;
}

// the show's fragment program at one pixel centre (DRAW_FS, mirrored)
fn shade(i: u32, r0: vec4f, r1: vec4f, f: vec2f) -> vec3f {
  let coc = r0.w;
  if (SU.stable == 1u) {
    let A = motes[i * ${S}u + 2u];
    let B = motes[i * ${S}u + 3u];
    let q = f - motes[i * ${S}u + 4u].xy;
    let q2 = dot(q, q);
    if (q2 >= B.z) { return vec3f(0.0); }
    var gs = A.x * max(exp(-q2 * A.z) - B.x, 0.0) + A.y * max(exp(-q2 * A.w) - B.y, 0.0);
    if (coc > 0.0) {
      let rb = q2 * B.w;
      var bk = 0.0;
      if (rb < 1.0) { bk = (1.0 - smoothstep(0.15, 1.0, rb)) * 0.62 + 0.12 * exp(-rb * 2.0); }
      gs = mix(gs, bk, coc);
    }
    return r1.rgb * gs * 1.15;
  }
  // the GL point coordinate (y down) → d = pc * 2 - 1
  let d = vec2f(f.x - r0.x, r0.y - f.y) * (2.0 / r0.z);
  let r2 = dot(d, d);
  if (r2 > 1.0) { return vec3f(0.0); }
  var g = exp(-r2 * 7.0) + 0.3 * exp(-r2 * 1.8);
  let bokeh = (1.0 - smoothstep(0.15, 1.0, r2)) * 0.62 + 0.12 * exp(-r2 * 2.0);
  g = mix(g, bokeh, coc);
  return r1.rgb * g * 1.15;
}

@compute @workgroup_size(256)
fn splatClear(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i < SU.tilesX * SU.tilesY) { atomicStore(&tcount[i], 0u); atomicStore(&tfill[i], 0u); }
  if (i == 0u) { atomicStore(&args[0], 4u); atomicStore(&args[1], 0u); atomicStore(&args[2], 0u); atomicStore(&args[3], 0u); }
}

@compute @workgroup_size(256)
fn splatClassify(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= SU.count) { return; }
  let r0 = motes[i * ${S}u];
  let r1 = motes[i * ${S}u + 1u];
  let k = kind(r0, r1);
  if (k == 2u) { large[atomicAdd(&args[1], 1u)] = i; return; }
  if (k == 0u) { return; }
  let p = pixels(r0);
  for (var ty = p.y / TILE; ty <= p.w / TILE; ty++) {
    for (var tx = p.x / TILE; tx <= p.z / TILE; tx++) { atomicAdd(&tcount[u32(ty) * SU.tilesX + u32(tx)], 1u); }
  }
}

var<workgroup> part: array<u32, 256>;
@compute @workgroup_size(256)
fn splatScan(@builtin(local_invocation_index) li: u32) {
  let n = SU.tilesX * SU.tilesY;
  let per = (n + 255u) / 256u;
  let b = li * per;
  let e = min(b + per, n);
  var s = 0u;
  for (var t = b; t < e; t++) { s += atomicLoad(&tcount[t]); }
  part[li] = s;
  workgroupBarrier();
  for (var off = 1u; off < 256u; off <<= 1u) {
    var v = 0u;
    if (li >= off) { v = part[li - off]; }
    workgroupBarrier();
    part[li] += v;
    workgroupBarrier();
  }
  var run = part[li] - s;
  for (var t = b; t < e; t++) { toffs[t] = run; run += atomicLoad(&tcount[t]); }
}

@compute @workgroup_size(256)
fn splatScatter(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= SU.count) { return; }
  let r0 = motes[i * ${S}u];
  let r1 = motes[i * ${S}u + 1u];
  if (kind(r0, r1) != 1u) { return; }
  let p = pixels(r0);
  for (var ty = p.y / TILE; ty <= p.w / TILE; ty++) {
    for (var tx = p.x / TILE; tx <= p.z / TILE; tx++) {
      let t = u32(ty) * SU.tilesX + u32(tx);
      let at = toffs[t] + atomicAdd(&tfill[t], 1u);
      if (at < SU.listCap) { tlist[at] = i; }
    }
  }
}

var<workgroup> acc: array<atomic<u32>, ${TILE * TILE * 3}>;
@compute @workgroup_size(${TILE}, ${TILE})
fn splatTile(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_id) lid: vec3u, @builtin(local_invocation_index) li: u32) {
  atomicStore(&acc[li * 3u], 0u);
  atomicStore(&acc[li * 3u + 1u], 0u);
  atomicStore(&acc[li * 3u + 2u], 0u);
  workgroupBarrier();
  let t = wid.y * SU.tilesX + wid.x;
  let t0 = vec2i(wid.xy) * TILE;
  let begin = toffs[t];
  let n = min(atomicLoad(&tcount[t]), SU.listCap - min(begin, SU.listCap));
  for (var k = li; k < n; k += ${TILE * TILE}u) {
    let i = tlist[begin + k];
    let r0 = motes[i * ${S}u];
    let r1 = motes[i * ${S}u + 1u];
    let p = pixels(r0);
    let lo = max(p.xy, t0);
    let hi = min(p.zw, t0 + TILE - 1);
    for (var y = lo.y; y <= hi.y; y++) {
      for (var x = lo.x; x <= hi.x; x++) {
        let c = shade(i, r0, r1, vec2f(f32(x) + 0.5, f32(y) + 0.5));
        let q = vec3u(floor(max(c, vec3f(0.0)) * SCALE + 0.5));
        if (q.x + q.y + q.z == 0u) { continue; }
        let a = u32((y - t0.y) * TILE + (x - t0.x)) * 3u;
        atomicAdd(&acc[a], q.x);
        atomicAdd(&acc[a + 1u], q.y);
        atomicAdd(&acc[a + 2u], q.z);
      }
    }
  }
  workgroupBarrier();
  let px = t0 + vec2i(lid.xy);
  let vp = vec2i(SU.vp);
  if (px.x < vp.x && px.y < vp.y) {
    let v = vec3f(f32(atomicLoad(&acc[li * 3u])), f32(atomicLoad(&acc[li * 3u + 1u])), f32(atomicLoad(&acc[li * 3u + 2u]))) / SCALE;
    // GL window rows are bottom-up; the target's are top-down
    textureStore(outTex, vec2i(px.x, vp.y - 1 - px.y), vec4f(v, 0.0));
  }
}
`;
}

/** Adds the splat layer into the HDR target (blend one / one). */
export function buildAddSplatWGSL(): string {
  return /* wgsl */ `// generated — add the splat layer
@group(0) @binding(0) var splat: texture_2d<f32>;
@vertex
fn vsTri(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u)) * 2.0 - 1.0;
  return vec4f(p, 0.0, 1.0);
}
@fragment
fn fsAdd(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  return vec4f(textureLoad(splat, vec2i(fc.xy), 0).rgb, 0.0);
}
`;
}
