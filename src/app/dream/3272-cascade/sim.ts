// Shared simulation model for Cascade.
//
// The play-field is an ISOTROPIC logical space: x in [0, 1], y in [0, FIELD_H]
// where 1 x-unit == 1 y-unit, so deflector angles (cos/sin) are undistorted and
// match the on-screen SVG (which is rendered into a matching-aspect box). y = 0
// is the top (emitter); y = FIELD_H is the bottom (below the bars).
//
// The SAME numeric constants below are (a) used directly by the CPU stepper and
// (b) injected as literals into the WGSL compute shader, so the GPU and CPU
// paths integrate identical physics — only the particle count differs.

export const FIELD_H = 1.6; // logical height (width is 1.0)

export const BAR_COUNT = 9;
export const MAX_DEFLECTORS = 6;

// physics
export const GRAVITY = 1.7; // units / s^2, pulls +y (down)
export const DRAG = 0.999; // per-substep velocity retention
export const RESTITUTION = 0.5; // bounce energy kept off deflectors / walls
export const MAX_SPEED = 2.2; // terminal speed clamp (keeps substeps > thickness)
export const HALF_THICK = 0.022; // deflector half-thickness (collision radius)
export const SUBSTEPS = 2;

// emitter
export const EMITTER_Y = 0.02;
export const EMITTER_WIDTH = 0.14; // spawn x-jitter span
export const EMITTER_VY = 0.15; // initial downward speed

// bars (a row across the bottom)
export const BAR_MARGIN = 0.05; // x-inset on each side of the bar row
export const BAR_TOP = 1.44; // y where the striking surface begins
export const BAR_BOTTOM = 1.55;
export const GAP_FRAC = 0.12; // fraction of each bar cell that is a gap

// flow / recirculation — a spent particle parks then re-releases after a delay
// that shrinks as `flow` rises (flow 1 => dense stream, flow 0 => sparse).
export const PARK_MIN = 0.02;
export const PARK_MAX = 2.2;
export const INITIAL_STAGGER = 2.5; // spread of initial release timers (s)

// particle counts
export const GPU_COUNT = 30_000;
export const CPU_COUNT = 1_400;

export interface DeflectorState {
  cx: number;
  cy: number;
  angle: number; // radians
  halfLen: number;
}

export interface SimParams {
  deflectors: DeflectorState[];
  emitterX: number;
  flow: number; // 0..1
}

export interface Backend {
  readonly kind: "webgpu" | "webgl";
  readonly count: number;
  /** Per-bar strike tally; accumulates across frames. Caller reads then zeroes. */
  readonly hits: Int32Array;
  frame(dt: number, params: SimParams): void;
  dispose(): void;
}

/** Major-pentatonic MIDI degrees for the bar row (low → high). */
export const BAR_MIDI: number[] = [55, 57, 59, 62, 64, 67, 69, 71, 74];

/** x-centre of bar j in [0,1]. */
export function barCenterX(j: number): number {
  const span = 1 - 2 * BAR_MARGIN;
  return BAR_MARGIN + ((j + 0.5) / BAR_COUNT) * span;
}

/** Violet ramp: slow (t=0) → fast (t=1). Returns normalised RGB. */
export function rampRGB(t: number): [number, number, number] {
  const s = t < 0 ? 0 : t > 1 ? 1 : t;
  // violet-600 (#5b2ec9) → violet-300 (#c4b5fd)
  const r = 0.357 + (0.769 - 0.357) * s;
  const g = 0.18 + (0.71 - 0.18) * s;
  const b = 0.788 + (0.992 - 0.788) * s;
  return [r, g, b];
}

// ── initial particle state ────────────────────────────────────────────────
// posvel: xy = position, zw = velocity. meta: x = releaseTimer, y = seed,
// z = state (0 = parked/hidden, 1 = active), w = spare.

export interface SimState {
  posvel: Float32Array<ArrayBuffer>;
  meta: Float32Array<ArrayBuffer>;
}

export function initState(count: number): SimState {
  const posvel = new Float32Array(count * 4);
  const meta = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    posvel[i * 4] = -1; // parked sentinel (hidden)
    posvel[i * 4 + 1] = -1;
    meta[i * 4] = Math.random() * INITIAL_STAGGER; // staggered first release
    meta[i * 4 + 1] = Math.random() * 1000; // per-particle seed
    meta[i * 4 + 2] = 0; // parked
  }
  return { posvel, meta };
}

function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Advance the CPU simulation one frame. Mirrors the WGSL compute shader exactly.
 * Increments `hits[j]` for each bar strike. `seed` is a per-frame random scalar.
 */
export function stepCpu(
  dt: number,
  params: SimParams,
  seed: number,
  state: SimState,
  hits: Int32Array,
): void {
  const { posvel, meta } = state;
  const count = posvel.length / 4;
  const sdt = (dt / SUBSTEPS) || 0;
  const defs = params.deflectors;
  const nDef = Math.min(defs.length, MAX_DEFLECTORS);
  const emitterX = params.emitterX;
  const flow = params.flow;
  const parkBase = PARK_MAX + (PARK_MIN - PARK_MAX) * flow;
  const span = 1 - 2 * BAR_MARGIN;
  const gapHalf = GAP_FRAC * 0.5;

  for (let i = 0; i < count; i++) {
    const pi = i * 4;
    const sd = meta[pi + 1];

    // parked → count down, maybe release
    if (meta[pi + 2] < 0.5) {
      meta[pi] -= dt;
      if (meta[pi] <= 0) {
        const jit = (hash(sd + seed * 3.1) - 0.5) * EMITTER_WIDTH;
        posvel[pi] = Math.min(0.98, Math.max(0.02, emitterX + jit));
        posvel[pi + 1] = EMITTER_Y;
        posvel[pi + 2] = (hash(sd + seed * 7.7) - 0.5) * 0.06;
        posvel[pi + 3] = EMITTER_VY;
        meta[pi + 2] = 1;
      } else {
        posvel[pi] = -1;
        posvel[pi + 1] = -1;
      }
      continue;
    }

    let px = posvel[pi];
    let py = posvel[pi + 1];
    let vx = posvel[pi + 2];
    let vy = posvel[pi + 3];
    let parked = false;
    let hitBar = -1;

    for (let s = 0; s < SUBSTEPS; s++) {
      vy += GRAVITY * sdt;
      vx *= DRAG;
      vy *= DRAG;
      const sp = Math.hypot(vx, vy);
      if (sp > MAX_SPEED) {
        const k = MAX_SPEED / sp;
        vx *= k;
        vy *= k;
      }
      px += vx * sdt;
      py += vy * sdt;

      // side walls
      if (px < 0) {
        px = 0;
        vx = Math.abs(vx) * RESTITUTION;
      } else if (px > 1) {
        px = 1;
        vx = -Math.abs(vx) * RESTITUTION;
      }

      // deflectors
      for (let k = 0; k < nDef; k++) {
        const d = defs[k];
        const dirx = Math.cos(d.angle);
        const diry = Math.sin(d.angle);
        const relx = px - d.cx;
        const rely = py - d.cy;
        let t = relx * dirx + rely * diry;
        if (t < -d.halfLen) t = -d.halfLen;
        else if (t > d.halfLen) t = d.halfLen;
        const clx = d.cx + dirx * t;
        const cly = d.cy + diry * t;
        const dfx = px - clx;
        const dfy = py - cly;
        const dist = Math.hypot(dfx, dfy);
        if (dist < HALF_THICK && dist > 1e-4) {
          const nx = dfx / dist;
          const ny = dfy / dist;
          px = clx + nx * HALF_THICK;
          py = cly + ny * HALF_THICK;
          const vn = vx * nx + vy * ny;
          if (vn < 0) {
            vx -= (1 + RESTITUTION) * vn * nx;
            vy -= (1 + RESTITUTION) * vn * ny;
          }
        }
      }

      // bar row
      if (py >= BAR_TOP) {
        const local = ((px - BAR_MARGIN) / span) * BAR_COUNT;
        const j = Math.floor(local);
        const f = local - j;
        if (j >= 0 && j < BAR_COUNT && f > gapHalf && f < 1 - gapHalf) {
          hitBar = j;
          parked = true;
          break;
        } else if (py > BAR_BOTTOM) {
          parked = true;
          break;
        }
      }
    }

    if (parked) {
      if (hitBar >= 0) hits[hitBar] += 1;
      meta[pi] = parkBase * (0.4 + hash(sd + seed * 5.3));
      meta[pi + 2] = 0;
      posvel[pi] = -1;
      posvel[pi + 1] = -1;
    } else {
      posvel[pi] = px;
      posvel[pi + 1] = py;
      posvel[pi + 2] = vx;
      posvel[pi + 3] = vy;
    }
  }
}

// ── WGSL compute shader (constants injected from the values above) ──────────

function f(x: number): string {
  // WGSL f32 literal — always include a decimal point.
  return Number.isInteger(x) ? `${x}.0` : `${x}`;
}

export function buildComputeWGSL(): string {
  return /* wgsl */ `
struct U {
  dt: f32, flow: f32, seed: f32, emitterX: f32,
  defCount: f32, _p0: f32, _p1: f32, _p2: f32,
  defs: array<vec4f, ${MAX_DEFLECTORS}>,
};

@group(0) @binding(0) var<storage, read_write> posvel: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> meta:   array<vec4f>;
@group(0) @binding(2) var<uniform>             u:      U;
@group(0) @binding(3) var<storage, read_write> hits:   array<atomic<u32>, ${BAR_COUNT}>;

const GRAVITY:    f32 = ${f(GRAVITY)};
const DRAG:       f32 = ${f(DRAG)};
const RESTITUTION:f32 = ${f(RESTITUTION)};
const MAX_SPEED:  f32 = ${f(MAX_SPEED)};
const HALF_THICK: f32 = ${f(HALF_THICK)};
const EMITTER_Y:  f32 = ${f(EMITTER_Y)};
const EMITTER_W:  f32 = ${f(EMITTER_WIDTH)};
const EMITTER_VY: f32 = ${f(EMITTER_VY)};
const BAR_MARGIN: f32 = ${f(BAR_MARGIN)};
const BAR_TOP:    f32 = ${f(BAR_TOP)};
const BAR_BOTTOM: f32 = ${f(BAR_BOTTOM)};
const GAP_HALF:   f32 = ${f(GAP_FRAC * 0.5)};
const BAR_COUNT:  f32 = ${f(BAR_COUNT)};
const SPAN:       f32 = ${f(1 - 2 * BAR_MARGIN)};
const PARK_MIN:   f32 = ${f(PARK_MIN)};
const PARK_MAX:   f32 = ${f(PARK_MAX)};

fn hash(n: f32) -> f32 { return fract(sin(n) * 43758.5453); }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&posvel)) { return; }

  var pv = posvel[i];
  var mt = meta[i];
  let sd = mt.y;
  let parkBase = mix(PARK_MAX, PARK_MIN, u.flow);
  let sdt = u.dt * 0.5;

  // parked
  if (mt.z < 0.5) {
    mt.x = mt.x - u.dt;
    if (mt.x <= 0.0) {
      let jit = (hash(sd + u.seed * 3.1) - 0.5) * EMITTER_W;
      pv = vec4f(clamp(u.emitterX + jit, 0.02, 0.98), EMITTER_Y,
                 (hash(sd + u.seed * 7.7) - 0.5) * 0.06, EMITTER_VY);
      mt.z = 1.0;
    } else {
      pv = vec4f(-1.0, -1.0, 0.0, 0.0);
    }
    posvel[i] = pv;
    meta[i] = mt;
    return;
  }

  var p = pv.xy;
  var v = pv.zw;
  var parked = false;
  var hitBar = -1;
  let nDef = i32(u.defCount);

  for (var s = 0; s < 2; s = s + 1) {
    v.y = v.y + GRAVITY * sdt;
    v = v * DRAG;
    let sp = length(v);
    if (sp > MAX_SPEED) { v = v / sp * MAX_SPEED; }
    p = p + v * sdt;

    if (p.x < 0.0) { p.x = 0.0; v.x = abs(v.x) * RESTITUTION; }
    else if (p.x > 1.0) { p.x = 1.0; v.x = -abs(v.x) * RESTITUTION; }

    for (var k = 0; k < nDef; k = k + 1) {
      let d = u.defs[k];
      let dir = vec2f(cos(d.z), sin(d.z));
      let rel = p - d.xy;
      let t = clamp(dot(rel, dir), -d.w, d.w);
      let cl = d.xy + dir * t;
      let df = p - cl;
      let dist = length(df);
      if (dist < HALF_THICK && dist > 0.0001) {
        let n = df / dist;
        p = cl + n * HALF_THICK;
        let vn = dot(v, n);
        if (vn < 0.0) { v = v - (1.0 + RESTITUTION) * vn * n; }
      }
    }

    if (p.y >= BAR_TOP) {
      let local = (p.x - BAR_MARGIN) / SPAN * BAR_COUNT;
      let j = floor(local);
      let fr = local - j;
      if (j >= 0.0 && j < BAR_COUNT && fr > GAP_HALF && fr < 1.0 - GAP_HALF) {
        hitBar = i32(j);
        parked = true;
        break;
      } else if (p.y > BAR_BOTTOM) {
        parked = true;
        break;
      }
    }
  }

  if (parked) {
    if (hitBar >= 0) { atomicAdd(&hits[hitBar], 1u); }
    mt.x = parkBase * (0.4 + hash(sd + u.seed * 5.3));
    mt.z = 0.0;
    posvel[i] = vec4f(-1.0, -1.0, 0.0, 0.0);
    meta[i] = mt;
  } else {
    posvel[i] = vec4f(p, v);
    meta[i] = mt;
  }
}`;
}

/** Render shader shared shape: maps posvel → additive point sprite. */
export function buildRenderWGSL(): string {
  return /* wgsl */ `
struct RU { sizeX: f32, sizeY: f32, speedScale: f32, _p: f32 };

@group(0) @binding(0) var<storage, read> posvel: array<vec4f>;
@group(0) @binding(1) var<uniform>       ru: RU;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) t: f32,
  @location(1) uv: vec2f,
};

const OFF = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
);

@vertex fn vmain(@builtin(vertex_index) vi: u32) -> VO {
  let pi = vi / 6u;
  let ci = vi % 6u;
  let pv = posvel[pi];
  var out: VO;
  if (pv.x < 0.0) {
    out.pos = vec4f(2.0, 2.0, 2.0, 1.0); // parked → offscreen
    out.t = 0.0;
    out.uv = vec2f(0.0, 0.0);
    return out;
  }
  let clip = vec2f(pv.x * 2.0 - 1.0, 1.0 - (pv.y / ${f(FIELD_H)}) * 2.0);
  let o = OFF[ci];
  let spd = clamp(length(pv.zw) * ru.speedScale, 0.0, 1.0);
  out.pos = vec4f(clip.x + o.x * ru.sizeX, clip.y + o.y * ru.sizeY, 0.0, 1.0);
  out.t = spd;
  out.uv = o;
  return out;
}

@fragment fn fmain(@location(0) t: f32, @location(1) uv: vec2f) -> @location(0) vec4f {
  let d = length(uv);
  if (d > 1.0) { discard; }
  let a = (1.0 - smoothstep(0.1, 1.0, d)) * 0.55;
  let c0 = vec3f(0.357, 0.18, 0.788);
  let c1 = vec3f(0.769, 0.71, 0.992);
  let col = mix(c0, c1, t);
  return vec4f(col * a, a);
}`;
}
