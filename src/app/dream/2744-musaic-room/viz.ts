// ─── musaic-room · Canvas2D feature map ──────────────────────────────────────
// Draws the corpus as a live scatter plot: x = brightness (spectral centroid),
// y = loudness. Each dot ages from bright violet (just heard) to dim (old). The
// current query grain and its matched neighbour are highlighted with a link
// line and a pulsing ring on the match. Smooth luminance only — no strobe.

import type { FeatureVec, Grain } from "./dsp";

export interface DrawState {
  corpus: Grain[];
  corpusCap: number;
  query: FeatureVec | null;
  match: Grain | null; // the matched past grain, or null
  nowMs: number;
  running: boolean;
  source: "mic" | "demo" | null;
}

// Raw hex is allowed inside the canvas art layer only.
const BG = "#0a0a12";
const GRID = "rgba(139,110,246,0.08)";
const AXIS_TEXT = "rgba(200,190,230,0.45)";
const LINK = "rgba(179,155,255,0.55)";
const QUERY = "#e7e0ff";
const MATCH = "#b39bff";

function plotX(vec: FeatureVec, x0: number, w: number): number {
  return x0 + vec.ncent * w;
}
function plotY(vec: FeatureVec, y0: number, h: number): number {
  // Loudness up: louder grains sit higher.
  return y0 + (1 - vec.nrms) * h;
}

/** Paint one frame. Called from the component's requestAnimationFrame loop. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: DrawState,
): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const x0 = padL;
  const y0 = padT;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // Grid + axis labels.
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.fillStyle = AXIS_TEXT;
  ctx.font = "10px ui-monospace, monospace";
  for (let i = 0; i <= 4; i++) {
    const gx = x0 + (i / 4) * plotW;
    ctx.beginPath();
    ctx.moveTo(gx, y0);
    ctx.lineTo(gx, y0 + plotH);
    ctx.stroke();
    const gy = y0 + (i / 4) * plotH;
    ctx.beginPath();
    ctx.moveTo(x0, gy);
    ctx.lineTo(x0 + plotW, gy);
    ctx.stroke();
  }
  ctx.fillText("dark", x0, y0 + plotH + 18);
  ctx.fillText("bright →", x0 + plotW - 46, y0 + plotH + 18);
  ctx.save();
  ctx.translate(14, y0 + plotH);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("loud →", 0, 0);
  ctx.restore();

  const { corpus, corpusCap, query, match, nowMs } = state;

  // Corpus scatter — colour/opacity by age (id relative to newest).
  const newest = corpus.length > 0 ? corpus[corpus.length - 1].id : 0;
  for (let i = 0; i < corpus.length; i++) {
    const g = corpus[i];
    // Age 0 = brand new, 1 = about to be evicted.
    const age = corpusCap > 1 ? (newest - g.id) / corpusCap : 0;
    const bright = Math.max(0.12, 1 - age);
    const px = plotX(g.vec, x0, plotW);
    const py = plotY(g.vec, y0, plotH);
    const r = 1.6 + g.vec.nrms * 2.4;
    // Older grains cool toward indigo, newer glow violet.
    const rc = Math.round(90 + bright * 100);
    const gc = Math.round(70 + bright * 40);
    const bc = Math.round(150 + bright * 90);
    ctx.beginPath();
    ctx.fillStyle = `rgba(${rc},${gc},${bc},${0.22 + bright * 0.6})`;
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Highlight the query + matched neighbour with a link + pulsing ring.
  if (query) {
    const qx = plotX(query, x0, plotW);
    const qy = plotY(query, y0, plotH);

    if (match) {
      const mx = plotX(match.vec, x0, plotW);
      const my = plotY(match.vec, y0, plotH);

      ctx.strokeStyle = LINK;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(qx, qy);
      ctx.lineTo(mx, my);
      ctx.stroke();

      // Pulsing ring on the match — slow, smooth (≈0.7 Hz), never a strobe.
      const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.0045);
      ctx.strokeStyle = `rgba(179,155,255,${0.35 + pulse * 0.5})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(mx, my, 5 + pulse * 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = MATCH;
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Query grain marker (the present moment).
    ctx.fillStyle = QUERY;
    ctx.beginPath();
    ctx.arc(qx, qy, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(231,224,255,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(qx, qy, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Corpus fill meter (bottom-right), so you watch the memory grow.
  const frac = corpus.length / corpusCap;
  ctx.fillStyle = "rgba(200,190,230,0.4)";
  ctx.font = "10px ui-monospace, monospace";
  const label = `${corpus.length} / ${corpusCap} grains remembered`;
  ctx.fillText(label, x0 + plotW - 168, y0 + 12);
  ctx.strokeStyle = "rgba(139,110,246,0.35)";
  ctx.strokeRect(x0 + plotW - 168, y0 + 16, 152, 4);
  ctx.fillStyle = "rgba(179,155,255,0.75)";
  ctx.fillRect(x0 + plotW - 168, y0 + 16, 152 * Math.min(1, frac), 4);

  if (!state.running && corpus.length === 0) {
    ctx.fillStyle = "rgba(200,190,230,0.4)";
    ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(
      "Press Begin listening — the room's memory fills as it hears itself.",
      x0 + 8,
      y0 + plotH / 2,
    );
  }
}
