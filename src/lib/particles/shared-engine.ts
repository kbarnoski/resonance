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
import { createParticleEngine, type ParticleEngine, type ParticleEngineOptions } from "./particle-engine";
import { createSwitchableEngine, type Switchable } from "./webgpu/switchable";
import type { SpectrumFrame } from "./spectrum";
import { setParticlePresent } from "@/lib/journeys/particle-presence";

export interface SharedParticleEngine {
  canvas: HTMLCanvasElement;
  engine: ParticleEngine;
  hooks: { audio: ((dt: number) => SpectrumFrame | null) | null };
}

let shared: SharedParticleEngine | null = null;
let disabledWhy: string | null = null;
/** the set-start statement card owns the engine (see setStatementHold below) */
let statementHold = false;
const listeners = new Set<() => void>();
/** test hook: how many engines (= WebGL contexts) this module ever created */
export let sharedEnginesCreated = 0;

// ── WEBGPU BY DEFAULT (2026-10-13, Karel: "every other epic upgrade implemented
// for all"): the parity engine (webgpu/engine-port.ts — the show engine
// conducting, its own GLSL ported to WebGPU) runs when the adapter probe
// succeeds; `?gpu=webgl2` keeps the WebGL2 engine. Any WebGPU failure (adapter,
// WGSL, device loss) falls back to WebGL2 in place — same engine object for
// the layers, the state replayed (webgpu/switchable.ts). The WebGPU code is
// loaded on demand (its own chunk), primed at import so it is ready long
// before the first journey acquires the engine.
type BackendModule = typeof import("./webgpu/backend");
let gpuReady: { mod: BackendModule; adapter: unknown } | null = null;
let priming: Promise<void> | null = null;
export function primeParticleBackend(): Promise<void> {
  if (priming) return priming;
  if (typeof window === "undefined" || typeof navigator === "undefined") return Promise.resolve();
  priming = (async () => {
    const mod = await import("./webgpu/backend");
    if (mod.requestedParticleBackend() !== "webgpu") return;
    const probe = await mod.probeWebGPU();
    if (probe.available && probe.adapter) gpuReady = { mod, adapter: probe.adapter };
  })().catch(() => { gpuReady = null; });
  return priming;
}
if (typeof window !== "undefined" && typeof navigator !== "undefined" && (navigator as unknown as { gpu?: unknown }).gpu) void primeParticleBackend();
let switchable: Switchable | null = null;
const setBackendDiag = (v: string) => { if (typeof window !== "undefined") (window as unknown as Record<string, unknown>).__resonanceParticleBackend = v; };

function measuring(): boolean {
  try { return window.localStorage.getItem("resonance-particle-tripwire") === "1"; } catch { return false; }
}

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
let releaseSeq = 0;
export function releaseSharedParticleEngineWithFade(): void {
  const sh = shared;
  if (!sh || typeof document === "undefined") return;
  // the statement card took the canvas for its piano: an outgoing journey's
  // late unmount must not pull it away (or stop the engine mid-gather)
  if (statementHold) return;
  const visible = sh.canvas.style.visibility !== "hidden" && Number(sh.canvas.style.opacity || "0") > 0.02;
  if (!visible) { sh.engine.stop(); sh.canvas.style.visibility = "hidden"; sh.canvas.remove(); return; }
  Object.assign(sh.canvas.style, { position: "fixed", inset: "0", zIndex: "3", transition: "opacity 1.5s linear" } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(sh.canvas);
  // (a re-acquire in the same frame — the phone title-hold tears the journey
  // down as the card's piano takes the canvas — cancels this fade)
  const seq = ++releaseSeq;
  requestAnimationFrame(() => { if (seq === releaseSeq) sh.canvas.style.opacity = "0"; });
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
  ++releaseSeq; // a release's pending fade-to-0 must not land on the new owner
  if (shared) {
    tryUpgrade("re-acquire");
    // visible again: a release of an invisible field parked it hidden
    Object.assign(shared.canvas.style, { position: "absolute", inset: "0", zIndex: "", transition: "opacity 0.6s linear", visibility: "visible" } as Partial<CSSStyleDeclaration>);
    return shared;
  }
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none",
    // composited from birth (2026-10-08 opening-freeze fix): invisible 0.1 %,
    // never visibility:hidden while in use, its own layer (will-change)
    opacity: "0.001", visibility: "visible", willChange: "opacity", transition: "opacity 0.6s linear",
  } as Partial<CSSStyleDeclaration>);
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.particleLead = "1";
  const hooks: SharedParticleEngine["hooks"] = { audio: null };
  const probe = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("particleprobe") === "1";
  const common: ParticleEngineOptions = {
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
      // measurement runs (velocity tripwire on — review browsers only, never the
      // kiosk) pay a GPU read-back inside the frame: the watchdog must not count
      // it, or it switches the field off and the run measures nothing
      // (2026-10-08 A/B: Snowflake tripped at 2.8 s with the read-back, never without)
      watchdog: { cpuMs: measuring() ? 1000 : 50, gapMs: 1000, onStall: (why) => disableParticlesForSession(`watchdog: ${why}`) },
  };
  commonOpts = common;
  try {
    const gpu = gpuReady;
    gpuReady = null; // an adapter serves one device
    let first: ParticleEngine | null = null;
    if (gpu) { try { first = makeWebGPU(canvas, gpu); } catch { first = null; /* navigator.gpu vanished: WebGL2 */ } }
    const backend = first ? "webgpu" : "webgl2";
    if (!first) first = createParticleEngine(canvas, common);
    switchable = createSwitchableEngine(first, backend);
    sharedEnginesCreated++;
    shared = { canvas, engine: switchable.engine, hooks };
    setBackendDiag(backend);
    // the adapter probe is still in flight: WebGL2 now, WebGPU as soon as it
    // lands while the field is still off screen (the boot warm-up acquires early)
    if (backend === "webgl2" && priming && !gpuFailed) void priming.then(() => tryUpgrade("probe landed"));
    return shared;
  } catch (e) {
    disableParticlesForSession(`engine unavailable: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

let commonOpts: ParticleEngineOptions | null = null;
let gpuFailed = false;

function makeWebGPU(canvas: HTMLCanvasElement, gpu: { mod: BackendModule; adapter: unknown }): ParticleEngine {
  return gpu.mod.createParticleEngineFor(canvas, { ...commonOpts!, onGpuFailure: (why: string) => fallBackToGL(why) }, "webgpu", { available: true, adapter: gpu.adapter as never });
}

/** Swap the shared engine's implementation onto a fresh canvas (cloned style
 *  and data), the remembered state replayed (webgpu/switchable.ts). */
function swapEngine(make: (c: HTMLCanvasElement) => ParticleEngine, backend: "webgpu" | "webgl2", diag: string): boolean {
  const sh = shared, sw = switchable;
  if (!sh || !sw || disabledWhy) return false;
  const c2 = sh.canvas.cloneNode(false) as HTMLCanvasElement;
  const next = make(c2);
  sharedEnginesCreated++;
  if (sh.canvas.parentElement) sh.canvas.replaceWith(c2);
  sh.canvas = c2;
  sw.swap(next, backend);
  setBackendDiag(diag);
  return true;
}

/** Any WebGPU failure (adapter, WGSL, device loss): WebGL2 in place. */
function fallBackToGL(why: string): void {
  gpuFailed = true;
  if (!switchable || switchable.backend() === "webgl2" || !commonOpts) return;
  try { swapEngine((c) => createParticleEngine(c, commonOpts!), "webgl2", `webgl2 (fallback: ${why})`); }
  catch (e) { disableParticlesForSession(`webgpu failed (${why}); webgl2 unavailable: ${e instanceof Error ? e.message : String(e)}`); }
}

/** WebGL2 → WebGPU once the probe has landed — only while the field is off screen. */
function tryUpgrade(why: string): void {
  const sh = shared, sw = switchable, gpu = gpuReady;
  if (!sh || !sw || !gpu || gpuFailed || sw.backend() === "webgpu" || !commonOpts || disabledWhy) return;
  const onScreen = sh.canvas.isConnected && sh.canvas.style.visibility !== "hidden" && Number(sh.canvas.style.opacity || "0") > 0.02;
  if (onScreen) return; // a later acquire / release retries
  gpuReady = null;
  try { swapEngine((c) => makeWebGPU(c, gpu), "webgpu", `webgpu (upgraded: ${why})`); }
  catch { gpuFailed = true; }
}

/** test hook */
export function __resetSharedParticleEngineForTest(): void {
  shared = null;
  switchable = null;
  commonOpts = null;
  gpuFailed = false;
  gpuReady = null;
  priming = null;
  disabledWhy = null;
  sharedEnginesCreated = 0;
  listeners.clear();
}

// ── STATEMENT-CARD HOLD (2026-10-09: the set-start card forms Karel's 1919
// piano in particles). While the card owns the shared engine, a journey layer
// that mounts behind it (journey 0 pre-starts under the card) waits: it must
// not take the canvas (the piano would vanish) nor start the engine inside the
// set-start GPU stall window. The card releases after its fade; a safety
// timeout releases it regardless.
let holdTimer: ReturnType<typeof setTimeout> | null = null;
const holdListeners = new Set<() => void>();
export function setStatementHold(on: boolean, maxMs = 15_000, onExpire?: () => void): void {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  // a hold that outlives its card hands back PROPERLY (the owner clears what it
  // showed first) — 2026-10-09: a 15 s expiry fired inside the 15 s card and the
  // journey took the canvas with the piano still worn on it
  if (on) holdTimer = setTimeout(() => { holdTimer = null; try { onExpire?.(); } finally { setStatementHold(false); } }, maxMs);
  if (statementHold === on) return;
  statementHold = on;
  for (const l of [...holdListeners]) l();
}
export function statementHoldActive(): boolean {
  return statementHold;
}
export function onStatementHoldChange(cb: () => void): () => void {
  holdListeners.add(cb);
  return () => holdListeners.delete(cb);
}
