// ─────────────────────────────────────────────────────────────────────────────
// shaders.ts — WGSL for the cortical-bloom neural field.
//
// Four programs, all compute except the final blit:
//   WGSL_STEP    — one Gray-Scott activator/inhibitor reaction step on a toroidal
//                  grid. Tuned near its Turing instability this self-organises
//                  into stripes / spots / honeycombs — the emergent cortical
//                  form-constant pattern (Ermentrout & Cowan 1979).
//   WGSL_SPLAT   — inject a local excitation nucleus (tap-to-seed a new bloom).
//   WGSL_RENDER  — the retino-cortical map. For every SCREEN pixel it takes the
//                  complex-log coordinate (log r, theta) and samples the CORTICAL
//                  field there, so cortical stripes read out as spirals / tunnels
//                  and cortical hexagons as an expanding honeycomb.
//   WGSL_REDUCE  — a single-workgroup reduction to a handful of scalar field
//                  statistics (mean activity, energy, spatial-gradient density)
//                  that drive the audio. Cheap, read back asynchronously.
//   BLIT_*       — draw the colour texture to the swap-chain.
//
// The field is stored as array<vec2f>: .x = activator U, .y = inhibitor V.
// ─────────────────────────────────────────────────────────────────────────────

// ── Reaction step (Gray-Scott, weighted 9-point Laplacian, toroidal) ──────────
export const WGSL_STEP = /* wgsl */ `
struct SParams {
  grid : u32,
  pad0 : u32,
  feed : f32,
  kill : f32,
  du   : f32,
  dv   : f32,
  dt   : f32,
  pad1 : f32,
};
@group(0) @binding(0) var<storage, read>       src : array<vec2f>;
@group(0) @binding(1) var<storage, read_write> dst : array<vec2f>;
@group(0) @binding(2) var<uniform>             P   : SParams;

fn wrap(a : i32, n : i32) -> i32 { return (a + n) % n; }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let G = i32(P.grid);
  if (gid.x >= u32(G) || gid.y >= u32(G)) { return; }
  let x = i32(gid.x);
  let y = i32(gid.y);
  let xm = wrap(x - 1, G); let xp = wrap(x + 1, G);
  let ym = wrap(y - 1, G); let yp = wrap(y + 1, G);

  let c = src[y * G + x];
  // 9-point Laplacian: orthogonal 0.2, diagonal 0.05, centre -1 (sum of weights 0).
  let lap =
      (src[y  * G + xm] + src[y  * G + xp] + src[ym * G + x ] + src[yp * G + x ]) * 0.2
    + (src[ym * G + xm] + src[ym * G + xp] + src[yp * G + xm] + src[yp * G + xp]) * 0.05
    - c;

  let u = c.x;
  let v = c.y;
  let reaction = u * v * v;
  let du = P.du * lap.x - reaction + P.feed * (1.0 - u);
  let dv = P.dv * lap.y + reaction - (P.kill + P.feed) * v;
  let nu = clamp(u + du * P.dt, 0.0, 1.0);
  let nv = clamp(v + dv * P.dt, 0.0, 1.0);
  dst[y * G + x] = vec2f(nu, nv);
}
`;

// ── Excitation-nucleus injection ──────────────────────────────────────────────
export const WGSL_SPLAT = /* wgsl */ `
struct SplatParams {
  grid  : u32,
  count : u32,
  pad0  : u32,
  pad1  : u32,
  // each: xy = grid centre, z = radius (cells), w = amplitude
  spots : array<vec4f, 16>,
};
@group(0) @binding(0) var<storage, read_write> fld : array<vec2f>;
@group(0) @binding(1) var<uniform>             SP  : SplatParams;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let G = i32(SP.grid);
  if (gid.x >= u32(G) || gid.y >= u32(G)) { return; }
  let x = f32(gid.x);
  let y = f32(gid.y);
  let idx = i32(gid.y) * G + i32(gid.x);
  var cell = fld[idx];
  var i : u32 = 0u;
  loop {
    if (i >= SP.count) { break; }
    let s = SP.spots[i];
    var dx = x - s.x;
    var dy = y - s.y;
    // toroidal shortest distance
    let gf = f32(G);
    dx = dx - gf * round(dx / gf);
    dy = dy - gf * round(dy / gf);
    let r = max(s.z, 1.0);
    let g = exp(-(dx * dx + dy * dy) / (r * r));
    cell.y = min(1.0, cell.y + s.w * g);
    cell.x = max(0.0, cell.x - s.w * g * 0.5);
    i = i + 1u;
  }
  fld[idx] = cell;
}
`;

// ── Retino-cortical render: complex-log warp of the cortical field to screen ──
export const WGSL_RENDER = /* wgsl */ `
struct RParams {
  grid  : u32,
  outW  : u32,
  outH  : u32,
  pad0  : u32,
  uMin  : f32,   // log(rMin)
  uSpan : f32,   // radial extent per cortical wrap (controls tunnel tiling)
  drift : f32,   // slow inward log-radial drift (tunnel motion)
  vrot  : f32,   // angular sample multiplier
  bright: f32,   // gentle global brightness (density coupled)
  tint  : f32,   // regime hue nudge 0..1
  pad1  : f32,
  pad2  : f32,
};
@group(0) @binding(0) var<storage, read> fld : array<vec2f>;
@group(0) @binding(1) var outTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> R : RParams;

const PI  : f32 = 3.14159265;
const TAU : f32 = 6.28318530;

fn wrapf(a : f32) -> f32 { return a - floor(a); }

fn sampleV(fx : f32, fy : f32, G : i32) -> f32 {
  let gf = f32(G);
  let gx = wrapf(fx) * gf;
  let gy = wrapf(fy) * gf;
  let x0 = i32(floor(gx)) % G;
  let y0 = i32(floor(gy)) % G;
  let x1 = (x0 + 1) % G;
  let y1 = (y0 + 1) % G;
  let tx = fract(gx);
  let ty = fract(gy);
  let v00 = fld[y0 * G + x0].y;
  let v10 = fld[y0 * G + x1].y;
  let v01 = fld[y1 * G + x0].y;
  let v11 = fld[y1 * G + x1].y;
  let a = mix(v00, v10, tx);
  let b = mix(v01, v11, tx);
  return mix(a, b, ty);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  if (gid.x >= R.outW || gid.y >= R.outH) { return; }
  let W = f32(R.outW);
  let H = f32(R.outH);
  let m = min(W, H);
  // centred, aspect-normalised screen coordinate in ~[-1.4, 1.4]
  let sx = (f32(gid.x) - 0.5 * W) / (0.5 * m);
  let sy = (f32(gid.y) - 0.5 * H) / (0.5 * m);

  let r = max(length(vec2f(sx, sy)), 1e-4);
  let u = log(r);
  let theta = atan2(sy, sx);

  // complex-log map: cortical stripes -> spirals/tunnels, hexes -> honeycomb.
  let fu = (u - R.uMin) / R.uSpan + R.drift;          // radial (toroidal)
  let fv = (theta + PI) / TAU * R.vrot;               // angular (toroidal)
  let G = i32(R.grid);
  let vv = sampleV(fu, fv, G);

  // Palette: keep mean luminance calm (safety) — a low, saturated violet→teal→amber.
  let t = clamp(vv * 2.4, 0.0, 1.0);
  let violet = vec3f(0.10, 0.06, 0.20);
  let teal   = vec3f(0.06, 0.42, 0.44);
  let amber  = vec3f(0.72, 0.44, 0.20);
  var col = mix(violet, teal, smoothstep(0.15, 0.65, t));
  col = mix(col, amber, smoothstep(0.6, 1.0, t) * (0.55 + 0.35 * R.tint));

  // gentle radial vignette + faint core glow so it is never flat black
  let vig = 0.55 + 0.45 * exp(-r * r * 1.1);
  let ambient = 0.03 * exp(-r * r * 3.0);
  col = col * vig * R.bright + vec3f(ambient * 0.6, ambient * 0.5, ambient * 0.9);

  col = clamp(col, vec3f(0.0), vec3f(1.0));
  textureStore(outTex, vec2i(i32(gid.x), i32(gid.y)), vec4f(col, 1.0));
}
`;

// ── Field-statistics reduction (single workgroup, 256 lanes) ──────────────────
export const WGSL_REDUCE = /* wgsl */ `
struct QParams { grid : u32, pad0 : u32, pad1 : u32, pad2 : u32 };
@group(0) @binding(0) var<storage, read>       fld   : array<vec2f>;
@group(0) @binding(1) var<storage, read_write> stats : array<f32>;
@group(0) @binding(2) var<uniform>             Q     : QParams;

var<workgroup> sMean : array<f32, 256>;
var<workgroup> sEnrg : array<f32, 256>;
var<workgroup> sGrad : array<f32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid : vec3u) {
  let G = i32(Q.grid);
  let N = G * G;
  let t = i32(lid.x);
  var mAcc = 0.0;
  var eAcc = 0.0;
  var gAcc = 0.0;
  var i = t;
  loop {
    if (i >= N) { break; }
    let x = i % G;
    let y = i / G;
    let v = fld[i].y;
    mAcc = mAcc + v;
    eAcc = eAcc + v * v;
    let xr = (x + 1) % G;
    let yb = (y + 1) % G;
    let vr = fld[y * G + xr].y;
    let vb = fld[yb * G + x].y;
    gAcc = gAcc + abs(vr - v) + abs(vb - v);
    i = i + 256;
  }
  sMean[lid.x] = mAcc;
  sEnrg[lid.x] = eAcc;
  sGrad[lid.x] = gAcc;
  workgroupBarrier();
  var stride : u32 = 128u;
  loop {
    if (stride == 0u) { break; }
    if (lid.x < stride) {
      sMean[lid.x] = sMean[lid.x] + sMean[lid.x + stride];
      sEnrg[lid.x] = sEnrg[lid.x] + sEnrg[lid.x + stride];
      sGrad[lid.x] = sGrad[lid.x] + sGrad[lid.x + stride];
    }
    workgroupBarrier();
    stride = stride / 2u;
  }
  if (lid.x == 0u) {
    let fN = f32(N);
    stats[0] = sMean[0] / fN;
    stats[1] = sEnrg[0] / fN;
    stats[2] = sGrad[0] / fN;
  }
}
`;

// ── Fullscreen blit ───────────────────────────────────────────────────────────
export const BLIT_VERT = /* wgsl */ `
struct VSOut { @builtin(position) pos : vec4f, @location(0) uv : vec2f };
@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  var p = array<vec2f, 4>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0),
  );
  var o : VSOut;
  let q = p[vi];
  o.pos = vec4f(q, 0.0, 1.0);
  o.uv = vec2f((q.x + 1.0) * 0.5, (1.0 - q.y) * 0.5);
  return o;
}
`;

export const BLIT_FRAG = /* wgsl */ `
@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var tex  : texture_2d<f32>;
@fragment
fn fs(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSample(tex, samp, uv);
}
`;
