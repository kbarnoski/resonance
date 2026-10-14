// fluid-wgsl.ts — the GPU twin of fluid.ts (phase C). One module, one binding
// table (8 storage buffers — WebGPU's guaranteed per-stage limit), entry points
// run in order: fClear → fP2G → fBlend → fCurl → fAdvect → fDiv → fJacobi ×N
// (two bind groups, ping-pong) → fProject → fG2P.
import { layoutStruct, structWGSL } from "./layout";
import { FLUID_LAWS } from "./fluid";

export const FLUID_LAYOUT = layoutStruct("FluidU", [
  { name: "n", type: "u32", doc: "cells per axis" },
  { name: "count", type: "u32", doc: "motes" },
  { name: "dt", type: "f32" },
  { name: "weight", type: "f32", doc: "the soul's fluid weight (glided)" },
  { name: "boxMin", type: "vec3f" },
  { name: "cell", type: "f32" },
  { name: "couple", type: "f32", doc: "field ← motes this step (1 − e^(−dt/τ))" },
  { name: "follow", type: "f32", doc: "mote ← field this step (× weight)" },
  { name: "damp", type: "f32", doc: "field damping this step" },
  { name: "buoy", type: "f32" },
  { name: "vort", type: "f32" },
  { name: "plume", type: "f32", doc: "bass-driven plume (u/s²)" },
  { name: "imgGate", type: "f32", doc: "1 − image form (emblems never flow)" },
  { name: "dense", type: "f32", doc: "motes per cell at full buoyancy" },
]);

export const FLUID_BINDINGS = { uniforms: 0, pos: 1, vel: 2, acc: 3, uA: 4, uB: 5, aux: 6, pIn: 7, pOut: 8 } as const;
export const FLUID_ENTRIES = ["fClear", "fP2G", "fBlend", "fCurl", "fAdvect", "fDiv", "fJacobi", "fProject", "fG2P"] as const;

export function buildFluidWGSL(): string {
  const S = FLUID_LAWS.SCALE, V = FLUID_LAWS.VMAX;
  return /* wgsl */ `// generated — fluid (phase C)
${structWGSL(FLUID_LAYOUT)}
@group(0) @binding(${FLUID_BINDINGS.uniforms}) var<uniform> FU: FluidU;
@group(0) @binding(${FLUID_BINDINGS.pos}) var<storage, read> pos: array<vec4f>;
@group(0) @binding(${FLUID_BINDINGS.vel}) var<storage, read_write> vel: array<vec4f>;
@group(0) @binding(${FLUID_BINDINGS.acc}) var<storage, read_write> acc: array<atomic<i32>>;
@group(0) @binding(${FLUID_BINDINGS.uA}) var<storage, read_write> uA: array<vec4f>;
@group(0) @binding(${FLUID_BINDINGS.uB}) var<storage, read_write> uB: array<vec4f>;
@group(0) @binding(${FLUID_BINDINGS.aux}) var<storage, read_write> aux: array<vec4f>;
@group(0) @binding(${FLUID_BINDINGS.pIn}) var<storage, read_write> pIn: array<f32>;
@group(0) @binding(${FLUID_BINDINGS.pOut}) var<storage, read_write> pOut: array<f32>;

const SCALE = ${S}.0;
const VMAX = ${V}.0;

fn lin(gid: vec3u, nwg: vec3u) -> u32 { return gid.x + gid.y * nwg.x * 256u; }
fn cells() -> u32 { return FU.n * FU.n * FU.n; }
fn ci(c: vec3i) -> u32 {
  let m = i32(FU.n) - 1;
  let q = clamp(c, vec3i(0), vec3i(m));
  return (u32(q.z) * FU.n + u32(q.y)) * FU.n + u32(q.x);
}
fn coord(i: u32) -> vec3i { return vec3i(i32(i % FU.n), i32((i / FU.n) % FU.n), i32(i / (FU.n * FU.n))); }
fn inside(c: vec3i) -> bool { return all(c >= vec3i(0)) && all(c < vec3i(i32(FU.n))); }
fn uAt(f: u32, c: vec3i) -> vec3f {
  // closed box: zero velocity outside
  if (!inside(c)) { return vec3f(0.0); }
  if (f == 0u) { return uA[ci(c)].xyz; }
  return uB[ci(c)].xyz;
}
fn sampleA(p: vec3f) -> vec3f {
  let q = (p - FU.boxMin) / FU.cell - 0.5;
  let i = vec3i(floor(q));
  let t = q - floor(q);
  var o = vec3f(0.0);
  for (var dz = 0; dz < 2; dz++) { for (var dy = 0; dy < 2; dy++) { for (var dx = 0; dx < 2; dx++) {
    let w = select(1.0 - t.x, t.x, dx == 1) * select(1.0 - t.y, t.y, dy == 1) * select(1.0 - t.z, t.z, dz == 1);
    o += uA[ci(i + vec3i(dx, dy, dz))].xyz * w;
  } } }
  return o;
}
fn sampleB(p: vec3f) -> vec3f {
  let q = (p - FU.boxMin) / FU.cell - 0.5;
  let i = vec3i(floor(q));
  let t = q - floor(q);
  var o = vec3f(0.0);
  for (var dz = 0; dz < 2; dz++) { for (var dy = 0; dy < 2; dy++) { for (var dx = 0; dx < 2; dx++) {
    let w = select(1.0 - t.x, t.x, dx == 1) * select(1.0 - t.y, t.y, dy == 1) * select(1.0 - t.z, t.z, dz == 1);
    o += uB[ci(i + vec3i(dx, dy, dz))].xyz * w;
  } } }
  return o;
}
fn center(c: vec3i) -> vec3f { return FU.boxMin + (vec3f(c) + 0.5) * FU.cell; }

@compute @workgroup_size(256)
fn fClear(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= cells()) { return; }
  for (var k = 0u; k < 4u; k++) { atomicStore(&acc[i * 4u + k], 0); }
}

@compute @workgroup_size(256)
fn fP2G(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= FU.count) { return; }
  let c = vec3i(floor((pos[i].xyz - FU.boxMin) / FU.cell));
  if (!inside(c)) { return; }
  let v = clamp(vel[i].xyz, vec3f(-VMAX), vec3f(VMAX));
  let k = ci(c) * 4u;
  atomicAdd(&acc[k], i32(round(v.x * SCALE)));
  atomicAdd(&acc[k + 1u], i32(round(v.y * SCALE)));
  atomicAdd(&acc[k + 2u], i32(round(v.z * SCALE)));
  atomicAdd(&acc[k + 3u], i32(SCALE));
}

// the persistent field eases toward the motes' momentum; damping; buoyancy;
// the bass plume (momentum only) → uB
@compute @workgroup_size(256)
fn fBlend(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= cells()) { return; }
  let w = f32(atomicLoad(&acc[i * 4u + 3u]));
  var u = uA[i].xyz * FU.damp;
  if (w > 0.0) {
    let m = vec3f(f32(atomicLoad(&acc[i * 4u])), f32(atomicLoad(&acc[i * 4u + 1u])), f32(atomicLoad(&acc[i * 4u + 2u]))) / w;
    u = mix(u, m, FU.couple);
  }
  let density = clamp(w / SCALE / FU.dense, 0.0, 1.0);
  u.y += FU.buoy * density * FU.dt;
  let p = center(coord(i));
  let src = (1.0 - smoothstep(0.2, 0.6, length(p.xz))) * (1.0 - smoothstep(-1.9, -1.2, p.y));
  u.y += FU.plume * src * FU.dt;
  uB[i] = vec4f(u, w);
}

@compute @workgroup_size(256)
fn fCurl(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= cells()) { return; }
  let c = coord(i);
  let k = 1.0 / (2.0 * FU.cell);
  let dx = (uAt(1u, c + vec3i(1, 0, 0)) - uAt(1u, c - vec3i(1, 0, 0))) * k;
  let dy = (uAt(1u, c + vec3i(0, 1, 0)) - uAt(1u, c - vec3i(0, 1, 0))) * k;
  let dz = (uAt(1u, c + vec3i(0, 0, 1)) - uAt(1u, c - vec3i(0, 0, 1))) * k;
  let w = vec3f(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x);
  aux[i] = vec4f(w, 0.0);
}

// semi-Lagrangian self-advection + vorticity confinement → uA
@compute @workgroup_size(256)
fn fAdvect(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= cells()) { return; }
  let c = coord(i);
  let p = center(c);
  var u = sampleB(p - uB[i].xyz * FU.dt);
  // confinement: f = ε h (N × ω), N = ∇|ω| / |∇|ω||
  let k = 1.0 / (2.0 * FU.cell);
  let g = vec3f(
    length(aux[ci(c + vec3i(1, 0, 0))].xyz) - length(aux[ci(c - vec3i(1, 0, 0))].xyz),
    length(aux[ci(c + vec3i(0, 1, 0))].xyz) - length(aux[ci(c - vec3i(0, 1, 0))].xyz),
    length(aux[ci(c + vec3i(0, 0, 1))].xyz) - length(aux[ci(c - vec3i(0, 0, 1))].xyz)) * k;
  let gl = length(g);
  if (gl > 1e-5) { u += FU.vort * FU.cell * cross(g / gl, aux[i].xyz) * FU.dt; }
  uA[i] = vec4f(u, uB[i].w);
}

@compute @workgroup_size(256)
fn fDiv(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= cells()) { return; }
  let c = coord(i);
  let d = (uAt(0u, c + vec3i(1, 0, 0)).x - uAt(0u, c - vec3i(1, 0, 0)).x
         + uAt(0u, c + vec3i(0, 1, 0)).y - uAt(0u, c - vec3i(0, 1, 0)).y
         + uAt(0u, c + vec3i(0, 0, 1)).z - uAt(0u, c - vec3i(0, 0, 1)).z) / (2.0 * FU.cell);
  aux[i].w = d;
}

@compute @workgroup_size(256)
fn fJacobi(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= cells()) { return; }
  let c = coord(i);
  // the wide stencil = central div of central grad (fluid.ts jacobi)
  let s = pIn[ci(c - vec3i(2, 0, 0))] + pIn[ci(c + vec3i(2, 0, 0))] + pIn[ci(c - vec3i(0, 2, 0))]
        + pIn[ci(c + vec3i(0, 2, 0))] + pIn[ci(c - vec3i(0, 0, 2))] + pIn[ci(c + vec3i(0, 0, 2))];
  pOut[i] = (s - aux[i].w * 4.0 * FU.cell * FU.cell) / 6.0;
}

@compute @workgroup_size(256)
fn fProject(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= cells()) { return; }
  let c = coord(i);
  let k = 1.0 / (2.0 * FU.cell);
  let gp = vec3f(pIn[ci(c + vec3i(1, 0, 0))] - pIn[ci(c - vec3i(1, 0, 0))],
                 pIn[ci(c + vec3i(0, 1, 0))] - pIn[ci(c - vec3i(0, 1, 0))],
                 pIn[ci(c + vec3i(0, 0, 1))] - pIn[ci(c - vec3i(0, 0, 1))]) * k;
  uA[i] = vec4f(uA[i].xyz - gp, uA[i].w);
}

// each mote eases toward the field (motion only; emblems gated out)
@compute @workgroup_size(256)
fn fG2P(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = lin(gid, nwg);
  if (i >= FU.count) { return; }
  let p = pos[i].xyz;
  let c = vec3i(floor((p - FU.boxMin) / FU.cell));
  if (!inside(c)) { return; }
  let k = FU.follow * FU.weight * FU.imgGate;
  if (k <= 0.0) { return; }
  let v = vel[i];
  vel[i] = vec4f(mix(v.xyz, sampleA(p), k), v.w);
}
`;
}
