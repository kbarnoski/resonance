// viz.ts — the SVG art layer for "emberline" (SVG, never Canvas2D).
//
// Two linked pictures on near-black:
//   1. the iconic emission-spectrum band — each line a glowing vertical bar
//      placed by wavelength across a black strip, coloured by its real visible
//      wavelength (spectra.ts::wavelengthToRGB), brightness = intensity.
//   2. the additive "partial ladder" beneath it — one bar per audible partial,
//      same colour as its line, height pulsing with the sounding amplitude.
//
// Structure is built once per element; the per-frame draw() only mutates
// attributes on cached nodes (no React churn, smooth animation). SVG is
// universally available, so it doubles as the graceful WebGL2 fallback.

import { LAM_RED, LAM_VIOLET, type ElementView } from "./spectra";

const NS = "http://www.w3.org/2000/svg";

// viewBox geometry
const VB_W = 1000;
const VB_H = 560;
const STRIP_X = 60;
const STRIP_W = VB_W - 120;
const STRIP_Y = 150;
const STRIP_H = 150;
const LADDER_TOP = 350;
const LADDER_BOT = 520;

function rgbStr(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

/** wavelength → x within the spectral strip (violet left, red right). */
function nmToX(nm: number): number {
  const t = (nm - LAM_VIOLET) / (LAM_RED - LAM_VIOLET); // 0 violet → 1 red
  return STRIP_X + t * STRIP_W;
}

interface LineNode {
  glow: SVGRectElement;
  core: SVGRectElement;
  rel: number;
}
interface BarNode {
  bar: SVGRectElement;
  cap: SVGCircleElement;
  rel: number;
  x: number;
}

export interface Renderer {
  setElement(view: ElementView): void;
  /**
   * @param t         monotonic seconds (for shimmer)
   * @param voiceAmp  0..1 overall envelope (attack/sustain/release)
   * @param partials  per-partial live amplitude 0..1, index-aligned to view
   */
  draw(t: number, voiceAmp: number, partials: number[]): void;
  dispose(): void;
}

function elem<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  return n;
}

export function buildRenderer(svg: SVGSVGElement): Renderer {
  svg.setAttribute("viewBox", `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // defs: soft bloom filter for line glow
  const defs = elem("defs", {});
  defs.innerHTML = `
    <filter id="emberGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
  svg.appendChild(defs);

  // strip backdrop
  const strip = elem("rect", {
    x: STRIP_X,
    y: STRIP_Y,
    width: STRIP_W,
    height: STRIP_H,
    rx: 6,
    fill: "#04040a",
    stroke: "rgba(255,255,255,0.10)",
    "stroke-width": 1,
  });
  svg.appendChild(strip);

  // faint wavelength tick labels (violet → red)
  const ticks = elem("g", {});
  [400, 450, 500, 550, 600, 650, 700, 750, 800].forEach((nm) => {
    const x = nmToX(nm);
    ticks.appendChild(
      elem("line", {
        x1: x,
        x2: x,
        y1: STRIP_Y + STRIP_H,
        y2: STRIP_Y + STRIP_H + 8,
        stroke: "rgba(255,255,255,0.18)",
        "stroke-width": 1,
      }),
    );
    const label = elem("text", {
      x,
      y: STRIP_Y + STRIP_H + 22,
      fill: "rgba(255,255,255,0.35)",
      "font-size": 12,
      "font-family": "ui-monospace, monospace",
      "text-anchor": "middle",
    });
    label.textContent = String(nm);
    ticks.appendChild(label);
  });
  svg.appendChild(ticks);

  // ladder baseline
  svg.appendChild(
    elem("line", {
      x1: STRIP_X,
      x2: STRIP_X + STRIP_W,
      y1: LADDER_BOT,
      y2: LADDER_BOT,
      stroke: "rgba(255,255,255,0.12)",
      "stroke-width": 1,
    }),
  );

  // dynamic groups, rebuilt per element
  const lineGroup = elem("g", { filter: "url(#emberGlow)" });
  const barGroup = elem("g", {});
  svg.appendChild(lineGroup);
  svg.appendChild(barGroup);

  let lineNodes: LineNode[] = [];
  let barNodes: BarNode[] = [];

  const setElement = (view: ElementView): void => {
    lineGroup.textContent = "";
    barGroup.textContent = "";
    lineNodes = [];
    barNodes = [];

    // spectral lines placed by wavelength
    view.partials.forEach((p) => {
      const x = nmToX(p.nm);
      const col = rgbStr(p.rgb);
      const glow = elem("rect", {
        x: x - 3,
        y: STRIP_Y + 4,
        width: 6,
        height: STRIP_H - 8,
        rx: 3,
        fill: col,
        opacity: 0,
      });
      const core = elem("rect", {
        x: x - 1,
        y: STRIP_Y + 4,
        width: 2,
        height: STRIP_H - 8,
        fill: "#ffffff",
        opacity: 0,
      });
      lineGroup.appendChild(glow);
      lineGroup.appendChild(core);
      lineNodes.push({ glow, core, rel: p.rel });
    });

    // partial ladder: one bar per partial, ordered by frequency (low → high)
    const order = view.partials
      .map((p, i) => ({ i, hz: p.hz }))
      .sort((a, b) => a.hz - b.hz);
    const n = order.length;
    order.forEach((o, slot) => {
      const p = view.partials[o.i];
      const x =
        n === 1
          ? STRIP_X + STRIP_W / 2
          : STRIP_X + 20 + (slot * (STRIP_W - 40)) / (n - 1);
      const col = rgbStr(p.rgb);
      const bar = elem("rect", {
        x: x - 5,
        y: LADDER_BOT,
        width: 10,
        height: 0,
        rx: 3,
        fill: col,
        opacity: 0.9,
      });
      const cap = elem("circle", {
        cx: x,
        cy: LADDER_BOT,
        r: 4,
        fill: "#ffffff",
        opacity: 0,
      });
      barGroup.appendChild(bar);
      barGroup.appendChild(cap);
      // align barNodes back to partial index so draw() can use partials[]
      barNodes[o.i] = { bar, cap, rel: p.rel, x };
    });
  };

  const draw = (t: number, voiceAmp: number, partials: number[]): void => {
    lineNodes.forEach((ln, i) => {
      const amp = partials[i] ?? ln.rel * voiceAmp;
      const shimmer = 0.85 + 0.15 * Math.sin(t * 1.3 + i * 1.7);
      ln.glow.setAttribute(
        "opacity",
        String(Math.min(1, amp * 1.1 * shimmer)),
      );
      ln.core.setAttribute("opacity", String(Math.min(1, 0.4 + amp * 0.9)));
    });
    barNodes.forEach((bn, i) => {
      if (!bn) return;
      const amp = partials[i] ?? bn.rel * voiceAmp;
      const h = Math.max(0, amp) * (LADDER_BOT - LADDER_TOP);
      bn.bar.setAttribute("y", String(LADDER_BOT - h));
      bn.bar.setAttribute("height", String(h));
      bn.cap.setAttribute("cy", String(LADDER_BOT - h));
      bn.cap.setAttribute("opacity", String(Math.min(0.9, amp)));
    });
  };

  const dispose = (): void => {
    lineGroup.textContent = "";
    barGroup.textContent = "";
  };

  return { setElement, draw, dispose };
}
