// ─────────────────────────────────────────────────────────────────────────────
// 2218 · MISSING BASS — Canvas 2D spectrum view
//
// A log-frequency spectrum drawn from the LIVE FFT of the output signal. The
// upper harmonics glow violet; the low band below the high-pass cutoff is
// conspicuously empty. Dashed "phantom root" ghost markers sit in that empty
// band — where you HEAR a pitch but no sound exists. When Reveal is on, a real
// bar appears at f0 to show what was added.
// ─────────────────────────────────────────────────────────────────────────────

import { HIGHPASS_HZ } from "./audio";

const F_MIN = 32; // Hz, left edge
const F_MAX = 4200; // Hz, right edge

interface DrawState {
  freq: Uint8Array; // getByteFrequencyData
  sampleRate: number;
  fftSize: number;
  roots: { f0: number; level: number }[];
  beatPhase: number; // 0..1, advances at binaural-beat rate
  amp: number; // 0..1 overall loudness for the glow
  reveal: boolean;
}

const logMin = Math.log(F_MIN);
const logMax = Math.log(F_MAX);

function xOf(hz: number, w: number): number {
  const t = (Math.log(Math.max(hz, F_MIN)) - logMin) / (logMax - logMin);
  return t * w;
}

export function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: DrawState,
): void {
  ctx.clearRect(0, 0, w, h);

  // ── cosmic backdrop: slow warm radial glow reacting to amplitude + beat ──
  const pulse = 0.5 + 0.5 * Math.sin(s.beatPhase * Math.PI * 2);
  const glow = 0.06 + s.amp * 0.5;
  const cx = w * (0.62 + 0.06 * Math.sin(s.beatPhase * Math.PI * 2));
  const cy = h * 0.42;
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.9);
  bg.addColorStop(0, `rgba(120, 70, 220, ${glow})`);
  bg.addColorStop(0.4, `rgba(60, 30, 120, ${glow * 0.5})`);
  bg.addColorStop(1, "rgba(6, 4, 14, 0)");
  ctx.fillStyle = "#06040e";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const baseY = h - 34; // leave room for axis labels
  const topY = 24;
  const plotH = baseY - topY;

  // ── the EMPTY low band: everything below the high-pass cutoff ──
  const cutX = xOf(HIGHPASS_HZ, w);
  ctx.fillStyle = "rgba(10, 8, 20, 0.55)";
  ctx.fillRect(0, topY, cutX, baseY - topY);
  // diagonal hatch to read as "no signal here"
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, topY, cutX, baseY - topY);
  ctx.clip();
  ctx.strokeStyle = "rgba(120, 110, 160, 0.10)";
  ctx.lineWidth = 1;
  for (let x = -plotH; x < cutX; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x + plotH, topY);
    ctx.stroke();
  }
  ctx.restore();

  // cutoff line
  ctx.strokeStyle = "rgba(167, 139, 250, 0.45)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cutX, topY);
  ctx.lineTo(cutX, baseY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(167, 139, 250, 0.7)";
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillText(`high-pass ${HIGHPASS_HZ}Hz`, cutX + 6, topY + 12);

  // ── the spectrum bars (real FFT) ──
  const binHz = s.sampleRate / s.fftSize;
  const nBins = s.freq.length;
  // Draw one column per pixel, taking the max bin mapped to that x (log axis).
  const cols = Math.floor(w);
  const colTop = new Float32Array(cols);
  for (let b = 1; b < nBins; b++) {
    const hz = b * binHz;
    if (hz < F_MIN || hz > F_MAX) continue;
    const x = Math.floor(xOf(hz, w));
    const v = s.freq[b] / 255;
    if (x >= 0 && x < cols && v > colTop[x]) colTop[x] = v;
  }
  for (let x = 0; x < cols; x++) {
    const v = colTop[x];
    if (v <= 0.01) continue;
    const barH = v * v * plotH;
    const inLow = x < cutX;
    // present harmonics glow violet; anything (illegally) in the low band = red-ish alert
    const alpha = 0.25 + v * 0.75;
    ctx.fillStyle = inLow
      ? `rgba(240, 90, 90, ${alpha})`
      : `rgba(${140 + v * 90}, ${90 + v * 40}, 250, ${alpha})`;
    ctx.fillRect(x, baseY - barH, 1, barH);
  }
  // soft bloom over the harmonic region
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = `rgba(139, 92, 246, ${0.04 + s.amp * 0.08})`;
  ctx.fillRect(cutX, topY, w - cutX, baseY - topY);
  ctx.globalCompositeOperation = "source-over";

  // ── phantom-root ghost markers in the empty low band ──
  s.roots.sort((a, b) => b.level - a.level);
  s.roots.forEach((r, i) => {
    const x = xOf(r.f0, w);
    const a = Math.min(1, r.level / 0.6);
    ctx.strokeStyle = `rgba(196, 181, 253, ${0.3 + a * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(x, topY + 4);
    ctx.lineTo(x, baseY);
    ctx.stroke();
    ctx.setLineDash([]);

    // pulsing ghost orb where the phantom pitch "lives"
    const oy = baseY - 18 - i * 20;
    const rad = 5 + 3 * pulse + a * 4;
    const orb = ctx.createRadialGradient(x, oy, 0, x, oy, rad + 6);
    orb.addColorStop(0, `rgba(196, 181, 253, ${0.5 + a * 0.4})`);
    orb.addColorStop(1, "rgba(196, 181, 253, 0)");
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.arc(x, oy, rad + 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(221, 214, 254, ${0.5 + a * 0.4})`;
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${Math.round(r.f0)}Hz`, x + 8, oy + 3);

    // reveal bar: the REAL fundamental, drawn solid at f0
    if (s.reveal) {
      const barH = (0.3 + a * 0.5) * plotH;
      ctx.fillStyle = `rgba(240, 180, 90, ${0.5 + a * 0.4})`;
      ctx.fillRect(x - 2, baseY - barH, 4, barH);
    }
  });

  // headline label anchored in the empty band
  if (s.roots.length > 0) {
    ctx.fillStyle = "rgba(221, 214, 254, 0.85)";
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("you hear a pitch here —", 10, topY + 16);
    ctx.fillStyle = "rgba(240, 90, 90, 0.75)";
    ctx.fillText(
      s.reveal ? "now with the real f0 (amber)" : "there is no sound here",
      10,
      topY + 30,
    );
  }

  // ── axis ticks ──
  ctx.fillStyle = "rgba(160, 150, 190, 0.55)";
  ctx.font = "9px ui-monospace, monospace";
  ctx.textAlign = "center";
  [40, 60, 100, 200, 400, 800, 1600, 3200].forEach((hz) => {
    const x = xOf(hz, w);
    ctx.fillRect(x, baseY, 1, 4);
    ctx.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, x, baseY + 16);
  });
}

export type { DrawState };
