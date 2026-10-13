/**
 * THE BRIDGE's still sampler — a journey still, downscaled to a tiny colour
 * field, entirely OFF the main thread (kiosk law, 2026-10-09: main-thread
 * read-backs / GPU-backed bitmaps stalled the kiosk 20–340 ms).
 *
 * A dedicated worker fetches the still (already in the HTTP cache — the image
 * layer just showed it), decodes it, draws it into a 64-px-wide
 * OffscreenCanvas, softens it with a small box blur (the motes read colour
 * REGIONS, and the drift follows a smooth light gradient, never pixel noise)
 * and posts back plain RGBA bytes, rows bottom-up (GL's uv origin — no
 * UNPACK_FLIP needed). The main thread only hands those bytes to
 * engine.loadBridgeStill (a 9 KB texture upload, no read-back).
 *
 * No worker / OffscreenCanvas → null: the bridge simply doesn't run (there is
 * deliberately no main-thread fallback).
 */

export interface BridgeStill {
  px: Uint8Array;
  w: number;
  h: number;
  /** the still's own aspect (width / height) */
  aspect: number;
}

export const BRIDGE_SAMPLE_W = 64;

const WORKER_SRC = `
self.onmessage = async (ev) => {
  const { id, url, W } = ev.data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const bmp = await createImageBitmap(await res.blob());
    const aspect = bmp.width / Math.max(1, bmp.height);
    const w = W, h = Math.max(4, Math.round(W / Math.max(0.2, aspect)));
    const oc = new OffscreenCanvas(w, h);
    const cx = oc.getContext("2d", { willReadFrequently: true });
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const src = cx.getImageData(0, 0, w, h).data;
    // two passes of a 3x3 box blur (colour regions, smooth light gradient)
    let a = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { a[i * 3] = src[i * 4]; a[i * 3 + 1] = src[i * 4 + 1]; a[i * 3 + 2] = src[i * 4 + 2]; }
    for (let pass = 0; pass < 2; pass++) {
      const b = new Float32Array(a.length);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let r = 0, g = 0, bl = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = (yy * w + xx) * 3;
          r += a[j]; g += a[j + 1]; bl += a[j + 2]; n++;
        }
        const k = (y * w + x) * 3;
        b[k] = r / n; b[k + 1] = g / n; b[k + 2] = bl / n;
      }
      a = b;
    }
    // rows bottom-up: GL uv (0,0) is the bottom-left
    const px = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = ((h - 1 - y) * w + x) * 3, d = (y * w + x) * 4;
      px[d] = a[s]; px[d + 1] = a[s + 1]; px[d + 2] = a[s + 2]; px[d + 3] = 255;
    }
    self.postMessage({ id, px, w, h, aspect }, [px.buffer]);
  } catch (e) { self.postMessage({ id, err: String(e) }); }
};`;

let worker: Worker | null | undefined;
let seq = 0;
const waiters = new Map<number, (r: Partial<BridgeStill> & { err?: string }) => void>();
const cache = new Map<string, Promise<BridgeStill | null>>();
const CACHE_CAP = 12;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") { worker = null; return null; }
    const w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })));
    w.onmessage = (ev) => { const r = ev.data; const f = waiters.get(r.id); if (f) { waiters.delete(r.id); f(r); } };
    w.onerror = () => { for (const f of waiters.values()) f({ err: "worker" }); waiters.clear(); worker = null; };
    worker = w;
  } catch { worker = null; }
  return worker;
}

/** The still's tiny colour field (cached per url), or null when it can't be sampled off-thread. */
export function sampleBridgeStill(url: string): Promise<BridgeStill | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  const w = getWorker();
  if (!w) return Promise.resolve(null);
  const p = new Promise<BridgeStill | null>((resolve) => {
    const id = ++seq;
    waiters.set(id, (r) => resolve(r.px && r.w && r.h && r.aspect ? { px: r.px, w: r.w, h: r.h, aspect: r.aspect } : null));
    try {
      w.postMessage({ id, url: new URL(url, location.href).href, W: BRIDGE_SAMPLE_W });
    } catch { waiters.delete(id); resolve(null); }
  });
  cache.set(url, p);
  // a failed sample is not remembered (the next boundary may try again)
  void p.then((r) => { if (!r) cache.delete(url); });
  while (cache.size > CACHE_CAP) cache.delete(cache.keys().next().value as string);
  return p;
}
