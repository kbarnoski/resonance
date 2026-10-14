// ─────────────────────────────────────────────────────────────────────────────
// wgsl.ts — WGSL generation for the WebGPU particle engine (phase A skeleton).
//
// Every uniform struct is generated from layout.ts (one source of truth for
// JS offsets and WGSL fields). The simulation is a FORCE STACK: each force is
// a small WGSL module with a fixed contract (reads p, v, s, i; adds to f /
// drag; may set tgt), and buildIntegrateWGSL() concatenates the ones asked
// for — the shader-pool model of docs/particle-upgrade-plan.md ("effects
// built from parts"), and the way phase A ports the WebGL souls one by one
// without ever compiling one giant program (the 2026-10-05 kiosk hang).
//
// Passes (docs/webgpu-engine-plan.md §2):
//   seedInit / posInit (compute, once)  →  integrate (compute, every frame)
//   fade (render: dst × decay, blend constant)  →  sprites (render, additive,
//   energy-conserving)  →  govern (compute: mean luminance → exposure slew)
//   →  composite (render: hue-preserving tone map, sRGB, dither → canvas)
// ─────────────────────────────────────────────────────────────────────────────

import { SIM_LAYOUT, RENDER_LAYOUT, GOVERNOR_LAYOUT, WORKGROUP, structWGSL } from "./layout";
import { buildPairWGSL, PAIR_ENTRIES } from "./pair-wgsl";
import { buildSplatWGSL, buildAddSplatWGSL, SPLAT_ENTRIES } from "./splat-wgsl";
import { buildFluidWGSL, FLUID_ENTRIES } from "./fluid-wgsl";
import { buildCollideWGSL } from "./collide-wgsl";

export const SPEC_BINS = 128;

/** Bindings shared by the compute passes (group 0). */
export const SIM_BINDINGS = {
  uniforms: 0,
  pos: 1,
  vel: 2,
  seed: 3,
  uv: 4,
  spec: 5,
} as const;

export const RENDER_BINDINGS = { uniforms: 0, pos: 1, seed: 2 } as const;
export const GOVERN_BINDINGS = { uniforms: 0, hdr: 1, expo: 2 } as const;

// ── shared WGSL ──────────────────────────────────────────────────────────────

/** Integer PCG hash (no fract-of-sin precision loss at 10⁶ indices). */
export const HASH_WGSL = /* wgsl */ `
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
// uniform [0, 1) from (index, stream) — 24 bits, never exactly 1
fn rnd(i: u32, k: u32) -> f32 {
  return f32(pcg(i ^ pcg(k * 0x9E3779B9u + 0x7F4A7C15u)) >> 8u) / 16777216.0;
}
`;

/** Ashima/Gustavson simplex noise with analytic gradient (port of shaders.ts NOISE). */
export const NOISE_WGSL = /* wgsl */ `
fn mod289v3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289v4(x: vec4f) -> vec4f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute4(x: vec4f) -> vec4f { return mod289v4(((x * 34.0) + 10.0) * x); }
fn taylorInvSqrt4(r: vec4f) -> vec4f { return 1.79284291400159 - 0.85373472095314 * r; }
// xyz = gradient, w = value
fn snoiseGrad(v: vec3f) -> vec4f {
  let C = vec2f(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4f(0.0, 0.5, 1.0, 2.0);
  var i = floor(v + dot(v, C.yyy));
  let x0 = v - i + dot(i, C.xxx);
  let g = step(x0.yzx, x0.xyz);
  let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);
  let x1 = x0 - i1 + C.xxx;
  let x2 = x0 - i2 + C.yyy;
  let x3 = x0 - D.yyy;
  i = mod289v3(i);
  let p = permute4(permute4(permute4(
            i.z + vec4f(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4f(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4f(0.0, i1.x, i2.x, 1.0));
  let n_ = 0.142857142857;
  let ns = n_ * D.wyz - D.xzx;
  let j = p - 49.0 * floor(p * ns.z * ns.z);
  let x_ = floor(j * ns.z);
  let y_ = floor(j - 7.0 * x_);
  let x = x_ * ns.x + ns.yyyy;
  let y = y_ * ns.x + ns.yyyy;
  let h = 1.0 - abs(x) - abs(y);
  let b0 = vec4f(x.xy, y.xy);
  let b1 = vec4f(x.zw, y.zw);
  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(h, vec4f(0.0));
  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;
  var p0 = vec3f(a0.xy, h.x);
  var p1 = vec3f(a0.zw, h.y);
  var p2 = vec3f(a1.xy, h.z);
  var p3 = vec3f(a1.zw, h.w);
  let norm = taylorInvSqrt4(vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  let m = max(0.5 - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));
  let m2 = m * m;
  let m4 = m2 * m2;
  let pdotx = vec4f(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3));
  let temp = m2 * m * pdotx;
  var grad = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
  grad += m4.x * p0 + m4.y * p1 + m4.z * p2 + m4.w * p3;
  return vec4f(grad * 105.0, 105.0 * dot(m4, pdotx));
}
// divergence-free curl of three decorrelated potentials
fn curlNoise(p: vec3f) -> vec3f {
  let g1 = snoiseGrad(p).xyz;
  let g2 = snoiseGrad(p + vec3f(31.416, -47.853, 12.793)).xyz;
  let g3 = snoiseGrad(p + vec3f(-233.145, -113.408, -185.31)).xyz;
  return vec3f(g3.y - g2.z, g1.z - g3.x, g2.x - g1.y);
}
`;

/** The lab's procedural forms (and phase A's stand-in figures until the souls
 *  are ported). Each particle's place comes from its own seeds, so a morph A→B
 *  keeps every mote's parameter — continuity, not a reshuffle. */
export const FORM_NAMES = ["sphere", "knot", "rose", "galaxy", "lissajous"] as const;
export type FormName = (typeof FORM_NAMES)[number];

export const FORMS_WGSL = /* wgsl */ `
const TAU = 6.283185307;
fn formPoint(id: u32, s: vec4f) -> vec3f {
  switch id {
    case 1u: { // torus knot (2, 3) — a tube of light
      let t = s.y * TAU;
      let r = cos(3.0 * t) + 2.0;
      let c = vec3f(r * cos(2.0 * t), -sin(3.0 * t), r * sin(2.0 * t)) * 0.36;
      let th = s.z * TAU;
      let rr = 0.075 * sqrt(s.w);
      return c + vec3f(cos(th) * rr, sin(th) * rr, (fract(s.z * 17.31) - 0.5) * rr * 2.0);
    }
    case 2u: { // five-petal rose, filled, a breath of depth
      let th = s.y * TAU;
      let r = abs(cos(2.5 * th)) * sqrt(s.z);
      return vec3f(cos(th) * r, sin(th) * r, (s.w - 0.5) * 0.12 * (1.0 - r)) * 1.05;
    }
    case 3u: { // three-armed galaxy
      let arm = floor(s.w * 3.0);
      let d = pow(s.y, 0.6);
      let th = arm * TAU / 3.0 + d * 4.2 + (fract(s.z * 13.7) - 0.5) * 0.5 * (1.0 - d * 0.5);
      let r = d * 1.25;
      return vec3f(cos(th) * r, (fract(s.z * 7.3) - 0.5) * 0.08 * (1.2 - d), sin(th) * r);
    }
    case 4u: { // lissajous ribbon 3 : 4 : 5
      let t = s.y * TAU;
      let c = vec3f(sin(3.0 * t), sin(4.0 * t + 1.5708) * 0.8, sin(5.0 * t)) * 0.95;
      return c + (vec3f(s.z, s.w, fract(s.z * 31.7)) - 0.5) * 0.05;
    }
    default: { // sphere shell
      let z = s.y * 2.0 - 1.0;
      let th = s.z * TAU;
      let r = sqrt(max(0.0, 1.0 - z * z));
      return vec3f(r * cos(th), z, r * sin(th)) * (0.98 + 0.04 * s.w);
    }
  }
}
`;

// ── the force stack ─────────────────────────────────────────────────────────
// Contract — in scope: i (u32), p / v (vec3f), age (f32), s (seed vec4f),
// drive / level (f32: the mote's own spectrum band); a force ADDS to f (vec3f)
// and drag (f32) and may set tgt (vec3f, the snap target). Forces are
// MOTION ONLY: nothing here can touch size, alpha or colour (WCAG 2.3.1).

export type ForceId = "form" | "image" | "curl" | "impulse";

export interface ForceModule {
  id: ForceId;
  doc: string;
  wgsl: string;
}

export const FORCES: Record<ForceId, ForceModule> = {
  form: {
    id: "form",
    doc: "spring to the procedural target (A → B morph, eased on the CPU)",
    wgsl: /* wgsl */ `
  {
    let home = mix(formPoint(u32(U.shape.x), s), formPoint(u32(U.shape.y), s), U.shape.z) * U.shape.w;
    tgt = home;
    let k = U.spring.x * (1.0 - U.imgForm);
    f += (home - p) * k;
    drag += U.spring.y * (1.0 - U.imgForm);
  }`,
  },
  image: {
    id: "image",
    doc: "spring onto the worn image (importance-sampled uv, cover-fit on the image plane) — the WebGL image law",
    wgsl: /* wgsl */ `
  if (U.imgForm > 0.001 || U.spring.w > 0.5) {
    var t: vec2f;
    if (U.spring.z > 0.5) {
      t = uv[i];
    } else {
      let side = u32(ceil(sqrt(f32(U.count))));
      t = (vec2f(f32(i % side), f32(i / side)) + 0.5 + (s.yz - 0.5) * 0.9) / f32(side);
    }
    let nd = coverNdc(t);
    let img = U.planeC + U.planeR * nd.x + U.planeU * nd.y;
    f = mix(f, (img - p) * 9.0, U.imgForm);
    drag = mix(drag, 4.6, U.imgForm);
    if (U.imgForm > 0.5 || U.spring.w > 0.5) { tgt = img; }
  }`,
  },
  curl: {
    id: "curl",
    doc: "divergence-free curl drift; each mote hears its OWN band (drive) — motion, never light",
    wgsl: /* wgsl */ `
  {
    let cn = curlNoise(p * U.curl.y + vec3f(0.0, U.time * U.curl.z, U.clock.y * 0.05));
    f += cn * U.curl.x * (0.6 + 1.4 * max(drive, 0.0)) * (1.0 - 0.85 * U.imgForm);
  }`,
  },
  impulse: {
    id: "impulse",
    doc: "playful impulses (scatter outward, bounce) — the WebGL laws, motion only",
    wgsl: /* wgsl */ `
  if (U.react.y > 0.001) { f += normalize(p + (s.yzw - 0.5) * 0.3 + vec3f(1e-4)) * U.react.y * 7.0 * (0.4 + s.y); }
  if (abs(U.react.z) > 0.001) { f.y += U.react.z * 9.0 * (0.4 + s.z); }`,
  },
};

export const DEFAULT_FORCES: readonly ForceId[] = ["form", "image", "curl", "impulse"];

function simHeader(): string {
  return /* wgsl */ `${structWGSL(SIM_LAYOUT)}
@group(0) @binding(${SIM_BINDINGS.uniforms}) var<uniform> U: SimU;
@group(0) @binding(${SIM_BINDINGS.pos}) var<storage, read_write> pos: array<vec4f>;
@group(0) @binding(${SIM_BINDINGS.vel}) var<storage, read_write> vel: array<vec4f>;
@group(0) @binding(${SIM_BINDINGS.seed}) var<storage, read_write> seed: array<vec4f>;
@group(0) @binding(${SIM_BINDINGS.uv}) var<storage, read> uv: array<vec2f>;
@group(0) @binding(${SIM_BINDINGS.spec}) var<storage, read> spec: array<vec2f, ${SPEC_BINS}>;
${HASH_WGSL}
fn particleIndex(gid: vec3u, nwg: vec3u) -> u32 { return gid.x + gid.y * nwg.x * ${WORKGROUP}u; }
// NaN / Inf by bit pattern (fast-math compilers may fold x != x away)
fn nonFinite(x: vec3f) -> bool {
  let e = bitcast<vec3u>(x) & vec3u(0x7f800000u);
  return any(e == vec3u(0x7f800000u));
}
fn coverNdc(t: vec2f) -> vec2f {
  var d = (t - 0.5) * 2.0 * 1.06;
  if (U.imgAspect > U.scrAspect) { d.x *= U.imgAspect / U.scrAspect; } else { d.y *= U.scrAspect / U.imgAspect; }
  return d;
}`;
}

/** The simulation module: seedInit + posInit + integrate (one shared layout). */
export function buildSimWGSL(forces: readonly ForceId[] = DEFAULT_FORCES): string {
  const uniq = [...new Set(forces)];
  for (const id of uniq) if (!FORCES[id]) throw new Error(`unknown force ${id}`);
  const body = uniq.map((id) => `  // ── force: ${id} — ${FORCES[id].doc}${FORCES[id].wgsl}`).join("\n");
  return /* wgsl */ `// generated by src/lib/particles/webgpu/wgsl.ts — forces: ${uniq.join(", ")}
${simHeader()}
${NOISE_WGSL}
${FORMS_WGSL}

// seeds: x = band skewed low (piano lives low-mid), yzw = uniform randoms
@compute @workgroup_size(${WORKGROUP})
fn seedInit(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = particleIndex(gid, nwg);
  if (i >= U.count) { return; }
  seed[i] = vec4f(pow(rnd(i, 1u), 1.25), rnd(i, 2u), rnd(i, 3u), rnd(i, 4u));
}

// the boot cloud (radius = U.shape.w; regather packs it tight) — a flattened ball
@compute @workgroup_size(${WORKGROUP})
fn posInit(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = particleIndex(gid, nwg);
  if (i >= U.count) { return; }
  let th = rnd(i, 5u) * TAU;
  let ph = acos(2.0 * rnd(i, 6u) - 1.0);
  let w = pow(rnd(i, 7u), 1.0 / 3.0) * U.shape.w;
  pos[i] = vec4f(sin(ph) * cos(th) * w, cos(ph) * w * 0.4, sin(ph) * sin(th) * w, rnd(i, 8u) * 15.0);
  vel[i] = vec4f(0.0);
}

@compute @workgroup_size(${WORKGROUP})
fn integrate(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = particleIndex(gid, nwg);
  if (i >= U.count) { return; }
  let P4 = pos[i];
  var p = P4.xyz;
  let age = P4.w;
  var v = vel[i].xyz;
  let s = seed[i];
  let band = spec[min(${SPEC_BINS - 1}u, u32(s.x * ${(SPEC_BINS - 1).toFixed(1)} + 0.5))];
  let level = band.x;
  let drive = band.y * U.react.x;
  var f = vec3f(0.0);
  var drag = U.curl.w;
  var tgt = p;
${body}

  // TRANSITIONS ARE ACCELERATION-LIMITED (the WebGL law, uAccCap)
  let fl = length(f);
  if (fl > U.accCap) { f *= U.accCap / fl; }
  v += f * U.dt;
  v *= exp(-drag * U.dt);
  let sp = length(v);
  if (sp > U.maxSpeed) { v *= U.maxSpeed / sp; }
  p += v * U.dt;
  if (U.spring.w > 0.5) { p = tgt; v = vec3f(0.0); }
  if (nonFinite(p) || nonFinite(v) || length(p) > 30.0) {
    p = (s.yzw - 0.5) * 2.0;
    v = vec3f(0.0);
  }
  pos[i] = vec4f(p, age + U.dt);
  vel[i] = vec4f(v, level);
}
`;
}

/** Sprites: instanced quads (4-vertex strip), vertex-pulled from storage. */
export function buildRenderWGSL(): string {
  return /* wgsl */ `// generated by src/lib/particles/webgpu/wgsl.ts — sprites
${structWGSL(RENDER_LAYOUT)}
@group(0) @binding(${RENDER_BINDINGS.uniforms}) var<uniform> R: RenderU;
@group(0) @binding(${RENDER_BINDINGS.pos}) var<storage, read> pos: array<vec4f>;
@group(0) @binding(${RENDER_BINDINGS.seed}) var<storage, read> seed: array<vec4f>;

struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) q: vec2f,
  @location(1) col: vec3f,
};

// luma-preserving hue rotation + saturation in YIQ (colour may follow the
// harmony without ever changing brightness — WCAG 2.3.1)
fn yiq(c: vec3f, hue: f32, sat: f32) -> vec3f {
  let Y = dot(c, vec3f(0.299, 0.587, 0.114));
  let I = dot(c, vec3f(0.596, -0.274, -0.322));
  let Q = dot(c, vec3f(0.211, -0.523, 0.312));
  let ch = cos(hue);
  let sh = sin(hue);
  let I2 = (I * ch - Q * sh) * sat;
  let Q2 = (I * sh + Q * ch) * sat;
  return max(vec3f(Y + 0.956 * I2 + 0.621 * Q2, Y - 0.272 * I2 - 0.647 * Q2, Y - 1.106 * I2 + 1.703 * Q2), vec3f(0.0));
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let corner = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2.0 - 1.0;
  let P = pos[ii];
  let s = seed[ii];
  // density: motes appear / vanish one by one (soft over ~4 % of the field);
  // recycled motes (age < 0) fade in
  let vis = clamp((R.density - s.w) * 25.0 + 0.5, 0.0, 1.0) * smoothstep(-1.6, 0.0, P.w);
  let clip = R.viewProj * vec4f(P.xyz, 1.0);
  if (vis <= 0.0 || clip.w < 0.05) {
    o.clip = vec4f(2.0, 2.0, 2.0, 1.0);
    o.q = vec2f(0.0);
    o.col = vec3f(0.0);
    return o;
  }
  // ENERGY-CONSERVING SPRITE: the drawn footprint never goes below minPx (a
  // band-limited gaussian, sigma >= 0.5 px — no sub-pixel shimmer as a mote
  // drifts), and the peak scales by 1 / area, so a mote's total light is the
  // same at any size: nearness, size scale and (phase B) depth of field change
  // its footprint, never its brightness.
  let sizePx = R.pointPx * R.sizeK * (R.focal / clip.w);
  let drawn = max(sizePx, R.minPx);
  let gain = R.alpha * vis * (R.pointPx * R.pointPx) / (drawn * drawn);
  o.clip = clip + vec4f(corner * drawn * 2.0 / R.viewport * clip.w, 0.0, 0.0);
  o.q = corner;
  let c0 = mix(R.palLow, R.palMid, smoothstep(0.0, 0.5, s.x));
  let c = mix(c0, R.palHigh, smoothstep(0.5, 1.0, s.x));
  o.col = yiq(c, R.hue, R.sat) * gain;
  return o;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  // gaussian, sigma = 1/3 of the half-size, shifted to exactly 0 at the rim
  let r2 = dot(in.q, in.q);
  let w = max(exp(-4.5 * r2) - 0.011109, 0.0) * 1.011234;
  return vec4f(in.col * w, 0.0);
}
`;
}

/** Full-screen triangle (no vertex buffer) shared by fade + composite. */
export const FULLSCREEN_VS = /* wgsl */ `
@vertex
fn vsTri(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u)) * 2.0 - 1.0;
  return vec4f(p, 0.0, 1.0);
}`;

/** Trail persistence: the blend does the work (dst × blend constant). */
export function buildFadeWGSL(): string {
  return /* wgsl */ `// generated — trail fade (blend: src × 0 + dst × constant)
${FULLSCREEN_VS}
@fragment
fn fsFade() -> @location(0) vec4f { return vec4f(0.0); }
`;
}

/** The WCAG 2.3.1 governor, on the GPU: exact mean displayed luminance over a
 *  stride-2 grid of the HDR frame (no mip aliasing), exposure slewed by at
 *  most maxStep per update. One workgroup; never read back. */
export function buildGovernWGSL(): string {
  return /* wgsl */ `// generated — exposure governor
${structWGSL(GOVERNOR_LAYOUT)}
@group(0) @binding(${GOVERN_BINDINGS.uniforms}) var<uniform> G: GovU;
@group(0) @binding(${GOVERN_BINDINGS.hdr}) var hdr: texture_2d<f32>;
@group(0) @binding(${GOVERN_BINDINGS.expo}) var<storage, read_write> expo: array<f32, 4>;
var<workgroup> acc: array<f32, 256>;

@compute @workgroup_size(256)
fn govern(@builtin(local_invocation_index) li: u32) {
  let dims = textureDimensions(hdr);
  var ex = expo[0];
  if (G.init > 0.5) { ex = 1.0; }
  var s = 0.0;
  for (var y = li * 2u; y < dims.y; y += 512u) {
    for (var x = 0u; x < dims.x; x += 2u) {
      let h = textureLoad(hdr, vec2u(x, y), 0).rgb;
      let t = 1.0 - exp(-h * ex);
      s += dot(t, vec3f(0.2126, 0.7152, 0.0722));
    }
  }
  acc[li] = s;
  workgroupBarrier();
  for (var st = 128u; st > 0u; st >>= 1u) {
    if (li < st) { acc[li] += acc[li + st]; }
    workgroupBarrier();
  }
  if (li == 0u) {
    let total = f32(((dims.x + 1u) / 2u) * ((dims.y + 1u) / 2u));
    let m = acc[0] / max(total, 1.0);
    var want = 1.0;
    if (m > G.cap) { want = min(1.0, ex * G.cap / max(m, 1e-6)); }
    let ratio = clamp(want / max(ex, 1e-6), 1.0 - G.maxStep, 1.0 + G.maxStep);
    expo[0] = clamp(ex * ratio, 0.15, 1.0);
    expo[1] = m;
  }
}
`;
}

/** Composite: hue-preserving tone map, sRGB, black-gated dither → canvas. */
export function buildCompositeWGSL(): string {
  return /* wgsl */ `// generated — composite
${structWGSL(GOVERNOR_LAYOUT)}
@group(0) @binding(${GOVERN_BINDINGS.uniforms}) var<uniform> G: GovU;
@group(0) @binding(${GOVERN_BINDINGS.hdr}) var hdr: texture_2d<f32>;
@group(0) @binding(${GOVERN_BINDINGS.expo}) var<storage, read> expo: array<f32, 4>;
${FULLSCREEN_VS}
// interleaved-gradient dither (Jimenez)
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }

@fragment
fn fsComp(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let h = textureLoad(hdr, vec2i(fc.xy), 0).rgb;
  let he = h * expo[0];
  let hm = max(he.r, max(he.g, he.b));
  var t = he;
  if (hm > 1e-6) { t = he * ((1.0 - exp(-hm)) / hm); }
  var c = pow(t, vec3f(1.0 / 2.2));
  c += (ign(fc.xy) - 0.5) / 255.0 * step(0.002, max(t.r, max(t.g, t.b)));
  c = max(c, vec3f(0.0));
  if (G.transparent > 0.5) { return vec4f(c, max(c.r, max(c.g, c.b))); }
  return vec4f(c, 1.0);
}
`;
}

/** Every module the engine compiles, by name (tests + the WGSL validator script). */
export function allModules(): Record<string, string> {
  return {
    sim: buildSimWGSL(),
    render: buildRenderWGSL(),
    fade: buildFadeWGSL(),
    govern: buildGovernWGSL(),
    composite: buildCompositeWGSL(),
    taa: buildTaaWGSL(0.05),
    pair: buildPairWGSL(),
    splat: buildSplatWGSL(),
    addSplat: buildAddSplatWGSL(),
    fluid: buildFluidWGSL(),
    collide: buildCollideWGSL(),
  };
}

/** Entry points per module — the pipelines the engine builds (async). */
export const ENTRY_POINTS: Record<string, readonly string[]> = {
  sim: ["seedInit", "posInit", "integrate"],
  render: ["vs", "fs"],
  fade: ["vsTri", "fsFade"],
  govern: ["govern"],
  composite: ["vsTri", "fsComp"],
  taa: ["vsTri", "fsTaa"],
  pair: PAIR_ENTRIES,
  splat: SPLAT_ENTRIES,
  addSplat: ["vsTri", "fsAdd"],
  fluid: FLUID_ENTRIES,
  collide: ["collide"],
};

/** TEMPORAL RESOLVE (?stable=1): port of shaders.ts TAA_FS — the HDR layer
 *  blended with its history, the history first clamped into the current
 *  frame's 3×3 min/max (widened by `slack`). keep = 0 shows the current frame. */
export function buildTaaWGSL(slack: number): string {
  return /* wgsl */ `// generated — temporal resolve (TAA_FS port)
struct TaaU { keep: f32, _p0: f32, _p1: f32, _p2: f32 };
@group(0) @binding(0) var<uniform> T: TaaU;
@group(0) @binding(1) var cur: texture_2d<f32>;
@group(0) @binding(2) var hist: texture_2d<f32>;
${FULLSCREEN_VS}
const ST_SLACK = ${slack.toFixed(4)};
@fragment
fn fsTaa(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let c = vec2i(fc.xy);
  let lim = vec2i(textureDimensions(cur)) - 1;
  let cv = textureLoad(cur, c, 0).rgb;
  var mn = cv;
  var mx = cv;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      if (x == 0 && y == 0) { continue; }
      let v = textureLoad(cur, clamp(c + vec2i(x, y), vec2i(0), lim), 0).rgb;
      mn = min(mn, v);
      mx = max(mx, v);
    }
  }
  let h = clamp(textureLoad(hist, c, 0).rgb, mn * (1.0 - ST_SLACK), mx * (1.0 + ST_SLACK));
  return vec4f(mix(cv, h, T.keep), 1.0);
}
`;
}
