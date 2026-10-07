/**
 * ONE particle engine, ONE WebGL context for the whole session.
 *
 * Kiosk hang (2026-10-05, Snowflake froze at its first particle emergence in
 * real Chrome): every journey mount created a new engine + WebGL2 context,
 * compiled one giant simulation shader synchronously, built its GPU pipeline
 * at the first visible draw, and read luminance back with synchronous
 * getBufferSubData calls (measured 20–236 ms each). Now: the engine is
 * created once and its canvas is re-parented into whichever journey plays;
 * programs compile asynchronously and are warmed while invisible
 * (particle-engine.ts); nothing reads back unless ?particleprobe=1; and a
 * watchdog turns particles off for the rest of the session if a particle
 * frame ever takes > 50 ms or the page stalls > 400 ms while they run, or the
 * context is lost. The show never stops for particles.
 */
import { createParticleEngine, type ParticleEngine } from "./particle-engine";
import type { SpectrumFrame } from "./spectrum";
import { setParticlePresent } from "@/lib/journeys/particle-presence";

export interface SharedParticleEngine {
  canvas: HTMLCanvasElement;
  engine: ParticleEngine;
  hooks: { audio: ((dt: number) => SpectrumFrame | null) | null };
}

let shared: SharedParticleEngine | null = null;
let disabledWhy: string | null = null;
const listeners = new Set<() => void>();
/** test hook: how many engines (= WebGL contexts) this module ever created */
export let sharedEnginesCreated = 0;

export function disableParticlesForSession(why: string): void {
  if (disabledWhy) return;
  disabledWhy = why;
  const sh = shared;
  if (sh) {
    // stop simulating at once (the stall is the reason), but FADE the last
    // frame out on the compositor — never a drop (Karel 2026-10-05)
    sh.engine.stop();
    sh.canvas.style.transition = "opacity 1.8s linear";
    sh.canvas.style.opacity = "0";
    // hide only — releasing the context (loseContext) stalled the GPU process
    // ~2.8 s on the kiosk; a stopped engine costs nothing
    setTimeout(() => { sh.canvas.style.visibility = "hidden"; }, 2000);
  }
  setParticlePresent(false);
  if (typeof window !== "undefined") (window as unknown as Record<string, unknown>).__resonanceParticlesDisabled = why;
  for (const l of listeners) l();
}

/** Why particles were turned off this session (watchdog / context loss), or null. */
export function particlesDisabledReason(): string | null {
  return disabledWhy;
}

export function onParticlesDisabled(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ── release with a FADE (2026-10-06 zero-glitch: a jump/skip tore the layer
// down and the field vanished in one frame). The canvas moves to a fixed
// overlay and fades over 1.5 s while the engine keeps running; the next
// journey's acquire cancels the fade and takes the canvas back.
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
export function releaseSharedParticleEngineWithFade(): void {
  const sh = shared;
  if (!sh || typeof document === "undefined") return;
  const visible = sh.canvas.style.visibility !== "hidden" && Number(sh.canvas.style.opacity || "0") > 0.02;
  if (!visible) { sh.engine.stop(); sh.canvas.style.visibility = "hidden"; sh.canvas.remove(); return; }
  Object.assign(sh.canvas.style, { position: "fixed", inset: "0", zIndex: "3", transition: "opacity 1.5s linear" } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(sh.canvas);
  requestAnimationFrame(() => { sh.canvas.style.opacity = "0"; });
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    releaseTimer = null;
    sh.engine.stop();
    sh.canvas.style.visibility = "hidden";
    if (sh.canvas.parentElement === document.body) sh.canvas.remove();
  }, 1600);
}

export function acquireSharedParticleEngine(budget: { count: number; dpr: number; trailScale: number }): SharedParticleEngine | null {
  if (disabledWhy) return null;
  if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null; }
  if (shared) {
    Object.assign(shared.canvas.style, { position: "absolute", inset: "0", zIndex: "", transition: "opacity 0.6s linear" } as Partial<CSSStyleDeclaration>);
    return shared;
  }
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none",
    opacity: "0", visibility: "hidden", transition: "opacity 0.6s linear",
  } as Partial<CSSStyleDeclaration>);
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.particleLead = "1";
  const hooks: SharedParticleEngine["hooks"] = { audio: null };
  const probe = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("particleprobe") === "1";
  try {
    const engine = createParticleEngine(canvas, {
      count: budget.count,
      dpr: budget.dpr,
      trailScale: budget.trailScale,
      transparent: true,
      // v3 overlay: smaller, denser, brighter-cored forms that read over imagery
      gain: 1.7,
      camScale: 1.35,
      maxSpeed: 2.2,
      soul: "rings",
      probe, // read-back only for verification runs (?particleprobe=1)
      audio: (dt) => hooks.audio?.(dt) ?? null,
      onContextLost: () => disableParticlesForSession("webgl context lost"),
      watchdog: { cpuMs: 50, gapMs: 1000, onStall: (why) => disableParticlesForSession(`watchdog: ${why}`) },
    });
    sharedEnginesCreated++;
    shared = { canvas, engine, hooks };
    return shared;
  } catch (e) {
    disableParticlesForSession(`engine unavailable: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** test hook */
export function __resetSharedParticleEngineForTest(): void {
  shared = null;
  disabledWhy = null;
  sharedEnginesCreated = 0;
  listeners.clear();
}
