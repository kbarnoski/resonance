// collide-wgsl.ts — the GPU twin of depth-collide.ts (phase D): one pass after
// the simulation (and the fluid), per mote, two depth slots.
import { layoutStruct, structWGSL } from "./layout";
import { COLLIDE_LAWS } from "./depth-collide";

export const COLLIDE_LAYOUT = layoutStruct("CollideU", [
  { name: "vp", type: "mat4x4f", doc: "the conductor's view-projection (GL clip)" },
  { name: "eye", type: "vec3f", doc: "unit vector toward the camera" },
  { name: "focal", type: "f32" },
  { name: "rectA", type: "vec4f", doc: "slot A still rect (screen fractions, y down)" },
  { name: "rectB", type: "vec4f" },
  { name: "weights", type: "vec2f", doc: "slot weights (glided) × strength" },
  { name: "dt", type: "f32" },
  { name: "imgGate", type: "f32", doc: "1 − image form (emblems never collide)" },
  { name: "plane", type: "f32" },
  { name: "span", type: "f32" },
  { name: "lead", type: "f32" },
  { name: "count", type: "u32" },
]);

export const COLLIDE_BINDINGS = { uniforms: 0, pos: 1, vel: 2, depthA: 3, depthB: 4, sampler: 5 } as const;

export function buildCollideWGSL(): string {
  const L = COLLIDE_LAWS;
  const f = (x: number) => x.toFixed(4);
  return /* wgsl */ `// generated — depth collisions (phase D)
${structWGSL(COLLIDE_LAYOUT)}
@group(0) @binding(${COLLIDE_BINDINGS.uniforms}) var<uniform> CU: CollideU;
@group(0) @binding(${COLLIDE_BINDINGS.pos}) var<storage, read> pos: array<vec4f>;
@group(0) @binding(${COLLIDE_BINDINGS.vel}) var<storage, read_write> vel: array<vec4f>;
@group(0) @binding(${COLLIDE_BINDINGS.depthA}) var depthA: texture_2d<f32>;
@group(0) @binding(${COLLIDE_BINDINGS.depthB}) var depthB: texture_2d<f32>;
@group(0) @binding(${COLLIDE_BINDINGS.sampler}) var lin: sampler;

const PUSH = ${f(L.PUSH)};
const MAX_ACC = ${f(L.MAX_ACC)};
const NORMAL_DAMP = ${f(L.NORMAL_DAMP)};
const FRICTION = ${f(L.FRICTION)};

// screen fractions (y down) → the still's uv; outside the picture: no surface
fn stillDepth(t: texture_2d<f32>, r: vec4f, s: vec2f) -> f32 {
  let uv = (s - r.xy) / max(r.zw, vec2f(1e-6));
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return 0.0; }
  return textureSampleLevel(t, lin, uv, 0.0).r;
}

@compute @workgroup_size(256)
fn collide(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = gid.x + gid.y * nwg.x * 256u;
  if (i >= CU.count) { return; }
  let clip = CU.vp * vec4f(pos[i].xyz, 1.0);
  if (clip.w <= 0.05) { return; }
  let ndc = clip.xy / clip.w;
  let s = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let md = clamp(CU.plane + CU.span * (CU.focal - clip.w) / max(0.1, CU.focal), 0.0, 1.0);
  // the deeper penetration of the two slots, each weighted (crossfades glide)
  var pen = 0.0;
  var k = 0.0;
  if (CU.weights.x > 0.0) {
    let p = stillDepth(depthA, CU.rectA, s) - CU.lead - md;
    if (p > 0.0) { pen = max(pen, p); k = max(k, CU.weights.x); }
  }
  if (CU.weights.y > 0.0) {
    let p = stillDepth(depthB, CU.rectB, s) - CU.lead - md;
    if (p > 0.0) { pen = max(pen, p); k = max(k, CU.weights.y); }
  }
  k *= CU.imgGate;
  if (pen <= 0.0 || k <= 0.0) { return; }
  let penW = pen * max(0.1, CU.focal) / max(1e-3, CU.span);
  let v = vel[i];
  let e = CU.eye;
  let acc = min(MAX_ACC, PUSH * penW) * k;
  let vn = dot(v.xyz, e);
  let into = min(0.0, vn);
  let dampN = 1.0 - exp(-NORMAL_DAMP * CU.dt * k);
  let fric = exp(-FRICTION * CU.dt * k);
  let vt = v.xyz - vn * e;
  vel[i] = vec4f(vt * fric + (vn - into * dampN) * e + e * acc * CU.dt, v.w);
}
`;
}
