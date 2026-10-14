// Dump every registered shader (+ its prepass: <mode>::pre / ::scale / ::size / ::nearest) to JSON for shader-ab.mjs.
import { SHADERS, SHADER_PREPASS, UPSAMPLE_FRAG } from "../../src/lib/shaders/index";
import fs from "node:fs";
const out: Record<string, unknown> = { ...SHADERS };
for (const [k, v] of Object.entries(SHADER_PREPASS)) if (v) { out[`${k}::pre`] = v.frag; out[`${k}::scale`] = v.scale; out[`${k}::size`] = v.size ?? null; out[`${k}::nearest`] = !!v.nearest; out[`${k}::float`] = !!v.float; out[`${k}::extraRows`] = v.extraRows ?? 0; out[`${k}::blocks`] = v.blocks ?? 1; out[`${k}::whole`] = !!v.whole; out[`${k}::columns`] = v.columns ?? 0; if (v.whole) out[k] = UPSAMPLE_FRAG; }
fs.writeFileSync(process.argv[2] ?? "/tmp/shaders.json", JSON.stringify(out));
console.log(Object.keys(SHADERS).length);
