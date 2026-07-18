/**
 * The fresco field — a persistent spatial timeline of a breathing session.
 *
 * The wall is a 2D field whose HORIZONTAL axis is session time. A "trowel head"
 * advances slowly left→right as the session runs. Each confirmed exhale
 * deposits a glowing horizontal stratum at the current time-column, its
 * vertical position set by the breath's peak intensity (a just-intonation
 * partial). Deposits are CUMULATIVE and effectively PERMANENT — the update only
 * touches a small window of columns around the trowel, so once the trowel has
 * passed, a column is frozen history. Columns behind the trowel slowly
 * "oxidize" (a render-time warm deepening by age), like pigment fusing into
 * plaster in buon fresco — they mellow but never vanish.
 *
 * This is the memory mechanic, and it is deliberately NOT a decaying chord:
 * nothing fades back to the ground over ~30s. The wall is a readable
 * autobiography of the whole session.
 *
 * Two backends behind one interface: a real WebGPU compute field (ping-ponged
 * storage textures, vertical-fuse + deposit passes) and a full Canvas2D / CPU
 * fallback running the same logic. Feature-detected; never blank, never throws.
 */

export type FrescoBackend = "webgpu" | "canvas2d";

export interface FrescoDeposit {
  /** Vertical band centre, 0 (top) .. 1 (bottom). */
  y: number;
  /** Deposit brightness this frame, 0..1. */
  intensity: number;
  /** Linear RGB pigment hue, each 0..1. */
  color: [number, number, number];
}

export interface Fresco {
  readonly backend: FrescoBackend;
  /** Advance the field one frame. trowelX is normalised 0..1 session time. */
  step(trowelX: number, deposit: FrescoDeposit | null): void;
  /** Draw the current field to the bound canvas. */
  render(trowelX: number): void;
  reset(): void;
  dispose(): void;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function lerp3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  f: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Warm plaster/fresco pigment: sienna → ochre → chalk-white by intensity. */
export function frescoColor(
  intensity: number,
  partialT: number,
): [number, number, number] {
  const t = clamp01(intensity);
  const sienna: [number, number, number] = [0.62, 0.28, 0.12];
  const ochre: [number, number, number] = [0.88, 0.57, 0.22];
  const chalk: [number, number, number] = [0.97, 0.92, 0.8];
  let c =
    t < 0.5 ? lerp3(sienna, ochre, t / 0.5) : lerp3(ochre, chalk, (t - 0.5) / 0.5);
  // Low partials lean warmer/red, high partials leaner/chalk.
  const warm = (0.5 - partialT) * 0.12;
  c = [clamp01(c[0] + warm), clamp01(c[1]), clamp01(c[2] - warm * 0.5)];
  return c;
}

/** Feature-detect and build the best available fresco backend. */
export async function createFresco(canvas: HTMLCanvasElement): Promise<Fresco> {
  const hasGpu = "gpu" in navigator && (navigator as { gpu?: unknown }).gpu;
  if (hasGpu) {
    try {
      const { createGpuFresco } = await import("./fresco-gpu");
      const gpu = await createGpuFresco(canvas);
      if (gpu) return gpu;
    } catch {
      /* fall through to Canvas2D */
    }
  }
  const { createCanvasFresco } = await import("./fresco-canvas");
  return createCanvasFresco(canvas);
}
