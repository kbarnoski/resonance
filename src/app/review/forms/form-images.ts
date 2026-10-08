/**
 * Image-form helpers for the form review station — faithful copies of the
 * journey layer's private helpers (src/components/audio/particle-lead-layer.tsx:
 * computeUv / uvFor, resolveEmblem's "@angel-outline" trace, the ≤512 / ≤640 px
 * decode-and-shrink) so a form reviewed here is sampled exactly as a journey
 * samples it. Copied rather than imported: that file is under active edit and
 * keeps them module-private. If the layer's sampling changes, mirror it here.
 */
import { flashAngelSrc, warmFlashAngel } from "@/components/audio/flash-angel";

const uvCache = new WeakMap<object, Float32Array>();

/** Importance-sampled image coordinates (bright structure gets the motes). */
function computeUv(src: HTMLCanvasElement, n: number): Float32Array | undefined {
  const W = Math.min(256, src.width), H = Math.max(1, Math.round((src.height * W) / Math.max(1, src.width)));
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(src, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const cdf = new Float64Array(W * H);
  let acc = 0;
  for (let i = 0; i < W * H; i++) {
    const L = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
    acc += L < 0.06 ? 0 : Math.pow(L, 1.4) * (d[i * 4 + 3] / 255);
    cdf[i] = acc;
  }
  if (acc <= 0) return undefined;
  const out = new Float32Array(n * 2);
  const perm = new Uint32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;
  for (let i = n - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  const last = W * H - 1;
  let lo = 0;
  for (let k = 0; k < n; k++) {
    const target = ((k + Math.random()) / n) * acc;
    while (lo < last && cdf[lo] < target) lo++;
    const x = lo % W, y = (lo - x) / W;
    const j = perm[k];
    out[j * 2] = (x + Math.random()) / W;
    out[j * 2 + 1] = 1 - (y + Math.random()) / H; // textures upload flipped (bottom-left origin)
  }
  return out;
}

export function uvFor(src: HTMLCanvasElement, n: number): Float32Array | undefined {
  const hit = uvCache.get(src);
  if (hit && hit.length === n * 2) return hit;
  const uv = computeUv(src, n);
  if (uv) uvCache.set(src, uv);
  return uv;
}

/** The angel traced as lines of light (luminance edges). */
function outline(a: HTMLCanvasElement): HTMLCanvasElement {
  const k = Math.min(1, 512 / Math.max(a.width, a.height));
  const w = Math.round(a.width * k), h = Math.round(a.height * k);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return a;
  ctx.drawImage(a, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = (0.3 * d.data[i * 4] + 0.59 * d.data[i * 4 + 1] + 0.11 * d.data[i * 4 + 2]) / 255;
  const o = ctx.createImageData(w, h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = L[i + 1] - L[i - 1] + 0.5 * (L[i - w + 1] - L[i - w - 1] + L[i + w + 1] - L[i + w - 1]);
    const gy = L[i + w] - L[i - w] + 0.5 * (L[i + w - 1] - L[i - w - 1] + L[i + w + 1] - L[i - w + 1]);
    const e = Math.min(1, Math.hypot(gx, gy) * 3.2);
    o.data[i * 4] = 255 * e; o.data[i * 4 + 1] = 240 * e; o.data[i * 4 + 2] = 248 * e; o.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(o, 0, 0);
  return c;
}

const cache = new Map<string, Promise<HTMLCanvasElement | null>>();

/** Decoded + shrunk canvas for a form source (URL, "@angel" or "@angel-outline"). */
export function formCanvas(src: string, maxSide: number): Promise<HTMLCanvasElement | null> {
  const key = `${src}@${maxSide}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let p: Promise<HTMLCanvasElement | null>;
  if (src === "@angel") p = warmFlashAngel(flashAngelSrc(1));
  else if (src === "@angel-outline") p = warmFlashAngel(flashAngelSrc(1)).then((a) => (a ? outline(a) : null));
  else {
    p = new Promise((resolve) => {
      const img = new Image();
      img.src = src;
      void img.decode().catch(() => undefined).then(() => {
        if (!img.naturalWidth) return resolve(null);
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d", { willReadFrequently: true })?.drawImage(img, 0, 0, c.width, c.height);
        resolve(c);
      });
    });
  }
  p = p.then((c) => { if (!c) cache.delete(key); return c; });
  cache.set(key, p);
  return p;
}
