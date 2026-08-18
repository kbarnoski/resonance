"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15312 · transcript / sparkline.tsx — a tiny grayscale contour sparkline drawn
// on a <canvas> (Canvas2D compute only; NOT inline-SVG). It renders one phrase's
// melodic SHAPE — the sequence of note pitches — at a glance. Achromatic: bright
// silver when the row is the one currently sounding, dim gray otherwise. If a 2D
// context can't be obtained it simply draws nothing (the text row still stands).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";

const W = 104;
const H = 26;

export function Sparkline({
  midis,
  active,
}: {
  midis: number[];
  active: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return; // graceful: no sparkline, text row still reads

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr;
    cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (midis.length === 0) return;

    const min = Math.min(...midis);
    const max = Math.max(...midis);
    const span = Math.max(1, max - min);
    const pad = 4;
    const xAt = (i: number) =>
      pad + (midis.length === 1 ? 0.5 : i / (midis.length - 1)) * (W - 2 * pad);
    const yAt = (m: number) =>
      H - pad - ((m - min) / span) * (H - 2 * pad);

    const stroke = active ? "rgba(244,244,245,0.95)" : "rgba(161,161,170,0.5)";
    const dot = active ? "rgba(244,244,245,0.9)" : "rgba(161,161,170,0.45)";

    g.lineWidth = active ? 1.75 : 1.25;
    g.lineJoin = "round";
    g.lineCap = "round";
    g.strokeStyle = stroke;
    g.beginPath();
    midis.forEach((m, i) => {
      const x = xAt(i);
      const y = yAt(m);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();

    g.fillStyle = dot;
    midis.forEach((m, i) => {
      g.beginPath();
      g.arc(xAt(i), yAt(m), active ? 1.6 : 1.2, 0, Math.PI * 2);
      g.fill();
    });
  }, [midis, active]);

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      style={{ width: W, height: H }}
      className="shrink-0"
      aria-hidden
    />
  );
}
