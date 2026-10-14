// The REAL ShaderVisualizer (src/components/audio/visualizer.tsx — compile
// path, prepass setup, float fallback, uniforms) rendering one registered
// shader full-screen, for scripts/perf/vis-smoke.mjs. Bundled with esbuild.
import { createRoot } from "react-dom/client";
import { ShaderVisualizer } from "@/components/audio/visualizer";
import { SHADERS } from "@/lib/shaders";

type W = Window & { __mode?: string; __ready?: boolean | null; __noFloat?: boolean };
const w = window as W;
if (w.__noFloat) {
  // simulate a GPU without float render targets: the layer must fall back
  const proto = WebGLRenderingContext.prototype as unknown as { getExtension: (this: WebGLRenderingContext, name: string) => unknown };
  const orig = proto.getExtension;
  proto.getExtension = function (this: WebGLRenderingContext, name: string) {
    if (name === "OES_texture_float" || name === "WEBGL_color_buffer_float" || name === "OES_texture_float_linear") return null;
    return orig.call(this, name);
  };
}
const ctx = new AudioContext();
const osc = ctx.createOscillator();
const analyser = ctx.createAnalyser();
analyser.fftSize = 256;
osc.connect(analyser);
osc.start();
const dataArray = new Uint8Array(analyser.frequencyBinCount);
const mode = w.__mode ?? "drift";
const frag = (SHADERS as Record<string, string>)[mode];
w.__ready = null;
createRoot(document.getElementById("root")!).render(
  <ShaderVisualizer analyser={analyser} dataArray={dataArray} fragShader={frag} modeTag={mode} smoothMotion onReady={(ok?: boolean) => { w.__ready = ok !== false; }} style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh" }} />,
);
