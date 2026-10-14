// ─────────────────────────────────────────────────────────────────────────────
// layout.ts — the single source of truth for every byte the WebGPU particle
// engine shares between JavaScript and WGSL.
//
// Uniform blocks are declared ONCE as a field list; from it we derive (a) the
// WGSL struct text that goes into the shaders and (b) the byte offsets the JS
// packer writes. The two can therefore never drift apart (the classic WebGPU
// bug: a vec3 padded on one side and not the other — every value after it is
// silently wrong). Alignment follows the WGSL spec's host-shareable rules
// (https://www.w3.org/TR/WGSL/#alignment-and-size), uniform address space.
//
// Particle state lives in STORAGE buffers as structure-of-arrays streams (one
// vec4f per particle per stream): the render pass reads only `pos`, so it
// never pays for velocity / seed bandwidth at 10⁶ particles.
// ─────────────────────────────────────────────────────────────────────────────

export type ScalarType = "f32" | "u32" | "i32";
export type FieldType = ScalarType | "vec2f" | "vec3f" | "vec4f" | "mat3x3f" | "mat4x4f" | { array: "vec4f"; n: number };

export interface FieldDecl {
  name: string;
  type: FieldType;
  /** one line for the WGSL comment and the docs */
  doc?: string;
}

export interface FieldLayout extends FieldDecl {
  offset: number; // bytes
  size: number; // bytes
  align: number; // bytes
}

export interface StructLayout {
  name: string;
  fields: FieldLayout[];
  /** total size, rounded up to the struct alignment (and to 16 for uniforms) */
  size: number;
  align: number;
}

export function alignOf(t: FieldType): number {
  if (typeof t === "object") return 16;
  switch (t) {
    case "f32": case "u32": case "i32": return 4;
    case "vec2f": return 8;
    case "vec3f": case "vec4f": case "mat3x3f": case "mat4x4f": return 16;
  }
}

export function sizeOf(t: FieldType): number {
  if (typeof t === "object") return 16 * t.n;
  switch (t) {
    case "f32": case "u32": case "i32": return 4;
    case "vec2f": return 8;
    case "vec3f": return 12;
    case "vec4f": return 16;
    case "mat3x3f": return 48;
    case "mat4x4f": return 64;
  }
}

export const roundUp = (x: number, a: number) => Math.ceil(x / a) * a;

/** Lay out a struct by the WGSL rules (uniform address space: size → ×16). */
export function layoutStruct(name: string, decls: readonly FieldDecl[]): StructLayout {
  let off = 0;
  let align = 4;
  const seen = new Set<string>();
  const fields: FieldLayout[] = decls.map((d) => {
    if (seen.has(d.name)) throw new Error(`${name}: duplicate field ${d.name}`);
    seen.add(d.name);
    const a = alignOf(d.type), s = sizeOf(d.type);
    off = roundUp(off, a);
    const f = { ...d, offset: off, size: s, align: a };
    off += s;
    align = Math.max(align, a);
    return f;
  });
  return { name, fields, size: roundUp(roundUp(off, align), 16), align };
}

function wgslType(t: FieldType): string {
  return typeof t === "object" ? `array<${t.array}, ${t.n}>` : t;
}

/** The WGSL `struct` declaration for a layout (offsets in comments). */
export function structWGSL(l: StructLayout): string {
  const lines = l.fields.map((f) => `  ${f.name}: ${wgslType(f.type)}, // @${f.offset}${f.doc ? ` ${f.doc}` : ""}`);
  return `struct ${l.name} {\n${lines.join("\n")}\n};`;
}

/** A typed writer over one uniform block: set by field name, then upload `.data`. */
export class UniformBlock {
  readonly data: ArrayBuffer;
  readonly f32: Float32Array;
  readonly u32: Uint32Array;
  readonly i32: Int32Array;
  private readonly at = new Map<string, FieldLayout>();
  constructor(readonly layout: StructLayout) {
    this.data = new ArrayBuffer(layout.size);
    this.f32 = new Float32Array(this.data);
    this.u32 = new Uint32Array(this.data);
    this.i32 = new Int32Array(this.data);
    for (const f of layout.fields) this.at.set(f.name, f);
  }
  private field(name: string): FieldLayout {
    const f = this.at.get(name);
    if (!f) throw new Error(`${this.layout.name}: no field ${name}`);
    return f;
  }
  /** Scalars (f32 / u32 / i32) and vectors / matrices / arrays (f32 lanes). */
  set(name: string, v: number | ArrayLike<number>): this {
    const f = this.field(name);
    const i = f.offset / 4;
    if (typeof v === "number") {
      if (f.type === "u32") this.u32[i] = v >>> 0;
      else if (f.type === "i32") this.i32[i] = v | 0;
      else this.f32[i] = v;
      return this;
    }
    const lanes = f.size / 4;
    if (v.length > lanes) throw new Error(`${this.layout.name}.${f.name}: ${v.length} values > ${lanes} lanes`);
    for (let k = 0; k < v.length; k++) this.f32[i + k] = v[k];
    return this;
  }
  get(name: string): number {
    const f = this.field(name);
    const i = f.offset / 4;
    return f.type === "u32" ? this.u32[i] : f.type === "i32" ? this.i32[i] : this.f32[i];
  }
}

// ── the engine's uniform blocks ─────────────────────────────────────────────
// vec3 + scalar pairs are declared together so nothing pads.

export const SIM_UNIFORMS: readonly FieldDecl[] = [
  { name: "dt", type: "f32", doc: "simulation step (s, × motion)" },
  { name: "time", type: "f32", doc: "engine time (s) — steady clock" },
  { name: "count", type: "u32", doc: "live particles" },
  { name: "frame", type: "u32", doc: "frame index (hash salt)" },
  { name: "clock", type: "vec3f", doc: "bass / mid / treble dilated clocks" },
  { name: "swell", type: "f32", doc: "onset swell 0..1 (motion only)" },
  { name: "bands", type: "vec3f", doc: "bass / mid / treble drive −1..1" },
  { name: "maxSpeed", type: "f32", doc: "speed cap (world u/s)" },
  { name: "bandLv", type: "vec3f", doc: "bass / mid / treble level 0..1" },
  { name: "accCap", type: "f32", doc: "acceleration cap after a re-aim (u/s²)" },
  { name: "planeC", type: "vec3f", doc: "image plane centre (world)" },
  { name: "imgAspect", type: "f32" },
  { name: "planeR", type: "vec3f", doc: "image plane half-width vector" },
  { name: "scrAspect", type: "f32" },
  { name: "planeU", type: "vec3f", doc: "image plane half-height vector" },
  { name: "imgForm", type: "f32", doc: "spring onto the image 0..1" },
  { name: "curl", type: "vec4f", doc: "x amount, y scale, z speed, w base drag" },
  { name: "shape", type: "vec4f", doc: "x form A, y form B, z A→B mix (eased), w radius" },
  { name: "spring", type: "vec4f", doc: "x stiffness, y damping (drag), z image sampled 0/1, w snap 0/1" },
  { name: "react", type: "vec4f", doc: "x sound reactivity, y scatter, z bounce, w density" },
];

export const RENDER_UNIFORMS: readonly FieldDecl[] = [
  { name: "viewProj", type: "mat4x4f" },
  { name: "camRight", type: "vec3f" },
  { name: "pointPx", type: "f32", doc: "base sprite diameter (device px)" },
  { name: "camUp", type: "vec3f" },
  { name: "focal", type: "f32", doc: "camera distance (size normaliser)" },
  { name: "eye", type: "vec3f" },
  { name: "alpha", type: "f32", doc: "per-particle energy (count-normalised)" },
  { name: "palLow", type: "vec3f" },
  { name: "hue", type: "f32", doc: "YIQ hue rotation (rad) — luma kept" },
  { name: "palMid", type: "vec3f" },
  { name: "sat", type: "f32" },
  { name: "palHigh", type: "vec3f" },
  { name: "density", type: "f32", doc: "visible share 0..1 (motes fade one by one)" },
  { name: "viewport", type: "vec2f", doc: "HDR target size (px)" },
  { name: "minPx", type: "f32", doc: "smallest drawn sprite (px) — energy-conserving floor" },
  { name: "count", type: "u32" },
  { name: "imgShow", type: "f32", doc: "wear the image colours 0..1" },
  { name: "sizeK", type: "f32", doc: "soul size × setSizeScale" },
  { name: "time", type: "f32" },
  { name: "imgSampled", type: "f32" },
];

export const GOVERNOR_UNIFORMS: readonly FieldDecl[] = [
  { name: "viewport", type: "vec2f" },
  { name: "cap", type: "f32", doc: "mean displayed luminance ceiling (0.16 — the WebGL governor's)" },
  { name: "maxStep", type: "f32", doc: "max exposure ratio change per update (time-based)" },
  { name: "init", type: "f32", doc: "1 = first update (exposure 1)" },
  { name: "transparent", type: "f32" },
];

export const SIM_LAYOUT = layoutStruct("SimU", SIM_UNIFORMS);
export const RENDER_LAYOUT = layoutStruct("RenderU", RENDER_UNIFORMS);
export const GOVERNOR_LAYOUT = layoutStruct("GovU", GOVERNOR_UNIFORMS);

// ── particle storage streams (structure of arrays) ──────────────────────────

export interface StreamDecl {
  name: "pos" | "vel" | "seed" | "uv";
  wgsl: "vec4f" | "vec2f";
  bytes: number;
  doc: string;
}

export const PARTICLE_STREAMS: readonly StreamDecl[] = [
  { name: "pos", wgsl: "vec4f", bytes: 16, doc: "xyz world position, w = age (s; < 0 = fading in)" },
  { name: "vel", wgsl: "vec4f", bytes: 16, doc: "xyz velocity (u/s), w = spare (phase C: fluid weight)" },
  { name: "seed", wgsl: "vec4f", bytes: 16, doc: "x = frequency band 0..1 (skewed low), yzw = uniform randoms" },
  // the image's importance-sampled coordinates (loadFormImage) — double-buffered
  // so an upload trickles in over frames while the old one stays bound
  { name: "uv", wgsl: "vec2f", bytes: 8, doc: "image uv 0..1 (importance-sampled), per particle" },
];

/** GPU bytes for `count` particles (uv counted twice: double-buffered). */
export function particleBytes(count: number): number {
  let b = 0;
  for (const s of PARTICLE_STREAMS) b += s.bytes * count * (s.name === "uv" ? 2 : 1);
  return b;
}

export const WORKGROUP = 256;
/** WebGPU's guaranteed minimum (maxComputeWorkgroupsPerDimension). */
export const MAX_GROUPS_PER_DIM = 65535;

/** Workgroup grid for `count` invocations of WORKGROUP (2-D past 65535 groups). */
export function dispatchSize(count: number, wg = WORKGROUP, maxDim = MAX_GROUPS_PER_DIM): [number, number] {
  const groups = Math.max(1, Math.ceil(count / wg));
  if (groups <= maxDim) return [groups, 1];
  const y = Math.ceil(groups / maxDim);
  return [Math.ceil(groups / y), y];
}

/** Largest particle count the adapter's limits allow (largest stream = 16 B). */
export function maxParticlesFor(limits: { maxStorageBufferBindingSize: number; maxBufferSize: number }): number {
  return Math.floor(Math.min(limits.maxStorageBufferBindingSize, limits.maxBufferSize) / 16);
}

/** The engine's count clamp: 4,096 … 4,194,304 (2²²), within the adapter's limits. */
export function clampCount(n: number, limits?: { maxStorageBufferBindingSize: number; maxBufferSize: number }): number {
  const hi = Math.min(4_194_304, limits ? maxParticlesFor(limits) : 4_194_304);
  const v = Number.isFinite(n) ? Math.round(n) : 409_600;
  return Math.max(4096, Math.min(hi, v));
}

/** Kiosk stall law: big uploads (image uv at 10⁶ particles = 8 MB) trickle in
 *  ≤ this many bytes per frame — a writeBuffer is a main-thread memcpy. */
export const UPLOAD_CHUNK_BYTES = 1 << 20;

/** Split an upload of `bytes` into ≤ chunk-sized [offset, size] pieces (4-byte aligned). */
export function uploadChunks(bytes: number, chunk = UPLOAD_CHUNK_BYTES): [number, number][] {
  const c = Math.max(4, chunk - (chunk % 4));
  const out: [number, number][] = [];
  for (let o = 0; o < bytes; o += c) out.push([o, Math.min(c, bytes - o)]);
  return out;
}
