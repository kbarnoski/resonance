// Dump every registered shader AS THE VISUALIZER RUNS IT to JSON for the perf
// rigs: { mode: { main, prepass } } — `main` is the program the layer
// compiles (the upsampler for a whole-shader prepass), `prepass` its stages.
//   npx esbuild scripts/perf/dump-shaders.ts --bundle --platform=node --format=esm --outfile=/tmp/dump.mjs && node /tmp/dump.mjs out.json
import { SHADERS, prepassFor, UPSAMPLE_FRAG } from "../../src/lib/shaders/index";
import fs from "node:fs";
const out: Record<string, { main: string; prepass: unknown }> = {};
for (const [mode, frag] of Object.entries(SHADERS)) {
  if (!frag) continue;
  const p = prepassFor(frag);
  out[mode] = { main: p?.whole ? UPSAMPLE_FRAG : frag, prepass: p ?? null };
}
fs.writeFileSync(process.argv[2] ?? "/tmp/shaders.json", JSON.stringify(out));
console.log(Object.keys(out).length);
