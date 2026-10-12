// ─────────────────────────────────────────────────────────────────────────────
// SPATIAL PAIRING — "arrive where you are" (particle upgrade step 1, 2026-10-12)
//
// An image form used to give every particle a RANDOM point of the image (the
// importance samples were shuffled across particle indices), so the whole field
// converged through the middle and fanned out again — Karel's "contract and
// expand". Now the pairing is a rank match in polar coordinates:
//   • CPU (decode worker): the image's samples are sorted into PAIR_GROUPS
//     equal-count angle wedges around their centroid, each wedge by radius.
//   • GPU (five small passes when the image loads, no readback): the field is
//     binned around its own centre (256 angle sectors × 64 radius rings, every
//     particle counted); each particle's angle quantile picks its wedge, its
//     radius quantile (within its sector) its place along the wedge.
// The image is drawn by the same samples (crispness and density unchanged); each
// particle just travels to the part of it on its own side. Offline on The Bloom
// emblem: mean travel −20…−75 % by form, no paths through the centre, coverage
// within sampling noise. Sample film: ~/Documents/Resonance/particle-pairing-sample-2026-10-12.mp4
//
// On for EVERY journey, Snowflake and Ghost included (Karel 2026-10-12: "ghost
// needs your particle fix", "snowflake also") — never for Ghost's flash (it
// must land exactly on the flash image). ?pfx=0 = the old pairing.
// ─────────────────────────────────────────────────────────────────────────────

/** Angle wedges the samples are sorted into (the GPU pass uses the same number). */
export const PAIR_GROUPS = 48;

/** ON (Karel 2026-10-12: approved from the sample film); ?pfx=0 turns it off
 *  for an A/B look. */
export function pairingEnabled(): boolean {
  try {
    return !(typeof location !== "undefined" && new URLSearchParams(location.search).get("pfx") === "0");
  } catch {
    return true;
  }
}

/** Sort image samples (uv pairs) into `groups` equal-count angle wedges around
 *  their centroid, each wedge ordered by radius. Returns n*2 sorted uvs plus
 *  the centroid (cx, cy) at the end. SELF-CONTAINED (no outer references): its
 *  source is shipped into the decode worker. O(n): angle buckets, then radius
 *  buckets within each wedge. */
export function pairOrder(uv: Float32Array, groups: number): Float32Array {
  const n = uv.length >> 1;
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += uv[i * 2]; cy += uv[i * 2 + 1]; }
  cx /= Math.max(1, n); cy /= Math.max(1, n);
  const NB = 4096;
  const bin = new Uint16Array(n);
  const start = new Uint32Array(NB + 1);
  const rad = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dx = uv[i * 2] - cx, dy = uv[i * 2 + 1] - cy;
    const b = Math.min(NB - 1, Math.max(0, Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * NB)));
    bin[i] = b;
    start[b + 1]++;
    rad[i] = Math.sqrt(dx * dx + dy * dy);
  }
  for (let b = 0; b < NB; b++) start[b + 1] += start[b];
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[start[bin[i]]++] = i;
  // within each wedge: counting sort by radius (1024 rings) — O(n), a few ms
  // even on the main thread (the locked journeys' angel images sample there)
  let rmax = 1e-9;
  for (let i = 0; i < n; i++) if (rad[i] > rmax) rmax = rad[i];
  const RB = 1024;
  const ring = new Uint16Array(n);
  for (let i = 0; i < n; i++) ring[i] = Math.min(RB - 1, Math.floor((rad[i] / rmax) * RB));
  const out = new Float32Array(n * 2 + 2);
  const cnt = new Uint32Array(RB + 1);
  for (let g = 0; g < groups; g++) {
    const s = Math.floor((g * n) / groups), e = Math.floor(((g + 1) * n) / groups);
    cnt.fill(0);
    for (let k = s; k < e; k++) cnt[ring[order[k]] + 1]++;
    for (let b = 0; b < RB; b++) cnt[b + 1] += cnt[b];
    for (let k = s; k < e; k++) {
      const i = order[k];
      const at = s + cnt[ring[i]]++;
      out[at * 2] = uv[i * 2];
      out[at * 2 + 1] = uv[i * 2 + 1];
    }
  }
  out[n * 2] = cx;
  out[n * 2 + 1] = cy;
  return out;
}
