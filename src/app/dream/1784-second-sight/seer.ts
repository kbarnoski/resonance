// ─────────────────────────────────────────────────────────────────────────────
// 1784-second-sight — the machine "seer".
//
//   A real, lightweight neural pass that actually LOOKS at each frame and emits
//   a coarse per-pixel salience / feature map. It runs on TensorFlow.js' WebGL
//   backend (already a repo dependency). No pretrained model package is a
//   dependency, so — per the brief — the seer is a small FIXED-SEED conv stack
//   (seeded 3×3 filters + two pooling levels) whose untrained-but-deterministic
//   feature energy is fused with three classic bottom-up saliency channels a
//   real early-vision system computes:
//
//     • center–surround luminance contrast (what "pops out")
//     • oriented edge energy (Sobel — real contours)
//     • warm/skin chroma response (a face/body proxy)
//
//   The fused 64×64 RGBA map (R=salience, G=edges, B=warm, A=feature energy) is
//   read back and uploaded as a texture that CONDITIONS the GPU hallucination
//   growth — so the bloom follows real machine-perceived structure, not raw
//   contrast. It is genuinely "the machine sees the world"; it is honestly NOT
//   a trained face/body segmenter (none was available to depend on).
//
//   Everything is deterministic: seeded weights, fixed kernels, and tfjs ops are
//   pure functions of the input frame. Any failure throws → caller falls back to
//   the shader-only salience and the piece keeps running.
// ─────────────────────────────────────────────────────────────────────────────

import type * as TF from "@tensorflow/tfjs";

export const SEER_RES = 64; // output map is SEER_RES × SEER_RES RGBA

function makeMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded, zero-mean conv weights of shape [kh, kw, inC, outC]. */
function seededWeights(
  shape: [number, number, number, number],
  seed: number,
): number[] {
  const [kh, kw, inC, outC] = shape;
  const rnd = makeMulberry32(seed);
  const per = kh * kw * inC;
  const out: number[] = [];
  for (let o = 0; o < outC; o++) {
    const filt: number[] = [];
    let mean = 0;
    for (let i = 0; i < per; i++) {
      const v = rnd() * 2 - 1;
      filt.push(v);
      mean += v;
    }
    mean /= per;
    for (let i = 0; i < per; i++) out.push((filt[i] - mean) * 0.35);
  }
  // out is filter-major; reshape below expects [kh,kw,inC,outC] ordering, so
  // interleave back into element order.
  const res = new Array<number>(per * outC);
  let idx = 0;
  for (let o = 0; o < outC; o++) {
    for (let i = 0; i < per; i++) {
      res[i * outC + o] = out[idx++];
    }
  }
  return res;
}

export class Seer {
  private tf: typeof TF | null = null;
  private w1: TF.Tensor4D | null = null;
  private w2: TF.Tensor4D | null = null;
  private sobelX: TF.Tensor4D | null = null;
  private sobelY: TF.Tensor4D | null = null;
  private ok = false;
  private out = new Uint8Array(SEER_RES * SEER_RES * 4);

  /** True once init() succeeded and the seer is producing maps. */
  get active(): boolean {
    return this.ok;
  }

  async init(): Promise<boolean> {
    try {
      const tf = await import("@tensorflow/tfjs");
      await tf.setBackend("webgl");
      await tf.ready();
      this.tf = tf;

      this.w1 = tf.tensor4d(seededWeights([3, 3, 3, 8], 0x1784a1), [3, 3, 3, 8]);
      this.w2 = tf.tensor4d(seededWeights([3, 3, 8, 8], 0x1784b2), [3, 3, 8, 8]);
      // Sobel kernels [3,3,1,1]
      this.sobelX = tf.tensor4d(
        [1, 0, -1, 2, 0, -2, 1, 0, -1],
        [3, 3, 1, 1],
      );
      this.sobelY = tf.tensor4d(
        [1, 2, 1, 0, 0, 0, -1, -2, -1],
        [3, 3, 1, 1],
      );
      this.ok = true;
      return true;
    } catch {
      this.ok = false;
      this.dispose();
      return false;
    }
  }

  /**
   * Run the seer on a source frame. Returns a freshly-written RGBA Uint8Array
   * (SEER_RES²·4) on success, or null on any failure (caller then relies on the
   * shader-only salience fallback).
   */
  run(source: HTMLCanvasElement | HTMLVideoElement): Uint8Array | null {
    const tf = this.tf;
    if (!tf || !this.ok || !this.w1 || !this.w2 || !this.sobelX || !this.sobelY) {
      return null;
    }
    const w1 = this.w1;
    const w2 = this.w2;
    const sobelX = this.sobelX;
    const sobelY = this.sobelY;
    try {
      const data = tf.tidy(() => {
        const norm = (t: TF.Tensor4D): TF.Tensor4D => {
          const mn = t.min();
          const mx = t.max();
          return t.sub(mn).div(mx.sub(mn).add(1e-6)) as TF.Tensor4D;
        };

        const img = tf.browser.fromPixels(source).toFloat().div(255);
        const x = tf.image.resizeBilinear(img as TF.Tensor3D, [128, 128]);
        const batched = x.expandDims(0) as TF.Tensor4D; // [1,128,128,3]

        // seeded feature stack (real conv + relu + two pools)
        let h = tf.conv2d(batched, w1, 1, "same").relu();
        h = tf.maxPool(h as TF.Tensor4D, 2, 2, "same");
        h = tf.conv2d(h as TF.Tensor4D, w2, 1, "same").relu();
        h = tf.maxPool(h as TF.Tensor4D, 2, 2, "same"); // [1,32,32,8]
        let feat = (h as TF.Tensor4D).mean(3, true) as TF.Tensor4D; // [1,32,32,1]
        feat = tf.image.resizeBilinear(feat, [SEER_RES, SEER_RES]) as TF.Tensor4D;
        feat = norm(feat);

        // luminance at working res
        const lumW = [0.299, 0.587, 0.114];
        const lum128 = batched.mul(tf.tensor1d(lumW)).sum(3, true) as TF.Tensor4D;
        const lum = tf.image.resizeBilinear(lum128, [SEER_RES, SEER_RES]) as TF.Tensor4D;

        // center-surround saliency (fine avg vs coarse avg)
        const fine = tf.avgPool(lum, 3, 1, "same") as TF.Tensor4D;
        const coarse = tf.avgPool(lum, 9, 1, "same") as TF.Tensor4D;
        const sal = norm(fine.sub(coarse).abs() as TF.Tensor4D);

        // oriented edge energy (Sobel)
        const gx = tf.conv2d(lum, sobelX, 1, "same") as TF.Tensor4D;
        const gy = tf.conv2d(lum, sobelY, 1, "same") as TF.Tensor4D;
        const edge = norm(gx.square().add(gy.square()).add(1e-6).sqrt() as TF.Tensor4D);

        // warm / skin chroma proxy: R − 0.5(G+B), rectified
        const ch = tf.split(batched, 3, 3) as TF.Tensor4D[];
        let warm = ch[0].sub(ch[1].add(ch[2]).mul(0.5)).relu() as TF.Tensor4D;
        warm = tf.image.resizeBilinear(warm, [SEER_RES, SEER_RES]) as TF.Tensor4D;
        warm = norm(warm);

        // fuse channels into the salience map
        const overall = tf.clipByValue(
          sal.mul(0.45).add(feat.mul(0.4)).add(warm.mul(0.35)),
          0,
          1,
        ) as TF.Tensor4D;

        const rgba = tf
          .concat([overall, edge, warm, feat], 3)
          .mul(255)
          .clipByValue(0, 255)
          .squeeze([0]) as TF.Tensor3D; // [64,64,4]
        return rgba.cast("int32").dataSync();
      });

      const o = this.out;
      for (let i = 0; i < o.length; i++) o[i] = data[i] as number;
      return o;
    } catch {
      // one bad frame shouldn't kill the seer, but if it recurs the caller's
      // throttle simply keeps getting null and the shader fallback carries on.
      return null;
    }
  }

  dispose(): void {
    this.w1?.dispose();
    this.w2?.dispose();
    this.sobelX?.dispose();
    this.sobelY?.dispose();
    this.w1 = this.w2 = this.sobelX = this.sobelY = null;
    this.ok = false;
  }
}
