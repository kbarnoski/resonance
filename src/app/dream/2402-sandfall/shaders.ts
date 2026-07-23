// WGSL for the WebGPU compute + render path of 2402-sandfall.
//
// This is the lab's first compute-shader simulation. The granular solver is
// Jacobi-style Position-Based Dynamics on a fixed-capacity uniform grid:
//
//   integrate -> [ clearGrid -> buildGrid -> solve -> applyCorr ] x iters -> finalize
//
// Each particle GATHERS pushes from its 3x3 grid neighbourhood and writes
// only its own correction (Jacobi), so there are no write races — the whole
// field steps in parallel across tens of thousands of grains. Aggregate
// motion is reduced into a tiny atomic stats buffer that the audio engine
// reads back each frame, so the sound is derived from the simulation.

// Params is laid out as 16 contiguous f32 (64 bytes). Integer-valued fields
// (grid dims, count) are stored as f32 and cast in-shader — every value is
// well under 2^24 so it is exact.
export const PARAMS_FLOATS = 16;

const HEADER = /* wgsl */ `
struct Params {
  world: vec2<f32>,
  r: f32,
  dt: f32,
  gravity: f32,
  cell: f32,
  gx: f32,
  gy: f32,
  count: f32,
  kPerCell: f32,
  imp: vec2<f32>,
  damp: f32,
  _pad: f32,
};

struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  prev: vec2<f32>,
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read_write> counts: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> buckets: array<u32>;
@group(0) @binding(4) var<storage, read_write> corr: array<vec2<f32>>;
@group(0) @binding(5) var<storage, read_write> stats: array<atomic<u32>>;

fn cellTotal() -> u32 { return u32(P.gx) * u32(P.gy); }
`;

export const COMPUTE_WGSL = /* wgsl */ `
${HEADER}

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  // Clear the 4 stats accumulators once per frame (cheap, first threads).
  if (i < 4u) { atomicStore(&stats[i], 0u); }
  if (i >= u32(P.count)) { return; }
  var p = particles[i];
  p.prev = p.pos;
  p.vel.y = p.vel.y + P.gravity * P.dt;
  p.vel = p.vel + P.imp;
  p.pos = p.pos + p.vel * P.dt;
  p.pos.x = clamp(p.pos.x, P.r, P.world.x - P.r);
  p.pos.y = clamp(p.pos.y, P.r, P.world.y - P.r);
  particles[i] = p;
}

@compute @workgroup_size(64)
fn clearGrid(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i < cellTotal()) { atomicStore(&counts[i], 0u); }
}

@compute @workgroup_size(64)
fn buildGrid(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(P.count)) { return; }
  let pos = particles[i].pos;
  let cx = clamp(i32(floor(pos.x / P.cell)), 0, i32(P.gx) - 1);
  let cy = clamp(i32(floor(pos.y / P.cell)), 0, i32(P.gy) - 1);
  let c = u32(cy) * u32(P.gx) + u32(cx);
  let slot = atomicAdd(&counts[c], 1u);
  let K = u32(P.kPerCell);
  if (slot < K) { buckets[c * K + slot] = i; }
}

@compute @workgroup_size(64)
fn solve(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(P.count)) { return; }
  let pi = particles[i].pos;
  let d = P.r * 2.0;
  let K = u32(P.kPerCell);
  let cx = i32(floor(pi.x / P.cell));
  let cy = i32(floor(pi.y / P.cell));
  var corrSum = vec2<f32>(0.0, 0.0);
  var contact = 0.0;
  for (var oy = -1; oy <= 1; oy = oy + 1) {
    let gyv = cy + oy;
    if (gyv < 0 || gyv >= i32(P.gy)) { continue; }
    for (var ox = -1; ox <= 1; ox = ox + 1) {
      let gxv = cx + ox;
      if (gxv < 0 || gxv >= i32(P.gx)) { continue; }
      let c = u32(gyv) * u32(P.gx) + u32(gxv);
      let n = min(atomicLoad(&counts[c]), K);
      for (var s = 0u; s < n; s = s + 1u) {
        let j = buckets[c * K + s];
        if (j == i) { continue; }
        let pj = particles[j].pos;
        var dv = pi - pj;
        let dist = length(dv);
        if (dist < d && dist > 1e-6) {
          let overlap = d - dist;
          dv = dv / dist;
          // Jacobi: move only self by half (neighbour moves itself).
          corrSum = corrSum + dv * (overlap * 0.5);
          contact = contact + overlap * 0.5;
        }
      }
    }
  }
  corr[i] = corrSum;
  atomicAdd(&stats[3], u32(clamp(contact, 0.0, 4.0) * 4096.0));
}

@compute @workgroup_size(64)
fn applyCorr(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(P.count)) { return; }
  var p = particles[i];
  p.pos = p.pos + corr[i];
  p.pos.x = clamp(p.pos.x, P.r, P.world.x - P.r);
  p.pos.y = clamp(p.pos.y, P.r, P.world.y - P.r);
  particles[i] = p;
}

@compute @workgroup_size(64)
fn finalize(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(P.count)) { return; }
  var p = particles[i];
  var v = (p.pos - p.prev) / P.dt;
  v = v * P.damp;
  p.vel = v;
  particles[i] = p;
  let sp = length(v);
  atomicAdd(&stats[0], u32(clamp(sp, 0.0, 8.0) * 4096.0));
  if (v.y > 0.0) { atomicAdd(&stats[1], u32(clamp(v.y, 0.0, 8.0) * 4096.0)); }
  if (sp > 0.03) { atomicAdd(&stats[2], 1u); }
}
`;

export const RENDER_WGSL = /* wgsl */ `
struct Params {
  world: vec2<f32>,
  r: f32,
  dt: f32,
  gravity: f32,
  cell: f32,
  gx: f32,
  gy: f32,
  count: f32,
  kPerCell: f32,
  imp: vec2<f32>,
  damp: f32,
  _pad: f32,
};

struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  prev: vec2<f32>,
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) speed: f32,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32,
      @builtin(instance_index) ii: u32) -> VSOut {
  var offs = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0));
  let o = offs[vi];
  let p = particles[ii];
  let rr = P.r * 1.3;
  let wx = p.pos.x + o.x * rr;
  let wy = p.pos.y + o.y * rr;
  var out: VSOut;
  out.clip = vec4<f32>(wx / P.world.x * 2.0 - 1.0,
                       1.0 - wy / P.world.y * 2.0, 0.0, 1.0);
  out.uv = o;
  out.speed = length(p.vel);
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let dd = length(in.uv);
  if (dd > 1.0) { discard; }
  let t = clamp(in.speed / 1.2, 0.0, 1.0);
  let base = vec3<f32>(0.30, 0.16, 0.55);
  let hot = vec3<f32>(0.85, 0.80, 1.0);
  let col = mix(base, hot, t);
  let a = 1.0 - smoothstep(0.6, 1.0, dd);
  return vec4<f32>(col, a);
}
`;
