// ot-wgsl.ts — the GPU twin of ot.ts (phase E). Per image: otInit once, then
// per slice otClear → otHist → otScan → otUpdate (each slice its own uniform
// block: SLICES_PER_FRAME slots), then otWrite (targets → uv for the sim).
import { layoutStruct, structWGSL } from "./layout";
import { OT_LAWS } from "./ot";

export const OT_LAYOUT = layoutStruct("OtU", [
  { name: "planeR", type: "vec3f" },
  { name: "imgAspect", type: "f32" },
  { name: "planeU", type: "vec3f" },
  { name: "scrAspect", type: "f32" },
  { name: "dir", type: "vec2f", doc: "this slice's direction" },
  { name: "n", type: "u32" },
]);
export const OT_BINDINGS = { uniforms: 0, pos: 1, samples: 2, y: 3, t: 4, hist: 5, cdf: 6, out: 7 } as const;
export const OT_ENTRIES = ["otInit", "otClear", "otHist", "otScan", "otUpdate", "otWrite"] as const;

export function buildOtWGSL(): string {
  const B = OT_LAWS.BINS;
  return /* wgsl */ `// generated — sliced optimal transport (phase E)
${structWGSL(OT_LAYOUT)}
@group(0) @binding(${OT_BINDINGS.uniforms}) var<uniform> OU: OtU;
@group(0) @binding(${OT_BINDINGS.pos}) var<storage, read> pos: array<vec4f>;
@group(0) @binding(${OT_BINDINGS.samples}) var<storage, read> samples: array<vec2f>;
@group(0) @binding(${OT_BINDINGS.y}) var<storage, read_write> Y: array<vec2f>;
@group(0) @binding(${OT_BINDINGS.t}) var<storage, read_write> T: array<vec2f>;
@group(0) @binding(${OT_BINDINGS.hist}) var<storage, read_write> hist: array<atomic<u32>, ${2 * B}>;
@group(0) @binding(${OT_BINDINGS.cdf}) var<storage, read_write> cdf: array<u32, ${2 * B}>;
@group(0) @binding(${OT_BINDINGS.out}) var<storage, read_write> outUv: array<vec2f>;

const BINS = ${B}u;
const RANGE = ${OT_LAWS.RANGE.toFixed(1)};
// slice k's direction (ot.ts sliceDir): angle k × 2.399963229728653 + 0.37

fn lin(gid: vec3u, nwg: vec3u) -> u32 { return gid.x + gid.y * nwg.x * 256u; }
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rankHash(i: u32) -> f32 { return f32(pcg(i) >> 8u) / 16777216.0; }
fn binOf(x: f32) -> u32 {
  let w = 2.0 * RANGE / f32(BINS);
  return u32(clamp(floor((x + RANGE) / w), 0.0, f32(BINS - 1u)));
}
fn planeNdc(p: vec3f) -> vec2f { return vec2f(dot(p, OU.planeR) / dot(OU.planeR, OU.planeR), dot(p, OU.planeU) / dot(OU.planeU, OU.planeU)); }
fn coverNdc(uv: vec2f) -> vec2f {
  var d = (uv - 0.5) * 2.0 * 1.06;
  if (OU.imgAspect > OU.scrAspect) { d.x *= OU.imgAspect / OU.scrAspect; } else { d.y *= OU.scrAspect / OU.imgAspect; }
  return d;
}
fn uncoverNdc(x: vec2f) -> vec2f {
  var d = x;
  if (OU.imgAspect > OU.scrAspect) { d.x /= OU.imgAspect / OU.scrAspect; } else { d.y /= OU.scrAspect / OU.imgAspect; }
  return d / (2.0 * 1.06) + 0.5;
}

// targets start AT the motes (the form gathers from where the field is)
@compute @workgroup_size(256)
fn otInit(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= OU.n) { return; }
  Y[i] = clamp(planeNdc(pos[i].xyz), vec2f(-RANGE), vec2f(RANGE));
  T[i] = coverNdc(samples[i]);
}
@compute @workgroup_size(256)
fn otClear(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x < 2u * BINS) { atomicStore(&hist[gid.x], 0u); }
}
@compute @workgroup_size(256)
fn otHist(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= OU.n) { return; }
  atomicAdd(&hist[binOf(dot(Y[i], OU.dir))], 1u);
  atomicAdd(&hist[BINS + binOf(dot(T[i], OU.dir))], 1u);
}
var<workgroup> part: array<u32, 256>;
fn scanOne(li: u32, base: u32) {
  let per = BINS / 256u;
  let b = base + li * per;
  var s = 0u;
  for (var k = 0u; k < per; k++) { s += atomicLoad(&hist[b + k]); }
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
  for (var k = 0u; k < per; k++) { cdf[b + k] = run; run += atomicLoad(&hist[b + k]); }
  workgroupBarrier();
}
@compute @workgroup_size(256)
fn otScan(@builtin(local_invocation_index) li: u32) {
  scanOne(li, 0u);
  scanOne(li, BINS);
}
// a mote's quantile among the motes → the same quantile of the image, along dir
@compute @workgroup_size(256)
fn otUpdate(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= OU.n) { return; }
  let y = dot(Y[i], OU.dir);
  let b = binOf(y);
  let q = f32(cdf[b]) + rankHash(i) * f32(atomicLoad(&hist[b]));
  var lo = 0u;
  var hi = BINS - 1u;
  loop {
    if (lo >= hi) { break; }
    let m = (lo + hi + 1u) / 2u;
    if (f32(cdf[BINS + m]) <= q) { lo = m; } else { hi = m - 1u; }
  }
  let ht = f32(atomicLoad(&hist[BINS + lo]));
  var frac = 0.5;
  if (ht > 0.0) { frac = (q - f32(cdf[BINS + lo])) / ht; }
  let w = 2.0 * RANGE / f32(BINS);
  let t = -RANGE + (f32(lo) + frac) * w;
  Y[i] += (t - y) * OU.dir;
}
@compute @workgroup_size(256)
fn otWrite(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= OU.n) { return; }
  outUv[i] = clamp(uncoverNdc(Y[i]), vec2f(0.0), vec2f(1.0));
}
`;
}
