// A STACK of the real ShaderVisualizer layers (primary + dual + tertiary as on
// the kiosk), for scripts/perf/stack-fps.mjs: window.__modes = ["a", "b", ...].
// Bundled with esbuild like vis-harness.tsx.
import { createRoot } from "react-dom/client";
import { ShaderVisualizer } from "@/components/audio/visualizer";
import { SHADERS } from "@/lib/shaders";

type W = Window & { __modes?: string[]; __ready?: number };
const w = window as W;
const ctx = new AudioContext();
const osc = ctx.createOscillator();
const analyser = ctx.createAnalyser();
analyser.fftSize = 256;
osc.connect(analyser);
osc.start();
const dataArray = new Uint8Array(analyser.frequencyBinCount);
const modes = w.__modes ?? ["drift"];
w.__ready = 0;
createRoot(document.getElementById("root")!).render(
  <>
    {modes.map((m, i) => (
      <ShaderVisualizer
        key={m + i}
        analyser={analyser}
        dataArray={dataArray}
        fragShader={(SHADERS as Record<string, string>)[m]}
        modeTag={m}
        smoothMotion
        onReady={() => { w.__ready = (w.__ready ?? 0) + 1; }}
        style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", opacity: i === 0 ? 1 : 0.5, mixBlendMode: i === 0 ? "normal" : "screen" }}
      />
    ))}
  </>,
);
