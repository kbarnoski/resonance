// Dump every registered shader (+ its prepass: <mode>::pre / ::scale / ::size / ::nearest) to JSON for shader-ab.mjs.
import { SHADERS, SHADER_PREPASS } from "../../src/lib/shaders/index";
import fs from "node:fs";
const out: Record<string, unknown> = { ...SHADERS };
for (const [k, v] of Object.entries(SHADER_PREPASS)) if (v) { out[`${k}::pre`] = v.frag; out[`${k}::scale`] = v.scale; out[`${k}::size`] = v.size ?? null; out[`${k}::nearest`] = !!v.nearest; }
fs.writeFileSync(process.argv[2] ?? "/tmp/shaders.json", JSON.stringify(out));
console.log(Object.keys(SHADERS).length);
