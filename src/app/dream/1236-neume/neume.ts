// neume.ts — lay a transcription out as square (Gregorian) notation across a
// four-line red stave that wraps line-by-line, and draw it onto a Canvas2D
// context so it inks itself in time with a playhead. Palette is parchment /
// vellum with sepia-brown ink and a single gilt accent — a warm-paper register.

import type { Figure, Transcription } from "./transcribe";

// ── logical page geometry (CSS-scaled to fit the container) ──────────────────
export const PAGE_W = 900;
export const PAGE_H = 600;
const MARGIN_L = 78; // room for clef + drop-cap
const MARGIN_R = 46;
const MARGIN_T = 54;
const STAFF_SPACE = 15; // gap between the 4 red lines
const STAFF_H = STAFF_SPACE * 3; // 4 lines → 3 gaps
const LINE_BLOCK = 100; // vertical stride between successive stave rows
const HALF_STEP = STAFF_SPACE / 2; // one diatonic step
const SQUARE = 13; // neume square side
const NOTE_ADV = SQUARE * 1.35; // x advance per note within a figure
const FIG_GAP = SQUARE * 1.15; // x gap between figures
const DEGREE_CLAMP = 6; // max diatonic steps above/below stave centre

// palette
const INK = "#5b3a1e";
const INK_SOFT = "#7a5230";
const RUBRIC = "#a3352a"; // the red of the stave lines / clef
const GOLD = "#c8a02a";
const GOLD_DEEP = "#a8781a";

export interface GlyphPos {
  x: number;
  y: number;
  line: number; // stave-row index (0 = first)
  diamond: boolean; // climacus tail notes are diamonds
  onset: number;
}

export interface Layout {
  glyphs: GlyphPos[]; // onset-ordered, one per note
  lineCount: number;
  refDegree: number;
}

function contentWidth(): number {
  return PAGE_W - MARGIN_L - MARGIN_R;
}

function figureWidth(fig: Figure): number {
  return fig.notes.length * NOTE_ADV;
}

/** Flow the figures across wrapping stave rows and compute every glyph's x/y. */
export function layout(tr: Transcription): Layout {
  const glyphs: GlyphPos[] = [];
  if (tr.notes.length === 0) return { glyphs, lineCount: 1, refDegree: 0 };

  // Reference degree = median, so the melody centres on the stave.
  const degs = tr.notes.map((n) => n.degree).sort((a, b) => a - b);
  const refDegree = degs[degs.length >> 1];

  const startX = MARGIN_L;
  const maxX = MARGIN_L + contentWidth();
  let x = startX;
  let line = 0;

  const yFor = (degree: number, ln: number): number => {
    const midY = MARGIN_T + ln * LINE_BLOCK + STAFF_H / 2;
    let step = degree - refDegree;
    if (step > DEGREE_CLAMP) step = DEGREE_CLAMP;
    if (step < -DEGREE_CLAMP) step = -DEGREE_CLAMP;
    return midY - step * HALF_STEP;
  };

  for (const fig of tr.figures) {
    const w = figureWidth(fig);
    if (x + w > maxX && x > startX) {
      line += 1;
      x = startX;
    }
    fig.notes.forEach((note, idx) => {
      glyphs.push({
        x: x + idx * NOTE_ADV + SQUARE / 2,
        y: yFor(note.degree, line),
        line,
        diamond: fig.kind === "climacus" && idx >= 1,
        onset: note.onset,
      });
    });
    x += w + FIG_GAP;
  }
  return { glyphs, lineCount: line + 1, refDegree };
}

// ── parchment texture (built once, then blitted each frame) ──────────────────
export function buildParchment(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  if (!g) return cv;
  // warm vellum base
  g.fillStyle = "#efe4c6";
  g.fillRect(0, 0, w, h);
  // soft radial glow toward the centre
  const grad = g.createRadialGradient(w / 2, h * 0.42, h * 0.1, w / 2, h * 0.5, h * 0.95);
  grad.addColorStop(0, "rgba(255,250,232,0.55)");
  grad.addColorStop(1, "rgba(120,96,52,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // faint fibre noise (deterministic-ish; texture only, not load-bearing)
  let seed = 0x1234abcd;
  const rnd = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 1 | seed) + 0x6d2b79f5) | 0;
    return ((seed >>> 0) % 1000) / 1000;
  };
  for (let i = 0; i < w * h * 0.04; i++) {
    const px = Math.floor(rnd() * w);
    const py = Math.floor(rnd() * h);
    const a = rnd() * 0.05;
    g.fillStyle = rnd() > 0.5 ? `rgba(90,58,30,${a})` : `rgba(255,248,225,${a})`;
    g.fillRect(px, py, 1, 1);
  }
  // darkened corners (vignette)
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(70,48,20,0.22)");
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  return cv;
}

// ── glyph drawing ────────────────────────────────────────────────────────────
function drawSquare(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = INK;
  g.fillRect(x - SQUARE / 2, y - SQUARE / 2, SQUARE, SQUARE);
}

function drawDiamond(g: CanvasRenderingContext2D, x: number, y: number): void {
  const r = SQUARE * 0.55;
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(x, y - r);
  g.lineTo(x + r, y);
  g.lineTo(x, y + r);
  g.lineTo(x - r, y);
  g.closePath();
  g.fill();
}

function drawStaveRow(g: CanvasRenderingContext2D, ln: number, showClef: boolean): void {
  const top = MARGIN_T + ln * LINE_BLOCK;
  g.strokeStyle = RUBRIC;
  g.lineWidth = 1.1;
  for (let i = 0; i < 4; i++) {
    const y = top + i * STAFF_SPACE;
    g.beginPath();
    g.moveTo(MARGIN_L - 10, y);
    g.lineTo(PAGE_W - MARGIN_R + 4, y);
    g.stroke();
  }
  if (showClef) drawCClef(g, MARGIN_L - 40, top);
}

// A stylised Gregorian C-clef: a tall bar plus two square lobes on the 2nd line.
function drawCClef(g: CanvasRenderingContext2D, x: number, top: number): void {
  const cy = top + STAFF_SPACE; // sit on the second line ("do")
  g.fillStyle = RUBRIC;
  g.fillRect(x, top - 2, 4.5, STAFF_H + 4); // spine
  g.fillRect(x + 5, cy - STAFF_SPACE * 0.9, SQUARE, SQUARE * 0.8); // upper lobe
  g.fillRect(x + 5, cy + STAFF_SPACE * 0.1, SQUARE, SQUARE * 0.8); // lower lobe
}

// Illuminated drop-cap in a gilt panel at the very start of the chant.
function drawDropCap(g: CanvasRenderingContext2D, letter: string): void {
  const size = 62;
  const x = 8;
  const y = MARGIN_T - 20;
  // gilt panel
  g.fillStyle = GOLD;
  g.fillRect(x, y, size, size);
  g.strokeStyle = RUBRIC;
  g.lineWidth = 2.5;
  g.strokeRect(x + 2.5, y + 2.5, size - 5, size - 5);
  // inner ornament corners
  g.fillStyle = GOLD_DEEP;
  g.fillRect(x + 6, y + 6, 6, 6);
  g.fillRect(x + size - 12, y + 6, 6, 6);
  g.fillRect(x + 6, y + size - 12, 6, 6);
  g.fillRect(x + size - 12, y + size - 12, 6, 6);
  // the initial
  g.fillStyle = "#6d1f18";
  g.font = "700 44px Georgia, 'Times New Roman', serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(letter, x + size / 2, y + size / 2 + 2);
  g.textAlign = "start";
  g.textBaseline = "alphabetic";
}

/** Full-frame draw. Reveals every glyph whose onset has passed `posSec`. */
export function drawManuscript(
  g: CanvasRenderingContext2D,
  parchment: HTMLCanvasElement,
  lay: Layout,
  posSec: number,
  scrollY: number,
  dpr: number,
): void {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, PAGE_W, PAGE_H);
  g.drawImage(parchment, 0, 0);
  g.save();
  g.translate(0, -scrollY);

  const visTop = scrollY - LINE_BLOCK;
  const visBot = scrollY + PAGE_H + LINE_BLOCK;

  // stave rows (only those on screen)
  for (let ln = 0; ln < lay.lineCount; ln++) {
    const rowY = MARGIN_T + ln * LINE_BLOCK;
    if (rowY < visTop || rowY > visBot) continue;
    drawStaveRow(g, ln, true);
  }
  if (MARGIN_T >= visTop && MARGIN_T <= visBot) drawDropCap(g, "N");

  // revealed neumes + ligature strokes
  const glyphs = lay.glyphs;
  let penX = -1;
  let penLine = 0;
  let prev: GlyphPos | null = null;
  for (let i = 0; i < glyphs.length; i++) {
    const gp = glyphs[i];
    if (gp.onset > posSec) break;
    // ligature stroke connecting notes of the same figure on the same line
    if (prev && prev.line === gp.line && Math.abs(gp.onset - prev.onset) < 1.2) {
      g.strokeStyle = INK_SOFT;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(prev.x, prev.y);
      g.lineTo(gp.x, gp.y);
      g.stroke();
    }
    if (gp.diamond) drawDiamond(g, gp.x, gp.y);
    else drawSquare(g, gp.x, gp.y);
    penX = gp.x + SQUARE / 2 + 3;
    penLine = gp.line;
    prev = gp;
  }

  // gilt playhead — the pen tip that is writing the chant
  if (penX < 0) {
    penX = MARGIN_L;
    penLine = 0;
  }
  const top = MARGIN_T + penLine * LINE_BLOCK;
  const glow = g.createLinearGradient(penX, top - 12, penX, top + STAFF_H + 12);
  glow.addColorStop(0, "rgba(200,160,42,0)");
  glow.addColorStop(0.5, GOLD);
  glow.addColorStop(1, "rgba(200,160,42,0)");
  g.strokeStyle = glow;
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(penX, top - 12);
  g.lineTo(penX, top + STAFF_H + 12);
  g.stroke();
  g.fillStyle = GOLD;
  g.beginPath();
  g.arc(penX, top + STAFF_H / 2, 3, 0, Math.PI * 2);
  g.fill();

  g.restore();
}

/** Vertical scroll so the pen row stays comfortably in view. */
export function penScroll(lay: Layout, posSec: number): number {
  let penLine = 0;
  for (const gp of lay.glyphs) {
    if (gp.onset > posSec) break;
    penLine = gp.line;
  }
  const rowY = MARGIN_T + penLine * LINE_BLOCK;
  const target = rowY - PAGE_H * 0.6;
  const maxScroll = Math.max(0, MARGIN_T + lay.lineCount * LINE_BLOCK - PAGE_H + 30);
  return Math.max(0, Math.min(target, maxScroll));
}
