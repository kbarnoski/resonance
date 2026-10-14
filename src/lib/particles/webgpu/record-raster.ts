// record-raster.ts — the raster sprite path fed by MOTE RECORDS.
//
// The ported draw vertex program is heavy (image colours, the bridge, fire,
// DOF, stable gaussians) and a quad runs it FOUR times per mote. Here the
// mote-record compute kernel (gl-port.ts portMote) runs it ONCE per mote, and
// a tiny vertex stage expands each record into its quad, feeding the SAME
// ported fragment program (its inputs are read from the generated fragment
// WGSL, so locations and interpolation always match). Trail motes (flags 2)
// are left to the full port (the executor uses it whenever trails are live).
import { MOTE_STRIDE } from "./gl-port";

export interface FragInput { loc: number; name: string; type: string; flat: boolean }

/** The ported fragment program's inputs (from its WGSL entry point). */
export function fragmentInputs(fragmentWgsl: string): FragInput[] {
  const m = /@fragment\s*fn main\(([\s\S]*?)\)\s*->/.exec(fragmentWgsl);
  if (!m) throw new Error("record-raster: no fragment entry point in the port");
  if (!/@location/.test(m[1])) throw new Error("record-raster: the fragment entry point has no inputs (parse)");
  const out: FragInput[] = [];
  for (const p of m[1].split(/,\s*(?=@)/)) {
    const lm = /@location\((\d+)\)\s*(@interpolate\(flat\))?\s*(\w+)\s*:\s*([\w<>]+)/.exec(p);
    if (lm) out.push({ loc: Number(lm[1]), flat: !!lm[2], name: lm[3], type: lm[4] });
  }
  return out;
}

const VALUE: Record<string, string> = {
  vCol: "r1.rgb",
  vCoc: "r0.w",
  vStA: "motes[off + 2u]",
  vStB: "motes[off + 3u]",
  vStC: "motes[off + 4u].xy",
  vPtc: "vec2f(0.5 + 0.5 * cn.x, 0.5 - 0.5 * cn.y)",
  vFlipH: "RU.vp.y",
};

export function buildRecordQuadWGSL(fragmentWgsl: string): string {
  const ins = fragmentInputs(fragmentWgsl);
  const zero = (t: string) => (t === "f32" ? "0.0" : `${t.replace("<f32>", "f")}(0.0)`);
  const fields = ins.map((i) => `  @location(${i.loc})${i.flat ? " @interpolate(flat)" : ""} ${i.name}: ${i.type},`).join("\n");
  const sets = ins.map((i) => `  o.${i.name} = ${VALUE[i.name] ?? zero(i.type)};`).join("\n");
  return /* wgsl */ `// generated — quads from mote records (feeds the ported fragment program)
struct RecU { vp: vec2f, _p: vec2f };
@group(0) @binding(0) var<uniform> RU: RecU;
@group(0) @binding(1) var<storage, read> motes: array<vec4f>;
struct VOut {
  @builtin(position) pos: vec4f,
${fields}
};
// NOT instanced: 6 vertices per mote in one triangle list (tiny 4-vertex
// instances leave the vertex units idle — measured ~3× slower at 1M)
const CORNER = array<u32, 6>(0u, 1u, 2u, 2u, 1u, 3u);
@vertex
fn vsRec(@builtin(vertex_index) vid: u32) -> VOut {
  var o: VOut;
  let ii = vid / 6u;
  let vi = CORNER[vid % 6u];
  let off = ii * ${MOTE_STRIDE}u;
  let r0 = motes[off];
  let r1 = motes[off + 1u];
  let cn = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2.0 - 1.0;
${sets}
  // hidden motes and trail motes (the full port draws those) collapse
  if (r1.w < 0.5 || r1.w > 1.5) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  let ndc = r0.xy / RU.vp * 2.0 - 1.0; // GL window px (y up) → clip (y up)
  o.pos = vec4f(ndc + cn * (r0.z / RU.vp), 0.5, 1.0);
  return o;
}
`;
}
