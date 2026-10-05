// Group a v2 deep analysis's measured sections into the engine's 6
// journey phases (used by build-oct4-studio.mjs and future builders).
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
// ── phase grouping from the measured sections ──
export const PHASE_IDS = ["threshold", "expansion", "transcendence", "illumination", "return", "integration"];
/** Candidate cut points = section boundaries + midpoints of long sections
 *  (so a piece with < 6 sections still gets 6 phases). DP picks the 5 cuts
 *  minimising duration-weighted intensity variance inside phases, with a
 *  minimum phase length of 6% of the piece. */
export function groupPhases(sections, duration) {
  const pts = new Set();
  for (const s of sections) {
    pts.add(s.start);
    const len = s.end - s.start;
    const splits = len > 50 ? 3 : len > 22 ? 2 : 1;
    for (let k = 1; k < splits; k++) pts.add(Math.round(s.start + (len * k) / splits));
  }
  let cuts = [...pts].filter((t) => t > 0 && t < duration).sort((a, b) => a - b);
  // short pieces with few sections: halve the longest gaps until there
  // are enough candidate cuts for 6 phases (only kicks in when the
  // measured sections alone cannot form 6 — existing groupings unchanged)
  while (cuts.length < 5) {
    const B0 = [0, ...cuts, duration];
    let bi = 0;
    for (let i = 1; i < B0.length - 1; i++) if (B0[i + 1] - B0[i] > B0[bi + 1] - B0[bi]) bi = i;
    cuts = [...cuts, Math.round((B0[bi] + B0[bi + 1]) / 2)].sort((a, b) => a - b);
  }
  const B = [0, ...cuts, duration];
  const inten = (t) => (sections.find((s) => t >= s.start && t < s.end) ?? sections[sections.length - 1]).intensity;
  const cost = (a, b) => {
    const xs = [];
    for (let t = B[a]; t < B[b]; t += 1) xs.push(inten(t));
    const m = xs.reduce((x, v) => x + v, 0) / xs.length;
    return xs.reduce((x, v) => x + (v - m) ** 2, 0);
  };
  const minLen = duration * 0.06;
  const n = B.length - 1;
  const dp = Array.from({ length: 7 }, () => new Array(n + 1).fill(Infinity));
  const back = Array.from({ length: 7 }, () => new Array(n + 1).fill(-1));
  dp[0][0] = 0;
  for (let k = 1; k <= 6; k++) for (let j = 1; j <= n; j++) for (let i = 0; i < j; i++) {
    if (B[j] - B[i] < minLen || dp[k - 1][i] === Infinity) continue;
    const c = dp[k - 1][i] + cost(i, j);
    if (c < dp[k][j]) { dp[k][j] = c; back[k][j] = i; }
  }
  if (dp[6][n] === Infinity) throw new Error("cannot group into 6 phases");
  const idx = [n];
  for (let k = 6; k > 0; k--) idx.unshift(back[k][idx[0]]);
  return idx.slice(0, 6).map((i, p) => {
    const a = B[i], b = B[idx[p + 1]];
    const secs = sections.filter((s) => s.end > a && s.start < b);
    let w = 0, sum = 0, val = 0;
    for (let t = a; t < b; t++) { const s = sections.find((x) => t >= x.start && t < x.end) ?? sections[sections.length - 1]; sum += s.intensity; val += s.valence ?? 0; w++; }
    return { id: PHASE_IDS[p], startSec: a, endSec: b, start: r3(a / duration), end: r3(b / duration), intensity: r2(sum / w), valence: r2(val / w), sections: secs.map((s) => s.index) };
  });
}

