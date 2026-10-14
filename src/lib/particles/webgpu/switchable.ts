// ─────────────────────────────────────────────────────────────────────────────
// switchable.ts — one ParticleEngine object the journey layers keep for the
// whole session, whose implementation can fall back WebGPU → WebGL2 at any
// moment (adapter failure, WGSL failure, device loss) without the layers
// noticing: every call is forwarded to the current engine, and the LAST call
// of every state-setting method is remembered so the fallback engine is
// brought to the same state (souls prepared, soul, palette, image, envelopes…)
// before it takes over. The fallback field re-gathers while invisible (its
// programs warm first — the layer already waits on isWarm()).
// ─────────────────────────────────────────────────────────────────────────────

import type { ParticleEngine } from "../particle-engine";

/** Calls that are not state (queries, lifecycle, one-shot events). */
const NOT_STATE = new Set<string>([
  "start", "stop", "dispose", "stats", "isWarm", "prewarm", "warmBurst", "resize",
  "imageLevel", "imageShown", "imageState", "imageSampleCount", "dissolveTime", "gravityState", "bridgeState",
  "lastRetarget", "settledFor", "scoreCompiled", "handsCompiled", "trailsCompiled", "trailsShown",
  "impulse", "enter", "regather", "snapToImage", "snapImage", "startDissolve", "dissolveTo", "releaseFlight",
]);

export interface Switchable {
  engine: ParticleEngine;
  /** which implementation runs now */
  backend(): "webgpu" | "webgl2";
  /** Swap to `next` (already created), replaying the remembered state. */
  swap(next: ParticleEngine, backend: "webgpu" | "webgl2"): void;
  /** swap(next, "webgl2") */
  fallBack(next: ParticleEngine): void;
}

export function createSwitchableEngine(first: ParticleEngine, backend: "webgpu" | "webgl2"): Switchable {
  let cur = first;
  let which = backend;
  let running = false;
  const prepared = new Set<string>();
  const last = new Map<string, unknown[]>(); // method → its last args (insertion = call order)

  const engine = new Proxy({} as ParticleEngine, {
    get(_t, prop: string) {
      const v = (cur as unknown as Record<string, unknown>)[prop];
      if (typeof v !== "function") return v;
      return (...args: unknown[]) => {
        if (prop === "start") running = true;
        else if (prop === "stop") running = false;
        else if (prop === "prepare") for (const s of (args[0] as string[]) ?? []) prepared.add(s);
        else if (!NOT_STATE.has(prop)) { last.delete(prop); last.set(prop, args); }
        return ((cur as unknown as Record<string, (...a: unknown[]) => unknown>)[prop])(...args);
      };
    },
  });

  const swap = (next: ParticleEngine, b: "webgpu" | "webgl2") => {
      const old = cur;
      cur = next;
      which = b;
      try { old.stop(); } catch { /* already gone */ }
      if (prepared.size) next.prepare([...prepared] as Parameters<ParticleEngine["prepare"]>[0]);
      for (const [m, args] of last) {
        try { (next as unknown as Record<string, (...a: unknown[]) => unknown>)[m](...args); } catch { /* a stale arg never blocks the fallback */ }
      }
      if (running) next.start();
      try { old.dispose(); } catch { /* already gone */ }
  };
  return { engine, backend: () => which, swap, fallBack: (next) => swap(next, "webgl2") };
}
