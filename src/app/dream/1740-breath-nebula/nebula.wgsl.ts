// ─────────────────────────────────────────────────────────────────────────────
// 1740-breath-nebula — WGSL shader strings.
//
// Two GPU stages, one persistent particle storage buffer:
//
//   COMPUTE (advectWGSL): each frame every particle is advected through a 3-D
//   curl-noise flow field (analytic curl of a value-noise vector potential, so
//   the flow is ~divergence-free — filaments, no sinks) plus a signed *breath
//   radial force*. Particles age and, past a seeded lifetime, respawn on the
//   emitter shell. The field is a pure function of position + a time uniform;
//   no JS randomness reaches the GPU update path.
//
//   RENDER (renderWGSL): the same buffer is read (read-only) in the vertex
//   stage. Each particle is expanded into a camera-facing quad, sized/coloured
//   by local speed and the breath amplitude, drawn additively as a soft round
//   point. Colour sweeps deep indigo → violet → warm-white bloom cores.
// ─────────────────────────────────────────────────────────────────────────────

/** Bytes per particle in the storage buffer: pos(vec3)+age, vel(vec3)+seed. */
export const PARTICLE_FLOATS = 8; // 32 bytes, 16-byte aligned struct

export const WORKGROUP = 64;

// ── Shared particle struct (identical byte layout in both shaders) ───────────
const PARTICLE_STRUCT = /* wgsl */ `
struct Particle {
  pos  : vec3<f32>,
  age  : f32,
  vel  : vec3<f32>,
  seed : f32,
};
`;

// ── Compute: curl-noise advection + breath radial force + respawn ────────────
export const advectWGSL = /* wgsl */ `
${PARTICLE_STRUCT}

struct Sim {
  count        : u32,
  time         : f32,
  dt           : f32,
  radialForce  : f32,
  flowScale    : f32,
  flowStrength : f32,
  emitterRadius: f32,
  maxAge       : f32,
  breathAmp    : f32,
  damping      : f32,
  boundRadius  : f32,
  swirl        : f32,
};

@group(0) @binding(0) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(1) var<uniform> S : Sim;

fn hash31(p: vec3<f32>) -> f32 {
  var p3 = fract(p * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn hash33(p: vec3<f32>) -> vec3<f32> {
  var p3 = fract(p * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

// Smooth value noise in [-1,1] with quintic interpolation (C2 — safe for the
// finite-difference curl below).
fn vnoise(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let n000 = hash31(i + vec3<f32>(0.0, 0.0, 0.0));
  let n100 = hash31(i + vec3<f32>(1.0, 0.0, 0.0));
  let n010 = hash31(i + vec3<f32>(0.0, 1.0, 0.0));
  let n110 = hash31(i + vec3<f32>(1.0, 1.0, 0.0));
  let n001 = hash31(i + vec3<f32>(0.0, 0.0, 1.0));
  let n101 = hash31(i + vec3<f32>(1.0, 0.0, 1.0));
  let n011 = hash31(i + vec3<f32>(0.0, 1.0, 1.0));
  let n111 = hash31(i + vec3<f32>(1.0, 1.0, 1.0));
  let nx00 = mix(n000, n100, u.x);
  let nx10 = mix(n010, n110, u.x);
  let nx01 = mix(n001, n101, u.x);
  let nx11 = mix(n011, n111, u.x);
  let nxy0 = mix(nx00, nx10, u.y);
  let nxy1 = mix(nx01, nx11, u.y);
  return mix(nxy0, nxy1, u.z) * 2.0 - 1.0;
}

// Vector potential — three decorrelated noise fields, slowly drifting in time.
fn potential(p: vec3<f32>) -> vec3<f32> {
  let t = S.time * 0.05;
  let o1 = vec3<f32>(31.41, 17.70, 7.30);
  let o2 = vec3<f32>(-13.20, 45.60, -22.10);
  let a = vnoise(p + vec3<f32>(0.0, 0.0, t));
  let b = vnoise(p + o1 + vec3<f32>(t, 0.0, 0.0));
  let c = vnoise(p + o2 + vec3<f32>(0.0, t, 0.0));
  return vec3<f32>(a, b, c);
}

// Curl of the potential ≈ divergence-free flow (filaments, not sinks).
fn curlNoise(p: vec3<f32>) -> vec3<f32> {
  let e = 0.1;
  let dx = vec3<f32>(e, 0.0, 0.0);
  let dy = vec3<f32>(0.0, e, 0.0);
  let dz = vec3<f32>(0.0, 0.0, e);
  let px0 = potential(p - dx); let px1 = potential(p + dx);
  let py0 = potential(p - dy); let py1 = potential(p + dy);
  let pz0 = potential(p - dz); let pz1 = potential(p + dz);
  let x = (py1.z - py0.z) - (pz1.y - pz0.y);
  let y = (pz1.x - pz0.x) - (px1.z - px0.z);
  let z = (px1.y - px0.y) - (py1.x - py0.x);
  return vec3<f32>(x, y, z) / (2.0 * e);
}

fn respawn(idx: u32, seed: f32) -> Particle {
  let h = hash33(vec3<f32>(seed * 91.7, S.time * 0.13, f32(idx) * 0.017));
  let theta = h.x * 6.2831853;
  let phi = acos(2.0 * h.y - 1.0);
  let r = S.emitterRadius * (0.7 + 0.35 * h.z);
  let dir = vec3<f32>(sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta));
  var pt : Particle;
  pt.pos = dir * r;
  pt.vel = dir * 0.05;
  pt.age = 0.0;
  pt.seed = seed;
  return pt;
}

@compute @workgroup_size(${WORKGROUP})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let idx = gid.x;
  if (idx >= S.count) { return; }
  var pt = particles[idx];

  // 1. curl-noise advection
  let flow = curlNoise(pt.pos * S.flowScale);
  pt.vel = pt.vel + flow * S.flowStrength * S.dt;

  // 2. breath radial force (signed: inhale outward, exhale inward)
  let d = length(pt.pos) + 1e-4;
  let rdir = pt.pos / d;
  pt.vel = pt.vel + rdir * S.radialForce * S.dt;

  // 3. slow nebular swirl about Y
  let tang = vec3<f32>(-pt.pos.z, 0.0, pt.pos.x);
  pt.vel = pt.vel + tang * S.swirl * S.dt;

  // 4. integrate + damp
  pt.vel = pt.vel * S.damping;
  pt.pos = pt.pos + pt.vel * S.dt;
  pt.age = pt.age + S.dt;

  // 5. respawn on seeded lifetime or escape
  let far = length(pt.pos);
  if (pt.age > S.maxAge * (0.6 + 0.6 * pt.seed) || far > S.boundRadius) {
    pt = respawn(idx, fract(pt.seed + 0.6180339));
  }

  particles[idx] = pt;
}
`;

// ── Render: expand particles to additive quads, colour by speed + breath ─────
export const renderWGSL = /* wgsl */ `
${PARTICLE_STRUCT}

struct Cam {
  viewProj   : mat4x4<f32>,
  pointSize  : f32,
  brightness : f32,
  breathAmp  : f32,
  aspect     : f32,
};

@group(0) @binding(0) var<storage, read> particles : array<Particle>;
@group(0) @binding(1) var<uniform> C : Cam;

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) uv        : vec2<f32>,
  @location(1) color     : vec3<f32>,
  @location(2) intensity : f32,
};

// Deep indigo → violet → warm-white bloom core.
fn nebulaColor(t: f32) -> vec3<f32> {
  let deep   = vec3<f32>(0.05, 0.03, 0.16);
  let indigo = vec3<f32>(0.28, 0.22, 0.72);
  let violet = vec3<f32>(0.55, 0.36, 0.97);
  let warm   = vec3<f32>(1.00, 0.93, 0.82);
  let tc = clamp(t, 0.0, 1.0);
  if (tc < 0.40) { return mix(deep, indigo, tc / 0.40); }
  if (tc < 0.75) { return mix(indigo, violet, (tc - 0.40) / 0.35); }
  return mix(violet, warm, (tc - 0.75) / 0.25);
}

@vertex
fn vs(@builtin(vertex_index) vi : u32,
      @builtin(instance_index) ii : u32) -> VSOut {
  let pt = particles[ii];

  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
  );
  let corner = corners[vi];

  var clip = C.viewProj * vec4<f32>(pt.pos, 1.0);

  let speed = length(pt.vel);
  let sizeScale = C.pointSize * (0.55 + speed * 5.5);
  var offset = corner * sizeScale;
  offset.x = offset.x / C.aspect; // keep points square in screen space

  clip.x = clip.x + offset.x * clip.w;
  clip.y = clip.y + offset.y * clip.w;

  var out : VSOut;
  out.position = clip;
  out.uv = corner;
  let t = clamp(speed * 2.6 + C.breathAmp * 0.35, 0.0, 1.0);
  out.color = nebulaColor(t);
  out.intensity = C.brightness * (0.35 + 0.65 * C.breathAmp);
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let d = length(in.uv);
  let falloff = exp(-d * d * 4.0) * (1.0 - smoothstep(0.85, 1.0, d));
  let a = falloff * in.intensity;
  // premultiplied colour for additive (one, one) blending
  return vec4<f32>(in.color * a, a);
}
`;
