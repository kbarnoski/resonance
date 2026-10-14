// The exact WebGL sources the WebGPU port is made from (gen-webgpu-port.mjs)
// and checked against (port.test.ts, the engine's freshness gate).
import { buildSimFS, simSoulCount, DRAW_VS, DRAW_FS, withTrails, withStable } from "../shaders";
import { fnv1a } from "./gl-port";

export function portSources() {
  // every soul + the living score + two hands compiled in: their uniforms at
  // rest (0) are the show build's behaviour exactly (each feature gates itself)
  const sim = buildSimFS([...Array(simSoulCount()).keys()], { score: true, hands: true });
  return {
    sim,
    draw: {
      plain: { vs: withTrails(DRAW_VS), fs: withTrails(DRAW_FS) },
      stable: { vs: withStable(withTrails(DRAW_VS)), fs: withStable(withTrails(DRAW_FS)) },
    },
  };
}

/** Source hashes of the current WebGL program (compare with port.generated.ts). */
export function currentPortHashes(): { sim: string; plain: string; stable: string } {
  const s = portSources();
  const dh = (d: { vs: string; fs: string }) => fnv1a(`${d.vs}\n//--fs--\n${d.fs}`);
  return { sim: fnv1a(s.sim), plain: dh(s.draw.plain), stable: dh(s.draw.stable) };
}
