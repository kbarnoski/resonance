// ── SPATIAL PAIRING on the GPU (port of shaders.ts PAIR_* — spatial-pairing.ts)
// The WebGL passes scatter points into a float histogram with additive
// blending; here the histogram is an atomic<u32> buffer. Same bins (256 angle
// sectors × 64 radius rings), same quantile assignment, same per-mote hash —
// so an emblem gathers "where it is" exactly as in the show (no contract /
// expand through the centre).
import { layoutStruct, structWGSL } from "./layout";

export const PAIR_SECTORS = 256;
export const PAIR_RINGS = 64;
export const PAIR_LAYOUT = layoutStruct("PairU", [
  { name: "planeR", type: "vec3f" },
  { name: "count", type: "f32" },
  { name: "planeU", type: "vec3f" },
  { name: "groups", type: "f32" },
  { name: "texW", type: "u32" },
]);
export const PAIR_BINDINGS = { uniforms: 0, pos: 1, stats: 2, hist: 3, cdf: 4, sorted: 5, out: 6 } as const;
export const PAIR_ENTRIES = ["pairStats", "pairClear", "pairHist", "pairAcdf", "pairRcdf", "pairAssign"] as const;

export function buildPairWGSL(): string {
  const S = PAIR_SECTORS, R = PAIR_RINGS;
  return /* wgsl */ `// generated — spatial pairing (PAIR_* port)
${structWGSL(PAIR_LAYOUT)}
@group(0) @binding(${PAIR_BINDINGS.uniforms}) var<uniform> PU: PairU;
@group(0) @binding(${PAIR_BINDINGS.pos}) var<storage, read> pos: array<vec4f>;
@group(0) @binding(${PAIR_BINDINGS.stats}) var<storage, read_write> stats: array<vec4f, 1>;
@group(0) @binding(${PAIR_BINDINGS.hist}) var<storage, read_write> hist: array<atomic<u32>, ${S * R}>;
@group(0) @binding(${PAIR_BINDINGS.cdf}) var<storage, read_write> cdf: array<vec2f, ${S + S * R}>;
@group(0) @binding(${PAIR_BINDINGS.sorted}) var<storage, read> sorted: array<vec2f>;
@group(0) @binding(${PAIR_BINDINGS.out}) var<storage, read_write> outUv: array<vec2f>;

fn planeNdc(p: vec3f) -> vec2f { return vec2f(dot(p, PU.planeR) / dot(PU.planeR, PU.planeR), dot(p, PU.planeU) / dot(PU.planeU, PU.planeU)); }
fn refIdx(k: u32) -> u32 { return u32((f32(k) + 0.5) / 256.0 * PU.count); }
fn bins(p: vec3f) -> vec2u {
  let st = stats[0];
  let d = planeNdc(p) - st.xy;
  let ua = (atan2(d.y, d.x) + 3.14159265) / 6.2831853;
  let ur = clamp(length(d) / st.z, 0.0, 0.99999);
  return vec2u(u32(min(floor(ua * ${S}.0), ${S - 1}.0)), u32(floor(ur * ${R}.0)));
}
fn h(p: vec2f, k: f32) -> f32 {
  var q = fract(vec3f(p.xyx) * vec3f(0.1031, 0.1030, 0.0973) + k);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
fn lin(gid: vec3u, nwg: vec3u) -> u32 { return gid.x + gid.y * nwg.x * 256u; }

// 1: the field's centre and reach from 256 reference particles
@compute @workgroup_size(1)
fn pairStats() {
  var cen = vec2f(0.0);
  for (var k = 0u; k < 256u; k++) { cen += planeNdc(pos[refIdx(k)].xyz); }
  cen /= 256.0;
  var rmax = 1e-4;
  for (var k = 0u; k < 256u; k++) { rmax = max(rmax, length(planeNdc(pos[refIdx(k)].xyz) - cen)); }
  stats[0] = vec4f(cen, rmax * 1.5, 1.0);
}
@compute @workgroup_size(256)
fn pairClear(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x < ${S * R}u) { atomicStore(&hist[gid.x], 0u); }
}
// 2: every particle into its (sector, ring) bin
@compute @workgroup_size(256)
fn pairHist(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= PU.texW * PU.texW) { return; }
  let b = bins(pos[i].xyz);
  atomicAdd(&hist[b.x + b.y * ${S}u], 1u);
}
// 3: per sector — particles in the sectors before it, and in it
@compute @workgroup_size(256)
fn pairAcdf(@builtin(local_invocation_index) s: u32) {
  var pre = 0.0;
  var own = 0.0;
  for (var a = 0u; a <= s; a++) {
    var row = 0.0;
    for (var r = 0u; r < ${R}u; r++) { row += f32(atomicLoad(&hist[a + r * ${S}u])); }
    if (a < s) { pre += row; } else { own = row; }
  }
  cdf[s] = vec2f(pre, own);
}
// 4: per (sector, ring) — particles inside this ring of the sector, and in it
@compute @workgroup_size(256)
fn pairRcdf(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= ${S * R}u) { return; }
  let a = gid.x % ${S}u;
  let ring = gid.x / ${S}u;
  var pre = 0.0;
  for (var r = 0u; r < ring; r++) { pre += f32(atomicLoad(&hist[a + r * ${S}u])); }
  cdf[${S}u + gid.x] = vec2f(pre, f32(atomicLoad(&hist[gid.x])));
}
// 5: each particle's paired image uv
@compute @workgroup_size(256)
fn pairAssign(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  let n = PU.texW * PU.texW;
  if (i >= n) { return; }
  let c = vec2f(f32(i % PU.texW), f32(i / PU.texW));
  let b = bins(pos[i].xyz);
  let A = cdf[b.x];
  let Rr = cdf[${S}u + b.x + b.y * ${S}u];
  let qa = clamp((A.x + h(c, 0.37) * A.y) / PU.count, 0.0, 0.99999);
  let qr = clamp((Rr.x + h(c, 0.71) * Rr.y) / max(A.y, 1.0), 0.0, 0.99999);
  let g = floor(qa * PU.groups);
  let k = u32(clamp(floor((g + qr) / PU.groups * f32(n)), 0.0, f32(n) - 1.0));
  outUv[i] = sorted[k];
}
`;
}
