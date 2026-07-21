// The parliament — an agent-based collective of "beings". A ring of ~7–13
// entities, each a procedurally-drawn jeweled mandala-eye built from Klüver
// form-constant motifs (tunnel rings / spiral / cobweb / lattice). They OPEN
// when you sound notes, their gaze CONVERGES on the attention point (you), and
// together they assemble a shared central mandala whose symmetry = your chord.

import { mulberry32 } from "./rng";

export interface Being {
  id: number;
  ringAngle: number; // fixed position around the parliament ring
  bx: number; // screen position (recomputed each frame)
  by: number;
  baseR: number;
  jitter: number; // seeded radius jitter
  hue: number; // 0 (violet) .. 1 (gold)
  spin: number; // idle rotation phase
  spinDir: number;
  facetCount: number;
  arms: number; // spiral arms
  // dynamic
  openness: number; // 0 asleep (slit) .. 1 awake (wide)
  targetOpen: number;
  glow: number;
  gaze: number; // world-space gaze direction (toward attention)
  lean: number; // body tilt
  velocity: number;
  token: string | null; // owning held note
}

export interface Attention {
  x: number;
  y: number;
}

export function createParliament(count: number, seed: number): Being[] {
  const rnd = mulberry32(seed);
  const beings: Being[] = [];
  for (let i = 0; i < count; i++) {
    const ringAngle = (i / count) * Math.PI * 2 - Math.PI / 2;
    beings.push({
      id: i,
      ringAngle,
      bx: 0,
      by: 0,
      baseR: 0,
      jitter: 0.86 + rnd() * 0.28,
      hue: rnd(),
      spin: rnd() * Math.PI * 2,
      spinDir: rnd() < 0.5 ? -1 : 1,
      facetCount: 8 + Math.floor(rnd() * 6),
      arms: 3 + Math.floor(rnd() * 4),
      openness: 0.08,
      targetOpen: 0,
      glow: 0,
      gaze: ringAngle + Math.PI, // initially facing inward
      lean: 0,
      velocity: 0.7,
      token: null,
    });
  }
  return beings;
}

/** Pick a dormant being to embody a new note (least-open, unowned). */
export function pickBeing(beings: Being[]): Being | null {
  let best: Being | null = null;
  for (const b of beings) {
    if (b.token) continue;
    if (!best || b.openness < best.openness) best = b;
  }
  return best ?? null;
}

// Boid-like steering: gaze eases toward the attention point, openness/glow ease
// toward target. Convergence tightens as the collective presence rises.
export function runSteering(
  beings: Being[],
  cx: number,
  cy: number,
  ringR: number,
  attention: Attention,
  presence: number,
  dt: number,
): void {
  const openEase = 1 - Math.exp(-dt * 6);
  const gazeEase = 1 - Math.exp(-dt * (3 + presence * 4));
  const glowEase = 1 - Math.exp(-dt * 4);
  for (const b of beings) {
    b.bx = cx + Math.cos(b.ringAngle) * ringR * b.jitter;
    b.by = cy + Math.sin(b.ringAngle) * ringR * b.jitter;

    const want = Math.atan2(attention.y - b.by, attention.x - b.bx);
    let d = want - b.gaze;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    b.gaze += d * gazeEase;

    // body leans toward attention, more as it awakens
    const inward = Math.atan2(cy - b.by, cx - b.bx);
    let ld = inward - b.lean;
    while (ld > Math.PI) ld -= Math.PI * 2;
    while (ld < -Math.PI) ld += Math.PI * 2;
    b.lean += ld * gazeEase * (0.3 + 0.7 * b.openness);

    b.openness += (b.targetOpen - b.openness) * openEase;
    const glowTarget = b.token ? 0.55 + 0.45 * b.velocity : b.openness * 0.15;
    b.glow += (glowTarget - b.glow) * glowEase;
    b.spin += b.spinDir * dt * (0.15 + b.openness * 0.4);
  }
}

function jewel(hue01: number, s: number, l: number, a: number): string {
  const h = (265 + hue01 * 150) % 360; // violet → magenta → gold
  return `hsla(${h.toFixed(0)}, ${s}%, ${l}%, ${a})`;
}

export function drawBeing(ctx: CanvasRenderingContext2D, b: Being, t: number, glowMul: number): void {
  const r = b.baseR;
  if (r < 2) return;
  const open = b.openness;
  const ap = 0.1 + 0.9 * open; // vertical aperture — the eye opening

  ctx.save();
  ctx.translate(b.bx, b.by);
  ctx.rotate(b.lean);

  // gaze offset in the eye's local frame (pupil turns toward you)
  const gLocal = b.gaze - b.lean;
  const gx = Math.cos(gLocal) * r * 0.24 * open;
  const gy = Math.sin(gLocal) * r * ap * 0.24 * open;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * ap, 0, 0, Math.PI * 2);
  ctx.clip();

  // Phase A — iris body with a dark pupil (source-over so the pupil reads dark).
  const pupilR = r * (0.12 + 0.26 * b.velocity) * (0.5 + 0.5 * open) + r * 0.04;
  const grad = ctx.createRadialGradient(gx, gy, pupilR * 0.3, gx, gy, r);
  grad.addColorStop(0, "rgba(2,0,7,1)");
  grad.addColorStop(Math.min(0.9, pupilR / r), "rgba(6,1,16,1)");
  grad.addColorStop(0.55, jewel(b.hue, 62, 30 + 22 * b.glow, 0.95));
  grad.addColorStop(1, jewel(b.hue, 72, 10, 0.95));
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = grad;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  ctx.globalCompositeOperation = "lighter";
  const lit = 0.25 + 0.75 * open;

  // tunnel / funnel rings (Klüver)
  ctx.lineWidth = Math.max(0.6, r * 0.02);
  for (let i = 1; i <= 4; i++) {
    const rr = pupilR + (r - pupilR) * (i / 4.4);
    ctx.strokeStyle = jewel(b.hue + 0.05 * i, 70, 55, 0.12 * lit);
    ctx.beginPath();
    ctx.ellipse(gx * 0.4, gy * 0.4, rr, rr, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // spiral arms (Klüver spiral) — the self-transforming churn
  const arms = b.arms;
  ctx.lineWidth = Math.max(0.6, r * 0.018);
  for (let a = 0; a < arms; a++) {
    const base = b.spin + (a / arms) * Math.PI * 2;
    ctx.beginPath();
    for (let s = 0; s <= 26; s++) {
      const th = (s / 26) * 2.6;
      const rad = pupilR + (r - pupilR) * (th / 2.6);
      const ang = base + th * 1.7;
      const px = Math.cos(ang) * rad + gx * 0.5;
      const py = Math.sin(ang) * rad + gy * 0.5;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = jewel(b.hue + 0.12, 85, 62, 0.22 * lit);
    ctx.stroke();
  }

  // cobweb spokes
  const spokes = b.facetCount;
  ctx.lineWidth = Math.max(0.4, r * 0.01);
  ctx.strokeStyle = jewel(b.hue - 0.05, 60, 68, 0.1 * lit);
  for (let a = 0; a < spokes; a++) {
    const ang = (a / spokes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * pupilR, Math.sin(ang) * pupilR);
    ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    ctx.stroke();
  }

  // jeweled facet ring (lattice) — the gems
  for (let a = 0; a < spokes; a++) {
    const ang = (a / spokes) * Math.PI * 2 + b.spin * 0.5;
    const fr = r * 0.72;
    const fx = Math.cos(ang) * fr;
    const fy = Math.sin(ang) * fr;
    const gemR = r * (0.05 + 0.03 * Math.sin(t * 1.3 + a));
    ctx.fillStyle = jewel(b.hue + 0.18, 90, 66, 0.5 * lit);
    ctx.beginPath();
    ctx.arc(fx, fy, Math.max(0.8, gemR), 0, Math.PI * 2);
    ctx.fill();
  }

  // specular highlight sliding on the iris — a wet, alive eye
  ctx.fillStyle = `rgba(255,255,255,${0.5 * lit})`;
  ctx.beginPath();
  ctx.arc(gx - r * 0.16, gy - r * 0.2, r * 0.07, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore(); // drop clip

  // Awakening rim — pulses SLOWLY (safeFlicker glowMul), never a strobe.
  const rim = b.glow * glowMul;
  if (rim > 0.02) {
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.strokeStyle = jewel(b.hue + 0.1, 85, 60, 0.35 * rim);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.02, r * ap * 1.02, 0, 0, Math.PI * 2);
    ctx.stroke();
    // outer bloom
    const halo = ctx.createRadialGradient(0, 0, r, 0, 0, r * 1.9);
    halo.addColorStop(0, jewel(b.hue + 0.1, 80, 55, 0.16 * rim));
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

/** Faint light threads from awake beings converging on the attention locus. */
export function drawGazeThreads(
  ctx: CanvasRenderingContext2D,
  beings: Being[],
  attention: Attention,
): void {
  ctx.globalCompositeOperation = "lighter";
  for (const b of beings) {
    if (b.openness < 0.15) continue;
    const a = b.openness * 0.16;
    const grd = ctx.createLinearGradient(b.bx, b.by, attention.x, attention.y);
    grd.addColorStop(0, jewel(b.hue + 0.1, 80, 60, a));
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.strokeStyle = grd;
    ctx.lineWidth = 1 + b.openness * 1.5;
    ctx.beginPath();
    ctx.moveTo(b.bx, b.by);
    ctx.lineTo(attention.x, attention.y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

// The shared mandala the parliament assembles. Its N-FOLD SYMMETRY = the chord
// you hold (distinct pitch classes); its RADIUS = the chord span; its
// BRIGHTNESS = the collective presence.
export function drawSharedMandala(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  foldN: number,
  radius: number,
  bright: number,
  hue: number,
): void {
  if (bright < 0.015 || radius < 4) return;
  const b = Math.min(1, bright);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.05);
  ctx.globalCompositeOperation = "lighter";

  // central well — the tunnel we all look down
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  core.addColorStop(0, jewel(hue + 0.2, 90, 70, 0.28 * b));
  core.addColorStop(0.4, jewel(hue, 75, 45, 0.14 * b));
  core.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  const arm = radius * 0.9;
  for (let k = 0; k < foldN; k++) {
    const ang = (k / foldN) * Math.PI * 2;
    for (const mirror of [1, -1]) {
      ctx.save();
      ctx.rotate(ang);
      ctx.scale(1, mirror);
      // jewel chain along the spoke (lattice)
      const gems = 6;
      ctx.lineWidth = Math.max(0.6, radius * 0.01);
      ctx.strokeStyle = jewel(hue + 0.1, 80, 60, 0.12 * b);
      ctx.beginPath();
      for (let g = 0; g <= gems; g++) {
        const rr = radius * 0.18 + (arm - radius * 0.18) * (g / gems);
        const wob = Math.sin(t * 0.8 + g + k) * radius * 0.04;
        const px = rr;
        const py = wob;
        if (g === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      for (let g = 1; g <= gems; g++) {
        const rr = radius * 0.18 + (arm - radius * 0.18) * (g / gems);
        const wob = Math.sin(t * 0.8 + g + k) * radius * 0.04;
        const gr = radius * (0.02 + 0.02 * (1 - g / gems));
        ctx.fillStyle = jewel(hue + 0.05 * g, 90, 66, 0.5 * b);
        ctx.beginPath();
        ctx.arc(rr, wob, Math.max(0.8, gr), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // concentric symmetry rings (tunnel)
  ctx.lineWidth = Math.max(0.6, radius * 0.008);
  for (let i = 1; i <= 3; i++) {
    ctx.strokeStyle = jewel(hue + 0.1 * i, 70, 55, 0.1 * b);
    ctx.beginPath();
    ctx.arc(0, 0, radius * (0.3 + i * 0.22), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}
