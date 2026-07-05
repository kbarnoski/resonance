// ─────────────────────────────────────────────────────────────────────────────
// render.ts — the bright, high-key luminous face mask (Canvas 2D).
//
//   Mirrors the webcam, lifts it into a warm daylit wash (ivory/gold/rose — a
//   near-black cosmic palette is deliberately avoided), then strokes a glowing
//   mask over the face contours from the MediaPipe landmarks. The mask blooms
//   warmer and brighter as the choir sings (jawOpen + output level). With no
//   camera it draws a stylised glowing face whose mouth opens with the gate and
//   whose warmth tracks the current vowel — so the piece is never blank.
//
//   All luminance motion is slow / expression-driven — no strobe (≤3 Hz).
// ─────────────────────────────────────────────────────────────────────────────

import { CONTOURS, type Landmark } from "./face";

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  time: number; // seconds
  video: HTMLVideoElement | null;
  landmarks: Landmark[] | null;
  gate: number; // 0..1
  frontness: number; // 0..1
  level: number; // 0..1 output loudness
  roll: number; // -1..1
}

/** Warm hue (deg) for the current vowel position — gold → coral → rose. */
function vowelHue(frontness: number): number {
  const h = 45 - frontness * 72;
  return ((h % 360) + 360) % 360;
}

function drawWarmBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hue: number,
  level: number,
  time: number,
): void {
  const drift = 0.5 + 0.5 * Math.sin(time * 0.4);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `hsl(${(hue + 20) % 360}, 70%, ${90 - level * 6}%)`);
  g.addColorStop(0.5, `hsl(${hue}, 78%, ${84 - level * 6}%)`);
  g.addColorStop(1, `hsl(${(hue + 340) % 360}, 72%, ${80 - level * 4}%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // A soft central bloom that swells with the voice.
  const r = Math.max(w, h) * (0.5 + level * 0.25);
  const rg = ctx.createRadialGradient(
    w / 2,
    h * 0.46,
    r * 0.1,
    w / 2,
    h * 0.46,
    r,
  );
  rg.addColorStop(0, `hsla(${hue}, 95%, 82%, ${0.28 + level * 0.4})`);
  rg.addColorStop(1, `hsla(${hue}, 90%, 78%, 0)`);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.6 + drift * 0.2;
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

interface CoverTf {
  ox: number;
  oy: number;
  dw: number;
  dh: number;
}

function coverTransform(
  w: number,
  h: number,
  vw: number,
  vh: number,
): CoverTf {
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  return { ox: (w - dw) / 2, oy: (h - dh) / 2, dw, dh };
}

function drawContours(
  ctx: CanvasRenderingContext2D,
  lm: Landmark[],
  tf: CoverTf,
  hue: number,
  bloom: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = `hsl(${hue}, 95%, 70%)`;

  for (const path of CONTOURS) {
    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      const p = lm[path[i]];
      if (!p) continue;
      const x = tf.ox + p.x * tf.dw;
      const y = tf.oy + p.y * tf.dh;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // outer glow pass
    ctx.shadowBlur = 14 + bloom * 34;
    ctx.strokeStyle = `hsla(${hue}, 96%, 72%, ${0.5 + bloom * 0.4})`;
    ctx.lineWidth = 3 + bloom * 4;
    ctx.stroke();
    // bright ivory core
    ctx.shadowBlur = 6 + bloom * 12;
    ctx.strokeStyle = `hsla(${(hue + 25) % 360}, 100%, ${88 + bloom * 8}%, 0.95)`;
    ctx.lineWidth = 1.4 + bloom * 1.6;
    ctx.stroke();
  }

  // luminous mesh points for the eyes/mouth so a "sung" face sparkles.
  ctx.shadowBlur = 8 + bloom * 16;
  for (const path of CONTOURS) {
    for (const idx of path) {
      const p = lm[idx];
      if (!p) continue;
      const x = tf.ox + p.x * tf.dw;
      const y = tf.oy + p.y * tf.dh;
      ctx.beginPath();
      ctx.arc(x, y, 1.6 + bloom * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${(hue + 15) % 360}, 100%, 92%, ${0.5 + bloom * 0.4})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Stylised glowing face for the no-camera fallback — driven by the same params. */
function drawFallbackFace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hue: number,
  gate: number,
  bloom: number,
  time: number,
): void {
  const cx = w / 2;
  const cy = h * 0.46;
  const breath = 1 + Math.sin(time * 0.6) * 0.02;
  const fw = Math.min(w, h) * 0.24 * breath;
  const fh = fw * 1.28;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = `hsl(${hue}, 95%, 70%)`;

  const glow = (draw: () => void, blur: number, width: number, color: string) => {
    ctx.shadowBlur = blur;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    draw();
  };

  // face oval
  const oval = () => {
    ctx.beginPath();
    ctx.ellipse(cx, cy, fw, fh, 0, 0, Math.PI * 2);
    ctx.stroke();
  };
  glow(oval, 16 + bloom * 30, 3 + bloom * 4, `hsla(${hue}, 96%, 72%, ${0.5 + bloom * 0.4})`);
  glow(oval, 6, 1.5, `hsla(${(hue + 25) % 360}, 100%, 90%, 0.9)`);

  // eyes
  const eyeY = cy - fh * 0.22;
  for (const sgn of [-1, 1]) {
    const ex = cx + sgn * fw * 0.5;
    const eye = () => {
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, fw * 0.22, fh * 0.1, 0, 0, Math.PI * 2);
      ctx.stroke();
    };
    glow(eye, 12 + bloom * 20, 2.4 + bloom * 3, `hsla(${hue}, 96%, 74%, ${0.5 + bloom * 0.4})`);
    // brow
    const brow = () => {
      ctx.beginPath();
      ctx.moveTo(ex - fw * 0.24, eyeY - fh * 0.14);
      ctx.quadraticCurveTo(ex, eyeY - fh * 0.2, ex + fw * 0.24, eyeY - fh * 0.13);
      ctx.stroke();
    };
    glow(brow, 10 + bloom * 16, 2 + bloom * 2.5, `hsla(${(hue + 20) % 360}, 100%, 86%, 0.85)`);
  }

  // mouth — openness = gate, width narrows toward front vowels (via hue proxy).
  const my = cy + fh * 0.46;
  const mw = fw * (0.5 + (1 - gate) * 0.18);
  const open = fh * (0.04 + gate * 0.5);
  const mouth = () => {
    ctx.beginPath();
    ctx.ellipse(cx, my, mw, open, 0, 0, Math.PI * 2);
    ctx.stroke();
  };
  glow(mouth, 16 + bloom * 30, 3 + bloom * 4, `hsla(${hue}, 98%, 70%, ${0.55 + bloom * 0.4})`);
  glow(mouth, 6, 1.5, `hsla(${(hue + 25) % 360}, 100%, 90%, 0.92)`);

  ctx.restore();
}

/** One frame of the luminous mask. */
export function drawFrame(input: RenderInput): void {
  const { ctx, w, h, time, video, landmarks, gate, frontness, level, roll } =
    input;
  const hue = vowelHue(frontness);
  const bloom = Math.min(1, gate * 0.5 + level * 0.7);

  drawWarmBackground(ctx, w, h, hue, level, time);

  const haveVideo = video && video.videoWidth > 0;
  if (haveVideo) {
    const tf = coverTransform(w, h, video.videoWidth, video.videoHeight);
    ctx.save();
    // mirror horizontally so it reads like a mirror
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    // slight head-roll tilt of the whole reflection for embodiment
    ctx.globalAlpha = 0.72;
    ctx.drawImage(video, tf.ox, tf.oy, tf.dw, tf.dh);
    ctx.globalAlpha = 1;
    // lift the image into a high-key wash so it never reads dark
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `hsla(${hue}, 80%, 78%, 0.22)`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    if (landmarks) drawContours(ctx, landmarks, tf, hue, bloom);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(w / 2, h * 0.46);
    ctx.rotate(roll * 0.12);
    ctx.translate(-w / 2, -h * 0.46);
    drawFallbackFace(ctx, w, h, hue, gate, bloom, time);
    ctx.restore();
  }
}
