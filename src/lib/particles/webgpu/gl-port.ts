// ─────────────────────────────────────────────────────────────────────────────
// gl-port.ts — the show's GLSL, PORTED (not rewritten) to WebGPU.
//
// The force laws and the mote look live in ONE place: shaders.ts — SIM_FS
// (47 souls, the figure frame, currents, breath, light gravity, two hands, the
// living score, the image spring, hover, signature flight, respawn) and
// DRAW_VS / DRAW_FS (palette, image colours, the bridge, living fire, depth of
// field, colour drift, stable motes, trails). Hand-porting them would fork
// that source the day it was written (souls change daily). Instead this module
// makes Vulkan-flavoured GLSL 4.50 from the WebGL source with a few MECHANICAL
// edits — every one asserted, so a reshaped source fails loudly:
//   · loose uniforms → one std140 block (offsets computed here = the WGSL
//     struct's natural layout, which naga emits);
//   · particle textures (uPos / uVel / uSeed / uImgUv) → storage buffers,
//     the spectrum texture → a buffer sampled with the same LINEAR clamp;
//   · the sim's MRT outputs → buffer writes from a 256-wide compute kernel;
//   · gl_PointSize sprites → instanced quads (gl_PointCoord from the corner),
//     GL's clip z (−w…w) → WebGPU's (0…w), gl_FragCoord.y flipped (GL is
//     bottom-up), vertex-stage texture() → textureLod(…, 0);
//   · NaN tests by bit pattern (fast-math folds isnan away).
// scripts/gen-webgpu-port.mjs then runs naga (wgpu's type-correct shader
// translator) and commits the WGSL (port.generated.ts) with the SOURCE HASH of
// what it was made from; the engine refuses a stale port (it would drift).
// ─────────────────────────────────────────────────────────────────────────────

import { layoutStruct, type FieldDecl, type FieldType, type StructLayout } from "./layout";

export const PORT_WORKGROUP = 256;

/** Group-0 bindings of the ported simulation. */
export const SIM_PORT_BINDINGS = { uniforms: 0, pos: 1, vel: 2, seed: 3, uv: 4, spec: 5 } as const;
/** Group-0 bindings of the ported draw program. */
export const DRAW_PORT_BINDINGS = { uniforms: 0, pos: 1, vel: 2, seed: 3, uv: 4, imgA: 5, imgB: 6, bridgeA: 7, bridgeB: 8, sampler: 9 } as const;

export interface PortedProgram {
  /** GLSL 4.50 per stage (naga input) */
  stages: { compute?: string; vertex?: string; fragment?: string };
  /** the std140 uniform block, in declaration order */
  uniforms: StructLayout;
  /** FNV-1a of the WebGL source(s) it was made from (freshness check) */
  sourceHash: string;
}

export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const GLSL_TO_FIELD: Record<string, FieldType> = { float: "f32", int: "i32", uint: "u32", vec2: "vec2f", vec3: "vec3f", vec4: "vec4f", mat3: "mat3x3f", mat4: "mat4x4f" };
const FIELD_TO_GLSL: Record<string, string> = { f32: "float", i32: "int", u32: "uint", vec2f: "vec2", vec3f: "vec3", vec4f: "vec4", mat3x3f: "mat3", mat4x4f: "mat4" };

function fieldType(t: string, name: string, n?: number): FieldType {
  const b = GLSL_TO_FIELD[t];
  if (!b) throw new Error(`gl-port: unsupported uniform type ${t} ${name}`);
  if (n !== undefined) {
    if (t !== "vec4") throw new Error(`gl-port: uniform arrays must be vec4 (std140 stride 16), got ${t} ${name}[${n}]`);
    return { array: "vec4f", n };
  }
  return b;
}

function glslDecl(f: FieldDecl): string {
  const t = f.type;
  return typeof t === "object" ? `  vec4 ${f.name}[${t.n}];` : `  ${FIELD_TO_GLSL[t]} ${f.name};`;
}

/** An editor that refuses edits which no longer match. */
function editor(src: string, where: string) {
  let s = src;
  return {
    must(what: string, re: RegExp | string, to: string | ((...m: string[]) => string)) {
      const before = s;
      if (typeof re === "string") s = s.split(re).join(to as string);
      else s = s.replace(re, to as (...m: string[]) => string);
      if (s === before) throw new Error(`gl-port(${where}): edit "${what}" did not apply — the WebGL source changed shape`);
    },
    may(re: RegExp | string, to: string) {
      s = typeof re === "string" ? s.split(re).join(to) : s.replace(re, to);
    },
    get src() { return s; },
    set src(v: string) { s = v; },
  };
}

/** Pull `uniform T name[N];` declarations out (skipping `skip`), returning the fields. */
function extractUniforms(ed: ReturnType<typeof editor>, skip: readonly string[], seen = new Set<string>()): FieldDecl[] {
  const out: FieldDecl[] = [];
  ed.src = ed.src.replace(/^uniform\s+(?:highp\s+|mediump\s+|lowp\s+)?(\w+)\s+(\w+)(?:\[(\d+)\])?\s*;[^\n]*$/gm, (_m, t: string, name: string, n?: string) => {
    if (skip.includes(name)) return "";
    if (t === "sampler2D") throw new Error(`gl-port: unexpected sampler ${name}`);
    if (!seen.has(name)) { seen.add(name); out.push({ name, type: fieldType(t, name, n === undefined ? undefined : Number(n)) }); }
    return "";
  });
  return out;
}

const STRIP_HEADER = (ed: ReturnType<typeof editor>, where: string) => {
  ed.must(`${where}: version`, /^#version 300 es\s*\n/, "");
  ed.src = ed.src.replace(/^precision\s+\w+\s+\w+;\s*$/gm, "");
};

// ── the simulation ──────────────────────────────────────────────────────────

/** GLSL 4.50 compute from a WebGL simulation fragment shader (buildSimFS). */
export function portSim(webglSim: string): PortedProgram {
  const sourceHash = fnv1a(webglSim);
  const ed = editor(webglSim, "sim");
  STRIP_HEADER(ed, "sim");
  const fields = extractUniforms(ed, ["uPos", "uVel", "uSeed", "uSpec", "uImgUv"]);
  const uniforms = layoutStruct("SimPortU", fields);
  ed.must("outputs", /layout\(location = 0\) out vec4 oPos;\s*\nlayout\(location = 1\) out vec4 oVel;/, "vec4 oPos;\nvec4 oVel;\nuint gIdx;");
  ed.must("texel", "ivec2 c = ivec2(gl_FragCoord.xy);", "ivec2 c = ivec2(int(gIdx) % uTexW, int(gIdx) / uTexW);");
  ed.must("pos fetch", "texelFetch(uPos, c, 0)", "posB[gIdx]");
  ed.must("vel fetch", "texelFetch(uVel, c, 0)", "velB[gIdx]");
  ed.must("seed fetch", "texelFetch(uSeed, c, 0)", "seedB[gIdx]");
  ed.must("spectrum", "texture(uSpec, vec2(s.r, 0.5)).rg", "specAt(s.r)");
  ed.must("image uv", "texelFetch(uImgUv, c, 0).xy", "uvB[c.y * uTexW + c.x]");
  ed.must("finite", "any(isnan(p)) || any(isinf(p))", "nonFinite(p)");
  ed.must("main", /\nvoid main\(\)\{\n/, "\nvoid simMain(){\n");

  const B = SIM_PORT_BINDINGS;
  const compute = `#version 450
// GENERATED by src/lib/particles/webgpu/gl-port.ts from the WebGL simulation
// (shaders.ts buildSimFS) — source hash ${sourceHash}. Do not edit.
layout(local_size_x = ${PORT_WORKGROUP}) in;
layout(std140, set = 0, binding = ${B.uniforms}) uniform SimPortU {
${uniforms.fields.map(glslDecl).join("\n")}
};
layout(std430, set = 0, binding = ${B.pos}) buffer PosB { vec4 posB[]; };
layout(std430, set = 0, binding = ${B.vel}) buffer VelB { vec4 velB[]; };
layout(std430, set = 0, binding = ${B.seed}) buffer SeedB { vec4 seedB[]; };
layout(std430, set = 0, binding = ${B.uv}) readonly buffer UvB { vec2 uvB[]; };
layout(std430, set = 0, binding = ${B.spec}) readonly buffer SpecB { vec2 specB[128]; };
// the WebGL spectrum texture is sampled LINEAR, clamped: the same here
vec2 specAt(float x){
  float f = clamp(x * 128.0 - 0.5, 0.0, 127.0);
  int i0 = int(floor(f));
  int i1 = min(i0 + 1, 127);
  return mix(specB[i0], specB[i1], f - float(i0));
}
bool nonFinite(vec3 x){
  uvec3 e = floatBitsToUint(x) & uvec3(0x7f800000u);
  return any(equal(e, uvec3(0x7f800000u)));
}
${ed.src}
void main(){
  gIdx = gl_GlobalInvocationID.x + gl_GlobalInvocationID.y * gl_NumWorkGroups.x * ${PORT_WORKGROUP}u;
  if (gIdx >= uint(uTexW * uTexW)) return;
  simMain();
  posB[gIdx] = oPos;
  velB[gIdx] = oVel;
}
`;
  return { stages: { compute }, uniforms, sourceHash };
}

// ── the draw program ────────────────────────────────────────────────────────

const DRAW_TEXTURES = ["uImgA", "uImgB", "uBridgeA", "uBridgeB"] as const;
const DRAW_BUFFERS = ["uPos", "uVel", "uSeed", "uImgUv"] as const;

/** Vertex + fragment GLSL 4.50 from the WebGL draw program (DRAW_VS / DRAW_FS,
 *  with whatever withTrails / withStable the engine compiled). */
export function portDraw(webglVs: string, webglFs: string): PortedProgram {
  const sourceHash = fnv1a(`${webglVs}\n//--fs--\n${webglFs}`);
  const B = DRAW_PORT_BINDINGS;

  // vertex
  const vs = editor(webglVs, "draw-vs");
  vs.must("vs: version", /^#version 300 es\s*\n/, "");
  const defines = [...vs.src.matchAll(/^#define \w+[^\n]*$/gm)].map((m) => m[0]);
  vs.src = vs.src.replace(/^#define \w+[^\n]*\n/gm, "");
  vs.src = vs.src.replace(/^precision\s+\w+\s+\w+;\s*$/gm, "");
  for (const t of DRAW_TEXTURES) vs.must(`vs: sampler ${t}`, new RegExp(`^uniform sampler2D ${t};[^\\n]*$`, "m"), `layout(set = 0, binding = ${B[t === "uImgA" ? "imgA" : t === "uImgB" ? "imgB" : t === "uBridgeA" ? "bridgeA" : "bridgeB"]}) uniform texture2D ${t}_t;`);
  const fields = extractUniforms(vs, [...DRAW_BUFFERS]);
  fields.push({ name: "uPortVp", type: "vec2f", doc: "render target size (px) — quad expansion" });
  const uniforms = layoutStruct("DrawPortU", fields);
  // vertex-stage sampling has no derivatives: explicit level 0
  for (const t of DRAW_TEXTURES) vs.may(new RegExp(`\\btexture\\(${t},\\s*([^;]*?)\\)(\\.\\w+)`, "g"), `textureLod(sampler2D(${t}_t, uLin), $1, 0.0)$2`);
  if (/\btexture\(u(ImgA|ImgB|BridgeA|BridgeB)\b/.test(vs.src)) throw new Error("gl-port(draw-vs): a texture() call was not rewritten");
  vs.must("vs: vertex id", "int id = gl_VertexID;", "int id = int(gVid);");
  vs.must("vs: pos fetch", "texelFetch(uPos, c, 0)", "posB[c.y * uTexW + c.x]");
  vs.must("vs: vel fetch", "texelFetch(uVel, c, 0)", "velB[c.y * uTexW + c.x]");
  vs.must("vs: seed fetch", "texelFetch(uSeed, c, 0)", "seedB[c.y * uTexW + c.x]");
  vs.must("vs: image uv", "texelFetch(uImgUv, c, 0).xy", "uvB[c.y * uTexW + c.x]");
  vs.must("vs: position", /\bgl_Position\b/g, "gPos");
  vs.must("vs: point size", /\bgl_PointSize\b/g, "gPtSize");
  vs.must("vs: main", /\nvoid main\(\)\{\n/, "\nvoid drawMain(){\n");
  // varyings get explicit locations, in declaration order (the FS matches by name)
  const varyings: string[] = [];
  vs.src = vs.src.replace(/^((?:flat\s+)?)out\s+((?:highp\s+|mediump\s+|lowp\s+)?)(\w+)\s+(\w+)\s*;/gm, (_m, flat: string, _p: string, t: string, n: string) => {
    varyings.push(n);
    return `layout(location = ${varyings.length - 1}) ${flat}out ${t} ${n};`;
  });
  const LP = varyings.length; // the port's own varyings follow
  const vertex = `#version 450
// GENERATED by src/lib/particles/webgpu/gl-port.ts from the WebGL draw program
// (shaders.ts DRAW_VS) — source hash ${sourceHash}. Do not edit.
${defines.join("\n")}
layout(std140, set = 0, binding = ${B.uniforms}) uniform DrawPortU {
${uniforms.fields.map(glslDecl).join("\n")}
};
layout(std430, set = 0, binding = ${B.pos}) readonly buffer PosB { vec4 posB[]; };
layout(std430, set = 0, binding = ${B.vel}) readonly buffer VelB { vec4 velB[]; };
layout(std430, set = 0, binding = ${B.seed}) readonly buffer SeedB { vec4 seedB[]; };
layout(std430, set = 0, binding = ${B.uv}) readonly buffer UvB { vec2 uvB[]; };
layout(set = 0, binding = ${B.sampler}) uniform sampler uLin;
uint gVid;
vec4 gPos;
float gPtSize;
layout(location = ${LP}) out vec2 vPtc;
layout(location = ${LP + 1}) flat out float vFlipH;
${vs.src}
void main(){
  gVid = uint(gl_InstanceIndex);
  gPtSize = 1.0;
  drawMain();
  // the GL point sprite as a quad: corner offset in px, gl_PointCoord y-down
  vec2 cn = vec2(float(gl_VertexIndex & 1), float(gl_VertexIndex >> 1)) * 2.0 - 1.0;
  vec4 P = gPos;
  P.xy += cn * (gPtSize / uPortVp) * P.w;
  P.z = (P.z + P.w) * 0.5; // GL clip z (−w…w) → WebGPU (0…w)
  gl_Position = P;
  vPtc = vec2(0.5 + 0.5 * cn.x, 0.5 - 0.5 * cn.y);
  vFlipH = uPortVp.y;
}
`;

  // fragment
  const fs = editor(webglFs, "draw-fs");
  fs.must("fs: version", /^#version 300 es\s*\n/, "");
  fs.src = fs.src.replace(/^#define \w+[^\n]*\n/gm, "");
  fs.src = fs.src.replace(/^precision\s+\w+\s+\w+;\s*$/gm, "");
  if (/^uniform\s/m.test(fs.src)) throw new Error("gl-port(draw-fs): the fragment program grew uniforms — extend portDraw");
  fs.src = fs.src.replace(/^((?:flat\s+)?)in\s+((?:highp\s+|mediump\s+|lowp\s+)?)(\w+)\s+(\w+)\s*;/gm, (_m, flat: string, _p: string, t: string, n: string) => {
    const k = varyings.indexOf(n);
    if (k < 0) throw new Error(`gl-port(draw-fs): varying ${n} not written by the vertex program`);
    return `layout(location = ${k}) ${flat}in ${t} ${n};`;
  });
  fs.must("fs: output", /^out vec4 o;/m, "layout(location = 0) out vec4 o;");
  fs.may(/\bgl_PointCoord\b/g, "vPtc");
  // GL window y is bottom-up; WebGPU's is top-down
  fs.may(/\bgl_FragCoord\.xy\b/g, "vec2(gl_FragCoord.x, vFlipH - gl_FragCoord.y)");
  const fragment = `#version 450
// GENERATED by src/lib/particles/webgpu/gl-port.ts from the WebGL draw program
// (shaders.ts DRAW_FS) — source hash ${sourceHash}. Do not edit.
${defines.join("\n")}
layout(location = ${LP}) in vec2 vPtc;
layout(location = ${LP + 1}) flat in float vFlipH;
${fs.src}`;
  return { stages: { vertex, fragment }, uniforms, sourceHash };
}

/** The draw-program variants the engine may compile (trails always on — its
 *  uniform at 0 is the plain sprite; stable on/off changes the sprite). */
export const DRAW_VARIANTS = ["plain", "stable"] as const;
export type DrawVariant = (typeof DRAW_VARIANTS)[number];
