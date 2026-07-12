// ─────────────────────────────────────────────────────────────────────────────
// shaders.ts — WGSL for the WebGPU path.
//
//   WGSL_STEP:   one integration step of the driven coupled-oscillator lattice,
//                ping-ponging two storage buffers of per-cell phase.
//   RENDER_WGSL: an instanced-quad render pipeline — one soft additive point per
//                cortical cell, positioned by the inverse log-polar warp
//                (r = exp(u)), breathing (radial displacement) by cos(local phase),
//                coloured violet-forward iridescent by phase.
//
// The step's per-cell math mirrors sim.ts exactly so the CPU fallback agrees.
// ─────────────────────────────────────────────────────────────────────────────

export const WGSL_STEP = /* wgsl */ `
struct StepU {
  dims  : vec2u,   // GX, GV
  frame : u32,
  nSrc  : u32,
  scal  : vec4f,   // K, F, noise, dt
  geo   : vec4f,   // uMin, uMax, _, _
  src   : array<vec4f, 6>, // (k, phi, amp, phase)
};

@group(0) @binding(0) var<storage, read>       inPh  : array<f32>;
@group(0) @binding(1) var<storage, read_write> outPh : array<f32>;
@group(0) @binding(2) var<uniform>             U     : StepU;

fn hash(x: u32) -> f32 {
  var h = x * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  h = (h >> 22u) ^ h;
  return f32(h) / 4294967295.0;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let GX = U.dims.x;
  let GV = U.dims.y;
  if (gid.x >= GX || gid.y >= GV) { return; }
  let i = gid.x;
  let j = gid.y;
  let idx = j * GX + i;
  let th = inPh[idx];

  // neighbours: radial (u) clamps at the edges, angular (v) wraps.
  let im = select(i - 1u, 0u, i == 0u);
  let ip = select(i + 1u, GX - 1u, i == GX - 1u);
  let jm = select(j - 1u, GV - 1u, j == 0u);
  let jp = select(j + 1u, 0u, j == GV - 1u);
  let coup = sin(inPh[j * GX + im] - th) + sin(inPh[j * GX + ip] - th)
           + sin(inPh[jm * GX + i] - th) + sin(inPh[jp * GX + i] - th);

  let un = (f32(i) + 0.5) / f32(GX);
  let uu = U.geo.x + un * (U.geo.y - U.geo.x);
  let v  = ((f32(j) + 0.5) / f32(GV)) * 6.2831853 - 3.14159265;

  var force = 0.0;
  for (var s = 0u; s < U.nSrc; s = s + 1u) {
    let S = U.src[s];
    let Th = S.x * (cos(S.y) * uu + sin(S.y) * v) + S.w;
    force = force + S.z * sin(Th - th);
  }

  let n = hash(idx * 2654435761u ^ (U.frame * 40503u)) - 0.5;
  let dth = U.scal.x * 0.25 * coup + U.scal.y * force + U.scal.z * n;
  outPh[idx] = th + U.scal.w * dth;
}
`;

export const RENDER_WGSL = /* wgsl */ `
struct RendU {
  dims : vec2u,   // GX, GV
  res  : vec2f,   // canvas px
  geo  : vec4f,   // uMin, uMax, expUMax, dpr
  vis  : vec4f,   // breath, bright, hueBase, satMul
};

@group(0) @binding(0) var<storage, read> ph : array<f32>;
@group(0) @binding(1) var<uniform>       R  : RendU;

struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) uv  : vec2f,
  @location(1) col : vec3f,
};

fn hsv2rgb(h: f32, s: f32, v: f32) -> vec3f {
  let k = vec3f(5.0, 3.0, 1.0);
  let p = abs(fract(vec3f(h) + k / 6.0) * 6.0 - 3.0);
  return v * mix(vec3f(1.0), clamp(p - 1.0, vec3f(0.0), vec3f(1.0)), s);
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) inst: u32) -> VSOut {
  let GX = R.dims.x;
  let GV = R.dims.y;
  let i = inst % GX;
  let j = inst / GX;
  let un = (f32(i) + 0.5) / f32(GX);
  let uu = R.geo.x + un * (R.geo.y - R.geo.x);
  let v  = ((f32(j) + 0.5) / f32(GV)) * 6.2831853 - 3.14159265;

  let th = ph[inst];
  let cth = cos(th);
  let br = 0.5 + 0.5 * cth;

  // breathing surface: displace the radius by the local phase (spatial, not flash)
  let r = exp(uu) * (1.0 + R.vis.x * cth) / R.geo.z;
  var p = vec2f(r * cos(v), r * sin(v));

  // inscribe the circle in the min screen dimension
  let a = R.res.x / R.res.y;
  if (a >= 1.0) { p.x = p.x / a; } else { p.y = p.y * a; }

  var corners = array<vec2f, 4>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0)
  );
  let c = corners[vi];
  let sizePx = (0.7 + 2.6 * br) * R.geo.w;
  let off = c * sizePx * 2.0 / R.res;

  var out: VSOut;
  out.pos = vec4f(p + off, 0.0, 1.0);
  out.uv = c;
  let hue = R.vis.z + 0.10 * cth + 0.07 * un + 0.04 * sin(v * 2.0);
  let sat = 0.55 + 0.35 * R.vis.w;
  out.col = hsv2rgb(fract(hue), sat, R.vis.y * (0.22 + 0.9 * br));
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let d = dot(in.uv, in.uv);
  let g = exp(-3.0 * d);
  return vec4f(in.col * g, g);
}
`;
