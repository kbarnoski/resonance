/* ──────────────────────────────────────────────────────────────────────────
   dream.ts — the audio→image leg of the loop.

   • mapDescriptorToPrompt: a controlled vocabulary turning the bed's spectral
     descriptor into an austere Ikeda-flavoured text prompt.
   • dreamImage: POSTs the prompt to the guarded flux route, loads the returned
     remote image (crossOrigin) into a canvas; on ANY failure (no key / 501 /
     429 / network / taint) it falls back to a procedural data-image drawn from
     the descriptor. Either way you get a canvas you can read pixels from.
   • drawProceduralImage: a deterministic domain-warped interference / line-
     field seeded by the descriptor — looks like austere data and still CHANGES
     with the sound. This is the zero-network engine.
   ────────────────────────────────────────────────────────────────────────── */

import type { Descriptor } from "./audio";

export interface DreamResult {
  canvas: HTMLCanvasElement;
  source: "flux" | "procedural";
  prompt: string;
}

// ── controlled-vocabulary prompt ─────────────────────────────────────────────

export function describeWords(d: Descriptor): { brightness: string; texture: string } {
  const brightness = d.centroid > 0.5 ? "bright" : "dark";
  const texture = d.density < 0.4 ? "sparse" : d.flatness > 0.4 ? "rough" : "dense";
  return { brightness, texture };
}

export function mapDescriptorToPrompt(d: Descriptor): string {
  const { brightness, texture } = describeWords(d);
  const key = `${brightness}-${texture}`;
  const VOCAB: Record<string, string> = {
    "bright-sparse":
      "high thin filaments of white light on pure black, austere data grid, fine pinpoints, Ryoji Ikeda, minimal",
    "bright-dense":
      "dense lattice of fine white lines and grid on black, glowing data spectacle, sharp horizontal striations, Ikeda",
    "bright-rough":
      "shimmering bright white granular field on black, scattered hot pixels, noise spectrum, austere monochrome data",
    "dark-sparse":
      "a few faint cyan strokes low on a vast black field, austere, sparse data marks, minimal Ikeda still",
    "dark-dense":
      "dense low charcoal static, banded grey horizontal strata on black, heavy data field, monochrome",
    "dark-rough":
      "granular charcoal noise field, rough dark static on black, grainy low-frequency texture, austere",
  };
  return VOCAB[key] ?? VOCAB["dark-dense"];
}

// ── deterministic helpers ─────────────────────────────────────────────────────

function hashDescriptor(d: Descriptor): number {
  // quantise so a stable mood yields a stable seed but motion still changes it
  const parts = [d.low, d.mid, d.high, d.centroid, d.flatness, d.density];
  let h = 2166136261;
  for (const p of parts) {
    h ^= Math.round(p * 997);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── procedural data-image (the bulletproof, zero-network fallback) ───────────
// A domain-warped interference / line-field. Bright moods → high thin lines &
// pinpoints; dark moods → low banded strata; rough → grain. Always changes with
// the descriptor, always reads as an austere Ikeda-style data picture.

export function drawProceduralImage(d: Descriptor): HTMLCanvasElement {
  const W = 512;
  const H = 384;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const seed = hashDescriptor(d);
  const rng = makeRng(seed);

  // black ground
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  const img = ctx.createImageData(W, H);
  const px = img.data;

  // interference parameters derived from the descriptor
  const freqA = 0.01 + d.centroid * 0.16; // brighter → finer vertical detail
  const freqB = 0.006 + d.high * 0.12;
  const warp = 6 + d.flatness * 70; // rougher → more domain warp
  const bandY = 0.04 + (1 - d.centroid) * 0.18; // darker → low strata
  const grain = d.flatness; // roughness → granular noise
  const tint = d.centroid > 0.5; // bright → white, dark → cyan-leaning

  const ph = rng() * 6.28;

  for (let y = 0; y < H; y++) {
    const ny = y / H;
    for (let x = 0; x < W; x++) {
      const nx = x / W;
      // domain warp
      const wx = x + Math.sin(ny * 18 + ph) * warp;
      const wy = y + Math.cos(nx * 14 + ph) * warp * 0.6;
      // interference of vertical filaments + low horizontal strata
      const lines = Math.pow(
        0.5 + 0.5 * Math.sin(wx * freqA + Math.sin(wy * 0.03)),
        14 - d.density * 8
      );
      const strata =
        0.5 + 0.5 * Math.sin(wy * (bandY * 2) + Math.sin(wx * freqB));
      let v = lines * (0.55 + d.density * 0.45) + strata * (1 - d.centroid) * 0.5;
      // add granular roughness
      if (grain > 0.05 && rng() < grain * 0.5) v += (rng() - 0.3) * grain;
      v = Math.max(0, Math.min(1, v));
      // emphasise top rows for bright moods (high filaments), bottom for dark
      const vbias = tint ? 1 - ny * 0.3 : 0.6 + ny * 0.4;
      v *= vbias;

      const o = (y * W + x) * 4;
      if (tint) {
        // near-white with faint cyan cast
        px[o] = v * 235;
        px[o + 1] = v * 250;
        px[o + 2] = v * 255;
      } else {
        // charcoal with cyan accent
        px[o] = v * 60;
        px[o + 1] = v * 170;
        px[o + 2] = v * 200;
      }
      px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // a faint austere grid overlay (data-spectacle)
  ctx.strokeStyle = "rgba(120,200,220,0.07)";
  ctx.lineWidth = 1;
  const step = 32;
  for (let x = 0; x <= W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }

  return cv;
}

// load a remote image into a canvas; reject on error/taint so caller falls back
function loadRemoteToCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const to = window.setTimeout(() => reject(new Error("timeout")), 20000);
    img.onload = () => {
      window.clearTimeout(to);
      try {
        const cv = document.createElement("canvas");
        cv.width = 512;
        cv.height = 384;
        const ctx = cv.getContext("2d")!;
        ctx.drawImage(img, 0, 0, 512, 384);
        // probe for taint — getImageData throws on a tainted canvas
        ctx.getImageData(0, 0, 1, 1);
        resolve(cv);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      window.clearTimeout(to);
      reject(new Error("img error"));
    };
    img.src = url;
  });
}

// The full audio→image leg. Never throws; always returns a readable canvas.
export async function dreamImage(d: Descriptor): Promise<DreamResult> {
  const prompt = mapDescriptorToPrompt(d);
  try {
    const res = await fetch("/dream/704-spectral-seance/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (res.ok) {
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        const canvas = await loadRemoteToCanvas(data.url);
        return { canvas, source: "flux", prompt };
      }
    }
  } catch {
    /* fall through to procedural */
  }
  return { canvas: drawProceduralImage(d), source: "procedural", prompt };
}
