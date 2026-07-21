// ─────────────────────────────────────────────────────────────────────────────
// shaders.ts — WGSL for the WebGPU tier.
//
//   COMPUTE: integrates each memory-mote every frame. When C is low a weak
//   dispersal force keeps the field scattered; as C rises, each mote is pulled
//   toward its assigned cluster centroid (a binding term scaled by C), and the
//   centroids themselves converge toward one point at the boundless peak.
//
//   RENDER: instanced soft additive quads reading the same storage buffer.
//   Colour walks deep-void violet → warm gold → white-gold with C.
//
//   Velocity is hard-clamped so nothing can blow up (we cannot GPU-verify here).
// ─────────────────────────────────────────────────────────────────────────────

export const COMPUTE_WGSL = /* wgsl */ `
struct Sim {
  dt: f32,
  time: f32,
  C: f32,
  converge: f32,
  centerX: f32,
  centerY: f32,
  reduced: f32,
  pad: f32,
};

@group(0) @binding(0) var<storage, read_write> state: array<vec4<f32>>;   // pos.xy vel.xy
@group(0) @binding(1) var<storage, read>       params: array<vec4<f32>>;  // home.xy cluster bright
@group(0) @binding(2) var<uniform>             sim: Sim;
@group(0) @binding(3) var<storage, read>       centroids: array<vec2<f32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&state)) { return; }

  var s = state[i];
  var pos = s.xy;
  var vel = s.zw;
  let p = params[i];
  let home = p.xy;
  let ci = u32(p.z);
  let bright = p.w;

  let C = sim.C;
  let dt = sim.dt;
  let center = vec2<f32>(sim.centerX, sim.centerY);

  // Effective centroid: cluster point, collapsing toward the global centre.
  var cen = centroids[ci];
  cen = mix(cen, center, sim.converge);

  var force = vec2<f32>(0.0, 0.0);

  // Dispersal when C is low — gentle return to a scattered home + slow curl drift.
  let disp = 1.0 - C;
  force += (home - pos) * (0.30 * disp);
  let ang = sin(pos.x * 2.7 + sim.time * 0.18 + bright * 6.2831)
          + cos(pos.y * 2.7 - sim.time * 0.15);
  force += vec2<f32>(cos(ang), sin(ang)) * (0.05 * disp);

  // Binding attraction when C is high — pull to the (converging) centroid.
  let toCen = cen - pos;
  let d = length(toCen) + 1e-4;
  let dir = toCen / d;
  force += dir * (C * (1.1 + 0.7 * C)) * min(d, 1.4);

  // A calm orbital swirl so bound constellations shimmer (softened under reduced motion).
  let swirl = vec2<f32>(-dir.y, dir.x);
  let swirlAmt = select(0.45, 0.16, sim.reduced > 0.5);
  force += swirl * (C * swirlAmt) * min(d, 0.7);

  vel += force * dt;

  // Damping: looser when scattered, crisper when bound.
  let damp = mix(0.986, 0.90, C);
  vel = vel * damp;

  // Hard velocity clamp — guarantees stability without GPU verification.
  let vmax = 2.2;
  let vl = length(vel);
  if (vl > vmax) { vel = vel / vl * vmax; }

  pos = pos + vel * dt;

  // Soft bounds.
  let lim = 1.18;
  if (pos.x >  lim) { pos.x =  lim; vel.x = vel.x * -0.3; }
  if (pos.x < -lim) { pos.x = -lim; vel.x = vel.x * -0.3; }
  if (pos.y >  lim) { pos.y =  lim; vel.y = vel.y * -0.3; }
  if (pos.y < -lim) { pos.y = -lim; vel.y = vel.y * -0.3; }

  state[i] = vec4<f32>(pos, vel);
}
`;

export const RENDER_WGSL = /* wgsl */ `
struct Ren {
  C: f32,
  aspect: f32,
  pointSize: f32,
  time: f32,
};

@group(0) @binding(0) var<storage, read> state: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> params: array<vec4<f32>>;
@group(0) @binding(2) var<uniform>       ren: Ren;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) col: vec3<f32>,
  @location(2) intensity: f32,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0,  1.0), vec2<f32>(-1.0,  1.0)
  );
  let corner = corners[vi];
  let s = state[ii];
  let p = params[ii];
  let bright = p.w;
  let C = ren.C;

  let size = ren.pointSize * (0.55 + 0.9 * bright);
  var clip = vec2<f32>(s.x / ren.aspect, s.y);
  clip = clip + corner * size;

  let violet = vec3<f32>(0.42, 0.26, 0.95);
  let gold   = vec3<f32>(1.00, 0.78, 0.42);
  let white  = vec3<f32>(1.00, 0.95, 0.86);
  var c = mix(violet, gold, smoothstep(0.2, 0.8, C));
  c = mix(c, white, smoothstep(0.75, 1.0, C) * (0.4 + 0.6 * bright));

  var out: VSOut;
  out.pos = vec4<f32>(clip, 0.0, 1.0);
  out.uv = corner;
  out.col = c;
  out.intensity = (0.22 + 0.78 * bright) * (0.5 + 0.9 * C) + 0.14;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  let disc = smoothstep(1.0, 0.0, r);
  let alpha = disc * disc * in.intensity * 0.5;
  return vec4<f32>(in.col * alpha, alpha);
}
`;
