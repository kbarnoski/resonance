// ─────────────────────────────────────────────────────────────────────────────
// 1972-morphosong / wgsl.ts — the WGSL for the WebGPU-compute organism.
//
//   THREE shader stages, one storage-buffer field of vec2<f32> = [U, V]:
//     1. UPDATE  — one Gray–Scott reaction-diffusion step (9-point Laplacian),
//        ping-ponged between two storage buffers. feed/kill come from the sung
//        pitch; the reaction rate ("grow") comes from vocal RMS. This is Turing's
//        morphogenesis (1952) as a compute kernel.
//     2. STATS   — a single-invocation reduction over a down-sampled slice of the
//        field, writing a handful of spatial-statistic scalars (mean V, variance
//        / "spottiness", mean gradient, spot & stripe fractions). These scalars
//        are read back to the CPU and re-voice the audio: SEE ≈ HEAR.
//     3. RENDER  — a full-screen triangle whose fragment stage samples the field
//        through a log-polar / cortical warp (Bressloff–Cowan V1 map) so the flat
//        petri pattern reads as psychedelic form-constants: tunnels, spirals,
//        honeycomb. Warm psilocybin palette (amber → magenta → violet).
// ─────────────────────────────────────────────────────────────────────────────

// Compute: one Gray–Scott step. binding0 = params (uniform),
// binding1 = src field (read), binding2 = dst field (read_write).
export const UPDATE_WGSL = /* wgsl */ `
struct Params {
  feed: f32,
  kill: f32,
  du: f32,
  dv: f32,
  rate: f32,
  seedAmt: f32,
  width: f32,
  height: f32,
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> src: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec2<f32>>;

fn at(x: i32, y: i32, w: i32, h: i32) -> vec2<f32> {
  let xx = (x + w) % w;
  let yy = (y + h) % h;
  return src[yy * w + xx];
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let w = i32(P.width);
  let h = i32(P.height);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= w || y >= h) { return; }

  let c = at(x, y, w, h);

  // 9-point isotropic Laplacian (weights sum to 0).
  var lap = vec2<f32>(-1.0) * c;
  lap += at(x - 1, y, w, h) * 0.2;
  lap += at(x + 1, y, w, h) * 0.2;
  lap += at(x, y - 1, w, h) * 0.2;
  lap += at(x, y + 1, w, h) * 0.2;
  lap += at(x - 1, y - 1, w, h) * 0.05;
  lap += at(x + 1, y - 1, w, h) * 0.05;
  lap += at(x - 1, y + 1, w, h) * 0.05;
  lap += at(x + 1, y + 1, w, h) * 0.05;

  let u = c.x;
  let v = c.y;
  let uvv = u * v * v;
  let du = P.du * lap.x - uvv + P.feed * (1.0 - u);
  let dv = P.dv * lap.y + uvv - (P.feed + P.kill) * v;

  var nu = u + du * P.rate;
  var nv = v + dv * P.rate;
  nu = clamp(nu, 0.0, 1.0);
  nv = clamp(nv, 0.0, 1.0);

  dst[y * w + x] = vec2<f32>(nu, nv);
}
`;

// Compute: single-invocation reduction to spatial statistics.
// binding0 = field (read), binding1 = stats (read_write, array<f32>).
// stats layout: [sumV, sumV2, sumGrad, count, spotCount, stripeCount, 0, 0]
export const STATS_WGSL = /* wgsl */ `
struct Dims { width: f32, height: f32, step: f32, pad: f32 };

@group(0) @binding(0) var<uniform> D: Dims;
@group(0) @binding(1) var<storage, read> field: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> stats: array<f32>;

@compute @workgroup_size(1)
fn main() {
  let w = i32(D.width);
  let h = i32(D.height);
  let s = max(1, i32(D.step));
  var sumV = 0.0;
  var sumV2 = 0.0;
  var sumG = 0.0;
  var n = 0.0;
  var spot = 0.0;
  var stripe = 0.0;

  var y = 0;
  loop {
    if (y >= h) { break; }
    var x = 0;
    loop {
      if (x >= w) { break; }
      let v = field[y * w + x].y;
      let xr = (x + s) % w;
      let yd = (y + s) % h;
      let vx = field[y * w + xr].y;
      let vy = field[yd * w + x].y;
      let g = abs(v - vx) + abs(v - vy);
      sumV += v;
      sumV2 += v * v;
      sumG += g;
      if (v > 0.42) { spot += 1.0; }
      if (v > 0.16 && v <= 0.42) { stripe += 1.0; }
      n += 1.0;
      x += s;
    }
    y += s;
  }

  stats[0] = sumV;
  stats[1] = sumV2;
  stats[2] = sumG;
  stats[3] = n;
  stats[4] = spot;
  stats[5] = stripe;
  stats[6] = 0.0;
  stats[7] = 0.0;
}
`;

// Render: full-screen triangle + cortical (log-polar) warp of the field.
// binding0 = render params (uniform), binding1 = field (read).
export const RENDER_WGSL = /* wgsl */ `
struct RParams {
  width: f32,
  height: f32,
  time: f32,
  twist: f32,
  rings: f32,
  bright: f32,
  aspect: f32,
  pad: f32,
};

@group(0) @binding(0) var<uniform> R: RParams;
@group(0) @binding(1) var<storage, read> field: array<vec2<f32>>;

struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  var o: VOut;
  let xy = p[vi];
  o.pos = vec4<f32>(xy, 0.0, 1.0);
  o.uv = xy;
  return o;
}

fn frac1(x: f32) -> f32 { return x - floor(x); }

@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
  var uv = in.uv;
  uv.x = uv.x * R.aspect;

  let r = length(uv) + 0.055;
  let theta = atan2(uv.y, uv.x);

  // Cortical retina→V1 map: radius → log, angle → linear. The spiral shear
  // (theta * twist) is what turns concentric Turing rings into tunnels/spirals.
  let lr = log(r);
  var fx = frac1(theta / 6.28318530718 + R.time * 0.008);
  var fy = frac1(lr * R.rings + theta * R.twist + R.time * 0.010);

  let w = i32(R.width);
  let h = i32(R.height);
  let ix = clamp(i32(fx * R.width), 0, w - 1);
  let iy = clamp(i32(fy * R.height), 0, h - 1);
  let cell = field[iy * w + ix];
  let v = cell.y;

  // neighbour difference → iridescent rim on the membranes
  let ix2 = clamp(ix + 1, 0, w - 1);
  let edge = abs(v - field[iy * w + ix2].y) * 8.0;

  // Warm psilocybin palette: deep base → amber → magenta → violet.
  let base = vec3<f32>(0.05, 0.025, 0.06);
  let amber = vec3<f32>(0.96, 0.55, 0.16);
  let magenta = vec3<f32>(0.86, 0.13, 0.52);
  let violet = vec3<f32>(0.46, 0.16, 0.78);

  let t1 = smoothstep(0.08, 0.35, v);
  let t2 = smoothstep(0.30, 0.62, v);
  var col = mix(base, amber, t1);
  col = mix(col, magenta, t2);
  col = mix(col, violet, smoothstep(0.5, 0.85, v));
  col += violet * edge * 0.35;

  // A slow (<0.5 Hz) luminance breathing — never a strobe. Photosensitive-safe.
  let breathe = 0.86 + 0.14 * sin(R.time * 0.30);
  // gentle radial vignette so the tunnel has depth
  let vig = 1.0 - 0.35 * smoothstep(0.7, 1.6, length(uv));
  col = col * R.bright * breathe * vig;

  return vec4<f32>(col, 1.0);
}
`;
