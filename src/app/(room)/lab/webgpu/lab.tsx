"use client";

/**
 * WEBGPU PARTICLE LAB — measure the WebGPU engines on the kiosk.
 *
 *   /lab/webgpu                      the PARITY engine (the show engine conducts,
 *                                    its ported GLSL runs on WebGPU) — 1,000,000
 *                                    motes cycling souls
 *   ?gpu=webgl2                      the CURRENT show engine, same script (A/B)
 *   ?engine=native                   the native compute skeleton (procedural
 *                                    forms; the phase B renderer's test bed)
 *   ?n=250000                        particle count (show engines cap at 1024²)
 *   ?form=knot | 0-4 | cycle         hold one figure, or cycle (default)
 *   ?cycle=10                        seconds per figure while cycling
 *   ?dpr=1                           device-pixel-ratio cap (kiosk show = 1)
 *   ?timing=0                        GPU timestamp queries off
 *   ?splat=1                         PHASE B: tile-binned fixed-point splatting +
 *                                    temporal resolve (parity engine)
 *   ?fluid=1 / ?collide=1            PHASE C fluid (smoke / ink souls) / PHASE D
 *                                    depth collisions (?case=fluid-smoke · depth-snowflake)
 *   ?stable=1 / ?cine=0 / …          the show's own particle flags apply
 *   ?case=ghost-angel                a mastered-journey moment (lab-cases.ts):
 *                                    snowflake-emblems · snowflake-calm ·
 *                                    ghost-opening · ghost-angel · ghost-blossom-wings
 *                                    (same calls on every engine — film side by side)
 *
 * Keys: space = next figure · 1-5 = figure · ↑/↓ = count ×2 / ÷2 · h = HUD.
 * Scripted reads: window.__webgpuLab.snapshot() (fps, fpsLow, GPU ms per pass).
 * Not linked anywhere; no audio (the field idles on its own clocks).
 */

import { useEffect, useRef } from "react";
import { createParticleEngine, type ParticleEngine } from "@/lib/particles/particle-engine";
import { createWebGPUParticleEngine, type WebGPUParticleEngine, type GpuTimings, type WebGPUInfo } from "@/lib/particles/webgpu/engine";
import { createPortedParticleEngine, type PortedParticleEngine } from "@/lib/particles/webgpu/engine-port";
import { probeWebGPU } from "@/lib/particles/webgpu/backend";
import { FORM_NAMES, type FormName } from "@/lib/particles/webgpu/wgsl";
import type { SoulId } from "@/lib/particles/souls";
import { LAB_CASES, type LabCaseId } from "@/lib/particles/webgpu/parity";
import { runCase, CASE_NOTES } from "./lab-cases";

// the show-engine figures cycled by the parity engine and the WebGL A/B
const SOULS: SoulId[] = ["torus", "knot", "rose", "nebula", "lissajous"];

type Gpu = { info(): WebGPUInfo | null; gpuTimings(): GpuTimings | null; failure(): string | null; portStale?: () => string | null; splatting?: () => boolean };

export default function WebGPULab() {
  const host = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const n = Number(q.get("n") ?? 1_000_000);
    const dpr = Number(q.get("dpr") ?? 1);
    const cycleSec = Math.max(3, Number(q.get("cycle") ?? 10));
    const formQ = q.get("form") ?? "cycle";
    const named = FORM_NAMES.indexOf(formQ as FormName);
    const fixedForm = formQ === "cycle" ? null : named >= 0 ? named : Math.max(0, Math.min(FORM_NAMES.length - 1, Number(formQ) || 0));
    const mode: "webgl2" | "port" | "native" = q.get("gpu") === "webgl2" ? "webgl2" : q.get("engine") === "native" ? "native" : "port";
    const timing = q.get("timing") !== "0";
    const caseId: LabCaseId = (LAB_CASES as readonly string[]).includes(q.get("case") ?? "") ? (q.get("case") as LabCaseId) : "forms";
    let stage = "";

    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", display: "block", background: "#000" });
    host.current!.appendChild(canvas);

    let engine: ParticleEngine | null = null;
    let gpu: Gpu | null = null;
    let native: WebGPUParticleEngine | null = null;
    let form = fixedForm ?? 0;
    let alive = true;
    let problem = "";
    const backendLine = { webgl2: "WebGL2 (the show engine)", port: "WebGPU parity engine (show engine conducting, ported passes)", native: "WebGPU native compute skeleton" }[mode];
    const watchdog = { cpuMs: 1000, gapMs: 5000, onStall: (w: string) => { problem = w; } };

    const setForm = (k: number) => {
      form = ((k % FORM_NAMES.length) + FORM_NAMES.length) % FORM_NAMES.length;
      if (native) native.setProceduralForm(form, 4);
      else engine?.setSoul(SOULS[form], 4);
    };

    (async () => {
      try {
        if (mode === "webgl2") {
          engine = createParticleEngine(canvas, { count: n, dpr, soul: SOULS[form], gain: 1.4, watchdog });
        } else {
          const probe = await probeWebGPU();
          if (!alive) return;
          if (!probe.available) { problem = `WebGPU unavailable: ${probe.why} — the show would fall back to WebGL2 (?gpu=webgl2 to compare)`; return; }
          const o = { count: n, dpr, gain: 1.4, adapter: probe.adapter, gpuTiming: timing, watchdog, onContextLost: () => { problem = "device lost"; } };
          if (mode === "native") {
            native = createWebGPUParticleEngine(canvas, { ...o, soul: "rings" });
            engine = native;
            gpu = native;
          } else {
            const port: PortedParticleEngine = createPortedParticleEngine(canvas, { ...o, soul: SOULS[form] });
            engine = port;
            gpu = port;
          }
          const ok = await (native ?? (engine as PortedParticleEngine)).ready();
          if (!ok || !alive) return;
          native?.setProceduralForm(form, 0.5);
        }
      } catch (e) {
        problem = `${mode}: ${e instanceof Error ? e.message : String(e)}`;
        return;
      }
      engine.setDensity(1);
      // warm while invisible (the show's contract), then run
      for (let i = 0; i < 200 && alive && !engine.isWarm(); i++) { engine.prewarm(); engine.warmBurst(); await new Promise((r) => setTimeout(r, 30)); }
      if (!alive) return;
      engine.start();
      if (caseId !== "forms") await runCase(caseId, engine, { alive: () => alive, say: (s) => { stage = s; } });
    })();

    const cycle = fixedForm === null && caseId === "forms" ? setInterval(() => setForm(form + 1), cycleSec * 1000) : null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") setForm(form + 1);
      else if (e.key >= "1" && e.key <= "5") setForm(Number(e.key) - 1);
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const s = engine?.stats();
        if (s) engine!.setCount(e.key === "ArrowUp" ? s.count * 2 : s.count / 2);
      } else if (e.key === "h" && hud.current) hud.current.style.display = hud.current.style.display === "none" ? "" : "none";
    };
    window.addEventListener("keydown", onKey);

    const snapshot = () => {
      const s = engine?.stats();
      return {
        backend: mode,
        form: native ? FORM_NAMES[form] : SOULS[form],
        case: caseId,
        stage,
        problem: problem || gpu?.failure() || null,
        stale: gpu?.portStale?.() ?? null,
        info: gpu?.info() ?? null,
        gpu: gpu?.gpuTimings() ?? null,
        stats: s ? { fps: s.fps, fpsLow: s.fpsLow, frameMs: s.frameMs, count: s.count, width: s.width, height: s.height, dpr: s.dpr, soul: s.soul } : null,
      };
    };
    (window as unknown as { __webgpuLab: unknown }).__webgpuLab = { snapshot, engine: () => engine };

    const tick = setInterval(() => {
      const el = hud.current;
      if (!el) return;
      const sn = snapshot();
      const s = sn.stats;
      const g = sn.gpu;
      const lines = [
        backendLine + (gpu?.splatting?.() ? " · splat (phase B)" : ""),
        sn.info ? `adapter ${sn.info.adapter} · ${sn.info.format} · pipelines ${sn.info.compileMs} ms (async)` : "",
        s ? `${s.count.toLocaleString()} motes · ${s.width}×${s.height} @ dpr ${s.dpr} · soul ${s.soul}` : "",
        s ? `fps ${s.fps.toFixed(1)} · p5 ${s.fpsLow.toFixed(1)} · frame ${s.frameMs.toFixed(2)} ms` : "",
        g ? `gpu ms  sim ${g.integrate.toFixed(2)} · sprites ${g.sprites.toFixed(2)} · govern ${g.govern.toFixed(2)} · composite ${g.composite.toFixed(2)} · total ${g.total.toFixed(2)}` : gpu && timing ? "gpu ms  (timestamp-query unavailable or warming)" : "",
        caseId === "forms" ? `figure ${sn.form}${fixedForm === null ? ` (cycle ${cycleSec}s)` : ""}` : `case ${caseId}: ${CASE_NOTES[caseId]}`,
        caseId !== "forms" && sn.stage ? `  ${sn.stage}` : "",
        sn.stale ? `note: ${sn.stale}` : "",
        sn.problem ? `problem: ${sn.problem}` : "",
      ].filter(Boolean);
      el.textContent = lines.join("\n");
    }, 250);

    return () => {
      alive = false;
      clearInterval(tick);
      if (cycle) clearInterval(cycle);
      window.removeEventListener("keydown", onKey);
      engine?.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <div ref={host} style={{ position: "fixed", inset: 0, background: "#000" }}>
      <pre
        ref={hud}
        style={{
          position: "fixed", left: 12, top: 10, zIndex: 2, margin: 0, pointerEvents: "none",
          font: "11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace", color: "rgba(220,225,235,0.85)",
          textShadow: "0 0 3px #000", whiteSpace: "pre",
        }}
      />
    </div>
  );
}
