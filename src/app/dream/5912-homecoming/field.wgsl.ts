// WGSL shaders for the Cosmic Homecoming nebula.
//
// COMPUTE_WGSL — a GPGPU curl-noise flow field. Every particle is advected each
// frame along the curl of a 3D value-noise potential (divergence-free swirling
// flow, per Bridson et al. "Curl-Noise for Procedural Fluid Flow", 2007), plus a
// slow gravitational drift toward a warm central bloom and a galactic swirl.
// Particles that reach the core respawn at the rim → a continuous fall-in.
//
// RENDER_WGSL — expands each particle into an additive soft-glow billboard,
// coloured deep-violet at the rim → warm gold at the core.

// ── shared struct definitions ────────────────────────────────────────────────
const STRUCTS = /* wgsl */ `
struct Particle {
  pos: vec4f,   // xyz = position, w = life (1 → 0)
  vel: vec4f,   // xyz = velocity, w = colour-speed
};

struct Sim {
  dt: f32,
  time: f32,
  fieldScale: f32,
  flowStrength: f32,
  inwardPull: f32,
  coreRadius: f32,
  rimRadius: f32,
  swirl: f32,
  breath: f32,
  deepen: f32,
  pointerX: f32,
  pointerY: f32,
  seed: f32,
  count: f32,
  _p0: f32,
  _p1: f32,
};
`;

// ── value noise + curl (used only by the compute stage) ──────────────────────
const NOISE = /* wgsl */ `
fn hash13(p3in: vec3f) -> f32 {
  var p3 = fract(p3in * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let n000 = hash13(i + vec3f(0.0, 0.0, 0.0));
  let n100 = hash13(i + vec3f(1.0, 0.0, 0.0));
  let n010 = hash13(i + vec3f(0.0, 1.0, 0.0));
  let n110 = hash13(i + vec3f(1.0, 1.0, 0.0));
  let n001 = hash13(i + vec3f(0.0, 0.0, 1.0));
  let n101 = hash13(i + vec3f(1.0, 0.0, 1.0));
  let n011 = hash13(i + vec3f(0.0, 1.0, 1.0));
  let n111 = hash13(i + vec3f(1.0, 1.0, 1.0));
  let x00 = mix(n000, n100, u.x);
  let x10 = mix(n010, n110, u.x);
  let x01 = mix(n001, n101, u.x);
  let x11 = mix(n011, n111, u.x);
  let y0 = mix(x00, x10, u.y);
  let y1 = mix(x01, x11, u.y);
  return mix(y0, y1, u.z);
}

// three offset noise fields form a vector potential ψ; curl(ψ) is divergence-free
fn potential(p: vec3f) -> vec3f {
  return vec3f(
    vnoise(p + vec3f(31.416, 0.0, 0.0)),
    vnoise(p + vec3f(0.0, 47.853, 0.0)),
    vnoise(p + vec3f(0.0, 0.0, 12.793)),
  ) * 2.0 - vec3f(1.0);
}

fn curlNoise(p: vec3f) -> vec3f {
  let e = 0.12;
  let dx = vec3f(e, 0.0, 0.0);
  let dy = vec3f(0.0, e, 0.0);
  let dz = vec3f(0.0, 0.0, e);
  let px0 = potential(p - dx); let px1 = potential(p + dx);
  let py0 = potential(p - dy); let py1 = potential(p + dy);
  let pz0 = potential(p - dz); let pz1 = potential(p + dz);
  let cx = (py1.z - py0.z) - (pz1.y - pz0.y);
  let cy = (pz1.x - pz0.x) - (px1.z - px0.z);
  let cz = (px1.y - px0.y) - (py1.x - py0.x);
  return vec3f(cx, cy, cz) / (2.0 * e);
}
`;

export const COMPUTE_WGSL = /* wgsl */ `
${STRUCTS}
${NOISE}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> sim: Sim;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(sim.count)) { return; }

  var pos = particles[i].pos.xyz;
  var life = particles[i].pos.w;

  // stable per-particle seed derived from index (no host storage needed)
  let pseed = hash13(vec3f(f32(i) * 0.013711, 1.7, 3.3));

  let dist = length(pos) + 1e-4;

  // curl-noise flow field — slowly translated so the nebula churns over time
  let sp = pos * sim.fieldScale + vec3f(0.0, sim.time * 0.02, sim.time * 0.01);
  let flow = curlNoise(sp) * sim.flowStrength;

  // gravitational drift toward the central bloom, deepened by the breath
  let dir = (-pos) / dist;
  let pull = dir * sim.inwardPull * (0.4 + 0.6 * sim.breath);

  // galactic swirl about the vertical axis, stronger near the core
  let tang = vec3f(-pos.z, 0.0, pos.x);
  let swirlV = normalize(tang + vec3f(1e-4)) * sim.swirl / (dist * 0.25 + 1.0);

  // gentle pointer/gyro parallax nudge (fully optional — autonomous without it)
  let steer = vec3f(sim.pointerX, sim.pointerY, 0.0) * 0.6;

  let vel = flow + pull + swirlV + steer;
  pos += vel * sim.dt;
  life -= sim.dt * (0.03 + 0.05 * sim.breath);

  // respawn at the rim once the particle has fallen home
  if (dist < sim.coreRadius || life <= 0.0) {
    let a = hash13(vec3f(pseed, sim.time * 0.37, f32(i))) * 6.2831853;
    let b = (hash13(vec3f(f32(i) * 0.19, pseed * 1.7, sim.time * 0.21)) - 0.5) * 3.1415926;
    let rr = sim.rimRadius * (0.72 + 0.32 * hash13(vec3f(sim.time * 0.3, pseed, f32(i) * 0.13)));
    pos = vec3f(cos(a) * cos(b), sin(b) * 0.55, sin(a) * cos(b)) * rr;
    life = 1.0;
  }

  let spd = clamp(length(vel) / 6.0, 0.0, 1.0);
  particles[i].pos = vec4f(pos, life);
  particles[i].vel = vec4f(vel, spd);
}
`;

export const RENDER_WGSL = /* wgsl */ `
${STRUCTS}

struct Cam {
  viewProj: mat4x4f,
  pointSize: f32,
  brightness: f32,
  time: f32,
  coreGlow: f32,
  aspect: f32,
  coreRadius: f32,
  rimRadius: f32,
  _p: f32,
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> cam: Cam;

struct VSOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec3f,
  @location(2) glow: f32,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  let p = particles[ii];
  let world = p.pos.xyz;
  let life = p.pos.w;
  let spd = p.vel.w;

  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let c = corners[vi];

  let clip = cam.viewProj * vec4f(world, 1.0);

  // screen-constant billboard with a mild near-boost; x corrected for aspect
  let sz = cam.pointSize * (1.0 + spd * 0.6);
  var off = vec2f(c.x * sz / cam.aspect, c.y * sz);

  // colour: warm gold at the core → deep violet at the rim
  let dist = length(world);
  let t = clamp((dist - cam.coreRadius) / (cam.rimRadius - cam.coreRadius), 0.0, 1.0);
  let gold = vec3f(1.0, 0.80, 0.46);
  let hot = vec3f(1.0, 0.95, 0.82);
  let violet = vec3f(0.42, 0.24, 0.86);
  let magenta = vec3f(0.66, 0.28, 0.80);
  var col = mix(gold, violet, t);
  col = mix(col, magenta, smoothstep(0.35, 0.75, t) * 0.5);
  col = mix(hot, col, smoothstep(0.0, 0.14, t));           // white-gold hot centre
  col *= (0.75 + 0.5 * cam.coreGlow) * cam.brightness;

  // life envelope: fade in at the rim, fade out as it falls home
  let fadeIn = smoothstep(1.0, 0.82, life);
  let fadeOut = smoothstep(0.0, 0.22, life);
  let glow = fadeIn * fadeOut;

  var out: VSOut;
  out.clip = vec4f(clip.xy + off * clip.w, clip.z, clip.w);
  out.uv = c;
  out.color = col;
  out.glow = glow;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  let d = length(in.uv);
  let soft = smoothstep(1.0, 0.0, d);
  let intensity = soft * soft * in.glow;
  return vec4f(in.color * intensity, intensity);
}
`;
