// ─────────────────────────────────────────────────────────────────────────────
// gl-capture.ts — a WebGL2 context that draws nothing and records everything.
//
// THE CONDUCTOR (docs/webgpu-engine-plan.md §3.1): the WebGPU engine runs the
// show's own WebGL engine (particle-engine.ts — every follower, glide, staging
// rule, image timeline, feature envelope, all ~70 methods) UNCHANGED against
// this context. Each draw call it issues arrives here with its program's
// uniform values and bound textures, and the WebGPU executor (engine-port.ts)
// runs the ported pass instead. One source of behaviour; zero forks of the CPU
// logic; the show engine is not modified at all.
//
// Only the slice of WebGL2 that particle-engine.ts uses is modelled: programs
// (uniform names parsed from source), uniforms (per program, like GL), texture
// units + uploads, framebuffers, viewport / scissor / blend state, drawArrays.
// Everything else is a recorded no-op. Programs are always "compiled" (the
// parallel-compile extension reports completion at once). EXT_float_blend is
// absent, so the engine compiles spatial pairing out (ported in §E).
// ─────────────────────────────────────────────────────────────────────────────

import {
  SEED_INIT_FS, POS_INIT_FS, FADE_FS, LUM_FS, EXPO_FS, TAA_FS, BLOOM_FS,
} from "../shaders";

export type ProgramKind = "sim" | "draw" | "seedInit" | "posInit" | "fade" | "lum" | "expo" | "comp" | "taa" | "bloom" | "pair" | "other";

export interface CapProgram {
  id: number;
  vs: string;
  fs: string;
  kind: ProgramKind;
  /** uniform name (array base, no [0]) → GLSL type */
  types: Map<string, string>;
  /** uniform name → last value set (GL keeps uniforms per program) */
  values: Map<string, number[]>;
  /** sampler name → texture unit */
  samplers: Map<string, number>;
  list: { name: string; size: number }[];
}

export interface CapTexture {
  id: number;
  width: number;
  height: number;
  /** GL internal format of the last allocation */
  internal: number;
  /** DOM source of the last texImage2D(…, source) upload */
  source: unknown | null;
  /** typed data of the last upload (texImage2D / texSubImage2D) */
  data: ArrayBufferView | null;
  flipY: boolean;
  /** bumped on every upload */
  version: number;
  deleted: boolean;
}

export interface CapFramebuffer {
  id: number;
  color: (CapTexture | null)[];
}

export interface CapDraw {
  prog: CapProgram;
  mode: "points" | "triangles";
  count: number;
  fbo: CapFramebuffer | null;
  viewport: [number, number, number, number];
  scissor: boolean;
  blend: boolean;
  /** sampler name → the texture bound at its unit */
  textures: Map<string, CapTexture | null>;
}

export interface CaptureHooks {
  onDraw?(d: CapDraw): void;
  onUpload?(t: CapTexture, kind: "image" | "data" | "sub" | "alloc"): void;
  onDelete?(t: CapTexture): void;
}

// real values for every constant whose value the engine does arithmetic on or
// that we read back; the rest get unique placeholders
const C: Record<string, number> = {
  POINTS: 0x0000, TRIANGLES: 0x0004, TEXTURE0: 0x84c0, TEXTURE_2D: 0x0de1, FRAMEBUFFER: 0x8d40, READ_FRAMEBUFFER: 0x8ca8,
  DRAW_FRAMEBUFFER: 0x8ca9, SCISSOR_TEST: 0x0c11, BLEND: 0x0be2, UNPACK_FLIP_Y_WEBGL: 0x9240, LINK_STATUS: 0x8b82,
  ACTIVE_UNIFORMS: 0x8b86, SYNC_STATUS: 0x9114, SIGNALED: 0x9119, UNSIGNALED: 0x9118, RG32F: 0x8230, RGBA32F: 0x8814,
  RGBA16F: 0x881a, RG16F: 0x822f, RGBA: 0x1908, RG: 0x8227, FLOAT: 0x1406, UNSIGNED_BYTE: 0x1401, COLOR_ATTACHMENT0: 0x8ce0,
  COLOR_ATTACHMENT1: 0x8ce1, VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30, COMPLETION_STATUS_KHR: 0x91b1,
};

const UNIFORM_RE = /^\s*uniform\s+(?:highp\s+|mediump\s+|lowp\s+)?(\w+)\s+(\w+)(?:\[(\d+)\])?\s*;/gm;

function classify(vs: string, fs: string): ProgramKind {
  if (fs.includes("vec4 soulForce(")) return "sim";
  if (vs.includes("uniform float uPointPx")) return "draw";
  if (fs === SEED_INIT_FS) return "seedInit";
  if (fs === POS_INIT_FS) return "posInit";
  if (fs === FADE_FS) return "fade";
  if (fs === LUM_FS) return "lum";
  if (fs === EXPO_FS) return "expo";
  if (fs === TAA_FS) return "taa";
  if (fs === BLOOM_FS) return "bloom";
  if (fs.includes("uniform float uTransparent")) return "comp";
  if (/uPair|uAcdf|uRcdf|uHist\b|uStats/.test(fs + vs)) return "pair";
  return "other";
}

export interface GLCapture {
  gl: WebGL2RenderingContext;
  programs: CapProgram[];
  textures: CapTexture[];
  calls: { n: number };
}

/** A recording WebGL2 context for the conductor. */
export function createGLCapture(hooks: CaptureHooks = {}): GLCapture {
  let ids = 1;
  const programs: CapProgram[] = [];
  const textures: CapTexture[] = [];
  const shaders = new Map<object, { type: number; src: string }>();
  const units: (CapTexture | null)[] = new Array(32).fill(null);
  let unit = 0;
  let cur: CapProgram | null = null;
  let fbo: CapFramebuffer | null = null;
  let viewport: [number, number, number, number] = [0, 0, 1, 1];
  const caps = new Set<number>();
  let flipY = false;
  const calls = { n: 0 };
  const extra = new Map<string, number>();

  const progOf = (p: unknown) => p as CapProgram & { attached: { type: number; src: string }[] };

  const api: Record<string, unknown> = {
    canvas: undefined,
    isContextLost: () => false,
    getExtension: (name: string) => {
      if (name === "EXT_color_buffer_float") return {};
      if (name === "KHR_parallel_shader_compile") return { COMPLETION_STATUS_KHR: C.COMPLETION_STATUS_KHR };
      return null; // EXT_float_blend absent → spatial pairing compiled out
    },
    // ── programs ──
    createShader: (type: number) => { const s = { id: ids++ }; shaders.set(s, { type, src: "" }); return s; },
    shaderSource: (s: object, src: string) => { const e = shaders.get(s); if (e) e.src = src; },
    compileShader: () => {},
    deleteShader: () => {},
    createProgram: () => {
      const p = { id: ids++, vs: "", fs: "", kind: "other" as ProgramKind, types: new Map(), values: new Map(), samplers: new Map(), list: [], attached: [] as { type: number; src: string }[] };
      return p;
    },
    attachShader: (p: unknown, s: object) => { const e = shaders.get(s); if (e) progOf(p).attached.push(e); },
    linkProgram: (pp: unknown) => {
      const p = progOf(pp);
      p.vs = p.attached.find((a) => a.type === C.VERTEX_SHADER)?.src ?? "";
      p.fs = p.attached.find((a) => a.type === C.FRAGMENT_SHADER)?.src ?? "";
      p.kind = classify(p.vs, p.fs);
      for (const src of [p.vs, p.fs]) {
        for (const m of src.matchAll(UNIFORM_RE)) {
          const [, t, name, n] = m;
          if (p.types.has(name)) continue;
          p.types.set(name, t);
          p.list.push({ name: n ? `${name}[0]` : name, size: n ? Number(n) : 1 });
        }
      }
      programs.push(p);
    },
    getProgramParameter: (pp: unknown, pname: number) => {
      if (pname === C.ACTIVE_UNIFORMS) return progOf(pp).list.length;
      return true; // LINK_STATUS, COMPLETION_STATUS_KHR
    },
    getActiveUniform: (pp: unknown, i: number) => {
      const u = progOf(pp).list[i];
      return u ? { name: u.name, size: u.size, type: 0 } : null;
    },
    getUniformLocation: (pp: unknown, name: string) => ({ prog: progOf(pp), name: name.replace(/\[0\]$/, "") }),
    getProgramInfoLog: () => "",
    getShaderInfoLog: () => "",
    useProgram: (p: unknown) => { cur = p ? progOf(p) : null; },
    deleteProgram: (p: unknown) => { const i = programs.indexOf(progOf(p)); if (i >= 0) programs.splice(i, 1); },
    // ── state ──
    enable: (c: number) => caps.add(c),
    disable: (c: number) => caps.delete(c),
    viewport: (x: number, y: number, w: number, h: number) => { viewport = [x, y, w, h]; },
    scissor: () => {},
    blendFunc: () => {},
    clearColor: () => {},
    clear: () => {},
    flush: () => {},
    pixelStorei: (pname: number, v: number | boolean) => { if (pname === C.UNPACK_FLIP_Y_WEBGL) flipY = !!v; },
    // ── textures ──
    createTexture: () => {
      const t: CapTexture = { id: ids++, width: 0, height: 0, internal: 0, source: null, data: null, flipY: false, version: 0, deleted: false };
      textures.push(t);
      return t;
    },
    deleteTexture: (t: CapTexture | null) => {
      if (!t) return;
      t.deleted = true;
      const i = textures.indexOf(t);
      if (i >= 0) textures.splice(i, 1);
      hooks.onDelete?.(t);
    },
    activeTexture: (u: number) => { unit = u - C.TEXTURE0; },
    bindTexture: (_target: number, t: CapTexture | null) => { units[unit] = t; },
    texParameteri: () => {},
    generateMipmap: () => {},
    texStorage2D: (_t: number, _levels: number, internal: number, w: number, h: number) => {
      const t = units[unit];
      if (!t) return;
      Object.assign(t, { width: w, height: h, internal, source: null, data: null });
      t.version++;
      hooks.onUpload?.(t, "alloc");
    },
    texImage2D: (...a: unknown[]) => {
      const t = units[unit];
      if (!t) return;
      if (a.length >= 9) {
        const [, , internal, w, h, , , , pixels] = a as [number, number, number, number, number, number, number, number, ArrayBufferView | null];
        Object.assign(t, { width: w, height: h, internal, source: null, data: pixels ?? null, flipY });
        t.version++;
        hooks.onUpload?.(t, pixels ? "data" : "alloc");
      } else {
        const [, , internal, , , source] = a as [number, number, number, number, number, { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }];
        const w = source?.naturalWidth || source?.width || 1;
        const h = source?.naturalHeight || source?.height || 1;
        Object.assign(t, { width: w, height: h, internal, source, data: null, flipY });
        t.version++;
        hooks.onUpload?.(t, "image");
      }
    },
    texSubImage2D: (...a: unknown[]) => {
      const t = units[unit];
      if (!t) return;
      t.data = (a[8] as ArrayBufferView) ?? null;
      t.version++;
      hooks.onUpload?.(t, "sub");
    },
    // ── framebuffers ──
    createFramebuffer: () => ({ id: ids++, color: [] } as CapFramebuffer),
    deleteFramebuffer: () => {},
    bindFramebuffer: (target: number, f: CapFramebuffer | null) => { if (target !== C.READ_FRAMEBUFFER) fbo = f; },
    framebufferTexture2D: (_target: number, attach: number, _tt: number, t: CapTexture | null) => {
      if (fbo) fbo.color[attach - C.COLOR_ATTACHMENT0] = t;
    },
    drawBuffers: () => {},
    readBuffer: () => {},
    // ── uniforms (per program, as in GL) ──
    uniform1f: (l: Loc, x: number) => set(l, [x]),
    uniform2f: (l: Loc, x: number, y: number) => set(l, [x, y]),
    uniform3f: (l: Loc, x: number, y: number, z: number) => set(l, [x, y, z]),
    uniform4f: (l: Loc, x: number, y: number, z: number, w: number) => set(l, [x, y, z, w]),
    uniform1i: (l: Loc, x: number) => {
      if (!l) return;
      if (l.prog.types.get(l.name) === "sampler2D") l.prog.samplers.set(l.name, x);
      else set(l, [x]);
    },
    uniform3fv: (l: Loc, v: ArrayLike<number>) => set(l, Array.from(v)),
    uniform4fv: (l: Loc, v: ArrayLike<number>) => set(l, Array.from(v)),
    uniformMatrix3fv: (l: Loc, _t: boolean, v: ArrayLike<number>) => set(l, Array.from(v)),
    uniformMatrix4fv: (l: Loc, _t: boolean, v: ArrayLike<number>) => set(l, Array.from(v)),
    // ── draws ──
    createVertexArray: () => ({ id: ids++ }),
    bindVertexArray: () => {},
    deleteVertexArray: () => {},
    drawArrays: (mode: number, _first: number, count: number) => {
      calls.n++;
      if (!cur || !hooks.onDraw) return;
      const tex = new Map<string, CapTexture | null>();
      for (const [name, u] of cur.samplers) tex.set(name, units[u] ?? null);
      hooks.onDraw({
        prog: cur, mode: mode === C.POINTS ? "points" : "triangles", count, fbo, viewport: [...viewport],
        scissor: caps.has(C.SCISSOR_TEST), blend: caps.has(C.BLEND), textures: tex,
      });
    },
    // ── read-backs: never resolve (the conductor's probes stay idle) ──
    createBuffer: () => ({ id: ids++ }),
    bindBuffer: () => {},
    bufferData: () => {},
    deleteBuffer: () => {},
    readPixels: () => {},
    fenceSync: () => ({ id: ids++ }),
    getSyncParameter: () => C.UNSIGNALED,
    deleteSync: () => {},
    getBufferSubData: () => {},
  };
  type Loc = { prog: CapProgram; name: string } | null;
  function set(l: Loc, v: number[]) {
    calls.n++;
    if (l) l.prog.values.set(l.name, v);
  }

  const gl = new Proxy(api, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      if (prop in C) return C[prop];
      if (/^[A-Z0-9_]+$/.test(prop)) {
        if (!extra.has(prop)) extra.set(prop, 0x10000 + extra.size);
        return extra.get(prop);
      }
      return () => undefined; // any other call: a recorded no-op
    },
  }) as unknown as WebGL2RenderingContext;
  return { gl, programs, textures, calls };
}

/** Pack a program's captured uniforms into a uniform block by name (GL rules:
 *  never-set = 0). mat3 columns land on a 16-byte stride (std140 / WGSL). */
export function packUniforms(
  prog: CapProgram,
  fields: readonly (readonly [string, string, number])[],
  f32: Float32Array,
  i32: Int32Array,
  extra?: Record<string, number[]>,
): void {
  f32.fill(0);
  for (const [name, type, offset] of fields) {
    const v = extra?.[name] ?? prog.values.get(name);
    if (!v) continue;
    const o = offset / 4;
    if (type === "i32" || type === "u32") { i32[o] = v[0] | 0; continue; }
    if (type === "mat3x3f") { for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) f32[o + c * 4 + r] = v[c * 3 + r] ?? 0; continue; }
    const n = type === "f32" ? 1 : type === "vec2f" ? 2 : type === "vec3f" ? 3 : type === "vec4f" ? 4 : type === "mat4x4f" ? 16 : Number(/\[(\d+)\]/.exec(type)?.[1] ?? 1) * 4;
    for (let k = 0; k < n && k < v.length; k++) f32[o + k] = v[k];
  }
}
